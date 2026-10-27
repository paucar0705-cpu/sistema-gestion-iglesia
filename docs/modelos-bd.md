# Modelos de la base de datos

Funciones de consulta que usa el backend desde sus controladores.
Responsable: Persona 3 (Base de datos). Si necesitas otra función o cambiar un parámetro, avísame.

```js
const Ministerios = require('../models/ministerios.model');
const Donaciones  = require('../models/donaciones.model');
const Usuarios    = require('../models/usuarios.model');
const { ErrorDatos } = require('../models/errores');
```

## Reglas generales

- Los **id** pueden mandarse como número o como texto del formulario (`3` o `'3'`).
- Cuando un dato no cumple una regla, el modelo lanza **`ErrorDatos`** con `codigo` y un `message` en español que se puede mostrar al usuario. Cualquier otro error es un fallo real del servidor.

```js
try {
  Ministerios.agregarIntegrante(req.params.id, req.body.miembro_id);
} catch (err) {
  if (err instanceof ErrorDatos) return res.status(422).render('...', { errores: [err.message] });
  throw err;
}
```

- **Los permisos los valida el backend** (quién puede entrar, quién puede editar). Los modelos solo cuidan la integridad de los datos.

---

## Ministerios (RF-05) — `src/models/ministerios.model.js`

| Función | Recibe | Devuelve | Errores (`codigo`) |
|---|---|---|---|
| `listar(opciones)` | `{ incluirInactivos }` opcional | Lista con `id, nombre, descripcion, activo, coordinador_id, coordinador, integrantes, proximas_actividades` | — |
| `obtener(id)` | id | Un ministerio o `undefined` | — |
| `coordinadoresDisponibles()` | — | Usuarios activos `{ id, nombre, rol }`, primero los de rol Coordinador | — |
| `crear(datos)` | `{ nombre, descripcion, coordinadorId }` (coordinador opcional) | id nuevo | `NOMBRE_REQUERIDO`, `NOMBRE_DUPLICADO`, `COORDINADOR_NO_VALIDO` |
| `actualizar(id, datos)` | igual que `crear` | `true` / `false` si no existe | igual que `crear` |
| `desactivar(id)` / `reactivar(id)` | id | `true` / `false` | — |
| `listarIntegrantes(id, opciones)` | `{ incluirHistorial }` opcional | `miembro_id, nombre, apellidos, telefono, correo, fecha_union, fecha_salida, activo` | — |
| `miembrosDisponibles(id)` | id del ministerio | Miembros activos que aún no están en él (para el `<select>`) | — |
| `agregarIntegrante(ministerioId, miembroId)` | ids | — | `MINISTERIO_NO_EXISTE`, `MINISTERIO_INACTIVO`, `MIEMBRO_NO_VALIDO`, `YA_ES_INTEGRANTE` |
| `quitarIntegrante(ministerioId, miembroId)` | ids | `true` / `false` si no era integrante | — |
| `listarActividades(id, opciones)` | `{ soloProximas }` opcional | Eventos del ministerio `id, titulo, tipo, fecha, hora, lugar, estado` | — |
| `ministeriosDeCoordinador(usuarioId)` | id del usuario | `[{ id, nombre }]` que coordina | — |
| `esCoordinador(usuarioId, ministerioId)` | ids | `true` / `false` | — |

Notas:
- `quitarIntegrante` **no borra**: guarda `fecha_salida` para conservar el historial.
- Para limitar al **Coordinador**: `esCoordinador(req.session.usuario.id, ministerioId)` antes de dejarlo editar integrantes o actividades.

---

## Donaciones (RF-06) — `src/models/donaciones.model.js`

Acceso solo para **Administrador y Tesorero** (lo valida el backend).

| Función | Recibe | Devuelve | Errores (`codigo`) |
|---|---|---|---|
| `CONCEPTOS`, `METODOS` | — | Objetos `{ valor: 'Etiqueta' }` para los `<select>` | — |
| `donantesDisponibles()` | — | Miembros activos `{ id, nombre, apellidos }` | — |
| `registrar(datos)` | `{ fecha, monto, concepto, metodo, descripcion, miembroId, registradoPor }` | id nuevo | `FECHA_INVALIDA`, `FECHA_FUTURA`, `CONCEPTO_INVALIDO`, `METODO_INVALIDO`, `MONTO_INVALIDO`, `DONANTE_NO_VALIDO`, `USUARIO_REQUERIDO` |
| `obtener(id)` | id | Una donación o `undefined` | — |
| `listarPorPeriodo(filtros)` | `{ desde, hasta, concepto?, metodo?, soloAnonimas? }` | Lista con `id, fecha, concepto, metodo, descripcion, monto, monto_centavos, donante, registrado_por` | `PERIODO_INVALIDO` |
| `totalesPorPeriodo(filtros)` | mismos filtros | `{ aportaciones, total, total_centavos, anonimas }` | `PERIODO_INVALIDO` |
| `resumenMensual({ desde, hasta })` | periodo | Por mes: `mes, aportaciones, total, diezmos, ofrendas, especiales, otros, anonimas` | `PERIODO_INVALIDO` |
| `ingresosDelMes()` | — | `{ total, aportaciones }` del mes actual (para el panel) | — |

