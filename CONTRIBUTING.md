# Guía de trabajo en equipo

## Ramas

```
main      ← versión estable para entregar (solo se actualiza desde develop)
develop   ← integración diaria del equipo
  ├── feature/bd-...        Persona 3
  ├── feature/front-...     Persona 1
  ├── feature/back-...      Persona 2
  └── feature/reportes-...  Persona 4
```

- **Nunca** se trabaja directo en `main` ni en `develop`.
- Una rama por tarea, con nombre corto: `feature/back-miembros`, `feature/front-login`, `feature/bd-vistas-reportes`, `fix/permisos-tesorero`.

## Flujo diario

```bash
# 1. Traer lo último
git checkout develop
git pull

# 2. Crear tu rama
git checkout -b feature/back-miembros

# 3. Trabajar y guardar cambios seguido
git add .
git commit -m "feat(miembros): alta y edición de miembros"

# 4. Antes de subir, traer lo nuevo de develop y resolver conflictos
git pull origin develop

# 5. Subir tu rama
git push -u origin feature/back-miembros
```

6. En GitHub abrir un **Pull Request** hacia `develop` (no hacia `main`).
7. Otro integrante lo revisa y lo aprueba; después se hace *merge*.
8. Si el PR cambió algo en `src/db/`, todos ejecutan `npm run db:reset` después de hacer `git pull`.

## Mensajes de commit

Formato: `tipo(módulo): descripción en presente`

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un error |
| `db` | Cambios en schema, seed o consultas |
| `style` | Diseño, CSS, vistas sin lógica nueva |
| `docs` | Documentación |
| `test` | Pruebas |

Ejemplos: `feat(asistencias): marcar presentes y ausentes` · `db(schema): agregar fecha_baja a miembros` · `fix(login): mensaje con correo vacío`

## Reglas para no pisarnos

1. **`src/db/schema.sql` y `seed.sql` los modifica Persona 3.** Si necesitas un campo o tabla nueva, pídelo (issue o mensaje) y se agrega en una rama `feature/bd-...`.
2. **`src/config/permisos.js` y `src/middlewares/` los modifica Persona 2.**
3. **`src/routes/index.js` es compartido:** solo se agrega una línea por módulo nuevo.
4. **Si instalas una librería**, avisa al equipo: cambia `package.json` y `package-lock.json`, y los demás deben correr `npm install`.
5. No subir `.env`, `node_modules/` ni archivos `.db` (ya están en `.gitignore`).
6. Todas las consultas con `?` (parámetros), nunca concatenando texto del usuario.
7. Los permisos se validan en el servidor (middlewares), no solo ocultando botones.

## Cronograma

| Fechas | Meta | Rama a integrar en `develop` |
|---|---|---|
| 27–28 oct | Estructura, BD, acceso y navegación | esqueleto (listo), login, vistas base |
| 29–31 oct | Miembros, asistencias, eventos, ministerios, donaciones, anuncios | un PR por módulo |
| 1–2 nov | Panel, reportes, exportación, recuperar contraseña, permisos | reportes, panel, recuperación |
| 3 nov | Pruebas de RF-01 a RF-10 con los 5 roles y correcciones | `develop` → `main` |
| 4 nov | Entrega y presentación | etiqueta `v1.0` en `main` |

## Lista de pruebas antes de pasar a `main`

- [ ] Iniciar sesión con cada uno de los 5 usuarios de prueba
- [ ] Cada rol ve solo su menú y recibe 403 al escribir una URL no permitida
- [ ] Pastor, Secretario y Coordinador **no** ven ingresos en el panel ni en reportes
- [ ] Registrar, editar, buscar y desactivar un miembro
- [ ] Registrar asistencia de un evento y ver el historial
- [ ] Crear, editar y cancelar un evento; verlo en el calendario
- [ ] Agregar y quitar integrantes de un ministerio
- [ ] Registrar una donación anónima y una con donante
- [ ] Publicar, editar y eliminar un anuncio
- [ ] Generar y exportar cada reporte
- [ ] Recuperar contraseña
- [ ] Cambiar datos y logotipo de la iglesia
