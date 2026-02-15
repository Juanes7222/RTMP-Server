@echo off
echo ========================================
echo   Verificacion del Sistema RTMP
echo ========================================
echo.

echo [1/4] Verificando Node.js...
where node >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
    echo     Node.js: %NODE_VERSION% [OK]
) else (
    echo     Node.js: NO INSTALADO [ERROR]
    echo     Descarga Node.js desde: https://nodejs.org/
    goto :end
)
echo.

echo [2/4] Verificando archivos principales...
if exist "dashboard-server.js" (
    echo     dashboard-server.js [OK]
) else (
    echo     dashboard-server.js [FALTA]
)

if exist "server.js" (
    echo     server.js [OK]
) else (
    echo     server.js [FALTA]
)

if exist "status.js" (
    echo     status.js [OK]
) else (
    echo     status.js [FALTA]
)

if exist "package.json" (
    echo     package.json [OK]
) else (
    echo     package.json [FALTA]
)
echo.

echo [3/4] Verificando puertos...
netstat -ano | findstr ":8001" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo     Puerto 8001 (Dashboard HTTP): EN USO
    echo     Hay un proceso usando este puerto.
) else (
    echo     Puerto 8001 (Dashboard HTTP): LIBRE [OK]
)

netstat -ano | findstr ":8002" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo     Puerto 8002 (WebSocket): EN USO
    echo     Hay un proceso usando este puerto.
) else (
    echo     Puerto 8002 (WebSocket): LIBRE [OK]
)

netstat -ano | findstr ":1935" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo     Puerto 1935 (RTMP): EN USO
    echo     Hay un proceso usando este puerto.
) else (
    echo     Puerto 1935 (RTMP): LIBRE [OK]
)
echo.

echo [4/4] Obteniendo IP local...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :gotIP
)
:gotIP
if defined IP (
    echo     IP Local:%IP%
) else (
    echo     No se pudo obtener la IP local
)
echo.

echo ========================================
echo   URLs de Acceso
echo ========================================
if defined IP (
    echo   Dashboard:  http://%IP%:8001
    echo   WebSocket:  ws://%IP%:8002
    echo   RTMP:       rtmp://%IP%:1935/live/stream
) else (
    echo   Dashboard:  http://localhost:8001
    echo   WebSocket:  ws://localhost:8002
    echo   RTMP:       rtmp://localhost:1935/live/stream
)
echo ========================================
echo.

:end
pause
