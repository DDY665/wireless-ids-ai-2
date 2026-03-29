# Wireless IDS with AI-Powered Attack Explanation

## Project Overview

A 3-laptop wireless intrusion detection system that:

1. Launches WiFi attacks from Kali Linux
2. Detects them using Kismet on a dedicated sensor laptop
3. Fetches alerts via REST API and explains them using an LLM

---

## Architecture

```
[Laptop 1 - Kali]         [Laptop 2 - Kismet Sensor]        [Laptop 3 - IDS + LLM]
  aireplay-ng       --->    monitor mode dongle         --->   Python poller
  airbase-ng      (WiFi)    Kismet running              (REST)  LLM API call
  mdk4                      port 2501                           explanation output
```

---

## Hardware Requirements

| Laptop | OS | Special Hardware |
|---|---|---|
| Laptop 1 (Attacker) | Kali Linux (VM or bare metal) | None - normal WiFi |
| Laptop 2 (Sensor) | Ubuntu / Debian | USB WiFi dongle (monitor mode) |
| Laptop 3 (IDS/LLM) | Any OS | None - normal WiFi |

**Recommended monitor mode dongles:**
- Alfa AWUS036ACH
- Alfa AWUS036NHA
- TP-Link TL-WN722N (v1 only)

---

## Project Structure

```
wireless-ids/
|- poller/
|  |- kismet_poller.py        # Polls Kismet REST API for new alerts
|  |- llm_explainer.py        # Sends alert to LLM and returns explanation
|  |- main.py                 # Entry point - runs the full pipeline
|  \- config.py               # Config: Kismet IP, API key, LLM key
|- requirements.txt
\- README.md
```

---

## Setup Instructions

### Laptop 2 - Kismet Sensor Setup

```bash
# Install Kismet
sudo apt update
sudo apt install kismet -y

# Add your user to the kismet group
sudo usermod -aG kismet $USER

# Plug in your monitor mode USB dongle
# Find its interface name
iwconfig

# Start Kismet with the dongle (e.g. wlan1)
kismet -c wlan1

# Kismet web UI available at:
# http://localhost:2501
# Default login created on first run
```

### Laptop 3 - Python Environment Setup

```bash
# Clone or create the project folder
mkdir wireless-ids && cd wireless-ids

# Create virtual environment
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## requirements.txt

```
requests==2.31.0
groq==0.9.0
python-dotenv==1.0.1
```

---

## config.py

```python
# config.py - Edit these values before running

KISMET_HOST = "192.168.1.XX"   # IP of Laptop 2 (Kismet sensor)
KISMET_PORT = 2501
KISMET_USER = "admin"
KISMET_PASSWORD = "your-kismet-password"

POLL_INTERVAL = 5  # seconds between each Kismet API poll

# LLM config (Groq)
LLM_PROVIDER = "groq"
GROQ_API_KEY = "gsk-..."
GROQ_MODEL = "llama-3.3-70b-versatile"
```

---

## kismet_poller.py

```python
# kismet_poller.py
# Polls Kismet REST API and returns new alerts since last check

import requests
import time
from config import KISMET_HOST, KISMET_PORT, KISMET_USER, KISMET_PASSWORD

BASE_URL = f"http://{KISMET_HOST}:{KISMET_PORT}"
AUTH = (KISMET_USER, KISMET_PASSWORD)

seen_alert_ids = set()


def get_alerts():
  """Fetch all current alerts from Kismet."""
  try:
    response = requests.get(
      f"{BASE_URL}/alerts/alerts.json",
      auth=AUTH,
      timeout=5
    )
    response.raise_for_status()
    return response.json()
  except requests.exceptions.ConnectionError:
    print("[ERROR] Cannot reach Kismet. Check IP and port.")
    return []
  except requests.exceptions.HTTPError as e:
    print(f"[ERROR] Kismet API error: {e}")
    return []


def get_new_alerts():
  """Return only alerts not seen in previous polls."""
  all_alerts = get_alerts()
  new_alerts = []

  for alert in all_alerts:
    alert_id = alert.get("kismet.alert.hash") or alert.get("kismet.alert.timestamp")
    if alert_id not in seen_alert_ids:
      seen_alert_ids.add(alert_id)
      new_alerts.append(alert)

  return new_alerts


def parse_alert(alert):
  """Extract the key fields from a Kismet alert dict."""
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
  """Test if Kismet API is reachable. Call this on startup."""
  try:
    r = requests.get(f"{BASE_URL}/system/status.json", auth=AUTH, timeout=5)
    if r.status_code == 200:
      print("[OK] Kismet API is reachable.")
      return True
    else:
      print(f"[WARN] Kismet responded with status {r.status_code}")
      return False
  except Exception as e:
    print(f"[ERROR] Cannot connect to Kismet: {e}")
    return False
```

---

## llm_explainer.py

```python
# llm_explainer.py
# Takes a parsed Kismet alert dict and returns an LLM explanation

from config import LLM_PROVIDER, GROQ_API_KEY, GROQ_MODEL


def build_prompt(alert: dict) -> str:
  """Format alert parameters into a clear LLM prompt."""
  return f"""
You are a wireless network security expert. Analyze the following alert detected by a wireless IDS and explain it clearly.

Alert Details:
- Type: {alert['type']}
- Severity: {alert['severity']}
- Description: {alert['text']}
- Source MAC: {alert['source_mac']}
- Destination MAC: {alert['dest_mac']}
- Channel: {alert['channel']}
- Timestamp: {alert['timestamp']}

Please provide:
1. What this attack is (in simple terms)
2. How it works
3. What the attacker is trying to achieve
4. Severity level and potential impact
5. Recommended defensive action
"""


