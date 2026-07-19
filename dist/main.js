"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const express_1 = require("express");
const helmet_1 = require("helmet");
const app_module_1 = require("./app.module");
function parseCorsOrigins(value, nodeEnv) {
    const trimmed = value.trim();
    if (trimmed === '*') {
        if (nodeEnv === 'production') {
            throw new Error('CORS_ORIGINS=* is not allowed when NODE_ENV=production. Set an explicit allowlist.');
        }
        return true;
    }
    return trimmed
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}
async function bootstrap() {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bodyParser: false,
        logger: nodeEnv === 'production'
            ? ['error', 'warn', 'log']
            : ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('port') ?? 3010;
    const corsOrigins = configService.get('corsOrigins') ?? '*';
    const jsonLimit = configService.get('requestJsonLimit') ?? '1mb';
    const urlencodedLimit = configService.get('requestUrlencodedLimit') ?? '1mb';
    const trustProxyHops = configService.get('trustProxyHops') ?? 0;
    const upstreamDebug = configService.get('upstreamDebugLog');
    if (trustProxyHops > 0) {
        const httpAdapter = app.getHttpAdapter();
        const instance = httpAdapter.getInstance();
        instance.set?.('trust proxy', trustProxyHops);
        if (trustProxyHops > 3) {
            common_1.Logger.warn(`TRUST_PROXY_HOPS=${trustProxyHops} is high — confirm it equals your reverse-proxy hop count`, 'Bootstrap');
        }
    }
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
        crossOriginEmbedderPolicy: false,
    }));
    app.use((0, express_1.json)({ limit: jsonLimit }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: urlencodedLimit }));
    app.enableCors({
        origin: parseCorsOrigins(corsOrigins, nodeEnv),
        credentials: true,
        allowedHeaders: [
            'Authorization',
            'Content-Type',
            'Accept-Language',
            'X-Request-Id',
        ],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: false,
    }));
    await app.listen(port);
    common_1.Logger.log(`Ensmenu Staff BFF listening on port ${port}`, 'Bootstrap');
    if (upstreamDebug) {
        common_1.Logger.log('Upstream debug logging enabled (UPSTREAM_DEBUG_LOG)', 'Bootstrap');
    }
}
bootstrap();
//# sourceMappingURL=main.js.map