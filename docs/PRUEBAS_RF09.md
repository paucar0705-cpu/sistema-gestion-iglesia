# Pruebas de RF-09: Reportes y exportación a Excel

**Rama:** `feature/reportes-rf09` (PR #10, borrador)
**Fecha de ejecución:** 2 de noviembre de 2026
**Entorno:** Windows 11, Node.js 24.13.0, Microsoft Edge (headless y revisión manual), Microsoft Excel 16.0

## Objetivo

Comprobar que los cuatro reportes muestran datos correctos, que el Excel coincide con la pantalla, que los filtros validan sus valores y que cada rol accede solo a lo que le corresponde.

## Funcionalidades

- Reportes de miembros, asistencia por evento, participación por ministerio e ingresos.
- Exportación a Excel de cada reporte.
- Filtros por fechas en asistencia e ingresos, y por tipo de evento en asistencia.
- Acceso validado en el servidor por reporte y por rol.

## Cómo ejecutar las pruebas

```bash
node --test --test-concurrency=1 "test/*.test.js"
```

No requieren dependencias nuevas ni tocan `data/iglesia.db`: cada caso usa una base temporal creada con `schema.sql` y `seed.sql`.

## Casos de prueba automatizados (`test/reportes.test.js`)

Resultado sobre el código original: **56 aprobadas y 10 fallidas.**
Resultado tras las correcciones: **66 de 66 aprobadas.** Se repitió el 2 de noviembre de 2026 con RF-08 y RF-09 integradas sobre `develop`, con el mismo resultado.

| Grupo | Qué comprueba | Pruebas | Resultado |
|---|---|---|---|
| Permisos | 5 roles por 4 reportes, en página y Excel; Coordinador en `/reportes` | 21 | Aprobado |
| Sin sesión | Índice, reportes y Excel redirigen a `/login` | 9 | Aprobado |
| Otros accesos | El 403 no contiene datos financieros; el índice solo ofrece lo permitido; reportes inexistentes dan 404, incluso `constructor` y `__proto__` | 3 | Aprobado |
| Consultas | Miembros, asistencia, ministerios e ingresos comparados con SQLite; el total coincide al centavo | 4 | Aprobado |
| Filtros válidos | Rango con límites incluidos, tipo de evento, rango exacto por día en ingresos | 3 | Aprobado |
| Filtros inválidos | Texto, 30 de febrero, mes 13, rango invertido, tipo inexistente, inyección SQL, parámetros repetidos (422) | 8 | Aprobado |
| Orden de validación | Los permisos se validan antes que los filtros | 1 | Aprobado |
| Sin resultados | Mensaje en pantalla y Excel solo con encabezados | 1 | Aprobado |
| Excel | Encabezados, nombre de archivo, mismos datos que en pantalla, autofiltro, moneda y filtros aplicados | 10 | Aprobado |
| Casos especiales | Nulos, porcentajes, 0.10 + 0.20 = 0.30, acentos, HTML escapado, texto con `=` que no se vuelve fórmula, caracteres de control | 3 | Aprobado |
| Base sin datos | Sin asistencias ni donaciones | 1 | Aprobado |
| Fallo de consulta | Estado 500 sin detalles técnicos, en página y Excel | 1 | Aprobado |
| Registro del servidor | Sin errores en el recorrido | 1 | Aprobado |

## Casos comprobados en navegador

Con Edge headless, sobre el reporte de ingresos como Administrador: se muestra en 1280 px y 375 px, sin errores de consola ni scroll horizontal en la página. En móvil, la tabla se desplaza dentro de su contenedor.

En la revisión manual con Edge sobre la aplicación integrada, la visualización de los reportes fue satisfactoria.

## Casos comprobados en Microsoft Excel

Microsoft Excel 16.0 sí está instalado en el equipo de prueba. Una versión anterior de este documento decía lo contrario por un error en la búsqueda.

**Prueba automatizada con Excel real.** Un script temporal, que no forma parte del repositorio, abrió en Excel los cuatro archivos descargados de la aplicación integrada, en modo de solo lectura y con las alertas desactivadas.

| Reporte | Abre sin error | Filas de datos | Autofiltro | Filtro aplicado | Filas visibles |
|---|---|---|---|---|---|
| Miembros | Sí | 14 | `A1:E15` | Estado = Inactivo | 2 |
| Asistencia | Sí | 11 | `A1:G12` | Tipo = culto | 6 |
| Ministerios | Sí | 5 | `A1:E6` | Ministerio = Niños | 1 |
| Ingresos | Sí | 11 | `A1:F12` | Concepto = diezmo | 6 |

En los cuatro, ningún libro se marcó como reparado, los encabezados son correctos y el encabezado queda inmovilizado. En ingresos, la columna Total usa el formato `$#,##0.00` y se ve, por ejemplo, como `$400.00`. Las filas visibles coinciden con los datos.

**Revisión manual.** El reporte de ingresos se abrió correctamente en Excel y sus filtros funcionaron.

## Errores encontrados

| # | Error | Impacto | Estado |
|---|---|---|---|
| 1 | El Tesorero podía abrir y descargar asistencia y ministerios por URL, aunque el panel le oculta esos datos y `docs/diagrama-er.md` no le da acceso | Acceso indebido | Corregido |
| 2 | Un filtro repetido (`?desde=a&desde=b`) se ignoraba y devolvía datos sin filtrar | Resultado engañoso | Corregido; responde 422 |
| 3 | El autofiltro del Excel solo cubría el encabezado | Filtro incompleto en Excel | Corregido |
| 4 | Un valor vacío se veía en blanco, mientras un nulo se veía como "—" | Inconsistencia visual | Corregido |
| 5 | `docs/PRUEBAS_RF09.txt` tenía una rama incorrecta y decía que no había pruebas | Documentación incorrecta | Corregido |

## Correcciones realizadas

- `src/routes/reportes.routes.js`: roles por reporte, rechazo de filtros repetidos y rango correcto del autofiltro.
- `src/views/reportes/detalle.ejs`: guion para valores vacíos.
- `docs/PRUEBAS_RF09.txt`: actualizado y enlazado a este documento.

`permisos.js`, `middlewares/auth.js` y la base de datos no se modificaron.

## Limitaciones

- **Filtros por reporte:** miembros y ministerios no tienen filtro de fechas.
- **Eventos sin registros:** el reporte de asistencia también lista eventos programados, con 0 registrados y "—" en el porcentaje. La gráfica del panel los omite a propósito.
- **Etiquetas técnicas:** tipo, concepto y método se muestran como en la base (`reunion`, `donacion_especial`).
- **Eventos cancelados:** `v_participacion_ministerio` incluye sus asistencias en el porcentaje; se obtuvo 50 % con 0 actividades. El seed no presenta este caso y la vista pertenece a Base de datos.
- **Dependencia de otros módulos:** RF-03, RF-05 y RF-06 siguen pendientes en `develop`, así que por ahora los reportes usan datos de `seed.sql`.
- **Roles por confirmar:** el Tesorero no accede a asistencia ni ministerios, y el Secretario sí accede al reporte de ministerios, según `docs/diagrama-er.md`. El equipo debe confirmarlo.

## Pendiente de ejecución manual

- [x] Abrir los cuatro `.xlsx` en Microsoft Excel (prueba automatizada).
- [x] Abrir el reporte de ingresos en Excel y usar sus filtros (revisión manual).
- [x] Revisar la visualización de los reportes en Edge (revisión manual).
- [ ] Abrir a mano en Excel los reportes de miembros, asistencia y ministerios. Solo se abrieron con la prueba automatizada.
- [ ] Revisar los reportes en un teléfono real.
- [ ] Revisar los reportes en Chrome y Firefox. No están instalados en el equipo de prueba.
