import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

PASSWORD = 'test-only-generated-style-password-0123456789'
DIGEST = hashlib.sha256(PASSWORD.encode()).hexdigest()
ORIGIN = 'https://review.example.test'


@override_settings(DEMO_ACCESS_PASSWORD_SHA256=DIGEST, CORS_ALLOWED_ORIGINS=[ORIGIN])
class DemoAccessTests(SimpleTestCase):
    def test_api_calls_and_login_require_password_before_any_provider_work(self):
        with patch('planner.views.geocode') as geocode, patch('planner.views.build_plan') as plan:
            for path, method in [('/api/places?q=Denver', 'get'), ('/api/example', 'get'),
                                 ('/api/plan', 'post'), ('/api/access', 'post')]:
                with self.subTest(path=path):
                    response = getattr(self.client, method)(path, HTTP_ORIGIN=ORIGIN)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.json()['code'], 'demo_auth_required')
                    self.assertEqual(response['Cache-Control'], 'no-store')
                    self.assertEqual(response['Access-Control-Allow-Origin'], ORIGIN)
            geocode.assert_not_called()
            plan.assert_not_called()

    def test_wrong_or_malformed_headers_are_rejected(self):
        for authorization in ('', 'Bearer wrong', 'Basic abc', 'Bearer ', 'Bearer ' + 'x'*257):
            with self.subTest(authorization=authorization):
                response = self.client.post('/api/access', HTTP_AUTHORIZATION=authorization)
                self.assertEqual(response.status_code, 401)

    def test_public_metadata_and_health_are_small_and_no_store(self):
        self.assertEqual(self.client.get('/api/health').json(), {'status': 'ok'})
        response = self.client.get('/api/access')
        self.assertEqual(response.json(), {'password_required': True})
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_authenticated_login_and_example_work_without_cookies(self):
        authorization = {'HTTP_AUTHORIZATION': 'Bearer ' + PASSWORD}
        response = self.client.post('/api/access', **authorization)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.cookies)
        response = self.client.get('/api/example', **authorization)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['routes']), 3)
        self.assertEqual(response['Cache-Control'], 'no-store')
        # Complete plans and provider caches never bypass the access check.
        self.assertEqual(self.client.get('/api/example').status_code, 401)

    def test_password_rotation_rejects_previous_password(self):
        with override_settings(DEMO_ACCESS_PASSWORD_SHA256=hashlib.sha256(b'new-password').hexdigest()):
            self.assertEqual(self.client.post('/api/access', HTTP_AUTHORIZATION='Bearer ' + PASSWORD).status_code, 401)
            self.assertEqual(self.client.post('/api/access', HTTP_AUTHORIZATION='Bearer new-password').status_code, 200)

    def test_cross_origin_authorization_preflight_does_not_require_password(self):
        response = self.client.options('/api/plan', HTTP_ORIGIN=ORIGIN,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST', HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type')
        self.assertEqual(response.status_code, 200)
        self.assertIn('authorization', response['Access-Control-Allow-Headers'])
        self.assertEqual(response['Access-Control-Allow-Origin'], ORIGIN)
        # CORS permission is not authentication: an actual direct call is denied.
        self.assertEqual(self.client.post('/api/plan', HTTP_ORIGIN=ORIGIN).status_code, 401)

    @override_settings(DEMO_ACCESS_PASSWORD_SHA256='')
    def test_local_development_can_explicitly_run_without_gate(self):
        self.assertEqual(self.client.get('/api/access').json(), {'password_required': False})
        self.assertEqual(self.client.get('/api/example').status_code, 200)


class DemoCredentialConfigurationTests(SimpleTestCase):
    def test_production_refuses_missing_or_invalid_password_verifier(self):
        for digest in ('', 'not-a-digest'):
            env = {**os.environ, 'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': 'test-only-secret',
                   'DEMO_ACCESS_PASSWORD_SHA256': digest, 'PYTHON_DOTENV_DISABLED': '1'}
            result = subprocess.run([sys.executable, '-c', 'import config.settings'], env=env,
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('DEMO_ACCESS_PASSWORD_SHA256', result.stderr)

    def test_generator_creates_private_random_credentials_and_refuses_overwrite(self):
        script = Path(__file__).resolve().parents[2] / 'scripts' / 'create_demo_password.py'
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'credentials.json'
            result = subprocess.run([sys.executable, str(script), '--output', str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            data = json.loads(output.read_text())
            self.assertGreaterEqual(len(data['password']), 43)
            self.assertEqual(data['password_sha256'], hashlib.sha256(data['password'].encode()).hexdigest())
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(data['password'], result.stdout)
            again = subprocess.run([sys.executable, str(script), '--output', str(output)], capture_output=True)
            self.assertNotEqual(again.returncode, 0)
            self.assertEqual(json.loads(output.read_text()), data)
