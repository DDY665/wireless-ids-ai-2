import time

try:
    from .config import POLL_INTERVAL
    from .kismet_poller import test_connection, get_new_alerts, parse_alert
    from .llm_explainer import explain_alert
except ImportError:
    from config import POLL_INTERVAL
    from kismet_poller import test_connection, get_new_alerts, parse_alert
    from llm_explainer import explain_alert


def run():
    print("=== Wireless IDS - AI-Powered Alert Explainer ===\n")

    if not test_connection():
        print("Exiting. Fix Kismet connection first.")
        return

    print(f"Polling Kismet every {POLL_INTERVAL} seconds...\n")

    try:
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
                    except Exception as err:
                        print(f"[ERROR] LLM call failed: {err}")

                    print("=" * 60)
                    print()
            else:
                print(f"[{time.strftime('%H:%M:%S')}] No new alerts. Waiting...")

            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("\n[INFO] Poller stopped by user.")


if __name__ == "__main__":
    run()
