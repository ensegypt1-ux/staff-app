import { HttpService } from '@nestjs/axios';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Method } from 'axios';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
export interface EnsHttpResult {
    status: number;
    data: unknown;
}
export interface EnsProxyOptions {
    method: Method;
    path: string;
    req?: Request;
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    timeoutMs?: number;
}
export declare class EnsHttpService implements OnModuleInit {
    private readonly httpService;
    private readonly configService;
    private readonly apiKeyService;
    private readonly logger;
    private readonly apiBaseUrl;
    private readonly defaultTimeoutMs;
    private readonly upstreamDebugLog;
    constructor(httpService: HttpService, configService: ConfigService, apiKeyService: ApiKeyService);
    onModuleInit(): Promise<void>;
    buildUrl(path: string, query?: Record<string, unknown>): string;
    private summarizeUpstreamBody;
    private logUpstream;
    private attachApiKey;
    private executeRequest;
    proxy(options: EnsProxyOptions): Promise<EnsHttpResult>;
}
