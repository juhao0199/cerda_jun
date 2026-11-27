import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { publicOnly } from './lib/deployment';
import { isPreview } from './lib/site';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicOnly && /^\/(login|workspace|preview|internal)(?:\/|$)/i.test(path)) {
    return new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } });
  }
  const nonce = randomBytes(24).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';
  const csp = ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "img-src 'self' data: blob:", "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`, "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  headers.set('x-nonce', nonce);
  const response = NextResponse.next({request:{headers}});
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store, private');
  if (isPreview() || /^\/(login|workspace|preview)(?:\/|$)/i.test(path)) response.headers.set('X-Robots-Tag','noindex, nofollow');
  return response;
}
export const config = {matcher:['/((?!api/|_next/|favicon.ico|logo.svg|robots.txt|sitemap.xml|fonts/|published-media/|share.png).*)']};
