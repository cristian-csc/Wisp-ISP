import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { FormActions, FormCallout, FormDialog, FormField } from 'src/components/shared/form';
import OpcionMarcable from 'src/components/shared/OpcionMarcable';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { ROL_LABEL } from 'src/lib/permisos';
import {
  cantidadConUnidad,
  palabraUnidad,
  registrarMovimientos,
  type Articulo,
  type NuevoMovimiento,
  type PersonaConMaterial,
} from 'src/lib/inventario';

type Tipo = NuevoMovimiento['tipo'];

const TIPOS: { valor: Tipo; titulo: string; descripcion: string; icono: string; boton: string }[] = [
  { valor: 'asignacion', titulo: 'Entregar al personal', descripcion: 'Sale del almacén y queda a cargo de un técnico o vendedora.', icono: 'tabler:user-share', boton: 'Registrar entrega' },
  { valor: 'entrada', titulo: 'Entrada al almacén', descripcion: 'Llegó material: compra, reposición o donación.', icono: 'tabler:arrow-bar-to-down', boton: 'Registrar entrada' },
  { valor: 'devolucion', titulo: 'Devolución', descripcion: 'El personal devuelve lo que no usó.', icono: 'tabler:arrow-back-up', boton: 'Registrar devolución' },
  { valor: 'consumo', titulo: 'Consumo en trabajo', descripcion: 'El personal lo gastó en una instalación o avería.', icono: 'tabler:tool', boton: 'Registrar consumo' },
  { valor: 'salida', titulo: 'Salida o baja', descripcion: 'Sale del almacén sin volver: venta, daño o pérdida.', icono: 'tabler:arrow-bar-up', boton: 'Registrar salida' },
];

const CON_PERSONA: Tipo[] = ['asignacion', 'devolucion', 'consumo'];

type Linea = { clave: number; articulo_id: string; cantidad: string };

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
const lineaVacia = (articulo_id = ''): Linea => ({ clave: siguienteClave++, articulo_id, cantidad: '' });

/** Registra entradas, salidas y entregas al personal, de uno o varios
 *  materiales a la vez. Dice antes de guardar cuánto queda y no deja pedir
 *  más de lo que hay. */
