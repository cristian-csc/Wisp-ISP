import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import SectionCard from 'src/components/shared/SectionCard';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import {
  getMe,
  getMiActividad,
  updateMiPerfil,
  cambiarPassword,
  type MiActividad,
  type Usuario,
} from 'src/lib/api';
import { nombreDeRol } from 'src/lib/permisos';
import { useMisModulos } from 'src/lib/modulos';
import { fecha, fechaHora, soles } from 'src/lib/formato';

function antiguedad(fechaIngreso: string | null): string | null {
  if (!fechaIngreso) return null;
  const inicio = new Date(`${fechaIngreso}T00:00:00`);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
  if (hoy.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 1) return 'menos de 1 mes';
  if (meses < 12) return `${meses} mes${meses !== 1 ? 'es' : ''}`;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  return `${anios} año${anios !== 1 ? 's' : ''}${resto ? ` y ${resto} mes${resto !== 1 ? 'es' : ''}` : ''}`;
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

type Cifra = { etiqueta: string; valor: string | number; nota?: string };

/** Qué números le importan a cada tipo de cuenta: un técnico mide
 *  instalaciones; una cajera, cobros. */
function cifrasDelRol(rol: string, a: MiActividad): Cifra[] {
  const cobros: Cifra = { etiqueta: 'Cobrado este mes', valor: soles(a.este_mes.monto_cobrado), nota: `${a.este_mes.pagos_cobrados} pagos` };
  switch (rol) {
    case 'tecnico':
      return [
        { etiqueta: 'Instalaciones este mes', valor: a.este_mes.instalaciones, nota: `${a.total.instalaciones} en total` },
        { etiqueta: 'Averías resueltas', valor: a.total.averias_resueltas },
        { etiqueta: 'Retiros completados', valor: a.total.retiros_completados },
        { etiqueta: 'Clientes registrados', valor: a.total.clientes_registrados },
      ];
    case 'vendedor_campo':
      return [
        { etiqueta: 'Registrados este mes', valor: a.este_mes.clientes_registrados, nota: `${a.total.clientes_registrados} en total` },
        { etiqueta: 'Instalados de los tuyos', valor: a.total.instalaciones },
      ];
    case 'atencion_cliente':
      return [cobros, { etiqueta: 'Total cobrado', valor: soles(a.total.monto_cobrado), nota: `${a.total.pagos_cobrados} pagos` }, { etiqueta: 'Clientes registrados', valor: a.total.clientes_registrados }];
    default:
      return [
        { etiqueta: 'Clientes registrados', valor: a.total.clientes_registrados, nota: `${a.este_mes.clientes_registrados} este mes` },
        { etiqueta: 'Aprobaciones', valor: a.total.aprobaciones },
        cobros,
        { etiqueta: 'Averías resueltas', valor: a.total.averias_resueltas },
      ];
  }
}

const TIPO_EVENTO: Record<string, string> = {
  activacion: 'Activación',
  corte: 'Corte',
  pago: 'Pago',
  cambio_plan: 'Cambio de plan',
  cambio_onu: 'Cambio de equipo',
  compromiso_pago: 'Compromiso de pago',
  nota: 'Nota',
};

/** Fortaleza de la contraseña: reglas que la persona entiende, no una cifra. */
function reglasClave(clave: string, confirmar: string) {
  return [
    { texto: 'Al menos 8 caracteres', ok: clave.length >= 8 },
    { texto: 'Letras y números', ok: /[a-zA-Z]/.test(clave) && /\d/.test(clave) },
    { texto: 'Las dos coinciden', ok: !!clave && clave === confirmar },
  ];
}

const CampoClave = ({ id, etiqueta, valor, onCambiar, autoComplete }: { id: string; etiqueta: string; valor: string; onCambiar: (v: string) => void; autoComplete: string }) => {
  const [ver, setVer] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{etiqueta}</label>
      <div className="relative">
        <Input id={id} type={ver ? 'text' : 'password'} value={valor} autoComplete={autoComplete} onChange={(e) => onCambiar(e.target.value)} className="pe-11" />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute end-0 top-0 grid size-10 cursor-pointer place-items-center text-muted-foreground hover:text-foreground"
        >
          <Icon icon={ver ? 'tabler:eye-off' : 'tabler:eye'} width={18} />
        </button>
      </div>
    </div>
  );
};

