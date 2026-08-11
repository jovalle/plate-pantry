import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV === 'development';
const basePath =
  process.env.NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH ?? process.env.NEXT_PUBLIC_NYPL8_BASE_PATH ?? '';

if (basePath && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
  throw new Error('The public base path must start with / and must not end with /.');
}

const revision = process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? 'local';
const ssrOrigin = process.env.PLATE_PANTRY_SSR_ORIGIN ?? process.env.NYPL8_SSR_ORIGIN ?? 'local';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Plate-Pantry-Revision', value: revision },
  { key: 'X-Plate-Pantry-SSR-Origin', value: ssrOrigin },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "img-src 'self' data:",
      `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${isDevelopment ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "connect-src 'self' https://cloudflareinsights.com",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  basePath,
  images: {
    deviceSizes: [320, 384, 640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 112, 128, 192, 256, 384, 512],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
