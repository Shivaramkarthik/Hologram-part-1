@echo off
title Hologram Control Matrix Launcher
echo =======================================================
echo   Project Hologram Control Matrix - Live Launcher
echo =======================================================

:: Move into the backend folder relative to batch script location
cd /d "%~dp0backend"

:: Check if Python virtual environment exists
if not exist "venv" (
    echo [System] Python virtual environment not found. Creating venv...
    python -m venv venv
)

:: Activate the virtual environment
echo [System] Activating virtual environment...
call venv\Scripts\activate.bat

:: Install dependencies silently to ensure everything is set up
echo [System] Checking dependencies (silently)...
pip install -r requirements.txt --quiet

:: Start the FastAPI server in a separate background window
echo [System] Launching FastAPI backend server...
start "Hologram Backend Server" venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8000

:: Wait 3 seconds for the server to spin up
echo [System] Initializing backend (waiting 3s)...
timeout /t 3 /nobreak >nul

:: Open the served webpage in the default browser (resolves websocket location correctly)
echo [System] Opening Hologram Control Matrix in browser...
start "" "http://127.0.0.1:8000/"

echo =======================================================
echo [Success] Hologram Matrix is running!
echo You can close this launcher window.
echo =======================================================
timeout /t 5 >nul
exit
