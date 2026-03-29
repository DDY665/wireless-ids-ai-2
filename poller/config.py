import os
from pathlib import Path
from dotenv import load_dotenv

POLLER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = POLLER_DIR.parent

# Load env from project root first, then optional poller-local override.
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(POLLER_DIR / ".env", override=True)


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


KISMET_HOST = os.getenv("KISMET_HOST", "127.0.0.1")
KISMET_PORT = _to_int(os.getenv("KISMET_PORT", "2501"), 2501)
KISMET_USER = os.getenv("KISMET_USER", "admin")
KISMET_PASSWORD = os.getenv("KISMET_PASSWORD", "")

POLL_INTERVAL = _to_int(os.getenv("POLL_INTERVAL", "5"), 5)
ALERT_ID_CACHE_TTL_SECONDS = _to_int(
    os.getenv("ALERT_ID_CACHE_TTL_SECONDS", "86400"), 86400
)
ALERT_ID_CACHE_MAX_SIZE = _to_int(os.getenv("ALERT_ID_CACHE_MAX_SIZE", "20000"), 20000)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").strip().lower()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

REQUEST_TIMEOUT_SECONDS = _to_int(os.getenv("REQUEST_TIMEOUT_SECONDS", "5"), 5)

if LLM_PROVIDER != "groq":
    raise ValueError("LLM_PROVIDER must be 'groq' for Laptop 3 poller mode")
