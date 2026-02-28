@echo off
echo ========================================
echo   Fix RTMP-Dashboard Service
echo ========================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Ejecuta como Administrador
    pause
    exit /b 1
)

echo [1/5] Restaurando archivos WinSW desde config\...
copy "%~dp0..\config\dashboard-service.exe" "%~dp0..\dashboard-service.exe" >nul
copy "%~dp0..\config\dashboard-service.xml" "%~dp0..\dashboard-service.xml" >nul
echo      OK

echo.
echo [2/5] Limpiando procesos zombie en puertos 8001/8002...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr " :8001 "') do (
    echo      Matando PID %%P ^(puerto 8001^)
    taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr " :8002 "') do (
    echo      Matando PID %%P ^(puerto 8002^)
    taskkill /PID %%P /F >nul 2>&1
)
echo      OK

echo.
echo [3/5] Actualizando path del servicio en el registro...
sc config RTMP-Dashboard binPath= "%~dp0..\dashboard-service.exe"
if %errorLevel% equ 0 (
    echo      OK
) else (
    echo      ADVERTENCIA: No se pudo actualizar - puede que el servicio no este instalado
)

echo.
echo [4/5] Iniciando RTMP-Dashboard...
sc start RTMP-Dashboard
timeout /t 3 /nobreak >nul
sc query RTMP-Dashboard | findstr "ESTADO\|STATE"

echo.
echo [5/5] Verificando respuesta HTTP...
timeout /t 2 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8001' -TimeoutSec 4 -UseBasicParsing; Write-Host '     OK - Dashboard responde en http://localhost:8001' } catch { Write-Host '     ERROR:' $_.Exception.Message }"

echo.
pause
