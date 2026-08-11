import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('ships the self-hosted plate dashboard with browser-local persistence', async () => {
  const [page, layout] = await Promise.all([read('app/page.tsx'), read('app/layout.tsx')]);

  assert.match(page, /Plate Pantry/);
  assert.match(page, /value: 'NYK IN 5'/);
  assert.match(page, /plate-pantry:v1/);
  assert.match(page, /appPath\('\/api\/check'\)/);
  assert.match(page, /appPath\(`\/api\/stats\?plate=/);
  assert.doesNotMatch(page, /\/api\/plates/);
  assert.match(page, /window\.localStorage\.getItem/);
  assert.match(page, /window\.localStorage\.setItem/);
  assert.match(page, /AbortSignal\.timeout\(45_000\)/);
  assert.doesNotMatch(page, /checkMany/);
  assert.match(page, /useState<SavedPlate\[\]>\(\[\]\)/);
  assert.match(page, /Loading saved plate lookups/);
  assert.match(page, /aria-invalid/);
  assert.match(page, /aria-busy/);
  assert.match(
    page,
    /Plate buckets stay in this browser\. Lookup counts, query dates, and latest statuses/,
  );

  assert.match(layout, /Plate Pantry/);
  assert.match(layout, /\/ny-state-symbol\.png/);
  assert.match(layout, /PLATE_PANTRY/);
});

test('runs entirely on the local stack: public stats plus native DMV lookup', async () => {
  const [checkRoute, checkHandler, statsRoute, statsStore, dmvRequest, backendPackage] =
    await Promise.all([
      read('app/api/check/route.ts'),
      read('lib/check-handler.ts'),
      read('app/api/stats/route.ts'),
      read('lib/plate-stats.ts'),
      read('backend/dmv-request.mjs'),
      read('backend/package.json'),
    ]);

  assert.match(checkRoute, /DMV_BACKEND_URL/);
  assert.match(checkHandler, /cache-control/);
  assert.match(checkRoute, /recordPlateLookup/);
  assert.match(statsRoute, /getPlateStats/);
  assert.doesNotMatch(statsRoute, /export async function (POST|PUT|DELETE)/);
  assert.match(statsStore, /plate-stats\.json/);
  assert.match(dmvRequest, /createSession/);
  assert.match(dmvRequest, /DMV_PROXY_REQUIRED/);
  assert.match(dmvRequest, /redirect: 'manual'/);
  assert.match(dmvRequest, /session\.close/);
  assert.match(dmvRequest, /txtPlateNum/);
  assert.doesNotMatch(dmvRequest, /playwright|puppeteer|chromium\.launch/);
  assert.match(backendPackage, /"wreq-js": "2\.3\.1"/);
});

test('serves hardened document headers from Next.js', async () => {
  const config = await read('next.config.ts');
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /https:\/\/static\.cloudflareinsights\.com/);
  assert.match(config, /https:\/\/cloudflareinsights\.com/);
});

test('keeps plate entry accessible and renders supplied artwork', async () => {
  const [page, layout, validation, css] = await Promise.all([
    read('app/page.tsx'),
    read('app/layout.tsx'),
    read('lib/plate-validation.ts'),
    read('app/globals.css'),
  ]);

  assert.doesNotMatch(validation.match(/normalizePlateDraft[\s\S]*?\n\}/)?.[0] ?? '', /trim\(/);
  assert.match(page, /\/ny-excelsior-base\.png/);
  assert.match(layout, /\$\{basePath\}\/fonts\/license-plate-usa\.ttf/);
  assert.doesNotMatch(css, /url\('\/fonts\/license-plate-usa\.ttf'\)/);
  assert.match(css, /\.plate-registration-pixels/);
  assert.match(page, /<canvas/);
  assert.match(page, /stateSymbolCenterY = registrationCenterY/);
  assert.match(page, /actualBoundingBoxAscent/);
  assert.match(page, /Lookups/);
  assert.match(page, /Last queried/);
  assert.doesNotMatch(page, /Prior query/);
  assert.match(css, /\.lookup-stat-last-query/);
  assert.match(page, /Confirm removal of/);
  assert.match(page, /cancelOnPointerAway/);
  assert.match(page, /cancelOnEscape/);
  assert.match(page, /enterKeyHint="search"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  await access(new URL('public/ny-excelsior-base.png', root));
  await access(new URL('public/ny-state-symbol.png', root));
  await access(new URL('public/fonts/license-plate-usa.ttf', root));

  const artwork = await sharp(fileURLToPath(new URL('public/ny-excelsior-base.png', root)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const centerAlpha = artwork.data[(171 * artwork.info.width + 330) * artwork.info.channels + 3];
  assert.equal(artwork.data[3], 0, 'plate artwork corners should be transparent');
  assert.equal(centerAlpha, 255, 'the physical plate should remain opaque');
});
