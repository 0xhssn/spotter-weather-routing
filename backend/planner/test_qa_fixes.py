"""QA brief F1–F15 regressions; thresholds/ranking remain in existing tests."""
import gzip
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from .budget import parallel_map, provider_budget, seconds_left
from .geometry import MILE_M, parse_osrm_route, simplify_geometry
from .providers import ProviderError, fetch_routes, get_json, label_routes
from .service import build_plan
from .test_regressions import raw_route, forecast


class ProviderErrorTests(SimpleTestCase):
    def setUp(self): cache.clear()

    def test_router_limits_and_no_route_are_422(self):
        cases=[({'code':'DistanceExceeded'},'route_too_long'),({'error_code':154},'route_too_long'),({'code':'NoRoute'},'no_route'),({'error_code':171},'no_route')]
        for data,code in cases:
            with self.subTest(code=code):
                cache.clear()
                response=httpx.Response(400,request=httpx.Request('GET','https://router.example'),json=data)
                with patch('planner.providers._get_response',return_value=response),self.assertRaises(ProviderError) as raised:
                    get_json('https://router.example',{})
                self.assertEqual((raised.exception.status,raised.exception.code),(422,code))

    @patch('planner.providers._get_response',side_effect=httpx.ReadTimeout('timeout'))
    def test_timeouts_are_service_errors(self,_):
        with self.assertRaises(ProviderError) as raised:get_json('https://router.example',{})
        self.assertEqual((raised.exception.status,raised.exception.code),(503,'provider_timeout'))

    @patch('planner.providers._osrm')
    @patch('planner.providers.routing_request',side_effect=ProviderError('distance limit',422,'route_too_long'))
    def test_car_fallback_requires_explicit_opt_in(self,truck,car):
        origin,dest={'lon':-118,'lat':34},{'lon':-117,'lat':34}
        with self.assertRaises(ProviderError):fetch_routes(origin,dest,20000)
        car.assert_not_called()
        car.return_value=[raw_route(bend) for bend in (0,.4,-.4)]
        routes=fetch_routes(origin,dest,20000,True)
        self.assertEqual(len(routes),3)
        self.assertEqual({r['routing_profile'] for r in routes},{'car'})

    @patch('planner.providers._osrm')
    @patch('planner.providers.routing_request',side_effect=ProviderError('outage'))
    def test_outages_do_not_switch_routing_profiles(self,_,car):
        with self.assertRaises(ProviderError):fetch_routes({'lon':-118,'lat':34},{'lon':-117,'lat':34},20000,True)
        car.assert_not_called()

    def test_parallel_workers_share_the_trip_deadline(self):
        with provider_budget(.5):
            remaining=parallel_map(lambda _:seconds_left(),range(3))
        self.assertTrue(all(0<value<=.5 for value in remaining))

    @patch('planner.providers._get_response')
    def test_expired_budget_does_not_call_upstream(self,get):
        with provider_budget(0),self.assertRaises(ProviderError):get_json('https://router.example',{})
        get.assert_not_called()


@override_settings(PLAN_RATE_LIMIT=30)
class PlanBudgetTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.data={'origin':{'label':'LA','lat':34,'lon':-118,'timezone':'America/Los_Angeles'},'destination':{'label':'Phoenix','lat':33,'lon':-112,'timezone':'America/Phoenix'},'departure':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),'load_lb':20000,'spacing_miles':25}

    def send(self,**changes):return self.client.post('/api/plan',data=json.dumps({**self.data,**changes}),content_type='application/json')

    @patch('planner.views.build_plan',return_value={'ok':True})
    def test_cached_requests_do_not_use_new_request_budget(self,build):
        for _ in range(45):self.assertEqual(self.send().status_code,200)
        self.assertEqual(build.call_count,1)
        self.assertEqual(self.send().headers['X-Plan-Cache'],'HIT')

    @patch('planner.views.build_plan',return_value={'ok':True})
    def test_validation_failures_do_not_consume_budget(self,_):
        for _ in range(40):self.assertEqual(self.send(load_lb=-1).status_code,400)
        self.assertEqual(self.send().status_code,200)

    @patch('planner.views.build_plan',return_value={'ok':True})
    def test_normal_mixed_reviewer_exploration_succeeds(self,_):
        for i in range(12):self.assertEqual(self.send(load_lb=20000+i,spacing_miles=(10,25,50)[i%3]).status_code,200)

    @patch('planner.views.build_plan',return_value={'ok':True})
    def test_real_throttle_has_retry_after_and_cached_plans_still_work(self,_):
        for i in range(30):self.assertEqual(self.send(load_lb=i).status_code,200)
        response=self.send(load_lb=31)
        self.assertEqual(response.status_code,429)
        self.assertEqual(response.json()['retry_after'],int(response.headers['Retry-After']))
        self.assertGreater(int(response.headers['Retry-After']),0)
        self.assertEqual(self.send(load_lb=0).status_code,200)

    @override_settings(PLAN_RATE_LIMIT=1)
    @patch('planner.views.build_plan',side_effect=[ProviderError('outage'),{'ok':True}])
    def test_provider_failures_refund_budget(self,_):
        self.assertEqual(self.send().status_code,503)
        self.assertEqual(self.send().status_code,200)

    def test_invalid_date_does_not_expose_python_message(self):
        response=self.send(departure='not-a-date')
        self.assertEqual(response.status_code,400)
        self.assertIn('ISO 8601',response.json()['error'])
        self.assertNotIn('Invalid isoformat',response.json()['error'])

    @patch('planner.views.build_plan',side_effect=ProviderError('No drivable route connects these places.',422,'no_route'))
    def test_unroutable_pair_is_specific_422(self,_):
        response=self.send()
        self.assertEqual(response.status_code,422)
        self.assertEqual(response.json()['code'],'no_route')

    @patch('planner.views.build_plan',return_value={'payload':'weather '*10000})
    def test_json_compression_is_enabled(self,_):
        response=self.client.post('/api/plan',data=json.dumps(self.data),content_type='application/json',HTTP_ACCEPT_ENCODING='gzip')
        self.assertEqual(response.headers['Content-Encoding'],'gzip')
        self.assertEqual(json.loads(gzip.decompress(response.content))['payload'],'weather '*10000)


