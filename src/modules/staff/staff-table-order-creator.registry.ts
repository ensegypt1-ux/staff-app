import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type CreatorRecord = {
  menuId: number;
  staffCallId: number;
  staffId: number;
  recordedAt: string;
};

/** Tracks staff-created table orders (BFF-only; QR/guest orders are not recorded). */
@Injectable()
export class StaffTableOrderCreatorRegistry implements OnModuleInit {
  private readonly logger = new Logger(StaffTableOrderCreatorRegistry.name);
  private readonly records = new Map<string, number>();
  private readonly dataPath = join(
    process.cwd(),
    'data',
    'staff-table-order-creators.json',
  );

  onModuleInit(): void {
    this.loadFromDisk();
  }

  record(menuId: number, staffCallId: number, staffId: number): void {
    if (menuId <= 0 || staffCallId <= 0 || staffId <= 0) return;
    this.records.set(this.key(menuId, staffCallId), staffId);
    this.persistToDisk(menuId, staffCallId, staffId);
  }

  lookup(menuId: number, staffCallId: number): number | null {
    if (menuId <= 0 || staffCallId <= 0) return null;
    const staffId = this.records.get(this.key(menuId, staffCallId));
    return staffId != null && staffId > 0 ? staffId : null;
  }

  private key(menuId: number, staffCallId: number): string {
    return `${menuId}:${staffCallId}`;
  }

  private loadFromDisk(): void {
    if (!existsSync(this.dataPath)) return;
    try {
      const raw = readFileSync(this.dataPath, 'utf8');
      const parsed = JSON.parse(raw) as CreatorRecord[];
      if (!Array.isArray(parsed)) return;
      for (const row of parsed) {
        if (
          Number(row.menuId) > 0 &&
          Number(row.staffCallId) > 0 &&
          Number(row.staffId) > 0
        ) {
          this.records.set(
            this.key(Number(row.menuId), Number(row.staffCallId)),
            Number(row.staffId),
          );
        }
      }
      this.logger.log(`Loaded ${this.records.size} staff table order creators`);
    } catch (error) {
      this.logger.warn(`Failed to load creator registry: ${String(error)}`);
    }
  }

  private persistToDisk(
    menuId: number,
    staffCallId: number,
    staffId: number,
  ): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const existing: CreatorRecord[] = existsSync(this.dataPath)
        ? (JSON.parse(readFileSync(this.dataPath, 'utf8')) as CreatorRecord[])
        : [];
      const filtered = existing.filter(
        (row) =>
          !(
            Number(row.menuId) === menuId &&
            Number(row.staffCallId) === staffCallId
          ),
      );
      filtered.push({
        menuId,
        staffCallId,
        staffId,
        recordedAt: new Date().toISOString(),
      });
      writeFileSync(this.dataPath, JSON.stringify(filtered, null, 2), 'utf8');
    } catch (error) {
      this.logger.warn(`Failed to persist creator registry: ${String(error)}`);
    }
  }
}
