import {inquiryPayload, MAX_BODY_BYTES, validateInquiry, type InquiryInput} from './inquiry.ts';

type Environment = Readonly<Record<string, string | undefined>>;

const deliveryEndpoint = 'https://api.resend.com/emails';
const unavailable = 'The contact form is temporarily unavailable. Please contact us by email.';
const unconfirmed = 'We could not confirm delivery. Retry the same submission or contact us by email.';

function isMailbox(value: string): boolean {
  if (value.length > 254) return false;
  const [local, host, ...rest] = value.split('@');
  if (!local || !host || rest.length || local.length > 64) return false;

  // Accept dot-atom mailboxes only. Never accept display names, separators or line breaks.
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/i;
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  const labels = host.split('.');
  return local.split('.').every(part => atom.test(part)) && labels.length >= 2 && labels.every(part => label.test(part));
}

function getContactConfiguration(env: Environment) {
  const apiKey = env.RESEND_API_KEY?.trim() ?? '';
  const from = env.CONTACT_FROM?.trim() ?? '';
  const to = env.CONTACT_TO?.trim() ?? '';
  if (!apiKey || /[^\x21-\x7e]/.test(apiKey) || !isMailbox(from) || !isMailbox(to)) return null;
  return {apiKey, from, to};
}

export function isContactConfigured(env: Environment): boolean {
  return getContactConfiguration(env) !== null;
}

function response(status: number, body: {error: string} | {reference: string}) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return origin === new URL(request.url).origin && (!fetchSite || fetchSite === 'same-origin');
}

class BodyTooLargeError extends Error {}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new Error('Invalid content length');
    if (Number(length) > MAX_BODY_BYTES) throw new BodyTooLargeError();
  }
  if (!request.body) throw new Error('Missing request body');

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let bytes = 0;
  let text = '';

  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      text += decoder.decode(value, {stream: true});
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}

function emailText(input: InquiryInput, reference: string): string {
  const details = inquiryPayload(input);
  const lines = [
    'New Cedar & Cursor website inquiry',
    `Reference: ${reference}`,
    '',
    `Name: ${details.name}`,
    `Email: ${details.email}`,
    `Company: ${details.company || 'Not supplied'}`,
    'Permission to reply: confirmed on the contact form',
    '',
    'Project brief',
    details.overview,
  ];

  if (details.estimate) {
    const estimate = details.estimate;
    lines.push(
      '',
      'Project planner estimate (indicative only)',
      `Direction: ${estimate.project}`,
      `Goal: ${estimate.goal}`,
      `Stage: ${estimate.stage}`,
      `Features: ${estimate.features.join(', ') || 'None selected'}`,
      `Budget range: USD ${estimate.low}–${estimate.high}`,
    );
  }

  return lines.join('\n');
}

export async function handleContact(request: Request, env: Environment, send: typeof fetch = fetch): Promise<Response> {
  if (!isSameOrigin(request)) return response(403, {error: 'Please send the inquiry from our contact page.'});

  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') return response(415, {error: 'Invalid form format.'});

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? response(413, {error: 'The project brief is too large.'})
      : response(400, {error: 'Could not read the inquiry.'});
  }

  const inquiry = validateInquiry(body);
  if (!inquiry.ok) return response(400, {error: inquiry.error});
  if (!isMailbox(inquiry.data.email)) return response(400, {error: 'Please enter a valid email address.'});

  const config = getContactConfiguration(env);
  if (!config) return response(503, {error: unavailable});

  const reference = `CC-${inquiry.data.requestId.toUpperCase()}`;
  try {
    const result = await send(deliveryEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `website-inquiry/${inquiry.data.requestId}`,
      },
      body: JSON.stringify({
        from: `Cedar & Cursor <${config.from}>`,
        to: [config.to],
        reply_to: inquiry.data.email,
        subject: `Website inquiry ${reference}`,
        text: emailText(inquiry.data, reference),
      }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      cache: 'no-store',
    });

    if (!result.ok) {
      console.warn('Contact delivery rejected by provider', {reference, status: result.status});
      return response(503, {error: unconfirmed});
    }

    const accepted = await result.json() as {id?: unknown} | null;
    if (typeof accepted?.id !== 'string' || !accepted.id.trim()) {
      console.warn('Contact delivery response missing receipt', {reference});
      return response(503, {error: unconfirmed});
    }
    return response(201, {reference});
  } catch {
    console.warn('Contact delivery could not be confirmed', {reference});
    return response(503, {error: unconfirmed});
  }
}
