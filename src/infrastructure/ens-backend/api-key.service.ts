import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';
import { UpstreamClockService } from './upstream-clock.service';

/**
 * Generates x-api-key matching ens-menu-main axiosCall.ts:
 * AES.encrypt(JSON.stringify(`${SECRET_KEY}///${unixSeconds}`), SECRET_KEY)
 */
@Injectable()
export class ApiKeyService {
  private readonly secretKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly upstreamClock: UpstreamClockService,
  ) {
    this.secretKey = this.configService.get<string>('secretKey') ?? '';
  }

  isConfigured(): boolean {
    return this.secretKey.length > 0;
  }

  async generateHeaderValueAsync(forceClockSync = false): Promise<string> {
    if (!this.secretKey) {
      throw new Error('SECRET_KEY is not configured for upstream x-api-key');
    }

    await this.upstreamClock.ensureSynced(forceClockSync);

    const offsetSec =
      this.configService.get<number>('apiKeyTimeOffsetSeconds') ?? 0;
    const skewSec = this.upstreamClock.getSkewSeconds();
    const utcTime = parseFloat(
      (Date.now() / 1000 + skewSec + offsetSec).toFixed(3),
    );
    const payload = `${this.secretKey}///${utcTime}`;
    const jsonString = JSON.stringify(payload);
    return CryptoJS.AES.encrypt(jsonString, this.secretKey).toString();
  }

  /** Force re-sync server clock (e.g. after upstream 405 token expired). */
  async refreshClock(force = true): Promise<void> {
    await this.upstreamClock.ensureSynced(force);
  }
}
