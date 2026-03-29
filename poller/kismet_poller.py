import requests
import time
from collections import OrderedDict

try:
    from .config import (
        KISMET_HOST,
        KISMET_PORT,
        KISMET_USER,
        KISMET_PASSWORD,
        REQUEST_TIMEOUT_SECONDS,
        ALERT_ID_CACHE_TTL_SECONDS,
        ALERT_ID_CACHE_MAX_SIZE,
    )
except ImportError:
    from config import (
        KISMET_HOST,
        KISMET_PORT,
        KISMET_USER,
        KISMET_PASSWORD,
        REQUEST_TIMEOUT_SECONDS,
        ALERT_ID_CACHE_TTL_SECONDS,
        ALERT_ID_CACHE_MAX_SIZE,
    )

BASE_URL = f"http://{KISMET_HOST}:{KISMET_PORT}"
AUTH = (KISMET_USER, KISMET_PASSWORD)

seen_alert_ids = OrderedDict()
ALERT_ENDPOINT_CANDIDATES = (
    "/alerts/alerts.json",
    "/alerts/all_alerts.json",
    "/alerts/last-time/0/alerts.json",
    "/alerts/wrapped/last-time/0/alerts.json",
)


def _prune_seen_alert_ids(now_epoch):
    cutoff = now_epoch - max(ALERT_ID_CACHE_TTL_SECONDS, 0)

    while seen_alert_ids:
        oldest_id, oldest_seen = next(iter(seen_alert_ids.items()))
        if oldest_seen >= cutoff:
            break
        seen_alert_ids.pop(oldest_id, None)

    while len(seen_alert_ids) > max(ALERT_ID_CACHE_MAX_SIZE, 1):
        seen_alert_ids.popitem(last=False)


def get_alerts():
    """Fetch all current alerts from Kismet."""
    try:
        for endpoint in ALERT_ENDPOINT_CANDIDATES:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                auth=AUTH,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )

            if response.status_code == 404:
                continue

            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, list) else []

        print("[ERROR] No compatible Kismet alerts endpoint was found.")
        return []
    except requests.exceptions.ConnectionError:
        print("[ERROR] Cannot reach Kismet. Check host and port.")
        return []
    except requests.exceptions.HTTPError as err:
        print(f"[ERROR] Kismet API error: {err}")
        return []
    except requests.exceptions.Timeout:
        print("[ERROR] Kismet request timed out.")
        return []
    except ValueError:
        print("[ERROR] Kismet returned invalid JSON.")
        return []


def _get_alert_id(alert):
    candidates = (
        alert.get("kismet.alert.hash"),
        alert.get("kismet.alert.uuid"),
        alert.get("kismet.alert.timestamp"),
    )
    for candidate in candidates:
        if candidate:
            return str(candidate)
    return None


def get_new_alerts():
    """Return only alerts not seen in previous polls."""
    all_alerts = get_alerts()
    new_alerts = []
    now_epoch = time.time()

    _prune_seen_alert_ids(now_epoch)

    for alert in all_alerts:
        alert_id = _get_alert_id(alert)
        if not alert_id:
            continue
        if alert_id not in seen_alert_ids:
            seen_alert_ids[alert_id] = now_epoch
            new_alerts.append(alert)
        else:
            seen_alert_ids[alert_id] = now_epoch

    return new_alerts


def parse_alert(alert):
    """Extract key fields from a Kismet alert dict."""
    return {
        "type": alert.get("kismet.alert.class", "UNKNOWN"),
        "severity": alert.get("kismet.alert.severity", "unknown"),
        "text": alert.get("kismet.alert.text", "No description"),
        "source_mac": alert.get("kismet.alert.transmitter_mac", "unknown"),
        "dest_mac": alert.get("kismet.alert.dest_mac", "unknown"),
        "channel": alert.get("kismet.alert.channel", "unknown"),
        "timestamp": alert.get("kismet.alert.timestamp", "unknown"),
    }


def test_connection():
    """Verify Kismet API is reachable."""
    try:
        response = requests.get(
            f"{BASE_URL}/system/status.json",
            auth=AUTH,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code == 200:
            print("[OK] Kismet API is reachable.")
            return True
        print(f"[WARN] Kismet responded with status {response.status_code}")
        return False
    except Exception as err:
        print(f"[ERROR] Cannot connect to Kismet: {err}")
        return False
