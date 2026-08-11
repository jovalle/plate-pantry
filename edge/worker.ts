const ORIGIN = 'https://plate-pantry-origin.jayro.dev';
const CURRENT_PATH = '/plate-pantry';
const LEGACY_PATH = '/nypl8';
const CHECK_PATH = `${CURRENT_PATH}/api/check`;

export type OriginFetch = (request: Request) => Promise<Response>;

function isPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function createEdgeHandler(originFetch: OriginFetch = fetch) {
  return async function handle(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (isPath(incomingUrl.pathname, LEGACY_PATH)) {
      const suffix = incomingUrl.pathname.slice(LEGACY_PATH.length);
      incomingUrl.pathname = `${CURRENT_PATH}${suffix}`;
      return Response.redirect(incomingUrl, 308);
    }

    if (!isPath(incomingUrl.pathname, CURRENT_PATH)) {
      return new Response('Not found', { status: 404 });
    }

    const originUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, ORIGIN);
    const forwardedRequest = new Request(originUrl, request);
    forwardedRequest.headers.set('x-forwarded-host', incomingUrl.host);
    forwardedRequest.headers.set('x-forwarded-proto', incomingUrl.protocol.slice(0, -1));
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

const handle = createEdgeHandler();

const worker = {
  fetch(request: Request) {
    return handle(request);
  },
};

export default worker;
