"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var StaffTableOrderCreatorRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffTableOrderCreatorRegistry = void 0;
const common_1 = require("@nestjs/common");
const fs_1 = require("fs");
const path_1 = require("path");
let StaffTableOrderCreatorRegistry = StaffTableOrderCreatorRegistry_1 = class StaffTableOrderCreatorRegistry {
    constructor() {
        this.logger = new common_1.Logger(StaffTableOrderCreatorRegistry_1.name);
        this.records = new Map();
        this.dataPath = (0, path_1.join)(process.cwd(), 'data', 'staff-table-order-creators.json');
    }
    onModuleInit() {
        this.loadFromDisk();
    }
    record(menuId, staffCallId, staffId) {
        if (menuId <= 0 || staffCallId <= 0 || staffId <= 0)
            return;
        this.records.set(this.key(menuId, staffCallId), staffId);
        this.persistToDisk(menuId, staffCallId, staffId);
    }
    lookup(menuId, staffCallId) {
        if (menuId <= 0 || staffCallId <= 0)
            return null;
        const staffId = this.records.get(this.key(menuId, staffCallId));
        return staffId != null && staffId > 0 ? staffId : null;
    }
    key(menuId, staffCallId) {
        return `${menuId}:${staffCallId}`;
    }
    loadFromDisk() {
        if (!(0, fs_1.existsSync)(this.dataPath))
            return;
        try {
            const raw = (0, fs_1.readFileSync)(this.dataPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return;
            for (const row of parsed) {
                if (Number(row.menuId) > 0 &&
                    Number(row.staffCallId) > 0 &&
                    Number(row.staffId) > 0) {
                    this.records.set(this.key(Number(row.menuId), Number(row.staffCallId)), Number(row.staffId));
                }
            }
            this.logger.log(`Loaded ${this.records.size} staff table order creators`);
        }
        catch (error) {
            this.logger.warn(`Failed to load creator registry: ${String(error)}`);
        }
    }
    persistToDisk(menuId, staffCallId, staffId) {
        try {
            const dir = (0, path_1.join)(process.cwd(), 'data');
            if (!(0, fs_1.existsSync)(dir)) {
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            }
            const existing = (0, fs_1.existsSync)(this.dataPath)
                ? JSON.parse((0, fs_1.readFileSync)(this.dataPath, 'utf8'))
                : [];
            const filtered = existing.filter((row) => !(Number(row.menuId) === menuId &&
                Number(row.staffCallId) === staffCallId));
            filtered.push({
                menuId,
                staffCallId,
                staffId,
                recordedAt: new Date().toISOString(),
            });
            (0, fs_1.writeFileSync)(this.dataPath, JSON.stringify(filtered, null, 2), 'utf8');
        }
        catch (error) {
            this.logger.warn(`Failed to persist creator registry: ${String(error)}`);
        }
    }
};
exports.StaffTableOrderCreatorRegistry = StaffTableOrderCreatorRegistry;
exports.StaffTableOrderCreatorRegistry = StaffTableOrderCreatorRegistry = StaffTableOrderCreatorRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], StaffTableOrderCreatorRegistry);
//# sourceMappingURL=staff-table-order-creator.registry.js.map