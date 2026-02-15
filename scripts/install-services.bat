@echo off
echo ========================================
echo   Instalador de Servicios RTMP
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

echo Verificando archivos necesarios...
echo.

REM Verificar que existan los archivos XML
if not exist "..\config\dashboard-service.xml" (
    echo ERROR: No se encuentra config\dashboard-service.xml
    pause
    exit /b 1
)

if not exist "..\config\rtmp-service.xml" (
    echo ERROR: No se encuentra config\rtmp-service.xml
    pause
    exit /b 1
)

REM Copiar archivos XML a la raíz si no existen
if not exist "..\dashboard-service.xml" (
    copy "..\config\dashboard-service.xml" "..\dashboard-service.xml" >nul
    echo Copiado dashboard-service.xml desde config\
)

if not exist "..\rtmp-service.xml" (
    copy "..\config\rtmp-service.xml" "..\rtmp-service.xml" >nul
    echo Copiado rtmp-service.xml desde config\
)

REM Verificar que existan los ejecutables de WinSW
if not exist "..\dashboard-service.exe" (
    echo ADVERTENCIA: No se encuentra dashboard-service.exe
    echo Descarga WinSW desde: https://github.com/winsw/winsw/releases
    echo Renombra el archivo a: dashboard-service.exe
    echo Coloca el archivo en: C:\RTMP\
    echo.
    pause
    exit /b 1
)

if not exist "..\rtmp-service.exe" (
    echo ADVERTENCIA: No se encuentra rtmp-service.exe
    echo Descarga WinSW desde: https://github.com/winsw/winsw/releases
    echo Renombra el archivo a: rtmp-service.exe
    echo Coloca el archivo en: C:\RTMP\
    echo.
    pause
    exit /b 1
)

echo [1/4] Instalando servicio Dashboard...
cd /d "%~dp0\.."
dashboard-service.exe install
if %errorLevel% equ 0 (
    echo      Servicio Dashboard instalado correctamente
) else (
    echo      ERROR al instalar el servicio Dashboard
)
echo.

echo [2/4] Instalando servicio RTMP...
rtmp-service.exe install
if %errorLevel% equ 0 (
    echo      Servicio RTMP instalado correctamente
) else (
    echo      ERROR al instalar el servicio RTMP
)
echo.

echo [3/4] Iniciando servicio Dashboard...
net start RTMP-Dashboard
if %errorLevel% equ 0 (
    echo      Dashboard iniciado correctamente
) else (
    echo      ERROR al iniciar Dashboard
)
echo.

echo [4/4] Iniciando servicio RTMP...
timeout /t 3 /nobreak > nul
net start RTMP-Server
if %errorLevel% equ 0 (
    echo      RTMP Server iniciado correctamente
) else (
    echo      ERROR al iniciar RTMP Server
)
echo.

echo ========================================
echo   Instalacion completada
echo ========================================
echo.
echo Servicios instalados:
echo   - RTMP-Dashboard (Puerto 8001)
echo   - RTMP-Server (Puerto 1935)
echo.
echo Dashboard disponible en: http://localhost:8001
echo.
echo Para gestionar los servicios usa services.msc
echo o los scripts: start-services.bat, stop-services.bat
echo.
pause
