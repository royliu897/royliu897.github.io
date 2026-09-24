const manifestPath = 'writing-pages.json';
const entryStart = '<!-- published-posts:start -->';
const entryEnd = '<!-- published-posts:end -->';

function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function decodeContent(file) {
  return new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), character => character.charCodeAt(0)));
}

async function blobHash(content) {
  const bytes = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const buffer = new Uint8Array(header.length + bytes.length);
  buffer.set(header);
  buffer.set(bytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readFile(path, reference, env, api, token) {
  return api.github(`/repos/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(reference)}`, token);
}

export async function publishedPages(env, api, reference = env.PUBLISH_BRANCH || 'main', token) {
  const file = await readFile(manifestPath, reference, env, api, token || await api.installationToken(env, 'read'));
  const pages = JSON.parse(decodeContent(file));
  if (!pages || Array.isArray(pages) || typeof pages !== 'object') throw new api.HttpError(503, 'The writing index needs attention.');
  return pages;
}

function validate(data, api) {
  if (!data || typeof data !== 'object') throw new api.HttpError(400, 'Enter a page.');
  const limits = { slug: 80, title: 140, category: 80, subtitle: 240, summary: 500, body: 150000 };
  const draft = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof data[field] !== 'string' || data[field].length > limit) throw new api.HttpError(400, `Check the ${field} field.`);
    draft[field] = data[field].trim();
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) ||
      ['__proto__', 'constructor', 'prototype'].includes(draft.slug)) throw new api.HttpError(400, 'Use lowercase letters, numbers and hyphens for the page address.');
  if (!draft.title || !draft.summary || !draft.body) throw new api.HttpError(400, 'Add a title, summary and article text.');
  if (!['thesis', 'analysis', 'note'].includes(data.type)) throw new api.HttpError(400, 'Choose a page type.');
  if (data.revision !== null && (typeof data.revision !== 'string' || !/^[a-f0-9]{40}$/.test(data.revision))) {
    throw new api.HttpError(400, 'Reload the published page before editing.');
  }
  return { ...draft, type: data.type, revision: data.revision };
}

