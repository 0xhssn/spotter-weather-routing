"""One shared, high-entropy demo password; no users, cookies or sessions."""
import hashlib
import hmac

from django.conf import settings
from django.http import JsonResponse


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
            valid = (scheme.lower() == 'bearer' and 1 <= len(password) <= 256
                     and hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), expected))
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
