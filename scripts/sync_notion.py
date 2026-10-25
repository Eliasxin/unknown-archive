#!/usr/bin/env python3
"""Read-only Notion exporter for SAKURAI_TK's UNKNOWN fiction archive.

Privacy gates (all required):
1. Page is related to one of the *two required* configured work pages.
2. 發布狀態 is 已發布 or 已發佈.
3. 網站公開 is checked.
No 故事篇章 is required: The Distance Between Us uses an independent Notion work relation.

No unpublished article bodies are retrieved; no body text is printed to logs.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'chapters.json'
IMAGE_DIR = ROOT / 'assets' / 'notion'
TOKEN = os.getenv('NOTION_TOKEN', '').strip()
DATABASE_ID = os.getenv('NOTION_DATABASE_ID', '').strip().replace('-', '')
SERIAL_PAGE_ID = os.getenv('NOTION_SERIAL_PAGE_ID', os.getenv('NOTION_WORK_PAGE_ID', '')).strip().replace('-', '').lower()
SHORTS_PAGE_ID = os.getenv('NOTION_SHORTS_PAGE_ID', '').strip().replace('-', '').lower()
API = 'https://api.notion.com/v1/'
VERSION = '2022-06-28'
MAX_IMAGE_BYTES = 10 * 1024 * 1024

# The exact Notion relation is the source of truth, never guessed from article titles.
# Both work IDs are required: a missing shorts Secret must fail visibly, not silently skip that collection.
SLUG_PATTERN = re.compile(r'[a-z0-9][a-z0-9_-]*\Z')


def notion(method: str, path: str, body: Any = None) -> dict:
    url = API + path.lstrip('/')
    headers = {'Authorization': 'Bearer ' + TOKEN, 'Notion-Version': VERSION,
               'Content-Type': 'application/json', 'User-Agent': 'UnknownArchiveSync/1.0'}
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=raw, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=50) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < 4:
                try:
                    seconds = min(20, max(1, int(exc.headers.get('Retry-After', '2'))))
                except ValueError:
                    seconds = 2
                time.sleep(seconds)
                continue
            raise RuntimeError(f'Notion API HTTP {exc.code} at {path.split("?")[0]} — check IDs and Integration sharing permissions') from None
        except urllib.error.URLError as exc:
            if attempt < 4:
                time.sleep(2 + attempt)
                continue
            raise RuntimeError('Notion network error: ' + str(exc.reason)) from None
    raise RuntimeError('Notion retry limit reached')


def paged_blocks(path: str, method: str) -> list[dict]:
    items = []
    cursor = None
    while True:
        if method == 'POST':
            payload = {'page_size': 100}
            if cursor:
                payload['start_cursor'] = cursor
            result = notion('POST', path, payload)
        else:
            query = {'page_size': 100}
            if cursor:
                query['start_cursor'] = cursor
            result = notion('GET', path + '?' + urllib.parse.urlencode(query))
        items.extend(result.get('results') or [])
        if not result.get('has_more'):
            break
        cursor = result.get('next_cursor')
        if not cursor:
            raise RuntimeError('Notion pagination cursor missing')
    return items


def prop(props: dict, *names: str) -> dict:
    for name in names:
        if name in props:
            return props[name]
    return {}


def plain(p: dict) -> str:
    typ = p.get('type')
    if typ in ('title', 'rich_text'):
        return ''.join(x.get('plain_text') or '' for x in p.get(typ) or [])
    if typ in ('select', 'status'):
        return str((p.get(typ) or {}).get('name') or '')
    if typ == 'formula':
        f = p.get('formula') or {}
        return str(f.get(f.get('type', ''), '') or '')
    if typ == 'number' and p.get('number') is not None:
        return str(p['number'])
    return ''


def page_title(props: dict) -> str:
    main = prop(props, '文章名稱', 'Name', '名稱', '標題')
    if main.get('type') == 'title':
        return plain(main).strip()
    for value in props.values():
        if value.get('type') == 'title':
            return plain(value).strip()
    return ''


def normalize_id(v: str) -> str:
    return re.sub('[^a-f0-9]', '', str(v).lower())


def relation_group(props: dict) -> str | None:
    """Map the exact 所屬作品 relation, never infer from story title or CP.

    The serial relation points to the independent work The Distance Between Us.
    Standalone stories must point to the 短篇集 work page.
    """
    relation = prop(props, '所屬作品')
    if relation.get('type') != 'relation':
        return None
    ids = {normalize_id(x.get('id', '')) for x in relation.get('relation') or []}
    if SERIAL_PAGE_ID and SERIAL_PAGE_ID in ids:
        return 'serial'
    if SHORTS_PAGE_ID in ids:
        return 'shorts'
    return None


def is_allowed(page: dict) -> bool:
    props = page.get('properties') or {}
    published = plain(prop(props, '發布狀態', '發佈狀態')).strip() in ('已發布', '已發佈')
    checked = prop(props, '網站公開').get('checkbox') is True
    return published and checked and relation_group(props) is not None


def rich(items: list[dict]) -> list[dict]:
    out = []
    for x in items or []:
        annotations = x.get('annotations') or {}
        url = x.get('href')
        if not url and x.get('type') == 'text':
            url = ((x.get('text') or {}).get('link') or {}).get('url')
        out.append({'text': x.get('plain_text') or '',
                    'href': url if isinstance(url, str) and url.startswith(('https://', 'http://')) else None,
                    'bold': bool(annotations.get('bold')), 'italic': bool(annotations.get('italic')),
                    'underline': bool(annotations.get('underline')),
                    'strikethrough': bool(annotations.get('strikethrough')),
                    'code': bool(annotations.get('code'))})
    return out


def download_image(block: dict) -> str | None:
    spec = block.get('image') or {}
    if spec.get('type') != 'file':
        return None
    url = (spec.get('file') or {}).get('url')
    ident = normalize_id(block.get('id', ''))
    if not url or len(ident) != 32:
        return None
    req = urllib.request.Request(url, headers={'User-Agent': 'UnknownArchiveSync/1.0'})
    with urllib.request.urlopen(req, timeout=55) as resp:
        mime = resp.headers.get('Content-Type', '').split(';')[0].lower().strip()
        ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}.get(mime)
        if not ext:
            raise RuntimeError('Unsupported image MIME type ' + mime)
        raw = resp.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise RuntimeError('An image exceeds the 10 MB download limit')
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    output = IMAGE_DIR / f'{ident}.{ext}'
    if not output.exists() or output.read_bytes() != raw:
        output.write_bytes(raw)
    return './assets/notion/' + output.name


def blocks_for(parent_id: str, depth: int = 0) -> list[dict]:
    if depth > 12:
        return []
    out = []
    for block in paged_blocks('blocks/' + parent_id + '/children', 'GET'):
        t = block.get('type') or 'paragraph'
        spec = block.get(t) or {}
        normalized: dict[str, Any] = {'type': t, 'runs': rich(spec.get('rich_text') or spec.get('title') or [])}
        if t == 'to_do':
            normalized['checked'] = bool(spec.get('checked'))
        if t == 'table_row':
            normalized['cells'] = [rich(c) for c in spec.get('cells', [])]
        if t == 'image':
            if spec.get('type') == 'file':
                normalized['url'] = download_image(block)
            elif spec.get('type') == 'external':
                url = (spec.get('external') or {}).get('url')
                normalized['url'] = url if isinstance(url, str) and url.startswith(('https://', 'http://')) else None
            normalized['caption'] = ''.join(x.get('plain_text') or '' for x in spec.get('caption') or [])
        if t in ('bookmark', 'embed', 'link_preview', 'video'):
            url = spec.get('url') or (spec.get('external') or {}).get('url')
            if isinstance(url, str) and url.startswith(('https://', 'http://')):
                normalized = {'type': 'paragraph', 'runs': [{'text': url, 'href': url}]}
        if block.get('has_children'):
            normalized['children'] = blocks_for(block['id'], depth + 1)
        out.append(normalized)
    return out


def publication_date(props: dict, page: dict) -> str:
    p = prop(props, '發布日期', '發佈日期')
    if p.get('type') == 'date':
        d = (p.get('date') or {}).get('start')
        if isinstance(d, str):
            return d[:10]
    return str(page.get('created_time') or '')[:10]


def verify_work_page(page_id: str, expected_code: str, label: str) -> None:
    """Fail early if a configured page ID is actually a view/database/other work.

    This preflight runs even when every related chapter is an unpublished draft.
    Integration must have Read access to the independent work records.
    """
    page = notion('GET', 'pages/' + page_id)
    props = page.get('properties') or {}
    found_code = plain(prop(props, '作品識別碼')).strip()
    if found_code != expected_code:
        raise RuntimeError(
            f'{label} Page ID does not match the expected 作品識別碼 ({expected_code}); '
            'check that this is the individual work page, not a database view or a different work.'
        )
    print(f'Notion work verified: {label} ({found_code})')


def export() -> None:
    required = {
        'NOTION_TOKEN': TOKEN,
        'NOTION_DATABASE_ID': DATABASE_ID,
        'NOTION_SERIAL_PAGE_ID': SERIAL_PAGE_ID,
        'NOTION_SHORTS_PAGE_ID': SHORTS_PAGE_ID,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError('Missing required GitHub Actions Secrets: ' + ', '.join(missing))
    ids = (DATABASE_ID, SERIAL_PAGE_ID, SHORTS_PAGE_ID)
    if any(len(x) != 32 or not re.fullmatch(r'[a-f0-9]{32}', x) for x in ids):
        raise RuntimeError('Configured Notion IDs must be valid 32-character hex IDs')
    if SHORTS_PAGE_ID == SERIAL_PAGE_ID:
        raise RuntimeError('NOTION_SHORTS_PAGE_ID must be different from NOTION_SERIAL_PAGE_ID')

    # Verify the two *actual work pages*, even if all chapters are still drafts.
    verify_work_page(SERIAL_PAGE_ID, 'the_distance_between_us', 'The Distance Between Us')
    verify_work_page(SHORTS_PAGE_ID, 'unknown_shorts', '短篇集')

    records = paged_blocks('databases/' + DATABASE_ID + '/query', 'POST')
    # Show relation-only counts (including drafts) without reading or printing private bodies.
    relation_counts = {
        'serial': sum(relation_group(x.get('properties') or {}) == 'serial' for x in records),
        'shorts': sum(relation_group(x.get('properties') or {}) == 'shorts' for x in records),
    }
    eligible = [x for x in records if is_allowed(x)]
    stories = []
    keys = set()
    for page in eligible:
        props = page.get('properties') or {}
        group = relation_group(props)
        assert group in ('serial', 'shorts')
        title = page_title(props)
        if not title:
            raise RuntimeError('One public UNKNOWN article is missing its title')
        slug = plain(prop(props, '網站章節識別碼')).strip()
        # Fallback slug is stable and hides the underlying Notion page ID.
        if not slug:
            slug = 'story-' + hashlib.sha256(page['id'].encode('utf-8')).hexdigest()[:14]
        if not SLUG_PATTERN.fullmatch(slug):
            raise RuntimeError('One public UNKNOWN article has an invalid 網站章節識別碼. Use a-z, 0-9, - or _.')
        key = (group, slug)
        if key in keys:
            raise RuntimeError('Duplicate public chapter slug within one UNKNOWN group')
        keys.add(key)
        order_prop = prop(props, '章節順序')
        order = order_prop.get('number') if order_prop.get('type') == 'number' else None
        if group == 'serial' and (not isinstance(order, (int, float)) or isinstance(order, bool)):
            raise RuntimeError('A published serial chapter is missing numeric 章節順序')
        if isinstance(order, (int, float)) and not isinstance(order, bool):
            order = int(order)
        else:
            order = 0
        cp = prop(props, 'CP / 配對', 'CP／配對', 'CP')
        pairs = ([v.get('name') for v in cp.get('multi_select') or [] if v.get('name')]
                 if cp.get('type') == 'multi_select' else ([plain(cp)] if plain(cp) else []))
        rating = plain(prop(props, '閱讀分級')) or '一般'
        subtitle = plain(prop(props, '副標題'))
        stories.append({'work': group, 'slug': slug, 'title': title, 'subtitle': subtitle, 'chapterNumber': order,
                        'cp': pairs, 'ageRating': rating, 'chapterType': plain(prop(props, '章節類型')) or '短篇',
                        'publishedAt': publication_date(props, page), 'blocks': blocks_for(page['id'])})

    # Catch duplicate chapter orders: the serial must have an unambiguous progression.
    sequence = [x['chapterNumber'] for x in stories if x['work'] == 'serial']
    if len(sequence) != len(set(sequence)):
        raise RuntimeError('Duplicate 章節順序 found in published The Distance Between Us chapters')
    stories.sort(key=lambda x: (x['work'], x['chapterNumber'], x['slug']))
    output = {'site': 'UNKNOWN — 關於未知的我們', 'updatedAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), 'chapters': stories}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Ignore updatedAt if nothing changed; don't create daily empty commits.
    old = None
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            pass
    if isinstance(old, dict) and old.get('chapters') == stories:
        output['updatedAt'] = old.get('updatedAt')
    encoded = json.dumps(output, ensure_ascii=False, indent=2) + '\n'
    if not OUT.exists() or OUT.read_text(encoding='utf-8') != encoded:
        OUT.write_text(encoded, encoding='utf-8')

    # Remove image files that are no longer used by currently public articles.
    keep = set()
    def traverse(nodes: list[dict]) -> None:
        for b in nodes:
            uri = b.get('url')
            if isinstance(uri, str) and uri.startswith('./assets/notion/'):
                keep.add(uri.rsplit('/', 1)[-1])
            traverse(b.get('children') or [])
    for x in stories:
        traverse(x['blocks'])
    if IMAGE_DIR.exists():
        for f in IMAGE_DIR.iterdir():
            if f.is_file() and re.fullmatch(r'[a-f0-9]{32}\.(?:jpg|png|webp|gif)', f.name) and f.name not in keep:
                f.unlink()
    print(f'Notion database records: {len(records)}')
    print(f'Related serial records (including drafts, metadata only): {relation_counts["serial"]}')
    print(f'Related standalone short story records (including drafts, metadata only): {relation_counts["shorts"]}')
    print(f'Eligible public UNKNOWN records matching configured work IDs: {len(eligible)}')
    print(f'Exported public serial chapters: {sum(x["work"] == "serial" for x in stories)}')
    print(f'Exported public standalone short stories: {sum(x["work"] == "shorts" for x in stories)}')
    print('Unpublished and website-private article bodies were NOT read or exported.')


if __name__ == '__main__':
    try:
        export()
    except Exception as exc:
        print('Sync failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)
