@echo off
cd /d "%~dp0.."
echo.
net session >nul 2>&1
if %errorLevel% neq 0 ( echo  [ERROR] Requiere Administrador. & pause & exit /b 1 )

REM Auto-reparar exe del Dashboard si fue eliminado
if not exist "dashboard-service.exe" (
    echo  [AUTO-REPAIR] Restaurando dashboard-service.exe desde config\...
    copy "config\dashboard-service.exe" "dashboard-service.exe" >nul
    copy "config\dashboard-service.xml" "dashboard-service.xml" >nul
    echo               OK
    echo.
)

REM Limpiar procesos zombie en puertos 8001/8002
for /f "tokens=5" %%P in ('netstat -ano ^| findstr " :8001 "') do (
    taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr " :8002 "') do (
    taskkill /PID %%P /F >nul 2>&1
)

echo  [1/2] Iniciando Dashboard...
net start RTMP-Dashboard >nul 2>&1 && echo       OK || echo       [ERROR] Ejecuta fix-dashboard-service.bat
echo.
timeout /t 3 /nobreak >nul

echo  [2/2] Iniciando RTMP Server...
net start RTMP-Server >nul 2>&1 && echo       OK || echo       [ERROR] No se pudo iniciar
echo.
echo  Dashboard: http://localhost:8001
echo.
pause