class GeometryAndLongHaulTests(SimpleTestCase):
    def test_display_simplification_keeps_endpoints_and_important_bends(self):
        points=[[i/10000,0,i, i] for i in range(100)]
        result=simplify_geometry(points)
        self.assertEqual(result,[points[0][:2],points[-1][:2]])
        points[50][1]=.1
        self.assertIn(points[50][:2],simplify_geometry(points))
        self.assertEqual(len(points),100)

    def test_route_labels_remain_stable_when_normalized_during_plan_assembly(self):
        routes=[parse_osrm_route(raw_route(bend),i) for i,bend in enumerate([0,.4,-.4])]
        label_routes(routes)
        first=[r['via'] for r in routes]
        label_routes(routes)
        self.assertEqual([r['via'] for r in routes],first)

    def test_labels_distinguish_corridors_without_step_names(self):
        routes=[parse_osrm_route(raw_route(bend),i) for i,bend in enumerate([0,.4,-.4])]
        label_routes(routes)
        self.assertEqual(len({r['via'] for r in routes}),3)
        self.assertIn('Northern',routes[1]['via'])
        self.assertIn('Southern',routes[2]['via'])

    @patch('planner.service.fetch_weather')
    @patch('planner.service.fetch_routes')
    def test_long_haul_forecast_covers_the_final_eta_beyond_48_hours(self,routes,weather):
        departure=(datetime.now(timezone.utc)+timedelta(hours=1)).replace(minute=30,second=0,microsecond=0)
        raw=raw_route();raw.update(distance=3301*MILE_M,duration=59*3600)
        path=parse_osrm_route(raw,0);path['routing_profile']='car'
        routes.return_value=[path]
        def response(points,start,end):return {point:forecast(start,int((end-start).total_seconds()/3600)+1) for point in points}
        weather.side_effect=response
        plan=build_plan({'lon':-118,'lat':34},{'lon':-117,'lat':34},departure,20000,50,allow_road_fallback=True)
        self.assertTrue(plan['trip_exceeds_heatmap'])
        self.assertEqual(plan['forecast_hours'],48)
        self.assertEqual(plan['routes'][0]['checkpoints'][-1]['eta'],plan['routes'][0]['arrival'])
        self.assertGreaterEqual(weather.call_args.args[2],departure+timedelta(hours=59))
        self.assertIn('Car-profile',plan['warnings'][-1])
        self.assertTrue(all(len(point['scores'])==49 for point in plan['heatmap']))


class SearchAndRetryTests(SimpleTestCase):
    def setUp(self):cache.clear()

    @patch('planner.providers.get_json',return_value={'results':[{'id':1,'name':'Tucson','country_code':'US','latitude':32.2,'longitude':-110.9,'timezone':'America/Phoenix'}]})
    def test_search_filters_country_at_provider_and_preserves_timezone(self,get):
        from .providers import geocode
        result=geocode('Tucson')
        self.assertEqual(get.call_args.args[1]['countryCode'],'US')
        self.assertEqual(result[0]['timezone'],'America/Phoenix')

    @patch('planner.providers.time.sleep')
    @patch('planner.providers._get_response')
    def test_transient_provider_failure_gets_only_one_bounded_retry(self,get,sleep):
        request=httpx.Request('GET','https://router.example')
        get.side_effect=[httpx.Response(503,request=request,json={'error':'temporary'}),httpx.Response(200,request=request,json={'ok':True})]
        self.assertEqual(get_json('https://router.example',{}),{'ok':True})
        self.assertEqual(get.call_count,2)
        sleep.assert_called_once_with(.25)

    @patch('planner.providers.time.sleep')
    @patch('planner.providers._get_response')
    def test_long_retry_after_is_respected_without_blocking_the_request(self,get,sleep):
        get.return_value=httpx.Response(429,request=httpx.Request('GET','https://router.example'),json={},headers={'Retry-After':'60'})
        with self.assertRaises(ProviderError):get_json('https://router.example',{})
        self.assertEqual(get.call_count,1)
        sleep.assert_not_called()


class AlternativeLimitTests(SimpleTestCase):
    @patch('planner.service.fetch_weather')
    @patch('planner.service.fetch_routes')
    def test_over_limit_detour_does_not_discard_a_supported_main_route(self,routes,weather):
        main=parse_osrm_route(raw_route(),0)
        raw=raw_route(.4);raw['distance']=5001*MILE_M
        routes.return_value=[main,parse_osrm_route(raw,1)]
        weather.side_effect=lambda points,start,end:{p:forecast(start,int((end-start).total_seconds()/3600)+1) for p in points}
        result=build_plan({'lon':-118,'lat':34},{'lon':-117,'lat':34},datetime.now(timezone.utc)+timedelta(hours=1),20000,25)
        self.assertEqual(len(result['routes']),1)
        self.assertEqual(result['recommended_id'],'route-1')
        self.assertTrue(any('Some alternatives exceed' in warning for warning in result['warnings']))
