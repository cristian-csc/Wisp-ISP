import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import {
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
} from 'src/components/shared/form';
import { Input } from 'src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  aprobarCliente,
  ipsDisponibles,
  type IpsDisponibles,
} from 'src/lib/clientes';

/** Lo mínimo que hace falta saber del cliente; sirve igual para la fila de
 *  la lista y para la ficha, que traen tipos distintos. */
export type ClienteAprobable = {
  id: number;
  nombre: string;
  tipo_conexion?: string | null;
};

export interface AprobarClienteDialogProps {
  cliente: ClienteAprobable | null;
  onClose: () => void;
  /** Se llama cuando ya está aprobado, para recargar la pantalla de detrás. */
  onAprobado: () => void;
}

const SIN_IP = '__sin_ip__';
const A_MANO = '__a_mano__';

/**
 * Aprobar una instalación, eligiendo la IP fija del cliente.
 *
 * La IP importa más de lo que parece: el corte por morosidad mete esa IP en
 * una lista del firewall del router, así que sin IP fija el corte no es
 * fiable (el router le daría una distinta cada vez que reconecta). Por eso se
 * consultan las que están libres en el router y se propone la primera, en vez
 * de dejar que alguien la escriba de memoria y acabe pisando la de otro
 * cliente, dejando a los dos sin servicio.
 *
 * Si el router no contesta, se puede aprobar igual: el cliente queda
 * registrado y el secreto PPPoE se crea cuando haya enlace.
 */
const AprobarClienteDialog = ({ cliente, onClose, onAprobado }: AprobarClienteDialogProps) => {
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState<IpsDisponibles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eleccion, setEleccion] = useState<string>(SIN_IP);
  const [ipManual, setIpManual] = useState('');

  const satelital = cliente?.tipo_conexion === 'satelital';

  useEffect(() => {
    if (!cliente) return;
    setDatos(null);
    setError(null);
    setIpManual('');
    setEleccion(SIN_IP);
    if (satelital) return;

    let vigente = true;
    setCargando(true);
    ipsDisponibles(cliente.id)
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        // Se propone la que ya tenga apuntada, y si no, la primera libre:
        // así en el caso normal solo hay que pulsar Aprobar.
        const propuesta = d.ip_actual ?? d.sugerida;
        setEleccion(propuesta ?? SIN_IP);
      })
      .catch((err) => {
        if (!vigente) return;
        setError(err?.response?.data?.detail ?? 'No se pudieron consultar las IP libres del router.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id]);

  const ipFinal = eleccion === SIN_IP ? null : eleccion === A_MANO ? ipManual.trim() : eleccion;
  const manualInvalida =
    eleccion === A_MANO && !!ipManual.trim() && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ipManual.trim());

  async function confirmar() {
    if (!cliente) return;
    setEnviando(true);
    try {
      const res = await aprobarCliente(cliente.id, satelital ? null : ipFinal);
      onClose();
      onAprobado();
      if (res.mikrotik_ok) {
        toast.success(
          `Instalación de ${cliente.nombre} aprobada` + (ipFinal ? ` · IP ${ipFinal}` : ''),
        );
      } else {
        // Aprobado en el panel pero el router no se enteró: hay que decirlo,
        // porque el cliente no podrá conectarse hasta que se arregle.
        toast.warning(`Aprobada, pero el router no respondió: ${res.mikrotik_msg}`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo aprobar la instalación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <FormDialog
      open={!!cliente}
      onOpenChange={(open) => !open && onClose()}
      title="Aprobar instalación"
      subtitle={cliente?.nombre}
      icon="tabler:circle-check"
      tone="success"
      size="md"
      footer={
        <FormActions
          onCancel={onClose}
          submitLabel="Aprobar"
          submitIcon="tabler:circle-check"
          onSubmit={confirmar}
          submitting={enviando}
          disabled={cargando || manualInvalida || (eleccion === A_MANO && !ipManual.trim())}
        />
      }
    >
      {satelital ? (
        <FormCallout tone="info">
          Es un cliente satelital: el servicio lo presta Starlink, no la red propia, así que no
          necesita IP ni pasa por ningún router.
        </FormCallout>
      ) : (
        <div className="space-y-4">
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon icon="tabler:loader-2" width={18} className="animate-spin" />
              Consultando al router qué IP están libres…
            </div>
          )}

          {error && (
            <FormCallout tone="warning">
              {error}
              <div className="mt-1">
                Se puede aprobar igual y asignar la IP más tarde, pero hasta entonces el corte por
                morosidad no será fiable en este cliente.
              </div>
            </FormCallout>
          )}

          {datos && (
            <>
              <FormField label="IP del cliente" icon="tabler:router" htmlFor="ipCliente">
                <Select value={eleccion} onValueChange={setEleccion}>
                  <SelectTrigger id="ipCliente">
                    <SelectValue placeholder="Elegir IP" />
                  </SelectTrigger>
                  <SelectContent>
                    {datos.ip_actual && (
                      <SelectItem value={datos.ip_actual}>
                        {datos.ip_actual} — la que ya tenía apuntada
                      </SelectItem>
                    )}
                    {datos.disponibles
                      .filter((ip) => ip !== datos.ip_actual)
                      .map((ip) => (
                        <SelectItem key={ip} value={ip}>
                          {ip}
                          {ip === datos.sugerida ? ' — libre, la primera' : ''}
                        </SelectItem>
                      ))}
                    <SelectItem value={A_MANO}>Escribir otra…</SelectItem>
                    <SelectItem value={SIN_IP}>Sin IP fija (la asigna el router)</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              {eleccion === A_MANO && (
                <FormField
                  label="IP a mano"
                  icon="tabler:pencil"
                  htmlFor="ipManual"
                  required
                  error={manualInvalida ? 'No es una dirección IPv4 válida' : undefined}
                >
                  <Input
                    id="ipManual"
                    placeholder="192.168.20.50"
                    value={ipManual}
                    onChange={(e) => setIpManual(e.target.value)}
                  />
                </FormField>
              )}

              <p className="text-xs text-muted-foreground">
                Pool <span className="font-medium">{datos.pool}</span> de {datos.zona}:{' '}
                {datos.total_libres} libres de {datos.total_pool} ({datos.ocupadas} en uso).
              </p>

              {eleccion === SIN_IP && (
                <FormCallout tone="warning">
                  Sin IP fija el router le dará una distinta cada vez que reconecte, y el corte por
                  morosidad —que funciona metiendo la IP en una lista del firewall— dejaría de
                  acertar.
                </FormCallout>
              )}
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
};

export default AprobarClienteDialog;
