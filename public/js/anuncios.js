// Confirmación antes de eliminar un anuncio. Responsable: Persona 1 (Frontend)

document.querySelectorAll('.form-eliminar-anuncio').forEach((form) => {
  form.addEventListener('submit', (evento) => {
    const nombre = form.dataset.nombre;
    const confirmado = confirm(`¿Eliminar el anuncio "${nombre}"? Esta acción no se puede deshacer.`);
    if (!confirmado) evento.preventDefault();
  });
});
