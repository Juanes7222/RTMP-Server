@echo off
cls
echo.
echo ╔════════════════════════════════════════════════════════════════════════╗
echo ║              INICIO RAPIDO - Sistema RTMP + Dashboard                 ║
echo ╚════════════════════════════════════════════════════════════════════════╝
echo.
echo Este script iniciara ambos servidores en modo desarrollo.
echo.
echo ¿Que hace este script?
echo   1. Inicia el Dashboard Server (puerto 8001/8002)
echo   2. Inicia el RTMP Server (puerto 1935)
echo   3. Abre el Dashboard en tu navegador
echo.
echo Presiona cualquier tecla para continuar o Ctrl+C para cancelar...
pause >nul
echo.

REM Verificar Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js no esta instalado
    echo Descarga Node.js desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [✓] Node.js detectado
echo.

REM Verificar puertos
echo Verificando puertos...
netstat -ano | findstr ":8001" | findstr "LISTENING" >nul 2>&1
if %errorLevel% equ 0 (
    echo [!] ADVERTENCIA: Puerto 8001 ya esta en uso
    echo     Detén el proceso que lo está usando o ignora este mensaje si ya esta corriendo
    echo.
)

echo.
echo ════════════════════════════════════════════════════════════════════════
echo   Iniciando servidores...
echo ════════════════════════════════════════════════════════════════════════
echo.

echo [1/3] Iniciando Dashboard Server...
start "RTMP Dashboard" cmd /k "title RTMP Dashboard ^& cd /d %~dp0 ^& echo Dashboard HTTP: http://localhost:8001 ^& echo WebSocket: ws://localhost:8002 ^& echo. ^& echo Presiona Ctrl+C para detener ^& echo. ^& node dashboard-server.js"

echo [2/3] Esperando 3 segundos...
timeout /t 3 /nobreak > nul

echo [3/3] Iniciando RTMP Server...
start "RTMP Server" cmd /k "title RTMP Server ^& cd /d %~dp0 ^& echo RTMP Server: rtmp://localhost:1935/live/stream ^& echo. ^& echo Presiona Ctrl+C para detener ^& echo. ^& node server.js"

echo.
echo ════════════════════════════════════════════════════════════════════════
echo   ¡Sistema iniciado correctamente!
echo ════════════════════════════════════════════════════════════════════════
echo.

echo Esperando 2 segundos para abrir el dashboard...
timeout /t 2 /nobreak > nul

echo Abriendo dashboard en el navegador...
start http://localhost:8001

echo.
echo ╔════════════════════════════════════════════════════════════════════════╗
echo ║                         SISTEMA EN EJECUCION                           ║
echo ╠════════════════════════════════════════════════════════════════════════╣
echo ║  Dashboard:      http://localhost:8001                                 ║
echo ║  WebSocket:      ws://localhost:8002                                   ║
echo ║  RTMP Stream:    rtmp://localhost:1935/live/stream                     ║
echo ╠════════════════════════════════════════════════════════════════════════╣
echo ║  Se abrieron DOS ventanas de terminal:                                 ║
echo ║    - RTMP Dashboard                                                    ║
echo ║    - RTMP Server                                                       ║
echo ║                                                                        ║
echo ║  Para detener: Cierra cada ventana o presiona Ctrl+C en cada una      ║
echo ╚════════════════════════════════════════════════════════════════════════╝
echo.
pause
