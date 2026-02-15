@echo off
echo ========================================
echo   Estado de Servicios RTMP
echo ========================================
echo.

REM Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ADVERTENCIA: Sin permisos de administrador
    echo Algunos comandos pueden no funcionar
    echo.
)

echo Consultando estado de servicios...
echo.

echo Dashboard (RTMP-Dashboard):
sc query RTMP-Dashboard | findstr "STATE"
echo.

echo RTMP Server (RTMP-Server):
sc query RTMP-Server | findstr "STATE"
echo.

echo ========================================
echo   Verificando puertos
echo ========================================
echo.

echo Puerto 8001 (Dashboard HTTP):
netstat -ano | findstr ":8001" | findstr "LISTENING"
if %errorLevel% neq 0 (
    echo   No hay proceso escuchando en puerto 8001
)
echo.

echo Puerto 8002 (WebSocket):
netstat -ano | findstr ":8002" | findstr "LISTENING"
if %errorLevel% neq 0 (
    echo   No hay proceso escuchando en puerto 8002
)
echo.

echo Puerto 1935 (RTMP):
netstat -ano | findstr ":1935" | findstr "LISTENING"
if %errorLevel% neq 0 (
    echo   No hay proceso escuchando en puerto 1935
)
echo.

echo ========================================
echo   URLs de acceso
echo ========================================
echo   Dashboard: http://localhost:8001
echo   WebSocket: ws://localhost:8002
echo   RTMP: rtmp://localhost:1935/live/stream
echo ========================================
echo.
pause
