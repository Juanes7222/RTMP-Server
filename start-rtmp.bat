@echo off
cd /d "%~dp0"
echo  [RTMP Server] Puerto RTMP: 1935
echo  Requiere que el Dashboard este corriendo (puerto 8001).
echo  Presiona Ctrl+C para detener.
echo.
node server.js
