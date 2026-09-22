const sessionCookie = '__Host-writing-session';
const stateCookie = '__Host-writing-state';
const updateMarker = /^\[update\]\s*(?:\r?\n|$)/i;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
}

async function key(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'Sign-in is not configured yet.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SESSION_SECRET));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(value, purpose, env) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
    additionalData: new TextEncoder().encode(purpose) }, await key(env),
  new TextEncoder().encode(JSON.stringify(value)));
  return `${encode(nonce)}.${encode(encrypted)}`;
}

async function readCookie(request, name, env) {
  const entry = (request.headers.get('Cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    const [nonce, encrypted] = entry.slice(name.length + 1).split('.');
    const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(nonce),
      additionalData: new TextEncoder().encode(name) }, await key(env), decode(encrypted));
    const value = JSON.parse(new TextDecoder().decode(decoded));
    return value.expires > Date.now() ? value : null;
  } catch {
    return null;
  }
}

function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function pageConfig(slug, env) {
  const pages = JSON.parse(env.PAGES_JSON);
  if (!Object.hasOwn(pages, slug)) throw new HttpError(404, 'Article not found.');
  return pages[slug];
}

async function github(path, token, options = {}) {
  const headers = { Accept: 'application/vnd.github.full+json',
    'User-Agent': 'roy-writing-comments', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401) throw new HttpError(401, 'Please sign in again.');
    if (response.status === 403 || response.status === 429) {
      throw new HttpError(429, 'GitHub could not accept this request. Check your access or try again shortly.');
    }
    if (response.status === 404) throw new HttpError(404, 'The discussion or comment could not be found.');
    if (response.status === 422) throw new HttpError(422, 'GitHub could not save this message. Check the text and try again.');
    throw new HttpError(502, 'GitHub is unavailable. Please try again.');
  }
  return response.json();
}

function publicUser(user, env) {
  return { id: user.id, login: user.login, isAuthor: user.id === Number(env.AUTHOR_ID) };
}

function isUpdate(comment, page, env) {
  return page.updates && comment.user?.id === Number(env.AUTHOR_ID) && updateMarker.test(comment.body || '');
}

function publicComment(comment, page, env) {
  return { id: comment.id, user: comment.user ? { id: comment.user.id, login: comment.user.login } : null,
    body: comment.body || '', body_html: comment.body_html || '',
    created_at: comment.created_at, updated_at: comment.updated_at, html_url: comment.html_url,
    kind: isUpdate(comment, page, env) ? 'update' : 'comment' };
}

