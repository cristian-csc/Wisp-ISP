import Logo from 'src/assets/logo-wisp.png';

// El archivo es PNG de 376x152 con fondo transparente, así que se ve igual
// sobre el sidebar oscuro y sobre fondo claro: no hace falta una segunda
// versión ni un recuadro detrás.
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
