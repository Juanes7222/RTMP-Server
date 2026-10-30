@echo off
cd /d "%~dp0"
echo  [Dashboard] Puerto HTTP/WS: 8001  ^|  ws://localhost:8001/ws
echo  Presiona Ctrl+C para detener.
echo.
node dashboard-server.js
