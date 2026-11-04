// Confirmación antes de cancelar un evento. Responsable: Persona 1 (Frontend)

document.querySelectorAll('.form-cancelar-evento').forEach((form) => {
  form.addEventListener('submit', (evento) => {
    const nombre = form.dataset.nombre;
    const confirmado = confirm(`¿Cancelar el evento "${nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmado) evento.preventDefault();
  });
});
