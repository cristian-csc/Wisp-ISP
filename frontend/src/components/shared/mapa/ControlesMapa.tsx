import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { Icon } from '@iconify/react';

/**
 * Piezas visuales compartidas por los mapas del panel (seguimiento de
 * vendedoras e infraestructura de zona). Solo presentación: cada mapa sigue
 * manejando sus propios marcadores, eventos y datos.
 */

export const BOTON =
  'transition-ui grid h-8 w-8 place-items-center text-muted-foreground hover:bg-lightprimary hover:text-primary-text disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * Columna de zoom, centrado y pantalla completa, arriba a la izquierda.
 * `volverA` es el encuadre al que regresa el botón de centrar: el mismo que
 * usa el mapa al abrirse, para que nadie se pierda tras alejarse paneando.
 */
export function ControlesZoom({ volverA }: { volverA?: { centro: [number, number]; zoom: number } }) {
  const map = useMap();
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  useEffect(() => {
    const alCambiar = () => {
      setPantallaCompleta(!!document.fullscreenElement);
      // El mapa queda con el tamaño viejo hasta que se le avisa
      setTimeout(() => map.invalidateSize(), 180);
    };
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, [map]);

  function alternarPantallaCompleta() {
    const caja = map.getContainer().closest('[data-mapa-shell]') as HTMLElement | null;
    if (!caja) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void caja.requestFullscreen?.();
  }

  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col overflow-hidden rounded-xl border border-ld bg-card/95 shadow-md backdrop-blur-sm">
      <button type="button" className={BOTON} onClick={() => map.zoomIn()} aria-label="Acercar">
        <Icon icon="tabler:plus" width={16} />
      </button>
      <span className="h-px bg-border" />
      <button type="button" className={BOTON} onClick={() => map.zoomOut()} aria-label="Alejar">
        <Icon icon="tabler:minus" width={16} />
      </button>
      {volverA && (
        <>
          <span className="h-px bg-border" />
          <button
            type="button"
            className={BOTON}
            onClick={() => map.setView(volverA.centro, volverA.zoom)}
            aria-label="Volver al encuadre inicial"
          >
            <Icon icon="tabler:focus-2" width={16} />
          </button>
        </>
      )}
      <span className="h-px bg-border" />
      <button
        type="button"
        className={BOTON}
        onClick={alternarPantallaCompleta}
        aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        <Icon icon={pantallaCompleta ? 'tabler:arrows-minimize' : 'tabler:arrows-maximize'} width={16} />
      </button>
    </div>
  );
}

/**
 * Leaflet calcula el tamaño al montar; si el contenedor cambia después (se
 * abre un panel, gira el teléfono, se entra en pantalla completa) quedan
 * franjas grises hasta que se le avisa.
 */
export function AjustarTamanoMapa() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const caja = map.getContainer();
    const observador = new ResizeObserver(() => map.invalidateSize());
    observador.observe(caja);
    return () => observador.disconnect();
  }, [map]);
  return null;
}

export type OpcionCapa<T extends string> = { valor: T; etiqueta: string };

/** Selector de capa (Calle / Satélite), arriba a la derecha. */
export function ControlesCapa<T extends string>({
  valor,
  onChange,
  opciones,
}: {
  valor: T;
  onChange: (v: T) => void;
  opciones: readonly OpcionCapa<T>[];
}) {
  return (
    <div className="absolute right-3 top-3 z-[1000] flex overflow-hidden rounded-xl border border-ld bg-card/95 shadow-md backdrop-blur-sm">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          aria-pressed={valor === o.valor}
          className={`transition-ui px-3 py-1.5 text-xs font-semibold ${
            valor === o.valor
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-lightprimary hover:text-primary-text'
          }`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export type ItemLeyenda = {
  color: string;
  texto: string;
  /** Pinta un trazo en vez de un punto */
  linea?: boolean;
};

/** Leyenda del mapa, abajo a la izquierda. */
export function LeyendaMapa({ items, nota }: { items: ItemLeyenda[]; nota?: string }) {
  if (items.length === 0 && !nota) return null;
  return (
    <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-1.5 rounded-xl border border-ld bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
      {items.map((i) => (
        <div key={i.texto} className="flex items-center gap-2">
          <span
            className={`inline-block shrink-0 ${i.linea ? 'h-1 w-4 rounded-full' : 'h-2.5 w-2.5 rounded-full'}`}
            style={{ background: i.color }}
          />
          <span className="text-muted-foreground">{i.texto}</span>
        </div>
      ))}
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/**
 * Marco del mapa: bordes redondeados, alto configurable y el `data-mapa-shell`
 * que necesita el botón de pantalla completa.
 */
export function MapaShell({
  alto = 540,
  children,
  className = '',
}: {
  alto?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-mapa-shell
      className={`relative isolate overflow-hidden rounded-xl border border-ld bg-muted ${className}`}
      style={{ height: alto }}
    >
      {children}
    </div>
  );
}
