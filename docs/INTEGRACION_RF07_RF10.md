# Integración de RF-07 (Anuncios) y RF-10 (Configuración)

**Para:** Frontend (vistas EJS) · **Backend:** rama `feature/back-anuncios-configuracion`

El backend ya responde en estas rutas. Solo faltan las tres vistas de este documento.
Mientras no existan, las pantallas `GET` responden **500** (`Failed to lookup view`), así
que **las vistas deben fusionarse junto con este backend o antes**, no después.

Archivos del backend:

- `src/controllers/anuncios.controller.js` y `src/routes/anuncios.routes.js`
- `src/controllers/configuracion.controller.js` y `src/routes/configuracion.routes.js`
- Consultas: `src/models/anuncios.model.js` y `src/models/configuracion.model.js` (sin cambios)

Convenciones que ya usan Miembros y Eventos y que se mantienen aquí:

- Los formularios se envían con `method="POST"` y `application/x-www-form-urlencoded` (formulario HTML normal).
- Los errores de validación vuelven a mostrar el **mismo formulario** con estado **422** y `errores` (arreglo de textos).
- Si todo sale bien, el servidor **redirige** (302) y la página de destino recibe `mensaje`.
- 403 y 404 usan la vista existente `error.ejs` (`titulo`, `mensaje`). No hay que hacer nada nuevo.
- Todas las vistas reciben además las variables globales de `src/app.js`: `usuario`, `menu`, `rutaActual`, `SECCIONES`, `iglesia`.
- **Escapar siempre con `<%= %>`**. Los títulos y contenidos los escriben usuarios y pueden traer HTML (`<img onerror=…>`); nunca usar `<%- %>` con estos datos.

---

## RF-07 Anuncios

### Permisos

| Rol | Consultar `/anuncios` | Crear, editar, eliminar |
|---|---|---|
| Administrador | ✅ | ✅ |
| Pastor | ✅ | ✅ |
| Secretario | ✅ | ✅ |
| Tesorero | 403 | 403 |
| Coordinador | 403 | 403 |
| Sin sesión | redirige a `/login` | redirige a `/login` |

Hoy los tres roles con acceso también pueden modificar (`ROLES_EDICION` en el controlador).
**Pendiente de confirmar con el equipo.** Si alguno solo debe consultar, se quita de esa lista
y la vista lo sabrá por `puedeEditar`.

### Rutas

| Método | Ruta | Respuesta correcta | Con errores |
|---|---|---|---|
| GET | `/anuncios` | 200 `anuncios/index` | — |
| GET | `/anuncios/nuevo` | 200 `anuncios/formulario` (`modo: 'nuevo'`) | — |
| POST | `/anuncios` | 302 → `/anuncios?aviso=creado` o `?aviso=programado` | 422 `anuncios/formulario` |
| GET | `/anuncios/:id/editar` | 200 `anuncios/formulario` (`modo: 'editar'`) | 404 `error` |
| POST | `/anuncios/:id` | 302 → `/anuncios?aviso=actualizado` | 422 `anuncios/formulario` · 404 `error` |
| POST | `/anuncios/:id/eliminar` | 302 → `/anuncios?aviso=eliminado` | 404 `error` |

Eliminar es solo por **POST** (un `GET /anuncios/:id/eliminar` responde 404 y no borra).
Se recomienda pedir confirmación en el navegador, por ejemplo
`<form method="POST" action="/anuncios/<%= a.id %>/eliminar" onsubmit="return confirm('¿Eliminar este anuncio?')">`.

### Vista `src/views/anuncios/index.ejs`

| Variable | Tipo | Contenido |
|---|---|---|
| `anuncios` | arreglo | **Todos**, incluidos los programados, más recientes primero (`Anuncios.listar()`) |
| `importantes` | arreglo | Hasta 5 importantes **ya publicados** (`Anuncios.importantes(5)`), para destacarlos arriba |
| `puedeEditar` | booleano | Mostrar u ocultar «Nuevo anuncio», «Editar» y «Eliminar» |
| `mensaje` | texto o `null` | Aviso después de crear, editar o eliminar (ver tabla de mensajes) |

Cada elemento de `anuncios` e `importantes`:

| Campo | Ejemplo | Uso sugerido |
|---|---|---|
| `id` | `4` | Enlaces de editar y eliminar |
| `titulo` | `'Cambio de horario'` | |
| `contenido` | `'A partir de noviembre…'` | Respetar saltos de línea con CSS `white-space: pre-line` |
| `fecha_publicacion` | `'2026-11-02'` | Formato `YYYY-MM-DD` |
| `importante` | `1` o `0` | Etiqueta «Importante» |
| `programado` | `1` o `0` | `1` = fecha futura: etiqueta «Programado» (todavía no sale en el panel) |
| `autor` | `'Pastor Juan Pérez'` o `null` | `null` si se eliminó el usuario: mostrar «—» |
| `autor_id`, `creado_en`, `actualizado_en` | | Opcionales |