async function input(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw new HttpError(415, 'Expected JSON.');
  }
  if (Number(request.headers.get('Content-Length')) > 64000) throw new HttpError(413, 'Message too long.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing message.');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 64000) {
      await reader.cancel();
      throw new HttpError(413, 'Message too long.');
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid request.'); }
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (url.origin !== env.API_ORIGIN) throw new HttpError(403, 'Unexpected host.');
  if (request.method === 'OPTIONS') {
    if (request.headers.get('Origin') !== env.SITE_ORIGIN) throw new HttpError(403, 'Origin not allowed.');
    return new Response(null, { status: 204 });
  }
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== env.SITE_ORIGIN) {
    throw new HttpError(403, 'Origin not allowed.');
  }
  if (path === '/auth/login' && request.method === 'GET') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new HttpError(503, 'Sign-in is not configured yet.');
    const slug = url.searchParams.get('page') || 'lennar';
    pageConfig(slug, env);
    const state = encode(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const authorization = new URL('https://github.com/login/oauth/authorize');
    authorization.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${env.API_ORIGIN}/auth/callback`, scope: 'public_repo', state,
      code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    const saved = await seal({ state, verifier, slug, expires: Date.now() + 600000 }, stateCookie, env);
    return new Response(null, { status: 302, headers: { Location: authorization.href,
      'Set-Cookie': cookie(stateCookie, saved, 600) } });
  }
  if (path === '/auth/callback' && request.method === 'GET') {
    const saved = await readCookie(request, stateCookie, env);
    if (!saved || url.searchParams.get('state') !== saved.state) throw new HttpError(400, 'Sign-in expired or could not be verified. Start again from the article.');
    const clearState = cookie(stateCookie, '', 0);
    const destination = `${env.SITE_ORIGIN}/${saved.slug}.html#comments-heading`;
    if (url.searchParams.has('error')) return new Response(null, { status: 302,
      headers: { Location: destination, 'Set-Cookie': clearState } });
    const code = url.searchParams.get('code');
    if (!code) throw new HttpError(400, 'Missing authorization code.');
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
        code, code_verifier: saved.verifier, redirect_uri: `${env.API_ORIGIN}/auth/callback` }),
    });
    const token = await response.json();
    if (!response.ok || !token.access_token) throw new HttpError(401, 'GitHub sign-in failed. Please try again.');
    const user = await github('/user', token.access_token);
    const seconds = Math.min(28800, Number(token.expires_in) || 28800);
    const savedSession = await seal({ token: token.access_token, user: { id: user.id, login: user.login },
      expires: Date.now() + seconds * 1000 }, sessionCookie, env);
    const headers = new Headers({ Location: destination });
    headers.append('Set-Cookie', clearState);
    headers.append('Set-Cookie', cookie(sessionCookie, savedSession, seconds));
    return new Response(null, { status: 302, headers });
  }
  const session = await readCookie(request, sessionCookie, env);
  if (path === '/session' && request.method === 'GET') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      throw new HttpError(503, 'Sign-in is not configured yet.');
    }
    const user = session ? await github('/user', session.token) : null;
    return json({ user: user ? publicUser(user, env) : null });
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    return new Response('{}', { headers: { 'Content-Type': 'application/json',
      'Set-Cookie': cookie(sessionCookie, '', 0) } });
  }
  const match = path.match(/^\/pages\/([a-z0-9-]+)\/comments(?:\/(\d+))?$/);
  if (!match) throw new HttpError(404, 'Not found.');
  const page = pageConfig(match[1], env);
  const base = `/repos/${env.GITHUB_REPO}`;
  if (request.method === 'GET' && !match[2]) {
    if (!page.issue) return json({ comments: [] });
    const number = Number(url.searchParams.get('page') || 1);
    if (!Number.isInteger(number) || number < 1 || number > 100) throw new HttpError(400, 'Invalid page.');
    const comments = await github(`${base}/issues/${page.issue}/comments?per_page=100&page=${number}`, session?.token);
    return json({ comments: comments.filter(comment => !comment.minimized).map(comment => publicComment(comment, page, env)),
      nextPage: comments.length === 100 && number < 100 ? number + 1 : null });
  }
  if (!session) throw new HttpError(401, 'Sign in with GitHub to post.');
  if (!page.issue) throw new HttpError(503, 'This discussion is not ready for posting yet.');
  const user = await github('/user', session.token);
  const data = await input(request);
  if (typeof data.body !== 'string' || !data.body.trim() || data.body.length > 10000) {
    throw new HttpError(400, 'Enter a message between 1 and 10,000 characters.');
  }
  let kind = data.kind;
  if (request.method === 'PATCH' && match[2]) {
    const existing = await github(`${base}/issues/comments/${match[2]}`, session.token);
    if (existing.issue_url !== `https://api.github.com${base}/issues/${page.issue}` || existing.user?.id !== user.id) {
      throw new HttpError(403, 'You can only edit your own messages in this discussion.');
    }
    kind = isUpdate(existing, page, env) ? 'update' : 'comment';
  } else if (request.method !== 'POST' || match[2]) {
    throw new HttpError(405, 'Method not allowed.');
  }
  if (!['comment', 'update'].includes(kind)) throw new HttpError(400, 'Invalid message type.');
  if (kind === 'update' && (!page.updates || user.id !== Number(env.AUTHOR_ID))) {
    throw new HttpError(403, 'Only the author can post trade updates on the short thesis.');
  }
  if (kind === 'comment' && updateMarker.test(data.body)) throw new HttpError(400, 'Use the author update form for trade updates.');
  const body = kind === 'update' ? `[update]\n${data.body.trim()}` : data.body.trim();
  const endpoint = match[2] ? `${base}/issues/comments/${match[2]}` : `${base}/issues/${page.issue}/comments`;
  const comment = await github(endpoint, session.token, { method: request.method, body: JSON.stringify({ body }) });
  return json({ comment: publicComment(comment, page, env) }, match[2] ? 200 : 201);
}

export default {
  async fetch(request, env) {
    let response;
    try { response = await handle(request, env); }
    catch (error) { response = json({ error: error instanceof HttpError ? error.message : 'The service is temporarily unavailable.' }, error.status || 500); }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Vary', 'Origin');
    if (request.headers.get('Origin') === env.SITE_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', env.SITE_ORIGIN);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
