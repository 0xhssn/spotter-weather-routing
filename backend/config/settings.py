import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "local-development-only-change-before-deploying")
if not DEBUG and SECRET_KEY.startswith("local-development"):
    raise RuntimeError("Set a unique DJANGO_SECRET_KEY before deploying.")
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend,testserver").split(",")
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
INSTALLED_APPS = ["planner"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "django.middleware.common.CommonMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware"]
USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATA_UPLOAD_MAX_MEMORY_SIZE = 16384
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "spotter", "OPTIONS": {"MAX_ENTRIES": 3000}}}
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
ROUTING_PROVIDER = os.getenv("ROUTING_PROVIDER", "valhalla")
if ROUTING_PROVIDER not in ("valhalla", "osrm"):
    raise RuntimeError("ROUTING_PROVIDER must be valhalla or osrm.")
VALHALLA_BASE_URL = os.getenv("VALHALLA_BASE_URL", "https://valhalla1.openstreetmap.de").rstrip("/")
ROUTING_CLIENT_ID = os.getenv("ROUTING_CLIENT_ID", "spotter-assessment-local")
WEATHER_BASE_URL = os.getenv("WEATHER_BASE_URL", "https://api.open-meteo.com").rstrip("/")
GEOCODING_BASE_URL = os.getenv("GEOCODING_BASE_URL", "https://geocoding-api.open-meteo.com").rstrip("/")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
