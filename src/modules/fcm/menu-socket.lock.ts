import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

/**
 * Per-menu Postgres advisory locks for optional multi-Worker HA.
 * Session-scoped: lock lives on a dedicated client connection.
 */
@Injectable()
export class MenuSocketLockService implements OnModuleDestroy {
  private readonly logger = new Logger(MenuSocketLockService.name);
  private pool: Pool | null = null;
  private readonly held = new Map<number, PoolClient>();

  constructor(private readonly config: ConfigService) {}

  private ensurePool(): Pool | null {
    const url = this.config.get<string>('databaseUrl');
    if (!url) return null;
    if (!this.pool) {
      this.pool = new Pool({ connectionString: url, max: 10 });
    }
    return this.pool;
  }

  private lockKey(menuId: number): number {
    // Stable 32-bit key derived from menuId (avoid colliding with other app locks).
    // Prefix with a constant namespace.
    const ns = 0x46334d00; // 'FCM\0'
    return (ns ^ (menuId >>> 0)) | 0;
  }

  async tryAcquire(menuId: number): Promise<boolean> {
    if (this.held.has(menuId)) return true;
    const pool = this.ensurePool();
    if (!pool) return true; // no DB → allow single-worker local

    const client = await pool.connect();
    try {
      const key = this.lockKey(menuId);
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [key],
      );
      const locked = result.rows[0]?.locked === true;
      if (!locked) {
        client.release();
        return false;
      }
      this.held.set(menuId, client);
      return true;
    } catch (err) {
      client.release();
      this.logger.warn(
        `Advisory lock acquire failed menuId=${menuId}: ${String(err)}`,
      );
      return false;
    }
  }

  async release(menuId: number): Promise<void> {
    const client = this.held.get(menuId);
    if (!client) return;
    this.held.delete(menuId);
    try {
      const key = this.lockKey(menuId);
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    } catch (err) {
      this.logger.warn(
        `Advisory unlock failed menuId=${menuId}: ${String(err)}`,
      );
    } finally {
      client.release();
    }
  }

  async releaseAll(): Promise<void> {
    const menuIds = [...this.held.keys()];
    for (const menuId of menuIds) {
      await this.release(menuId);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.releaseAll();
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
