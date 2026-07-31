# Guía de Despliegue - SurtiFácil Admin

## Requisitos Previos

1. **Firebase CLI** instalado:
   ```powershell
   npm install -g firebase-tools
   ```

2. **Cuenta de Firebase** con un proyecto creado en https://console.firebase.google.com

3. **Variables de entorno** configuradas:
   - `web/.env.local` con `VITE_FIREBASE_*` completos

---

## Configuración Inicial (Una sola vez)

### 1. Login en Firebase
```powershell
firebase login
```

### 2. Asociar el proyecto
Edita `.firebaserc` y reemplaza `surtifacil-admin` con tu **Project ID real**:
```json
{
  "projects": {
    "default": "TU-PROJECT-ID"
  }
}
```

O usa el comando:
```powershell
firebase use --add TU-PROJECT-ID
```

### 3. Habilitar servicios en Firebase Console
- **Hosting**: Activa desde la consola
- **Firestore**: Crea la base de datos (modo production o test)
- **Authentication**: Habilita Email/Password

---

## Despliegue

### Opción A: Solo Hosting (Frontend)
```powershell
npm run deploy:hosting
```
Este comando:
1. Ejecuta `npm run build` en `web/`
2. Despliega `web/dist/` a Firebase Hosting

### Opción B: Reglas de Firestore
```powershell
npm run deploy:rules
```

### Opción C: Índices de Firestore
```powershell
npm run deploy:indexes
```

### Opción D: Todo (Hosting + Firestore + Rules)
```powershell
npm run deploy:all
```

---

## Verificación Post-Deploy

1. **Abrir URL**: Firebase mostrará la URL (ej: `https://surtifacil-admin.web.app`)
2. **Verificar en consola del navegador**:
   - Sin errores 404
   - Firebase conecta correctamente
   - Datos cargan sin problemas

3. **Probar en mobile**: La app es responsiva

---

## Rollback

Si algo falla, reverte a la versión anterior:
```powershell
firebase hosting:rollback
```
Selecciona la versión anterior del listado.

---

## Estructura de Archivos de Deploy

```
surtifacil/
├── firebase.json              # Config de Hosting + Firestore
├── .firebaserc                # Project ID
├── firestore.rules            # Reglas de seguridad
├── firestore.indexes.json    # Índices de Firestore
├── web/
│   └── dist/                  # Build output (carpeta public)
└── package.json               # Scripts de deploy
```

---

## Cache y Headers Configurados

| Tipo de archivo | Cache-Control |
|-----------------|---------------|
| JS, CSS | 604800 (7 días) |
| Imágenes | 31536000 (1 año) |
| index.html | No cache (siempre fresco) |

---

## Troubleshooting

### Error: "No project found"
```powershell
firebase use --add
```

### Error: "Build failed"
```powershell
cd web && npm run build
```
Verifica que no hay errores de TypeScript.

### Error: "Permission denied" en Firestore
Revisa `firestore.rules` - los permisos están abiertos para desarrollo.
**Antes de producción, ajustar a:**
```
allow read: if isSignedIn();
allow write: if isAdmin();
```

---

## Comandos Rápidos

| Acción | Comando |
|--------|---------|
| Build local | `npm run build:web` |
| Tests | `npm run test` |
| Deploy hosting | `npm run deploy:hosting` |
| Deploy reglas | `npm run deploy:rules` |
| Deploy todo | `npm run deploy:all` |
| LogsFirebase | `firebase functions:log` |

---

## Checklist Pre-Producción

- [ ] `.firebaserc` configurado con project ID real
- [ ] `web/.env.local` con credenciales de producción
- [ ] `firestore.rules` ajustado (no dejar abierto)
- [ ] Tests pasan: `npm run test`
- [ ] Build exitoso: `npm run build:web`
- [ ] Variables de entorno verdes
- [ ] Dominio personalizado (opcional)

---

*Última actualización: 2026-07-31*
