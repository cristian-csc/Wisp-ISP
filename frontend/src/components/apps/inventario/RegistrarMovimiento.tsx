import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { FormActions, FormCallout, FormDialog, FormField } from 'src/components/shared/form';
import OpcionMarcable from 'src/components/shared/OpcionMarcable';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { ROL_LABEL } from 'src/lib/permisos';
import {
  cantidadConUnidad,
  escanear,
  listActivos,
  palabraUnidad,
  registrarMovimientos,
  type Activo,
  type Articulo,
  type NuevoMovimiento,
  type PersonaConMaterial,
} from 'src/lib/inventario';
import type { Etiqueta } from 'src/lib/etiquetas';
import ImprimirEtiquetas from './ImprimirEtiquetas';
import BuscarCliente, { type ClienteElegido } from 'src/components/shared/BuscarCliente';

type Tipo = NuevoMovimiento['tipo'];

const TIPOS: { valor: Tipo; titulo: string; descripcion: string; icono: string; boton: string }[] = [
  { valor: 'asignacion', titulo: 'Entregar al personal', descripcion: 'Sale del almacén y queda a cargo de un técnico o vendedora.', icono: 'tabler:user-share', boton: 'Registrar entrega' },
  { valor: 'entrada', titulo: 'Entrada al almacén', descripcion: 'Llegó material: compra, reposición o donación.', icono: 'tabler:arrow-bar-to-down', boton: 'Registrar entrada' },
  { valor: 'devolucion', titulo: 'Devolución', descripcion: 'El personal devuelve lo que no usó.', icono: 'tabler:arrow-back-up', boton: 'Registrar devolución' },
  { valor: 'consumo', titulo: 'Consumo en trabajo', descripcion: 'El personal lo gastó en una instalación o avería.', icono: 'tabler:tool', boton: 'Registrar consumo' },
  { valor: 'salida', titulo: 'Salida o baja', descripcion: 'Sale del almacén sin volver: venta, daño o pérdida.', icono: 'tabler:arrow-bar-up', boton: 'Registrar salida' },
];

const CON_PERSONA: Tipo[] = ['asignacion', 'devolucion', 'consumo'];

type Linea = { clave: number; articulo_id: string; cantidad: string; piezas: Activo[]; series: string };

export interface InicialMovimiento {
  tipo?: Tipo;
  persona_id?: number;
  articulo_id?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articulos: Articulo[];
  personal: PersonaConMaterial[];
  inicial?: InicialMovimiento;
  onRegistrado: () => void;
}

let siguienteClave = 1;
const lineaVacia = (articulo_id = ''): Linea => ({ clave: siguienteClave++, articulo_id, cantidad: '', piezas: [], series: '' });

const seriesDe = (texto: string) => texto.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

type Aviso = { tono: 'ok' | 'error'; texto: string } | null;

/** Registra entradas, salidas y entregas al personal, de uno o varios
 *  materiales a la vez. Con el lector de código de barras basta pasar la
 *  etiqueta: la pieza o el material se agrega solo. */
