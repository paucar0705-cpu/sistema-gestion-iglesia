# Resumen de integración de RF-08 y RF-09

**Fecha de ejecución:** 2 de noviembre de 2026; actualizado el 3 de noviembre de 2026 tras fusionarse en `develop` los PR #9 y #13
**Alcance:** solo RF-08 y RF-09. Este documento no certifica que toda la aplicación esté terminada, porque varios módulos del equipo siguen pendientes.

## Cómo se probó

Se usaron `git worktree` temporales y bases de datos temporales. Ninguna integración se publicó. No se modificaron `develop`, `main` ni `data/iglesia.db`.

### 3 de noviembre de 2026, `develop` en `c615bd6` (incluye PR #9 y #13)

| Escenario | Conflictos | Pruebas |
|---|---|---|
| `develop` + RF-09 + RF-08 | Ninguno | 88 de 88 aprobadas |
| `develop` + RF-09 + RF-08 + PR #5 y #11 | Ninguno | 88 de 88 aprobadas |
| Cada rama por separado sobre `develop` (`git merge-tree`), como la fusionaría GitHub | Ninguno | No aplica |

GitHub marca los PR #10 y #12 como fusionables y sin conflictos (`MERGEABLE`, `CLEAN`).

### 2 de noviembre de 2026, `develop` anterior a los PR #9 y #13

| Escenario | Conflictos | Pruebas |
|---|---|---|
| `develop` + RF-09 + RF-08 | Ninguno | 88 de 88 aprobadas |
| `develop` + RF-09 + RF-08 + PR #5, #9 y #11 | Ninguno | 88 de 88 aprobadas |
| RF-08 y RF-09 en orden inverso (`git merge-tree`) | Ninguno | No aplica |
| `develop` + RF-08 (`a74896b`) + RF-09 (`8af3df4`), aplicación en ejecución para la revisión manual | Ninguno | 88 de 88 aprobadas |

Las 88 pruebas son: 17 de RF-08, 66 de RF-09 y 5 de coherencia entre ambos. Cubren RF-08, RF-09 y su coherencia, **no el funcionamiento propio de los módulos de los PR #5, #9 y #11**. Los escenarios con esos PR solo demuestran que no rompen RF-08 ni RF-09.

## Cambios recientes en `develop`

| PR | Cambios | Efecto en RF-08 y RF-09 |
|---|---|---|
| #9 | Modelos `anuncios.model.js` y `configuracion.model.js`; documentación en `docs/modelos-bd.md` | Ninguno. No cambian `schema.sql`, las vistas ni los archivos de RF-08 y RF-09 |
| #13 | Datos de presentación al final de `seed.sql`: asistencias de los eventos 7 y 8, eventos 13 a 18, cinco donaciones de noviembre y un anuncio | Cambian las cifras de la gráfica, los indicadores y los reportes (ver "Datos de presentación"). El código no requirió cambios |

Las pruebas comparan los resultados contra consultas a SQLite, no contra cifras fijas, por eso siguen siendo válidas con los datos nuevos.

## Módulos probados

- RF-08 Panel principal.
- RF-09 Reportes y exportación a Excel.
- Inicio de sesión y control de acceso, únicamente como apoyo para estas pruebas.

## Dependencias

| Módulo | Depende de | Observación |
|---|---|---|
| RF-08 y RF-09 | `v_asistencia_por_evento` | Es la misma vista para la gráfica y para el reporte |
| RF-09 | `v_participacion_ministerio`, `miembros`, `donaciones` | Sin cambios en la estructura |
| RF-08 y RF-09 | `permisos.js`, `middlewares/auth.js` | Se reutilizan sin modificarlos |
| RF-08 y RF-09 | RF-03, RF-05 y RF-06 | Esos módulos deben registrar los datos reales |
| RF-09 | `exceljs` | Ya existía en `package.json` |
| RF-08 | Chart.js por CDN | Necesita internet |

## Qué funciona

- Cada evento de la gráfica coincide con su fila del reporte en pantalla y en Excel.
- Un rol ve asistencia en el panel si y solo si puede abrir el reporte de asistencia.
- Un rol ve ingresos en el panel si y solo si puede abrir el reporte de ingresos.
- El recorrido por el panel y los reportes no registra errores del servidor.