function formattedDate(value) {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function articleHtml(draft, body, published, env) {
  const updates = draft.type === 'thesis' ? `<div class="post-updates">
      <h3>Updates</h3>
      <div class="author-updates" aria-live="polite"><p class="comment-note">Loading updates…</p></div>
      <div class="author-update-editor" hidden></div>
    </div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="theme-color" content="#f5f3ec" />
  <meta name="description" content="${escape(draft.summary)}" />
  <title>${escape(draft.title)} — Roy Liu</title>
  <link rel="stylesheet" href="styles.css" />
  <script src="reading-progress.js" defer></script>
  <script src="comments.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <nav class="site-nav shell" aria-label="Main navigation">
    <a class="brand" href="index.html">Roy Liu</a>
    <div class="nav-links">
      <a href="index.html#work">Work</a>
      <a href="blog.html" aria-current="true">Writing</a>
      <a href="index.html#about">About</a>
      <a href="mailto:royrliu@utexas.edu">Email ↗</a>
    </div>
  </nav>
  <main id="main" class="blog-content shell">
    <a href="blog.html" class="back-link">← All posts</a>
    ${draft.category ? `<div class="post-meta">${escape(draft.category)}</div>` : ''}
    <h1>${escape(draft.title)}</h1>
    ${draft.subtitle ? `<p class="post-subtitle">${escape(draft.subtitle)}</p>` : ''}
    <p class="post-date"><time datetime="${published.slice(0, 10)}">${formattedDate(published)}</time></p>
    <hr />
    ${body}
    ${updates}
    <section class="post-comments" aria-labelledby="comments-heading" data-repo="${escape(env.GITHUB_REPO)}" data-api="${escape(env.API_ORIGIN)}">
      <h3 id="comments-heading">Comments</h3>
      <div class="comment-account" aria-live="polite"></div>
      <div class="comment-composer"></div>
      <div class="comment-list" aria-live="polite"><p class="comment-note">Loading comments…</p></div>
      <button class="comment-refresh" type="button" hidden>Refresh comments</button>
      <noscript><p class="comment-note">Enable JavaScript to read and write comments here.</p></noscript>
    </section>
    <a href="blog.html" class="back-link">← All posts</a>
  </main>
  <footer class="shell">
    <span>Roy Liu · Austin, Texas</span>
    <a href="interactive.html">Walk my dog ↗</a>
    <span>© ${published.slice(0, 4)}</span>
  </footer>
</body>
</html>
`;
}

export function indexHtml(index, pages, api) {
  if (index.split(entryStart).length !== 2 || index.split(entryEnd).length !== 2 || index.indexOf(entryEnd) < index.indexOf(entryStart)) {
    throw new api.HttpError(409, 'The writing index is missing its publishing markers. Update blog.html before publishing.');
  }
  const entries = Object.entries(pages).sort((first, second) => second[1].published.localeCompare(first[1].published))
    .map(([slug, page]) => `<article class="post-entry">
        <a href="${escape(slug)}.html">
          <div class="post-entry-header">
            <h2>${escape(page.title)}</h2>
            <time datetime="${page.published.slice(0, 10)}">${formattedDate(page.published)}</time>
          </div>
          <p>${escape(page.summary)}</p>
        </a>
      </article>`).join('\n\n      ');
  return index.slice(0, index.indexOf(entryStart) + entryStart.length) + '\n      ' + entries + '\n      ' + index.slice(index.indexOf(entryEnd));
}

async function discussion(slug, env, api, token) {
  const base = `/repos/${env.GITHUB_REPO}`;
  for (let page = 1; page <= 20; page += 1) {
    const issues = await api.github(`${base}/issues?state=all&per_page=100&page=${page}`, token);
    const existing = issues.find(issue => !issue.pull_request && issue.title === slug);
    if (existing) return existing.number;
    if (issues.length < 100) {
      const issue = await api.github(`${base}/issues`, token, { method: 'POST', body: JSON.stringify({
        title: slug, body: `Discussion for [${slug}](${env.SITE_ORIGIN}/${slug}.html).`,
      }) });
      return issue.number;
    }
  }
  throw new api.HttpError(503, 'Too many discussion threads to check safely. Contact the site administrator.');
}

export async function authorRequest(request, env, api) {
  const path = new URL(request.url).pathname;
  const base = `/repos/${env.GITHUB_REPO}`;
  const branch = env.PUBLISH_BRANCH || 'main';
  const token = await api.installationToken(env, request.method === 'GET' || path === '/author/preview' ? 'read' : 'publish');
  if (path === '/author/pages' && request.method === 'GET') {
    return Response.json({ pages: await publishedPages(env, api, branch, token) });
  }
  const edit = path.match(/^\/author\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (edit && request.method === 'GET') {
    const pages = await publishedPages(env, api, branch, token);
    if (!Object.hasOwn(pages, edit[1])) throw new api.HttpError(404, 'This page was not created in the editor.');
    const file = await readFile(`writing/${edit[1]}.json`, branch, env, api, token);
    return Response.json({ draft: { ...JSON.parse(decodeContent(file)), revision: file.sha } });
  }
  if (!['/author/preview', '/author/publish'].includes(path) || request.method !== 'POST') {
    throw new api.HttpError(404, 'Not found.');
  }
  const draft = validate(await api.input(request, 250000), api);
  const rendered = await api.github('/markdown', token, { method: 'POST', text: true,
    body: JSON.stringify({ text: draft.body, mode: 'gfm', context: env.GITHUB_REPO }) });
  if (path === '/author/preview') return Response.json({ html: articleHtml(draft, rendered, new Date().toISOString(), env) });
  const parent = await api.github(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const commit = await api.github(`${base}/git/commits/${parent.object.sha}`, token);
  const root = await api.github(`${base}/git/trees/${commit.tree.sha}`, token);
  const pages = await publishedPages(env, api, parent.object.sha, token);
  const exists = Object.hasOwn(pages, draft.slug);
  if (Object.hasOwn(JSON.parse(env.PAGES_JSON), draft.slug) ||
      (!exists && root.tree.some(file => file.path === `${draft.slug}.html`))) {
    throw new api.HttpError(409, 'That address belongs to an existing page. Choose another.');
  }
  if (exists) {
    const source = await readFile(`writing/${draft.slug}.json`, parent.object.sha, env, api, token);
    if (source.sha !== draft.revision) throw new api.HttpError(409, 'This page changed since you opened it. Your draft is safe. Reload the published version before updating.');
  } else if (draft.revision !== null) throw new api.HttpError(409, 'The original page could not be found.');
  const index = decodeContent(await readFile('blog.html', parent.object.sha, env, api, token));
  indexHtml(index, pages, api);
  const now = new Date().toISOString();
  const published = exists ? pages[draft.slug].published : now;
  const issue = exists ? pages[draft.slug].issue : await discussion(draft.slug, env, api, token);
  pages[draft.slug] = { title: draft.title, summary: draft.summary, published, updated: now,
    issue, updates: draft.type === 'thesis', type: draft.type };
  const { revision, ...source } = draft;
  const files = {
    [`${draft.slug}.html`]: articleHtml(draft, rendered, published, env),
    [`writing/${draft.slug}.json`]: JSON.stringify(source, null, 2) + '\n',
    [manifestPath]: JSON.stringify(pages, null, 2) + '\n',
    'blog.html': indexHtml(index, pages, api),
  };
  const tree = await api.github(`${base}/git/trees`, token, { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha,
    tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
  }) });
  const next = await api.github(`${base}/git/commits`, token, { method: 'POST', body: JSON.stringify({
    message: `${exists ? 'Update' : 'Publish'} ${draft.title}`, tree: tree.sha, parents: [parent.object.sha],
  }) });
  try {
    await api.github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: 'PATCH',
      body: JSON.stringify({ sha: next.sha, force: false }) });
  } catch (error) {
    if ([409, 422].includes(error.status)) throw new api.HttpError(409, 'The branch changed or publishing is blocked. Your draft is safe. Reload the page list before retrying.');
    throw error;
  }
  return Response.json({ url: `${env.SITE_ORIGIN}/${draft.slug}.html`, commit: next.sha,
    revision: await blobHash(files[`writing/${draft.slug}.json`]),
    issue, published }, { status: exists ? 200 : 201 });
}
