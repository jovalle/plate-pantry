import assert from 'node:assert/strict';
import test from 'node:test';
import { createEdgeHandler } from '../edge/worker.ts';

test('relays the Plate Pantry path and preserves its request', async () => {
  let forwarded: Request | undefined;
  const handler = createEdgeHandler(async (request) => {
    forwarded = request;
    return new Response('Plate Pantry', { status: 200, headers: { 'x-origin': 'nexus' } });
  });

  const response = await handler(
    new Request('https://jayro.dev/plate-pantry/api/stats?plate=NYK%20IN%205'),
  );

  assert.equal(
    forwarded?.url,
    'https://plate-pantry-origin.jayro.dev/plate-pantry/api/stats?plate=NYK%20IN%205',
  );
  assert.equal(forwarded?.headers.get('x-forwarded-host'), 'jayro.dev');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-origin'), 'nexus');
  assert.equal(response.headers.get('x-plate-pantry-edge-relay'), 'cloudflare-worker');
});

test('retries an upstream 502 once with the same check request ID', async () => {
  const forwarded: Request[] = [];
  const handler = createEdgeHandler(async (request) => {
    forwarded.push(request);
    return forwarded.length === 1
      ? new Response('Bad gateway', { status: 502 })
      : Response.json({ status: 'available' });
  });

  const response = await handler(
    new Request('https://jayro.dev/plate-pantry/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plate: 'NYK IN 5' }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-plate-pantry-edge-retry'), '1');
  assert.equal(forwarded.length, 2);
  assert.match(forwarded[0].headers.get('x-plate-pantry-request-id') ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(
    forwarded[1].headers.get('x-plate-pantry-request-id'),
    forwarded[0].headers.get('x-plate-pantry-request-id'),
  );
  assert.deepEqual(await forwarded[1].json(), { plate: 'NYK IN 5' });
});

test('redirects legacy links to Plate Pantry with suffixes and queries intact', async () => {
  const handler = createEdgeHandler();
  const response = await handler(new Request('https://jayro.dev/nypl8/api/stats?plate=ABC'));

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get('location'),
    'https://jayro.dev/plate-pantry/api/stats?plate=ABC',
  );
});

test('does not claim unrelated portfolio paths', async () => {
  const handler = createEdgeHandler();
  const response = await handler(new Request('https://jayro.dev/about'));
  assert.equal(response.status, 404);
});
