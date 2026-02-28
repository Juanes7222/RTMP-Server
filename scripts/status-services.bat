@echo off
cd /d "%~dp0.."
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║              ESTADO DE SERVICIOS RTMP               ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

echo  Servicios:
echo  ─────────────────────────────────────────────────────
sc query RTMP-Dashboard | findstr "ESTADO\|STATE"
sc query RTMP-Server | findstr "ESTADO\|STATE"
echo.

echo  Puertos:
echo  ─────────────────────────────────────────────────────
netstat -ano | findstr " :8001 " | findstr LISTENING >nul 2>&1 && echo   8001 (Dashboard HTTP):  EN USO || echo   8001 (Dashboard HTTP):  LIBRE
netstat -ano | findstr " :8002 " | findstr LISTENING >nul 2>&1 && echo   8002 (WebSocket):      EN USO || echo   8002 (WebSocket):      LIBRE
netstat -ano | findstr " :1935 " | findstr LISTENING >nul 2>&1 && echo   1935 (RTMP):           EN USO || echo   1935 (RTMP):           LIBRE
echo.
pause
