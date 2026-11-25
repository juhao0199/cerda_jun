"""Bounded Tiptap JSON contract. No HTML, arbitrary attributes or external images."""
import re
from urllib.parse import urlsplit

MAX_JSON = 256 * 1024
MAX_TEXT = 80000
IMAGE_REF = re.compile(r'upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
INLINE = {'text', 'hardBreak'}
BLOCK = {'paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'table', 'studioImage'}
MARKS = {'bold', 'italic', 'underline', 'strike', 'code', 'link'}


def safe_link(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 2048 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 or c == '\\' for c in value):
        raise ValueError('Invalid link.')
    if value.startswith('/') and not value.startswith('//'):
        return value
    try:
        url = urlsplit(value)
        if url.scheme in ('https', 'http') and url.hostname and not url.username and not url.password:
            _ = url.port
            return value
    except ValueError:
        pass
    raise ValueError('Links must use HTTP(S) or a local absolute path.')


def normalize_document(doc):
    from .content import text
    count = 0
    size = 0
    refs = set()
    meaningful = False

    def mark(m):
        if not isinstance(m, dict) or not isinstance(m.get('type'), str) or m['type'] not in MARKS or set(m) - {'type', 'attrs'}:
            raise ValueError('Unsupported formatting mark.')
        kind = m['type']
        attrs = m.get('attrs', {})
        if not isinstance(attrs, dict):
            raise ValueError('Invalid mark attributes.')
        if kind == 'link':
            if set(attrs) - {'href', 'target', 'rel', 'class', 'title'}:
                raise ValueError('Invalid link attributes.')
            return {'type': kind, 'attrs': {'href': safe_link(attrs.get('href'))}}
        if attrs:
            raise ValueError('Unexpected formatting attributes.')
        return {'type': kind}

    def node(n, allowed, depth=0):
        nonlocal count, size, meaningful
        count += 1
        if depth > 16 or count > 4000 or not isinstance(n, dict) or set(n) - {'type', 'attrs', 'content', 'text', 'marks'} or not isinstance(n.get('type'), str) or n['type'] not in allowed:
            raise ValueError('Unsupported or overly complex content block.')
        kind = n['type']
        attrs = n.get('attrs', {})
        children = n.get('content', [])
        if not isinstance(attrs, dict) or not isinstance(children, list) or len(children) > 4000:
            raise ValueError('Invalid block attributes or children.')
        out = {'type': kind}
        if kind == 'text':
            if attrs or children or not isinstance(n.get('text'), str) or not n['text']:
                raise ValueError('Invalid text node.')
            raw = n['text']
            # Validate without stripping significant inter-word spaces or code indentation.
            raw.encode('utf-8')
            if any((ord(c) < 32 and c not in '\n\t\r') or ord(c) in (0xfffe, 0xffff) for c in raw):
                raise ValueError('Invalid text characters.')
            size += len(raw.encode('utf-8'))
            if size > MAX_TEXT:
                raise ValueError('Article text exceeds 80 KB.')
            meaningful |= bool(raw.strip())
            out['text'] = raw
            marks = n.get('marks', [])
            if not isinstance(marks, list) or len(marks) > 6:
                raise ValueError('Invalid formatting.')
            normalized = [mark(m) for m in marks]
            if len({m['type'] for m in normalized}) != len(normalized):
                raise ValueError('Duplicate formatting.')
            if normalized:
                out['marks'] = normalized
            return out
        if 'text' in n or 'marks' in n:
            raise ValueError('Unexpected text or marks.')
        if kind == 'studioImage':
            if children or set(attrs) != {'ref', 'alt', 'caption'} or not isinstance(attrs['ref'], str) or not IMAGE_REF.fullmatch(attrs['ref']):
                raise ValueError('Invalid article image.')
            alt, caption = text(attrs['alt'], 250, 1), text(attrs['caption'], 500)
            refs.add(attrs['ref'])
            if len(refs) > 30:
                raise ValueError('Use at most 30 distinct images.')
            meaningful = True
            out['attrs'] = {'ref': attrs['ref'], 'alt': alt, 'caption': caption}
            return out
        if kind in ('hardBreak', 'horizontalRule'):
            if attrs or children:
                raise ValueError('Invalid leaf node.')
            return out
        if kind == 'heading':
            if set(attrs) != {'level'} or type(attrs['level']) is not int or not 2 <= attrs['level'] <= 6:
                raise ValueError('Use headings H2–H6.')
            out['attrs'] = {'level': attrs['level']}
        elif kind == 'orderedList':
            start = attrs.get('start', 1)
            if set(attrs) - {'start', 'type'} or type(start) is not int or not 1 <= start <= 10000 or attrs.get('type') not in (None, '1'):
                raise ValueError('Invalid ordered list.')
            out['attrs'] = {'start': start}
        elif kind == 'codeBlock':
            language = attrs.get('language')
            if set(attrs) - {'language'} or (language is not None and (not isinstance(language, str) or not re.fullmatch(r'[a-zA-Z0-9_+#.-]{1,30}', language))):
                raise ValueError('Invalid code language.')
            if language:
                out['attrs'] = {'language': language}
        elif kind in ('tableCell', 'tableHeader'):
            if set(attrs) - {'colspan', 'rowspan', 'colwidth', 'align'} or attrs.get('colspan', 1) != 1 or attrs.get('rowspan', 1) != 1 or attrs.get('colwidth') is not None or attrs.get('align') is not None:
                raise ValueError('Merged, resized and aligned cells are not supported.')
        elif attrs:
            raise ValueError('Unexpected block attributes.')
        allowed_children = {
            'doc': BLOCK, 'paragraph': INLINE, 'heading': INLINE, 'codeBlock': {'text'},
            'bulletList': {'listItem'}, 'orderedList': {'listItem'},
            'listItem': BLOCK - {'studioImage', 'table'}, 'blockquote': BLOCK - {'studioImage', 'table'},
            'table': {'tableRow'}, 'tableRow': {'tableCell', 'tableHeader'},
            'tableCell': {'paragraph'}, 'tableHeader': {'paragraph'},
        }[kind]
        if kind not in ('paragraph', 'heading', 'codeBlock') and not children:
            raise ValueError('Empty content container.')
        if kind == 'listItem' and (not isinstance(children[0], dict) or children[0].get('type') != 'paragraph'):
            raise ValueError('List items must begin with a paragraph.')
        if kind == 'table' and len(children) > 30 or kind == 'tableRow' and len(children) > 10:
            raise ValueError('Tables support at most 30 rows and 10 columns.')
        normalized = [node(c, allowed_children, depth+1) for c in children]
        if kind == 'codeBlock' and any(c.get('marks') for c in normalized):
            raise ValueError('Formatting marks are not allowed inside code blocks.')
        if kind == 'table' and len({len(r['content']) for r in normalized}) != 1:
            raise ValueError('Table rows must have equal widths.')
        if normalized:
            out['content'] = normalized
        return out

    result = node(doc, {'doc'})
    if not meaningful:
        raise ValueError('Write article content before saving.')
    return result, sorted(refs)


def word_count(doc):
    if not doc:
        return 0
    return len(doc.get('text', '').split()) + sum(word_count(c) for c in doc.get('content', []))
