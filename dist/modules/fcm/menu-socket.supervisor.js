"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MenuSocketSupervisor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuSocketSupervisor = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const ens_http_service_1 = require("../../infrastructure/ens-backend/ens-http.service");
const prisma_service_1 = require("../../infrastructure/prisma/prisma.service");
const fcm_constants_1 = require("./fcm.constants");
const express_jwt_relay_service_1 = require("./express-jwt-relay.service");
const fcm_device_service_1 = require("./fcm-device.service");
const fcm_event_mapper_1 = require("./fcm-event.mapper");
const fcm_sender_service_1 = require("./fcm-sender.service");
const menu_socket_lock_1 = require("./menu-socket.lock");
let MenuSocketSupervisor = MenuSocketSupervisor_1 = class MenuSocketSupervisor {
    constructor(config, prisma, devices, locks, jwtRelay, sender, ensHttp) {
        this.config = config;
        this.prisma = prisma;
        this.devices = devices;
        this.locks = locks;
        this.jwtRelay = jwtRelay;
        this.sender = sender;
        this.ensHttp = ensHttp;
        this.logger = new common_1.Logger(MenuSocketSupervisor_1.name);
        this.relays = new Map();
        this.reconcileTimer = null;
        this.listenClient = null;
        this.shuttingDown = false;
        this.draining = false;
        this.reconnectsTotal = 0;
        this.enrichmentCache = new Map();
    }
    get desiredMenus() {
        return this.relays.size;
    }
    get joinedMenus() {
        let n = 0;
        for (const r of this.relays.values()) {
            if (r.state === 'joined')
                n += 1;
        }
        return n;
    }
    get uncoveredMenus() {
        const out = [];
        for (const r of this.relays.values()) {
            if (r.state === 'uncovered')
                out.push(r.menuId);
        }
        return out;
    }
    async onModuleInit() {
        if (!this.config.get('isWorkerRole'))
            return;
        if (!this.config.get('fcmEnabled')) {
            this.logger.log('FCM_ENABLED=false — MenuSocketSupervisor idle');
            return;
        }
        if (!this.prisma.isConnected) {
            this.logger.warn('Prisma not connected — supervisor not started');
            return;
        }
        await this.reconcileAll();
        const interval = this.config.get('fcmReconcileIntervalMs') ?? 3000;
        this.reconcileTimer = setInterval(() => {
            void this.reconcileAll();
        }, interval);
        await this.startListen();
        this.logger.log('MenuSocketSupervisor started');
    }
    async onModuleDestroy() {
        this.shuttingDown = true;
        this.draining = true;
        if (this.reconcileTimer) {
            clearInterval(this.reconcileTimer);
            this.reconcileTimer = null;
        }
        if (this.listenClient) {
            try {
                await this.listenClient.end();
            }
            catch {
            }
            this.listenClient = null;
        }
        const menuIds = [...this.relays.keys()];
        for (const menuId of menuIds) {
            await this.teardown(menuId);
        }
        await this.locks.releaseAll();
    }
    async startListen() {
        const url = this.config.get('databaseUrl');
        if (!url)
            return;
        try {
            this.listenClient = new pg_1.Client({ connectionString: url });
            await this.listenClient.connect();
            await this.listenClient.query(`LISTEN ${fcm_constants_1.FCM_COVERAGE_CHANNEL}`);
            this.listenClient.on('notification', (msg) => {
                const menuId = Number.parseInt(msg.payload ?? '', 10);
                if (Number.isFinite(menuId) && menuId > 0) {
                    void this.reconcileMenu(menuId);
                }
                else {
                    void this.reconcileAll();
                }
            });
        }
        catch (err) {
            this.logger.warn(`LISTEN setup failed (poll only): ${String(err)}`);
            this.listenClient = null;
        }
    }
    async reconcileAll() {
        if (this.shuttingDown || this.draining)
            return;
        if (!this.prisma.isConnected)
            return;
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
    async reconcileMenu(menuId) {
        if (this.shuttingDown || this.draining)
            return;
        const count = await this.prisma.staffFcmDevice.count({ where: { menuId } });
        if (count <= 0) {
            await this.teardown(menuId);
            return;
        }
        await this.acquire(menuId);
    }
    getOrCreate(menuId) {
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
    async acquire(menuId) {
        const relay = this.getOrCreate(menuId);
        if (relay.state === 'joined' || relay.state === 'connecting') {
            if (relay.connectPromise)
                await relay.connectPromise;
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
    async connectRelay(relay) {
        if (this.shuttingDown)
            return;
        const locked = await this.locks.tryAcquire(relay.menuId);
        if (!locked) {
            this.logger.debug(`Skip menuId=${relay.menuId} — advisory lock held elsewhere`);
            this.relays.delete(relay.menuId);
            return;
        }
        const identity = await this.devices.pickRelayIdentity(relay.menuId);
        if (!identity) {
            relay.state = 'uncovered';
            relay.uncoveredSince = relay.uncoveredSince ?? Date.now();
            this.logger.warn(`No staffRoleId identity for menuId=${relay.menuId}`);
            return;
        }
        relay.staffId = identity.staffId;
        relay.staffRoleId = identity.staffRoleId;
        relay.state = 'connecting';
        const socketUrl = this.config.get('ensSocketUrl');
        if (!socketUrl) {
            relay.state = 'uncovered';
            relay.uncoveredSince = Date.now();
            return;
        }
        if (relay.socket) {
            relay.socket.removeAllListeners();
            relay.socket.disconnect();
            relay.socket = null;
            relay.listenersAttached = false;
        }
        let token;
        try {
            token = this.jwtRelay.mintStaffJoinToken({
                staffId: identity.staffId,
                menuId: relay.menuId,
                staffRoleId: identity.staffRoleId,
            });
        }
        catch (err) {
            this.logger.error(`JWT mint failed menuId=${relay.menuId}: ${String(err)}`);
            relay.state = 'uncovered';
            relay.uncoveredSince = Date.now();
            return;
        }
        const socket = (0, socket_io_client_1.io)(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            autoConnect: false,
            reconnection: false,
        });
        relay.socket = socket;
        await new Promise((resolve) => {
            const finish = () => resolve();
            socket.on('connect', () => {
                socket.emit('staff:join', { token: `Bearer ${token}` }, (ack) => {
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
                    this.logger.warn(`staff:join failed menuId=${relay.menuId} error=${errCode}`);
                    if (errCode === 'FORBIDDEN' ||
                        errCode === 'ROLE_REQUIRED' ||
                        errCode === 'PRO_REQUIRED' ||
                        errCode === 'STAFF_NOT_FOUND') {
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
                });
            });
            socket.on('connect_error', (err) => {
                this.logger.warn(`Socket connect_error menuId=${relay.menuId}: ${err.message}`);
                relay.state = 'backoff';
                this.scheduleReconnect(relay);
                finish();
            });
            socket.on('disconnect', () => {
                if (this.shuttingDown || this.draining)
                    return;
                if (relay.state === 'absent')
                    return;
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
    attachListeners(relay) {
        if (!relay.socket || relay.listenersAttached)
            return;
        relay.listenersAttached = true;
        const socket = relay.socket;
        socket.on('staff:table_call', (payload) => {
            void this.handleNewCall(payload);
        });
        socket.on('staff:table_call_changed', (payload) => {
            void this.handleChanged(payload);
        });
    }
    scheduleReconnect(relay) {
        if (this.shuttingDown || relay.reconnectTimer)
            return;
        this.reconnectsTotal += 1;
        const jitter = Math.floor(Math.random() * 250);
        const delay = Math.min(relay.backoffMs, 60_000) + jitter;
        relay.backoffMs = Math.min(relay.backoffMs * 2, 60_000);
        relay.reconnectTimer = setTimeout(() => {
            relay.reconnectTimer = null;
            void this.acquire(relay.menuId);
        }, delay);
    }
    async teardown(menuId) {
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
    async handleNewCall(payload) {
        if (this.draining)
            return;
        const channel = await this.resolveChannel(payload);
        const mapped = (0, fcm_event_mapper_1.mapNewTableCallEvent)(payload, channel);
        if (!mapped)
            return;
        await this.sender.processMappedEvent(mapped);
    }
    async handleChanged(payload) {
        if (this.draining)
            return;
        const channel = await this.resolveChannel(payload);
        const mapped = (0, fcm_event_mapper_1.mapAttentionChangedEvent)(payload, channel);
        if (!mapped)
            return;
        await this.sender.processMappedEvent(mapped);
    }
    async resolveChannel(payload) {
        const staffCallId = Number(payload.id);
        if (Number.isFinite(staffCallId) && staffCallId > 0) {
            const cached = this.enrichmentCache.get(staffCallId);
            if (cached && cached.expires > Date.now()) {
                return cached.channel;
            }
        }
        const heuristic = (0, fcm_event_mapper_1.inferChannelFromPayload)(payload);
        if (payload.type ||
            payload.orderType ||
            payload.orderChannel ||
            payload.channel) {
            return heuristic;
        }
        const menuId = Number(payload.menuId);
        const relay = Number.isFinite(menuId)
            ? this.relays.get(menuId)
            : undefined;
        if (relay?.staffId &&
            relay.staffRoleId &&
            Number.isFinite(staffCallId) &&
            staffCallId > 0) {
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
                    const data = result.data;
                    const call = data.call && typeof data.call === 'object'
                        ? data.call
                        : data;
                    const channel = (0, fcm_event_mapper_1.inferChannelFromPayload)(call);
                    this.enrichmentCache.set(staffCallId, {
                        channel,
                        expires: Date.now() + 60_000,
                    });
                    return channel;
                }
            }
            catch {
            }
        }
        return heuristic;
    }
    async catchUpPending(relay, token) {
        try {
            const result = await this.ensHttp.proxy({
                method: 'GET',
                path: 'staff-auth/table-calls',
                headers: { Authorization: `Bearer ${token}` },
                query: { status: 'pending', limit: 50 },
            });
            if (result.status >= 400)
                return;
            const data = result.data;
            const calls = Array.isArray(data?.calls) ? data.calls : [];
            for (const raw of calls) {
                if (!raw || typeof raw !== 'object')
                    continue;
                const payload = raw;
                await this.handleNewCall({
                    ...payload,
                    menuId: payload.menuId ?? relay.menuId,
                });
            }
        }
        catch (err) {
            this.logger.debug(`Catch-up pending failed menuId=${relay.menuId}: ${String(err)}`);
        }
    }
};
exports.MenuSocketSupervisor = MenuSocketSupervisor;
exports.MenuSocketSupervisor = MenuSocketSupervisor = MenuSocketSupervisor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        fcm_device_service_1.FcmDeviceService,
        menu_socket_lock_1.MenuSocketLockService,
        express_jwt_relay_service_1.ExpressJwtRelayService,
        fcm_sender_service_1.FcmSenderService,
        ens_http_service_1.EnsHttpService])
], MenuSocketSupervisor);
//# sourceMappingURL=menu-socket.supervisor.js.map