Notas:
- **`monto` se manda en pesos** tal como lo escribe el usuario (`'1500'`, `'1,500.50'`, `1500.5`). El modelo lo convierte a centavos. Todas las consultas devuelven `monto` en pesos.
- **`miembroId` vacío o `null` = aportación anónima.** En la lista aparece como `donante: 'Anónimo'`.
- `registradoPor` es `req.session.usuario.id`.
- Las donaciones no se editan ni se borran (registro financiero).

---

## Usuarios y recuperación de contraseña (RF-01) — `src/models/usuarios.model.js`

**División acordada:** el modelo guarda de forma segura (hash bcrypt de contraseñas, hash SHA-256 de tokens, nunca devuelve hashes). Backend valida formato y requisitos de contraseña, maneja login, sesiones, permisos y las pantallas del flujo de recuperación.

| Función | Recibe | Devuelve | Errores (`codigo`) |
|---|---|---|---|
| `listarRoles()` | — | `[{ id, nombre }]` (los 5 roles) | — |
| `listar(opciones)` | `{ incluirInactivos }` (por defecto `true`) | `id, nombre, correo, rol_id, rol, miembro_id, miembro, activo, creado_en` | — |
| `obtener(id)` | id | Un usuario (sin hash) o `undefined` | — |
| `buscarPorCorreo(correo)` | correo | Un usuario (sin hash) o `undefined` | — |
| `verificarCredenciales(correo, password)` | correo y contraseña en texto | `{ id, nombre, correo, rol }` o `null` | — |
| `miembrosSinUsuario()` | — | Miembros activos sin usuario (para vincular, opcional) | — |
| `crear(datos)` | `{ nombre, correo, password, rolId, miembroId? }` | id nuevo | `NOMBRE_REQUERIDO`, `CORREO_REQUERIDO`, `CORREO_DUPLICADO`, `PASSWORD_REQUERIDA`, `PASSWORD_MUY_LARGA`, `ROL_NO_VALIDO`, `MIEMBRO_NO_VALIDO`, `MIEMBRO_YA_VINCULADO` |
| `actualizar(id, datos)` | `{ nombre, correo, miembroId? }` | `true` / `false` | `NOMBRE_REQUERIDO`, `CORREO_REQUERIDO`, `CORREO_DUPLICADO`, `MIEMBRO_NO_VALIDO`, `MIEMBRO_YA_VINCULADO` |
| `cambiarRol(id, rolId)` | ids | `true` / `false` | `ROL_NO_VALIDO`, `ULTIMO_ADMIN` |
| `cambiarPassword(id, nueva)` | id y contraseña en texto | `true` / `false` | `PASSWORD_REQUERIDA`, `PASSWORD_MUY_LARGA` |
| `desactivar(id)` / `reactivar(id)` | id | `true` / `false` | `ULTIMO_ADMIN` (solo desactivar) |
| `crearTokenRecuperacion(usuarioId)` | id del usuario | `{ token, expiraEn }` o `null` si no existe o está inactivo | — |
| `validarToken(token)` | token del enlace | `{ id, nombre, correo }` o `null` | — |
| `restablecerPassword(token, nueva)` | token y contraseña en texto | `{ id, nombre, correo }` | `TOKEN_INVALIDO`, `PASSWORD_REQUERIDA`, `PASSWORD_MUY_LARGA` |

Notas:
- **La contraseña se manda en texto** y el modelo guarda el hash. No hagan el hash antes de llamar al modelo.
- El correo se guarda en minúsculas y la búsqueda no distingue mayúsculas.
- **Siempre queda al menos un Administrador activo**: `cambiarRol` y `desactivar` lanzan `ULTIMO_ADMIN` si se intenta quitar el último.
- Al desactivar o cambiar la contraseña se anulan los tokens de recuperación pendientes. La **sesión** abierta del usuario la debe cerrar backend.

### Flujo de recuperación (sugerido para backend)

1. `POST /recuperar` con el correo → `const u = Usuarios.buscarPorCorreo(correo)`.
2. Si existe: `const { token } = Usuarios.crearTokenRecuperacion(u.id)` y se arma el enlace `/restablecer/<token>`.
   Como el sistema no envía correos (fuera de alcance), el enlace se puede mostrar en pantalla o en la consola para la demostración.
3. Responder **siempre el mismo mensaje** exista o no el correo (ej. "Si el correo está registrado, se generó un enlace"), para no revelar qué correos existen.
4. `GET /restablecer/:token` → `Usuarios.validarToken(token)`; si es `null`, mostrar "enlace inválido o expirado".
5. `POST /restablecer/:token` → validar requisitos de la contraseña y luego `Usuarios.restablecerPassword(token, nueva)`.

El token dura **60 minutos** y es de **un solo uso**; si se pide otro, el anterior deja de servir.
