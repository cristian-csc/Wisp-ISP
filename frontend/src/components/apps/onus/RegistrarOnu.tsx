import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { FormActions, FormCallout, FormDialog, FormField, SegmentedChoice } from 'src/components/shared/form';
import { Input } from 'src/components/ui/input';
import { Switch } from 'src/components/ui/switch';
import { createOnu, detectarMarca, formatearMac, mensajeDeError, validarOnu, type Onu } from 'src/lib/onus';
import { cn } from 'src/lib/utils';

type Wifi = 'wifi6' | 'wifi5' | 'nose';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistrada: (onu: Onu) => void;
}

type Campo = { valor: string; error: string | null; ok: boolean; revisando: boolean };
const vacio: Campo = { valor: '', error: null, ok: false, revisando: false };

/** Alta de ONUs pensada para el lector: se escanea la serie (el lector
 *  termina con Enter), se valida y salta a la MAC; con «Seguir registrando»
 *  se carga una tanda entera sin cerrar la ventana. */
const RegistrarOnu = ({ open, onOpenChange, onRegistrada }: Props) => {
  const [serie, setSerie] = useState<Campo>(vacio);
  const [mac, setMac] = useState<Campo>(vacio);
  const [marca, setMarca] = useState('');
  const [wifi, setWifi] = useState<Wifi>('wifi6');
  const [seguir, setSeguir] = useState(true);
  const [tanda, setTanda] = useState<Onu[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refSerie = useRef<HTMLInputElement>(null);
  const refMac = useRef<HTMLInputElement>(null);

  function limpiar() {
    setSerie(vacio);
    setMac(vacio);
    setMarca('');
    setError(null);
  }

  useEffect(() => {
    if (open) {
      limpiar();
      setTanda([]);
    }
  }, [open]);

  async function revisarSerie(): Promise<boolean> {
    const texto = serie.valor.trim();
    if (!texto) {
      setSerie((s) => ({ ...s, error: 'Escribe o escanea el número de serie', ok: false }));
      return false;
    }
    setSerie((s) => ({ ...s, revisando: true }));
    try {
      const r = await validarOnu({ numero_serie: texto });
      const err = r.errores.numero_serie ?? null;
      setSerie({ valor: r.numero_serie ?? texto, error: err, ok: !err, revisando: false });
      if (!err && r.marca && !marca) setMarca(r.marca);
      return !err;
    } catch {
      setSerie((s) => ({ ...s, revisando: false }));
      return false;
    }
  }

  async function revisarMac(): Promise<boolean> {
    if (!mac.valor.trim()) {
      setMac(vacio);
      return true;
    }
    setMac((m) => ({ ...m, revisando: true }));
    try {
      const r = await validarOnu({ mac: mac.valor });
      const err = r.errores.mac ?? null;
      setMac({ valor: r.mac ?? mac.valor, error: err, ok: !err, revisando: false });
      return !err;
    } catch {
      setMac((m) => ({ ...m, revisando: false }));
      return false;
    }
  }

  // La MAC completa se revisa sola: no hace falta salir del campo.
  useEffect(() => {
    if (mac.valor.length === 17 && !mac.ok && !mac.error && !mac.revisando) revisarMac();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mac.valor]);

  async function alEnterSerie(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (await revisarSerie()) refMac.current?.focus();
  }

  async function guardar(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const [okSerie, okMac] = await Promise.all([serie.ok ? true : revisarSerie(), mac.ok || !mac.valor ? true : revisarMac()]);
    if (!okSerie || !okMac) return;
    setGuardando(true);
    try {
      const onu = await createOnu({
        numero_serie: serie.valor,
        mac: mac.valor || undefined,
        marca: marca.trim() || undefined,
        wifi_version: wifi === 'nose' ? undefined : wifi,
      });
      onRegistrada(onu);
      if (seguir) {
        setTanda((t) => [onu, ...t]);
        limpiar();
        toast.success(`ONU ${onu.numero_serie} registrada`);
        setTimeout(() => refSerie.current?.focus(), 0);
      } else {
        toast.success(`ONU ${onu.numero_serie} registrada en el almacén`);
        onOpenChange(false);
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar la ONU'));
    } finally {
      setGuardando(false);
    }
  }

  const estadoIcono = (c: Campo) =>
    c.revisando ? (
      <Icon icon="tabler:loader-2" width={17} className="animate-spin text-muted-foreground" />
    ) : c.error ? (
      <Icon icon="tabler:alert-circle" width={17} className="text-error-text" />
    ) : c.ok ? (
      <Icon icon="tabler:circle-check" width={17} className="text-success-text" />
    ) : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar ONU"
      subtitle="Entra al almacén con su serie y MAC verificadas"
      icon="tabler:router"
      size="lg"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          cancelLabel={tanda.length ? 'Terminar' : 'Cancelar'}
          submitLabel="Registrar"
          submitIcon="tabler:plus"
          submitForm="onu-form"
          submitting={guardando}
          disabled={!serie.valor.trim() || !!serie.error || !!mac.error}
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={seguir} onCheckedChange={setSeguir} aria-label="Seguir registrando" />
            Seguir registrando
          </label>
        </FormActions>
      }
    >
      <form id="onu-form" onSubmit={guardar} className="flex flex-col gap-5">
        <FormField
          label="Número de serie GPON"
          htmlFor="onu-serie"
          required
          error={serie.error}
          hint="Escanéala con el lector o escríbela y presiona Enter. 4 letras y 8 caracteres, como ASKY10790001."
        >
          <div className="relative">
            <Input
              id="onu-serie"
              ref={refSerie}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={serie.valor}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setSerie({ ...vacio, valor: v });
                const m = detectarMarca(v);
                if (m) setMarca(m);
              }}
              onKeyDown={alEnterSerie}
              onBlur={() => serie.valor && !serie.ok && revisarSerie()}
              aria-invalid={!!serie.error || undefined}
              className={cn('pr-10 font-mono text-base tracking-wide', serie.ok && 'border-success-solid')}
              placeholder="ASKY10790001"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">{estadoIcono(serie)}</span>
          </div>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="MAC" htmlFor="onu-mac" error={mac.error} hint="Opcional. Se ordena sola: A4:B1:C2:3D:4E:5F.">
            <div className="relative">
              <Input
                id="onu-mac"
                ref={refMac}
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                value={mac.valor}
                onChange={(e) => setMac({ ...vacio, valor: formatearMac(e.target.value) })}
                onBlur={() => mac.valor && !mac.ok && revisarMac()}
                aria-invalid={!!mac.error || undefined}
                className={cn('pr-10 font-mono', mac.ok && 'border-success-solid')}
                placeholder="A4:B1:C2:3D:4E:5F"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">{estadoIcono(mac)}</span>
            </div>
          </FormField>
          <FormField label="Marca" htmlFor="onu-marca" hint="Se reconoce por la serie.">
            <Input id="onu-marca" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Askey, Huawei, ZTE…" maxLength={100} />
          </FormField>
        </div>

        <FormField label="WiFi">
          <SegmentedChoice<Wifi>
            label="WiFi"
            valor={wifi}
            onChange={setWifi}
            opciones={[
              { valor: 'wifi6', etiqueta: 'WiFi 6' },
              { valor: 'wifi5', etiqueta: 'WiFi 5' },
              { valor: 'nose', etiqueta: 'No sé' },
            ]}
          />
        </FormField>

        {error && <FormCallout tone="error">{error}</FormCallout>}

        {tanda.length > 0 && (
          <div className="rounded-xl border border-ld">
            <p className="border-b border-ld px-4 py-2.5 text-sm font-medium">
              {tanda.length} registrada{tanda.length === 1 ? '' : 's'} en esta tanda
            </p>
            <ul className="max-h-32 overflow-y-auto">
              {tanda.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 border-b border-ld px-4 py-2 text-sm last:border-0">
                  <span className="font-mono font-semibold">{o.numero_serie}</span>
                  <span className="truncate text-xs text-muted-foreground">{[o.marca, o.mac].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </FormDialog>
  );
};

export default RegistrarOnu;
