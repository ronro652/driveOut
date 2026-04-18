import logging
import os
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

LOCAL_TIMEZONE = "Asia/Jerusalem"

DEFAULT_MAX_DRIVE_MIN = 15
DEFAULT_THRESHOLD_WAIT_MIN = 5
STATION_SEARCH_RADIUS_M = 15_000
MAX_GEOCODE_CACHE = 500
MAX_OPTIONS = 5
MIN_OPTIONS = 3
SLOW_OPTION_FACTOR = 1.5   # options > 1.5× the fastest arrival are "much slower"
WALK_THRESHOLD_MIN = 3
LEG_PENALTY = 0.15

# --------------- Open Bus Stride API ---------------
STRIDE_API_BASE = "https://open-bus-stride-api.hasadna.org.il"
STRIDE_API_TIMEOUT = 15  # seconds — the API can be slow
STRIDE_POLL_INTERVAL = 60  # seconds between polling in trip mode

# --------------- Logging ---------------
LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()


def get_logger(name: str) -> logging.Logger:
    """Return a module-level logger that writes to console + rotating file."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

        formatter = logging.Formatter(LOG_FORMAT)

        # Console
        sh = logging.StreamHandler()
        sh.setFormatter(formatter)
        logger.addHandler(sh)

        # File – 5 MB per file, keep 3 backups
        fh = RotatingFileHandler(
            os.path.join(LOG_DIR, "driveout.log"),
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        fh.setFormatter(formatter)
        logger.addHandler(fh)

    return logger