### Vista `src/views/anuncios/formulario.ejs`

| Variable | Tipo | Contenido |
|---|---|---|
| `modo` | `'nuevo'` o `'editar'` | Título de la página y `action` del formulario |
| `anuncio` | objeto o `null` | `null` al abrir «nuevo». Al editar o al volver con errores trae lo escrito |
| `errores` | arreglo de textos | Vacío si no hay errores |
| `puedeEditar` | booleano | Siempre `true` aquí (los demás roles reciben 403 antes) |

`anuncio` siempre trae `titulo`, `contenido`, `fecha_publicacion` e `importante` (0/1). En modo
`editar` también trae `id`. Para el `action`:

```ejs
<form method="POST" action="<%= modo === 'editar' ? `/anuncios/${anuncio.id}` : '/anuncios' %>">
```

Campos que debe enviar el formulario (nombres exactos):

| `name` | Control | Obligatorio | Reglas |
|---|---|---|---|
| `titulo` | `<input type="text" maxlength="150">` | Sí | Máximo 150 caracteres |
| `contenido` | `<textarea maxlength="5000">` | Sí | Máximo 5000 caracteres |
| `fecha_publicacion` | `<input type="date">` | No | Vacía = **hoy**. Puede ser futura (queda programado) |
| `importante` | `<input type="checkbox" name="importante">` | No | Marcada envía `on`. Sin marcar = no importante |

Para que la casilla conserve su estado: `<%= anuncio && anuncio.importante ? 'checked' : '' %>`.

**Al editar, la fecha vacía también se convierte en hoy**, así que el campo debe venir
prellenado con `anuncio.fecha_publicacion` para no cambiar la fecha sin querer.

### Mensajes

| Situación | Texto | Dónde llega |
|---|---|---|
| Creado (hoy o fecha pasada) | El anuncio se publicó correctamente. | `mensaje` en `index` |
| Creado con fecha futura | El anuncio quedó programado y se mostrará en su fecha de publicación. | `mensaje` en `index` |
| Editado | El anuncio se actualizó correctamente. | `mensaje` en `index` |
| Eliminado | El anuncio se eliminó. | `mensaje` en `index` |
| Título vacío | El título del anuncio es obligatorio. | `errores` (422) |
| Contenido vacío | El contenido del anuncio es obligatorio. | `errores` (422) |
| Fecha inválida | La fecha de publicación debe tener el formato YYYY-MM-DD. | `errores` (422) |
| Título largo | El título no puede exceder 150 caracteres. | `errores` (422) |
| Contenido largo | El contenido no puede exceder 5000 caracteres. | `errores` (422) |
| No existe | Anuncio no encontrado / El anuncio solicitado no existe o ya fue eliminado. | `error.ejs` (404) |

### Panel (RF-08)

El panel ahora usa `Anuncios.publicados(5)`: los anuncios con fecha futura **no** aparecen hasta
su día, y los importantes salen primero. `panel.ejs` no necesita cambios.

---

## RF-10 Configuración de la iglesia

### Permisos

Solo **Administrador**. Los otros cuatro roles reciben 403 en `GET` y `POST`; sin sesión, se
redirige a `/login`.

### Rutas

| Método | Ruta | Respuesta correcta | Con errores |
|---|---|---|---|
| GET | `/configuracion` | 200 `configuracion/index` | — |
| POST | `/configuracion` | 302 → `/configuracion?aviso=guardado` | 422 `configuracion/index` |

### Vista `src/views/configuracion/index.ejs`

| Variable | Tipo | Contenido |
|---|---|---|
| `configuracion` | objeto | `nombre`, `direccion`, `telefono`, `correo`, `horarios`, `logo_ruta`, `actualizado_en` |
| `errores` | arreglo de textos | Vacío si no hay errores |
| `mensaje` | texto o `null` | «La configuración de la iglesia se guardó correctamente.» después de guardar |
| `logosDisponibles` | arreglo de textos | Imágenes que hoy existen en `public/img/`, por ejemplo `['/img/aurelia-logo.png', '/img/banner-oracion.png']` |

Los campos opcionales vacíos llegan como `null`; en los `value` usar `<%= configuracion.direccion || '' %>`.
Al volver con errores, `configuracion` trae lo que escribió el usuario y el `logo_ruta` que sigue guardado.

Campos que debe enviar el formulario:

