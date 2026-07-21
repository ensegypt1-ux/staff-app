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
var FcmSenderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FcmSenderService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../infrastructure/prisma/prisma.service");
const fcm_constants_1 = require("./fcm.constants");
const fcm_device_service_1 = require("./fcm-device.service");
const fcm_i18n_util_1 = require("./fcm-i18n.util");
const fcm_recipient_util_1 = require("./fcm-recipient.util");
let FcmSenderService = FcmSenderService_1 = class FcmSenderService {
    constructor(config, prisma, devices) {
        this.config = config;
        this.prisma = prisma;
        this.devices = devices;
        this.logger = new common_1.Logger(FcmSenderService_1.name);
        this.messaging = null;
        this.firebaseReady = false;
        this.sentTotal = 0;
        this.dedupedTotal = 0;
        this.invalidTokenTotal = 0;
        this.menuWindow = new Map();
    }
    get isFirebaseReady() {
        return this.firebaseReady;
    }
    onModuleInit() {
        if (!this.config.get('fcmEnabled')) {
            this.logger.log('FCM_ENABLED=false — sender idle');
            return;
        }
        if (this.config.get('fcmDryRun')) {
            this.logger.log('FCM_DRY_RUN=true — will log instead of send');
            this.firebaseReady = true;
            return;
        }
        this.initFirebase();
    }
    initFirebase() {
        try {
            if ((0, app_1.getApps)().length > 0) {
                this.messaging = (0, messaging_1.getMessaging)();
                this.firebaseReady = true;
                return;
            }
            const json = this.config.get('firebaseServiceAccountJson');
            if (json) {
                const cred = JSON.parse(json);
                (0, app_1.initializeApp)({ credential: (0, app_1.cert)(cred) });
            }
            else {
                const projectId = this.config.get('firebaseProjectId');
                const clientEmail = this.config.get('firebaseClientEmail');
                const privateKey = this.config.get('firebasePrivateKey');
                if (!projectId || !clientEmail || !privateKey) {
                    this.logger.warn('Firebase credentials missing — FCM send disabled until configured');
                    return;
                }
                (0, app_1.initializeApp)({
                    credential: (0, app_1.cert)({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                });
            }
            this.messaging = (0, messaging_1.getMessaging)();
            this.firebaseReady = true;
            this.logger.log('Firebase Admin initialized');
        }
        catch (err) {
            this.logger.error(`Firebase init failed: ${String(err)}`);
            this.firebaseReady = false;
        }
    }
    allowMenuRate(menuId) {
        const limit = this.config.get('fcmPerMenuRateLimit') ?? 30;
        const now = Date.now();
        const windowMs = 60_000;
        const stamps = (this.menuWindow.get(menuId) ?? []).filter((t) => now - t < windowMs);
        if (stamps.length >= limit) {
            this.menuWindow.set(menuId, stamps);
            return false;
        }
        stamps.push(now);
        this.menuWindow.set(menuId, stamps);
        return true;
    }
    async processMappedEvent(event) {
        if (!this.config.get('fcmEnabled'))
            return;
        if (!this.prisma.isConnected)
            return;
        try {
            await this.prisma.fcmDeliveryLog.create({
                data: {
                    eventId: event.eventId,
                    menuId: event.menuId,
                    staffCallId: event.staffCallId,
                    kind: event.kind,
                },
            });
        }
        catch (err) {
            if (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                this.dedupedTotal += 1;
                return;
            }
            throw err;
        }
        if (!this.allowMenuRate(event.menuId)) {
            this.logger.warn(`Per-menu FCM rate limit menuId=${event.menuId} eventId=${event.eventId}`);
            return;
        }
        const devices = await this.prisma.staffFcmDevice.findMany({
            where: { menuId: event.menuId },
        });
        const recipients = devices.filter((d) => (0, fcm_recipient_util_1.deviceShouldReceivePush)({
            permissions: (0, fcm_recipient_util_1.parsePermissionsJson)(d.permissionsJson),
            kind: event.kind,
            channel: event.channel,
        }));
        if (recipients.length === 0) {
            this.logger.debug(`No FCM recipients menuId=${event.menuId} kind=${event.kind}`);
            return;
        }
        const byLocale = new Map();
        for (const d of recipients) {
            const locale = (d.locale ?? 'en').toLowerCase().startsWith('ar')
                ? 'ar'
                : 'en';
            const list = byLocale.get(locale) ?? [];
            list.push(d);
            byLocale.set(locale, list);
        }
        for (const [locale, group] of byLocale) {
            const { title, body } = (0, fcm_i18n_util_1.localizeFcmNotification)({
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
    async sendToTokens(input) {
        const data = {
            eventId: input.event.eventId,
            staffCallId: String(input.event.staffCallId),
            menuId: String(input.event.menuId),
            channel: input.event.channel,
            kind: input.event.kind,
            listScope: 'active',
        };
        if (this.config.get('fcmDryRun') || !this.messaging) {
            this.logger.log(`FCM dry-run recipients=${input.tokens.length} eventId=${input.event.eventId} title=${input.title}`);
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
                        notification: { channelId: fcm_constants_1.FCM_NOTIFICATION_CHANNEL_ID },
                    },
                    apns: {
                        payload: { aps: { sound: 'default' } },
                    },
                });
                this.sentTotal += response.successCount;
                response.responses.forEach((res, idx) => {
                    if (res.success)
                        return;
                    const code = res.error?.code ?? '';
                    const token = chunk[idx];
                    const suffix = token.slice(-6);
                    if (code.includes('registration-token-not-registered') ||
                        code.includes('invalid-registration-token')) {
                        this.invalidTokenTotal += 1;
                        void this.devices.deleteByToken(token);
                        this.logger.warn(`Invalid FCM token …${suffix} removed`);
                    }
                    else {
                        this.logger.warn(`FCM send fail …${suffix} code=${code} msg=${res.error?.message}`);
                    }
                });
            }
            catch (err) {
                this.logger.warn(`FCM multicast error eventId=${input.event.eventId}: ${String(err)} — retry once`);
                try {
                    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
                    await this.messaging.sendEachForMulticast({
                        tokens: chunk,
                        notification: { title: input.title, body: input.body },
                        data,
                        android: {
                            priority: 'high',
                            notification: { channelId: fcm_constants_1.FCM_NOTIFICATION_CHANNEL_ID },
                        },
                        apns: {
                            payload: { aps: { sound: 'default' } },
                        },
                    });
                }
                catch (err2) {
                    this.logger.error(`FCM retry failed eventId=${input.event.eventId}: ${String(err2)}`);
                }
            }
        }
    }
};
exports.FcmSenderService = FcmSenderService;
exports.FcmSenderService = FcmSenderService = FcmSenderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        fcm_device_service_1.FcmDeviceService])
], FcmSenderService);
//# sourceMappingURL=fcm-sender.service.js.map