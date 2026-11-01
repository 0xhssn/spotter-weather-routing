"""Assignment regressions: provider failures, ETA matching, and route identity."""
import copy
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase

from .geometry import MILE_M, parse_osrm_route, point_at
from .providers import ProviderError, fetch_routes, fetch_weather, routing_request
from .service import build_plan, read_weather


def raw_route(bend=0):
    return {"distance": 60*MILE_M, "duration": 7200, "legs": [{"summary": "Highway", "steps": [
        {"distance": 60*MILE_M, "duration": 7200,
         "geometry": {"coordinates": [[-118, 34], [-117.5, 34+bend], [-117, 34]]}},
    ]}]}


def forecast(start, hours=50, wind=10):
    return {"time": [int(start.timestamp())+h*3600 for h in range(hours)],
            "wind_speed_10m": [wind]*hours, "wind_gusts_10m": [wind+5]*hours,
            "rain": [0]*hours, "showers": [0]*hours, "snowfall": [0]*hours,
            "temperature_2m": [70]*hours}


UNITS = {"time": "unixtime", "wind_speed_10m": "mp/h", "wind_gusts_10m": "mp/h",
         "rain": "mm", "showers": "mm", "snowfall": "cm", "temperature_2m": "°F"}


class ForecastRegressionTests(SimpleTestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 30, 10, tzinfo=timezone.utc)

    def test_wind_matches_eta_instead_of_skipping_a_dangerous_current_hour(self):
        hourly = forecast(self.start, 2)
        hourly["wind_speed_10m"] = [60, 0]
        weather = read_weather(hourly, self.start+timedelta(minutes=5))
        self.assertAlmostEqual(weather["wind_mph"], 55)

    def test_precipitation_and_gusts_keep_the_containing_hour_bin(self):
        hourly = forecast(self.start, 2)
        hourly["rain"] = [0, 25.4]
        hourly["wind_gusts_10m"] = [20, 60]
        weather = read_weather(hourly, self.start+timedelta(minutes=5))
        self.assertEqual(weather["rain_in"], 1)
        self.assertEqual(weather["gust_mph"], 60)

    def test_bad_provider_hours_units_and_values_fail_explicitly(self):
        valid = {"hourly": forecast(self.start, 3), "hourly_units": UNITS}
        variants = [None, {}, {"hourly": None}, {**valid, "hourly_units": {**UNITS, "wind_speed_10m": "km/h"}}]
        for field, value in [("time", [0, 7200, 10800]), ("time", [0, 0, 3600]),
                             ("time", [7200, 3600, 0]), ("time", [False, 3600, 7200]),
                             ("rain", [0, None, 0]), ("wind_speed_10m", [0, True, 0]),
                             ("snowfall", [0, -1, 0]), ("temperature_2m", [70, float('nan'), 70])]:
            item = copy.deepcopy(valid)
            item["hourly"][field] = value
            variants.append(item)
        for item in variants:
            with self.subTest(item=item), patch('planner.providers.get_json', return_value=item):
                with self.assertRaises(ProviderError):
                    fetch_weather([(-118, 34)], self.start, self.start+timedelta(hours=2))

    @patch('planner.providers.get_json')
    def test_complete_forecast_preserves_negative_temperature(self, get):
        hourly = forecast(self.start, 3)
        hourly['temperature_2m'] = [-10]*3
        get.return_value = {"hourly": hourly, "hourly_units": UNITS}
        result = fetch_weather([(-118, 34)], self.start, self.start+timedelta(hours=2))
        self.assertEqual(read_weather(result[(-118, 34)], self.start)['temperature_f'], -10)


