@echo off
echo ========================================
echo   Iniciando Servicios RTMP
echo ========================================
echo.

REM Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Este script requiere permisos de administrador
    echo Por favor, ejecuta como administrador
    pause
    exit /b 1
)

echo [1/2] Iniciando Dashboard...
net start RTMP-Dashboard
if %errorLevel% equ 0 (
    echo      Dashboard iniciado
) else (
    echo      ERROR: No se pudo iniciar Dashboard
)
echo.

echo Esperando 3 segundos...
timeout /t 3 /nobreak > nul
echo.

echo [2/2] Iniciando RTMP Server...
net start RTMP-Server
if %errorLevel% equ 0 (
    echo      RTMP Server iniciado
) else (
    echo      ERROR: No se pudo iniciar RTMP Server
)
echo.

echo ========================================
echo   Servicios iniciados
echo ========================================
echo   Dashboard: http://localhost:8001
echo   WebSocket: ws://localhost:8002
echo   RTMP: rtmp://localhost:1935/live/stream
echo ========================================
echo.
pause
