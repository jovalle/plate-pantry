const defaultUrl = process.env.PLATE_PANTRY_PUBLIC_ORIGIN
  ? `${process.env.PLATE_PANTRY_PUBLIC_ORIGIN.replace(/\/$/, '')}/plate-pantry`
  : 'https://jayro.dev/plate-pantry';
const siteUrl = new URL(process.env.PLATE_PANTRY_VERIFY_URL ?? defaultUrl);
const verifyEdge = process.env.PLATE_PANTRY_VERIFY_EDGE !== '0';
const expectedRevision = process.env.EXPECTED_REVISION;
const expectedSsrOrigin = process.env.EXPECTED_SSR_ORIGIN;
const attempts = Number(process.env.VERIFY_ATTEMPTS ?? 36);

async function verify() {
  const headers = process.env.PLATE_PANTRY_ORIGIN_SECRET
    ? { 'x-plate-pantry-origin-secret': process.env.PLATE_PANTRY_ORIGIN_SECRET }
    : {};

  const page = await fetch(siteUrl, {
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const html = await page.text();

  if (page.status !== 200) throw new Error(`page returned ${page.status}`);
  if (!html.includes('Plate Pantry')) throw new Error('page does not contain Plate Pantry');
  if (!page.headers.get('x-plate-pantry-ssr-origin')) {
    throw new Error('origin identity header is missing');
  }
  if (expectedSsrOrigin && page.headers.get('x-plate-pantry-ssr-origin') !== expectedSsrOrigin) {
    throw new Error(
      `expected SSR origin ${expectedSsrOrigin}, got ${page.headers.get('x-plate-pantry-ssr-origin')}`,
    );
  }
  if (expectedRevision && page.headers.get('x-plate-pantry-revision') !== expectedRevision) {
    throw new Error('the expected revision is not live yet');
  }
  if (verifyEdge && page.headers.get('x-plate-pantry-edge-relay') !== 'cloudflare-worker') {
    throw new Error('edge relay header is missing');
  }

  const statsUrl = new URL(`${siteUrl.pathname}/api/stats?plate=NYK%20IN%205`, siteUrl);
  const stats = await fetch(statsUrl, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!stats.ok) throw new Error(`public stats returned ${stats.status}`);
  const payload = await stats.json();
  if (payload.plate !== 'NYK IN 5' || !Number.isFinite(payload.lookupCount)) {
    throw new Error('public stats returned an invalid payload');
  }

  if (verifyEdge) {
    const legacyUrl = new URL('/nypl8', siteUrl);
    const legacy = await fetch(legacyUrl, { redirect: 'manual' });
    if (
      legacy.status !== 308 ||
      new URL(legacy.headers.get('location')).pathname !== siteUrl.pathname
    ) {
      throw new Error('legacy URL does not redirect to Plate Pantry');
    }
  }
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await verify();
    console.log(`Verified ${siteUrl}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

throw lastError;
