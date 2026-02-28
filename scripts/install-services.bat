@echo off
cd /d "%~dp0.."
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║           INSTALAR SERVICIOS RTMP                   ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Requiere permisos de Administrador.
    pause & exit /b 1
)

REM Verificar que los EXE existen en config\
if not exist "config\dashboard-service.exe" (
    echo  [ERROR] No se encuentra config\dashboard-service.exe
    echo  Descarga WinSW desde: https://github.com/winsw/winsw/releases
    echo  Renombra el archivo a dashboard-service.exe y colócalo en config\
    pause & exit /b 1
)
if not exist "config\rtmp-service.exe" (
    echo  [ERROR] No se encuentra config\rtmp-service.exe
    pause & exit /b 1
)

REM Copiar EXE y XML a la raiz (WinSW necesita ambos en el mismo directorio)
echo  [1/4] Copiando archivos WinSW a C:\RTMP\...
copy "config\dashboard-service.exe" "dashboard-service.exe" >nul
copy "config\dashboard-service.xml" "dashboard-service.xml" >nul
copy "config\rtmp-service.exe"      "rtmp-service.exe"      >nul
copy "config\rtmp-service.xml"      "rtmp-service.xml"      >nul
echo       OK
echo.

REM Instalar servicios
echo  [2/4] Instalando servicio Dashboard...
dashboard-service.exe install
if %errorLevel% equ 0 ( echo       OK ) else ( echo       [!] Puede que ya este instalado )
echo.

echo  [3/4] Instalando servicio RTMP...
rtmp-service.exe install
if %errorLevel% equ 0 ( echo       OK ) else ( echo       [!] Puede que ya este instalado )
echo.

REM Iniciar servicios
echo  [4/4] Iniciando servicios...
net start RTMP-Dashboard >nul 2>&1
timeout /t 3 /nobreak >nul
net start RTMP-Server >nul 2>&1
echo.
echo  Estado final:
sc query RTMP-Dashboard | findstr "ESTADO\|STATE"
sc query RTMP-Server | findstr "ESTADO\|STATE"
echo.
echo  Dashboard disponible en: http://localhost:8001
echo.
pause
