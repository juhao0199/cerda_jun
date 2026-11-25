import unittest
from io import BytesIO
from unittest.mock import patch
from . import object_storage as storage


class ObjectStorageTests(unittest.TestCase):
    def test_round_trip_and_fail_closed(self):
        objects={}
        class Fake:
            def put_object(self, Bucket, Key, Body, ContentType):
                objects[(Bucket, Key)] = Body
            def get_object(self, Bucket, Key):
                return {'Body': BytesIO(objects[(Bucket, Key)])}
        with patch.object(storage, 'client', return_value=Fake()), patch.object(storage, 'bucket', return_value='private'):
            key=storage.put('12345678-1234-1234-1234-123456789abc', b'jpeg test bytes')
            self.assertEqual(storage.get(key), b'jpeg test bytes')
            with self.assertRaises(storage.StorageError):
                storage.get('other/path')
            objects[('private',key)]=b'x'*(storage.MAX_OUTPUT+1)
            with self.assertRaises(storage.StorageError):
                storage.get(key)

    def test_verified_copy_mismatch(self):
        class Fake:
            def put_object(self, **kwargs):
                pass
            def get_object(self, **kwargs):
                return {'Body':BytesIO(b'wrong')}
        with patch.object(storage,'client',return_value=Fake()), patch.object(storage,'bucket',return_value='private'):
            with self.assertRaises(storage.StorageError):
                storage.put('12345678-1234-1234-1234-123456789abc', b'expected')
