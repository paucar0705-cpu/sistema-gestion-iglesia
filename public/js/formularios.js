// Validación reutilizable para formularios con un solo contenedor de errores (#mensajeError).
// Responsable: Persona 1 (Frontend)
//
// Uso:
//   validarFormulario(document.querySelector('#miFormulario'), [
//     { selector: '#campo', validar: (valor) => valor === '', mensaje: 'Este campo es obligatorio.' },
//   ]);
// `validar` recibe el valor (ya con trim) y debe regresar true cuando es INVÁLIDO.

function validarFormulario(form, reglas) {
  const mensajeError = document.querySelector('#mensajeError');

  function marcarError(campo, invalido) {
    if (invalido) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
  }

  function mostrarError(mensaje) {
    mensajeError.textContent = mensaje;
    mensajeError.hidden = false;
  }

  function ocultarError() {
    mensajeError.hidden = true;
    mensajeError.textContent = '';
  }

  const campos = reglas.map((regla) => ({ ...regla, elemento: form.querySelector(regla.selector) }));

  campos.forEach(({ elemento }) => {
    elemento.addEventListener('input', () => {
      marcarError(elemento, false);
      ocultarError();
    });
  });

  form.addEventListener('submit', (evento) => {
    let primerMensaje = null;

    campos.forEach(({ elemento, validar, mensaje }) => {
      const invalido = validar(elemento.value.trim());
      marcarError(elemento, invalido);
      if (invalido && !primerMensaje) primerMensaje = mensaje;
    });

    if (primerMensaje) {
      evento.preventDefault();
      mostrarError(primerMensaje);
      return;
    }

    ocultarError();
  });
}
