import { Icon } from '@iconify/react';
import { Link } from 'react-router';
import { cn } from 'src/lib/utils';
import { fecha } from 'src/lib/formato';
import type { EstadoOnu, MovimientoOnu, Onu } from 'src/lib/onus';

export const ESTADO_ONU: Record<EstadoOnu, { texto: string; clase: string; icono: string }> = {
  en_almacen: { texto: 'En almacén', clase: 'bg-muted text-foreground', icono: 'tabler:building-warehouse' },
  asignado_tecnico: { texto: 'Con técnico', clase: 'bg-lightbrand text-brand-strong dark:text-brand', icono: 'tabler:user' },
  instalado: { texto: 'Instalada', clase: 'bg-lightsuccess text-success-text', icono: 'tabler:home-check' },
  danado: { texto: 'Dañada', clase: 'bg-lighterror text-error-text', icono: 'tabler:alert-triangle' },
  perdido: { texto: 'Perdida', clase: 'bg-foreground text-background', icono: 'tabler:help-hexagon' },
};

export const EstadoOnuChip = ({ estado }: { estado: EstadoOnu }) => {
  const e = ESTADO_ONU[estado];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', e.clase)}>
      <Icon icon={e.icono} width={13} aria-hidden="true" />
      {e.texto}
    </span>
  );
};

/** Dónde está la ONU ahora, en una línea. */
export const DondeEsta = ({ onu, compacto = false }: { onu: Onu; compacto?: boolean }) => {
  if (onu.estado === 'instalado' && onu.cliente) {
    return (
      <span className="block min-w-0">
        <Link to={`/clientes/${onu.cliente.id}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-medium hover:underline">
          {onu.cliente.nombre}
        </Link>
        {!compacto && (
          <span className="block truncate text-xs text-muted-foreground">
            {onu.cliente.zona?.nombre ?? 'Sin zona'}
            {onu.fecha_instalacion && ` · desde ${fecha(onu.fecha_instalacion)}`}
          </span>
        )}
      </span>
    );
  }
  if (onu.tecnico) {
    return (
      <span className="block min-w-0">
        <span className="block truncate text-sm font-medium">{onu.tecnico.nombre}</span>
        {!compacto && (
          <span className="block truncate text-xs text-muted-foreground">
            {onu.estado === 'asignado_tecnico' ? 'La tiene' : 'La tenía'}
            {onu.fecha_asignacion_tecnico && ` desde ${fecha(onu.fecha_asignacion_tecnico)}`}
          </span>
        )}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">{onu.estado === 'perdido' ? 'Sin ubicar' : 'Almacén'}</span>;
};

const TIPO: Record<MovimientoOnu['tipo'], { icono: string; clase: string }> = {
  alta: { icono: 'tabler:plus', clase: 'bg-muted text-foreground' },
  asignacion: { icono: 'tabler:user-share', clase: 'bg-lightbrand text-brand-strong dark:text-brand' },
  traspaso: { icono: 'tabler:arrows-exchange', clase: 'bg-lightbrand text-brand-strong dark:text-brand' },
  devolucion: { icono: 'tabler:arrow-back-up', clase: 'bg-muted text-foreground' },
  instalacion: { icono: 'tabler:home-check', clase: 'bg-lightsuccess text-success-text' },
  retiro: { icono: 'tabler:home-move', clase: 'bg-muted text-foreground' },
  danada: { icono: 'tabler:alert-triangle', clase: 'bg-lighterror text-error-text' },
  perdida: { icono: 'tabler:help-hexagon', clase: 'bg-foreground text-background' },
  recuperada: { icono: 'tabler:rotate-clockwise', clase: 'bg-lightsuccess text-success-text' },
};

/** Lo que pasó, dicho como lo diría una persona. */
export function textoMovimiento(m: MovimientoOnu) {
  const quien = m.persona?.nombre;
  const cliente = m.cliente ? (
    <Link to={`/clientes/${m.cliente.id}`} className="font-medium text-foreground hover:underline">
      {m.cliente.nombre}
    </Link>
  ) : null;
  switch (m.tipo) {
    case 'alta':
      return quien ? <>Registrada por {quien}, que ya la tenía</> : <>Entró al almacén</>;
    case 'asignacion':
      return <>Entregada a <b className="font-medium text-foreground">{quien ?? 'un técnico'}</b></>;
    case 'traspaso':
      return <>Pasó a <b className="font-medium text-foreground">{quien ?? 'otro técnico'}</b></>;
    case 'devolucion':
      return <>Devuelta al almacén{quien ? <> por {quien}</> : null}</>;
    case 'instalacion':
      return cliente ? <>Instalada en {cliente}</> : <>Instalada en un cliente</>;
    case 'retiro':
      return cliente ? <>Retirada de {cliente}</> : <>Retirada del cliente</>;
    case 'danada':
      return cliente ? <>Marcada dañada al retirarla de {cliente}</> : <>Marcada como dañada</>;
    case 'perdida':
      return <>Marcada como perdida</>;
    case 'recuperada':
      return <>Recuperada: vuelve al almacén</>;
  }
}

function fechaHoraCorta(valor: string) {
  const d = new Date(valor);
  return `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
}

/** El recorrido, de lo más nuevo a lo más viejo, como una línea de tiempo. */
export const LineaDeTiempo = ({ movimientos }: { movimientos: MovimientoOnu[] }) => (
  <ol className="relative">
    {movimientos.map((m, i) => {
      const t = TIPO[m.tipo] ?? TIPO.alta;
      return (
        <li key={m.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < movimientos.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />}
          <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-full', t.clase)}>
            <Icon icon={t.icono} width={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-1">
            <p className="text-sm text-muted-foreground">{textoMovimiento(m)}</p>
            {m.nota && <p className="mt-0.5 text-sm text-foreground/85">{m.nota}</p>}
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {fechaHoraCorta(m.creado_en)}
              {m.registrado_por ? ` · registró ${m.registrado_por.nombre}` : ' · reconstruido de los datos anteriores'}
            </p>
          </div>
        </li>
      );
    })}
  </ol>
);
