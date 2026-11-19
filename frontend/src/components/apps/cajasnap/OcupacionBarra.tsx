import { cn } from 'src/lib/utils';
import type { ResumenBornes } from 'src/lib/cajasnap';

/** Barra partida en ocupados, dañados y libres. El hueco claro son los
 *  bornes libres: lo que todavía se puede vender. */
const OcupacionBarra = ({ r, className }: { r: ResumenBornes; className?: string }) => {
  if (r.total === 0) {
    return <div className={cn('h-1.5 rounded-full border border-dashed border-ld', className)} aria-hidden="true" />;
  }
  const ancho = (n: number) => `${(n / r.total) * 100}%`;
  return (
    <div
      className={cn('flex h-1.5 overflow-hidden rounded-full bg-lightsuccess', className)}
      role="img"
      aria-label={`${r.ocupados} ocupados, ${r.libres} libres${r.danados ? `, ${r.danados} dañados` : ''} de ${r.total}`}
    >
      <div className="h-full bg-foreground/75" style={{ width: ancho(r.ocupados) }} />
      {r.danados > 0 && <div className="h-full bg-error-solid" style={{ width: ancho(r.danados) }} />}
    </div>
  );
};

export default OcupacionBarra;
