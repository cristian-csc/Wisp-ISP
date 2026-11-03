import Logo from 'src/assets/logo-wisp.png';

// El logo de WISP viene con fondo claro sólido (no transparente), así que
// todavía no hay una versión separada para fondo oscuro — cuando exista,
// acá se agrega el mismo swap block/hidden dark:block que usa la plantilla
// de referencia. Por ahora se muestra igual en los dos modos.
interface Props {
  /** Ancho en píxeles. Por defecto compacto, para que en el sidebar el peso
   *  visual lo lleve la navegación y no la marca. */
  ancho?: number;
  className?: string;
}

const FullLogo = ({ ancho = 118, className = '' }: Props) => (
  <img
    src={Logo}
    alt="WISP"
    width={ancho}
    className={`rtl:scale-x-[-1] h-auto ${className}`}
    style={{ width: ancho }}
  />
);

export default FullLogo;
