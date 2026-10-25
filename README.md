# Sistema de Gestión de Iglesias

Aplicación web para administrar miembros, asistencias, eventos, ministerios, donaciones, anuncios y reportes de una iglesia, con acceso por roles.

**Stack:** Node.js · Express · EJS · SQLite (integrado en Node, `node:sqlite`) · express-session + bcrypt · Chart.js · ExcelJS

---

## Puesta en marcha (primera vez)

Requisitos: **Node.js 22.13 o superior** (se recomienda la versión LTS más reciente desde [nodejs.org](https://nodejs.org)) y Git. Revisa tu versión con `node -v`.

> La base de datos usa el SQLite que ya viene dentro de Node, así que no hay que instalar ni compilar nada extra.

```bash
git clone https://github.com/USUARIO/sistema-gestion-iglesia.git
cd sistema-gestion-iglesia
git checkout develop
npm install
cp .env.example .env        # en Windows (CMD): copy .env.example .env
npm run db:reset            # crea la base de datos con datos de prueba
npm run dev                 # abre http://localhost:3000
```

### Usuarios de prueba

Todos tienen la contraseña **`Iglesia2026!`**

| Rol | Correo |
|---|---|
| Administrador | admin@iglesia.test |
| Pastor | pastor@iglesia.test |
| Secretario | secretario@iglesia.test |
| Tesorero | tesorero@iglesia.test |
| Coordinador | coordinador@iglesia.test |

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el servidor y lo reinicia al guardar cambios |
| `npm start` | Levanta el servidor sin recarga automática |
| `npm run db:reset` | Borra la BD y la recrea con `schema.sql` + `seed.sql` |
| `npm run db:reset -- --vacia` | Recrea solo la estructura, sin datos de prueba |

> Cada vez que hagas `git pull` y cambie algo en `src/db/`, ejecuta `npm run db:reset`.

---

## Estructura y responsables

```
sistema-gestion-iglesia/
├── src/
│   ├── app.js               Servidor Express (P2)
│   ├── config/permisos.js   Matriz de roles y secciones (P2)
│   ├── middlewares/auth.js  Sesión y permisos (P2)
│   ├── routes/              Una ruta por módulo (P2, reportes P4)
│   ├── controllers/         Lógica de cada módulo (P2)
│   ├── models/              Consultas SQL por módulo (P3)
│   ├── db/
│   │   ├── schema.sql       Tablas, índices y vistas (P3)
│   │   ├── seed.sql         Datos iniciales y de prueba (P3)
│   │   └── connection.js    Conexión única a SQLite (P3)
│   └── views/               Plantillas EJS (P1)
├── public/                  CSS, JS del navegador e imágenes (P1)
├── scripts/db-reset.js      Recrear la BD (P3)
├── docs/                    Diagrama ER y documentación
└── data/                    Aquí se genera iglesia.db (no se sube a Git)
```

| Persona | Rol | Trabaja principalmente en |
|---|---|---|
| Persona 1 | Frontend / diseño | `src/views/`, `public/` |
| Persona 2 | Backend / seguridad | `src/routes/`, `src/controllers/`, `src/middlewares/`, `src/config/` |
| Persona 3 | Base de datos | `src/db/`, `src/models/`, `docs/diagrama-er.md` |
| Persona 4 | Integración, reportes y pruebas | `src/routes/reportes.routes.js`, panel, exportación, pruebas |

### Módulos

| RF | Módulo | Ruta | Archivo de rutas | Estado |
|---|---|---|---|---|
| RF-01 | Inicio de sesión y usuarios | `/login`, `/usuarios` | `auth.routes.js`, `usuarios.routes.js` | Login básico listo |
| RF-02 | Miembros | `/miembros` | `miembros.routes.js` | Pendiente |
| RF-03 | Asistencias | `/asistencias` | `asistencias.routes.js` | Pendiente |
| RF-04 | Eventos | `/eventos` | `eventos.routes.js` | Pendiente |
| RF-05 | Ministerios | `/ministerios` | `ministerios.routes.js` | Pendiente |
| RF-06 | Donaciones | `/donaciones` | `donaciones.routes.js` | Pendiente |
| RF-07 | Anuncios | `/anuncios` | `anuncios.routes.js` | Pendiente |
| RF-08 | Panel principal | `/panel` | `panel.routes.js` | Indicadores listos, falta gráfica |
| RF-09 | Reportes | `/reportes` | `reportes.routes.js` | Pendiente (vistas SQL listas) |
| RF-10 | Configuración | `/configuracion` | `configuracion.routes.js` | Pendiente |

Cada archivo de rutas tiene un bloque `TODO` con lo que falta.

---

## Base de datos

- Diagrama entidad-relación: [`docs/diagrama-er.md`](docs/diagrama-er.md)
- Fechas como texto `YYYY-MM-DD`, booleanos `0/1`, **dinero en centavos** (`monto_centavos`).
- Los miembros **no se borran**: se desactivan (`activo = 0`, `fecha_baja`).
- Vistas listas para panel y reportes: `v_indicadores_panel`, `v_asistencia_por_evento`, `v_participacion_ministerio`, `v_ingresos_mensuales`, `v_movimiento_miembros`.

Ejemplo de consulta desde cualquier módulo:

```js
const db = require('../db/connection');
const activos = db.prepare('SELECT * FROM miembros WHERE activo = ? ORDER BY nombre').all(1);
const uno     = db.prepare('SELECT * FROM miembros WHERE id = ?').get(req.params.id);
const info    = db.prepare('INSERT INTO anuncios (titulo, contenido, autor_id) VALUES (?, ?, ?)')
  .run(titulo, contenido, req.session.usuario.id);   // info.lastInsertRowid = id nuevo

// Varias operaciones juntas (todo o nada), ej. guardar la asistencia de un evento:
db.transaccion(() => {
  for (const m of lista) stmt.run(eventoId, m.id, m.presente);
});
```

> Siempre usar `?` para los valores. Nunca concatenar texto del usuario dentro del SQL.

---

## Cómo trabajamos

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md): ramas, commits, pull requests y cronograma.
