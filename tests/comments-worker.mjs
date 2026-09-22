import assert from 'node:assert/strict';
import worker from '../comments-worker/worker.mjs';

const env = {
  SITE_ORIGIN: 'https://royrliu.com', API_ORIGIN: 'https://comments.royrliu.com',
  GITHUB_REPO: 'royliu897/royliu897.github.io', AUTHOR_ID: '124701324',
  PAGES_JSON: JSON.stringify({ lennar: { issue: 1, updates: true }, 'lennar-full': { issue: 2, updates: false } }),
  GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret',
  SESSION_SECRET: 'a-test-only-secret-with-at-least-32-characters',
};
const users = { author: { id: 124701324, login: 'royliu897' }, reader: { id: 42, login: 'reader' } };
const comments = new Map();
let counter = 10;
let writes = 0;
let failGithub = false;

globalThis.fetch = async (url, options = {}) => {
  if (url === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(options.body);
    assert.ok(body.code_verifier);
    assert.equal(body.client_secret, env.GITHUB_CLIENT_SECRET);
    return Response.json({ access_token: body.code, expires_in: 28800 });
  }
  assert.ok(url.startsWith('https://api.github.com/'));
  if (failGithub) return Response.json({}, { status: 403 });
  const token = options.headers.Authorization?.replace('Bearer ', '');
  if (url.endsWith('/user')) return users[token] ? Response.json(users[token]) : Response.json({}, { status: 401 });
  const pathname = new URL(url).pathname;
  const existing = pathname.match(/\/issues\/comments\/(\d+)$/);
  if (existing) {
    const comment = comments.get(Number(existing[1]));
    if (!comment) return Response.json({}, { status: 404 });
    if (options.method === 'PATCH') {
      writes += 1;
      Object.assign(comment, JSON.parse(options.body), { updated_at: '2026-09-22T13:01:00Z' });
    }
    return Response.json(comment);
  }
  const thread = pathname.match(/\/issues\/(\d+)\/comments$/);
  assert.ok(thread, pathname);
  if (options.method === 'POST') {
    writes += 1;
    const body = JSON.parse(options.body).body;
    const comment = { id: counter++, body, body_html: `<p>${body}</p>`, user: users[token],
      issue_url: `https://api.github.com/repos/${env.GITHUB_REPO}/issues/${thread[1]}`,
      created_at: '2026-09-22T12:00:00Z', updated_at: '2026-09-22T12:00:00Z',
      html_url: `https://github.com/${env.GITHUB_REPO}/issues/${thread[1]}` };
    comments.set(comment.id, comment);
    return Response.json(comment, { status: 201 });
  }
  return Response.json([...comments.values()].filter(comment => comment.issue_url.endsWith(`/issues/${thread[1]}`)));
};

function call(path, options = {}) {
  return worker.fetch(new Request(`${env.API_ORIGIN}${path}`, options), env);
}

function mutation(session, body, method = 'POST', origin = env.SITE_ORIGIN) {
  return { method, headers: { Origin: origin, Cookie: session || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body) };
}

async function login(identity) {
  const start = await call('/auth/login?page=lennar');
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get('Location'));
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('scope'), 'public_repo');
  const saved = start.headers.get('Set-Cookie').split(';')[0];
  assert.ok(!saved.includes('verifier'));
  const invalid = await call('/auth/callback?code=author&state=wrong', { headers: { Cookie: saved } });
  assert.equal(invalid.status, 400);
  const callback = await call(`/auth/callback?code=${identity}&state=${authorization.searchParams.get('state')}`,
    { headers: { Cookie: saved } });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('Location'), `${env.SITE_ORIGIN}/lennar.html#comments-heading`);
  const cookies = callback.headers.getSetCookie();
  const session = cookies.find(value => value.startsWith('__Host-writing-session='));
  assert.ok(session.includes('HttpOnly; Secure; SameSite=Lax'));
  return session.split(';')[0];
}

