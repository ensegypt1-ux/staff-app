import { Request } from 'express';

const FORWARD_HEADER_NAMES = [
  'authorization',
  'accept-language',
  'content-type',
  'x-request-id',
] as const;

export function pickForwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const name of FORWARD_HEADER_NAMES) {
    const value = req.headers[name];
    if (typeof value === 'string' && value.length > 0) {
      headers[name] = value;
    }
  }

  return headers;
}
