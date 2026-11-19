import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import {
  FormActions,
  FormCallout,
  FormDialog,
} from 'src/components/shared/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import BadgeConexion from 'src/components/apps/whatsapp/BadgeConexion';
import EnvioMasivo from 'src/components/apps/whatsapp/EnvioMasivo';
import InstruccionesVinculacion from 'src/components/apps/whatsapp/InstruccionesVinculacion';
import PanelVinculacion from 'src/components/apps/whatsapp/PanelVinculacion';
import { describirEstado } from 'src/components/apps/whatsapp/estadoConexion';
import { getWhatsappStatus, getWhatsappQr, type WhatsappStatus } from 'src/lib/whatsapp';
import {
  crearRecordatorioCobros,
  listMensajesMasivos,
  getMensajeMasivo,
  cancelarMensajeMasivo,
  type MensajeMasivo,
} from 'src/lib/whatsapp';
import { listZonas, type Zona } from 'src/lib/zonas';

const ESTADO_CAMPANIA_LABEL: Record<MensajeMasivo['estado'], string> = {
  en_progreso: 'Enviando…',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const ESTADO_CAMPANIA_BADGE: Record<MensajeMasivo['estado'], string> = {
  en_progreso: 'bg-lightwarning text-warning-text',
  completado: 'bg-lightsuccess text-success-text',
  cancelado: 'bg-lightsecondary text-secondary',
};

function zonaNombres(zonaIds: number[] | null, zonas: Zona[]): string {
  if (!zonaIds || zonaIds.length === 0) return 'Todas las zonas';
  return zonaIds
    .map((id) => zonas.find((z) => z.id === id)?.nombre ?? `#${id}`)
    .join(', ');
}

const ConfiguracionWhatsapp = () => {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [primeraCargaHecha, setPrimeraCargaHecha] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pidiendoQr, setPidiendoQr] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [zonas, setZonas] = useState<Zona[]>([]);

  const [campanias, setCampanias] = useState<MensajeMasivo[]>([]);
  const [campaniaActiva, setCampaniaActiva] = useState<MensajeMasivo | null>(null);
  const pollCampaniaRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [confirmandoCobros, setConfirmandoCobros] = useState(false);
  const [enviandoCobros, setEnviandoCobros] = useState(false);
  const [errorCobros, setErrorCobros] = useState<string | null>(null);

  async function poll() {
    const s = await getWhatsappStatus().catch(() => null);
    setStatus(s);
    setPrimeraCargaHecha(true);
    if (s && !s.connected) {
      const q = await getWhatsappQr().catch(() => null);
      setQr(q?.qr ?? null);
    } else {
      setQr(null);
    }
  }

  /** Pide el código a mano. Usa las mismas funciones que la consulta
   *  automática: no hay ningún endpoint ni QR nuevo. */
  async function pedirQr() {
    if (pidiendoQr) return;
    setPidiendoQr(true);
    try {
      await poll();
    } finally {
      setPidiendoQr(false);
    }
  }

  async function reloadCampanias() {
    setCampanias(await listMensajesMasivos());
  }

  useEffect(() => {
    poll();
    listZonas().then(setZonas);
    reloadCampanias();
    intervalRef.current = setInterval(poll, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollCampaniaRef.current) clearInterval(pollCampaniaRef.current);
    };
  }, []);

  function alEnviar(campania: MensajeMasivo) {
    setCampaniaActiva(campania);
    seguirCampania(campania.id);
    reloadCampanias();
  }

  function seguirCampania(id: number) {
    if (pollCampaniaRef.current) clearInterval(pollCampaniaRef.current);
    pollCampaniaRef.current = setInterval(async () => {
      const c = await getMensajeMasivo(id).catch(() => null);
      if (!c) return;
      setCampaniaActiva(c);
      if (c.estado !== 'en_progreso') {
        if (pollCampaniaRef.current) clearInterval(pollCampaniaRef.current);
        reloadCampanias();
      }
    }, 2000);
  }

  async function handleEnviarCobros() {
    if (enviandoCobros) return;
    setErrorCobros(null);
    setEnviandoCobros(true);
    try {
      const campania = await crearRecordatorioCobros();
      setConfirmandoCobros(false);
      setCampaniaActiva(campania);
      seguirCampania(campania.id);
      reloadCampanias();
    } catch (err: any) {
      setErrorCobros(err?.response?.data?.detail ?? 'No se pudo enviar el recordatorio');
    } finally {
      setEnviandoCobros(false);
    }
  }

  async function handleCancelar(id: number) {
    await cancelarMensajeMasivo(id);
    if (campaniaActiva?.id === id) {
      const c = await getMensajeMasivo(id);
      setCampaniaActiva(c);
    }
    reloadCampanias();
  }

  const pct = campaniaActiva
    ? Math.round(((campaniaActiva.enviados + campaniaActiva.fallidos) / Math.max(campaniaActiva.total_destinatarios, 1)) * 100)
    : 0;

  const estado = describirEstado(status, primeraCargaHecha);
  const enviandoCampania = campaniaActiva?.estado === 'en_progreso';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="WhatsApp"
        icono="tabler:brand-whatsapp"
        tonoIcono="success"
        juntoAlTitulo={<BadgeConexion estado={estado} />}
        descripcion="Configura la integración y envía notificaciones automáticas a tus clientes"
      />

      {/* Vinculación: panel e instrucciones, lado a lado en escritorio */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelVinculacion
          estado={estado}
          qr={qr}
          pidiendoQr={pidiendoQr}
          onGenerarQr={pedirQr}
          telefono={status?.phone}
        />
        <InstruccionesVinculacion />
      </div>

      {/* Recordatorio de pago a morosos */}
      <CardBox className="overflow-hidden border-l-4 border-l-warning !p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lightwarning text-warning-text">
              <Icon icon="tabler:calendar-dollar" width={21} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">Recordatorio de pago a morosos</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Avisa a todos los clientes activos que no han pagado este mes.
              </p>
            </div>
          </div>
          <Button
            variant="lightwarning"
            onClick={() => setConfirmandoCobros(true)}
            disabled={enviandoCampania}
          >
            <Icon icon="tabler:send" width={16} />
            Enviar recordatorios
          </Button>
        </div>
      </CardBox>

      {/* Mensajería masiva */}
      <SectionCard
        titulo="Mensajería masiva"
        icono="tabler:speakerphone"
        descripcion="Un aviso a toda una zona: mantenimiento, corte programado u otro."
        sinRelleno
      >
        {enviandoCampania && campaniaActiva && (
          <div className="border-t border-ld px-5 pt-4">
        {enviandoCampania && campaniaActiva && (
          <div className="rounded-xl border border-primary/20 bg-lightprimary p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icon icon="tabler:loader-2" width={15} className="animate-spin text-primary" />
                Enviando… {campaniaActiva.enviados + campaniaActiva.fallidos} / {campaniaActiva.total_destinatarios}
              </p>
              <Button size="sm" variant="lighterror" onClick={() => handleCancelar(campaniaActiva.id)}>
                Detener envío
              </Button>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-card"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-success-text">{campaniaActiva.enviados} enviados</span>
              {campaniaActiva.fallidos > 0 && (
                <> · <span className="font-medium text-error">{campaniaActiva.fallidos} fallidos</span></>
              )}
              {' · '}{pct}%
            </p>
          </div>
        )}
          </div>
        )}
        <div className="border-t border-ld">
          <EnvioMasivo zonas={zonas} ocupado={!!enviandoCampania} onEnviado={alEnviar} />
        </div>
      </SectionCard>

      {/* Historial */}
      <SectionCard
        titulo="Historial de envíos masivos"
        icono="tabler:history"
        descripcion="Qué se mandó, a quién y quién lo envió."
        sinRelleno
      >
        <div className="overflow-x-auto px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zonas</TableHead>
                <TableHead>Mensaje</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Por</TableHead>
                <TableHead className="text-end">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Icon icon="tabler:mail-opened" width={32} className="text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        No se ha enviado ningún mensaje masivo todavía.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {campanias.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/30">
                  <TableCell className="max-w-[10rem] truncate text-sm">{zonaNombres(c.zona_ids, zonas)}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{c.mensaje}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="font-medium text-success-text">{c.enviados}</span>/{c.total_destinatarios} enviados
                    {c.fallidos > 0 && <> · <span className="font-medium text-error">{c.fallidos} fallidos</span></>}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${ESTADO_CAMPANIA_BADGE[c.estado]} rounded-md`}>
                      {ESTADO_CAMPANIA_LABEL[c.estado]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(c.creado_en).toLocaleString('es-PE')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.creado_por?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-end">
                    {c.estado === 'en_progreso' && (
                      <Button size="sm" variant="ghost" className="text-error" onClick={() => handleCancelar(c.id)}>
                        Detener
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Confirmar recordatorio de cobros */}
      <FormDialog
        open={confirmandoCobros}
        onOpenChange={setConfirmandoCobros}
        title="Enviar recordatorio de pago"
        subtitle="Aviso a los clientes con el mes pendiente"
        icon="tabler:bell-dollar"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setConfirmandoCobros(false)}
            submitLabel="Confirmar y enviar"
            submitIcon="tabler:send"
            onSubmit={handleEnviarCobros}
            submitting={enviandoCobros}
          />
        }
      >
        <div className="flex flex-col gap-4">
          <FormCallout>
            Se enviará el aviso de pago pendiente a todos los clientes{' '}
            <span className="font-semibold">activos</span> que no registran pago del mes actual.
          </FormCallout>
          <p className="text-xs text-muted-foreground">
            Se enviará de uno en uno con una pausa de 5 a 10 segundos entre cada mensaje. Puedes
            detenerlo en cualquier momento.
          </p>
          {errorCobros && <FormCallout tone="error">{errorCobros}</FormCallout>}
        </div>
      </FormDialog>
    </div>
  );
};

export default ConfiguracionWhatsapp;
