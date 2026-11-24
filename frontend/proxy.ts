import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export function proxy(request: NextRequest) {
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
  if (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/workspace')) response.headers.set('X-Robots-Tag','noindex, nofollow');
  return response;
}
export const config = {matcher:['/((?!api/|_next/|favicon.ico|logo.svg|robots.txt|sitemap.xml).*)']};
