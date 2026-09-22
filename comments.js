(() => {
  const section = document.querySelector('.post-comments');
  if (!section) return;
  const list = section.querySelector('.comment-list');
  const updates = document.querySelector('.author-updates');
  const authorId = 124701324;
  const refresh = section.querySelector('.comment-refresh');
  const editor = section.querySelector('.comment-editor');
  const template = editor.querySelector('template');
  const configuration = template.content.querySelector('script');
  const repository = configuration.getAttribute('repo');
  const api = `https://api.github.com/repos/${repository}`;
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE',
    'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4', 'HR',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);

  function safeLink(value) {
    try {
      const url = new URL(value);
      return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function copyMarkup(node, target) {
    if (node.nodeType === 3) {
      target.append(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== 1) return;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'FORM'].includes(node.tagName)) return;
    if (node.tagName === 'IMG') {
      target.append(document.createTextNode(node.getAttribute('alt') || ''));
      return;
    }
    const element = allowedTags.has(node.tagName)
      ? document.createElement(node.tagName.toLowerCase()) : document.createElement('span');
    if (node.tagName === 'A') {
      const href = safeLink(node.getAttribute('href'));
      if (href) element.setAttribute('href', href);
      element.setAttribute('rel', 'nofollow ugc noopener');
    }
    Array.from(node.childNodes).forEach(child => copyMarkup(child, element));
    target.append(element);
  }

  function isAuthorUpdate(comment) {
    return updates && comment.user && comment.user.id === authorId &&
      /^\[update\]\s*(?:\r?\n|$)/i.test(comment.body || '');
  }

  function makeTimestamp(value) {
    const timestamp = document.createElement('time');
    timestamp.dateTime = value;
    const date = new Date(value);
    const day = date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
    timestamp.textContent = `${day} · ${date.toISOString().slice(11, 16)} UTC`;
    timestamp.title = date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
    return timestamp;
  }

  function renderComment(comment) {
    const authorUpdate = isAuthorUpdate(comment);
    const article = document.createElement('article');
    article.className = authorUpdate ? 'reader-comment trade-update' : 'reader-comment';
    const header = document.createElement('header');
    header.className = 'comment-meta';
    const author = document.createElement('a');
    author.textContent = comment.user ? comment.user.login : 'Deleted user';
    if (comment.user) author.href = `https://github.com/${encodeURIComponent(comment.user.login)}`;
    const source = document.createElement('a');
    const sourceUrl = safeLink(comment.html_url);
    if (sourceUrl) source.href = sourceUrl;
    source.title = 'Posting time recorded by GitHub. View the original comment.';
    source.append(makeTimestamp(comment.created_at));
    if (!authorUpdate) header.append(author);
    header.append(source);
    if (comment.updated_at && comment.updated_at !== comment.created_at) {
      const edited = document.createElement('span');
      edited.className = 'comment-edited';
      edited.append('Edited ', makeTimestamp(comment.updated_at));
      header.append(edited);
    }
    const body = document.createElement('div');
    body.className = 'comment-body';
    const parsed = new DOMParser().parseFromString(comment.body_html || '', 'text/html');
    if (authorUpdate) {
      const first = parsed.body.firstElementChild;
      if (first && first.firstChild && first.firstChild.nodeType === 3) {
        first.firstChild.textContent = first.firstChild.textContent.replace(/^\[update\]\s*/i, '');
        if (!first.textContent.trim()) first.remove();
      }
    }
    Array.from(parsed.body.childNodes).forEach(node => copyMarkup(node, body));
    if (authorUpdate) article.append(body, header);
    else article.append(header, body);
    return article;
  }

  async function request(url) {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github.full+json' },
      credentials: 'omit',
    });
    if (!response.ok) throw new Error('Comments unavailable');
    return response.json();
  }

  function pageKey(value) {
    return value.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    try {
      let issue;
      for (let page = 1; !issue; page += 1) {
        const issues = await request(`${api}/issues?state=all&per_page=100&page=${page}`);
        issue = issues.find(candidate => !candidate.pull_request &&
          pageKey(candidate.title) === pageKey(window.location.pathname));
        if (issues.length < 100) break;
      }
      const comments = [];
      if (issue) {
        for (let page = 1; ; page += 1) {
          const batch = await request(`${api}/issues/${issue.number}/comments?per_page=100&page=${page}`);
          comments.push(...batch.filter(comment => !comment.minimized));
          if (batch.length < 100) break;
        }
      }
      const content = document.createDocumentFragment();
      const authorContent = document.createDocumentFragment();
      const publicComments = comments.filter(comment => !isAuthorUpdate(comment));
      comments.filter(isAuthorUpdate).forEach(comment => authorContent.append(renderComment(comment)));
      publicComments.forEach(comment => content.append(renderComment(comment)));
      if (!authorContent.childNodes.length) {
        const empty = document.createElement('p');
        empty.className = 'comment-note';
        empty.textContent = 'No updates yet.';
        authorContent.append(empty);
      }
      if (updates) updates.replaceChildren(authorContent);
      if (!publicComments.length) {
        const empty = document.createElement('p');
        empty.className = 'comment-note';
        empty.textContent = 'No comments yet.';
        content.append(empty);
      }
      list.replaceChildren(content);
    } catch {
      const message = document.createElement('p');
      message.className = 'comment-note';
      message.textContent = 'Comments could not be refreshed. Try again, or open the discussion on GitHub below.';
      list.replaceChildren(message);
      if (updates) {
        const warning = document.createElement('p');
        warning.className = 'comment-note';
        warning.textContent = 'Updates could not be refreshed. View the discussion on GitHub below.';
        updates.replaceChildren(warning);
      }
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  let editorLoaded = false;
  editor.addEventListener('toggle', () => {
    if (!editor.open) {
      load();
      return;
    }
    if (editorLoaded) return;
    editorLoaded = true;
    const script = document.createElement('script');
    Array.from(configuration.attributes).forEach(attribute => script.setAttribute(attribute.name, attribute.value));
    script.addEventListener('error', () => {
      editorLoaded = false;
      script.remove();
    });
    editor.append(script);
  });
  refresh.hidden = false;
  refresh.addEventListener('click', load);
  load();
})();
