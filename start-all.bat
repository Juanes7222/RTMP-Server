@echo off
echo ========================================
echo   Iniciando Sistema RTMP Completo
echo ========================================
echo.

echo [1/2] Iniciando Dashboard Server...
start "RTMP Dashboard" cmd /k "cd /d %~dp0 && node dashboard-server.js"
timeout /t 3 /nobreak > nul

echo [2/2] Iniciando RTMP Server...
start "RTMP Server" cmd /k "cd /d %~dp0 && node server.js"

echo.
echo ========================================
echo   Servidores iniciados correctamente
echo ========================================
echo.
echo   Dashboard:  http://localhost:8001
echo   WebSocket:  ws://localhost:8002
echo   RTMP:       rtmp://localhost:1935/live/stream
echo.
echo ========================================
echo.
echo Se abrieron dos ventanas de terminal.
echo Cierra cada ventana para detener el servicio correspondiente.
echo.
pause
