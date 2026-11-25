import uuid
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from apps.accounts.security import audit, reserve_attempt, source_ip
from apps.accounts.views import fail, require_role
from apps.inquiries.crm import locked_role
from .image_codec import encode_cover, MAX_UPLOAD
from .models import CoverImage, Post
from . import object_storage
from .content import text


@require_POST
@csrf_protect
@require_role('owner', 'staff')
def upload(request):
    if request.headers.get('Origin') != settings.SITE_ORIGIN:
        return fail('Request verification failed.', 403)
    if request.content_type != 'application/octet-stream':
        return fail('Expected raw image bytes.', 415)
    try:
        length = int(request.META.get('CONTENT_LENGTH') or '')
    except ValueError:
        return fail('Content length required.', 411)
    if not 0 < length <= MAX_UPLOAD:
        return fail('Choose an image up to 5 MB.', 413)
    if not reserve_attempt('blog.cover', source_ip(request), str(request.user.pk)):
        return fail('Too many uploads. Try again in a few minutes.', 429)
    try:
        # Bounded raw read: do not raise the global 24 KB JSON request limit.
        raw = request.read(MAX_UPLOAD + 1)
        if len(raw) != length:
            return fail('Invalid upload length.', 400)
        data, width, height = encode_cover(raw)
    except (ValueError, OSError) as exc:
        return fail(str(exc) if isinstance(exc, ValueError) else 'Invalid upload.', 400)
    try:
        name = text(request.GET.get('name', 'image.jpg'), 120, 1)
        if set(request.GET) - {'name'} or len(request.GET.getlist('name')) > 1:
            return fail('Invalid image name.', 400)
    except (ValueError, UnicodeError):
        return fail('Invalid image name.', 400)
    image_id = uuid.uuid4()
    with transaction.atomic():
        if not locked_role(request):
            return fail('Access denied.', 403)
        try:
            key = object_storage.put(image_id, data) if object_storage.enabled() else ''
        except object_storage.StorageError:
            return fail('Image storage unavailable.', 503)
        image = CoverImage.objects.create(id=image_id, data=b'' if key else data, object_key=key, filename=name, size_bytes=len(data), width=width, height=height, actor_id=request.user.pk)
        audit('blog.cover.upload', request.user, subject=str(image.pk))
    return JsonResponse({'cover': f'upload:{image.pk}', 'width': width, 'height': height}, status=201)


def image_response(image_id):
    image = CoverImage.objects.filter(pk=image_id).first()
    if image is None:
        return fail('Image not found.', 404)
    try:
        data = bytes(image.data) or object_storage.get(image.object_key)
    except object_storage.StorageError:
        return fail('Image storage unavailable.', 503)
    return HttpResponse(data, content_type='image/jpeg', headers={
        'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="cover.jpg"',
    })


@require_GET
@require_role('owner', 'staff')
def private_cover(request, image_id):
    return image_response(image_id)


@require_GET
def public_cover(request, image_id):
    if not Post.objects.filter(status='published', published_at__isnull=False,
                               published__isnull=False).filter(
                               Q(published__cover=f'upload:{image_id}') |
                               Q(published__document__content__contains=[{'type': 'studioImage', 'attrs': {'ref': f'upload:{image_id}'}}])
                               ).exists():
        return fail('Image not found.', 404)
    return image_response(image_id)
