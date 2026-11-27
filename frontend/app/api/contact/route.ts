import { handleContact } from '@/lib/contact-delivery';
import { publicOnly } from '@/lib/deployment';

export const runtime = 'nodejs';
export const maxDuration = 15;

export function POST(request: Request) {
  if (!publicOnly) return new Response(null, { status: 404 });
  return handleContact(request, process.env);
}
