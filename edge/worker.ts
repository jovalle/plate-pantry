const DEFAULT_ORIGIN = 'https://plate-pantry-origin.jayro.dev';
const CURRENT_PATH = '/plate-pantry';
const LEGACY_PATH = '/nypl8';
const CHECK_PATH = `${CURRENT_PATH}/api/check`;

export type OriginFetch = (request: Request) => Promise<Response>;

export type EdgeHandlerOptions = {
  originFetch?: OriginFetch;
  originSecret?: string;
  originUrl?: string;
};

function isPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function createEdgeHandler(optionsOrFetch: OriginFetch | EdgeHandlerOptions = fetch) {
  const options: EdgeHandlerOptions =
    typeof optionsOrFetch === 'function' ? { originFetch: optionsOrFetch } : optionsOrFetch;
  const originFetch = options.originFetch ?? fetch;

  return async function handle(
    request: Request,
    envSecret?: string | WorkerEnv,
  ): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (isPath(incomingUrl.pathname, LEGACY_PATH)) {
      const suffix = incomingUrl.pathname.slice(LEGACY_PATH.length);
      incomingUrl.pathname = `${CURRENT_PATH}${suffix}`;
      return Response.redirect(incomingUrl, 308);
    }

    if (!isPath(incomingUrl.pathname, CURRENT_PATH)) {
      return new Response('Not found', { status: 404 });
    }

    const baseOrigin =
      options.originUrl ??
      (typeof envSecret === 'object' && envSecret !== null
        ? (envSecret as WorkerEnv).PLATE_PANTRY_ORIGIN_URL
        : undefined) ??
      DEFAULT_ORIGIN;
    const originUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, baseOrigin);
    const forwardedRequest = new Request(originUrl, request);
    forwardedRequest.headers.set('x-forwarded-host', incomingUrl.host);
    forwardedRequest.headers.set('x-forwarded-proto', incomingUrl.protocol.slice(0, -1));

    const secret =
      options.originSecret ??
      (typeof envSecret === 'string'
        ? envSecret
        : (envSecret as WorkerEnv | undefined)?.PLATE_PANTRY_ORIGIN_SECRET);
    if (secret) {
      forwardedRequest.headers.set('x-plate-pantry-origin-secret', secret);
    }

    if (incomingUrl.pathname === CHECK_PATH && request.method === 'POST') {
      forwardedRequest.headers.set('x-plate-pantry-request-id', crypto.randomUUID());
    }

    const retryRequest = forwardedRequest.clone();
    let originResponse = await originFetch(forwardedRequest);
    let retryCount = 0;
    if (originResponse.status === 502) {
      await originResponse.body?.cancel();
      originResponse = await originFetch(retryRequest);
      retryCount = 1;
    }

    const response = new Response(originResponse.body, originResponse);
    response.headers.set('x-plate-pantry-edge-relay', 'cloudflare-worker');
    if (retryCount) response.headers.set('x-plate-pantry-edge-retry', String(retryCount));
    return response;
  };
}

export interface WorkerEnv {
  PLATE_PANTRY_ORIGIN_URL?: string;
  PLATE_PANTRY_ORIGIN_SECRET?: string;
}

const worker = {
  fetch(request: Request, env?: WorkerEnv) {
    const handler = createEdgeHandler({
      originUrl: env?.PLATE_PANTRY_ORIGIN_URL,
      originSecret: env?.PLATE_PANTRY_ORIGIN_SECRET,
    });
    return handler(request, env);
  },
};

export default worker;
