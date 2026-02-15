# 🚀 INICIO RÁPIDO - Sistema RTMP

## ⚡ Opción 1: Inicio automático (RECOMENDADO)

```batch
INICIAR.bat
```

Esto hará automáticamente:
- ✅ Verifica que Node.js esté instalado
- ✅ Verifica que los puertos estén libres
- ✅ Inicia Dashboard Server (puerto 8001/8002)
- ✅ Inicia RTMP Server (puerto 1935) 
- ✅ Abre el dashboard en tu navegador

## 📊 Acceso al Dashboard

```
http://localhost:8001
```

## 🎥 Configurar tu cámara IP

**URL de streaming:**
```
rtmp://[TU-IP]:1935/live/stream
```

Para ver tu IP, ejecuta:
```
check-system.bat
```

## 📝 Otros scripts disponibles

| Script | Descripción |
|--------|-------------|
| `INICIAR.bat` | Inicia todo el sistema automáticamente ⭐ |
| `start-all.bat` | Inicia ambos servidores en terminales separadas |
| `start-dashboard.bat` | Solo Dashboard |
| `start-rtmp.bat` | Solo RTMP Server |
| `check-system.bat` | Verifica el estado del sistema |

## 🛠️ Instalar como servicios Windows

Si quieres que el sistema se inicie automáticamente con Windows:

1. Descarga WinSW: https://github.com/winsw/winsw/releases
2. Coloca `WinSW-x64.exe` en `C:\RTMP\`
3. Haz 2 copias:
   - Renombra una a `dashboard-service.exe`
   - Renombra otra a `rtmp-service.exe`
4. Ejecuta como administrador:
   ```
   scripts\install-services.bat
   ```

## ❓ Problemas comunes

### Puerto ocupado
```bash
# Ver qué usa el puerto 8001
netstat -ano | findstr :8001

# Matar proceso (reemplaza PID)
taskkill /PID <PID> /F
```

### Node.js no encontrado
Instala Node.js desde: https://nodejs.org/

### Dashboard no carga
Verifica que ambos servidores estén corriendo:
```
check-system.bat
```

## 📚 Documentación completa

- `README.md` - Documentación completa
- `GUIA-INSTALACION-SERVICIOS.md` - Instalación de servicios Windows

---

**¡Listo! Ejecuta `INICIAR.bat` para comenzar.**
