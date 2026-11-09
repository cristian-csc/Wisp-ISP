import { useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Button } from 'src/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu';
import type { FormatoReporte } from 'src/lib/descargas';

type Props = {
  /** Quien lo usa decide qué reporte se baja; aquí solo se elige el formato. */
  onDescargar: (formato: FormatoReporte) => Promise<void>;
  etiqueta?: string;
  /** Texto chico sobre las opciones, para saber qué se está bajando. */
  titulo?: string;
  size?: 'default' | 'sm';
  variant?: 'default' | 'outline';
  className?: string;
};

const BotonDescargarReporte = ({
  onDescargar,
  etiqueta = 'Descargar',
  titulo,
  size = 'default',
  variant = 'outline',
  className,
}: Props) => {
  const [bajando, setBajando] = useState<FormatoReporte | null>(null);

  async function descargar(formato: FormatoReporte) {
    setBajando(formato);
    try {
      await onDescargar(formato);
    } catch {
      toast.error('No se pudo generar el reporte. Intenta de nuevo.');
    } finally {
      setBajando(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={bajando !== null} className={className}>
          <Icon
            icon={bajando ? 'tabler:loader-2' : 'tabler:download'}
            height={17}
            className={bajando ? 'animate-spin' : undefined}
          />
          {bajando ? 'Generando…' : etiqueta}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {titulo && (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {titulo}
          </DropdownMenuLabel>
        )}
        <DropdownMenuItem onClick={() => descargar('excel')} className="gap-2.5">
          <Icon icon="tabler:file-spreadsheet" height={18} className="text-success" />
          <span>
            Excel
            <span className="block text-xs text-muted-foreground">Para calcular y ordenar</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => descargar('pdf')} className="gap-2.5">
          <Icon icon="tabler:file-type-pdf" height={18} className="text-error" />
          <span>
            PDF
            <span className="block text-xs text-muted-foreground">Para imprimir o enviar</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default BotonDescargarReporte;
