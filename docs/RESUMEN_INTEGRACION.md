# Resumen de integración de RF-08 y RF-09

**Fecha de ejecución:** 2 de noviembre de 2026
**Alcance:** solo RF-08 y RF-09. Este documento no certifica que toda la aplicación esté terminada, porque varios módulos del equipo siguen pendientes.

## Cómo se probó

Se usó un `git worktree` temporal con una rama local que no se publicó y ya se eliminó. También se usaron bases de datos temporales. No se modificaron `develop`, `main` ni `data/iglesia.db`.

| Escenario | Conflictos | Pruebas |
|---|---|---|
| `develop` + RF-09 + RF-08 | Ninguno | 88 de 88 aprobadas |
| `develop` + RF-09 + RF-08 + PR #5, #9 y #11 | Ninguno | 88 de 88 aprobadas |
| RF-08 y RF-09 en orden inverso (`git merge-tree`) | Ninguno | No aplica |

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

### Permisos comprobados por URL directa

| Rol | Miembros | Asistencia | Ministerios | Ingresos | Gráfica | Ingresos en panel |
|---|---|---|---|---|---|---|
| Administrador | Sí | Sí | Sí | Sí | Sí | Sí |
| Pastor | Sí | Sí | Sí | 403 | Sí | No |
| Secretario | Sí | Sí | Sí | 403 | Sí | No |
| Tesorero | Sí | 403 | 403 | Sí | No | Sí |
| Coordinador | 403 | 403 | 403 | 403 | No | No |
| Sin sesión | `/login` | `/login` | `/login` | `/login` | `/login` | `/login` |

El Excel de cada reporte responde igual que su página.

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
3. **Acceso del Tesorero (medio).** La matriz le permite entrar a Reportes, pero `docs/diagrama-er.md` no le da acceso a las vistas de asistencia y ministerios. Se aplicó el documento y hace falta que el equipo lo confirme.
4. **Acceso del Secretario a ministerios (bajo).** Puede abrir el reporte según `docs/diagrama-er.md`, aunque `permisos.js` no le da acceso a la sección Ministerios. También debe confirmarse.
5. **Eventos cancelados en vistas de Base de datos (bajo).** Con un evento cancelado que tenga asistencias, `v_indicadores_panel` lo cuenta (44 frente a 43). `v_participacion_ministerio` lo incluye en el porcentaje: se obtuvo 50 % con 0 actividades. El seed no presenta este caso.
6. **Pruebas sin ejecutar (bajo).** Falta abrir los archivos en Microsoft Excel y probar en un teléfono real.
7. **Pull Requests sin fusionar (medio).** RF-08 y RF-09 siguen en los PR #12 y #10, en estado de borrador. Hasta que se revisen y fusionen, `develop` no incluye estos módulos.
