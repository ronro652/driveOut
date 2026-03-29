import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

DEFAULT_MAX_DRIVE_MIN = 15
DEFAULT_THRESHOLD_WAIT_MIN = 5
STATION_SEARCH_RADIUS_M = 15_000
MAX_GEOCODE_CACHE = 500
MAX_OPTIONS = 5
WALK_THRESHOLD_MIN = 3
LEG_PENALTY = 0.15