const author = await login('author');
const reader = await login('reader');
const notConfigured = await worker.fetch(new Request(`${env.API_ORIGIN}/session`), { ...env, GITHUB_CLIENT_SECRET: '' });
assert.equal(notConfigured.status, 503);
const preflight = await call('/pages/lennar/comments', { method: 'OPTIONS', headers: { Origin: env.SITE_ORIGIN } });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
const foreignPreflight = await call('/pages/lennar/comments', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } });
assert.equal(foreignPreflight.status, 403);
assert.equal(foreignPreflight.headers.get('Access-Control-Allow-Origin'), null);
const session = await call('/session', { headers: { Cookie: author, Origin: env.SITE_ORIGIN } });
assert.deepEqual((await session.json()).user, { ...users.author, isAuthor: true });
assert.equal(session.headers.get('Access-Control-Allow-Origin'), env.SITE_ORIGIN);
assert.equal(session.headers.get('Cache-Control'), 'no-store');
const badCookie = await call('/session', { headers: { Cookie: author + 'tampered' } });
assert.equal((await badCookie.json()).user, null);
const actualNow = Date.now;
Date.now = () => actualNow() + 9 * 3600000;
const expired = await call('/session', { headers: { Cookie: author } });
assert.equal((await expired.json()).user, null);
Date.now = actualNow;
assert.equal((await call('/auth/login?page=https://evil.test')).status, 404);
assert.equal((await call('/auth/callback?code=author&state=missing')).status, 400);
assert.equal((await call('/pages/lennar/comments', mutation(null, { body: 'Test', kind: 'comment' }))).status, 401);
assert.equal((await call('/pages/lennar/comments', mutation(reader, { body: 'Trade', kind: 'update' }))).status, 403);
assert.equal((await call('/pages/lennar-full/comments', mutation(author, { body: 'Trade', kind: 'update' }))).status, 403);
assert.equal((await call('/pages/lennar/comments', mutation(author, { body: 'Trade', kind: 'update' }, 'POST', 'https://evil.test'))).status, 403);
assert.equal((await call('/pages/lennar/comments', mutation(reader, { body: '[update]\nFake', kind: 'comment' }))).status, 400);
assert.equal(writes, 0);
const tradeResponse = await call('/pages/lennar/comments', mutation(author, { body: 'Bought 10 shares @ $76.43', kind: 'update' }));
assert.equal(tradeResponse.status, 201);
const trade = (await tradeResponse.json()).comment;
assert.equal(trade.kind, 'update');
assert.equal(trade.body, '[update]\nBought 10 shares @ $76.43');
const readerResponse = await call('/pages/lennar/comments', mutation(reader, { body: 'A question', kind: 'comment' }));
const message = (await readerResponse.json()).comment;
assert.equal((await call(`/pages/lennar/comments/${trade.id}`, mutation(reader, { body: 'Hijacked' }, 'PATCH'))).status, 403);
assert.equal((await call(`/pages/lennar/comments/${message.id}`, mutation(author, { body: 'Hijacked' }, 'PATCH'))).status, 403);
assert.equal((await call(`/pages/lennar-full/comments/${message.id}`, mutation(reader, { body: 'Wrong thread' }, 'PATCH'))).status, 403);
const edit = await call(`/pages/lennar/comments/${message.id}`, mutation(reader, { body: 'Edited question' }, 'PATCH'));
assert.equal(edit.status, 200);
assert.equal((await edit.json()).comment.created_at, '2026-09-22T12:00:00Z');
const tradeEdit = await call(`/pages/lennar/comments/${trade.id}`, mutation(author, { body: 'Bought 12 shares' }, 'PATCH'));
assert.equal((await tradeEdit.json()).comment.kind, 'update');
assert.equal((await call('/pages/lennar/comments', mutation(reader, { body: ' ', kind: 'comment' }))).status, 400);
assert.equal((await call('/pages/lennar/comments', mutation(reader, { body: 'x'.repeat(10001), kind: 'comment' }))).status, 400);
assert.equal((await call('/pages/lennar/comments', mutation(reader, { body: 'x'.repeat(64001), kind: 'comment' }))).status, 413);
const wrongType = mutation(reader, { body: 'Test', kind: 'comment' });
wrongType.headers['Content-Type'] = 'text/plain';
assert.equal((await call('/pages/lennar/comments', wrongType)).status, 415);
const publicList = await call('/pages/lennar/comments');
assert.equal((await publicList.json()).comments.length, 2);
failGithub = true;
assert.equal((await call('/pages/lennar/comments')).status, 429);
failGithub = false;
const logout = await call('/auth/logout', mutation(reader, {}));
assert.ok(logout.headers.get('Set-Cookie').includes('Max-Age=0'));
console.log('Worker OAuth, cookies, CORS, author permissions, editing, and input checks passed.');
