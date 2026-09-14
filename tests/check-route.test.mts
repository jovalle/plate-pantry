import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCheckHandler } from '../lib/check-handler.ts';
import { createPlateStatsStore } from '../lib/plate-stats.ts';

test('records successful API checks as public aggregate stats', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'plate-pantry-check-route-'));
  const timestamps = ['2026-08-02T12:00:00.000Z', '2026-08-02T13:00:00.000Z'];
  let requestCount = 0;
  const store = createPlateStatsStore(directory);

  const fetchBackend: typeof fetch = async () =>
    Response.json({
      plate: 'ABC 123',
      status: 'available',
      message: 'Available when checked with NY DMV.',
      checkedAt: timestamps[requestCount++],
    });
  context.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const POST = createCheckHandler({
    backendUrl: new URL('http://backend.test/api/check'),
    fetchBackend,
    recordLookup: store.record,
  });
  const request = () =>
    new Request('http://localhost/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plate: 'abc 123' }),
    });

  const first = await POST(request());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    plate: 'ABC 123',
    status: 'available',
    message: 'Available when checked with NY DMV.',
    checkedAt: timestamps[0],
    lookupCount: 1,
  });

  const second = await POST(request());
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), {
    plate: 'ABC 123',
    status: 'available',
    message: 'Available when checked with NY DMV.',
    checkedAt: timestamps[1],
    lookupCount: 2,
  });

  const persisted = JSON.parse(await readFile(join(directory, 'plate-stats.json'), 'utf8'));
  assert.equal(persisted['ABC 123'].lookupCount, 2);
  assert.equal(persisted['ABC 123'].status, 'available');
  assert.equal(persisted['ABC 123'].message, 'Available when checked with NY DMV.');
});

test('coalesces repeated edge attempts with the same request ID', async () => {
  let backendRequests = 0;
  let recordedLookups = 0;
  const POST = createCheckHandler({
    backendUrl: new URL('http://backend.test/api/check'),
    fetchBackend: async () => {
      backendRequests += 1;
      return Response.json({
        plate: 'NYK IN 5',
        status: 'unavailable',
        message: 'Not available according to NY DMV.',
        checkedAt: '2026-08-11T00:00:00.000Z',
      });
    },
    recordLookup: async (plate, result) => {
      recordedLookups += 1;
      return { plate, lookupCount: recordedLookups, ...result };
    },
  });
  const request = () =>
    new Request('http://localhost/api/check', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-plate-pantry-request-id': '3e8ca6c5-e342-4e0b-9a42-bf1f8d84c7de',
      },
      body: JSON.stringify({ plate: 'NYK IN 5' }),
    });

  const [first, retry] = await Promise.all([POST(request()), POST(request())]);

  assert.deepEqual(await first.json(), await retry.json());
  assert.equal(backendRequests, 1);
  assert.equal(recordedLookups, 1);
});

test('rate limits requests exceeding the allowed threshold per IP', async () => {
  let backendRequests = 0;
  const POST = createCheckHandler({
    backendUrl: new URL('http://backend.test/api/check'),
    fetchBackend: async () => {
      backendRequests += 1;
      return Response.json({
        plate: 'TEST',
        status: 'available',
        message: 'Available.',
        checkedAt: '2026-08-11T00:00:00.000Z',
      });
    },
    recordLookup: async (plate, result) => ({ plate, lookupCount: 1, ...result }),
    rateLimitMaxRequests: 2,
    rateLimitWindowMs: 60_000,
  });

  const request = (ip: string) =>
    new Request('http://localhost/api/check', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ip,
      },
      body: JSON.stringify({ plate: 'TEST' }),
    });

  const res1 = await POST(request('198.51.100.1'));
  assert.equal(res1.status, 200);

  const res2 = await POST(request('198.51.100.1'));
  assert.equal(res2.status, 200);

  const res3 = await POST(request('198.51.100.1'));
  assert.equal(res3.status, 429);
  assert.equal(res3.headers.has('retry-after'), true);
  const body3 = (await res3.json()) as { status: string; message: string };
  assert.equal(body3.status, 'error');
  assert.match(body3.message, /Too many/);

  // Different IP is not blocked
  const resOther = await POST(request('198.51.100.2'));
  assert.equal(resOther.status, 200);
  assert.equal(backendRequests, 3);
});
