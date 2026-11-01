"""Run locally on 8000 or on Render's assigned PORT without a shell wrapper."""
import os

bind = f"0.0.0.0:{int(os.getenv('PORT', '8000'))}"
workers = int(os.getenv('WEB_CONCURRENCY', '2'))
threads = int(os.getenv('GUNICORN_THREADS', '4'))
timeout = 120
accesslog = '-'
