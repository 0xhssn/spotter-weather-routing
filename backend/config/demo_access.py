"""One shared, high-entropy demo password; with short-lived, signed reviewer access tokens."""
import hashlib
import hmac
import secrets

from django.conf import settings
from django.core import signing
from django.http import JsonResponse


TOKEN_PREFIX = 'demo.'
TOKEN_MAX_AGE = 12 * 60 * 60


def token_signer():
    # Rotation of either the password or Django secret invalidates old tokens.
    return signing.TimestampSigner(salt='waywise.demo.' + settings.DEMO_ACCESS_PASSWORD_SHA256,
                                   fallback_keys=[])


def issue_access_token():
    return TOKEN_PREFIX + token_signer().sign_object({'nonce': secrets.token_urlsafe(16)})


def valid_access_token(value):
    if not value.startswith(TOKEN_PREFIX):
        return False
    try:
        data = token_signer().unsign_object(value[len(TOKEN_PREFIX):], max_age=TOKEN_MAX_AGE)
        return isinstance(data, dict) and isinstance(data.get('nonce'), str)
    except (signing.BadSignature, ValueError, TypeError):
        return False


class DemoAccessMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        expected = settings.DEMO_ACCESS_PASSWORD_SHA256
        public = (request.method == 'OPTIONS'
                  or (request.method == 'GET' and request.path in ('/api/health', '/api/access')))
        if expected and not public:
            authorization = request.headers.get('Authorization', '')
            scheme, _, password = authorization.partition(' ')
            password_valid = (1 <= len(password) <= 256
                              and hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), expected))
            valid = (scheme.lower() == 'bearer' and len(password) <= 512
                     and (password_valid or valid_access_token(password)))
            request.demo_password_authenticated = valid and password_valid
            if not valid:
                response = JsonResponse({'error': 'Enter the shared demo password to continue.',
                                         'code': 'demo_auth_required'}, status=401)
                response['WWW-Authenticate'] = 'Bearer realm="Waywise reviewer demo"'
                response['Cache-Control'] = 'no-store'
                return response
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store'
        return response
