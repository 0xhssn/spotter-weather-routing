"""Timed display geometry must retain road shape and nonuniform progress."""
from django.core.cache import cache
from django.test import SimpleTestCase

from .geometry import simplify_geometry


class JourneyGeometryTests(SimpleTestCase):
    def test_straight_road_keeps_speed_changes(self):
        vertices = [[0, 0, 0, 0], [.1, 0, 10000, 10800], [.2, 0, 20000, 14400]]
        self.assertEqual(simplify_geometry(vertices), [[0, 0], [.2, 0]])
        self.assertEqual(simplify_geometry(vertices, preserve_timing=True), vertices)

    def test_stationary_maneuver_keeps_both_ends_of_wait(self):
        vertices = [[0, 0, 0, 0], [.1, 0, 10000, 3600],
                    [.1, 0, 10000, 7200], [.2, 0, 20000, 10800]]
        self.assertEqual(simplify_geometry(vertices, preserve_timing=True), vertices)

    def test_constant_speed_collinear_vertices_still_simplify(self):
        vertices = [[i*.001, 0, i*100, i*60] for i in range(100)]
        self.assertEqual(simplify_geometry(vertices, preserve_timing=True), [vertices[0], vertices[-1]])

    def test_api_progress_is_aligned_monotonic_and_ends_at_arrival(self):
        cache.clear()
        response = self.client.get('/api/example?load_lb=20000&spacing_miles=25')
        self.assertEqual(response.status_code, 200)
        for route in response.json()['routes']:
            progress = route['geometry_progress']
            self.assertEqual(len(progress), len(route['geometry']['coordinates']))
            self.assertEqual(progress[0], [0, 0])
            self.assertAlmostEqual(progress[-1][0], route['distance_miles'])
            self.assertAlmostEqual(progress[-1][1], route['duration_s'])
            self.assertTrue(all(a[0] <= b[0] and a[1] <= b[1] for a, b in zip(progress, progress[1:])))