class RoutingRegressionTests(SimpleTestCase):
    @patch('planner.providers.routing_request')
    def test_duplicate_native_routes_are_replaced_by_distinct_alternatives(self, request):
        request.side_effect = [[raw_route()]*3, [raw_route(.4)], [raw_route(-.4)]]
        routes = fetch_routes({'lon': -118, 'lat': 34}, {'lon': -117, 'lat': 34}, 20000)
        self.assertEqual(len(routes), 3)
        self.assertEqual(len({tuple(tuple(v[:2]) for v in r['vertices']) for r in routes}), 3)
        self.assertEqual([r['id'] for r in routes], ['route-1', 'route-2', 'route-3'])

    @patch('planner.providers.routing_request', return_value=[raw_route()]*3)
    def test_unavoidable_duplicates_are_never_reported_as_three_options(self, _):
        routes = fetch_routes({'lon': -118, 'lat': 34}, {'lon': -117, 'lat': 34}, 20000)
        self.assertEqual(len(routes), 1)

    @patch('planner.providers.get_json', return_value={'code': 'Ok', 'routes': [raw_route()]})
    def test_generated_waypoint_is_a_through_location_on_major_roads(self, get):
        routing_request([(-118, 34), (-117.5, 34.5), (-117, 34)], 0, 20000)
        locations = json.loads(get.call_args.args[1]['json'])['locations']
        self.assertEqual(locations[1]['type'], 'through')
        self.assertEqual(locations[1]['search_filter']['min_road_class'], 'secondary')
        self.assertNotIn('search_filter', locations[0])

    def test_stationary_maneuver_time_is_kept_at_the_correct_position(self):
        route = raw_route()
        route['distance'], route['duration'] = 200, 80
        route['legs'][0]['steps'] = [
            {'distance': 100, 'duration': 20, 'geometry': {'coordinates': [[0, 0], [.001, 0]]}},
            {'distance': 0, 'duration': 30, 'geometry': {'coordinates': [[.001, 0]]}},
            {'distance': 100, 'duration': 30, 'geometry': {'coordinates': [[.001, 0], [.002, 0]]}},
        ]
        parsed = parse_osrm_route(route, 0)
        self.assertAlmostEqual(point_at(parsed, 50)[3], 10)
        self.assertAlmostEqual(point_at(parsed, 150)[3], 65)
        self.assertAlmostEqual(point_at(parsed, 200)[3], 80)

    def test_invalid_route_payloads_are_provider_errors(self):
        bad_routes = [None, {}, {**raw_route(), 'duration': 0}, {**raw_route(), 'distance': float('nan')}]
        broken = raw_route()
        broken['legs'][0]['steps'][0]['geometry']['coordinates'][1] = [float('nan'), 34]
        bad_routes.append(broken)
        for bad in bad_routes:
            with self.subTest(route=bad), patch('planner.providers.routing_request', return_value=[bad]):
                with self.assertRaises(ProviderError):
                    fetch_routes({'lon': -118, 'lat': 34}, {'lon': -117, 'lat': 34}, 20000)


class LivePlanRegressionTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.departure = (datetime.now(timezone.utc)+timedelta(hours=1)).replace(minute=30, second=0, microsecond=0)
        self.origin, self.destination = {'lon': -118, 'lat': 34}, {'lon': -117, 'lat': 34}

    @patch('planner.service.fetch_routes')
    @patch('planner.service.fetch_weather')
    def test_weather_at_arrival_can_exclude_the_fastest_route(self, weather, routes):
        departure = self.departure.replace(minute=0)
        paths = []
        for i, hours in enumerate([2, 4, 6]):
            raw = raw_route()
            raw['duration'] = hours*3600
            paths.append(parse_osrm_route(raw, i))
        routes.return_value = paths
        def response(points, start, end):
            result = {p: forecast(start, int((end-start).total_seconds()/3600)+1) for p in points}
            result[(-117, 34)]['wind_speed_10m'][2] = 60
            return result
        weather.side_effect = response
        plan = build_plan(self.origin, self.destination, departure, 20000, 25)
        self.assertEqual(plan['routes'][0]['checkpoints'][-1]['risk']['level'], 'No Travel')
        self.assertEqual(plan['routes'][1]['checkpoints'][-1]['risk']['level'], 'Low')
        self.assertEqual(plan['recommended_id'], 'route-2')

    @patch('planner.service.fetch_routes')
    @patch('planner.service.fetch_weather')
    def test_live_plan_all_spacings_etas_load_rules_and_heatmap(self, weather, routes):
        routes.return_value = [parse_osrm_route(raw_route(bend), i) for i, bend in enumerate([0, .4, -.4])]
        def response(points, start, end):
            return {p: forecast(start, int((end-start).total_seconds()/3600)+1, 45) for p in points}
        weather.side_effect = response
        for spacing in (10, 25, 50):
            with self.subTest(spacing=spacing):
                plan = build_plan(self.origin, self.destination, self.departure, 30001, spacing)
                self.assertIsNone(plan['recommended_id'])
                self.assertEqual(plan['mode'], 'live')
                self.assertTrue(all(len(p['scores']) == 49 and set(p['scores']) == {4} for p in plan['heatmap']))
                for route in plan['routes']:
                    self.assertFalse(route['summary']['eligible'])
                    self.assertEqual(route['checkpoints'][-1]['eta'], route['arrival'])
                    for a, b in zip(route['checkpoints'], route['checkpoints'][1:]):
                        self.assertLessEqual(b['mile']-a['mile'], spacing+1e-8)
                        self.assertGreater(b['eta'], a['eta'])
        plan = build_plan(self.origin, self.destination, self.departure, 30000, 25)
        self.assertIsNotNone(plan['recommended_id'])
        self.assertTrue(all(r['summary']['eligible'] for r in plan['routes']))

    @patch('planner.providers.get_json', return_value={'code': 'Ok', 'routes': [{}]})
    def test_malformed_upstream_route_is_503_not_invalid_user_input(self, _):
        response = self.client.post('/api/plan', data=json.dumps({
            'origin': self.origin, 'destination': self.destination, 'departure': self.departure.isoformat(),
            'load_lb': 20000, 'spacing_miles': 25,
        }), content_type='application/json')
        self.assertEqual(response.status_code, 503)
