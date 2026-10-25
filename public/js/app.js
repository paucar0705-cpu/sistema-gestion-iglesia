// JavaScript del lado del cliente (confirmaciones, filtros, gráficas).
// Responsable: Persona 1 (Frontend)

document.querySelectorAll('.form-desactivar').forEach((form) => {
  form.addEventListener('submit', (evento) => {
    const nombre = form.dataset.nombre;
    const confirmado = confirm(`¿Desactivar a ${nombre}? Dejará de aparecer entre los miembros activos.`);
    if (!confirmado) evento.preventDefault();
  });
});
