// Menú como panel lateral deslizable (drawer) para pantallas angostas (≤760px).
// La clase "js" que activa las reglas de menu-movil.css se agrega en un
// <script> inline en el <head> de header.ejs, no aquí — así se evita el
// parpadeo del menú completo en cada recarga de página (esta app recarga
// toda la página en cada navegación).
// Responsable: Persona 1 (Frontend)

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('.menu');
  const boton = document.querySelector('#botonMenu');
  const panel = document.querySelector('#menuPanel');
  const scrim = document.querySelector('#menuScrim');
  const contenido = document.querySelector('#contenidoPrincipal');
  if (!menu || !boton || !panel) return;

  function estaAbierto() {
    return menu.classList.contains('menu--abierto');
  }

  function abrir() {
    menu.classList.add('menu--abierto');
    boton.setAttribute('aria-expanded', 'true');
    boton.setAttribute('aria-label', 'Cerrar menú');
    document.documentElement.classList.add('menu-bloqueado');

    if (contenido) {
      contenido.setAttribute('inert', '');
      contenido.setAttribute('aria-hidden', 'true');
    }

    const primerEnlace = panel.querySelector('a');
    if (primerEnlace) primerEnlace.focus();
  }

  function cerrar() {
    menu.classList.remove('menu--abierto');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-label', 'Abrir menú');
    document.documentElement.classList.remove('menu-bloqueado');

    if (contenido) {
      contenido.removeAttribute('inert');
      contenido.removeAttribute('aria-hidden');
    }

    boton.focus();
  }

  boton.addEventListener('click', () => {
    if (estaAbierto()) cerrar();
    else abrir();
  });

  panel.querySelectorAll('a').forEach((enlace) => {
    enlace.addEventListener('click', cerrar);
  });

  if (scrim) {
    scrim.addEventListener('click', () => {
      if (estaAbierto()) cerrar();
    });
  }

  document.addEventListener('click', (evento) => {
    if (!estaAbierto()) return;
    if (panel.contains(evento.target) || boton.contains(evento.target)) return;
    cerrar();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && estaAbierto()) {
      cerrar();
    }
  });
});
