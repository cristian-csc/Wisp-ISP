import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import SectionCard from 'src/components/shared/SectionCard';
import StatCard from 'src/components/shared/StatCard';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import FinanzasChart from './FinanzasChart';
import EstadoClientesDonut from './EstadoClientesDonut';
import {
  getMe,
  getDashboardStats,
  getIngresosMensual,
  getUltimasActivaciones,
  contarClientesPorEstado,
  contarAveriasAbiertas,
  contarRetirosPendientes,
  type Usuario,
  type DashboardStats,
  type MesFinanzas,
  type Movimiento,
} from 'src/lib/api';
import { puedeVerUrl, ROL_LABEL } from 'src/lib/permisos';

function soles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Iniciales para el avatar de la lista de movimientos. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const TIPO_PUNTO: Record<string, { texto: string; color: string }> = {
  activacion: { texto: 'Activación', color: 'var(--success)' },
  corte: { texto: 'Corte', color: 'var(--error)' },
  pago: { texto: 'Pago', color: 'var(--primary)' },
};

const Dashboard = () => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [meses, setMeses] = useState<MesFinanzas[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [porAprobar, setPorAprobar] = useState<number | null>(null);
  const [porInstalar, setPorInstalar] = useState<number | null>(null);
  const [averias, setAverias] = useState<number | null>(null);
  const [retiros, setRetiros] = useState<number | null>(null);

  useEffect(() => {
    getMe().then(setUsuario).catch(() => {});
    getDashboardStats().then(setStats).catch(() => {});
    getUltimasActivaciones(6)
      .then(setMovimientos)
      .catch(() => setMovimientos([]));
    getIngresosMensual().then(setMeses).catch(() => {});
    contarClientesPorEstado('pendiente_aprobacion').then(setPorAprobar).catch(() => {});
    Promise.all([contarClientesPorEstado('aprobado'), contarClientesPorEstado('no_instalado')])
      .then(([a, b]) => setPorInstalar(a + b))
      .catch(() => {});
    contarAveriasAbiertas().then(setAverias).catch(() => {});
    contarRetirosPendientes().then(setRetiros).catch(() => {});
  }, []);

  // Lo que ve cada rol sale del menú: si a este rol se le esconde "Pagos", el
  // dashboard tampoco le muestra importes ni lo enlaza ahí.
  const rol = usuario?.rol;
  const vePagos = puedeVerUrl('/pagos', rol);
  const veGastos = puedeVerUrl('/gastos', rol);
  const veClientes = puedeVerUrl('/clientes', rol);
  const veZonas = puedeVerUrl('/zonas', rol);

  const deltaIngresos =
    stats && stats.ingresos_mes_anterior > 0
      ? ((stats.ingresos_mes_actual - stats.ingresos_mes_anterior) / stats.ingresos_mes_anterior) *
        100
      : null;

  const hoy = new Date().toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Reparto de estados para la dona. "Otros" agrupa lo que no es activo,
  // pendiente ni suspendido (rechazados, anulados, por instalar).
  const otros = stats
    ? Math.max(
        0,
        stats.total_clientes -
          stats.clientes_activos -
          stats.clientes_suspendidos -
          (porAprobar ?? 0),
      )
    : 0;

  const accesos = [
    {
      titulo: 'Registrar cliente',
      icono: 'tabler:user-plus',
      a: '/clientes',
      visible: veClientes,
      destacado: true,
    },
    {
      titulo: 'Pendientes de aprobación',
      icono: 'tabler:user-check',
      a: '/clientes/pendientes',
      visible: puedeVerUrl('/clientes/pendientes', rol),
    },
    {
      titulo: 'Reportar avería',
      icono: 'tabler:alert-triangle',
      a: '/averias',
      visible: puedeVerUrl('/averias', rol),
    },
    {
      titulo: 'Ver zonas y cobertura',
      icono: 'tabler:map-pin',
      a: '/zonas',
      visible: veZonas,
    },
  ].filter((x) => x.visible);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Saludo ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">
            ¡Bienvenido, {usuario?.nombre ?? '…'}!
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {usuario && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-lightprimary px-2.5 py-1 text-xs font-semibold text-primary-text">
                <Icon icon="tabler:shield-check" width={13} />
                {ROL_LABEL[usuario.rol]}
              </span>
            )}
            <p className="text-sm text-muted-foreground">
              Aquí tienes un resumen de tu red y operaciones.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-ld bg-card px-3.5 py-2">
          <Icon icon="tabler:calendar" width={18} className="text-muted-foreground" />
          <div className="leading-tight">
            <p className="text-[11px] text-muted-foreground">Hoy</p>
            <p className="text-sm font-semibold">{hoy}</p>
          </div>
        </div>
      </div>

      {/* ── Indicadores ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icono="tabler:users"
          etiqueta="Clientes activos"
          valor={stats ? stats.clientes_activos : '—'}
          tono="primary"
          to={veClientes ? '/clientes' : undefined}
          nota={stats ? `${stats.total_clientes} registrados en total` : undefined}
        />

        {vePagos ? (
          <StatCard
            icono="tabler:cash"
            etiqueta="Ingresos este mes"
            valor={stats ? soles(stats.ingresos_mes_actual) : '—'}
            delta={deltaIngresos}
            tono="brand"
            to="/pagos"
            nota={stats ? `vs ${soles(stats.ingresos_mes_anterior)} el mes pasado` : undefined}
          />
        ) : (
          <StatCard
            icono="tabler:user-off"
            etiqueta="Clientes suspendidos"
            valor={stats ? stats.clientes_suspendidos : '—'}
            tono="error"
            to={veClientes ? '/clientes' : undefined}
          />
        )}

        <StatCard
          icono="tabler:tool"
          etiqueta="Por instalar"
          valor={porInstalar ?? '—'}
          tono="info"
          to={veClientes ? '/clientes' : undefined}
          nota="Aprobados y no instalados"
        />

        <StatCard
          icono="tabler:alert-triangle"
          etiqueta="Averías abiertas"
          valor={averias ?? '—'}
          tono="warning"
          to={puedeVerUrl('/averias', rol) ? '/averias' : undefined}
          nota={retiros !== null ? `${retiros} retiros pendientes` : undefined}
        />

        <StatCard
          icono="tabler:map-pin"
          etiqueta="Zonas con cobertura"
          valor={stats ? stats.total_zonas : '—'}
          tono="success"
          to={veZonas ? '/zonas' : undefined}
          nota={vePagos && stats ? `${stats.pagos_pendientes} pagos pendientes` : undefined}
        />
      </div>

      {/* ── Gráfico + estado de clientes ─────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        {veGastos && meses.length > 0 && (
          <CardBox className="p-5 md:p-6 xl:col-span-2">
            <FinanzasChart datos={meses} />
          </CardBox>
        )}

        <SectionCard
          titulo="Estado de clientes"
          icono="tabler:chart-donut"
          descripcion="Reparto del padrón actual"
          className={veGastos && meses.length > 0 ? '' : 'xl:col-span-3'}
        >
          {stats ? (
            <EstadoClientesDonut
              total={stats.total_clientes}
              segmentos={[
                { etiqueta: 'Activos', valor: stats.clientes_activos, color: 'var(--success)' },
                { etiqueta: 'Pendientes', valor: porAprobar ?? 0, color: 'var(--warning)' },
                {
                  etiqueta: 'Suspendidos',
                  valor: stats.clientes_suspendidos,
                  color: 'var(--error)',
                },
                { etiqueta: 'Otros', valor: otros, color: 'var(--muted-foreground)' },
              ]}
            />
          ) : (
            <LoadingState filas={3} className="p-0" />
          )}
        </SectionCard>
      </div>

      {/* ── Movimientos + accesos rápidos ────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          titulo="Último movimiento"
          icono="tabler:history"
          descripcion="Activaciones, cortes y pagos recientes"
          className="xl:col-span-2"
          sinRelleno
          extra={
            veClientes && (
              <Link
                to="/clientes"
                className="transition-ui inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver clientes
                <Icon icon="tabler:arrow-right" width={15} />
              </Link>
            )
          }
        >
          {movimientos === null ? (
            <LoadingState filas={4} />
          ) : movimientos.length === 0 ? (
            <EmptyState
              icono="tabler:history-off"
              titulo="Todavía no hay movimientos"
              descripcion="Las activaciones, cortes y pagos aparecerán aquí en cuanto ocurran."
            />
          ) : (
            <ul className="px-5 pb-5">
              {movimientos.map((m) => {
                const tipo = TIPO_PUNTO[m.tipo] ?? {
                  texto: m.tipo,
                  color: 'var(--muted-foreground)',
                };
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-ld/60 py-3 last:border-0"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                      {iniciales(m.cliente_nombre)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{m.cliente_nombre}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tipo.color }}
                            aria-hidden="true"
                          />
                          {tipo.texto}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{m.descripcion}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(m.creado_en).toLocaleDateString('es-PE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard titulo="Acciones rápidas" icono="tabler:bolt">
          <div className="flex flex-col gap-2">
            {accesos.map((a) => (
              <Link
                key={a.a}
                to={a.a}
                className={`transition-ui group flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
                  a.destacado
                    ? 'border-transparent bg-brand-strong text-brand-foreground hover:brightness-110'
                    : 'border-ld hover:border-primary/40 hover:bg-lightprimary'
                }`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    a.destacado ? 'bg-white/20' : 'bg-muted group-hover:bg-card'
                  }`}
                >
                  <Icon icon={a.icono} width={18} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.titulo}</span>
                <Icon icon="tabler:chevron-right" width={16} className="shrink-0 opacity-60" />
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default Dashboard;
