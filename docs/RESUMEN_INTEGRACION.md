# Resumen de integración de RF-08 y RF-09

**Fecha de ejecución:** 2 de noviembre de 2026
**Alcance:** solo RF-08 y RF-09. Este documento no certifica que toda la aplicación esté terminada, porque varios módulos del equipo siguen pendientes.

## Cómo se probó

Se usaron `git worktree` temporales y bases de datos temporales. Ninguna integración se publicó. No se modificaron `develop`, `main` ni `data/iglesia.db`.

| Escenario | Conflictos | Pruebas |
|---|---|---|
| `develop` + RF-09 + RF-08 | Ninguno | 88 de 88 aprobadas |
| `develop` + RF-09 + RF-08 + PR #5, #9 y #11 | Ninguno | 88 de 88 aprobadas |
| RF-08 y RF-09 en orden inverso (`git merge-tree`) | Ninguno | No aplica |
| `develop` + RF-08 (`a74896b`) + RF-09 (`8af3df4`), aplicación en ejecución para la revisión manual | Ninguno | 88 de 88 aprobadas |

Las 88 pruebas son: 17 de RF-08, 66 de RF-09 y 5 de coherencia entre ambos. Cubren RF-08, RF-09 y su coherencia, **no el funcionamiento propio de los módulos de los PR #5, #9 y #11**. El segundo escenario solo demuestra que esos PR no rompen RF-08 ni RF-09.

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

### Comprobación en Microsoft Excel

Microsoft Excel 16.0 está instalado en el equipo de prueba. Un script temporal abrió con Excel real los cuatro archivos descargados de la aplicación integrada:

| Reporte | Abre sin error | Filas de datos | Filtro aplicado | Filas visibles |
|---|---|---|---|---|
| Miembros | Sí | 14 | Estado = Inactivo | 2 |
| Asistencia | Sí | 11 | Tipo = culto | 6 |
| Ministerios | Sí | 5 | Ministerio = Niños | 1 |
| Ingresos | Sí | 11 | Concepto = diezmo | 6 |

Ningún libro se marcó como reparado y la columna Total de ingresos se muestra como moneda. El detalle está en `docs/PRUEBAS_RF09.md` de la rama `feature/reportes-rf09`.

## Limitaciones

- **Pruebas sin ejecutar:** teléfono real, Chrome y Firefox. Chrome y Firefox no están instalados en el equipo de prueba.
- **Excel a mano:** solo el reporte de ingresos se abrió manualmente. Los otros tres se abrieron con la prueba automatizada.
- **Requiere internet:** sin conexión, la gráfica no aparece; se muestran el aviso y la tabla.
- **Datos de prueba:** la gráfica y los reportes usan los datos de `seed.sql` mientras RF-03, RF-05 y RF-06 no estén en `develop`.
- **Eventos cancelados:** las vistas de Base de datos los cuentan en algunos indicadores (ver riesgo 5).
- **Puerto ocupado:** si el puerto ya está en uso, `src/app.js` imprime "Servidor en…" y luego se cierra sin mostrar el error. El archivo pertenece a otra parte del proyecto y no se modificó.

## Decisiones de permisos por confirmar con el equipo

1. **Tesorero:** no ve la gráfica ni abre los reportes de asistencia y ministerios, aunque la matriz le permite entrar a Reportes. Se siguió `docs/diagrama-er.md` y la sección Asistencias de `permisos.js`.
2. **Secretario:** abre el reporte de ministerios según `docs/diagrama-er.md`, aunque `permisos.js` no le da acceso a la sección Ministerios.

## Qué falta integrar del equipo

Según el estado de `develop` y de GitHub al 2 de noviembre de 2026:

| Requisito | Estado en `develop` |
|---|---|
| RF-01 Gestión de usuarios y recuperación de contraseña | Pantallas pendientes |
| RF-03 Asistencias | Rutas pendientes |
| RF-04 Eventos | Pendiente: PR #5 (backend) y #11 (vistas) abiertos |
| RF-05 Ministerios | Rutas pendientes |
| RF-06 Donaciones | Rutas pendientes |
| RF-07 Anuncios | Rutas pendientes; modelo en PR #9 abierto |
| RF-10 Configuración | Rutas pendientes; modelo en PR #9 abierto |

## Riesgos antes de la entrega

1. **Módulos sin registro de datos (alto).** Sin RF-03 y RF-06, la gráfica y los reportes solo muestran los datos de `seed.sql`. Cuando se integren, hay que repetir estas pruebas con datos capturados desde la aplicación.
2. **Internet en la presentación (medio).** Sin conexión, la gráfica no aparece. Hay que confirmar la red o decidir si se instala Chart.js localmente.
3. **Acceso del Tesorero (medio).** Ver la decisión 1 de permisos.
4. **Acceso del Secretario a ministerios (bajo).** Ver la decisión 2 de permisos.
5. **Eventos cancelados en vistas de Base de datos (bajo).** Con un evento cancelado que tenga asistencias, `v_indicadores_panel` lo cuenta (44 frente a 43). `v_participacion_ministerio` lo incluye en el porcentaje: se obtuvo 50 % con 0 actividades. El seed no presenta este caso.
6. **Pruebas sin ejecutar (bajo).** Falta probar en un teléfono real, en Chrome y en Firefox.
7. **Pull Requests sin fusionar (medio).** RF-08 y RF-09 siguen en los PR #12 y #10, en estado de borrador. Hasta que se revisen y fusionen, `develop` no incluye estos módulos.
