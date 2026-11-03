import { useState, useEffect, useEffectEvent } from 'react';
import { Icon } from '@iconify/react';
import Messages from './Messages';
import FullLogo from '../../shared/logo/FullLogo';
import Profile from './Profile';
import SidebarLayout from '../sidebar/Sidebar';
import { useTheme } from 'src/components/provider/theme-provider';

import { Sheet, SheetContent, SheetTitle } from 'src/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import Search from './Search';

/** Botón redondo del encabezado: misma caja, mismo hover y mismo foco para
 *  todos los iconos de la barra. Antes cada uno repetía su propia cadena de
 *  clases y el selector de tema estaba escrito dos veces (escritorio y móvil). */
const BotonIcono = ({
  icono,
  etiqueta,
  onClick,
  className = '',
}: {
  icono: string;
  etiqueta: string;
  onClick?: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={etiqueta}
    title={etiqueta}
    className={`transition-ui grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-lightprimary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
  >
    <Icon icon={icono} width={20} />
  </button>
);

const Header = () => {
  const { theme, setTheme } = useTheme();
  const [isSticky, setIsSticky] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleScroll = useEffectEvent(() => {
    setIsSticky(window.scrollY > 50);
  });

  const handleResize = useEffectEvent(() => {
    if (window.innerWidth > 1023) setIsOpen(false);
  });

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const esOscuro = theme === 'dark';
  const toggleMode = () => setTheme(esOscuro ? 'light' : 'dark');

  return (
    <>
      <header
        className={`transition-ui sticky top-0 z-[2] border-b bg-header ${
          isSticky ? 'border-ld shadow-sm' : 'border-transparent'
        }`}
      >
        <nav className="flex !max-w-full items-center gap-3 rounded-none bg-transparent px-4 py-3 dark:bg-transparent sm:px-6">
          {/* Abrir el menú lateral en pantallas sin sidebar fijo */}
          <BotonIcono
            icono="tabler:menu-2"
            etiqueta="Abrir menú"
            onClick={() => setIsOpen(true)}
            className="xl:hidden"
          />

          {/* Logo solo donde no hay sidebar visible */}
          <div className="block shrink-0 xl:hidden">
            <FullLogo ancho={96} />
          </div>

          {/* Buscador: ocupa el espacio disponible en escritorio */}
          <div className="hidden flex-1 items-center xl:flex">
            <Search />
          </div>

          {/* Acciones: una sola vez, no duplicadas por tamaño de pantalla */}
          <div className="ms-auto flex items-center gap-1">
            <BotonIcono
              icono={esOscuro ? 'solar:sun-bold-duotone' : 'tabler:moon'}
              etiqueta={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              onClick={toggleMode}
            />
            <Messages />
            <Profile />
          </div>
        </nav>
      </header>

      {/* Menú lateral en móvil */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <VisuallyHidden>
            <SheetTitle>Menú de navegación</SheetTitle>
          </VisuallyHidden>
          <SidebarLayout onClose={() => setIsOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Header;
