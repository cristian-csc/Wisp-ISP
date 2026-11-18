import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Input } from 'src/components/ui/input';
import {
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
  FormSection,
} from 'src/components/shared/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import { completarDatosInstalacion, type ClienteOut } from 'src/lib/clientes';
import { listCajasNap, type CajaNap } from 'src/lib/cajasnap';
import { listOnus, createOnu, type Onu } from 'src/lib/onus';

const NUEVO_EQUIPO = 'nuevo';
const SIN_MUFA = 'Sin mufa asignada';

/**
 * Registrar la caja, el borne y el equipo de un cliente ya instalado.
 *
 * Es la mitad de oficina del cliente migrado. La otra mitad la hace el
 * técnico en la casa, desde la app; ésta la hace quien tiene los papeles del
 * sistema viejo delante y no necesita que nadie salga a la calle — que es la
 * mayoría de los casos, y la razón de que el pendiente de planta y el de
 * fotos sean dos cosas separadas.
 *
 * El equipo casi nunca va a estar en el inventario: a un cliente de hace tres
 * años nadie le dio de alta la ONU. Por eso se puede escribir la serie
 * directamente y se da de alta al vuelo, en vez de obligar a ir al módulo de
 * inventario, crearla, volver y buscarla.
 */
export default function CompletarDatosDialog({
  cliente,
  open,
  onOpenChange,
  onListo,
}: {
  cliente: ClienteOut;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onListo: () => void;
}) {
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [onus, setOnus] = useState<Onu[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cajaId, setCajaId] = useState('');
  const [borneNum, setBorneNum] = useState('');
  const [onuSel, setOnuSel] = useState('');
  const [serieNueva, setSerieNueva] = useState('');
  const [precinto, setPrecinto] = useState('');
  const [potencia, setPotencia] = useState('');
  const [metros, setMetros] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCargando(true);
    Promise.all([
      listCajasNap(cliente.zona?.id),
      // El almacén y lo que ya está repartido: el admin puede usar los dos,
      // y para una ficha vieja lo normal es que el equipo acabe de darse de
      // alta y siga en almacén.
      listOnus({ estado: 'en_almacen' }),
      listOnus({ estado: 'asignado_tecnico' }),
    ])
      .then(([cj, enAlmacen, asignadas]) => {
        setCajas(cj);
        setOnus([...enAlmacen, ...asignadas]);
      })
      .catch(() => setError('No se pudo cargar el inventario. Cierra y vuelve a intentarlo.'))
      .finally(() => setCargando(false));
  }, [open, cliente.zona?.id]);

  // Agrupadas por mufa, como en la app: una zona puede tener varias y las
  // cajas de cada una se numeran seguidas.
  const porMufa = useMemo(() => {
    const grupos = new Map<string, CajaNap[]>();
    for (const c of cajas) {
      const clave = c.mufa_codigo ?? SIN_MUFA;
      const lista = grupos.get(clave);
      if (lista) lista.push(c);
      else grupos.set(clave, [c]);
    }
    return [...grupos.entries()].sort(([a], [b]) => {
      if (a === SIN_MUFA) return 1;
      if (b === SIN_MUFA) return -1;
      return a.localeCompare(b, 'es', { numeric: true });
    });
  }, [cajas]);

  const cajaElegida = cajas.find((c) => String(c.id) === cajaId) ?? null;
  const bornesElegibles = (cajaElegida?.bornes ?? []).filter(
    (b) => b.estado === 'libre' || b.cliente_id === cliente.id,
  );

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!!cajaId !== !!borneNum) {
      setError('La caja y el borne van juntos: el borne 3 existe en todas las cajas.');
      return;
    }
    if (onuSel === NUEVO_EQUIPO && !serieNueva.trim()) {
      setError('Escribe el número de serie del equipo, o elige uno del inventario.');
      return;
    }
    if (!cajaId && !onuSel && !metros) {
      setError('No hay nada que registrar todavía.');
      return;
    }

    setGuardando(true);
    try {
      let onuId: number | null = null;
      if (onuSel === NUEVO_EQUIPO) {
        const creada = await createOnu({ numero_serie: serieNueva.trim() });
        onuId = creada.id;
      } else if (onuSel) {
        onuId = Number(onuSel);
      }

      await completarDatosInstalacion(cliente.id, {
        caja_nap_id: cajaId ? Number(cajaId) : null,
        numero_borne: borneNum ? Number(borneNum) : null,
        onu_id: onuId,
        codigo_precinto: precinto.trim() || null,
        potencia_optica_dbm: potencia ? Number(potencia) : null,
        metros_cable: metros ? Number(metros) : null,
      });

      toast.success('Datos registrados', {
        description: 'La ficha de este cliente ya está completa.',
      });
      onOpenChange(false);
      onListo();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo guardar. Revisa los datos.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Completar datos de instalación"
      subtitle={cliente.nombre}
      icon="tabler:clipboard-check"
      tone="warning"
      size="lg"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel="Guardar"
          submitIcon="tabler:check"
          submitForm="completar-datos"
          submitting={guardando}
          disabled={cargando}
        />
      }
    >
      <form id="completar-datos" onSubmit={enviar}>
        <FormCallout>
          Este cliente ya está conectado, pero su ficha nunca tuvo caja, borne
          ni equipo. Registra lo que sepas con certeza y deja vacío lo demás:
          un dato puesto a ojo deja el mapa mintiendo y manda al próximo
          técnico a un viaje perdido.
        </FormCallout>

        <FormGrid>
          <FormSection title="Planta" icon="tabler:box">
            <FormField label="Caja NAP" icon="tabler:box" htmlFor="caja">
              <Select
                value={cajaId}
                onValueChange={(v) => {
                  setCajaId(v);
                  setBorneNum('');
                }}
              >
                <SelectTrigger id="caja">
                  <SelectValue placeholder={cargando ? 'Cargando…' : 'Sin registrar'} />
                </SelectTrigger>
                <SelectContent>
                  {porMufa.map(([mufa, lista]) => (
                    <SelectGroupMufa key={mufa} mufa={mufa} cajas={lista} />
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Borne" icon="tabler:plug" htmlFor="borne">
              <Select value={borneNum} onValueChange={setBorneNum} disabled={!cajaElegida}>
                <SelectTrigger id="borne">
                  <SelectValue
                    placeholder={cajaElegida ? 'Elegir borne' : 'Elige antes la caja'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {bornesElegibles.map((b) => (
                    <SelectItem key={b.id} value={String(b.numero)}>
                      Borne {b.numero}
                      {b.cliente_id === cliente.id ? ' (el suyo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Código de precinto" icon="tabler:lock" htmlFor="precinto">
              <Input
                id="precinto"
                value={precinto}
                onChange={(e) => setPrecinto(e.target.value.toUpperCase())}
                placeholder="Opcional"
              />
            </FormField>
          </FormSection>

          <FormSection title="Equipo y medidas" icon="tabler:router">
            <FormField label="Equipo instalado" icon="tabler:router" htmlFor="onu" wide>
              <Select value={onuSel} onValueChange={setOnuSel}>
                <SelectTrigger id="onu">
                  <SelectValue placeholder={cargando ? 'Cargando…' : 'Sin registrar'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NUEVO_EQUIPO}>
                    + Dar de alta un equipo por su serie
                  </SelectItem>
                  {onus.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.numero_serie}
                      {o.marca ? ` · ${o.marca}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {onuSel === NUEVO_EQUIPO && (
              <FormField
                label="Número de serie"
                icon="tabler:barcode"
                htmlFor="serie"
                required
                wide
              >
                <Input
                  id="serie"
                  value={serieNueva}
                  onChange={(e) => setSerieNueva(e.target.value.toUpperCase())}
                  placeholder="La serie GPON de la etiqueta del equipo"
                />
              </FormField>
            )}

            <FormField label="Potencia óptica (dBm)" icon="tabler:wave-sine" htmlFor="potencia">
              <Input
                id="potencia"
                type="number"
                step="0.1"
                value={potencia}
                onChange={(e) => setPotencia(e.target.value)}
                placeholder="-18.5"
              />
            </FormField>

            <FormField label="Metros de cable" icon="tabler:ruler" htmlFor="metros">
              <Input
                id="metros"
                type="number"
                min={0}
                value={metros}
                onChange={(e) => setMetros(e.target.value)}
                placeholder="Opcional"
              />
            </FormField>
          </FormSection>
        </FormGrid>

        {error && (
          <FormCallout tone="error">
            <span className="font-medium">{error}</span>
          </FormCallout>
        )}
      </form>
    </FormDialog>
  );
}

/** Las cajas de una mufa, con su encabezado. Va aparte porque Select no
 *  acepta fragmentos con texto suelto entre los items. */
function SelectGroupMufa({ mufa, cajas }: { mufa: string; cajas: CajaNap[] }) {
  return (
    <>
      <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {mufa}
      </div>
      {[...cajas]
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
        .map((c) => {
          const libres = c.bornes.filter((b) => b.estado === 'libre').length;
          return (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.codigo} — {libres} {libres === 1 ? 'borne libre' : 'bornes libres'}
            </SelectItem>
          );
        })}
    </>
  );
}
