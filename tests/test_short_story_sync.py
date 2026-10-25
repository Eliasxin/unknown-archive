"""Confirm both works export, but unapproved content cannot leak."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('unknown_exporter_e2e', ROOT / 'scripts' / 'sync_notion.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def page(id_, work, slug, status='已發布', public=True, order=1):
    return {
        'id': id_,
        'created_time': '2026-10-26T00:00:00Z',
        'properties': {
            '文章名稱': {'type': 'title', 'title': [{'plain_text': slug}]},
            '所屬作品': {'type': 'relation', 'relation': [{'id': work}]},
            '發布狀態': {'type': 'select', 'select': {'name': status}},
            '網站公開': {'type': 'checkbox', 'checkbox': public},
            '網站章節識別碼': {'type': 'rich_text', 'rich_text': [{'plain_text': slug}]},
            '章節順序': {'type': 'number', 'number': order},
        },
    }


class ShortsSyncTest(unittest.TestCase):
    def setUp(self):
        self.old = {name: getattr(mod, name) for name in [
            'TOKEN', 'DATABASE_ID', 'SERIAL_PAGE_ID', 'SHORTS_PAGE_ID',
            'OUT', 'IMAGE_DIR', 'notion', 'paged_blocks', 'blocks_for'
        ]}
        self.tmp = tempfile.TemporaryDirectory()
        mod.TOKEN = 'test-token'
        mod.DATABASE_ID = 'c' * 32
        mod.SERIAL_PAGE_ID = 'a' * 32
        mod.SHORTS_PAGE_ID = 'b' * 32
        mod.OUT = pathlib.Path(self.tmp.name) / 'data' / 'chapters.json'
        mod.IMAGE_DIR = pathlib.Path(self.tmp.name) / 'assets' / 'notion'
        mod.notion = lambda method, path: {
            'properties': {'作品識別碼': {
                'type': 'rich_text',
                'rich_text': [{'plain_text': 'the_distance_between_us' if mod.SERIAL_PAGE_ID in path else 'unknown_shorts'}]
            }}
        }

    def tearDown(self):
        for name, value in self.old.items():
            setattr(mod, name, value)
        self.tmp.cleanup()

    def test_both_series_export_and_drafts_remain_private(self):
        pages = [
            page('public-serial', 'a' * 32, 'separate'),
            page('public-shorts', 'b' * 32, 'hurt'),
            page('draft-shorts', 'b' * 32, 'secret_draft', status='草稿', public=True),
            page('private-shorts', 'b' * 32, 'secret_private', public=False),
            page('other-work', 'd' * 32, 'another_story'),
        ]
        mod.paged_blocks = lambda path, method: pages
        accessed = []
        def fake_blocks(id_):
            accessed.append(id_)
            return [{'type': 'paragraph', 'runs': [{'text': 'safe public body'}]}]
        mod.blocks_for = fake_blocks
        mod.export()
        data = json.loads(mod.OUT.read_text(encoding='utf8'))
        self.assertEqual({'serial', 'shorts'}, {item['work'] for item in data['chapters']})
        self.assertEqual({'separate', 'hurt'}, {item['slug'] for item in data['chapters']})
        self.assertEqual({'public-serial', 'public-shorts'}, set(accessed))

    def test_missing_shorts_secret_fails_instead_of_silent_zero(self):
        mod.SHORTS_PAGE_ID = ''
        with self.assertRaisesRegex(RuntimeError, 'NOTION_SHORTS_PAGE_ID'):
            mod.export()


if __name__ == '__main__':
    unittest.main()
