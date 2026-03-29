@echo off
setlocal

if not exist venv (
  echo [SETUP] Creating virtual environment...
  python -m venv venv
)

call venv\Scripts\activate

echo [SETUP] Installing Python dependencies...
pip install -r requirements.txt

echo [RUN] Starting Laptop 3 poller...
python -m poller.main
