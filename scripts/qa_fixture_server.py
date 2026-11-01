"""Local-only deterministic visual QA. Load example: 20,000 lb=Severe;
30,001 lb=No Travel. Never imported by the application or used as live fallback.
Run: .venv/bin/python scripts/qa_fixture_server.py
"""
import sys,os,json
from pathlib import Path
from datetime import datetime,timedelta,timezone
from http.server import BaseHTTPRequestHandler,HTTPServer
from urllib.parse import urlparse,parse_qs
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ['DJANGO_SETTINGS_MODULE']='config.settings'
import django
django.setup()
from planner.service import build_plan
from planner.test_regressions import forecast
path=json.loads((ROOT/'backend/planner/fixtures/routes.json').read_text())[0]
origin={'label':'Los Angeles, California, US','lon':-118.2437,'lat':34.0522,'timezone':'America/Los_Angeles'}
destination={'label':'Phoenix, Arizona, US','lon':-112.074,'lat':33.4484,'timezone':'America/Phoenix'}
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  query=parse_qs(urlparse(self.path).query)
  load=float(query.get('load_lb',['20000'])[0]);spacing=int(query.get('spacing_miles',['25'])[0])
  departure=(datetime.now(timezone.utc)+timedelta(hours=1)).replace(minute=0,second=0,microsecond=0)
  def weather(points,start,end):return {p:forecast(start,int((end-start).total_seconds()/3600)+1,45) for p in points}
  with patch('planner.service.fetch_routes',return_value=[path]),patch('planner.service.fetch_weather',side_effect=weather):
   data=build_plan(origin,destination,departure,load,spacing)
  data['mode']='example';data['providers']['weather']='Deterministic QA fixture'
  raw=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
if __name__=='__main__':
 print('Deterministic QA example API: http://127.0.0.1:8101 (not live data)',flush=True)
 HTTPServer(('127.0.0.1',8101),Handler).serve_forever()
