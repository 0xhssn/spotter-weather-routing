"""Check the built Compose stack without external provider calls or dependencies."""
import argparse
import json
import re
from urllib.request import urlopen


def check(base_url):
    def get(path):
        with urlopen(base_url.rstrip('/') + path, timeout=20) as response:
            assert response.status == 200, (path, response.status)
            return response.read().decode(), response.headers

    html, headers = get('/')
    assert 'Waywise' in html and 'text/html' in headers.get('Content-Type', ''), 'Frontend did not serve the built app'
    asset = re.search(r'src="(/assets/[^\"]+\.js)"', html)
    assert asset, 'Built JavaScript asset is missing from the page'
    javascript, headers = get(asset.group(1))
    assert javascript and 'javascript' in headers.get('Content-Type', ''), 'JavaScript asset is not served correctly'
    assert 'immutable' in ', '.join(headers.get_all('Cache-Control', [])), 'Built assets should be immutable'
    health, _ = get('/healthz')
    assert health.strip() == 'ok', 'Nginx readiness failed'
    health, _ = get('/api/health')
    assert json.loads(health) == {'status': 'ok'}, 'Django readiness through Nginx failed'
    body, _ = get('/api/example?load_lb=20000&spacing_miles=25')
    plan = json.loads(body)
    assert plan['mode'] == 'example' and plan['forecast_hours'] == 48, 'Example forecast contract failed'
    assert len(plan['routes']) == 3, 'Recorded example routes are missing'
    for route in plan['routes']:
        assert len(route['geometry']['coordinates']) >= 2 and len(route['checkpoints']) >= 2
        assert route['checkpoints'][0]['mile'] == 0
        assert route['checkpoints'][-1]['mile'] > 0
    assert plan['heatmap'] and all(len(point['scores']) == 49 for point in plan['heatmap'])
    print('Container smoke checks passed: frontend, JavaScript, Nginx readiness, Django proxy and complete example forecast.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8080')
    check(parser.parse_args().base_url)
