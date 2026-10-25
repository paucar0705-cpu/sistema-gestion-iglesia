// Matriz de permisos por sección (propuesta del documento, sección 2).
// Un solo lugar para cambiar quién entra a qué. Lo usan el menú y el middleware.
// Responsable: Persona 2 (Backend / seguridad)

const ROLES = {
  ADMIN: 'Administrador',
  PASTOR: 'Pastor',
  SECRETARIO: 'Secretario',
  TESORERO: 'Tesorero',
  COORDINADOR: 'Coordinador',
};
const { ADMIN, PASTOR, SECRETARIO, TESORERO, COORDINADOR } = ROLES;
const TODOS = Object.values(ROLES);

// clave: { ruta, etiqueta del menú, RF, roles que pueden ENTRAR }
// Ojo: "entrar" no es lo mismo que "editar"; cada módulo valida además
// si el rol solo consulta o también puede modificar.
const SECCIONES = {
  panel:         { ruta: '/panel',         etiqueta: 'Panel',         rf: 'RF-08', roles: TODOS },
  usuarios:      { ruta: '/usuarios',      etiqueta: 'Usuarios',      rf: 'RF-01', roles: [ADMIN] },
  miembros:      { ruta: '/miembros',      etiqueta: 'Miembros',      rf: 'RF-02', roles: TODOS },
  asistencias:   { ruta: '/asistencias',   etiqueta: 'Asistencias',   rf: 'RF-03', roles: [ADMIN, PASTOR, SECRETARIO] },
  eventos:       { ruta: '/eventos',       etiqueta: 'Eventos',       rf: 'RF-04', roles: [ADMIN, PASTOR, SECRETARIO, COORDINADOR] },
  ministerios:   { ruta: '/ministerios',   etiqueta: 'Ministerios',   rf: 'RF-05', roles: [ADMIN, PASTOR, COORDINADOR] },
  donaciones:    { ruta: '/donaciones',    etiqueta: 'Donaciones',    rf: 'RF-06', roles: [ADMIN, TESORERO] },
  anuncios:      { ruta: '/anuncios',      etiqueta: 'Anuncios',      rf: 'RF-07', roles: [ADMIN, PASTOR, SECRETARIO] },
  reportes:      { ruta: '/reportes',      etiqueta: 'Reportes',      rf: 'RF-09', roles: [ADMIN, PASTOR, SECRETARIO, TESORERO] },
  configuracion: { ruta: '/configuracion', etiqueta: 'Configuración', rf: 'RF-10', roles: [ADMIN] },
};

// Datos financieros (donaciones, ingresos en panel y reportes de ingresos)
const ROLES_FINANCIEROS = [ADMIN, TESORERO];

function puedeVer(rol, seccion) {
  return Boolean(SECCIONES[seccion] && SECCIONES[seccion].roles.includes(rol));
}

module.exports = { ROLES, SECCIONES, ROLES_FINANCIEROS, puedeVer };