### Permisos comprobados por URL directa (pruebas automatizadas)

| Rol | Miembros | Asistencia | Ministerios | Ingresos | Gráfica | Ingresos en panel |
|---|---|---|---|---|---|---|
| Administrador | Sí | Sí | Sí | Sí | Sí | Sí |
| Pastor | Sí | Sí | Sí | 403 | Sí | No |
| Secretario | Sí | Sí | Sí | 403 | Sí | No |
| Tesorero | Sí | 403 | 403 | Sí | No | Sí |
| Coordinador | 403 | 403 | 403 | 403 | No | No |
| Sin sesión | `/login` | `/login` | `/login` | `/login` | `/login` | `/login` |

El Excel de cada reporte responde igual que su página.

### Revisión manual de la aplicación integrada

Se revisó a mano en Edge la aplicación con RF-08 y RF-09 integradas, con resultado satisfactorio:

- Panel: la gráfica, los indicadores y la visualización general.
- Reportes: la visualización en el navegador.
- Excel: el reporte de ingresos se abrió correctamente y sus filtros funcionaron.

La revisión manual se hizo el 2 de noviembre, con el `seed.sql` anterior al PR #13.

### Comprobación en Microsoft Excel

Microsoft Excel 16.0 está instalado en el equipo de prueba. Un script temporal abrió con Excel real los cuatro archivos descargados de la aplicación integrada. El 3 de noviembre se repitió con los datos del PR #13:

| Reporte | Abre sin error | Filas (2 nov) | Filas (3 nov) | Filtro aplicado | Visibles (2 nov) | Visibles (3 nov) |
|---|---|---|---|---|---|---|
| Miembros | Sí | 14 | 14 | Estado = Inactivo | 2 | 2 |
| Asistencia | Sí | 11 | 17 | Tipo = culto | 6 | 8 |
| Ministerios | Sí | 5 | 5 | Ministerio = Niños | 1 | 1 |
| Ingresos | Sí | 11 | 16 | Concepto = diezmo | 6 | 9 |

En ambas fechas ningún libro se abrió como reparado y la columna Total de ingresos se muestra como moneda. El detalle está en `docs/PRUEBAS_RF09.md` de la rama `feature/reportes-rf09`.

### Datos de presentación (`seed.sql` del PR #13)

Comprobado contra SQLite en una base temporal:

- **Panel (Administrador):** 12 miembros activos, 7 próximos eventos, 56 asistencias registradas, 5 ministerios e ingresos del mes de $3,775.00.
- **Gráfica:** 8 eventos, del 27 de septiembre al 29 de octubre. Ya se alcanza el máximo de 8: si en la presentación se registra la asistencia del culto del 1 de noviembre (el seed lo deja vacío a propósito), aparecerá al final y saldrá el culto del 27 de septiembre.
- **Reporte de asistencia:** 17 eventos no cancelados: 8 con asistencia y 9 sin registros, que aparecen con 0 y "—".
- **Reporte de ingresos:** 20 donaciones en 16 grupos; noviembre suma $3,775.00, igual que el panel.
- La gráfica y el reporte coinciden evento por evento y la aplicación no registró errores del servidor.

### Revisión visual con los datos nuevos (3 de noviembre de 2026)

Con Edge headless, a 1280, 768, 375 y 320 px: la gráfica se crea con 8 barras de altura correcta, sin errores de JavaScript ni scroll horizontal, y el reporte de asistencia muestra sus 17 filas.

Se encontró y corrigió un error de RF-08: con 8 eventos, en 375 px las fechas del eje se encimaban. Ahora se inclinan solo cuando no caben (detalle en `docs/PRUEBAS_RF08.md`). Las 88 pruebas se repitieron con la corrección.

## Limitaciones

