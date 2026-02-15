@echo off
echo ========================================
echo   Desinstalador de Servicios RTMP
echo ========================================
echo.

REM Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Este script requiere permisos de administrador
    echo Por favor, ejecuta como administrador
    pause
    exit /b 1
)

echo [1/4] Deteniendo servicio RTMP...
net stop RTMP-Server 2>nul
if %errorLevel% equ 0 (
    echo      Servicio RTMP detenido
) else (
    echo      El servicio RTMP no estaba corriendo
)
echo.

echo [2/4] Deteniendo servicio Dashboard...
net stop RTMP-Dashboard 2>nul
if %errorLevel% equ 0 (
    echo      Servicio Dashboard detenido
) else (
    echo      El servicio Dashboard no estaba corriendo
)
echo.

echo [3/4] Desinstalando servicio RTMP...
cd /d "%~dp0\.."
if exist "rtmp-service.exe" (
    rtmp-service.exe uninstall
    if %errorLevel% equ 0 (
        echo      Servicio RTMP desinstalado
    ) else (
        echo      ERROR al desinstalar servicio RTMP
    )
) else (
    echo      No se encuentra rtmp-service.exe
)
echo.

echo [4/4] Desinstalando servicio Dashboard...
if exist "dashboard-service.exe" (
    dashboard-service.exe uninstall
    if %errorLevel% equ 0 (
        echo      Servicio Dashboard desinstalado
    ) else (
        echo      ERROR al desinstalar servicio Dashboard
    )
) else (
    echo      No se encuentra dashboard-service.exe
)
echo.

echo ========================================
echo   Desinstalacion completada
echo ========================================
echo.
pause
