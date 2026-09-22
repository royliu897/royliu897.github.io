from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import unittest


ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.elements = []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


class WritingTests(unittest.TestCase):
    def test_writing_reachable_from_every_page(self):
        for path in ROOT.glob('*.html'):
            with self.subTest(page=path.name):
                page = Page(path)
                links = [attrs.get('href') for tag, attrs in page.elements if tag == 'a']
                self.assertIn('blog.html', links)
                if path.name != 'interactive.html':
                    start = links.index('index.html#work')
                    self.assertEqual(links[start:start + 4], [
                        'index.html#work', 'blog.html', 'index.html#about',
                        'mailto:royrliu@utexas.edu',
                    ])

    def test_blog_assets_and_local_links(self):
        for name in ['blog.html', 'lennar.html', 'lennar-full.html']:
            page = Page(ROOT / name)
            for tag, attrs in page.elements:
                for attribute in ['href', 'src']:
                    target = urlsplit(attrs.get(attribute, ''))
                    if target.scheme or target.netloc or not target.path:
                        continue
                    with self.subTest(page=name, target=target.path):
                        self.assertTrue((ROOT / unquote(target.path)).is_file())
            self.assertIn(('link', {'rel': 'stylesheet', 'href': 'styles.css'}), page.elements)
            self.assertTrue(any(tag == 'time' and attrs.get('datetime') == '2026-09-21'
                                for tag, attrs in page.elements))

    def test_full_analysis_structure(self):
        page = Page(ROOT / 'lennar-full.html')
        images = [attrs for tag, attrs in page.elements if tag == 'img']
        self.assertEqual(len(images), 12)
        self.assertTrue(all(image.get('alt') and image.get('width') and image.get('height')
                            for image in images))
        self.assertEqual(sum(tag == 'figure' for tag, attrs in page.elements), 12)
        self.assertEqual(sum(tag == 'table' for tag, attrs in page.elements), 2)
        identifiers = [attrs.get('id') for tag, attrs in page.elements if 'id' in attrs]
        self.assertEqual(len(identifiers), len(set(identifiers)))
        for number in range(1, 21):
            self.assertIn('source-' + str(number), identifiers)

    def test_short_analysis_source_links(self):
        page = Page(ROOT / 'lennar.html')
        identifiers = [attrs['id'] for tag, attrs in page.elements if 'id' in attrs]
        self.assertEqual(len(identifiers), len(set(identifiers)))
        for tag, attrs in page.elements:
            target = attrs.get('href', '')
            if target.startswith('#'):
                self.assertIn(target[1:], identifiers)

    def test_short_analysis_sections(self):
        content = (ROOT / 'lennar.html').read_text()
        headings = ['Why is Lennar interesting?', 'What does Lennar do?',
                    'How is Lennar doing?', 'Thesis', 'Potential Areas of Concern', 'Value', 'Action']
        positions = [content.index('<h2>' + heading + '</h2>') for heading in headings]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(content.count('<h2>'), len(headings))

    def test_reading_navigation_script(self):
        for name in ['blog.html', 'lennar.html', 'lennar-full.html']:
            page = Page(ROOT / name)
            scripts = [attrs for tag, attrs in page.elements if tag == 'script'
                       and attrs.get('src') == 'reading-progress.js']
            self.assertEqual(len(scripts), 1)
            self.assertIn('defer', scripts[0])


if __name__ == '__main__':
    unittest.main()
