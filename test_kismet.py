import requests

r = requests.get(
    "http://192.168.0.238:2501/alerts/all_alerts.json", auth=("ddy665", "admin123")
)
print(r.json())
