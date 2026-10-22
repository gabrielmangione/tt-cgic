// Catálogo de datos personales que un formulario puede pedir (debe coincidir con backend/src/services/personales.js)
export const DATOS_PERSONALES = {
  nombre: { etiqueta: 'Nombre', type: 'text' },
  apellido: { etiqueta: 'Apellido', type: 'text' },
  documento: { etiqueta: 'Documento', type: 'text' },
  telefono: { etiqueta: 'Teléfono', type: 'tel' },
  email: { etiqueta: 'Correo electrónico', type: 'email' },
  direccion: { etiqueta: 'Dirección', type: 'text' },
  fecha_nacimiento: { etiqueta: 'Fecha de nacimiento', type: 'date' },
};
