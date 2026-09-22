import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    calls = []
    unavailable = False

    def handle_request(route):
        url = route.request.url
        calls.append(url)
        if 'api.github.com' in url:
            if unavailable:
                route.fulfill(status=403, body='{}')
                return
            data = [{'number': 1, 'title': 'lennar'}, {'number': 2, 'title': 'lennar-full'}]
            if '/comments?' in url:
                data = [{'user': {'login': 'reader'}, 'created_at': '2026-09-22T14:03:07Z',
                         'body_html': '<p>Read <a href="https://example.com">the report</a>.</p>'
                                      '<script>window.compromised = true</script>'
                                      '<a href="javascript:alert(1)" onclick="alert(1)">unsafe</a>'
                                      '<img src="bad" onerror="alert(1)" alt="image">'}]
                data.extend([
                    {'user': {'login': 'royliu897', 'id': 124701324},
                     'created_at': '2026-09-22T15:00:01Z', 'updated_at': '2026-09-22T16:00:02Z',
                     'html_url': 'https://github.com/royliu897/royliu897.github.io/issues/1#issuecomment-2',
                     'body': '[update]\nBought 10 shares @ $76.43',
                     'body_html': '<p>[update]\nBought 10 shares @ $76.43</p>'},
                    {'user': {'login': 'royliu897', 'id': 999},
                     'created_at': '2026-09-22T17:00:00Z',
                     'body': '[update]\nImpersonation attempt',
                     'body_html': '<p>[update]\nImpersonation attempt</p>'},
                ])
            route.fulfill(content_type='application/json', body=json.dumps(data))
        elif 'utteranc.es' in url:
            route.fulfill(content_type='application/javascript', body='')
        else:
            filename = url.rsplit('/', 1)[-1]
            if filename in ['lennar.html', 'lennar-full.html', 'comments.js', 'reading-progress.js', 'styles.css']:
                route.fulfill(path=str(ROOT / filename))
            else:
                route.abort()

    page.route('**/*', handle_request)
    page.goto('https://site.test/lennar.html')
    page.locator('.comment-list .reader-comment').first.wait_for()
    assert page.locator('.comment-list .comment-meta a').first.get_attribute('href') == 'https://github.com/reader'
    assert page.locator('.comment-list .comment-meta time').first.inner_text() == 'Sep 22, 2026 · 14:03 UTC'
    assert page.locator('.comment-list .comment-meta time').first.get_attribute('title') == '2026-09-22 14:03:07 UTC'
    assert page.locator('.author-updates .reader-comment').count() == 1
    assert page.locator('.author-updates .comment-body').inner_text() == 'Bought 10 shares @ $76.43'
    assert page.locator('.author-updates .comment-edited').inner_text() == 'Edited Sep 22, 2026 · 16:00 UTC'
    assert page.locator('.author-updates time').first.inner_text() == 'Sep 22, 2026 · 15:00 UTC'
    assert page.locator('.trade-update > :first-child').get_attribute('class') == 'comment-body'
    assert page.locator('.author-updates .comment-meta a').count() == 1
    assert 'Impersonation attempt' in page.locator('.comment-list').inner_text()
    assert page.get_by_role('link', name='the report').get_attribute('href') == 'https://example.com/'
    assert page.locator('.comment-body [onclick], .comment-body script, .comment-body img').count() == 0
    assert page.locator('.comment-body a').nth(1).get_attribute('href') is None
    assert page.evaluate('window.compromised') is None
    assert not any('utteranc.es' in url for url in calls)
    page.get_by_text('Add a comment', exact=True).click()
    page.wait_for_function("document.querySelector('.comment-editor > script') !== null")
    page.get_by_text('Add a comment', exact=True).click()
    page.locator('.comment-refresh:not([disabled])').wait_for()
    unavailable = True
    page.get_by_role('button', name='Refresh comments').click()
    page.get_by_text('Comments could not be refreshed.', exact=False).wait_for()
    page.set_viewport_size({'width': 375, 'height': 812})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    unavailable = False
    page.goto('https://site.test/lennar-full.html')
    page.locator('.comment-list .reader-comment').first.wait_for()
    assert page.locator('.author-updates, .post-updates').count() == 0
    assert page.locator('.comment-list .reader-comment').count() == 3
    assert page.locator('.trade-update').count() == 0
    browser.close()
print('Comment rendering, UTC dates, safe links, lazy editor, and API failure checks passed.')
