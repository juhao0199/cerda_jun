import os
from pathlib import Path
from urllib.parse import urlsplit
from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv('DJANGO_DEBUG', '0') == '1'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY or (not DEBUG and (len(SECRET_KEY) < 50 or SECRET_KEY.startswith(('replace_', 'django-insecure')))):
    raise ImproperlyConfigured('Set a strong DJANGO_SECRET_KEY.')
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
SITE_ORIGIN = os.getenv('SITE_ORIGIN', 'http://localhost:3000').rstrip('/')
CSRF_TRUSTED_ORIGINS = [SITE_ORIGIN]
CEDAR_MFA_KEY = os.getenv('CEDAR_MFA_KEY', '')
try:
    Fernet(CEDAR_MFA_KEY.encode())
except (ValueError, TypeError) as exc:
    raise ImproperlyConfigured('Set CEDAR_MFA_KEY to a valid Fernet key.') from exc
CEDAR_TRUST_EDGE = os.getenv('CEDAR_TRUST_EDGE', '0') == '1'
if not DEBUG:
    if CEDAR_MFA_KEY == 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=':
        raise ImproperlyConfigured('The CI MFA key is not allowed in production.')
    origin = urlsplit(SITE_ORIGIN)
    if (origin.scheme != 'https' or not origin.hostname or origin.username or origin.password or origin.path or origin.query or origin.fragment
            or '*' in ALLOWED_HOSTS or origin.hostname not in ALLOWED_HOSTS or not CEDAR_TRUST_EDGE):
        raise ImproperlyConfigured('Production requires HTTPS SITE_ORIGIN, explicit hosts and a private trusted edge.')
    if len(os.getenv('POSTGRES_PASSWORD', '')) < 24 or os.getenv('POSTGRES_PASSWORD', '').startswith('replace_'):
        raise ImproperlyConfigured('Set a strong PostgreSQL password.')
INSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'rest_framework', 'drf_spectacular', 'apps.inquiries', 'apps.accounts', 'apps.quotations', 'apps.blog']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware', 'apps.accounts.middleware.SecurityBoundaryMiddleware', 'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'APP_DIRS': True,
    'OPTIONS': {'context_processors': ['django.template.context_processors.request',
    'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql',
    'NAME': os.getenv('POSTGRES_DB', 'cedar_cursor'), 'USER': os.getenv('POSTGRES_USER', 'cedar_dev'),
    'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''), 'HOST': os.getenv('POSTGRES_HOST', '127.0.0.1'),
    'PORT': os.getenv('POSTGRES_PORT', '5432'), 'CONN_MAX_AGE': 60, 'CONN_HEALTH_CHECKS': True,
    'OPTIONS': {'sslmode': os.getenv('POSTGRES_SSLMODE', 'prefer'), 'connect_timeout': 5}}}
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.' + name} for name in (
    'UserAttributeSimilarityValidator', 'CommonPasswordValidator', 'NumericPasswordValidator')] + [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 15}}]
PASSWORD_HASHERS = ['django.contrib.auth.hashers.Argon2PasswordHasher', 'django.contrib.auth.hashers.PBKDF2PasswordHasher',
                    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher', 'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
                    'django.contrib.auth.hashers.ScryptPasswordHasher']
AUTHENTICATION_BACKENDS = ['django.contrib.auth.backends.ModelBackend']
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
DATA_UPLOAD_MAX_MEMORY_SIZE = 24000
SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_NAME = 'cedar_session' if DEBUG else '__Host-cedar_session'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 8 * 3600
SESSION_COOKIE_DOMAIN = None
SESSION_COOKIE_PATH = '/'
CSRF_COOKIE_NAME = 'cedar_csrf' if DEBUG else '__Host-cedar_csrf'
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_DOMAIN = None
CSRF_COOKIE_PATH = '/'
CSRF_FAILURE_VIEW = 'apps.accounts.middleware.csrf_failure'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
X_FRAME_OPTIONS = 'DENY'
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
if CEDAR_TRUST_EDGE:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
REST_FRAMEWORK = {'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['apps.accounts.permissions.DenyByDefault'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema'}
SPECTACULAR_SETTINGS = {'TITLE': 'Cedar & Cursor API', 'VERSION': '1.0.0', 'SERVE_INCLUDE_SCHEMA': False}
