# Pruebas de RF-08: Panel principal y gráfica de asistencia

**Rama:** `feature/panel-graficas` (PR #12, borrador)
**Fecha de ejecución:** 2 de noviembre de 2026; repetidas el 3 de noviembre de 2026 con los datos de presentación (PR #13)
**Entorno:** Windows 11, Node.js 24.13.0, Microsoft Edge (headless y revisión manual)

## Objetivo

Comprobar que el panel muestra una gráfica de presentes y ausentes por evento con datos reales de SQLite, que respeta los permisos por rol y que conserva los indicadores existentes.

## Funcionalidades

- Gráfica de barras con Chart.js 4.4.9, cargada desde CDN con versión fija y verificación de integridad.
- Como máximo, los 8 eventos más recientes con asistencia registrada, en orden cronológico. Se excluyen los cancelados y los que no tienen registros.
- Tabla alternativa con títulos completos y las mismas cifras.
- Mensajes para: sin asistencias, error en la consulta y error al cargar la gráfica.
- Visible para Administrador, Pastor y Secretario.

## Cómo ejecutar las pruebas

```bash
node --test --test-concurrency=1 "test/*.test.js"
```

No requieren dependencias nuevas ni tocan `data/iglesia.db`: cada caso usa una base temporal creada con `schema.sql` y `seed.sql`.

## Casos de prueba automatizados (`test/panel.test.js`)

Resultado: **17 de 17 aprobadas.** Se repitió el 2 de noviembre de 2026 con RF-08 y RF-09 integradas sobre `develop`, con el mismo resultado. El 3 de noviembre de 2026 se repitió otra vez sobre el `develop` actualizado (PR #9 y #13, con los nuevos datos de `seed.sql`), con el mismo resultado: 17 de 17.

| Caso | Resultado |
|---|---|
| Sin sesión, `/panel` redirige a `/login` | Aprobado |
| Administrador: gráfica e ingresos visibles | Aprobado |
| Pastor: gráfica visible, ingresos ocultos | Aprobado |
| Secretario: gráfica visible, ingresos ocultos | Aprobado |
| Tesorero: gráfica oculta y sin datos en el HTML, ingresos visibles | Aprobado |
| Coordinador: gráfica e ingresos ocultos | Aprobado |
| Los cuatro indicadores comunes coinciden con SQLite | Aprobado |
| Presentes y ausentes coinciden con un conteo directo de `asistencias` | Aprobado |
| La tabla alternativa tiene títulos completos y las mismas cifras | Aprobado |
| Chart.js con versión fija e integridad | Aprobado |
| Máximo de 8 eventos, los más recientes y en orden (con 16 disponibles) | Aprobado |
| Excluye eventos cancelados y sin registros | Aprobado |
| Un título con HTML se escapa | Aprobado |
| Sin asistencias: mensaje e indicadores conservados | Aprobado |
| Fallo de la consulta: aviso, panel con estado 200 y sin detalles técnicos | Aprobado |
| Un rol sin acceso no ejecuta la consulta | Aprobado |
| Sin errores del servidor en el recorrido | Aprobado |

### Valores con los datos de presentación (3 de noviembre de 2026)

Con el `seed.sql` del PR #13, el panel del Administrador muestra (comprobado contra SQLite):

| Indicador | Valor |
|---|---|
| Miembros activos | 12 |
| Próximos eventos | 7 |
| Asistencias registradas | 56 |
| Ministerios | 5 |
| Ingresos del mes (noviembre) | $3,775.00 |

La gráfica muestra 8 eventos, del culto del 27 de septiembre al ensayo de alabanza del 29 de octubre. Los dos últimos (culto del 25 de octubre: 10 presentes y 2 ausentes; ensayo del 29 de octubre: 3 y 0) son nuevos. Los eventos sin registros, como el culto del 1 de noviembre, no aparecen.

Con estos datos ya se alcanza el máximo de 8 eventos. Si en la presentación se registra la asistencia del culto del 1 de noviembre, ese evento aparecerá al final y el culto del 27 de septiembre dejará de mostrarse. Es el comportamiento esperado.

## Casos comprobados en navegador

Se ejecutaron con Edge headless y un script temporal que no forma parte del repositorio.

| Caso | Resultado |
|---|---|
| Escritorio (1280 px): la gráfica se crea, sin errores de consola ni scroll horizontal | Aprobado |
| Móvil (375 px): la gráfica se crea, sin errores de consola ni scroll horizontal | Aprobado |
| Tooltip con título largo completo en escritorio | Aprobado |
| Tooltip con título largo completo en móvil | Aprobado tras la corrección |
| CDN bloqueado: aviso visible y tabla abierta | Aprobado |
| Tesorero: panel sin gráfica | Aprobado |

**Repetición con los datos de presentación (3 de noviembre de 2026).** Con Edge headless y otro script temporal, sobre `develop` + RF-09 + RF-08:

| Caso | Resultado |
|---|---|
| 1280 px: gráfica con 8 barras, fechas horizontales, sin scroll horizontal | Aprobado |
| 768 px: gráfica con 8 barras, fechas horizontales, sin scroll horizontal | Aprobado |
| 375 px: las 8 fechas del eje se encimaban | Fallido; corregido (error 2) |
| 375 px y 320 px tras la corrección: fechas inclinadas y legibles, sin scroll horizontal | Aprobado |
| Altura de cada barra proporcional a presentes y ausentes | Aprobado |
| Sin errores de JavaScript ni del servidor | Aprobado |

La consola solo registró un 404 de `/favicon.ico`, porque la aplicación no tiene ícono. No pertenece a RF-08.

## Revisión manual en Edge

Se revisó a mano el panel de la aplicación integrada (RF-08 y RF-09 sobre `develop`, con una base temporal).

| Caso | Resultado |
|---|---|
| Gráfica de asistencia | Satisfactorio |
| Indicadores del panel | Satisfactorio |
| Visualización general del panel | Satisfactorio |

## Errores encontrados

| # | Error | Estado |
|---|---|---|
| 1 | En móvil, el tooltip cortaba los títulos largos en el borde de la gráfica | Corregido |
| 2 | Con los 8 eventos del seed del PR #13, en 375 px las fechas del eje se encimaban ("27/0904/10…") | Corregido |

## Correcciones realizadas

- `public/js/panel-graficas.js`: el título del tooltip se divide en varias líneas según el ancho disponible.
- `public/js/panel-graficas.js`: las fechas del eje pueden inclinarse hasta 50° cuando no caben. Chart.js solo las inclina si es necesario, así que en escritorio siguen horizontales.

## Limitaciones

- **Requiere internet:** sin conexión aparece el aviso y la tabla, no la gráfica.
- **Títulos en el eje:** se acortan o se omiten en pantallas angostas, y en celular las fechas se muestran inclinadas. El título completo está en el tooltip y en la tabla.
- **Indicador frente a gráfica:** "Asistencias registradas" cuenta también los eventos cancelados y la gráfica no. Con un evento cancelado que tenga asistencias se obtuvo 44 frente a 43 con el seed anterior, y 57 frente a 56 con el seed del PR #13. El seed no presenta este caso. La vista pertenece a Base de datos y no se modificó.
- **Dependencia de RF-03:** el módulo para registrar asistencias sigue pendiente en `develop`, así que por ahora la gráfica solo muestra datos de `seed.sql`.
- **Roles de la gráfica:** Tesorero y Coordinador no la ven, según `docs/diagrama-er.md` y la sección Asistencias de `permisos.js`. El equipo aún debe confirmarlo.

## Pendiente de ejecución manual

- [x] Revisar en Edge la gráfica, los indicadores y la visualización general del panel.
- [ ] Revisar a mano el panel con los datos del PR #13 y la corrección de las fechas (solo se revisó con Edge headless).
- [ ] Probar la gráfica en un teléfono real, tocando las barras para abrir el tooltip.
- [ ] Probar en Chrome y Firefox. Solo se usó Edge, porque no están instalados en el equipo de prueba.