| `name` | Control sugerido | Obligatorio | Reglas |
|---|---|---|---|
| `nombre` | `<input type="text" maxlength="150">` | Sí | Máximo 150 |
| `direccion` | `<input type="text" maxlength="300">` | No | Máximo 300 |
| `telefono` | `<input type="tel" maxlength="30">` | No | Máximo 30; solo números, espacios y `+ ( ) - . #` |
| `correo` | `<input type="email" maxlength="254">` | No | Correo válido |
| `horarios` | `<textarea maxlength="1000">` | No | Máximo 1000; puede tener varias líneas |
| `logo_ruta` | `<select>` con `logosDisponibles` y una opción vacía «Conservar el actual» | No | Vacío = conservar el logotipo actual |
| `quitar_logo` | `<input type="checkbox" name="quitar_logo">` | No | Marcada = quitar el logotipo (tiene prioridad sobre `logo_ruta`) |

### Logotipo: lo que falta decidir

- **Todavía no hay subida de archivos.** No se instaló ninguna librería (por ejemplo multer) ni se
  reciben archivos, porque el equipo aún no definió dónde guardarlos, el tamaño máximo, los
  formatos ni cómo evitar archivos maliciosos.
- Por ahora solo se puede elegir una imagen que **ya exista** en `public/img/`. El servidor rechaza
  (422) rutas externas, `..`, subcarpetas, extensiones que no sean PNG, JPG, WEBP o GIF, y archivos
  que no existan.
- **El menú y el login no usan `iglesia.logo_ruta`**: muestran siempre `/img/aurelia-logo.png`
  (`partials/header.ejs`, `login.ejs`). Si se quiere que el logotipo configurado aparezca, hay
  que cambiar esas vistas. El **nombre** sí se actualiza en todas las páginas (`iglesia.nombre`).
  `res.locals.iglesia` trae `nombre` y `logo_ruta`.

### Mensajes

| Situación | Texto |
|---|---|
| Guardado | La configuración de la iglesia se guardó correctamente. |
| Nombre vacío | El nombre de la iglesia es obligatorio. |
| Campo largo | El nombre no puede… / La dirección no puede… / El teléfono no puede… / El correo no puede… / Los horarios no pueden exceder N caracteres. |
| Teléfono inválido | El teléfono solo puede contener números, espacios y los signos + ( ) - . # |
| Correo inválido | Ingresa un correo electrónico válido. |
| Logotipo inválido | El logotipo debe ser una imagen PNG, JPG, WEBP o GIF que ya exista en /img/. |

Puede haber varios errores a la vez; se recomienda mostrarlos en una lista.

---

## Pruebas

Automáticas, con bases temporales; nunca abren `data/iglesia.db`:

```bash
node --test test/anuncios-configuracion.test.js test/anuncios-configuracion-app.test.js
```

- `test/anuncios-configuracion.test.js`: rutas reales con vistas de prueba
  (`test/vistas-prueba/`), que devuelven en JSON lo que recibe cada plantilla. Comprueba el
  contrato de este documento, los 5 roles, las validaciones, los 404 y los errores inesperados.
- `test/anuncios-configuracion-app.test.js`: la aplicación real con sesión, los 403 y el efecto
  de los cambios en el panel y en el nombre de la iglesia.

Cuando lleguen las vistas definitivas, hay que revisar en el navegador:

1. `/anuncios` con Administrador, Pastor y Secretario: lista, importantes destacados,
   etiqueta «Programado», autor «—» si es `null`, `mensaje` después de cada acción.
2. Crear un anuncio vacío y ver los errores sin perder lo escrito; crear uno importante y verlo
   en el panel; crear uno con fecha futura y comprobar que **no** sale en el panel.
3. Editar: la casilla y la fecha vienen prellenadas; si se guarda sin tocar nada, nada cambia.
4. Eliminar pide confirmación y solo funciona con el botón (POST).
5. Un título con `<b>` o `<script>` se ve como texto, no como HTML.
6. `/configuracion` con Administrador: datos actuales, valores `null` como campos vacíos,
   horarios con varias líneas, selector de logotipo, «Quitar logotipo», errores y `mensaje`.
7. Cambiar el nombre y verlo en el menú y en el título de la pestaña.
8. Tesorero y Coordinador no ven «Anuncios» en el menú y reciben 403 al escribir la URL;
   solo el Administrador ve «Configuración».
9. Diseño responsivo (320, 375, 768 y 1280 px) con el tema Aurelia.

`test/vistas-prueba/` son vistas solo para las pruebas automáticas; no hay que modificarlas
ni copiarlas a `src/views`.

## Pendiente

- Confirmar qué roles pueden modificar anuncios (hoy: Administrador, Pastor y Secretario).
- Definir la subida segura del logotipo y, si se aprueba, mostrar `iglesia.logo_ruta` en el menú y el login.
- Tokens CSRF para todos los formularios (pendiente general del proyecto, igual que en Miembros y Eventos).
