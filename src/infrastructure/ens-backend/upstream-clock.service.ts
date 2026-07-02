import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/** Aligns x-api-key timestamps with Express server time (60s window). */
@Injectable()
export class UpstreamClockService {
  private readonly logger = new Logger(UpstreamClockService.name);
  private readonly backendBaseUrl: string;
  private skewSeconds = 0;
  private lastSyncMs = 0;
  private syncPromise: Promise<void> | null = null;

  private static readonly SYNC_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.backendBaseUrl =
      this.configService.get<string>('ensBackendUrl')?.replace(/\/$/, '') ?? '';
  }

  getSkewSeconds(): number {
    return this.skewSeconds;
  }

  async ensureSynced(force = false): Promise<void> {
    if (!this.backendBaseUrl) return;

    const stale =
      force ||
      this.lastSyncMs === 0 ||
      Date.now() - this.lastSyncMs > UpstreamClockService.SYNC_TTL_MS;

    if (!stale) return;

    if (this.syncPromise) {
      await this.syncPromise;
      return;
    }

    this.syncPromise = this.syncFromHealth().finally(() => {
      this.syncPromise = null;
    });
    await this.syncPromise;
  }

  private async syncFromHealth(): Promise<void> {
    const url = `${this.backendBaseUrl}/health`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ timestamp?: string }>(url, {
          timeout: 8000,
          validateStatus: () => true,
        }),
      );

      if (response.status >= 400) {
        this.logger.warn(
          `[clock] health sync failed HTTP ${response.status} from ${url}`,
        );
        return;
      }

      const body = response.data ?? {};
      const fromJson =
        typeof body.timestamp === 'string'
          ? Date.parse(body.timestamp)
          : Number.NaN;

      const fromHeader = response.headers?.date
        ? Date.parse(String(response.headers.date))
        : Number.NaN;

      const serverMs = Number.isFinite(fromJson)
        ? fromJson
        : Number.isFinite(fromHeader)
          ? fromHeader
          : Number.NaN;

      if (!Number.isFinite(serverMs)) {
        this.logger.warn('[clock] health response has no usable timestamp');
        return;
      }

      const localMs = Date.now();
      this.skewSeconds = (serverMs - localMs) / 1000;
      this.lastSyncMs = localMs;

      this.logger.log(
        `[clock] synced skew=${this.skewSeconds.toFixed(1)}s from ${url}`,
      );
    } catch (error) {
      this.logger.warn(
        `[clock] sync error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
