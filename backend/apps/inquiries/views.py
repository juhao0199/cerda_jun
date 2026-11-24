import logging
from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from drf_spectacular.utils import extend_schema
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ParseError, UnsupportedMediaType
from .serializers import InquirySerializer, ReceiptSerializer, ErrorSerializer
from .services import save_inquiry

logger = logging.getLogger(__name__)

class InquiryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response

    @extend_schema(request=InquirySerializer, responses={200: ReceiptSerializer, 201: ReceiptSerializer,
        400: ErrorSerializer, 403: ErrorSerializer, 409: ErrorSerializer, 413: ErrorSerializer,
        415: ErrorSerializer, 429: ErrorSerializer, 503: ErrorSerializer}, auth=[])
    def post(self, request):
        def error(message, status):
            return Response({'error': message}, status=status)
        if request.headers.get('Origin') != settings.SITE_ORIGIN:
            return error('Origin not allowed.', 403)
        if request.content_type.split(';')[0].strip().lower() != 'application/json':
            return error('Expected JSON.', 415)
        try:
            if len(request.body) > 24000:
                return error('Request too large.', 413)
            serializer = InquirySerializer(data=request.data)
        except RequestDataTooBig:
            return error('Request too large.', 413)
        except (ParseError, UnicodeError):
            return error('Invalid JSON.', 400)
        except UnsupportedMediaType:
            return error('Expected JSON.', 415)
        if not serializer.is_valid():
            return error('Please check your project and contact details.', 400)
        try:
            result = save_inquiry(serializer.validated_data)
        except DatabaseError:
            logger.error('Inquiry persistence failed')
            return error('Unable to save inquiry. Please try again.', 503)
        if result.kind == 'limited':
            return error('Too many requests. Please try later.', 429)
        if result.kind == 'conflict':
            return error('Request reference already used for different details.', 409)
        return Response({'reference': str(result.reference)}, status=201 if result.kind == 'created' else 200)

@require_GET
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except DatabaseError:
        return JsonResponse({'status': 'unavailable'}, status=503, headers={'Cache-Control':'no-store'})
    return JsonResponse({'status': 'ok'}, headers={'Cache-Control':'no-store'})
