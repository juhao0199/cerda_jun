"""Media metadata and safe reuse. Images referenced by any revision are retained."""
from uuid import UUID
from django.db import transaction
from django.db.models import Q, Sum
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit
from apps.inquiries.crm import locked_role, pagination
from .content import text
from .models import CoverImage, Post, Revision


def reference_query(field, ref):
    return Q(**{field+'__cover': ref}) | Q(**{field+'__document__content__contains': [
        {'type': 'studioImage', 'attrs': {'ref': ref}}]})


def usage(image_id):
    ref = f'upload:{image_id}'
    posts = Post.objects.filter(reference_query('draft', ref) | reference_query('published', ref))
    revisions = Revision.objects.filter(reference_query('snapshot', ref))
    return {'articles': list(posts.order_by('slug').values_list('slug', flat=True)[:100]),
            'articleCount': posts.count(), 'revisionCount': revisions.count()}


def row(image):
    return {'id': str(image.pk), 'ref': f'upload:{image.pk}', 'filename': image.filename,
            'alt': image.alt, 'caption': image.caption, 'width': image.width, 'height': image.height,
            'bytes': image.size_bytes, 'version': image.version, 'createdAt': image.created_at.isoformat(),
            'storage': 'object' if image.object_key else 'database'}


@require_GET
@require_role('owner', 'staff')
def listing(request):
    parsed = pagination(request, {'page', 'q'})
    if parsed is None:
        return fail('Invalid media filters.', 400)
    page, query = parsed
    qs = CoverImage.objects.defer('data')
    totals = qs.aggregate(bytes=Sum('size_bytes'))
    count = qs.count()
    if query:
        qs = qs.filter(Q(filename__icontains=query) | Q(alt__icontains=query) | Q(caption__icontains=query))
    start = (page-1)*24
    rows = list(qs.order_by('-created_at', 'id')[start:start+25])
    return JsonResponse({'results': [row(i) for i in rows[:24]], 'page': page, 'hasMore': len(rows)>24,
                         'count': count, 'bytes': totals['bytes'] or 0})


@require_GET
@require_role('owner', 'staff')
def detail(request, image_id):
    image = CoverImage.objects.defer('data').filter(pk=image_id).first()
    if not image:
        return fail('Image not found.', 404)
    return JsonResponse({**row(image), **usage(image_id)})


@json_post
@require_role('owner', 'staff')
def change(request, data):
    action = data.get('action')
    required = {'id','version','action'}
    try:
        if action not in ('edit', 'delete') or set(data) != (required | {'filename','alt','caption'} if action == 'edit' else required):
            raise ValueError('Invalid media action.')
        if not isinstance(data['id'], str) or type(data['version']) is not int or not 1 <= data['version'] < 2**53:
            raise ValueError('Invalid image version.')
        image_id = UUID(data['id'])
        if action == 'edit':
            filename = text(data['filename'], 120, 1)
            alt, caption = text(data['alt'], 250), text(data['caption'], 500)
    except (ValueError, UnicodeError, TypeError) as exc:
        return fail(str(exc), 400)
    with transaction.atomic():
        role = locked_role(request)
        if not role or (action == 'delete' and role != 'owner'):
            return fail('Access denied.', 403)
        image = CoverImage.objects.defer('data').select_for_update().filter(pk=image_id).first()
        if not image:
            return fail('Image not found.', 404)
        if image.version != data['version']:
            return fail('Image changed. Reload before editing.', 409)
        if action == 'delete':
            used = usage(image_id)
            if used['articleCount'] or used['revisionCount']:
                return fail('Image is referenced by an article or historical revision.', 409)
            # Object deletion is deliberately not a remote side effect inside a DB transaction.
            # Private orphan objects can be cleaned by a separate operator after backup.
            image.delete()
            audit('blog.media.delete', request.user, subject=str(image_id))
            return JsonResponse({'deleted': True})
        image.filename, image.alt, image.caption = filename, alt, caption
        image.version += 1
        image.save(update_fields=['filename','alt','caption','version'])
        audit('blog.media.edit', request.user, subject=str(image_id))
        return JsonResponse({**row(image), **usage(image_id)})


@json_post
@require_role('owner', 'staff')
def derive(request, data):
    from io import BytesIO
    from PIL import Image, ImageOps
    from . import object_storage
    from .image_codec import encode_cover
    from apps.accounts.security import reserve_attempt, source_ip
    import uuid
    if (set(data) != {'id', 'rotation', 'ratio'} or not isinstance(data['id'], str)
            or type(data['rotation']) is not int or data['rotation'] not in (0, 90, 180, 270)
            or data['ratio'] not in ('original','square','wide','portrait')):
        return fail('Invalid image transformation.', 400)
    try:
        image_id = UUID(data['id'])
    except ValueError:
        return fail('Invalid image ID.', 400)
    if not reserve_attempt('blog.cover', source_ip(request), str(request.user.pk)):
        return fail('Too many uploads. Try again in a few minutes.', 429)
    with transaction.atomic():
        if not locked_role(request):
            return fail('Access denied.', 403)
        source = CoverImage.objects.select_for_update().filter(pk=image_id).first()
        if not source:
            return fail('Image not found.', 404)
        try:
            raw = bytes(source.data) or object_storage.get(source.object_key)
            with Image.open(BytesIO(raw)) as original:
                image = original.rotate(-data['rotation'], expand=True)
                ratios = {'square': (1,1), 'wide': (1200,630), 'portrait': (3,4)}
                if data['ratio'] in ratios:
                    w,h = ratios[data['ratio']]
                    scale = min(image.width/w, image.height/h)
                    image = ImageOps.fit(image, (max(1,int(w*scale)), max(1,int(h*scale))))
                out = BytesIO(); image.save(out, format='JPEG', quality=95)
                processed, width, height = encode_cover(out.getvalue())
            new_id = uuid.uuid4()
            key = object_storage.put(new_id, processed) if object_storage.enabled() else ''
        except object_storage.StorageError:
            return fail('Image storage unavailable.', 503)
        except (ValueError, OSError):
            return fail('Image transformation failed.', 400)
        result = CoverImage.objects.create(id=new_id, data=b'' if key else processed, object_key=key,
            filename=('Copy - '+source.filename)[:120], alt=source.alt, caption=source.caption,
            size_bytes=len(processed), width=width, height=height, actor_id=request.user.pk)
        audit('blog.media.derive', request.user, subject=str(new_id))
        return JsonResponse(row(result), status=201)
