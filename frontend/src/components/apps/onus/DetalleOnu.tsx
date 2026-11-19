import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from 'src/components/ui/sheet';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import LoadingState from 'src/components/shared/LoadingState';
import type { Usuario } from 'src/lib/api';
import { asignarOnu, deleteOnu, historialOnu, macValida, marcarOnu, mensajeDeError, type EstadoOnu, type MovimientoOnu, type Onu } from 'src/lib/onus';
import { DondeEsta, EstadoOnuChip, LineaDeTiempo } from './piezasOnu';

type Accion = 'entregar' | 'danado' | 'perdido' | null;

interface Props {
  onu: Onu | null;
  onClose: () => void;
  puedeGestionar: boolean;
  tecnicos: Usuario[];
  macRepetida: boolean;
  /** Se abre directamente en una acción (desde el menú de la tabla). */
  accionInicial?: Accion;
  onCambio: (onu?: Onu) => void;
}

/** La ficha de una ONU: qué es, dónde está y todo lo que le pasó. Las
 *  acciones van aquí, con su nota, para que quede el porqué. */
const DetalleOnu = ({ onu, onClose, puedeGestionar, tecnicos, macRepetida, accionInicial = null, onCambio }: Props) => {
  const [historial, setHistorial] = useState<MovimientoOnu[] | null>(null);
  const [accion, setAccion] = useState<Accion>(null);
  const [tecnico, setTecnico] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    setHistorial(null);
    setAccion(onu ? accionInicial : null);
    setTecnico('');
    setNota('');
    if (!onu) return;
    let vigente = true;
    historialOnu(onu.id)
      .then((h) => vigente && setHistorial(h))
      .catch(() => vigente && setHistorial([]));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onu?.id, onu?.estado, onu?.tecnico_id]);

  if (!onu) return <Sheet open={false} />;

  const enMano = onu.estado === 'en_almacen' || onu.estado === 'asignado_tecnico';
  const fuera = onu.estado === 'danado' || onu.estado === 'perdido';
  const soloAlta = historial != null && historial.every((m) => m.tipo === 'alta');
  const disponibles = tecnicos.filter((t) => t.activo && t.id !== onu.tecnico_id);

  async function ejecutar(fn: () => Promise<Onu>, ok: string) {
    setGuardando(true);
    try {
      const nueva = await fn();
      toast.success(ok);
      setAccion(null);
      setNota('');
      setTecnico('');
      onCambio(nueva);
    } catch (err) {
      toast.error(mensajeDeError(err, 'No se pudo actualizar la ONU'));
    } finally {
      setGuardando(false);
    }
  }

  const marcar = (estado: EstadoOnu, ok: string) => ejecutar(() => marcarOnu(onu.id, estado, nota.trim()), ok);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <header className="border-b border-ld px-6 pb-5 pt-6 pr-14">
          <div className="flex items-center gap-2">
            <EstadoOnuChip estado={onu.estado} />
            {onu.wifi_version && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{onu.wifi_version === 'wifi6' ? 'WiFi 6' : 'WiFi 5'}</span>}
          </div>
          <SheetTitle className="mt-2 font-mono text-xl font-semibold tracking-wide">{onu.numero_serie}</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">
            {onu.marca ?? 'Marca sin registrar'} · MAC <span className="font-mono">{onu.mac ?? 'sin registrar'}</span>
          </SheetDescription>
          {(!macValida(onu.mac) || macRepetida) && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-lightwarning px-2 py-1 text-xs font-medium text-warning-text">
              <Icon icon="tabler:alert-triangle" width={13} />
              {!macValida(onu.mac) ? 'La MAC guardada no es válida: se cargó antes de que se validara' : 'Otra ONU tiene la misma MAC: revisa cuál es la correcta'}
            </p>
          )}
        </header>

        <section className="border-b border-ld px-6 py-5">
          <h3 className="text-xs font-medium text-muted-foreground">Dónde está ahora</h3>
          <div className="mt-2">
            <DondeEsta onu={onu} />
          </div>

          {puedeGestionar && (
            <div className="mt-4 flex flex-wrap gap-2">
              {enMano && (
                <Button size="sm" onClick={() => setAccion(accion === 'entregar' ? null : 'entregar')} aria-expanded={accion === 'entregar'}>
                  <Icon icon={onu.tecnico ? 'tabler:arrows-exchange' : 'tabler:user-share'} width={15} />
                  {onu.tecnico ? 'Pasar a otro técnico' : 'Entregar a técnico'}
                </Button>
              )}
              {onu.estado === 'asignado_tecnico' && (
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => marcar('en_almacen', 'Devuelta al almacén')}>
                  <Icon icon="tabler:arrow-back-up" width={15} /> Devolver al almacén
                </Button>
              )}
              {enMano && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setAccion(accion === 'danado' ? null : 'danado')}>
                    <Icon icon="tabler:alert-triangle" width={15} /> Dañada
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAccion(accion === 'perdido' ? null : 'perdido')}>
                    <Icon icon="tabler:help-hexagon" width={15} /> Perdida
                  </Button>
                </>
              )}
              {fuera && (
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => marcar('en_almacen', 'Recuperada: vuelve al almacén')}>
                  <Icon icon="tabler:rotate-clockwise" width={15} /> Recuperar al almacén
                </Button>
              )}
              {onu.estado === 'instalado' && (
                <p className="text-xs text-muted-foreground">
                  Para sacarla del cliente usa una orden de retiro o el cambio de equipo de una avería: así queda el motivo.
                </p>
              )}
            </div>
          )}

          {accion && (
            <form
              className="mt-4 flex flex-col gap-3 rounded-xl border border-ld bg-surface-2 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (accion === 'entregar') {
                  const nombre = tecnicos.find((t) => String(t.id) === tecnico)?.nombre ?? 'el técnico';
                  ejecutar(() => asignarOnu(onu.id, Number(tecnico), nota.trim()), onu.tecnico ? `Pasó a ${nombre}` : `Entregada a ${nombre}`);
                } else {
                  marcar(accion, accion === 'danado' ? 'Marcada como dañada' : 'Marcada como perdida');
                }
              }}
            >
              <p className="text-sm font-medium">
                {accion === 'entregar'
                  ? onu.tecnico
                    ? `Pasar de ${onu.tecnico.nombre} a…`
                    : '¿A quién se le entrega?'
                  : accion === 'danado'
                    ? 'Marcar como dañada'
                    : 'Marcar como perdida'}
              </p>
              {accion === 'entregar' && (
                <Select value={tecnico} onValueChange={setTecnico}>
                  <SelectTrigger className="w-full bg-card" aria-label="Técnico">
                    <SelectValue placeholder={disponibles.length ? 'Elige un técnico' : 'No hay otros técnicos activos'} />
                  </SelectTrigger>
                  <SelectContent>
                    {disponibles.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                aria-label="Nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={255}
                className="bg-card"
                placeholder={accion === 'entregar' ? 'Nota (opcional): para la instalación de…' : 'Qué pasó: no enciende, se mojó, no apareció…'}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={guardando || (accion === 'entregar' && !tecnico)} variant={accion === 'entregar' ? 'default' : 'destructive'}>
                  {guardando ? 'Guardando…' : accion === 'entregar' ? 'Confirmar entrega' : 'Confirmar'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAccion(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </section>

        <section className="flex-1 px-6 py-5">
          <h3 className="text-sm font-semibold">Recorrido</h3>
          <div className="mt-4">{historial === null ? <LoadingState filas={3} /> : <LineaDeTiempo movimientos={historial} />}</div>
        </section>

        {puedeGestionar && soloAlta && onu.estado === 'en_almacen' && (
          <footer className="border-t border-ld px-6 py-4">
            <Button variant="ghost" size="sm" className="text-error-text" onClick={() => setBorrando(true)}>
              <Icon icon="tabler:trash" width={15} /> Eliminar: se registró por error
            </Button>
          </footer>
        )}

        <ConfirmDialog
          open={borrando}
          onOpenChange={setBorrando}
          title="Eliminar ONU"
          description={`¿Eliminar la ONU ${onu.numero_serie}? Solo se puede porque nunca salió del almacén.`}
          onConfirm={async () => {
            try {
              await deleteOnu(onu.id);
              toast.success('ONU eliminada');
              onClose();
              onCambio();
            } catch (err) {
              toast.error(mensajeDeError(err, 'No se pudo eliminar la ONU'));
            }
          }}
        />
      </SheetContent>
    </Sheet>
  );
};

export default DetalleOnu;
