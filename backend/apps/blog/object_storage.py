"""Optional private S3-compatible storage; never expose bucket URLs to visitors."""
import os
import re
from functools import lru_cache
from urllib.parse import urlsplit
from .image_codec import MAX_OUTPUT


class StorageError(Exception):
    pass


def enabled():
    return os.getenv('BLOG_OBJECT_STORAGE', 'database') == 's3'


@lru_cache(maxsize=1)
def client():
    import boto3
    from botocore.config import Config
    endpoint = os.getenv('BLOG_S3_ENDPOINT') or None
    if endpoint:
        url = urlsplit(endpoint)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise StorageError('Private object storage requires an HTTPS endpoint.')
    return boto3.client('s3', endpoint_url=endpoint, region_name=os.getenv('BLOG_S3_REGION', 'us-east-1'),
                        config=Config(connect_timeout=3, read_timeout=10, retries={'max_attempts': 1}, s3={'addressing_style': 'path'}))


def bucket():
    value = os.getenv('BLOG_S3_BUCKET', '')
    if not value:
        raise StorageError('Object storage bucket not configured.')
    return value


def put(image_id, data):
    key = f'blog/images/{image_id}.jpg'
    try:
        client().put_object(Bucket=bucket(), Key=key, Body=data, ContentType='image/jpeg')
        if get(key) != data:
            raise StorageError('Object verification failed.')
        return key
    except Exception as exc:
        raise StorageError('Image storage unavailable.') from exc


def get(key):
    if not re.fullmatch(r'blog/images/[0-9a-f-]{36}\.jpg', key):
        raise StorageError('Invalid object key.')
    try:
        result = client().get_object(Bucket=bucket(), Key=key)
        body = result['Body']
        try:
            data = body.read(MAX_OUTPUT + 1)
        finally:
            body.close()
        if not data or len(data) > MAX_OUTPUT:
            raise StorageError('Invalid stored image.')
        return data
    except Exception as exc:
        raise StorageError('Image storage unavailable.') from exc
