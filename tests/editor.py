import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'roy-writing-drafts-v1'

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    user = None
    pages = {}
    published = None
    fail_publish = False
    publish_calls = []
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route_request(route):
        global published
        url = route.request.url
        if 'comments.royrliu.com' in url:
            if url.endswith('/session'):
                data = {'user': user}
            elif url.endswith('/author/pages'):
                data = {'pages': pages}
            elif '/author/pages/' in url:
                data = {'draft': published}
            elif url.endswith('/author/preview'):
                data = {'html': '<html><head><script>parent.compromised=true</script></head><body><h1>Preview article</h1></body></html>'}
            elif url.endswith('/author/publish'):
                publish_calls.append(route.request.post_data_json)
                if fail_publish:
                    route.fulfill(status=409, content_type='application/json', body=json.dumps({'error': 'The branch changed. Your draft is safe.'}))
                    return
                published = {**route.request.post_data_json, 'revision': 'a' * 40}
                pages[published['slug']] = {'title': published['title'], 'published': '2026-09-23T00:00:00Z'}
                data = {'revision': published['revision'], 'url': 'https://royrliu.com/' + published['slug'] + '.html'}
            else:
                raise AssertionError(url)
            route.fulfill(content_type='application/json', body=json.dumps(data))
        else:
            name = url.rsplit('/', 1)[-1]
            if name in ['write.html', 'write.js', 'styles.css']:
                route.fulfill(path=str(ROOT / name))
            else:
                route.abort()

    page.route('**/*', route_request)
    page.goto('https://royrliu.com/write.html')
    expect(page.get_by_role('link', name='Sign in with GitHub')).to_be_visible()
    expect(page.locator('#writer-workspace')).to_be_hidden()
    user = {'login': 'visitor', 'isAuthor': False}
    page.reload()
    expect(page.locator('#writer-status')).to_contain_text('reserved for the site author')
    expect(page.locator('#writer-workspace')).to_be_hidden()
    user = {'login': 'royliu897', 'isAuthor': True}
    page.reload()
    expect(page.locator('#writer-workspace')).to_be_visible()
    page.get_by_label('Title', exact=True).fill('A thoughtful company')
    expect(page.get_by_label('Page address')).to_have_value('a-thoughtful-company')
    page.get_by_label('Summary for the writing index').fill('Measured growth.')
    page.get_by_label('Article', exact=True).fill('## Thesis\n\nA patient idea.')
    page.reload()
    expect(page.get_by_label('Article', exact=True)).to_have_value('## Thesis\n\nA patient idea.')
    page.get_by_role('button', name='Preview', exact=True).click()
    expect(page.locator('#preview-panel')).to_be_visible()
    expect(page.frame_locator('#article-preview').get_by_role('heading', name='Preview article')).to_be_visible()
    assert page.evaluate('window.compromised') is None
    assert not publish_calls
    page.locator('#publish-page').click()
    page.locator('#cancel-publish').click()
    assert not publish_calls
    fail_publish = True
    page.locator('#publish-page').click()
    page.locator('#confirm-publish').click()
    expect(page.locator('#writer-status')).to_contain_text('Your draft is safe')
    expect(page.get_by_label('Article', exact=True)).to_have_value('## Thesis\n\nA patient idea.')
    fail_publish = False
    page.locator('#publish-page').click()
    page.locator('#confirm-publish').click()
    expect(page.locator('#writer-status')).to_contain_text('Published.')
    expect(page.get_by_label('Page address')).to_have_attribute('readonly', '')
    page.get_by_label('Article', exact=True).fill('Revised thesis')
    page.locator('#publish-page').click()
    page.locator('#confirm-publish').click()
    expect(page.locator('#writer-status')).to_contain_text('Published.')
    assert publish_calls[-1]['revision'] == 'a' * 40
    with page.expect_download() as download:
        page.locator('#export-draft').click()
    assert json.loads(Path(download.value.path()).read_text())['body'] == 'Revised thesis'
    imported = {**published, 'title': 'Imported draft', 'slug': 'imported', 'revision': None}
    page.locator('#import-draft').set_input_files({'name': 'draft.json', 'mimeType': 'application/json', 'buffer': json.dumps(imported).encode()})
    expect(page.get_by_label('Title', exact=True)).to_have_value('Imported draft')
    page.on('dialog', lambda dialog: dialog.accept())
    page.locator('#published-list button').click()
    expect(page.get_by_label('Article', exact=True)).to_have_value('Revised thesis')
    for width in [1440, 390]:
        page.set_viewport_size({'width': width, 'height': 1000})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if os.environ.get('EDITOR_SCREENSHOTS'):
            page.screenshot(path=str(Path(os.environ['EDITOR_SCREENSHOTS']) / f'editor-{width}.png'), full_page=True)
    page.evaluate('(key) => localStorage.setItem(key, "broken-json")', KEY)
    page.reload()
    expect(page.locator('#draft-status')).to_contain_text('Download your draft')
    page.get_by_label('Title', exact=True).fill('Recovery draft')
    assert page.evaluate('(key) => localStorage.getItem(key)', KEY) == 'broken-json'
    page.evaluate('localStorage.clear()')
    page.reload()
    expect(page.locator('#writer-workspace')).to_be_visible()
    page.evaluate("() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; }")
    page.get_by_label('Title', exact=True).fill('Storage failure')
    expect(page.locator('#draft-status')).to_contain_text('Download your draft')
    with page.expect_download() as download:
        page.locator('#export-draft').click()
    assert json.loads(Path(download.value.path()).read_text())['title'] == 'Storage failure'
    assert not errors, errors
    browser.close()
    print('Editor identity gating, autosave, preview isolation, publishing, conflicts, revision updates, import/export, storage recovery and mobile layout passed.')
