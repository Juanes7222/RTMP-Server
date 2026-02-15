@echo off
echo ========================================
echo   Deteniendo Servicios RTMP
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

echo [1/2] Deteniendo RTMP Server...
net stop RTMP-Server
if %errorLevel% equ 0 (
    echo      RTMP Server detenido
) else (
    echo      El servicio RTMP ya estaba detenido
)
echo.

echo [2/2] Deteniendo Dashboard...
net stop RTMP-Dashboard
if %errorLevel% equ 0 (
    echo      Dashboard detenido
) else (
    echo      El servicio Dashboard ya estaba detenido
)
echo.

echo ========================================
echo   Servicios detenidos
echo ========================================
echo.
pause
