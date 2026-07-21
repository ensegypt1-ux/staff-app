import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { io, Socket } from 'socket.io-client';
import { EnsHttpService } from '../../infrastructure/ens-backend/ens-http.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { FCM_COVERAGE_CHANNEL } from './fcm.constants';
import { ExpressJwtRelayService } from './express-jwt-relay.service';
import { FcmDeviceService } from './fcm-device.service';
import {
  ExpressTableCallPayload,
  inferChannelFromPayload,
  mapAttentionChangedEvent,
  mapNewTableCallEvent,
} from './fcm-event.mapper';
import { FcmSenderService } from './fcm-sender.service';
import { MenuSocketLockService } from './menu-socket.lock';

type RelayState =
  | 'absent'
  | 'connecting'
  | 'joined'
  | 'backoff'
  | 'reconnecting'
  | 'uncovered';

type MenuRelay = {
  menuId: number;
  state: RelayState;
  socket: Socket | null;
  connectPromise: Promise<void> | null;
  listenersAttached: boolean;
  backoffMs: number;
  reconnectTimer: NodeJS.Timeout | null;
  uncoveredSince: number | null;
  staffId: number | null;
  staffRoleId: number | null;
};

@Injectable()
export class MenuSocketSupervisor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MenuSocketSupervisor.name);
  private readonly relays = new Map<number, MenuRelay>();
  private reconcileTimer: NodeJS.Timeout | null = null;
  private listenClient: Client | null = null;
  private shuttingDown = false;
  private draining = false;

  reconnectsTotal = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly devices: FcmDeviceService,
    private readonly locks: MenuSocketLockService,
    private readonly jwtRelay: ExpressJwtRelayService,
    private readonly sender: FcmSenderService,
    private readonly ensHttp: EnsHttpService,
  ) {}

  get desiredMenus(): number {
    return this.relays.size;
  }

  get joinedMenus(): number {
    let n = 0;
    for (const r of this.relays.values()) {
      if (r.state === 'joined') n += 1;
    }
    return n;
  }

  get uncoveredMenus(): number[] {
    const out: number[] = [];
    for (const r of this.relays.values()) {
      if (r.state === 'uncovered') out.push(r.menuId);
    }
    return out;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.get<boolean>('isWorkerRole')) return;
    if (!this.config.get<boolean>('fcmEnabled')) {
      this.logger.log('FCM_ENABLED=false — MenuSocketSupervisor idle');
      return;
    }
    if (!this.prisma.isConnected) {
      this.logger.warn('Prisma not connected — supervisor not started');
      return;
    }

    await this.reconcileAll();
    const interval =
      this.config.get<number>('fcmReconcileIntervalMs') ?? 3000;
    this.reconcileTimer = setInterval(() => {
      void this.reconcileAll();
    }, interval);

    await this.startListen();
    this.logger.log('MenuSocketSupervisor started');
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.draining = true;
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    if (this.listenClient) {
      try {
        await this.listenClient.end();
      } catch {
        /* ignore */
      }
      this.listenClient = null;
    }
    const menuIds = [...this.relays.keys()];
    for (const menuId of menuIds) {
      await this.teardown(menuId);
    }
    await this.locks.releaseAll();
  }

  private async startListen(): Promise<void> {
    const url = this.config.get<string>('databaseUrl');
    if (!url) return;
    try {
      this.listenClient = new Client({ connectionString: url });
      await this.listenClient.connect();
      await this.listenClient.query(`LISTEN ${FCM_COVERAGE_CHANNEL}`);
      this.listenClient.on('notification', (msg) => {
        const menuId = Number.parseInt(msg.payload ?? '', 10);
        if (Number.isFinite(menuId) && menuId > 0) {
          void this.reconcileMenu(menuId);
        } else {
          void this.reconcileAll();
        }
      });
    } catch (err) {
      this.logger.warn(`LISTEN setup failed (poll only): ${String(err)}`);
      this.listenClient = null;
    }
  }

  async reconcileAll(): Promise<void> {
    if (this.shuttingDown || this.draining) return;
    if (!this.prisma.isConnected) return;

    const desired = await this.prisma.staffFcmDevice.findMany({
      select: { menuId: true },
      distinct: ['menuId'],
    });
    const desiredSet = new Set(desired.map((d) => d.menuId));

    for (const menuId of desiredSet) {
      await this.reconcileMenu(menuId);
    }

    for (const menuId of [...this.relays.keys()]) {
      if (!desiredSet.has(menuId)) {
        await this.teardown(menuId);
      }
    }
  }

  async reconcileMenu(menuId: number): Promise<void> {
    if (this.shuttingDown || this.draining) return;
    const count = await this.prisma.staffFcmDevice.count({ where: { menuId } });
    if (count <= 0) {
      await this.teardown(menuId);
      return;
    }
    await this.acquire(menuId);
  }

  private getOrCreate(menuId: number): MenuRelay {
    let relay = this.relays.get(menuId);
    if (!relay) {
      relay = {
        menuId,
        state: 'absent',
        socket: null,
        connectPromise: null,
        listenersAttached: false,
        backoffMs: 1000,
        reconnectTimer: null,
        uncoveredSince: null,
        staffId: null,
        staffRoleId: null,
      };
      this.relays.set(menuId, relay);
    }
    return relay;
  }

  private async acquire(menuId: number): Promise<void> {
    const relay = this.getOrCreate(menuId);
    if (relay.state === 'joined' || relay.state === 'connecting') {
      if (relay.connectPromise) await relay.connectPromise;
      return;
    }
    if (relay.connectPromise) {
      await relay.connectPromise;
      return;
    }

    relay.connectPromise = this.connectRelay(relay).finally(() => {
      relay.connectPromise = null;
    });
    await relay.connectPromise;
  }

  private async connectRelay(relay: MenuRelay): Promise<void> {
    if (this.shuttingDown) return;

    const locked = await this.locks.tryAcquire(relay.menuId);
    if (!locked) {
      this.logger.debug(
        `Skip menuId=${relay.menuId} — advisory lock held elsewhere`,
      );
      this.relays.delete(relay.menuId);
      return;
    }

    const identity = await this.devices.pickRelayIdentity(relay.menuId);
    if (!identity) {
      relay.state = 'uncovered';
      relay.uncoveredSince = relay.uncoveredSince ?? Date.now();
      this.logger.warn(
        `No staffRoleId identity for menuId=${relay.menuId}`,
      );
      return;
    }

    relay.staffId = identity.staffId;
    relay.staffRoleId = identity.staffRoleId;
    relay.state = 'connecting';

    const socketUrl = this.config.get<string>('ensSocketUrl');
    if (!socketUrl) {
      relay.state = 'uncovered';
      relay.uncoveredSince = Date.now();
      return;
    }

    // Replace-in-place: dispose previous socket
    if (relay.socket) {
      relay.socket.removeAllListeners();
      relay.socket.disconnect();
      relay.socket = null;
      relay.listenersAttached = false;
    }

    let token: string;
    try {
      token = this.jwtRelay.mintStaffJoinToken({
        staffId: identity.staffId,
        menuId: relay.menuId,
        staffRoleId: identity.staffRoleId,
      });
    } catch (err) {
      this.logger.error(`JWT mint failed menuId=${relay.menuId}: ${String(err)}`);
      relay.state = 'uncovered';
      relay.uncoveredSince = Date.now();
      return;
    }

    const socket = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false,
    });
    relay.socket = socket;

    await new Promise<void>((resolve) => {
      const finish = () => resolve();

      socket.on('connect', () => {
        socket.emit(
          'staff:join',
          { token: `Bearer ${token}` },
          (ack: { ok?: boolean; error?: string; menuId?: number }) => {
            if (ack?.ok) {
              relay.state = 'joined';
              relay.backoffMs = 1000;
              relay.uncoveredSince = null;
              this.attachListeners(relay);
              void this.catchUpPending(relay, token);
              finish();
              return;
            }
            const errCode = ack?.error ?? 'JOIN_FAILED';
            this.logger.warn(
              `staff:join failed menuId=${relay.menuId} error=${errCode}`,
            );
            if (
              errCode === 'FORBIDDEN' ||
              errCode === 'ROLE_REQUIRED' ||
              errCode === 'PRO_REQUIRED' ||
              errCode === 'STAFF_NOT_FOUND'
            ) {
              relay.state = 'uncovered';
              relay.uncoveredSince = Date.now();
              socket.disconnect();
              finish();
              return;
            }
            relay.state = 'backoff';
            socket.disconnect();
            this.scheduleReconnect(relay);
            finish();
          },
        );
      });

      socket.on('connect_error', (err) => {
        this.logger.warn(
          `Socket connect_error menuId=${relay.menuId}: ${err.message}`,
        );
        relay.state = 'backoff';
        this.scheduleReconnect(relay);
        finish();
      });

      socket.on('disconnect', () => {
        if (this.shuttingDown || this.draining) return;
        if (relay.state === 'absent') return;
        // Desired coverage still true → reconnect
        void this.prisma.staffFcmDevice
          .count({ where: { menuId: relay.menuId } })
          .then((count) => {
            if (count <= 0) {
              void this.teardown(relay.menuId);
              return;
            }
            relay.state = 'reconnecting';
            this.scheduleReconnect(relay);
          });
      });

      socket.connect();
    });
  }

  private attachListeners(relay: MenuRelay): void {
    if (!relay.socket || relay.listenersAttached) return;
    relay.listenersAttached = true;
    const socket = relay.socket;

    socket.on('staff:table_call', (payload: ExpressTableCallPayload) => {
      void this.handleNewCall(payload);
    });
    socket.on(
      'staff:table_call_changed',
      (payload: ExpressTableCallPayload) => {
        void this.handleChanged(payload);
      },
    );
  }

  private scheduleReconnect(relay: MenuRelay): void {
    if (this.shuttingDown || relay.reconnectTimer) return;
    this.reconnectsTotal += 1;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(relay.backoffMs, 60_000) + jitter;
    relay.backoffMs = Math.min(relay.backoffMs * 2, 60_000);
    relay.reconnectTimer = setTimeout(() => {
      relay.reconnectTimer = null;
      void this.acquire(relay.menuId);
    }, delay);
  }

  private async teardown(menuId: number): Promise<void> {
    const relay = this.relays.get(menuId);
    if (!relay) {
      await this.locks.release(menuId);
      return;
    }
    if (relay.reconnectTimer) {
      clearTimeout(relay.reconnectTimer);
      relay.reconnectTimer = null;
    }
    if (relay.socket) {
      relay.socket.removeAllListeners();
      relay.socket.disconnect();
      relay.socket = null;
    }
    relay.state = 'absent';
    this.relays.delete(menuId);
    await this.locks.release(menuId);
  }

  private async handleNewCall(payload: ExpressTableCallPayload): Promise<void> {
    if (this.draining) return;
    const channel = await this.resolveChannel(payload);
    const mapped = mapNewTableCallEvent(payload, channel);
    if (!mapped) return;
    await this.sender.processMappedEvent(mapped);
  }

  private async handleChanged(
    payload: ExpressTableCallPayload,
  ): Promise<void> {
    if (this.draining) return;
    const channel = await this.resolveChannel(payload);
    const mapped = mapAttentionChangedEvent(payload, channel);
    if (!mapped) return;
    await this.sender.processMappedEvent(mapped);
  }

  private enrichmentCache = new Map<
    number,
    { channel: 'table' | 'delivery'; expires: number }
  >();

  private async resolveChannel(
    payload: ExpressTableCallPayload,
  ): Promise<'table' | 'delivery'> {
    const staffCallId = Number(payload.id);
    if (Number.isFinite(staffCallId) && staffCallId > 0) {
      const cached = this.enrichmentCache.get(staffCallId);
      if (cached && cached.expires > Date.now()) {
        return cached.channel;
      }
    }

    // Prefer explicit wire fields / heuristic first
    const heuristic = inferChannelFromPayload(payload);
    if (
      payload.type ||
      payload.orderType ||
      payload.orderChannel ||
      payload.channel
    ) {
      return heuristic;
    }

    // Enrich via Express when possible (Bearer from any joined relay of same menu)
    const menuId = Number(payload.menuId);
    const relay = Number.isFinite(menuId)
      ? this.relays.get(menuId)
      : undefined;
    if (
      relay?.staffId &&
      relay.staffRoleId &&
      Number.isFinite(staffCallId) &&
      staffCallId > 0
    ) {
      try {
        const token = this.jwtRelay.mintStaffJoinToken({
          staffId: relay.staffId,
          menuId: relay.menuId,
          staffRoleId: relay.staffRoleId,
        });
        const result = await this.ensHttp.proxy({
          method: 'GET',
          path: `staff-auth/table-calls/${staffCallId}`,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.status < 400 && result.data && typeof result.data === 'object') {
          const data = result.data as Record<string, unknown>;
          const call =
            data.call && typeof data.call === 'object'
              ? (data.call as Record<string, unknown>)
              : data;
          const channel = inferChannelFromPayload(call as ExpressTableCallPayload);
          this.enrichmentCache.set(staffCallId, {
            channel,
            expires: Date.now() + 60_000,
          });
          return channel;
        }
      } catch {
        /* fall through */
      }
    }

    return heuristic;
  }

  private async catchUpPending(
    relay: MenuRelay,
    token: string,
  ): Promise<void> {
    try {
      const result = await this.ensHttp.proxy({
        method: 'GET',
        path: 'staff-auth/table-calls',
        headers: { Authorization: `Bearer ${token}` },
        query: { status: 'pending', limit: 50 },
      });
      if (result.status >= 400) return;
      const data = result.data as { calls?: unknown } | null;
      const calls = Array.isArray(data?.calls) ? data!.calls : [];
      for (const raw of calls) {
        if (!raw || typeof raw !== 'object') continue;
        const payload = raw as ExpressTableCallPayload;
        // Best-effort: treat as new_call; eventId idempotency prevents dup pushes
        await this.handleNewCall({
          ...payload,
          menuId: payload.menuId ?? relay.menuId,
        });
      }
    } catch (err) {
      this.logger.debug(
        `Catch-up pending failed menuId=${relay.menuId}: ${String(err)}`,
      );
    }
  }
}
