import PerfilFormulario from 'src/components/apps/perfil/PerfilFormulario';

/**
 * La página /perfil.
 *
 * El camino normal para llegar aquí ya no es este: el menú de la esquina abre
 * la misma ficha en una ventana, sin salir de lo que estabas haciendo. La
 * ruta se conserva para que un enlace guardado en favoritos siga funcionando,
 * y muestra exactamente el mismo formulario — es el mismo componente, no una
 * copia que se quedaría atrás al cambiar la otra.
 */
const Perfil = () => (
  <div className="max-w-3xl">
    <PerfilFormulario />
  </div>
);

export default Perfil;
