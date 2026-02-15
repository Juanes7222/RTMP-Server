@echo off
setlocal enabledelayedexpansion

cls
echo.
echo ╔════════════════════════════════════════════════════════════════════════╗
echo ║                  DIAGNÓSTICO DEL SISTEMA RTMP                          ║
echo ╚════════════════════════════════════════════════════════════════════════╝
echo.

set "ERRORS=0"
set "WARNINGS=0"

REM ═══════════════════════════════════════════════════════════════════════════
echo [PASO 1/6] Verificando Node.js...
echo ─────────────────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
    echo [✓] Node.js instalado: !NODE_VERSION!
) else (
    echo [✗] ERROR: Node.js NO está instalado
    echo     Descarga Node.js desde: https://nodejs.org/
    set /a ERRORS+=1
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
echo [PASO 2/6] Verificando archivos del proyecto...
echo ─────────────────────────────────────────────────────────────────────────

set "FILES=dashboard-server.js server.js status.js utils.js package.json"
for %%f in (%FILES%) do (
    if exist "%%f" (
        echo [✓] %%f
    ) else (
        echo [✗] FALTA: %%f
        set /a ERRORS+=1
    )
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
echo [PASO 3/6] Verificando puertos...
echo ─────────────────────────────────────────────────────────────────────────

REM Puerto 8001
netstat -ano | findstr ":8001" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo [i] Puerto 8001 (Dashboard HTTP): EN USO
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001" ^| findstr "LISTENING"') do (
        echo     PID: %%a
        set "PID=%%a"
        goto :check8002
    )
) else (
    echo [✓] Puerto 8001 (Dashboard HTTP): LIBRE
)

:check8002
REM Puerto 8002
netstat -ano | findstr ":8002" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo [i] Puerto 8002 (WebSocket): EN USO
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8002" ^| findstr "LISTENING"') do (
        echo     PID: %%a
        goto :check1935
    )
) else (
    echo [✓] Puerto 8002 (WebSocket): LIBRE
)

:check1935
REM Puerto 1935
netstat -ano | findstr ":1935" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo [i] Puerto 1935 (RTMP): EN USO
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1935" ^| findstr "LISTENING"') do (
        echo     PID: %%a
    )
) else (
    echo [✓] Puerto 1935 (RTMP): LIBRE
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
echo [PASO 4/6] Verificando dependencias de Node.js...
echo ─────────────────────────────────────────────────────────────────────────
if exist "node_modules" (
    echo [✓] node_modules encontrado
) else (
    echo [!] ADVERTENCIA: node_modules no encontrado
    echo     Ejecuta: npm install
    set /a WARNINGS+=1
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
echo [PASO 5/6] Obteniendo información de red...
echo ─────────────────────────────────────────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :gotIP
)
:gotIP
if defined IP (
    echo [✓] IP Local:%IP%
) else (
    echo [!] No se pudo obtener la IP local
    set /a WARNINGS+=1
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
echo [PASO 6/6] Verificando configuración de servicios (opcional)...
echo ─────────────────────────────────────────────────────────────────────────

if exist "config\dashboard-service.xml" (
    echo [✓] config\dashboard-service.xml
) else (
    echo [!] config\dashboard-service.xml no encontrado
    set /a WARNINGS+=1
)

if exist "config\rtmp-service.xml" (
    echo [✓] config\rtmp-service.xml
) else (
    echo [!] config\rtmp-service.xml no encontrado
    set /a WARNINGS+=1
)

if exist "dashboard-service.exe" (
    echo [✓] dashboard-service.exe (WinSW)
) else (
    echo [i] dashboard-service.exe no encontrado (solo necesario para servicios Windows)
)

if exist "rtmp-service.exe" (
    echo [✓] rtmp-service.exe (WinSW)
) else (
    echo [i] rtmp-service.exe no encontrado (solo necesario para servicios Windows)
)
echo.

REM ═══════════════════════════════════════════════════════════════════════════
echo ═════════════════════════════════════════════════════════════════════════
echo                             RESUMEN
echo ═════════════════════════════════════════════════════════════════════════

if %ERRORS% equ 0 (
    if %WARNINGS% equ 0 (
        echo [✓] Sistema listo para usar - No hay problemas
        echo.
        echo Para iniciar el sistema ejecuta:
        echo     INICIAR.bat
    ) else (
        echo [!] Sistema funcional con !WARNINGS! advertencia^(s^)
        echo     El sistema puede funcionar pero hay advertencias
    )
) else (
    echo [✗] Se encontraron !ERRORS! error^(es^) que deben ser corregidos
    echo     El sistema NO puede iniciar correctamente
)
echo.

if defined IP (
    echo ═════════════════════════════════════════════════════════════════════════
    echo                       URLS DE ACCESO
    echo ═════════════════════════════════════════════════════════════════════════
    echo.
    echo   Dashboard Web:    http://%IP%:8001
    echo   WebSocket:        ws://%IP%:8002  
    echo   RTMP Stream:      rtmp://%IP%:1935/live/stream
    echo.
    echo ═════════════════════════════════════════════════════════════════════════
)

echo.
pause