def explain_with_groq(alert: dict) -> str:
  from groq import Groq
  client = Groq(api_key=GROQ_API_KEY)

  response = client.chat.completions.create(
    model=GROQ_MODEL,
    messages=[
      {"role": "system", "content": "You are a wireless network security expert."},
      {"role": "user", "content": build_prompt(alert)}
    ],
    max_tokens=600
  )
  return response.choices[0].message.content


def explain_alert(alert: dict) -> str:
  """Explain a parsed alert using the configured LLM provider."""
  if LLM_PROVIDER == "groq":
    return explain_with_groq(alert)
  raise ValueError(f"Unknown LLM provider: {LLM_PROVIDER}")
```

---

## main.py

```python
# main.py
# Entry point - polls Kismet and explains new alerts via LLM

import time
from config import POLL_INTERVAL
from kismet_poller import test_connection, get_new_alerts, parse_alert
from llm_explainer import explain_alert


def run():
  print("=== Wireless IDS - AI-Powered Alert Explainer ===\n")

  # Step 1: Verify Kismet connection
  if not test_connection():
    print("Exiting. Fix Kismet connection first.")
    return

  print(f"Polling Kismet every {POLL_INTERVAL} seconds...\n")

  while True:
    new_alerts = get_new_alerts()

    if new_alerts:
      for raw_alert in new_alerts:
        alert = parse_alert(raw_alert)

        print("=" * 60)
        print(f"[NEW ALERT] {alert['type']} | Severity: {alert['severity']}")
        print(f"  Source MAC : {alert['source_mac']}")
        print(f"  Dest MAC   : {alert['dest_mac']}")
        print(f"  Channel    : {alert['channel']}")
        print(f"  Details    : {alert['text']}")
        print()

        print("[LLM EXPLANATION]")
        try:
          explanation = explain_alert(alert)
          print(explanation)
        except Exception as e:
          print(f"[ERROR] LLM call failed: {e}")

        print("=" * 60)
        print()
    else:
      print(f"[{time.strftime('%H:%M:%S')}] No new alerts. Waiting...")

    time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
  run()
```

---

## How to Run

```bash
# On Laptop 3, with virtual env activated:
python -m poller.main

# Optional compatibility entrypoint from project root:
python main.py
```

Windows quick start from project root:

```bat
run_laptop3.bat
```

**Expected output when an attack is detected:**

```
============================================================
[NEW ALERT] DEAUTHFLOOD | Severity: high
  Source MAC : AA:BB:CC:DD:EE:FF
  Dest MAC   : FF:FF:FF:FF:FF:FF
  Channel    : 6
  Details    : Deauthentication flood detected from AA:BB:CC:DD:EE:FF

[LLM EXPLANATION]
1. What this is: A deauthentication flood is a denial-of-service attack...
2. How it works: The attacker sends spoofed 802.11 deauth frames...
3. Attacker's goal: Disconnect all clients from the network...
4. Severity: HIGH - all clients will lose connectivity...
5. Defense: Enable 802.11w (Protected Management Frames) on your router...
============================================================
```

---

## Kismet REST API Quick Reference

| Endpoint | Description |
|---|---|
| `GET /system/status.json` | Test if Kismet is alive |
| `GET /alerts/all_alerts.json` | All current alerts |
| `GET /alerts/last-time/0/alerts.json` | Alerts since timestamp 0 (compat fallback) |
| `GET /devices/views/all/devices.json` | All detected devices |
| `GET /datasource/all_sources.json` | Active capture sources (dongles) |
| `GET /phy/phy80211/ssids/views/all/ssids.json` | All detected SSIDs |

All requests require HTTP Basic Auth with your Kismet username and password.

---

## Attack Types Kismet Detects

| Alert Type | Attack |
|---|---|
| `DEAUTHFLOOD` | Deauthentication flood (DoS) |
| `APSPOOF` | Rogue / Evil Twin access point |
| `PROBECLIENT` | Suspicious probe requests |
| `DISASSOCTRAFFIC` | Disassociation flood |
| `BSSTIMESTAMP` | BSS timestamp anomaly |
| `CRYPTODROP` | Encryption downgrade attempt |
| `DHCPNAMECHANGE` | DHCP hostname change (spoofing) |
| `NETSTUMBLER` | Network scanning detected |

---

## Common Issues & Fixes

| Problem | Fix |
|---|---|
| `Cannot reach Kismet` | Check Kismet is running on Laptop 2, verify KISMET_HOST in .env |
| `401 Unauthorized` | Wrong Kismet username/password in .env |
| `No alerts showing` | Launch an attack from Laptop 1, or check dongle is in monitor mode |
| `Dongle not in monitor mode` | Run `sudo kismet -c wlan1` - Kismet handles monitor mode automatically |
| `LLM API error` | Check API key is valid and has credits |

---

## Laptop 1 - Example Attacks to Test

```bash
# Deauth flood (DoS) - most commonly detected
sudo aireplay-ng --deauth 100 -a <target-BSSID> wlan1

# Fake access point
sudo airbase-ng -e "FakeNetwork" -c 6 wlan1

# Probe request flood
sudo mdk4 wlan1 p -t <target-BSSID>
```

> Note: Only run these attacks on networks you own or have explicit permission to test.
