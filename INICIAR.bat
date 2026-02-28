@echo off
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║          INICIO RAPIDO - RTMP + Dashboard            ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

REM Verificar Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Node.js no esta instalado.
    echo  Descarga desde: https://nodejs.org/
    pause & exit /b 1
)

REM Verificar archivos principales
if not exist "%~dp0dashboard-server.js" (
    echo  [ERROR] No se encuentra dashboard-server.js
    pause & exit /b 1
)
if not exist "%~dp0server.js" (
    echo  [ERROR] No se encuentra server.js
    pause & exit /b 1
)

echo  Iniciando servidores en modo desarrollo...
echo  (Cierra cada ventana para detener el servidor correspondiente)
echo.

echo  [1/2] Iniciando Dashboard Server...
start "RTMP Dashboard" cmd /k "title RTMP Dashboard & cd /d %~dp0 & node dashboard-server.js"

echo  [2/2] Esperando 3 segundos e iniciando RTMP Server...
timeout /t 3 /nobreak > nul
start "RTMP Server" cmd /k "title RTMP Server & cd /d %~dp0 & node server.js"

echo.
echo  ┌──────────────────────────────────────────────────────┐
echo  │  Dashboard:  http://localhost:8001                   │
echo  │  WebSocket:  ws://localhost:8002                     │
echo  │  RTMP:       rtmp://localhost:1935/live/stream       │
echo  └──────────────────────────────────────────────────────┘
echo.
timeout /t 3 /nobreak > nul
start "" "http://localhost:8001"


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
