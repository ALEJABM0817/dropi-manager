@echo off
title Dropi Manager
echo ============================================
echo     DROPI MANAGER - Iniciando...
echo ============================================
echo.

set NODE_PATH=C:\Program Files\nodejs
set PYTHON_PATH=C:\Users\RentAdvisor\AppData\Local\Python\bin
set PATH=%PATH%;%NODE_PATH%;%PYTHON_PATH%

:: Start Python backend
start "Dropi - Backend" cmd /k "set PATH=%PATH%;%PYTHON_PATH% && cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start React frontend using vite.cmd
start "Dropi - Frontend" cmd /k "set PATH=%PATH%;%NODE_PATH% && cd /d "%~dp0frontend" && node_modules\.bin\vite.cmd"

echo.
echo  Backend API:  http://localhost:3001/api/health
echo  Frontend:     http://localhost:3000
echo.
echo  Abriendo navegador en 8 segundos...
timeout /t 8 /nobreak >nul
start http://localhost:3000
