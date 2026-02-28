@echo off
cd /d "%~dp0.."
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║          DESINSTALAR SERVICIOS RTMP                 ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Requiere permisos de Administrador.
    pause & exit /b 1
)

echo  Esto detendra y desinstalara ambos servicios.
echo  Presiona Ctrl+C para cancelar, o cualquier tecla para continuar...
pause >nul
echo.

REM Detener primero
echo  [1/4] Deteniendo RTMP Server...
net stop RTMP-Server >nul 2>&1
echo       OK

echo  [2/4] Deteniendo Dashboard...
net stop RTMP-Dashboard >nul 2>&1
echo       OK
echo.

REM Desinstalar
echo  [3/4] Desinstalando servicio RTMP...
if exist "rtmp-service.exe" (
    rtmp-service.exe uninstall
) else if exist "config\rtmp-service.exe" (
    copy "config\rtmp-service.exe" "rtmp-service.exe" >nul
    rtmp-service.exe uninstall
) else (
    echo       [!] rtmp-service.exe no encontrado - intentando con sc.exe...
    sc delete RTMP-Server >nul 2>&1
)
echo.

echo  [4/4] Desinstalando servicio Dashboard...
if exist "dashboard-service.exe" (
    dashboard-service.exe uninstall
) else if exist "config\dashboard-service.exe" (
    copy "config\dashboard-service.exe" "dashboard-service.exe" >nul
    dashboard-service.exe uninstall
) else (
    echo       [!] dashboard-service.exe no encontrado - intentando con sc.exe...
    sc delete RTMP-Dashboard >nul 2>&1
)
echo.
echo  Servicios desinstalados correctamente.
echo.
pause
