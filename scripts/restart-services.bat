@echo off
echo ========================================
echo   Reiniciando Servicios RTMP
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

echo Paso 1: Deteniendo servicios...
echo.

echo [1/4] Deteniendo RTMP Server...
net stop RTMP-Server 2>nul
echo.

echo [2/4] Deteniendo Dashboard...
net stop RTMP-Dashboard 2>nul
echo.

echo Esperando 2 segundos...
timeout /t 2 /nobreak > nul
echo.

echo Paso 2: Iniciando servicios...
echo.

echo [3/4] Iniciando Dashboard...
net start RTMP-Dashboard
echo.

echo Esperando 3 segundos...
timeout /t 3 /nobreak > nul
echo.

echo [4/4] Iniciando RTMP Server...
net start RTMP-Server
echo.

echo ========================================
echo   Servicios reiniciados
echo ========================================
echo   Dashboard: http://localhost:8001
echo   RTMP: rtmp://localhost:1935/live/stream
echo ========================================
echo.
pause
