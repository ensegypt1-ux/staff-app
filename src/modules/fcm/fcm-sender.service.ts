import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import {
  getMessaging,
  Messaging,
  SendResponse,
} from 'firebase-admin/messaging';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { FCM_NOTIFICATION_CHANNEL_ID } from './fcm.constants';
import { FcmDeviceService } from './fcm-device.service';
import { MappedFcmEvent } from './fcm-event.mapper';
import { localizeFcmNotification } from './fcm-i18n.util';
import {
  deviceShouldReceivePush,
  parsePermissionsJson,
} from './fcm-recipient.util';

@Injectable()
export class FcmSenderService implements OnModuleInit {
  private readonly logger = new Logger(FcmSenderService.name);
  private messaging: Messaging | null = null;
  private firebaseReady = false;

  sentTotal = 0;
  dedupedTotal = 0;
  invalidTokenTotal = 0;

  private readonly menuWindow = new Map<number, number[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly devices: FcmDeviceService,
  ) {}

  get isFirebaseReady(): boolean {
    return this.firebaseReady;
  }

  onModuleInit(): void {
    if (!this.config.get<boolean>('fcmEnabled')) {
      this.logger.log('FCM_ENABLED=false — sender idle');
      return;
    }
    if (this.config.get<boolean>('fcmDryRun')) {
      this.logger.log('FCM_DRY_RUN=true — will log instead of send');
      this.firebaseReady = true;
      return;
    }
    this.initFirebase();
  }

  private initFirebase(): void {
    try {
      if (getApps().length > 0) {
        this.messaging = getMessaging();
        this.firebaseReady = true;
        return;
      }

      const json = this.config.get<string>('firebaseServiceAccountJson');
      if (json) {
        const cred = JSON.parse(json) as ServiceAccount;
        initializeApp({ credential: cert(cred) });
      } else {
        const projectId = this.config.get<string>('firebaseProjectId');
        const clientEmail = this.config.get<string>('firebaseClientEmail');
        const privateKey = this.config.get<string>('firebasePrivateKey');
        if (!projectId || !clientEmail || !privateKey) {
          this.logger.warn(
            'Firebase credentials missing — FCM send disabled until configured',
          );
          return;
        }
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }
      this.messaging = getMessaging();
      this.firebaseReady = true;
      this.logger.log('Firebase Admin initialized');
    } catch (err) {
      this.logger.error(`Firebase init failed: ${String(err)}`);
      this.firebaseReady = false;
    }
  }

  private allowMenuRate(menuId: number): boolean {
    const limit = this.config.get<number>('fcmPerMenuRateLimit') ?? 30;
    const now = Date.now();
    const windowMs = 60_000;
    const stamps = (this.menuWindow.get(menuId) ?? []).filter(
      (t) => now - t < windowMs,
    );
    if (stamps.length >= limit) {
      this.menuWindow.set(menuId, stamps);
      return false;
    }
    stamps.push(now);
    this.menuWindow.set(menuId, stamps);
    return true;
  }

  async processMappedEvent(event: MappedFcmEvent): Promise<void> {
    if (!this.config.get<boolean>('fcmEnabled')) return;
    if (!this.prisma.isConnected) return;

    try {
      await this.prisma.fcmDeliveryLog.create({
        data: {
          eventId: event.eventId,
          menuId: event.menuId,
          staffCallId: event.staffCallId,
          kind: event.kind,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.dedupedTotal += 1;
        return;
      }
      throw err;
    }

    if (!this.allowMenuRate(event.menuId)) {
      this.logger.warn(
        `Per-menu FCM rate limit menuId=${event.menuId} eventId=${event.eventId}`,
      );
      return;
    }

    const devices = await this.prisma.staffFcmDevice.findMany({
      where: { menuId: event.menuId },
    });

    const recipients = devices.filter((d) =>
      deviceShouldReceivePush({
        permissions: parsePermissionsJson(d.permissionsJson),
        kind: event.kind,
        channel: event.channel,
      }),
    );

    if (recipients.length === 0) {
      this.logger.debug(
        `No FCM recipients menuId=${event.menuId} kind=${event.kind}`,
      );
      return;
    }

    const byLocale = new Map<string, typeof recipients>();
    for (const d of recipients) {
      const locale = (d.locale ?? 'en').toLowerCase().startsWith('ar')
        ? 'ar'
        : 'en';
      const list = byLocale.get(locale) ?? [];
      list.push(d);
      byLocale.set(locale, list);
    }

    for (const [locale, group] of byLocale) {
      const { title, body } = localizeFcmNotification({
        locale,
        kind: event.kind,
        channel: event.channel,
        tableNumber: event.tableNumber,
        customerName: event.customerName,
      });

      const tokens = group.map((g) => g.fcmToken);
      await this.sendToTokens({
        tokens,
        title,
        body,
        event,
      });
    }
  }

  private async sendToTokens(input: {
    tokens: string[];
    title: string;
    body: string;
    event: MappedFcmEvent;
  }): Promise<void> {
    const data: Record<string, string> = {
      eventId: input.event.eventId,
      staffCallId: String(input.event.staffCallId),
      menuId: String(input.event.menuId),
      channel: input.event.channel,
      kind: input.event.kind,
      listScope: 'active',
    };

    if (this.config.get<boolean>('fcmDryRun') || !this.messaging) {
      this.logger.log(
        `FCM dry-run recipients=${input.tokens.length} eventId=${input.event.eventId} title=${input.title}`,
      );
      this.sentTotal += input.tokens.length;
      return;
    }

    const chunkSize = 500;
    for (let i = 0; i < input.tokens.length; i += chunkSize) {
      const chunk = input.tokens.slice(i, i + chunkSize);
      try {
        const response = await this.messaging.sendEachForMulticast({
          tokens: chunk,
          notification: { title: input.title, body: input.body },
          data,
          android: {
            priority: 'high',
            notification: { channelId: FCM_NOTIFICATION_CHANNEL_ID },
          },
          apns: {
            payload: { aps: { sound: 'default' } },
          },
        });

        this.sentTotal += response.successCount;

        response.responses.forEach((res: SendResponse, idx: number) => {
          if (res.success) return;
          const code = res.error?.code ?? '';
          const token = chunk[idx];
          const suffix = token.slice(-6);
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token')
          ) {
            this.invalidTokenTotal += 1;
            void this.devices.deleteByToken(token);
            this.logger.warn(`Invalid FCM token …${suffix} removed`);
          } else {
            this.logger.warn(
              `FCM send fail …${suffix} code=${code} msg=${res.error?.message}`,
            );
          }
        });
      } catch (err) {
        this.logger.warn(
          `FCM multicast error eventId=${input.event.eventId}: ${String(err)} — retry once`,
        );
        try {
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
          await this.messaging.sendEachForMulticast({
            tokens: chunk,
            notification: { title: input.title, body: input.body },
            data,
            android: {
              priority: 'high',
              notification: { channelId: FCM_NOTIFICATION_CHANNEL_ID },
            },
            apns: {
              payload: { aps: { sound: 'default' } },
            },
          });
        } catch (err2) {
          this.logger.error(
            `FCM retry failed eventId=${input.event.eventId}: ${String(err2)}`,
          );
        }
      }
    }
  }
}
