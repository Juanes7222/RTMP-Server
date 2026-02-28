@echo off
cd /d "%~dp0"
echo  [Dashboard] Puerto HTTP: 8001  ^|  WebSocket: 8002
echo  Presiona Ctrl+C para detener.
echo.
node dashboard-server.js
