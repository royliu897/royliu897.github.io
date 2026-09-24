import html
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    calls = []
    user = None
    unavailable = False
    fail_save = False
    comments = [
        {'id': 1, 'user': {'login': 'reader', 'id': 42},
         'created_at': '2026-09-22T14:03:07Z', 'body': 'Original question',
         'body_html': '<p>Read <a href="https://example.com">the report</a>.</p>'
                      '<script>window.compromised = true</script>'
                      '<a href="javascript:alert(1)" onclick="alert(1)">unsafe</a>'
                      '<img src="bad" onerror="alert(1)" alt="image">'},
        {'id': 2, 'user': {'login': 'royliu897', 'id': 124701324},
         'created_at': '2026-09-22T15:00:01Z', 'updated_at': '2026-09-22T16:00:02Z',
         'html_url': 'https://github.com/royliu897/royliu897.github.io/issues/1#issuecomment-2',
         'body': '[update]\nBought 10 shares @ $76.43',
         'body_html': '<p>[update]\nBought 10 shares @ $76.43</p>'},
        {'id': 3, 'user': {'login': 'royliu897', 'id': 999},
         'created_at': '2026-09-22T17:00:00Z', 'body': '[update]\nImpersonation attempt',
         'body_html': '<p>[update]\nImpersonation attempt</p>'},
    ]

    def handle_request(route):
        global user
        url = route.request.url
        calls.append(url)
        if 'comments.royrliu.com' in url:
            if unavailable:
                route.fulfill(status=503, content_type='application/json', body='{"error":"Unavailable"}')
                return
            if url.endswith('/session'):
                data = {'user': user}
            elif url.endswith('/auth/logout'):
                user = None
                data = {}
            elif route.request.method in ['POST', 'PATCH']:
                if fail_save:
                    route.fulfill(status=503, content_type='application/json', body='{"error":"Please try again."}')
                    return
                payload = route.request.post_data_json
                body = payload['body']
                if payload['kind'] == 'update':
                    body = '[update]\n' + body
                if route.request.method == 'PATCH':
                    comment = next(item for item in comments if item['id'] == int(url.rsplit('/', 1)[-1]))
                else:
                    comment = {'id': len(comments) + 1, 'user': user,
                               'created_at': '2026-09-22T18:00:00Z'}
                    comments.append(comment)
                comment.update(body=body, body_html='<p>' + html.escape(body) + '</p>',
                               updated_at='2026-09-22T18:00:00Z')
                data = {'comment': comment}
            else:
                data = {'comments': comments, 'nextPage': None}
            route.fulfill(content_type='application/json', body=json.dumps(data))
        elif 'api.github.com' in url:
            data = [{'number': 1, 'title': 'lennar'}] if '/issues?' in url else comments
            route.fulfill(content_type='application/json', body=json.dumps(data))
        else:
            filename = url.rsplit('/', 1)[-1]
            if filename in ['lennar.html', 'lennar-full.html', 'comments.js', 'reading-progress.js', 'styles.css']:
                route.fulfill(path=str(ROOT / filename))
            else:
                route.abort()

    page.route('**/*', handle_request)
    page.goto('https://royrliu.com/lennar.html')
    page.locator('.comment-list .reader-comment').first.wait_for()
    assert page.get_by_role('link', name='Sign in with GitHub').is_visible()
    assert page.get_by_label('Add a comment').is_visible()
    assert page.get_by_role('button', name='Post comment', exact=True).is_disabled()
    assert not page.locator('.author-update-editor').is_visible()
    assert page.locator('.comment-list .comment-meta a').first.get_attribute('href') == 'https://github.com/reader'
    assert page.locator('.comment-list .comment-meta time').first.inner_text() == 'Sep 22, 2026 · 14:03 UTC'
    assert page.locator('.comment-list .comment-meta time').first.get_attribute('title') == '2026-09-22 14:03:07 UTC'
    assert page.locator('.author-updates .comment-body').inner_text() == 'Bought 10 shares @ $76.43'
    assert page.locator('.author-updates .comment-edited').inner_text() == 'Edited Sep 22, 2026 · 16:00 UTC'
    assert 'Impersonation attempt' in page.locator('.comment-list').inner_text()
    assert page.get_by_role('link', name='the report').get_attribute('href') == 'https://example.com/'
    assert page.locator('.comment-body [onclick], .comment-body script, .comment-body img').count() == 0
    assert page.locator('.comment-body a').nth(1).get_attribute('href') is None
    assert page.evaluate('window.compromised') is None
    assert not any('utteranc.es' in url for url in calls)

    user = {'id': 42, 'login': 'reader', 'isAuthor': False}
    page.reload()
    page.get_by_role('button', name='Edit', exact=True).wait_for()
    assert page.get_by_role('button', name='Edit', exact=True).count() == 1
    comments[0]['editable'] = False
    comments[0]['html_url'] = 'https://github.com/royliu897/royliu897.github.io/issues/1#issuecomment-1'
    page.reload()
    page.get_by_role('link', name='Edit on GitHub', exact=True).wait_for()
    assert page.get_by_role('button', name='Edit', exact=True).count() == 0
    comments[0]['editable'] = True
    page.reload()
    page.get_by_role('button', name='Edit', exact=True).wait_for()
    assert not page.locator('.author-update-editor').is_visible()
    page.get_by_role('button', name='Edit', exact=True).click()
    page.get_by_label('Edit message').fill('Edited question')
    page.get_by_role('button', name='Save changes').click()
    page.get_by_text('Edited question', exact=True).wait_for()
    assert page.locator('.comment-list time').first.inner_text() == 'Sep 22, 2026 · 14:03 UTC'
    fail_save = True
    page.get_by_label('Add a comment').fill('Keep this draft')
    page.get_by_role('button', name='Post comment', exact=True).click()
    page.get_by_text('Please try again.', exact=True).wait_for()
    assert page.get_by_label('Add a comment').input_value() == 'Keep this draft'
    fail_save = False

    user = {'id': 124701324, 'login': 'royliu897', 'isAuthor': True}
    page.reload()
    page.get_by_label('Add a trade update').wait_for()
    page.get_by_label('Add a trade update').fill('Sold 5 shares @ $90')
    page.get_by_role('button', name='Post update', exact=True).click()
    page.get_by_text('Sold 5 shares @ $90', exact=True).wait_for()
    assert comments[-1]['body'] == '[update]\nSold 5 shares @ $90'
    assert page.locator('.author-updates .reader-comment').count() == 2
    page.locator('.post-updates').scroll_into_view_if_needed()
    page.screenshot(path='/tmp/writing-comments-desktop.png')
    page.set_viewport_size({'width': 375, 'height': 812})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('.comment-composer').scroll_into_view_if_needed()
    page.screenshot(path='/tmp/writing-comments-mobile.png')
    page.goto('https://royrliu.com/lennar-full.html')
    page.locator('.comment-list .reader-comment').first.wait_for()
    assert page.locator('.author-updates, .post-updates, .author-update-editor').count() == 0
    assert page.locator('.trade-update').count() == 0
    page.get_by_role('button', name='Sign out', exact=True).click()
    page.get_by_role('link', name='Sign in with GitHub').wait_for()
    assert page.get_by_role('button', name='Post comment', exact=True).is_disabled()
    unavailable = True
    page.goto('https://royrliu.com/lennar.html')
    page.locator('.comment-list .reader-comment').first.wait_for()
    assert page.get_by_text('Posting will be available once the sign-in service is configured.').is_visible()
    browser.close()
print('Custom editor, owner updates, editing, drafts, UTC times, safe links, and fallback checks passed.')
