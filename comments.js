(() => {
  const section = document.querySelector('.post-comments');
  if (!section) return;
  const list = section.querySelector('.comment-list');
  const updates = document.querySelector('.author-updates');
  const authorId = 124701324;
  const refresh = section.querySelector('.comment-refresh');
  const repository = section.dataset.repo;
  const api = section.dataset.api;
  const slug = window.location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  const endpoint = `/pages/${encodeURIComponent(slug)}/comments`;
  const account = section.querySelector('.comment-account');
  const updateEditor = document.querySelector('.author-update-editor');
  let user = null;
  let serviceAvailable = false;
  let formCount = 0;
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
    if (user && comment.user && user.id === comment.user.id) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'comment-text-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        edit.hidden = true;
        body.hidden = true;
        const form = makeForm(authorUpdate ? 'update' : 'comment', comment, () => {
          form.remove();
          edit.hidden = false;
          body.hidden = false;
        });
        article.append(form);
        form.querySelector('textarea').focus();
      });
      header.append(edit);
    }
    return article;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${api}${path}`, {
      ...options, credentials: 'include', headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        user = null;
        renderAccount();
      }
      throw new Error(data.error || 'The request could not be completed.');
    }
    return data;
  }

  function makeForm(kind, comment = null, cancel = null) {
    const form = document.createElement('form');
    form.className = 'comment-form';
    const label = document.createElement('label');
    const textarea = document.createElement('textarea');
    textarea.id = `message-${++formCount}`;
    textarea.name = 'message';
    textarea.required = true;
    textarea.maxLength = 10000;
    textarea.rows = kind === 'update' ? 2 : 4;
    textarea.placeholder = kind === 'update' ? 'Bought 10 shares @ $76.43' : 'Write a comment…';
    textarea.value = comment ? (isAuthorUpdate(comment) ? comment.body.replace(/^\[update\]\s*/i, '') : comment.body) : '';
    label.htmlFor = textarea.id;
    label.textContent = comment ? 'Edit message' : kind === 'update' ? 'Add a trade update' : 'Add a comment';
    const help = document.createElement('p');
    help.className = 'comment-note';
    help.id = `${textarea.id}-help`;
    help.append('Named links use ');
    const example = document.createElement('code');
    example.textContent = '[link text](https://example.com)';
    help.append(example, '.');
    textarea.setAttribute('aria-describedby', help.id);
    const actions = document.createElement('div');
    actions.className = 'comment-form-actions';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.dataset.messageSubmit = '';
    submit.textContent = comment ? 'Save changes' : kind === 'update' ? 'Post update' : 'Post comment';
    submit.disabled = !user;
    actions.append(submit);
    if (cancel) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'comment-text-button';
      button.textContent = 'Cancel';
      button.addEventListener('click', cancel);
      actions.append(button);
    }
    const status = document.createElement('p');
    status.className = 'comment-note';
    status.setAttribute('role', 'status');
    form.append(label, textarea, help, actions, status);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!user || form.dataset.saving) return;
      form.dataset.saving = 'true';
      submit.disabled = true;
      textarea.readOnly = true;
      refresh.disabled = true;
      status.textContent = 'Saving…';
      try {
        await request(comment ? `${endpoint}/${comment.id}` : endpoint, {
          method: comment ? 'PATCH' : 'POST', body: JSON.stringify({ body: textarea.value, kind }),
        });
        textarea.value = '';
        status.textContent = 'Saved.';
        await load();
      } catch (error) {
        status.textContent = error.message || 'Could not save. Your draft is still here.';
      } finally {
        delete form.dataset.saving;
        textarea.readOnly = false;
        submit.disabled = !user;
        refresh.disabled = false;
      }
    });
    return form;
  }

  function renderAccount() {
    account.replaceChildren();
    if (user) {
      const identity = document.createElement('span');
      identity.textContent = `Signed in as ${user.login}`;
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'comment-text-button';
      logout.textContent = 'Sign out';
      logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
          await request('/auth/logout', { method: 'POST', body: '{}' });
          user = null;
          renderAccount();
          await load();
        } catch {
          logout.disabled = false;
          identity.textContent = 'Could not sign out. Please try again.';
        }
      });
      account.append(identity, logout);
    } else {
      const login = document.createElement('a');
      login.href = `${api}/auth/login?page=${encodeURIComponent(slug)}`;
      login.textContent = 'Sign in with GitHub';
      account.append(login);
      const note = document.createElement('span');
      note.textContent = serviceAvailable ? 'to post or edit your messages.' : 'Posting will be available once the sign-in service is configured.';
      account.append(note);
    }
    document.querySelectorAll('[data-message-submit]').forEach(button => { button.disabled = !user; });
    if (updateEditor) {
      updateEditor.hidden = !(user && user.isAuthor);
      if (!updateEditor.childNodes.length && user && user.isAuthor) updateEditor.append(makeForm('update'));
    }
  }

  async function loadPublicComments() {
    const base = `https://api.github.com/repos/${repository}`;
    async function read(url) {
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github.full+json' }, credentials: 'omit' });
      if (!response.ok) throw new Error('Comments unavailable');
      return response.json();
    }
    let issue;
    for (let page = 1; !issue; page += 1) {
      const issues = await read(`${base}/issues?state=all&per_page=100&page=${page}`);
      issue = issues.find(candidate => !candidate.pull_request && pageKey(candidate.title) === slug);
      if (issues.length < 100) break;
    }
    const comments = [];
    if (!issue) return comments;
    for (let page = 1; ; page += 1) {
      const batch = await read(`${base}/issues/${issue.number}/comments?per_page=100&page=${page}`);
      comments.push(...batch.filter(comment => !comment.minimized));
      if (batch.length < 100) break;
    }
    return comments;
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
      let comments = [];
      if (serviceAvailable) {
        let page = 1;
        do {
          const result = await request(`${endpoint}?page=${page}`);
          comments.push(...result.comments);
          page = result.nextPage;
        } while (page);
      } else comments = await loadPublicComments();
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
      message.textContent = 'Comments could not be refreshed. Please try again shortly.';
      list.replaceChildren(message);
      if (updates) {
        const warning = document.createElement('p');
        warning.className = 'comment-note';
        warning.textContent = 'Updates could not be refreshed. Please try again shortly.';
        updates.replaceChildren(warning);
      }
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  refresh.hidden = false;
  refresh.addEventListener('click', load);
  section.querySelector('.comment-composer').append(makeForm('comment'));
  async function initialize() {
    try {
      const session = await request('/session');
      user = session.user;
      serviceAvailable = true;
    } catch {
      user = null;
    }
    renderAccount();
    await load();
  }
  initialize();
})();