const RegistrarMovimiento = ({ open, onOpenChange, articulos, personal, inicial, onRegistrado }: Props) => {
  const { user } = useCurrentUser();
  const [tipo, setTipo] = useState<Tipo>('asignacion');
  const [personaId, setPersonaId] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [motivo, setMotivo] = useState('');
  const [documento, setDocumento] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hora, setHora] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setTipo(inicial?.tipo ?? 'asignacion');
    setPersonaId(inicial?.persona_id ? String(inicial.persona_id) : '');
    setLineas([lineaVacia(inicial?.articulo_id ? String(inicial.articulo_id) : '')]);
    setMotivo('');
    setDocumento('');
    setError(null);
    setHora(new Date());
    const reloj = setInterval(() => setHora(new Date()), 30_000);
    return () => clearInterval(reloj);
  }, [open, inicial]);

  const conPersona = CON_PERSONA.includes(tipo);
  const persona = personal.find((p) => String(p.persona.id) === personaId) ?? null;
  const enMano = useMemo(
    () => new Map((persona?.material ?? []).map((m) => [m.articulo_id, m.cantidad])),
    [persona],
  );
  const porId = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);
  const desdePersona = tipo === 'devolucion' || tipo === 'consumo';

  /** Qué materiales tiene sentido elegir: para devolver o consumir, solo lo
   *  que la persona tiene; para entregar o sacar, lo que hay en almacén. */
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
    const n = Number(l.cantidad);
    const valida = !!a && Number.isInteger(n) && n > 0;
    const tope = a ? disponible(a) : null;
    const excede = valida && tope != null && n > tope;
    return { linea: l, articulo: a, n, valida, tope, excede };
  });
  const elegidos = lineas.map((l) => l.articulo_id).filter(Boolean);
  const repetido = new Set(elegidos).size !== elegidos.length;
  const faltaMotivo = tipo === 'salida' && !motivo.trim();
  const faltaPersona = conPersona && !persona;
  const listo =
    !faltaPersona && !faltaMotivo && !repetido && revision.every((r) => r.valida && !r.excede);

  function cambiarTipo(t: Tipo) {
    setTipo(t);
    setError(null);
  }

  function actualizar(clave: number, cambio: Partial<Linea>) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  async function guardar() {
    if (!listo) return;
    setGuardando(true);
    setError(null);
    try {
      const hechos = await registrarMovimientos({
        tipo,
        persona_id: conPersona ? Number(personaId) : null,
        lineas: revision.map((r) => ({ articulo_id: r.articulo!.id, cantidad: r.n })),
        motivo: motivo.trim() || undefined,
        documento: documento.trim() || undefined,
      });
      const t = TIPOS.find((x) => x.valor === tipo)!;
      toast.success(
        hechos.length === 1
          ? `${t.titulo}: ${cantidadConUnidad(hechos[0].cantidad, hechos[0].unidad)} de ${hechos[0].articulo_nombre}`
          : `${t.titulo}: ${hechos.length} materiales registrados`,
      );
      onOpenChange(false);
      onRegistrado();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar el movimiento');
    } finally {
      setGuardando(false);
    }
  }

  const tipoActual = TIPOS.find((t) => t.valor === tipo)!;
  const horaTexto = hora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  return (
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
          <p className="hidden text-xs text-muted-foreground sm:block">
            Se registra hoy a las <span className="font-medium tabular-nums text-foreground">{horaTexto}</span> a nombre de{' '}
            <span className="font-medium text-foreground">{user?.nombre ?? '…'}</span>
          </p>
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
            <Select value={personaId} onValueChange={(v) => { setPersonaId(v); setError(null); }}>
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
                          <span className="text-xs tabular-nums text-muted-foreground">tiene {p.articulos} material{p.articulos === 1 ? '' : 'es'}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">Materiales</h3>
            {desdePersona && persona && opciones.length === 0 && (
              <p className="text-xs text-muted-foreground">{persona.persona.nombre} no tiene material a su cargo.</p>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {revision.map(({ linea, articulo, n, valida, tope, excede }, i) => {
              const despues =
                articulo && valida && !excede
                  ? tipo === 'entrada' || tipo === 'devolucion'
                    ? articulo.stock + n
                    : tipo === 'consumo'
                      ? null
                      : articulo.stock - n
                  : null;
              return (
                <li key={linea.clave} className="rounded-xl border border-ld p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <Select value={linea.articulo_id} onValueChange={(v) => actualizar(linea.clave, { articulo_id: v })}>
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
                                  {d != null && (
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                      {desdePersona ? 'tiene' : 'hay'} {d}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
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
                      {articulo && (
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">
                          {palabraUnidad(articulo.unidad, n)}
                        </span>
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
                  </div>
                  {articulo && (
                    <p className={`mt-2 text-xs ${excede ? 'font-medium text-error-text' : 'text-muted-foreground'}`}>
                      {excede
                        ? desdePersona
                          ? `${persona?.persona.nombre} solo tiene ${cantidadConUnidad(tope ?? 0, articulo.unidad)}.`
                          : `En el almacén solo hay ${cantidadConUnidad(tope ?? 0, articulo.unidad)}.`
                        : despues != null
                          ? <>Almacén: <span className="tabular-nums">{articulo.stock}</span> → <span className="font-medium tabular-nums text-foreground">{despues}</span>
                              {despues <= articulo.stock_minimo && articulo.stock_minimo > 0 && (
                                <span className="text-warning-text"> · queda en el mínimo o por debajo ({articulo.stock_minimo})</span>
                              )}
                            </>
                          : tipo === 'consumo' && persona
                            ? `${persona.persona.nombre} tiene ${cantidadConUnidad(tope ?? 0, articulo.unidad)}; el almacén no cambia.`
                            : `En almacén: ${cantidadConUnidad(articulo.stock, articulo.unidad)}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {repetido && <p className="text-xs font-medium text-error-text">Hay un material repetido: junta las cantidades en una sola línea.</p>}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
              disabled={lineas.length >= 20}
            >
              <Icon icon="tabler:plus" width={16} />
              Agregar otro material
            </Button>
          </div>
        </section>

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
              <Input
                id="mov-documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                maxLength={60}
                placeholder="F001-2345"
              />
            </FormField>
          )}
        </div>

        <p className="text-xs text-muted-foreground sm:hidden">
          Se registra hoy a las <span className="font-medium tabular-nums text-foreground">{horaTexto}</span> a nombre de{' '}
          <span className="font-medium text-foreground">{user?.nombre ?? '…'}</span>
        </p>

        {error && <FormCallout tone="error">{error}</FormCallout>}
      </div>
    </FormDialog>
  );
};

export default RegistrarMovimiento;
