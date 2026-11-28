import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { Dialog, DialogContent } from 'src/components/ui/dialog';
import { cn } from 'src/lib/utils';

type Props = {
  /** Trae la foto como blob URL (ej. getUnidadFotoBlobUrl). Si es null, no hay foto. */
  cargar: (() => Promise<string>) | null;
  /** Clave que, al cambiar, vuelve a pedir la foto (ej. el id o un contador tras subir). */
  clave?: string | number;
  alt: string;
  className?: string;
  /** Icono del recuadro cuando no hay foto. */
  iconoVacio?: string;
  /** Si true, al tocar la foto se abre ampliada. */
  ampliable?: boolean;
  /** Cómo encaja la foto en el recuadro. 'cover' (por defecto) recorta para
   *  llenar; 'contain' la muestra entera sin recortar —mejor para productos
   *  como cables o conectores, donde recortar pierde información. */
  ajuste?: 'cover' | 'contain';
};

/**
 * Muestra una foto que vive tras la sesión: no se puede poner la URL directa en
 * un <img>, así que se baja como blob con el token y se suelta al desmontar.
 */
export default function FotoRemota({
  cargar,
  clave,
  alt,
  className,
  iconoVacio = 'tabler:photo',
  ampliable = false,
  ajuste = 'cover',
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!cargar) {
      setUrl(null);
      return;
    }
    let vivo = true;
    let creada: string | null = null;
    setFallo(false);
    cargar()
      .then((u) => {
        if (vivo) {
          creada = u;
          setUrl(u);
        } else {
          URL.revokeObjectURL(u);
        }
      })
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, cargar === null]);

  const base = 'grid place-items-center overflow-hidden bg-muted text-muted-foreground';

  if (!cargar || fallo || (!url && cargar)) {
    // Sin foto, error, o aún cargando: un recuadro con icono.
    return (
      <div className={cn(base, className)} aria-label={!cargar ? 'Sin foto' : alt}>
        <Icon icon={fallo || !cargar ? iconoVacio : 'tabler:loader-2'} className={cn('opacity-50', !fallo && cargar && !url && 'animate-spin')} width={22} />
      </div>
    );
  }

  const img = (
    <img
      src={url!}
      alt={alt}
      className={cn('h-full w-full', ajuste === 'contain' ? 'object-contain' : 'object-cover', ampliable && 'cursor-zoom-in')}
      onClick={ampliable ? () => setAbierta(true) : undefined}
    />
  );

  return (
    <div className={cn(base, className)}>
      {img}
      {ampliable && (
        <Dialog open={abierta} onOpenChange={setAbierta}>
          <DialogContent className="max-w-3xl p-2">
            <img src={url!} alt={alt} className="max-h-[80vh] w-full rounded-lg object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