const Perfil = () => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [actividad, setActividad] = useState<MiActividad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveConfirmar, setClaveConfirmar] = useState('');
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const campoTelefono = useRef<HTMLInputElement>(null);
  const campoDireccion = useRef<HTMLInputElement>(null);
  const { modulos } = useMisModulos();

  function recargar() {
    getMe()
      .then((u) => {
        setUsuario(u);
        setTelefono(u.telefono ?? '');
        setDireccion(u.direccion ?? '');
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    recargar();
    getMiActividad().then(setActividad).catch(() => setActividad(null));
  }, []);

  const grupos = useMemo(() => {
    const m = new Map<string, string[]>();
    modulos.forEach((x) => m.set(x.grupo, [...(m.get(x.grupo) ?? []), x.nombre]));
    return [...m.entries()];
  }, [modulos]);

  if (cargando) return <LoadingState filas={5} />;
  if (!usuario) return <EmptyState icono="tabler:user-off" titulo="No se pudo cargar tu perfil" descripcion="Revisa tu conexión y vuelve a abrir esta página." />;

  const cambioDatos = telefono !== (usuario.telefono ?? '') || direccion !== (usuario.direccion ?? '');
  const tiempo = antiguedad(usuario.fecha_ingreso);
  const reglas = reglasClave(claveNueva, claveConfirmar);
  const claveLista = !!claveActual && reglas.every((r) => r.ok);

  // Qué le falta a la ficha y quién puede completarlo.
  const pendientes = [
    { texto: 'Teléfono', hecho: !!usuario.telefono, tuyo: true, ir: () => campoTelefono.current?.focus() },
    { texto: 'Dirección', hecho: !!usuario.direccion, tuyo: true, ir: () => campoDireccion.current?.focus() },
    { texto: 'DNI', hecho: !!usuario.dni, tuyo: false },
    { texto: 'Fecha de ingreso', hecho: !!usuario.fecha_ingreso, tuyo: false },
  ];
  const completos = pendientes.filter((p) => p.hecho).length;
  const porcentaje = Math.round((completos / pendientes.length) * 100);

  async function guardarDatos(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await updateMiPerfil({ telefono: telefono.trim() || undefined, direccion: direccion.trim() || undefined });
      toast.success('Datos guardados');
      recargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se guardaron los datos. Inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarClave(e: FormEvent) {
    e.preventDefault();
    if (!claveLista) return;
    setCambiandoClave(true);
    try {
      await cambiarPassword(claveActual, claveNueva);
      toast.success('Contraseña cambiada', { description: 'Úsala la próxima vez que entres.' });
      setClaveActual('');
      setClaveNueva('');
      setClaveConfirmar('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se cambió la contraseña.');
    } finally {
      setCambiandoClave(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Identidad ────────────────────────────────────────────────────── */}
      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <span className="grid size-[72px] shrink-0 place-items-center rounded-2xl bg-black text-2xl font-semibold text-brand">
            {iniciales(usuario.nombre)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-semibold leading-tight">{usuario.nombre}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-lightbrand px-2 py-0.5 text-xs font-medium text-brand-strong dark:text-brand">
                {nombreDeRol(usuario)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon icon="tabler:at" width={15} />
                {usuario.email}
              </span>
              {tiempo && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon icon="tabler:calendar" width={15} />
                  {tiempo} en WISP
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Lo que hizo esta persona: la parte que da sentido a la página. */}
        {actividad && (
          <div className="grid grid-cols-2 gap-px border-t border-ld bg-border lg:grid-cols-4 [&>*]:bg-card">
            {cifrasDelRol(usuario.rol, actividad).map((c) => (
              <div key={c.etiqueta} className="px-6 py-4">
                <p className="text-sm text-muted-foreground">{c.etiqueta}</p>
                <p className="mt-1 text-2xl font-semibold leading-none tracking-tight">{c.valor}</p>
                {c.nota && <p className="mt-1 text-xs text-muted-foreground">{c.nota}</p>}
              </div>
            ))}
          </div>
        )}
      </CardBox>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ── Ficha ──────────────────────────────────────────────────── */}
          <SectionCard
            titulo="Tu ficha"
            descripcion={completos === pendientes.length ? 'Completa' : `Completa al ${porcentaje} %`}
            sinRelleno
          >
            <div className="border-t border-ld px-5 pb-5 pt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Ficha completa">
                <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${porcentaje}%` }} />
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {pendientes.map((p) => (
                  <li key={p.texto} className="flex min-h-11 items-center gap-2.5 rounded-lg border border-ld px-3 py-2 text-sm">
                    <Icon
                      icon={p.hecho ? 'tabler:circle-check-filled' : 'tabler:circle-dashed'}
                      width={18}
                      className={p.hecho ? 'shrink-0 text-success' : 'shrink-0 text-muted-foreground'}
                    />
                    <span className={`min-w-0 flex-1 ${p.hecho ? '' : 'font-medium'}`}>{p.texto}</span>
                    {!p.hecho &&
                      (p.tuyo ? (
                        <button type="button" onClick={p.ir} className="cursor-pointer text-xs font-medium text-primary-text hover:underline">
                          Completar
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Lo registra el administrador</span>
                      ))}
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={guardarDatos} className="grid gap-4 border-t border-ld p-5 sm:grid-cols-2">
              <div>
                <label htmlFor="perfilTel" className="mb-1.5 block text-sm font-medium">Teléfono</label>
                <Input id="perfilTel" ref={campoTelefono} inputMode="tel" autoComplete="tel" placeholder="Ej. 951 234 567" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
              <div>
                <label htmlFor="perfilDir" className="mb-1.5 block text-sm font-medium">Dirección</label>
                <Input id="perfilDir" ref={campoDireccion} autoComplete="street-address" placeholder="Calle, número y barrio" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  DNI {usuario.dni ?? 'sin registrar'}
                  {usuario.fecha_ingreso ? `, ingresó el ${fecha(usuario.fecha_ingreso)}` : ''}. Estos dos datos los corrige el administrador.
                </p>
                <Button type="submit" disabled={!cambioDatos || guardando}>
                  {guardando ? 'Guardando…' : 'Guardar datos'}
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* ── Actividad ──────────────────────────────────────────────── */}
          <SectionCard titulo="Tu actividad reciente" descripcion="Lo último que quedó a tu nombre en las fichas de clientes" sinRelleno>
            {actividad === null ? (
              <LoadingState filas={3} />
            ) : actividad.recientes.length === 0 ? (
              <div className="border-t border-ld">
                <EmptyState icono="tabler:history" titulo="Todavía no hay movimientos a tu nombre" descripcion="Cuando registres, instales o cobres, aparecerá aquí." />
              </div>
            ) : (
              <ul className="divide-y divide-border border-t border-ld">
                {actividad.recientes.map((r, i) => (
                  <li key={i}>
                    <Link to={`/clientes/${r.cliente_id}`} className="flex items-start gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-2">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">
                          <span className="font-medium">{r.cliente_nombre}</span>
                          <span className="text-muted-foreground"> · {TIPO_EVENTO[r.tipo] ?? r.tipo}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{r.descripcion}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fechaHora(r.creado_en)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* ── Seguridad ──────────────────────────────────────────────── */}
          <SectionCard titulo="Contraseña" descripcion="Cámbiala si alguien más pudo verla" sinRelleno>
            <form onSubmit={cambiarClave} className="flex flex-col gap-4 border-t border-ld p-5">
              <CampoClave id="pwActual" etiqueta="Contraseña actual" valor={claveActual} onCambiar={setClaveActual} autoComplete="current-password" />
              <CampoClave id="pwNueva" etiqueta="Contraseña nueva" valor={claveNueva} onCambiar={setClaveNueva} autoComplete="new-password" />
              <CampoClave id="pwConfirmar" etiqueta="Repite la contraseña nueva" valor={claveConfirmar} onCambiar={setClaveConfirmar} autoComplete="new-password" />
              <ul className="flex flex-col gap-1.5" aria-live="polite">
                {reglas.map((r) => (
                  <li key={r.texto} className={`flex items-center gap-2 text-xs ${r.ok ? 'text-success-text' : 'text-muted-foreground'}`}>
                    <Icon icon={r.ok ? 'tabler:check' : 'tabler:point'} width={15} className="shrink-0" />
                    {r.texto}
                  </li>
                ))}
              </ul>
              <Button type="submit" disabled={!claveLista || cambiandoClave}>
                {cambiandoClave ? 'Cambiando…' : 'Cambiar contraseña'}
              </Button>
            </form>
          </SectionCard>

          {/* ── Acceso ─────────────────────────────────────────────────── */}
          <SectionCard titulo="Lo que puedes usar" descripcion={`${modulos.length} módulos con tu rol`} sinRelleno>
            <div className="flex flex-col gap-3 border-t border-ld p-5">
              {grupos.map(([grupo, nombres]) => (
                <div key={grupo}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{grupo}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nombres.map((n) => (
                      <span key={n} className="rounded-md bg-muted px-2 py-1 text-xs">{n}</span>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Si necesitas algo que no está aquí, pídeselo al administrador.</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default Perfil;
