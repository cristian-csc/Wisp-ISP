import { FormDialog } from 'src/components/shared/form';
import { Button } from 'src/components/ui/button';
import { nombreDeRol } from 'src/lib/permisos';
import type { Usuario } from 'src/lib/api';
import PerfilFormulario from './PerfilFormulario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quien está dentro del sistema, para la cabecera de la ventana. */
  usuario: Usuario | null;
}

/**
 * Los datos de la propia cuenta, en una ventana.
 *
 * Antes el menú de la esquina llevaba a una pantalla aparte: se perdía lo que
 * estabas mirando y había que volver atrás. Cambiar un teléfono o la
 * contraseña es un recado de medio minuto, no un destino.
 *
 * El contenido se desmonta al cerrar, así que cada vez que se abre vuelve a
 * pedir los datos al servidor y nunca muestra lo de la sesión anterior.
 */
const PerfilDialog = ({ open, onOpenChange, usuario }: Props) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title={usuario?.nombre ?? 'Mi perfil'}
    subtitle={usuario ? nombreDeRol(usuario) : undefined}
    icon="tabler:user-circle"
    tone="brand"
    size="xl"
    footer={
      <Button variant="outline" className="rounded-md" onClick={() => onOpenChange(false)}>
        Cerrar
      </Button>
    }
  >
    {/* Sin la tarjeta de identidad: la cabecera de arriba ya dice de quién
        es la cuenta, y repetirlo robaría la mitad del alto útil. */}
    <PerfilFormulario conCabecera={false} />
  </FormDialog>
);

export default PerfilDialog;
