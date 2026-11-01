"""Failures must remain recoverable after malformed or slow upstream responses."""
import asyncio
import copy
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from .budget import provider_budget
from .providers import ProviderError, _osrm, fetch_routes, fetch_weather, geocode, get_json
from .test_regressions import UNITS, forecast, raw_route


def response(data):
    return httpx.Response(200, content=json.dumps(data), headers={'Content-Type': 'application/json'})


class ProviderRecoveryTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.city = {'id': 1, 'name': 'Tucson', 'latitude': 32.2, 'longitude': -110.9, 'timezone': 'America/Phoenix'}

    @patch('planner.providers._get_response')
    def test_invalid_routes_are_not_cached_and_recovery_is_cached(self, request):
        request.side_effect = [response({'code': 'Ok', 'routes': [{}]}),
                               response({'code': 'Ok', 'routes': [raw_route()]})]
        with self.assertRaises(ProviderError):
            _osrm([(-118, 34), (-117, 34)])
        self.assertEqual(len(_osrm([(-118, 34), (-117, 34)])), 1)
        self.assertEqual(len(_osrm([(-118, 34), (-117, 34)])), 1)
        self.assertEqual(request.call_count, 2)

    @patch('planner.providers._get_response')
    def test_missing_weather_is_not_cached(self, request):
        start = datetime(2026, 11, 2, tzinfo=timezone.utc)
        good = {'hourly': forecast(start, 3), 'hourly_units': UNITS}
        bad = copy.deepcopy(good)
        bad['hourly']['rain'][1] = None
        request.side_effect = [response(bad), response(good)]
        with self.assertRaises(ProviderError):
            fetch_weather([(-118, 34)], start, start + timedelta(hours=2))
        result = fetch_weather([(-118, 34)], start, start + timedelta(hours=2))
        self.assertEqual(result[(-118, 34)]['rain'], [0, 0, 0])
        fetch_weather([(-118, 34)], start, start + timedelta(hours=2))
        self.assertEqual(request.call_count, 2)

    def test_invalid_cities_return_503_and_do_not_poison_search_cache(self):
        variants = [dict(timezone='Invalid/Zone'), dict(timezone=None), dict(timezone=''),
                    dict(latitude=True), dict(latitude=91), dict(longitude='-110'),
                    dict(longitude=float('nan')), dict(name=None), dict(admin1=42)]
        for changes in variants:
            with self.subTest(changes=changes):
                cache.clear()
                bad = {'results': [{**self.city, **changes}]}
                with patch('planner.providers._get_response', side_effect=[response(bad), response({'results': [self.city]})]) as request:
                    self.assertEqual(self.client.get('/api/places?q=Tucson').status_code, 503)
                    result = self.client.get('/api/places?q=Tucson')
                    self.assertEqual(result.status_code, 200)
                    self.assertEqual(result.json()['results'][0]['timezone'], 'America/Phoenix')
                    self.assertEqual(request.call_count, 2)

    @patch('planner.providers._get_response')
    def test_invalid_existing_cache_entry_is_evicted(self, request):
        url, params = 'https://provider.example', {'q': 'city'}
        key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
        cache.set(key, {'results': None}, 86400)
        request.return_value = response({'results': []})
        from .providers import validate_places
        self.assertEqual(get_json(url, params, validate=validate_places), {'results': []})
        request.assert_called_once()

    @patch('planner.providers._get_response', return_value=response({}))
    def test_no_results_are_valid_and_cached(self, request):
        self.assertEqual(geocode('NoSuchCity'), [])
        self.assertEqual(geocode('NoSuchCity'), [])
        request.assert_called_once()

    @override_settings(ROUTING_PROVIDER='osrm')
    @patch('planner.providers._get_response')
    def test_malformed_native_alternatives_preserve_valid_routes(self, request):
        request.return_value = response({'code': 'Ok', 'routes': [{}, raw_route(), raw_route(.4)]})
        routes = fetch_routes({'lon': -118, 'lat': 34}, {'lon': -117, 'lat': 34}, 20000)
        self.assertEqual([route['id'] for route in routes], ['route-1', 'route-2'])
        self.assertEqual({route['routing_profile'] for route in routes}, {'car'})
        self.assertEqual(len(routes[0]['vertices']), 3)

    @patch('planner.providers.routing_request', return_value=[raw_route(), {}])
    @patch('planner.providers.seconds_left', return_value=0)
    def test_candidate_failure_is_isolated_after_provider_boundary(self, remaining, request):
        routes = fetch_routes({'lon': -118, 'lat': 34}, {'lon': -117, 'lat': 34}, 20000)
        self.assertEqual(len(routes), 1)


class SlowBodyTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_deadline_cancels_a_body_that_never_hits_socket_read_timeout(self):
        class SlowBody(httpx.AsyncByteStream):
            cancelled = False
            closed = False

            async def __aiter__(self):
                try:
                    for _ in range(100):
                        await asyncio.sleep(.01)
                        yield b' '
                except asyncio.CancelledError:
                    self.cancelled = True
                    raise
                yield b'{}'

            async def aclose(self):
                self.closed = True

        stream = SlowBody()
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=stream)))
        started = time.monotonic()
        with patch('planner.providers.httpx.AsyncClient', return_value=client):
            with provider_budget(.12), self.assertRaises(ProviderError) as raised:
                get_json('https://slow.example', {})
        self.assertEqual(raised.exception.code, 'provider_timeout')
        self.assertLess(time.monotonic() - started, .6)
        self.assertTrue(stream.cancelled)
        self.assertTrue(stream.closed)
        self.assertTrue(client.is_closed)