const RegistrarMovimiento = ({ open, onOpenChange, articulos, personal, inicial, onRegistrado }: Props) => {
  const { user } = useCurrentUser();
  const [tipo, setTipo] = useState<Tipo>('asignacion');
  const [personaId, setPersonaId] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [motivo, setMotivo] = useState('');
  const [documento, setDocumento] = useState('');
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hora, setHora] = useState(() => new Date());
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [buscando, setBuscando] = useState(false);
  const [piezasDe, setPiezasDe] = useState<Map<number, Activo[]>>(new Map());
  const [porImprimir, setPorImprimir] = useState<Etiqueta[] | null>(null);
  const lector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTipo(inicial?.tipo ?? 'asignacion');
    setPersonaId(inicial?.persona_id ? String(inicial.persona_id) : '');
    setLineas([lineaVacia(inicial?.articulo_id ? String(inicial.articulo_id) : '')]);
    setMotivo('');
    setDocumento('');
    setCliente(null);
    setError(null);
    setCodigo('');
    setAviso(null);
    setPiezasDe(new Map());
    setHora(new Date());
    const reloj = setInterval(() => setHora(new Date()), 30_000);
    return () => clearInterval(reloj);
  }, [open, inicial]);

  const conPersona = CON_PERSONA.includes(tipo);
  const persona = personal.find((p) => String(p.persona.id) === personaId) ?? null;
  const enMano = useMemo(() => new Map((persona?.material ?? []).map((m) => [m.articulo_id, m.cantidad])), [persona]);
  const porId = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);
  const desdePersona = tipo === 'devolucion' || tipo === 'consumo';

  // Las piezas de cada material con etiqueta se traen al elegirlo.
  const conPiezas = lineas
    .map((l) => porId.get(Number(l.articulo_id)))
    .filter((a): a is Articulo => !!a && a.controla_por_unidad && !piezasDe.has(a.id));
  useEffect(() => {
    for (const a of conPiezas) {
      listActivos(a.id)
        .then((ps) => setPiezasDe((m) => new Map(m).set(a.id, ps)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conPiezas.map((a) => a.id).join()]);

  /** ¿Esta pieza puede entrar en este movimiento? Devuelve el motivo si no. */
  function problemaDePieza(p: Activo): string | null {
    if (tipo === 'entrada') return `${p.codigo} ya está registrada: la entrada crea piezas nuevas`;
    if (tipo === 'asignacion' || tipo === 'salida') {
      if (p.estado !== 'almacen') return `${p.codigo} no está en el almacén${p.persona ? `: la tiene ${p.persona.nombre}` : ''}`;
      return null;
    }
    if (p.estado !== 'asignado') return `${p.codigo} no está a cargo de nadie`;
    if (persona && p.persona?.id !== persona.persona.id) return `${p.codigo} la tiene ${p.persona?.nombre}, no ${persona.persona.nombre}`;
    return null;
  }

  const opciones = useMemo(() => {
    const activos = articulos.filter((a) => a.activo);
    if (desdePersona) return activos.filter((a) => (enMano.get(a.id) ?? 0) > 0);
    return activos;
  }, [articulos, desdePersona, enMano]);

  function disponible(a: Articulo): number | null {
    if (tipo === 'entrada') return null;
    if (desdePersona) return enMano.get(a.id) ?? 0;
    return a.stock;
  }

  const revision = lineas.map((l) => {
    const a = porId.get(Number(l.articulo_id));
    const porPieza = !!a?.controla_por_unidad;
    const series = seriesDe(l.series);
    const n = porPieza ? (tipo === 'entrada' ? Number(l.cantidad) || series.length : l.piezas.length) : Number(l.cantidad);
    const tope = a ? disponible(a) : null;
    const valida = !!a && Number.isInteger(n) && n > 0 && (!porPieza || tipo !== 'entrada' || n <= 200);
    const excede = valida && tope != null && n > tope;
    const seriesDeMas = porPieza && tipo === 'entrada' && series.length > n;
    return { linea: l, articulo: a, porPieza, n, valida: valida && !seriesDeMas, tope, excede, series, seriesDeMas };
  });
  const elegidos = lineas.map((l) => l.articulo_id).filter(Boolean);
  const repetido = new Set(elegidos).size !== elegidos.length;
  const faltaMotivo = tipo === 'salida' && !motivo.trim();
  const faltaPersona = conPersona && !persona;
  const listo = !faltaPersona && !faltaMotivo && !repetido && revision.every((r) => r.valida && !r.excede);

  function cambiarTipo(t: Tipo) {
    setTipo(t);
    setError(null);
    setAviso(null);
    // Las piezas elegidas dependen del movimiento: al cambiarlo se vacían.
    setLineas((ls) => ls.map((l) => ({ ...l, piezas: [] })));
  }

  function actualizar(clave: number, cambio: Partial<Linea>) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  /** Pone el material en una línea: la que ya lo tiene, una vacía o una nueva. */
  function lineaPara(ls: Linea[], articuloId: number): [Linea[], number] {
    const existente = ls.find((l) => l.articulo_id === String(articuloId));
    if (existente) return [ls, existente.clave];
    const vacia = ls.find((l) => !l.articulo_id);
    if (vacia) return [ls.map((l) => (l === vacia ? { ...l, articulo_id: String(articuloId) } : l)), vacia.clave];
    const nueva = lineaVacia(String(articuloId));
    return [[...ls, nueva], nueva.clave];
  }

  function agregarPieza(p: Activo) {
    setLineas((ls) => {
      const [con, clave] = lineaPara(ls, p.articulo_id);
      return con.map((l) => (l.clave === clave && !l.piezas.some((x) => x.id === p.id) ? { ...l, piezas: [...l.piezas, p] } : l));
    });
  }

  async function leerCodigo() {
    const texto = codigo.trim();
    if (!texto || buscando) return;
    setBuscando(true);
    setAviso(null);
    try {
      const r = await escanear(texto);
      if (r.tipo === 'activo') {
        const p = r.activo;
        if (lineas.some((l) => l.piezas.some((x) => x.id === p.id))) {
          setAviso({ tono: 'error', texto: `${p.codigo} ya está en la lista` });
        } else {
          // Al devolver, la etiqueta dice de quién es: se elige sola la persona.
          const problema = problemaDePieza(p);
          if (!problema && desdePersona && !persona && p.persona) setPersonaId(String(p.persona.id));
          if (problema) {
            setAviso({ tono: 'error', texto: problema });
          } else {
            agregarPieza(p);
            setAviso({ tono: 'ok', texto: `Agregada ${p.codigo} · ${p.articulo_nombre}${p.numero_serie ? ` · serie ${p.numero_serie}` : ''}` });
          }
        }
      } else {
        const a = r.articulo;
        if (a.controla_por_unidad && tipo !== 'entrada') {
          setAviso({ tono: 'error', texto: `«${a.nombre}» lleva etiqueta por pieza: pasa la etiqueta de la pieza, no la del material` });
        } else {
          setLineas((ls) => {
            const [con, clave] = lineaPara(ls, a.id);
            return con.map((l) => (l.clave === clave ? { ...l, cantidad: String((Number(l.cantidad) || 0) + 1) } : l));
          });
          setAviso({ tono: 'ok', texto: `+1 ${a.unidad} de ${a.nombre}` });
        }
      }
    } catch (err: any) {
      setAviso({ tono: 'error', texto: err?.response?.data?.detail ?? 'No se pudo leer el código' });
    } finally {
      setCodigo('');
      setBuscando(false);
      lector.current?.focus();
    }
  }

  function alLeer(e: KeyboardEvent<HTMLInputElement>) {
    // El lector USB escribe el código y termina con Enter.
    if (e.key === 'Enter') {
      e.preventDefault();
      leerCodigo();
    }
  }

  async function guardar() {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    try {
      const hechos = await registrarMovimientos({
        tipo,
        persona_id: conPersona ? Number(personaId) : null,
        cliente_id: (tipo === 'consumo' || tipo === 'salida') && cliente ? cliente.id : null,
        lineas: revision.map((r) =>
          r.porPieza
            ? tipo === 'entrada'
              ? { articulo_id: r.articulo!.id, cantidad: r.n, numeros_serie: r.series }
              : { articulo_id: r.articulo!.id, activo_ids: r.linea.piezas.map((p) => p.id) }
            : { articulo_id: r.articulo!.id, cantidad: r.n },
        ),
        motivo: motivo.trim() || undefined,
        documento: documento.trim() || undefined,
      });
      const t = TIPOS.find((x) => x.valor === tipo)!;
      toast.success(
        hechos.length === 1
          ? `${t.titulo}: ${cantidadConUnidad(hechos[0].cantidad, hechos[0])} de ${hechos[0].articulo_nombre}`
          : `${t.titulo}: ${hechos.length} movimientos registrados`,
      );
      onOpenChange(false);
      onRegistrado();
      // Piezas nuevas: sus etiquetas quedan listas para imprimir.
      const nuevas = hechos.filter((m) => m.activo_codigo && tipo === 'entrada');
      if (nuevas.length) setPorImprimir(nuevas.map((m) => ({ codigo: m.activo_codigo!, titulo: m.articulo_nombre })));
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar el movimiento');
    } finally {
      setGuardando(false);
    }
  }

  const tipoActual = TIPOS.find((t) => t.valor === tipo)!;
  const horaTexto = hora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const pie = (
    <>
      Se registra hoy a las <span className="font-medium tabular-nums text-foreground">{horaTexto}</span> a nombre de{' '}
      <span className="font-medium text-foreground">{user?.nombre ?? '…'}</span>
    </>
  );

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Registrar movimiento"
        subtitle="Cada movimiento queda con quién lo registró y a qué hora"
        icon="tabler:arrows-exchange"
        size="xl"
        footer={
          <FormActions
            onCancel={() => onOpenChange(false)}
            submitLabel={tipoActual.boton}
            submitIcon={tipoActual.icono}
            onSubmit={guardar}
            submitting={guardando}
            disabled={!listo}
          >
            <p className="hidden text-xs text-muted-foreground sm:block">{pie}</p>
          </FormActions>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold">¿Qué pasó con el material?</h3>
            <div role="radiogroup" aria-label="Tipo de movimiento" className="grid gap-2 sm:grid-cols-2">
              {TIPOS.map((t) => (
                <OpcionMarcable
                  key={t.valor}
                  tipo="unica"
                  icono={t.icono}
                  titulo={t.titulo}
                  descripcion={t.descripcion}
                  marcada={tipo === t.valor}
                  onCambiar={() => cambiarTipo(t.valor)}
                />
              ))}
            </div>
          </section>

          {conPersona && (
            <FormField
              label={tipo === 'asignacion' ? '¿A quién se le entrega?' : tipo === 'devolucion' ? '¿Quién devuelve?' : '¿Quién lo usó?'}
              icon="tabler:user"
              required
            >
              <Select
                value={personaId}
                onValueChange={(v) => {
                  setPersonaId(v);
                  setError(null);
                  if (desdePersona) setLineas((ls) => ls.map((l) => ({ ...l, piezas: [] })));
                }}
              >
                <SelectTrigger className="w-full" aria-label="Persona">
                  <SelectValue placeholder="Elige un técnico o vendedora" />
                </SelectTrigger>
                <SelectContent>
                  {personal
                    .filter((p) => p.persona.activo || p.unidades > 0)
                    .map((p) => (
                      <SelectItem key={p.persona.id} value={String(p.persona.id)}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>
                            {p.persona.nombre}
                            <span className="text-muted-foreground"> · {ROL_LABEL[p.persona.rol] ?? p.persona.rol}</span>
                          </span>
                          {p.unidades > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              tiene {p.articulos} material{p.articulos === 1 ? '' : 'es'}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold">Materiales</h3>

            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface-2 p-3">
              <label htmlFor="mov-lector" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon icon="tabler:barcode" width={16} />
                Pasa el lector por la etiqueta, o escribe el código y presiona Enter
              </label>
              <div className="relative mt-2">
                <Input
                  id="mov-lector"
                  ref={lector}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  onKeyDown={alLeer}
                  placeholder="ACT-000123 o código del material"
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-10 font-mono uppercase"
                />
                {buscando && (
                  <Icon icon="tabler:loader-2" width={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <p
                aria-live="polite"
                className={`mt-2 min-h-4 text-xs ${aviso?.tono === 'error' ? 'font-medium text-error-text' : 'text-success-text'}`}
              >
                {aviso && (
                  <>
                    <Icon icon={aviso.tono === 'ok' ? 'tabler:circle-check' : 'tabler:alert-circle'} width={14} className="me-1 inline align-[-2px]" />
                    {aviso.texto}
                  </>
                )}
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {revision.map(({ linea, articulo, porPieza, n, valida, tope, excede, series, seriesDeMas }, i) => {
                const despues =
                  articulo && valida && !excede
                    ? tipo === 'entrada' || tipo === 'devolucion'
                      ? articulo.stock + n
                      : tipo === 'consumo'
                        ? null
                        : articulo.stock - n
                    : null;
                const elegibles = porPieza
                  ? (piezasDe.get(articulo!.id) ?? []).filter((p) => !problemaDePieza(p) && !linea.piezas.some((x) => x.id === p.id))
                  : [];
                return (
                  <li key={linea.clave} className="rounded-xl border border-ld p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <Select value={linea.articulo_id} onValueChange={(v) => actualizar(linea.clave, { articulo_id: v, piezas: [], cantidad: '' })}>
                          <SelectTrigger className="w-full" aria-label={`Material ${i + 1}`}>
                            <SelectValue placeholder="Elige el material" />
                          </SelectTrigger>
                          <SelectContent>
                            {opciones.map((a) => {
                              const d = disponible(a);
                              return (
                                <SelectItem key={a.id} value={String(a.id)} disabled={d === 0}>
                                  <span className="flex w-full items-center justify-between gap-3">
                                    <span className="truncate">
                                      {a.nombre}
                                      <span className="font-mono text-xs text-muted-foreground"> {a.codigo}</span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                                      {a.controla_por_unidad && <Icon icon="tabler:barcode" width={14} aria-label="Por pieza" />}
                                      {d != null && <>{desdePersona ? 'tiene' : 'hay'} {d}</>}
                                    </span>
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      {(!porPieza || tipo === 'entrada') && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            aria-label={`Cantidad del material ${i + 1}`}
                            placeholder="Cantidad"
                            value={linea.cantidad}
                            onChange={(e) => actualizar(linea.clave, { cantidad: e.target.value })}
                            aria-invalid={excede || undefined}
                            className="w-full tabular-nums sm:w-28"
                          />
                          {articulo && <span className="w-16 shrink-0 text-xs text-muted-foreground">{palabraUnidad(articulo, n || 2)}</span>}
                        </div>
                      )}
                      {lineas.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar material ${i + 1}`}
                          onClick={() => setLineas((ls) => ls.filter((l) => l.clave !== linea.clave))}
                        >
                          <Icon icon="tabler:x" width={16} />
                        </Button>
                      )}
                    </div>

                    {porPieza && tipo !== 'entrada' && (
                      <div className="mt-3 flex flex-col gap-2">
                        {linea.piezas.length > 0 && (
                          <ul className="flex flex-wrap gap-1.5" aria-label="Piezas elegidas">
                            {linea.piezas.map((p) => (
                              <li key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-ld bg-card py-1 ps-2.5 pe-1 text-xs">
                                <span className="font-mono font-semibold">{p.codigo}</span>
                                {p.numero_serie && <span className="text-muted-foreground">{p.numero_serie}</span>}
                                <button
                                  type="button"
                                  aria-label={`Quitar ${p.codigo}`}
                                  className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                  onClick={() => actualizar(linea.clave, { piezas: linea.piezas.filter((x) => x.id !== p.id) })}
                                >
                                  <Icon icon="tabler:x" width={13} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {elegibles.length > 0 ? (
                          <Select
                            value=""
                            onValueChange={(v) => {
                              const p = elegibles.find((x) => String(x.id) === v);
                              if (p) agregarPieza(p);
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-80" aria-label={`Agregar pieza del material ${i + 1}`}>
                              <SelectValue placeholder={`Agregar pieza (${elegibles.length} disponible${elegibles.length === 1 ? '' : 's'})`} />
                            </SelectTrigger>
                            <SelectContent>
                              {elegibles.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  <span className="font-mono">{p.codigo}</span>
                                  {p.numero_serie && <span className="text-muted-foreground"> · {p.numero_serie}</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          linea.piezas.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              {desdePersona && !persona ? 'Elige primero a la persona, o pasa la etiqueta.' : 'No hay piezas disponibles para este movimiento.'}
                            </p>
                          )
                        )}
                      </div>
                    )}

                    {porPieza && tipo === 'entrada' && (
                      <div className="mt-3">
                        <Textarea
                          aria-label={`Números de serie del material ${i + 1}`}
                          placeholder="Números de serie, uno por línea (opcional). Se pueden escanear de la caja."
                          rows={2}
                          value={linea.series}
                          onChange={(e) => actualizar(linea.clave, { series: e.target.value })}
                          className="font-mono text-xs"
                        />
                        {seriesDeMas && <p className="mt-1 text-xs font-medium text-error-text">Hay más series ({series.length}) que piezas ({n}).</p>}
                      </div>
                    )}

                    {articulo && (
                      <p className={`mt-2 text-xs ${excede ? 'font-medium text-error-text' : 'text-muted-foreground'}`}>
                        {excede
                          ? desdePersona
                            ? `${persona?.persona.nombre} solo tiene ${cantidadConUnidad(tope ?? 0, articulo)}.`
                            : `En el almacén solo hay ${cantidadConUnidad(tope ?? 0, articulo)}.`
                          : despues != null ? (
                              <>
                                Almacén: <span className="tabular-nums">{articulo.stock}</span> →{' '}
                                <span className="font-medium tabular-nums text-foreground">{despues}</span>
                                {despues <= articulo.stock_minimo && articulo.stock_minimo > 0 && (
                                  <span className="text-warning-text"> · queda en el mínimo o por debajo ({articulo.stock_minimo})</span>
                                )}
                                {porPieza && tipo === 'entrada' && <> · se generan {n} etiqueta{n === 1 ? '' : 's'} para imprimir</>}
                              </>
                            ) : tipo === 'consumo' && persona ? (
                              `${persona.persona.nombre} tiene ${cantidadConUnidad(tope ?? 0, articulo)}; el almacén no cambia.`
                            ) : (
                              `En almacén: ${cantidadConUnidad(articulo.stock, articulo)}`
                            )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {repetido && <p className="text-xs font-medium text-error-text">Hay un material repetido: junta las cantidades en una sola línea.</p>}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, lineaVacia()])} disabled={lineas.length >= 20}>
                <Icon icon="tabler:plus" width={16} />
                Agregar otro material
              </Button>
            </div>
          </section>

          {(tipo === 'consumo' || tipo === 'salida') && (
            <FormField
              label={tipo === 'consumo' ? '¿En qué cliente se usó?' : '¿Para qué cliente? (si es una venta)'}
              icon="tabler:home"
              htmlFor="mov-cliente"
              hint={tipo === 'consumo' ? 'Opcional. Queda en el historial del material y enlaza a la ficha del cliente.' : 'Opcional.'}
            >
              <BuscarCliente id="mov-cliente" valor={cliente} onChange={setCliente} />
            </FormField>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={tipo === 'salida' ? 'Motivo' : 'Nota'}
              icon="tabler:notes"
              htmlFor="mov-motivo"
              required={tipo === 'salida'}
              wide={tipo !== 'entrada'}
            >
              <Input
                id="mov-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={255}
                placeholder={
                  tipo === 'salida'
                    ? 'Venta, se dañó, se perdió…'
                    : tipo === 'consumo'
                      ? 'Instalación de Juan Pérez, avería en Cabanillas…'
                      : tipo === 'entrada'
                        ? 'Compra a proveedor'
                        : 'Opcional'
                }
              />
            </FormField>
            {tipo === 'entrada' && (
              <FormField label="Factura o guía" icon="tabler:file-invoice" htmlFor="mov-documento">
                <Input id="mov-documento" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={60} placeholder="F001-2345" />
              </FormField>
            )}
          </div>

          <p className="text-xs text-muted-foreground sm:hidden">{pie}</p>

          {error && <FormCallout tone="error">{error}</FormCallout>}
        </div>
      </FormDialog>

      <ImprimirEtiquetas
        open={porImprimir != null}
        onOpenChange={(o) => !o && setPorImprimir(null)}
        etiquetas={porImprimir ?? []}
        titulo="Etiquetas de las piezas nuevas"
      />
    </>
  );
};

export default RegistrarMovimiento;
