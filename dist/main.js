"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
function parseCorsOrigins(value) {
    if (value === '*') {
        return true;
    }
    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}
async function bootstrap() {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bodyParser: true,
        logger: nodeEnv === 'production'
            ? ['error', 'warn', 'log']
            : ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('port') ?? 3010;
    const corsOrigins = configService.get('corsOrigins') ?? '*';
    app.enableCors({
        origin: parseCorsOrigins(corsOrigins),
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
        whitelist: false,
        forbidUnknownValues: false,
    }));
    await app.listen(port);
    common_1.Logger.log(`Ensmenu Staff BFF listening on port ${port}`, 'Bootstrap');
}
bootstrap();
//# sourceMappingURL=main.js.map