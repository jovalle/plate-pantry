import type { PlateLookupResult, PublicPlateStats } from './plate-stats.ts';
import { normalizePlate, validatePlate } from './plate-validation.ts';

type BackendResult = {
  plate?: string;
  status?: string;
  message?: string;
  checkedAt?: string;
};

export type CheckHandlerOptions = {
  backendUrl: URL;
  recordLookup: (plate: string, result: PlateLookupResult) => Promise<PublicPlateStats>;
  fetchBackend?: typeof fetch;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
};

const NO_STORE = { 'cache-control': 'no-store' } as const;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECENT_CHECKS = 1_000;
const RECENT_CHECK_TTL_MS = 60_000;

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp?.trim()) return cfIp.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded?.trim()) return forwarded.split(',')[0].trim();
  return '127.0.0.1';
}

export function createCheckHandler({
  backendUrl,
  recordLookup,
  fetchBackend = fetch,
  rateLimitWindowMs = 60_000,
  rateLimitMaxRequests = process.env.PLATE_PANTRY_RATE_LIMIT_PER_MINUTE
    ? Number(process.env.PLATE_PANTRY_RATE_LIMIT_PER_MINUTE)
    : 20,
}: CheckHandlerOptions) {
  const recentChecks = new Map<string, Promise<Response>>();
  const rateLimits = new Map<string, number[]>();

  function checkRateLimit(clientIp: string): { limited: boolean; retryAfter: number } {
    if (rateLimitMaxRequests <= 0) return { limited: false, retryAfter: 0 };
    const now = Date.now();
    const windowStart = now - rateLimitWindowMs;
    const timestamps = (rateLimits.get(clientIp) ?? []).filter((t) => t > windowStart);
    if (timestamps.length >= rateLimitMaxRequests) {
      const oldest = timestamps[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + rateLimitWindowMs - now) / 1000));
      return { limited: true, retryAfter };
    }
    timestamps.push(now);
    rateLimits.set(clientIp, timestamps);

    if (rateLimits.size > 5_000) {
      for (const [key, list] of rateLimits.entries()) {
        const valid = list.filter((t) => t > windowStart);
        if (valid.length === 0) rateLimits.delete(key);
        else rateLimits.set(key, valid);
      }
    }
    return { limited: false, retryAfter: 0 };
  }

  async function performCheck(request: Request): Promise<Response> {
    try {
      const contentLength = Number(request.headers.get('content-length') ?? 0);
      if (Number.isFinite(contentLength) && contentLength > 4_096) {
        return Response.json(
          {
            plate: '',
            status: 'error',
            message: 'Request body is too large.',
            checkedAt: new Date().toISOString(),
          },
          { status: 413, headers: NO_STORE },
        );
      }

      const payload = (await request.json()) as { plate?: unknown };
      const plate = normalizePlate(typeof payload.plate === 'string' ? payload.plate : '');
      const response = await fetchBackend(backendUrl, {
        method: 'POST',
        headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' },
        body: JSON.stringify({ plate: payload.plate }),
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      });
      const result = (await response.json()) as BackendResult;
      let stats: PublicPlateStats | null = null;

      if (
        !validatePlate(plate) &&
        result.checkedAt &&
        (result.status === 'available' ||
          result.status === 'unavailable' ||
          result.status === 'error') &&
        typeof result.message === 'string'
      ) {
        try {
          stats = await recordLookup(plate, {
            status: result.status,
            message: result.message,
            checkedAt: result.checkedAt,
          });
        } catch (error) {
          console.error('Could not record public plate statistics.', error);
        }
      }

      return Response.json(stats ? { ...result, ...stats } : result, {
        status: response.status,
        headers: {
          ...NO_STORE,
          ...(response.headers.has('retry-after')
            ? { 'retry-after': response.headers.get('retry-after') ?? '5' }
            : {}),
        },
      });
    } catch {
      return Response.json(
        {
          plate: '',
          status: 'error',
          message: 'The lookup service is unavailable. Try again in a moment.',
          checkedAt: new Date().toISOString(),
        },
        {
          status: 503,
          headers: { ...NO_STORE, 'retry-after': '5' },
        },
      );
    }
  }

  return async function handleCheck(request: Request): Promise<Response> {
    const rawRequestId = request.headers.get('x-plate-pantry-request-id') ?? '';
    const requestId = REQUEST_ID_PATTERN.test(rawRequestId) ? rawRequestId.toLowerCase() : '';
    const recentCheck = requestId ? recentChecks.get(requestId) : undefined;
    if (recentCheck) return (await recentCheck).clone();

    const clientIp = getClientIp(request);
    const { limited, retryAfter } = checkRateLimit(clientIp);
    if (limited) {
      return Response.json(
        {
          plate: '',
          status: 'error',
          message: 'Too many plate lookups. Please wait a moment before trying again.',
          checkedAt: new Date().toISOString(),
        },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            'retry-after': String(retryAfter),
          },
        },
      );
    }

    const check = performCheck(request);
    if (!requestId || recentChecks.size >= MAX_RECENT_CHECKS) return check;

    recentChecks.set(requestId, check);
    void check.then(() => {
      const timer = setTimeout(() => recentChecks.delete(requestId), RECENT_CHECK_TTL_MS);
      timer.unref();
    });
    return (await check).clone();
  };
}
