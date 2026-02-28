@echo off
cd /d "%~dp0.."
echo.
net session >nul 2>&1
if %errorLevel% neq 0 ( echo  [ERROR] Requiere Administrador. & pause & exit /b 1 )

echo  [1/4] Deteniendo RTMP Server...
net stop RTMP-Server >nul 2>&1 && echo       OK || echo       Ya estaba detenido

echo  [2/4] Deteniendo Dashboard...
net stop RTMP-Dashboard >nul 2>&1 && echo       OK || echo       Ya estaba detenido

timeout /t 2 /nobreak >nul

echo  [3/4] Iniciando Dashboard...
net start RTMP-Dashboard && echo       OK || echo       [ERROR] No se pudo iniciar

timeout /t 3 /nobreak >nul

echo  [4/4] Iniciando RTMP Server...
net start RTMP-Server && echo       OK || echo       [ERROR] No se pudo iniciar
echo.
echo  Dashboard: http://localhost:8001
echo.
pause
