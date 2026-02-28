@echo off
cd /d "%~dp0.."
echo.
net session >nul 2>&1
if %errorLevel% neq 0 ( echo  [ERROR] Requiere Administrador. & pause & exit /b 1 )

echo  [1/2] Deteniendo RTMP Server...
net stop RTMP-Server 2>nul && echo       OK || echo       Ya estaba detenido

echo  [2/2] Deteniendo Dashboard...
net stop RTMP-Dashboard 2>nul && echo       OK || echo       Ya estaba detenido
echo.
pause
