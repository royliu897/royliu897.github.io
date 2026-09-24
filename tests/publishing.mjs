import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authorRequest, publishedPages, articleHtml } from '../comments-worker/publishing.mjs';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const env = { GITHUB_REPO: 'owner/site', PUBLISH_BRANCH: 'main', SITE_ORIGIN: 'https://example.com',
  API_ORIGIN: 'https://comments.example.com', PAGES_JSON: '{"lennar":{"issue":1}}' };
const sha = value => createHash('sha1').update(value).digest('hex');
const blob = content => sha(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(content)}\0`), Buffer.from(content)]));
const files = new Map([
  ['writing-pages.json', '{}'], ['blog.html', readFileSync(new URL('../blog.html', import.meta.url), 'utf8')],
  ['index.html', 'Original home page'], ['write.html', 'Editor'], ['lennar.html', 'Original analysis'],
]);
const issues = [];
let pending;
let head = sha('initial');
let conflict = false;
let commits = 0;
let issuePosts = 0;
let forceSeen;
const api = {
  HttpError, input: request => request.json(),
  installationToken: async (environment, purpose) => purpose,
  async github(path, token, options = {}) {
    const body = options.body && JSON.parse(options.body);
    const url = new URL(path, 'https://api.github.com');
    const pathname = url.pathname.replace('/repos/owner/site', '');
    if (path === '/markdown') {
      assert.ok(['read', 'publish'].includes(token));
      assert.equal(options.text, true);
      return '<div class="markdown-heading"><h2>Thesis</h2></div><p>A measured idea.</p>';
    }
    if (pathname.startsWith('/contents/')) {
      const content = files.get(pathname.slice('/contents/'.length));
      if (content === undefined) throw new HttpError(404, 'Not found');
      return { content: Buffer.from(content).toString('base64'), sha: blob(content) };
    }
    if (pathname === '/git/ref/heads/main') return { object: { sha: head } };
    if (pathname.startsWith('/git/commits/') && !options.method) return { tree: { sha: 'tree-before' } };
    if (pathname === '/git/trees/tree-before') return { tree: [...files.keys()].filter(path => !path.includes('/')).map(path => ({ path })) };
    if (pathname === '/issues' && !options.method) return issues;
    if (pathname === '/issues' && options.method === 'POST') {
      issuePosts += 1;
      const issue = { ...body, number: issues.length + 10 };
      issues.push(issue);
      return issue;
    }
    if (pathname === '/git/trees' && options.method === 'POST') {
      assert.equal(body.base_tree, 'tree-before');
      assert.equal(body.tree.length, 4);
      pending = body.tree;
      return { sha: 'tree-after' };
    }
    if (pathname === '/git/commits' && options.method === 'POST') {
      assert.deepEqual(body.parents, [head]);
      assert.equal(body.tree, 'tree-after');
      commits += 1;
      return { sha: sha(String(commits)) };
    }
    if (pathname === '/git/refs/heads/main' && options.method === 'PATCH') {
      forceSeen = body.force;
      if (conflict) throw new HttpError(422, 'Not fast forward');
      pending.forEach(file => { files.set(file.path, file.content); });
      head = body.sha;
      return { object: { sha: head } };
    }
    throw new Error(`Unexpected call ${path}`);
  },
};
const draft = { title: 'A thoughtful company', slug: 'thoughtful-company', type: 'thesis', category: 'Analysis / Industry',
  subtitle: 'A better structure', summary: 'A concise investment thesis.', body: '## Thesis\n\nGrowth — with discipline.', revision: null };
const call = (path, data) => authorRequest(new Request(`https://comments.example.com/author/${path}`,
  data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }), env, api);

const preview = await (await call('preview', draft)).json();
assert.match(preview.html, /A thoughtful company/);
assert.equal(commits, 0);
assert.equal(issuePosts, 0);
const initial = await call('publish', draft);
assert.equal(initial.status, 201);
const result = await initial.json();
assert.equal(result.url, 'https://example.com/thoughtful-company.html');
assert.equal(result.revision, blob(files.get('writing/thoughtful-company.json')));
assert.equal(forceSeen, false);
assert.equal(issuePosts, 1);
assert.equal(files.get('index.html'), 'Original home page');
assert.equal(files.get('lennar.html'), 'Original analysis');
assert.match(files.get('blog.html'), /lennar.html/);
assert.match(files.get('blog.html'), /thoughtful-company.html/);
assert.match(files.get('thoughtful-company.html'), /author-update-editor/);
assert.match(files.get('thoughtful-company.html'), /reading-progress.js/);
assert.equal(JSON.parse(files.get('writing/thoughtful-company.json')).body, draft.body);
const registry = await publishedPages(env, api);
assert.equal(registry[draft.slug].issue, 10);
assert.equal(registry[draft.slug].updates, true);
const loaded = (await (await call(`pages/${draft.slug}`)).json()).draft;
assert.equal(loaded.revision, result.revision);
assert.equal((await (await call('pages')).json()).pages[draft.slug].title, draft.title);
await assert.rejects(call('publish', draft), error => error.status === 409);
await assert.rejects(call('publish', { ...draft, slug: 'index' }), error => error.status === 409);
await assert.rejects(call('publish', { ...draft, slug: 'lennar' }), error => error.status === 409);
await assert.rejects(call('publish', { ...draft, slug: '../index' }), error => error.status === 400);
await assert.rejects(call('publish', { ...draft, slug: 'constructor' }), error => error.status === 400);
await assert.rejects(call('publish', { ...draft, body: '' }), error => error.status === 400);
await assert.rejects(call('publish', { ...draft, revision: 'invalid' }), error => error.status === 400);
const update = await (await call('publish', { ...loaded, type: 'analysis', title: 'An updated view' })).json();
assert.equal(update.published, result.published);
assert.equal(issuePosts, 1);
assert.ok(!files.get('thoughtful-company.html').includes('author-update-editor'));
assert.equal(JSON.parse(files.get('writing-pages.json'))[draft.slug].updates, false);
assert.equal(files.get('blog.html').split('href="thoughtful-company.html"').length, 2);
assert.match(articleHtml({ ...draft, title: '<script>bad</script>', type: 'note' }, '<p>Safe</p>', result.published, env), /&lt;script&gt;/);
conflict = true;
const another = { ...draft, slug: 'another-company' };
await assert.rejects(call('publish', another), error => error.status === 409);
assert.equal(files.has('another-company.html'), false);
assert.equal(issuePosts, 2);
conflict = false;
await call('publish', another);
assert.equal(issuePosts, 2);
assert.equal(files.has('another-company.html'), true);
const oldIndex = files.get('blog.html');
files.set('blog.html', 'No managed markers');
await assert.rejects(call('publish', { ...draft, slug: 'bad-index' }), error => error.status === 409);
assert.equal(issuePosts, 2);
files.set('blog.html', oldIndex);
console.log('Publishing, previews, atomic commits, automatic discussions, revisions, collisions, updates and conflict recovery passed.');
