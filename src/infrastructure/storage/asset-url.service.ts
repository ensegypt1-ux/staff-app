import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AssetUrlService {
  private readonly publicBase: string;
  private readonly backendBase: string;

  constructor(private readonly configService: ConfigService) {
    this.publicBase =
      this.configService.get<string>('assetPublicBaseUrl') ?? '';
    this.backendBase = this.configService.get<string>('ensBackendUrl') ?? '';
  }

  rewriteUrl(value: string): string {
    if (!value || value.startsWith('data:')) {
      return value;
    }

    if (value.startsWith('/uploads/') || value.startsWith('/api/uploads/')) {
      const path = value.startsWith('/api/uploads/')
        ? value.replace('/api/uploads/', '/uploads/')
        : value;
      return `${this.publicBase}${path}`;
    }

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (
          url.pathname.includes('/uploads/') &&
          (url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.origin === this.backendBase ||
            url.href.startsWith(this.backendBase))
        ) {
          const uploadPath = url.pathname.includes('/api/uploads/')
            ? url.pathname.replace('/api/uploads/', '/uploads/')
            : url.pathname;
          return `${this.publicBase}${uploadPath}${url.search}`;
        }
      } catch {
        return value;
      }
    }

    return value;
  }

  rewriteDeep<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      if (
        input.includes('/uploads/') ||
        input.startsWith('http://') ||
        input.startsWith('https://')
      ) {
        return this.rewriteUrl(input) as T;
      }
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.rewriteDeep(item)) as T;
    }

    if (typeof input === 'object') {
      const record = input as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        next[key] = this.rewriteDeep(value);
      }
      return next as T;
    }

    return input;
  }
}
