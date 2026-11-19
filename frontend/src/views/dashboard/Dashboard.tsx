import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Cifra from 'src/components/shared/Cifra';
import SectionCard from 'src/components/shared/SectionCard';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
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
import { puedeVerUrl } from 'src/lib/permisos';
import { useMisModulos } from 'src/lib/modulos';
import { fecha, soles } from 'src/lib/formato';

const TIPO_PUNTO: Record<string, { texto: string; color: string }> = {
  activacion: { texto: 'Activación', color: 'var(--success)' },
  corte: { texto: 'Corte', color: 'var(--error)' },
  pago: { texto: 'Pago', color: 'var(--brand)' },
};

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

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
    contarClientesPorEstado('pendiente_aprobacion').then(setPorAprobar).catch(() => {});
    Promise.all([contarClientesPorEstado('aprobado'), contarClientesPorEstado('no_instalado')])
      .then(([a, b]) => setPorInstalar(a + b))
      .catch(() => {});
    contarAveriasAbiertas().then(setAverias).catch(() => {});
    contarRetirosPendientes().then(setRetiros).catch(() => {});
  }, []);

  // Lo que ve cada rol sale del menú: si a este rol se le esconde "Pagos", el
  // dashboard tampoco le muestra importes ni lo enlaza ahí.
  useMisModulos();
  const rol = usuario?.rol;
  const vePagos = puedeVerUrl('/pagos', rol);
  const veGastos = puedeVerUrl('/gastos', rol);
  const veClientes = puedeVerUrl('/clientes', rol);
  const veZonas = puedeVerUrl('/zonas', rol);
  const veAverias = puedeVerUrl('/averias', rol);

  // El histórico de ingresos y gastos es de gerencia: solo se pide cuando el
  // rol puede verlo, para no provocar un 403 silencioso en cada carga.
  useEffect(() => {
    if (!veGastos) return;
    getIngresosMensual().then(setMeses).catch(() => {});
  }, [veGastos]);

  const deltaIngresos =
    stats && stats.ingresos_mes_anterior > 0
      ? ((stats.ingresos_mes_actual - stats.ingresos_mes_anterior) / stats.ingresos_mes_anterior) * 100
      : null;

  const hoyTexto = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const hoy = hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1);

  // "Otros" agrupa lo que no es activo, pendiente ni suspendido.
  const otros = stats
    ? Math.max(0, stats.total_clientes - stats.clientes_activos - stats.clientes_suspendidos - (porAprobar ?? 0))
    : 0;

  /** Lo que alguien tiene que atender hoy, de lo más urgente a lo menos. */
  const pendientes = [
    { texto: 'Averías abiertas', cuenta: averias, icono: 'tabler:alert-triangle', a: '/averias', ve: veAverias, urgente: true },
    { texto: 'Clientes por aprobar', cuenta: porAprobar, icono: 'tabler:user-check', a: '/clientes/pendientes', ve: puedeVerUrl('/clientes/pendientes', rol) },
    { texto: 'Instalaciones por hacer', cuenta: porInstalar, icono: 'tabler:tool', a: '/clientes/fibra', ve: veClientes },
    { texto: 'Retiros de equipo', cuenta: retiros, icono: 'tabler:package-export', a: '/ordenes-retiro', ve: puedeVerUrl('/ordenes-retiro', rol) },
    { texto: 'Pagos pendientes', cuenta: stats?.pagos_pendientes ?? null, icono: 'tabler:receipt', a: '/pagos', ve: vePagos },
  ].filter((p) => p.ve);
  const cargandoPendientes = pendientes.some((p) => p.cuenta === null);
  const conTrabajo = pendientes.filter((p) => (p.cuenta ?? 0) > 0);

  const nombre = usuario?.nombre.split(/\s+/)[0];
  const conGrafico = veGastos && meses.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Encabezado ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{hoy}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight">
            {saludo()}{nombre ? `, ${nombre}` : ''}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {vePagos && (
            <Button asChild variant="outline">
              <Link to="/pagos">
                <Icon icon="tabler:cash" width={18} />
                Registrar pago
              </Link>
            </Button>
          )}
          {veClientes && (
            <Button asChild>
              <Link to="/clientes/fibra">
                <Icon icon="tabler:user-plus" width={18} />
                Registrar cliente
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Resumen: una sola franja, separada por líneas ────────────────── */}
      <CardBox className="overflow-hidden !p-0">
        {/* Las líneas salen del hueco de 1 px entre celdas: así se acomodan
            solas en dos o cuatro columnas. */}
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Cifra
            etiqueta="Clientes activos"
            valor={stats ? stats.clientes_activos : '—'}
            nota={stats ? `de ${stats.total_clientes} registrados` : undefined}
            to={veClientes ? '/clientes/fibra' : undefined}
          />
          {vePagos ? (
            <Cifra
              etiqueta="Cobrado este mes"
              valor={stats ? soles(stats.ingresos_mes_actual, true) : '—'}
              delta={deltaIngresos}
              nota={stats ? `${soles(stats.ingresos_mes_anterior, true)} el mes pasado` : undefined}
              to="/pagos"
            />
          ) : (
            <Cifra etiqueta="Suspendidos" valor={stats ? stats.clientes_suspendidos : '—'} to={veClientes ? '/clientes/fibra' : undefined} />
          )}
          <Cifra
            etiqueta="Por instalar"
            valor={porInstalar ?? '—'}
            nota="Aprobados, sin instalación"
            to={veClientes ? '/clientes/fibra' : undefined}
          />
          <Cifra
            etiqueta="Zonas con cobertura"
            valor={stats ? stats.total_zonas : '—'}
            to={veZonas ? '/zonas' : undefined}
          />
        </div>
      </CardBox>

      {/* ── Gráfico + por atender ────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">
        {conGrafico && (
          <CardBox className="p-5 md:p-6 xl:col-span-2">
            <FinanzasChart datos={meses} />
          </CardBox>
        )}

        <SectionCard
          titulo="Por atender"
          descripcion={cargandoPendientes ? undefined : conTrabajo.length ? 'Lo que espera a alguien del equipo' : 'Todo al día'}
          sinRelleno
          className={conGrafico ? '' : 'xl:col-span-3'}
        >
          {cargandoPendientes ? (
            <LoadingState filas={4} />
          ) : (
            <ul className="divide-y divide-border border-t border-ld">
              {pendientes.map((p) => {
                const n = p.cuenta ?? 0;
                return (
                  <li key={p.a}>
                    <Link
                      to={p.a}
                      className="flex min-h-12 items-center gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-surface-2"
                    >
                      <Icon icon={p.icono} width={18} className="shrink-0 text-muted-foreground" />
                      <span className={`min-w-0 flex-1 truncate text-sm ${n ? 'font-medium' : 'text-muted-foreground'}`}>
                        {p.texto}
                      </span>
                      <span
                        className={`min-w-7 rounded-md px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums ${
                          !n ? 'text-muted-foreground' : p.urgente ? 'bg-lightwarning text-warning-text' : 'bg-muted text-foreground'
                        }`}
                      >
                        {n}
                      </span>
                      <Icon icon="tabler:chevron-right" width={16} className="shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ── Movimientos + estado de clientes ─────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          titulo="Últimos movimientos"
          descripcion="Activaciones, cortes y pagos"
          className="xl:col-span-2"
          sinRelleno
          extra={
            veClientes && (
              <Link to="/clientes/fibra" className="text-sm font-medium text-primary-text hover:underline">
                Ver clientes
              </Link>
            )
          }
        >
          {movimientos === null ? (
            <LoadingState filas={4} />
          ) : movimientos.length === 0 ? (
            <EmptyState
              icono="tabler:history"
              titulo="Todavía no hay movimientos"
              descripcion="Las activaciones, cortes y pagos aparecerán aquí en cuanto ocurran."
            />
          ) : (
            <ul className="divide-y divide-border border-t border-ld">
              {movimientos.map((m) => {
                const tipo = TIPO_PUNTO[m.tipo] ?? { texto: m.tipo, color: 'var(--muted-foreground)' };
                return (
                  <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tipo.color }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{m.cliente_nombre}</span>
                        <span className="text-muted-foreground"> · {tipo.texto}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{m.descripcion}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fecha(m.creado_en)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard titulo="Estado de clientes" descripcion={stats ? `${stats.total_clientes} en el padrón` : undefined}>
          {stats ? (
            <EstadoClientesDonut
              total={stats.total_clientes}
              segmentos={[
                { etiqueta: 'Activos', valor: stats.clientes_activos, color: 'var(--success)' },
                { etiqueta: 'Por aprobar', valor: porAprobar ?? 0, color: 'var(--warning)' },
                { etiqueta: 'Suspendidos', valor: stats.clientes_suspendidos, color: 'var(--error)' },
                { etiqueta: 'Otros', valor: otros, color: 'var(--muted-foreground)' },
              ]}
            />
          ) : (
            <LoadingState filas={3} className="p-0" />
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default Dashboard;
