(() => {
  const root = document.querySelector('.writer');
  const api = root.dataset.api;
  const element = identifier => document.getElementById(identifier);
  const form = element('writer-form');
  const fields = ['title', 'slug', 'type', 'category', 'subtitle', 'summary', 'body'];
  const storageKey = 'roy-writing-drafts-v1';
  let drafts = {};
  let current;
  let pages = {};
  let busy = false;
  let saved = true;
  let slugEdited = false;
  let storageBlocked = false;

  function status(message, error = false) {
    element('writer-status').textContent = message;
    element('writer-status').classList.toggle('writer-error', error);
  }

  async function request(path, body) {
    const response = await fetch(`${api}${path}`, { credentials: 'include',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The request could not be completed. Your draft is still here.');
    return data;
  }

  function snapshot() {
    const draft = { revision: current?.revision || null };
    fields.forEach(field => { draft[field] = form.elements[field].value; });
    return draft;
  }

  function persist() {
    if (!current) return;
    current = { ...current, ...snapshot(), savedAt: new Date().toISOString() };
    drafts[current.id] = current;
    try {
      if (storageBlocked) throw new Error('Saved drafts need recovery');
      localStorage.setItem(storageKey, JSON.stringify(drafts));
      saved = true;
      element('draft-status').textContent = 'Saved on this browser';
    } catch {
      saved = false;
      element('draft-status').textContent = 'Browser storage unavailable. Download your draft before leaving.';
    }
    renderDrafts();
  }

  function button(label, action) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.addEventListener('click', () => { if (!busy) action(); });
    return control;
  }

  function renderDrafts() {
    const list = element('draft-list');
    list.replaceChildren();
    Object.values(drafts).sort((first, second) => (second.savedAt || '').localeCompare(first.savedAt || '')).forEach(draft => {
      const control = button(draft.title || 'Untitled', () => openDraft(draft));
      if (draft.id === current?.id) control.setAttribute('aria-current', 'true');
      list.append(control);
    });
    if (!list.childNodes.length) list.textContent = 'No drafts yet.';
  }

  function openDraft(draft) {
    current = { ...draft };
    fields.forEach(field => { form.elements[field].value = draft[field] || (field === 'type' ? 'thesis' : ''); });
    form.elements.slug.readOnly = Boolean(draft.revision);
    slugEdited = Boolean(draft.slug);
    element('preview-panel').hidden = true;
    element('draft-status').textContent = saved ? 'Saved on this browser' : 'Browser storage unavailable. Download your draft before leaving.';
    renderDrafts();
  }

  function newDraft() {
    openDraft({ id: crypto.randomUUID(), revision: null, type: 'thesis' });
    persist();
    form.elements.title.focus();
    if (!storageBlocked) status('');
  }

  async function refreshPages() {
    const data = await request('/author/pages');
    pages = data.pages;
    const list = element('published-list');
    list.replaceChildren();
    Object.entries(pages).sort((first, second) => second[1].published.localeCompare(first[1].published)).forEach(([slug, page]) => {
      list.append(button(page.title, () => run(async () => {
        const existing = Object.values(drafts).find(draft => draft.slug === slug);
        if (existing && !confirm('Load the published version? Your local draft will remain in Drafts.')) return;
        const data = await request(`/author/pages/${slug}`);
        openDraft({ ...data.draft, id: crypto.randomUUID() });
        persist();
        status('Loaded the published version. Changes stay local until you publish again.');
      })));
    });
    if (!list.childNodes.length) list.textContent = 'No editor-published pages yet.';
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    element('writer-fields').disabled = true;
    root.querySelectorAll('button').forEach(control => { control.disabled = true; });
    element('import-draft').disabled = true;
    try { await action(); }
    catch (error) { status(error.message || 'Could not connect. Your draft is still here.', true); }
    finally {
      busy = false;
      element('writer-fields').disabled = false;
      root.querySelectorAll('button').forEach(control => { control.disabled = false; });
      element('import-draft').disabled = false;
    }
  }

  form.addEventListener('input', event => {
    if (event.target.name === 'slug') slugEdited = true;
    if (event.target.name === 'title' && !slugEdited && !current.revision) {
      form.elements.slug.value = form.elements.title.value.toLowerCase().normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    }
    element('preview-panel').hidden = true;
    persist();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    run(async () => {
      persist();
      status('Preparing preview…');
      const data = await request('/author/preview', snapshot());
      const documentPreview = new DOMParser().parseFromString(data.html, 'text/html');
      documentPreview.querySelectorAll('script').forEach(script => script.remove());
      const base = documentPreview.createElement('base');
      base.href = `${window.location.origin}/`;
      documentPreview.head.prepend(base);
      const policy = documentPreview.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content = `default-src 'none'; style-src ${window.location.origin}; img-src https: data:; font-src ${window.location.origin}; form-action 'none'`;
      documentPreview.head.prepend(policy);
      element('article-preview').srcdoc = '<!DOCTYPE html>' + documentPreview.documentElement.outerHTML;
      element('preview-panel').hidden = false;
      element('preview-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      status('Preview ready. Nothing has been published.');
    });
  });

  element('publish-page').addEventListener('click', () => {
    if (busy || !form.reportValidity()) return;
    persist();
    element('publish-description').textContent = `${form.elements.title.value} will be published at /${form.elements.slug.value}.html.`;
    element('publish-confirm').showModal();
  });
  element('cancel-publish').addEventListener('click', () => element('publish-confirm').close());
  element('confirm-publish').addEventListener('click', () => {
    element('publish-confirm').close();
    run(async () => {
      status('Publishing… Keep this tab open.');
      const data = await request('/author/publish', snapshot());
      current.revision = data.revision;
      form.elements.slug.readOnly = true;
      persist();
      status('Published. GitHub Pages may take a few minutes to update. ');
      const link = document.createElement('a');
      link.href = `${window.location.origin}/${form.elements.slug.value}.html`;
      link.textContent = 'View page →';
      element('writer-status').append(link);
      try { await refreshPages(); } catch { element('writer-status').append(' Refresh the page list when the connection returns.'); }
    });
  });

  element('new-draft').addEventListener('click', newDraft);
  element('refresh-pages').addEventListener('click', () => run(refreshPages));
  element('close-preview').addEventListener('click', () => { element('preview-panel').hidden = true; });
  element('delete-draft').addEventListener('click', () => {
    if (busy || !confirm('Discard this local draft? Published pages will not be changed.')) return;
    delete drafts[current.id];
    current = null;
    try { if (storageBlocked) throw new Error('Saved drafts need recovery'); localStorage.setItem(storageKey, JSON.stringify(drafts)); } catch { status('Could not remove the saved draft from this browser.', true); }
    newDraft();
  });
  element('export-draft').addEventListener('click', () => {
    persist();
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.elements.slug.value || 'untitled'}-draft.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  element('import-draft').addEventListener('change', event => run(async () => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 250000) throw new Error('Choose a draft smaller than 250 KB.');
      const imported = JSON.parse(await file.text());
      if (!imported || !fields.every(field => typeof imported[field] === 'string') ||
          !['thesis', 'analysis', 'note'].includes(imported.type)) throw new Error('This file is not an exported writing draft.');
      openDraft({ ...imported, revision: imported.revision || null, id: crypto.randomUUID() });
      persist();
      status('Draft imported. Nothing has been published.');
    } finally { event.target.value = ''; }
  }));
  window.addEventListener('beforeunload', event => {
    if (busy || !saved) { event.preventDefault(); event.returnValue = ''; }
  });

  async function initialize() {
    const account = element('writer-account');
    const login = () => {
      account.replaceChildren();
      const link = document.createElement('a');
      link.href = `${api}/auth/login?page=write`;
      link.textContent = 'Sign in with GitHub';
      account.append(link);
    };
    try {
      const { user } = await request('/session');
      if (!user) { login(); status('Roy only.'); return; }
      account.textContent = `Signed in as ${user.login}`;
      account.append(button('Sign out', () => run(async () => {
        persist();
        await request('/auth/logout', {});
        window.location.reload();
      })));
      if (!user.isAuthor) { status('Publishing is reserved for the site author. You can still comment on articles.'); return; }
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (!stored || Array.isArray(stored) || typeof stored !== 'object') throw new Error('Invalid draft storage');
        if (!Object.entries(stored).every(([identifier, draft]) => draft && draft.id === identifier &&
            fields.every(field => typeof draft[field] === 'string') &&
            typeof draft.savedAt === 'string')) throw new Error('Invalid saved draft');
        drafts = stored;
      } catch {
        storageBlocked = true;
        saved = false;
        status('Saved drafts could not be loaded. Download any new work before leaving.', true);
      }
      element('writer-workspace').hidden = false;
      const recent = Object.values(drafts).sort((first, second) => (second.savedAt || '').localeCompare(first.savedAt || ''))[0];
      if (recent) openDraft(recent);
      else newDraft();
      await refreshPages();
    } catch (error) {
      if (element('writer-workspace').hidden) login();
      status(error.message || 'Sign-in is unavailable. Please try again later.', true);
    }
  }
  initialize();
})();
