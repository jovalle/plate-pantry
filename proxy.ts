import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const expectedSecret = process.env.PLATE_PANTRY_ORIGIN_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.next();
  }

  const providedSecret = request.headers.get('x-plate-pantry-origin-secret')?.trim();
  if (providedSecret !== expectedSecret) {
    return new NextResponse('Direct origin access is forbidden.', {
      status: 403,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
