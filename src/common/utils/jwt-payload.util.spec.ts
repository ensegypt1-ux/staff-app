import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  attachAuthIdentity,
  extractBearerToken,
  getAuthIdentity,
  verifyAccessToken,
} from './jwt-payload.util';

describe('jwt-payload.util', () => {
  const secret = 'a'.repeat(32);
  const refreshSecret = 'b'.repeat(32);

  const configService = {
    get: (key: string) => {
      if (key === 'jwtAccessSecret') return secret;
      return undefined;
    },
  } as ConfigService;

  it('verifies a valid staff access token', () => {
    const token = jwt.sign(
      {
        id: 7,
        userId: 7,
        role: 'staff',
        menuId: 42,
        email: 's@example.com',
      },
      secret,
      { algorithm: 'HS256' },
    );
    const identity = verifyAccessToken(token, configService);
    expect(identity.userId).toBe(7);
    expect(identity.role).toBe('staff');
    expect(identity.menuId).toBe(42);
  });

  it('rejects a refresh token signed with a different secret', () => {
    const token = jwt.sign(
      { id: 42, userId: 42, role: 'staff' },
      refreshSecret,
      { algorithm: 'HS256', expiresIn: '7d' },
    );
    expect(() => verifyAccessToken(token, configService)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects forged / incorrectly signed tokens', () => {
    const token = jwt.sign(
      { id: 1, userId: 1, role: 'staff' },
      'wrong-secret-wrong-secret-wrong!!',
      { algorithm: 'HS256', expiresIn: '15m' },
    );
    expect(() => verifyAccessToken(token, configService)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects expired tokens with TOKEN_EXPIRED', () => {
    const token = jwt.sign(
      { id: 1, userId: 1, role: 'staff' },
      secret,
      { algorithm: 'HS256', expiresIn: -10 },
    );
    try {
      verifyAccessToken(token, configService);
      fail('expected UnauthorizedException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const response = (err as UnauthorizedException).getResponse() as {
        code?: string;
      };
      expect(response.code).toBe('TOKEN_EXPIRED');
    }
  });

  it('returns AUTH_MISCONFIGURED when access secret is missing', () => {
    const emptyConfig = {
      get: () => undefined,
    } as unknown as ConfigService;
    try {
      verifyAccessToken('anything', emptyConfig);
      fail('expected UnauthorizedException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const response = (err as UnauthorizedException).getResponse() as {
        code?: string;
      };
      expect(response.code).toBe('AUTH_MISCONFIGURED');
    }
  });

  it('extracts bearer token and attaches identity', () => {
    const token = jwt.sign(
      { id: 3, userId: 3, role: 'staff', menuId: 9 },
      secret,
      { algorithm: 'HS256' },
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as import('express').Request;

    expect(extractBearerToken(req)).toBe(token);
    const identity = verifyAccessToken(token, configService);
    attachAuthIdentity(req, identity);
    expect(getAuthIdentity(req)?.userId).toBe(3);
    expect(getAuthIdentity(req)?.menuId).toBe(9);
  });
});
