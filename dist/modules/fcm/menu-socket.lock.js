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
var MenuSocketLockService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuSocketLockService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
let MenuSocketLockService = MenuSocketLockService_1 = class MenuSocketLockService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(MenuSocketLockService_1.name);
        this.pool = null;
        this.held = new Map();
    }
    ensurePool() {
        const url = this.config.get('databaseUrl');
        if (!url)
            return null;
        if (!this.pool) {
            this.pool = new pg_1.Pool({ connectionString: url, max: 10 });
        }
        return this.pool;
    }
    lockKey(menuId) {
        const ns = 0x46334d00;
        return (ns ^ (menuId >>> 0)) | 0;
    }
    async tryAcquire(menuId) {
        if (this.held.has(menuId))
            return true;
        const pool = this.ensurePool();
        if (!pool)
            return true;
        const client = await pool.connect();
        try {
            const key = this.lockKey(menuId);
            const result = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
            const locked = result.rows[0]?.locked === true;
            if (!locked) {
                client.release();
                return false;
            }
            this.held.set(menuId, client);
            return true;
        }
        catch (err) {
            client.release();
            this.logger.warn(`Advisory lock acquire failed menuId=${menuId}: ${String(err)}`);
            return false;
        }
    }
    async release(menuId) {
        const client = this.held.get(menuId);
        if (!client)
            return;
        this.held.delete(menuId);
        try {
            const key = this.lockKey(menuId);
            await client.query('SELECT pg_advisory_unlock($1)', [key]);
        }
        catch (err) {
            this.logger.warn(`Advisory unlock failed menuId=${menuId}: ${String(err)}`);
        }
        finally {
            client.release();
        }
    }
    async releaseAll() {
        const menuIds = [...this.held.keys()];
        for (const menuId of menuIds) {
            await this.release(menuId);
        }
    }
    async onModuleDestroy() {
        await this.releaseAll();
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
};
exports.MenuSocketLockService = MenuSocketLockService;
exports.MenuSocketLockService = MenuSocketLockService = MenuSocketLockService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MenuSocketLockService);
//# sourceMappingURL=menu-socket.lock.js.map