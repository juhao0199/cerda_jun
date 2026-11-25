from .rich_content import normalize_document, word_count
import re

COVERS = ('', 'web', 'software', 'ai')
UPLOAD_COVER = re.compile(r'upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z')
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\Z')
FIELDS = {'title', 'summary', 'category', 'tags', 'sections', 'seoTitle', 'seoDescription', 'cover'}


def slug_value(value):
    if not isinstance(value, str) or len(value) > 100 or not SLUG.fullmatch(value):
        raise ValueError('Use a lowercase slug with letters, digits and hyphens.')
    return value


def text(value, maximum, minimum=0):
    if not isinstance(value, str):
        raise ValueError('Invalid text.')
    value = value.strip()
    value.encode('utf-8')
    if not minimum <= len(value) <= maximum or any((ord(c) < 32 and c not in '\n\t\r') or ord(c) in (0xfffe, 0xffff) for c in value):
        raise ValueError('Invalid text length or characters.')
    return value


def normalize(data):
    if not isinstance(data, dict) or not FIELDS <= set(data) or set(data) - (FIELDS | {'document'}):
        raise ValueError('Invalid article fields.')
    sections, tags = data['sections'], data['tags']
    rich = 'document' in data
    if not isinstance(sections, list) or (rich and sections != []) or (not rich and not 1 <= len(sections) <= 20) or not isinstance(tags, list) or len(tags) > 10:
        raise ValueError('Use 1–20 sections and at most 10 tags.')
    result = []
    for section in sections:
        if not isinstance(section, dict) or set(section) != {'heading', 'body'}:
            raise ValueError('Invalid section.')
        result.append({'heading': text(section['heading'], 160, 1), 'body': text(section['body'], 6000, 1)})
    if sum(len(s['body'].encode('utf-8')) + len(s['heading'].encode('utf-8')) for s in result) > 17000:
        raise ValueError('Article content exceeds 17 KB.')
    tags = [text(t, 40, 1) for t in tags]
    if any(',' in t for t in tags) or len({t.casefold() for t in tags}) != len(tags):
        raise ValueError('Tags must be unique and cannot contain commas.')
    cover = data['cover']
    if not isinstance(cover, str) or (cover not in COVERS and not UPLOAD_COVER.fullmatch(cover)):
        raise ValueError('Invalid cover.')
    fields = {'title': text(data['title'], 160, 1), 'summary': text(data['summary'], 320, 1),
            'category': text(data['category'], 60, 1), 'tags': tags, 'sections': result,
            'seoTitle': text(data['seoTitle'], 100), 'seoDescription': text(data['seoDescription'], 320), 'cover': cover}
    if rich:
        fields['document'], _ = normalize_document(data['document'])
    return fields


def minutes(fields):
    if 'document' in fields:
        return max(1, (word_count(fields['document']) + 199) // 200)
    return max(1, (sum(len(s['body'].split()) for s in fields['sections']) + 199) // 200)
