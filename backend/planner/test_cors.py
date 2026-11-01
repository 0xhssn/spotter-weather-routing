from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings


ORIGIN = 'https://waywise.example.test'


@override_settings(CORS_ALLOWED_ORIGINS=[ORIGIN])
class StaticFrontendCorsTests(SimpleTestCase):
    def test_allowed_frontend_can_read_health_and_retry_headers(self):
        response = self.client.get('/api/health', HTTP_ORIGIN=ORIGIN)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], ORIGIN)
        self.assertIn('origin', [value.strip().lower() for value in response['Vary'].split(',')])
        self.assertIn('Retry-After', response['Access-Control-Expose-Headers'])
        self.assertNotIn('Access-Control-Allow-Credentials', response)

    def test_json_post_preflight_allows_only_needed_methods_and_headers(self):
        response = self.client.options('/api/plan', HTTP_ORIGIN=ORIGIN,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST', HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], ORIGIN)
        self.assertEqual(set(response['Access-Control-Allow-Methods'].split(', ')), {'GET', 'POST', 'OPTIONS'})
        self.assertEqual(set(response['Access-Control-Allow-Headers'].split(', ')), {'content-type', 'authorization'})

    def test_other_sites_do_not_receive_cors_permission(self):
        response = self.client.get('/api/health', HTTP_ORIGIN='https://other.example.test')
        self.assertNotIn('Access-Control-Allow-Origin', response)

    @override_settings(CORS_ALLOWED_ORIGINS=[])
    def test_no_cross_origin_access_is_enabled_by_default(self):
        response = self.client.get('/api/health', HTTP_ORIGIN=ORIGIN)
        self.assertNotIn('Access-Control-Allow-Origin', response)

    def test_validation_errors_remain_readable_by_the_frontend(self):
        response = self.client.post('/api/plan', '{}', content_type='application/json', HTTP_ORIGIN=ORIGIN)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response['Access-Control-Allow-Origin'], ORIGIN)

    def test_rate_limit_countdown_is_exposed_cross_origin(self):
        cache.clear()
        data = {'origin': {'label': 'LA', 'lat': 34, 'lon': -118},
                'destination': {'label': 'Phoenix', 'lat': 33, 'lon': -112},
                'departure': (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}
        with patch('planner.views.reserve_request', return_value=('cors-test', 0, 12)):
            response = self.client.post('/api/plan', data, content_type='application/json', HTTP_ORIGIN=ORIGIN)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '12')
        self.assertEqual(response['Access-Control-Allow-Origin'], ORIGIN)
        self.assertIn('Retry-After', response['Access-Control-Expose-Headers'])
