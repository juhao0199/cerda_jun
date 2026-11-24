"""Decode bounded raster input and generate an immutable, metadata-free JPEG."""
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000
MAX_EDGE = 1600
MAX_OUTPUT = 2 * 1024 * 1024
FORMATS = {'JPEG', 'PNG', 'WEBP'}


def encode_cover(raw):
    if not raw or len(raw) > MAX_UPLOAD:
        raise ValueError('Choose an image up to 5 MB.')
    try:
        with Image.open(BytesIO(raw)) as source:
            if (source.format not in FORMATS or getattr(source, 'n_frames', 1) != 1
                    or source.width * source.height > MAX_PIXELS or min(source.size) < 1):
                raise ValueError('Use a static JPG, PNG or WebP up to 16 megapixels.')
            source.load()
            oriented = ImageOps.exif_transpose(source)
            oriented.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            rgba = oriented.convert('RGBA')
            clean = Image.new('RGB', rgba.size, 'white')
            clean.paste(rgba, mask=rgba.getchannel('A'))
            output = BytesIO()
            clean.save(output, format='JPEG', quality=85, optimize=True)
            data = output.getvalue()
            if len(data) > MAX_OUTPUT:
                raise ValueError('Processed image is too large.')
            return data, clean.width, clean.height
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, OverflowError) as exc:
        raise ValueError('Invalid or unsupported image.') from exc
