import assert from 'node:assert/strict';
import test from 'node:test';
import {handleContact, isContactConfigured} from '../lib/contact-delivery.ts';
import {MAX_BODY_BYTES} from '../lib/inquiry.ts';

const origin = 'https://cedarandcursor.com';
const env = {
  RESEND_API_KEY: 're_example_test',
  CONTACT_FROM: 'website@notify.cedarandcursor.com',
  CONTACT_TO: 'jun@cedarandcursor.com',
};
const input = {
  requestId: '69cc219c-c752-48a3-995c-198ac84efeab',
  name: 'Sample Customer',
  email: 'Customer@example.org',
  company: 'Sample Organization',
  overview: 'A new website with a publishing workflow.',
  consent: true,
  website: '',
  discovery: null,
};

function request(body = input, overrides = {}) {
  return new Request(`${origin}/api/inquiries`, {
    method: 'POST',
    headers: {origin, 'content-type': 'application/json; charset=utf-8', ...overrides},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function mustNotSend() {
  assert.fail('Invalid or unavailable submission reached the email provider');
}

test('sends the verified sender and fixed recipient, with scoped reply and recalculated estimate', async () => {
  const payload = {
    ...input,
    discovery: {type: 'website', goal: 'launch', stage: 'ready', features: ['cms']},
    to: ['different@example.org'],
    estimate: {low: 1, high: 2},
  };
  const keys = [];
  const fakeSend = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${env.RESEND_API_KEY}`);
    keys.push(new Headers(init.headers).get('idempotency-key'));
    const mail = JSON.parse(init.body);
    assert.equal(mail.from, `Cedar & Cursor <${env.CONTACT_FROM}>`);
    assert.deepEqual(mail.to, [env.CONTACT_TO]);
    assert.equal(mail.reply_to, 'customer@example.org');
    assert.match(mail.subject, /^Website inquiry CC-/);
    assert.ok(mail.text.includes(input.overview));
    assert.match(mail.text, /Budget range: USD 900–1250/);
    assert.ok(!Object.hasOwn(mail, 'html'));
    return Response.json({id: '5be696fe-f325-426c-997f-3d4f5f84f8d4'});
  };

  const first = await handleContact(request(payload), env, fakeSend);
  const retry = await handleContact(request(payload), env, fakeSend);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const expectedReceipt = {reference: `CC-${input.requestId.toUpperCase()}`};
  assert.deepEqual(await first.json(), expectedReceipt);
  assert.deepEqual(await retry.json(), expectedReceipt);
  assert.deepEqual(keys, [`website-inquiry/${input.requestId}`, `website-inquiry/${input.requestId}`]);
});

test('rejects cross-origin requests, non-JSON bodies, bot trap input, and invalid reply mailboxes', async () => {
  const cases = [
    [request(input, {origin: 'https://another.example.org'}), 403],
    [request(input, {origin: 'null'}), 403],
    [request(input, {'sec-fetch-site': 'same-site'}), 403],
    [request(input, {'content-type': 'text/plain'}), 415],
    [request({...input, website: 'https://bot.example.org'}), 400],
    [request({...input, consent: false}), 400],
    [request({...input, email: 'person@example.org,'}), 400],
    [request({...input, email: 'person@example.org\r\nBcc: someone@example.org'}), 400],
    [request('{'), 400],
  ];
  let calls = 0;
  const fakeSend = async () => {
    calls += 1;
    return Response.json({id: 'unexpected'});
  };
  for (const [req, status] of cases) {
    assert.equal((await handleContact(req, env, fakeSend)).status, status);
  }
  assert.equal(calls, 0);
});

test('limits declared length and bytes actually read, including multibyte form text', async () => {
  const headerOverLimit = request(input, {'content-length': String(MAX_BODY_BYTES + 1)});
  const bodyOverLimit = request({...input, overview: '字'.repeat(MAX_BODY_BYTES / 3 + 1)});
  assert.equal((await handleContact(headerOverLimit, env, mustNotSend)).status, 413);
  assert.equal((await handleContact(bodyOverLimit, env, mustNotSend)).status, 413);
});

test('missing or invalid configuration stays unavailable without sending', async () => {
  const invalidConfig = {...env, CONTACT_TO: 'jun@cedarandcursor.com,a@example.org'};
  assert.equal(isContactConfigured(env), true);
  assert.equal(isContactConfigured({}), false);
  assert.equal(isContactConfigured(invalidConfig), false);
  assert.equal((await handleContact(request(), {}, mustNotSend)).status, 503);
  assert.equal((await handleContact(request(), invalidConfig, mustNotSend)).status, 503);
});

test('never reports success or exposes provider details on rejection, timeout or an invalid receipt', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const fakeSend of [
    async () => Response.json({name: 'validation_error', message: 'very private provider detail'}, {status: 403}),
    async () => Response.json({}),
    async () => { throw new Error('very private provider detail'); },
  ]) {
    const result = await handleContact(request(), env, fakeSend);
    assert.equal(result.status, 503);
    const body = await result.json();
    assert.equal(Object.hasOwn(body, 'reference'), false);
    assert.match(body.error, /could not confirm delivery/i);
    assert.ok(!body.error.includes('private'));
  }
});
