import time
from django.contrib.auth import logout
from django.http import JsonResponse
from .models import AccountSecurity


class SecurityBoundaryMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.cedar_profile = None
        if request.user.is_authenticated:
            profile = AccountSecurity.objects.filter(user_id=request.user.pk).first()
            now = int(time.time())
            started = request.session.get('cedar_started', 0)
            seen = request.session.get('cedar_seen', 0)
            if (not profile or request.session.get('cedar_version') != profile.version
                    or not request.session.get('cedar_mfa') or now - started >= 8 * 3600
                    or now - seen >= 1800 or started > now or seen > now):
                logout(request)
            else:
                request.cedar_profile = profile
                if now - seen >= 60:
                    request.session['cedar_seen'] = now
        response = self.get_response(request)
        if request.path.startswith(('/api/', '/internal/')):
            response['Cache-Control'] = 'no-store, private'
            response['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            response['Referrer-Policy'] = 'no-referrer'
            response['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response


def csrf_failure(request, reason=''):
    return JsonResponse({'error': 'Request verification failed.'}, status=403, headers={'Cache-Control':'no-store'})
