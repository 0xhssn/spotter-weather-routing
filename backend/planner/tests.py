import json
import math
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from .geometry import MILE_M, parse_osrm_route, point_at, sample
from .providers import ProviderError
from .risk import LEVELS, classify, recommend, summarize
from .service import read_weather


@override_settings(ROUTING_PROVIDER='valhalla',VALHALLA_BASE_URL='https://router.example')
class RoutingAdapterTests(SimpleTestCase):
    @patch('planner.providers.get_json',return_value={'code':'Ok','routes':[{'distance':100}]})
    def test_truck_profile_uses_gross_weight_and_explicit_dimensions(self,fetch):
        from .providers import routing_request
        routing_request([(-118,34),(-112,33)],2,20000)
        url,params=fetch.call_args.args
        request=json.loads(params['json'])
        self.assertEqual(url,'https://router.example/route')
        self.assertEqual(request['costing'],'truck')
        self.assertEqual(request['alternates'],2)
        truck=request['costing_options']['truck']
        self.assertAlmostEqual(truck['weight'],50000*0.00045359237)
        self.assertEqual(truck['height'],4.11)
        self.assertTrue(truck['exclude_unpaved'])

    @patch('planner.providers._osrm')
    @patch('planner.providers.get_json',side_effect=ProviderError('Truck routing unavailable'))
    def test_truck_provider_failure_never_downgrades_silently_to_car(self,fetch,osrm):
        from .providers import routing_request
        with self.assertRaises(ProviderError): routing_request([(-118,34),(-112,33)],2,20000)
        osrm.assert_not_called()


def checkpoint(mile, score):
    return {"id": str(mile), "mile": mile, "risk": {"score": score}}


class RiskTests(SimpleTestCase):
    def test_wind_boundary_and_fractional_values(self):
        for wind, score in [(0,0),(24.999,0),(25,1),(34.999,1),(35,2),(44.999,2),(45,3),(54.999,3),(55,4)]:
            with self.subTest(wind=wind): self.assertEqual(classify(wind,0,0,0)["score"], score)

    def test_rain_shared_and_strict_no_travel_boundaries(self):
        for rain, score in [(.09999,0),(.1,1),(.24999,1),(.25,2),(.49999,2),(.5,3),(1,3),(1.00001,4)]:
            with self.subTest(rain=rain): self.assertEqual(classify(0,rain,0,0)["score"], score)

    def test_snow_shared_and_strict_no_travel_boundaries(self):
        for snow, score in [(.4999,0),(.5,1),(.9999,1),(1,2),(1.9999,2),(2,3),(3,3),(3.0001,4)]:
            with self.subTest(snow=snow): self.assertEqual(classify(0,0,snow,0)["score"], score)

    def test_load_overrides_are_strictly_above_weight_limits(self):
        for wind, load, score in [(45,30000,3),(45,30001,4),(35,40000,2),(35,40001,3),(44.99,40001,3),(55,0,4),(34.99,99999,1)]:
            with self.subTest(wind=wind,load=load): self.assertEqual(classify(wind,0,0,load)["score"], score)

    def test_worst_condition_wins(self):
        self.assertEqual(classify(20,.3,2.5,0)["level"], "Severe")
        self.assertEqual(classify(45,1.1,0,0)["level"], "No Travel")

    def test_invalid_weather_is_never_low_risk(self):
        for bad in (float('nan'), float('inf'), -1):
            with self.subTest(value=bad), self.assertRaises(ValueError): classify(bad,0,0,0)

    def test_risk_is_distance_weighted_and_final_partial_segment_is_included(self):
        result=summarize([checkpoint(0,0),checkpoint(25,0),checkpoint(50,2),checkpoint(51,0)],3600)
        self.assertEqual(result["risk_miles"]["High"],26)
        self.assertEqual(sum(result["risk_miles"].values()),51)
        self.assertAlmostEqual(result["average_risk"],52/51)

    def test_no_travel_at_either_endpoint_blocks_route(self):
        for scores in [(4,0),(0,4)]:
            self.assertFalse(summarize([checkpoint(0,scores[0]),checkpoint(25,scores[1])],100)["eligible"])

    def test_recommendation_is_lexicographic_and_excludes_no_travel(self):
        def route(id,severe,high,avg,seconds,eligible=True):
            return {"id":id,"duration_s":seconds,"summary":{"eligible":eligible,"risk_miles":{"Severe":severe,"High":high},"average_risk":avg}}
        self.assertEqual(recommend([route('fast',1,0,.2,100),route('safe',0,100,2,900)]),'safe')
        self.assertEqual(recommend([route('a',0,5,1,100),route('b',0,3,2,900)]),'b')
        self.assertEqual(recommend([route('a',0,3,1,900),route('b',0,3,2,100)]),'a')
        self.assertEqual(recommend([route('a',0,3,1,900),route('b',0,3,1,100)]),'b')
        self.assertEqual(recommend([route('blocked',0,0,0,1,False),route('safe',0,3,1,100)]),'safe')
        self.assertIsNone(recommend([route('blocked',0,0,0,1,False)]))


