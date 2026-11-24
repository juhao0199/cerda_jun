from io import BytesIO
from unittest import TestCase
from PIL import Image
from .image_codec import encode_cover, MAX_UPLOAD


class CoverCodecTests(TestCase):
    def test_reencodes_resizes_and_removes_exif(self):
        buffer = BytesIO()
        image = Image.new('RGB', (2400, 1200), 'gray')
        exif = Image.Exif()
        exif[270] = 'Private metadata'
        image.save(buffer, format='JPEG', exif=exif)
        data, width, height = encode_cover(buffer.getvalue())
        with Image.open(BytesIO(data)) as output:
            self.assertEqual(output.format, 'JPEG')
            self.assertEqual(output.size, (1600, 800))
            self.assertFalse(output.getexif())
        self.assertEqual((width, height), (1600, 800))

    def test_rejects_unsupported_animated_and_oversized(self):
        for raw in (b'', b'<svg/>', b'x'*(MAX_UPLOAD+1)):
            with self.assertRaises(ValueError):
                encode_cover(raw)
        buffer = BytesIO()
        Image.new('RGB', (4001, 4000)).save(buffer, format='PNG')
        with self.assertRaises(ValueError):
            encode_cover(buffer.getvalue())
        buffer = BytesIO()
        Image.new('RGB', (16, 16), 'red').save(buffer, format='GIF', save_all=True,
            append_images=[Image.new('RGB', (16, 16), 'blue')])
        with self.assertRaises(ValueError):
            encode_cover(buffer.getvalue())

    def test_png_transparency_and_webp(self):
        for fmt in ('PNG', 'WEBP'):
            buffer = BytesIO()
            Image.new('RGBA', (20, 10), (0, 0, 0, 0)).save(buffer, format=fmt)
            data, _, _ = encode_cover(buffer.getvalue())
            with Image.open(BytesIO(data)) as output:
                self.assertEqual(output.mode, 'RGB')
                self.assertEqual(output.getpixel((0, 0)), (255, 255, 255))
