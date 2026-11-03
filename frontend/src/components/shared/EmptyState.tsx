import { Icon } from '@iconify/react';

interface Props {
  icono?: string;
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}

/** Estado vacío uniforme: dice qué falta y, cuando aplica, ofrece la salida. */
const EmptyState = ({ icono = 'tabler:inbox', titulo, descripcion, accion }: Props) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
    <span className="grid size-14 place-items-center rounded-2xl bg-muted">
      <Icon icon={icono} width={28} className="text-muted-foreground" />
    </span>
    <div>
      <p className="font-semibold">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>}
    </div>
    {accion}
  </div>
);

export default EmptyState;