class SamplingTests(SimpleTestCase):
    def setUp(self):
        self.route={"distance_m":60*MILE_M,"vertices":[[0,0,0,0],[1,0,30*MILE_M,3600],[2,0,60*MILE_M,10800]]}

    def test_checkpoint_spacing_and_final_destination(self):
        points=sample(self.route,25)
        self.assertEqual([round(p[2]/MILE_M) for p in points],[0,25,50,60])
        self.assertEqual(points[-1][:2],[2,0])

    def test_eta_uses_segment_speeds_not_uniform_trip_speed(self):
        self.assertAlmostEqual(point_at(self.route,15*MILE_M)[3],1800)
        self.assertAlmostEqual(point_at(self.route,45*MILE_M)[3],7200)

    def test_osrm_steps_keep_distance_and_time_totals(self):
        raw={"distance":200,"duration":80,"legs":[{"summary":"Main St","steps":[
            {"geometry":{"coordinates":[[0,0],[.001,0]]},"distance":100,"duration":20},
            {"geometry":{"coordinates":[[.001,0],[.002,0]]},"distance":100,"duration":60}]}]}
        parsed=parse_osrm_route(raw,0)
        self.assertAlmostEqual(parsed["vertices"][-1][2],200)
        self.assertAlmostEqual(parsed["vertices"][-1][3],80)
        self.assertAlmostEqual(point_at(parsed,100)[3],20)


class ForecastTests(SimpleTestCase):
    def setUp(self):
        self.at=datetime(2026,10,30,10,tzinfo=timezone.utc)
        self.hourly={"time":[int(self.at.timestamp())+h*3600 for h in range(3)],
                     "wind_speed_10m":[10,25,40],"wind_gusts_10m":[20,35,50],
                     "rain":[0,25.4,0],"showers":[0,2.54,0],"snowfall":[0,2.54,0],"temperature_2m":[70,72,75]}

    def test_hour_bin_and_precipitation_conversion(self):
        weather=read_weather(self.hourly,self.at+timedelta(minutes=30))
        self.assertEqual(weather["wind_mph"],17.5)
        self.assertAlmostEqual(weather["rain_in"],1.1)
        self.assertAlmostEqual(weather["snow_in"],1)
        self.assertEqual(weather["forecast_at"],(self.at+timedelta(hours=1)).isoformat())

    def test_forecast_is_not_clamped_past_available_horizon(self):
        for minutes in (-1,121):
            with self.subTest(minutes=minutes),self.assertRaises(ProviderError): read_weather(self.hourly,self.at+timedelta(minutes=minutes))

    def test_null_forecast_is_an_error(self):
        self.hourly["wind_speed_10m"][0]=None
        with self.assertRaises(ProviderError): read_weather(self.hourly,self.at)


class ApiTests(SimpleTestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.data={"origin":{"lat":34,"lon":-118,"label":"Origin"},"destination":{"lat":33,"lon":-112,"label":"Destination"},
                   "departure":(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),"load_lb":20000,"spacing_miles":25}

    def send(self,data): return self.client.post('/api/plan',data=json.dumps(data),content_type='application/json')

    def test_health(self): self.assertEqual(self.client.get('/api/health').json(),{"status":"ok"})

    def test_input_validation(self):
        for key,value in [('load_lb',-1),('load_lb',True),('spacing_miles',7),('departure','2026-01-01T10:00:00'),('origin',{'lat':math.inf,'lon':0})]:
            with self.subTest(key=key,value=value): self.assertEqual(self.send({**self.data,key:value}).status_code,400)
        self.assertEqual(self.send([]).status_code,400)
        self.assertEqual(self.client.post('/api/plan',data='{',content_type='application/json').status_code,400)

    def test_identical_locations_rejected(self):
        self.assertEqual(self.send({**self.data,'destination':self.data['origin']}).status_code,400)

    @patch('planner.views.build_plan',side_effect=ProviderError('Weather unavailable'))
    def test_provider_failure_is_explicit_and_does_not_become_demo(self,_):
        result=self.send(self.data)
        self.assertEqual(result.status_code,503)
        self.assertEqual(result.json()['error'],'Weather unavailable')

    def test_example_end_to_end_contract(self):
        result=self.client.get('/api/example?spacing_miles=10&load_lb=20000')
        self.assertEqual(result.status_code,200)
        data=result.json()
        self.assertEqual(data['mode'],'example')
        self.assertEqual(len(data['routes']),3)
        self.assertTrue(data['heatmap'])
        self.assertTrue(all(len(p['scores'])==49 for p in data['heatmap']))
        for route in data['routes']:
            self.assertAlmostEqual(sum(route['summary']['risk_miles'].values()),route['distance_miles'],places=2)
            self.assertTrue(route['geometry']['coordinates'])
            self.assertEqual(route['checkpoints'][0]['mile'],0)
            self.assertAlmostEqual(route['checkpoints'][-1]['mile'],route['distance_miles'])
            for a,b in zip(route['checkpoints'],route['checkpoints'][1:]):
                self.assertGreater(b['eta'],a['eta'])
                self.assertLessEqual(b['mile']-a['mile'],10.00001)
        self.assertIn(data['recommended_id'],[r['id'] for r in data['routes'] if r['summary']['eligible']])
