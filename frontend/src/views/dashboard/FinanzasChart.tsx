import { useState } from 'react';
import type { MesFinanzas } from 'src/lib/api';

/** Redondea el tope del eje a una cifra legible (100, 250, 500, 1000…). */
function topeEje(max: number): number {
  if (max <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    const candidato = paso * exp;
    if (candidato >= max) return candidato;
  }
  return 10 * exp;
}

function soles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface Props {
  datos: MesFinanzas[];
}

const FinanzasChart = ({ datos }: Props) => {
  const [activo, setActivo] = useState<number | null>(null);

  const tope = topeEje(Math.max(...datos.flatMap((d) => [d.ingresos, d.gastos]), 0));
  const marcas = [1, 0.75, 0.5, 0.25, 0].map((f) => tope * f);

  const totalIngresos = datos.reduce((s, d) => s + d.ingresos, 0);
  const totalGastos = datos.reduce((s, d) => s + d.gastos, 0);

  return (
    <div className="viz-root">
      {/* Los colores salen de los tokens del sistema (--chart-*), así que el
          gráfico sigue al tema claro/oscuro sin duplicar paleta aquí. */}
      <style>{`
        .viz-root {
          --serie-ingresos: var(--chart-1);
          --serie-gastos: var(--chart-2);
          --viz-grid: var(--chart-grid);
          --viz-axis: var(--chart-axis);
          --viz-muted: var(--muted-foreground);
        }
      `}</style>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ingresos y gastos por mes</h2>
          <p className="text-sm" style={{ color: 'var(--viz-muted)' }}>
            Año {datos[0]?.mes.slice(0, 4) ?? '—'} · cobrado {soles(totalIngresos)} · gastado {soles(totalGastos)}
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--serie-ingresos)' }} />
            Ingresos
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--serie-gastos)' }} />
            Gastos
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        {/* eje vertical */}
        <div className="flex h-[260px] w-14 shrink-0 flex-col justify-between text-right text-[13px] tabular-nums" style={{ color: 'var(--viz-muted)' }}>
          {marcas.map((m) => (
            <span key={m} className="leading-none">
              {m >= 1000 ? `${m / 1000}k` : m}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* líneas de referencia */}
          <div className="absolute inset-x-0 top-0 h-[260px]">
            {marcas.map((m, i) => (
              <div
                key={m}
                className="absolute inset-x-0"
                style={{
                  top: `${(i / (marcas.length - 1)) * 100}%`,
                  borderTop: `1px solid ${i === marcas.length - 1 ? 'var(--viz-axis)' : 'var(--viz-grid)'}`,
                }}
              />
            ))}
          </div>

          {/* barras */}
          <div className="relative flex h-[260px] items-end">
            {datos.map((d, i) => {
              const hIngresos = tope > 0 ? (d.ingresos / tope) * 100 : 0;
              const hGastos = tope > 0 ? (d.gastos / tope) * 100 : 0;
              return (
                <div
                  key={d.mes}
                  className="relative flex h-full flex-1 items-end justify-center gap-[2px] px-[3px]"
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  tabIndex={0}
                  aria-label={`${d.nombre_mes}: ingresos ${soles(d.ingresos)}, gastos ${soles(d.gastos)}`}
                >
                  {activo === i && (
                    <div className="pointer-events-none absolute inset-0 -z-10 rounded bg-black/[0.04] dark:bg-white/[0.06]" />
                  )}
                  <div
                    className="w-1/2 max-w-[18px] rounded-t"
                    style={{
                      height: `${hIngresos}%`,
                      minHeight: d.ingresos > 0 ? 2 : 0,
                      backgroundColor: 'var(--serie-ingresos)',
                    }}
                  />
                  <div
                    className="w-1/2 max-w-[18px] rounded-t"
                    style={{
                      height: `${hGastos}%`,
                      minHeight: d.gastos > 0 ? 2 : 0,
                      backgroundColor: 'var(--serie-gastos)',
                    }}
                  />
                </div>
              );
            })}

            {activo !== null && (
              <div
                className="pointer-events-none absolute top-1 z-10 w-max -translate-x-1/2 rounded-lg border border-ld bg-card px-3 py-2 text-[13px] shadow-lg"
                style={{
                  left: `${Math.min(Math.max(((activo + 0.5) / datos.length) * 100, 12), 88)}%`,
                }}
              >
                <p className="font-semibold">{datos[activo].nombre_mes}</p>
                <p className="tabular-nums" style={{ color: 'var(--viz-muted)' }}>
                  Ingresos <span className="font-medium text-foreground">{soles(datos[activo].ingresos)}</span>
                </p>
                <p className="tabular-nums" style={{ color: 'var(--viz-muted)' }}>
                  Gastos <span className="font-medium text-foreground">{soles(datos[activo].gastos)}</span>
                </p>
              </div>
            )}
          </div>

          {/* eje horizontal */}
          <div className="mt-2 flex text-[13px]" style={{ color: 'var(--viz-muted)' }}>
            {datos.map((d, i) => (
              <span key={d.mes} className="flex-1 text-center">
                {/* el hueco se conserva para que las etiquetas no se desalineen de las barras */}
                <span className={i % 2 === 1 ? 'hidden sm:inline' : ''}>{d.nombre_mes}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-5">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          Ver los números en tabla
        </summary>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-ld text-left text-muted-foreground">
              <th className="py-2 font-medium">Mes</th>
              <th className="py-2 text-right font-medium">Ingresos</th>
              <th className="py-2 text-right font-medium">Gastos</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {datos.map((d) => (
              <tr key={d.mes} className="border-b border-ld/50">
                <td className="py-2">{d.nombre_mes}</td>
                <td className="py-2 text-right">{soles(d.ingresos)}</td>
                <td className="py-2 text-right">{soles(d.gastos)}</td>
                <td className="py-2 text-right">{soles(d.ingresos - d.gastos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

export default FinanzasChart;