- **Pruebas sin ejecutar:** teléfono real, Chrome y Firefox. Chrome y Firefox no están instalados en el equipo de prueba.
- **Excel a mano:** solo el reporte de ingresos se abrió manualmente, y fue con el seed anterior. Los cuatro se abrieron con la prueba automatizada, también con los datos del PR #13.
- **Revisión visual con los datos nuevos:** la revisión manual en Edge se hizo antes del PR #13. Con los datos nuevos solo se revisó con Edge headless (ver "Revisión visual con los datos nuevos").
- **Requiere internet:** sin conexión, la gráfica no aparece; se muestran el aviso y la tabla.
- **Datos de prueba:** la gráfica y los reportes usan los datos de `seed.sql` mientras RF-03, RF-05 y RF-06 no estén en `develop`.
- **Eventos cancelados:** las vistas de Base de datos los cuentan en algunos indicadores (ver riesgo 5).
- **Puerto ocupado:** si el puerto ya está en uso, `src/app.js` imprime "Servidor en…" y luego se cierra sin mostrar el error. El archivo pertenece a otra parte del proyecto y no se modificó.

## Decisiones de permisos por confirmar con el equipo

Siguen sin confirmar al 3 de noviembre de 2026. Los PR #9 y #13 no modificaron `permisos.js` ni `docs/diagrama-er.md`.

1. **Tesorero:** no ve la gráfica ni abre los reportes de asistencia y ministerios, aunque la matriz le permite entrar a Reportes. Se siguió `docs/diagrama-er.md` y la sección Asistencias de `permisos.js`.
2. **Secretario:** abre el reporte de ministerios según `docs/diagrama-er.md`, aunque `permisos.js` no le da acceso a la sección Ministerios.

Si el equipo decide otra cosa, el cambio se hace en los roles por reporte de `src/routes/reportes.routes.js` (RF-09) y en la condición de la gráfica de `src/routes/panel.routes.js` (RF-08), y se ajustan sus pruebas de permisos.

## Qué falta integrar del equipo

Según el estado de `develop` y de GitHub al 3 de noviembre de 2026. "Pantalla en construcción" significa que la ruta existe pero solo muestra `en-construccion.ejs`:

| Requisito | Estado en `develop` |
|---|---|
| RF-01 Gestión de usuarios y recuperación de contraseña | Modelo listo; pantalla en construcción |
| RF-03 Asistencias | Modelo listo; pantalla en construcción |
| RF-04 Eventos | Pantalla en construcción; PR #5 (backend) y #11 (vistas) abiertos |
| RF-05 Ministerios | Modelo listo; pantalla en construcción |
| RF-06 Donaciones | Modelo listo; pantalla en construcción |
| RF-07 Anuncios | Modelo fusionado (PR #9); pantalla en construcción |
| RF-10 Configuración | Modelo fusionado (PR #9); pantalla en construcción |

## Riesgos antes de la entrega

1. **Módulos sin registro de datos (alto).** Sin RF-03 y RF-06, la gráfica y los reportes solo muestran los datos de `seed.sql`. Cuando se integren, hay que repetir estas pruebas con datos capturados desde la aplicación. El seed del PR #13 deja el culto del 1 de noviembre sin asistencia para registrarla en vivo, pero al 3 de noviembre la pantalla de RF-03 sigue en construcción en `develop`.
2. **Internet en la presentación (medio).** Sin conexión, la gráfica no aparece. Hay que confirmar la red o decidir si se instala Chart.js localmente.
3. **Acceso del Tesorero (medio).** Ver la decisión 1 de permisos.
4. **Acceso del Secretario a ministerios (bajo).** Ver la decisión 2 de permisos.
5. **Eventos cancelados en vistas de Base de datos (bajo).** Con un evento cancelado que tenga asistencias, `v_indicadores_panel` lo cuenta (44 frente a 43 con el seed anterior; 57 frente a 56 con el del PR #13). `v_participacion_ministerio` lo incluye en el porcentaje: se obtuvo 50 % con 0 actividades. El seed no presenta este caso.
6. **Pruebas sin ejecutar (bajo).** Falta probar en un teléfono real, en Chrome y en Firefox.
7. **Pull Requests sin fusionar (medio).** RF-08 y RF-09 siguen en los PR #12 y #10, en estado de borrador. Hasta que se revisen y fusionen, `develop` no incluye estos módulos.
