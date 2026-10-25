"""Privacy regression tests, no Notion credentials or network required."""
import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'sync_notion.py'
spec = importlib.util.spec_from_file_location('sync_notion', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.SERIAL_PAGE_ID = 'a' * 32
module.SHORTS_PAGE_ID = 'b' * 32


def article(work='a'*32, status='已發布', public=True):
    return {'properties': {
        '所屬作品': {'type':'relation', 'relation':[{'id':work}]},
        '發布狀態': {'type':'select', 'select': {'name':status}},
        '網站公開': {'type':'checkbox', 'checkbox':public},
        '故事篇章': {'type':'select','select':None}, # actual serial chapters have this empty
    }}


class PrivacyTest(unittest.TestCase):
    def test_serial_without_story_arc(self):
        self.assertTrue(module.is_allowed(article()))
        self.assertEqual(module.relation_group(article()['properties']), 'serial')
    def test_independent_short_relation(self):
        self.assertTrue(module.is_allowed(article(work='b'*32)))
        self.assertEqual(module.relation_group(article(work='b'*32)['properties']), 'shorts')
    def test_no_cross_work_leak(self):
        self.assertFalse(module.is_allowed(article(work='c'*32)))
        self.assertIsNone(module.relation_group(article(work='c'*32)['properties']))
    def test_draft_and_unchecked_never_export(self):
        self.assertFalse(module.is_allowed(article(status='草稿', public=False)))
        self.assertFalse(module.is_allowed(article(status='草稿', public=True)))
        self.assertFalse(module.is_allowed(article(status='已發布', public=False)))
    def test_no_shorts_id_means_no_short_export(self):
        module.SHORTS_PAGE_ID = ''
        self.assertFalse(module.is_allowed(article(work='b'*32)))
        module.SHORTS_PAGE_ID = 'b'*32
    def test_rich_text_no_unintended_link(self):
        run=[{'plain_text':'普通文字', 'type':'text','text':{'content':'普通文字'},'annotations':{}}]
        self.assertIsNone(module.rich(run)[0]['href'])

if __name__ == '__main__': unittest.main()
