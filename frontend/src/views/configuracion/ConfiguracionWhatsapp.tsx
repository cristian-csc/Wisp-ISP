import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
import {
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
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
import ChipSeleccion from 'src/components/apps/whatsapp/ChipSeleccion';
import InstruccionesVinculacion from 'src/components/apps/whatsapp/InstruccionesVinculacion';
import PanelVinculacion from 'src/components/apps/whatsapp/PanelVinculacion';
import { describirEstado } from 'src/components/apps/whatsapp/estadoConexion';
import { getWhatsappStatus, getWhatsappQr, type WhatsappStatus } from 'src/lib/whatsapp';
import {
  contarDestinatariosMasivo,
  crearMensajeMasivo,
  crearRecordatorioCobros,
  listMensajesMasivos,
  getMensajeMasivo,
  cancelarMensajeMasivo,
  type MensajeMasivo,
} from 'src/lib/whatsapp';
import { listZonas, type Zona } from 'src/lib/zonas';

const ESTADOS_DISPONIBLES: { value: string; label: string }[] = [
  { value: 'activo', label: 'Activos' },
  { value: 'pausado', label: 'Pausados' },
  { value: 'suspendido', label: 'Suspendidos (sin pago)' },
];

const PLANTILLAS: { nombre: string; texto: string }[] = [
  {
    nombre: 'Mantenimiento programado',
    texto: '🔧 *WISP* — Mantenimiento programado\n\nHola {nombre} 👋, le informamos que el [FECHA] el servicio de internet en su zona estará interrumpido por mantenimiento de la red, de [HORA INICIO] a [HORA FIN].\n\nEstamos trabajando para mejorar el servicio. Disculpe las molestias. 🙏\n\n_WISP — Internet para todos_',
  },
  {
    nombre: 'Corte de planta externa',
    texto: '⚠️ *WISP* — Corte de planta externa\n\nHola {nombre}, le informamos que se detectó una falla en la red de fibra de su zona. El equipo técnico ya está trabajando en la solución.\n\nTiempo estimado de reposición: [TIEMPO]\n\nDisculpe las molestias. 🙏 — *WISP*',
  },
  {
    nombre: 'Aviso general',
    texto: 'Hola {nombre} 👋,\n\n[Escriba aquí el aviso]\n\n— *WISP*',
  },
];

const ESTADO_CAMPANIA_LABEL: Record<MensajeMasivo['estado'], string> = {
  en_progreso: 'Enviando…',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const ESTADO_CAMPANIA_BADGE: Record<MensajeMasivo['estado'], string> = {
  en_progreso: 'bg-lightwarning text-warning',
  completado: 'bg-lightsuccess text-success',
  cancelado: 'bg-lightsecondary text-secondary',
};

function zonaNombres(zonaIds: number[] | null, zonas: Zona[]): string {
  if (!zonaIds || zonaIds.length === 0) return 'Todas las zonas';
  return zonaIds
    .map((id) => zonas.find((z) => z.id === id)?.nombre ?? `#${id}`)
    .join(', ');
}

/** Título de grupo dentro del formulario de envío masivo. */
const Grupo = ({ titulo, extra, children }: {
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div>
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {extra}
    </div>
    {children}
  </div>
);

const ConfiguracionWhatsapp = () => {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [primeraCargaHecha, setPrimeraCargaHecha] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [pidiendoQr, setPidiendoQr] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaIdsSel, setZonaIdsSel] = useState<number[]>([]);
  const [estadosSel, setEstadosSel] = useState<string[]>(['activo']);
  const [mensaje, setMensaje] = useState('');
  const [plantillaSel, setPlantillaSel] = useState<string | null>(null);
  const [destinatariosCount, setDestinatariosCount] = useState<number | null>(null);
  const [contando, setContando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    setContando(true);
    const t = setTimeout(() => {
      contarDestinatariosMasivo({ zonaIds: zonaIdsSel, estados: estadosSel })
        .then(setDestinatariosCount)
        .catch(() => setDestinatariosCount(null))
        .finally(() => setContando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [zonaIdsSel, estadosSel]);

  function toggleZona(id: number) {
    setZonaIdsSel((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));
  }

  function toggleEstado(value: string) {
    setEstadosSel((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]));
  }

  function aplicarPlantilla(p: { nombre: string; texto: string }) {
    setPlantillaSel(p.nombre);
    setMensaje(p.texto);
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

  async function handleEnviar() {
    // Doble clic en "Confirmar y enviar" mandaría la campaña dos veces.
    if (enviando) return;
    setError(null);
    if (!mensaje.trim()) {
      setError('Escribe el mensaje.');
      return;
    }
    setEnviando(true);
    try {
      const campania = await crearMensajeMasivo({
        zona_ids: zonaIdsSel.length ? zonaIdsSel : undefined,
        estados: estadosSel,
        mensaje: mensaje.trim(),
        plantilla_nombre: plantillaSel ?? undefined,
      });
      setConfirmando(false);
      setCampaniaActiva(campania);
      seguirCampania(campania.id);
      setMensaje('');
      setPlantillaSel(null);
      reloadCampanias();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo enviar el mensaje masivo');
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
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
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lightwarning text-warning">
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
        descripcion="Avisos a toda una zona: mantenimiento, corte programado, etc."
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
            <Icon icon="tabler:clock-pause" width={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Se envía uno por uno con una pausa aleatoria entre cada mensaje, para no arriesgar
              que WhatsApp bloquee el número de la empresa.
            </p>
          </div>

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
                <span className="font-medium text-success">{campaniaActiva.enviados} enviados</span>
                {campaniaActiva.fallidos > 0 && (
                  <> · <span className="font-medium text-error">{campaniaActiva.fallidos} fallidos</span></>
                )}
                {' · '}{pct}%
              </p>
            </div>
          )}

          <Grupo
            titulo="Zonas"
            extra={
              <span className="text-xs font-normal text-muted-foreground">
                {zonaIdsSel.length === 0
                  ? 'ninguna marcada = todas'
                  : `${zonaIdsSel.length} marcada${zonaIdsSel.length === 1 ? '' : 's'}`}
              </span>
            }
          >
            <div className="flex flex-wrap gap-2">
              {zonas.map((z) => (
                <ChipSeleccion
                  key={z.id}
                  texto={z.nombre}
                  icono="tabler:map-pin"
                  activo={zonaIdsSel.includes(z.id)}
                  onClick={() => toggleZona(z.id)}
                />
              ))}
            </div>
            {zonaIdsSel.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  Se enviará a: <span className="font-medium text-foreground">{zonaNombres(zonaIdsSel, zonas)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setZonaIdsSel([])}
                  className="transition-ui text-xs text-primary underline-offset-2 hover:underline"
                >
                  Quitar selección
                </button>
              </div>
            )}
          </Grupo>

          <Grupo titulo="A quiénes les llega">
            <div className="flex flex-wrap gap-2">
              {ESTADOS_DISPONIBLES.map((e) => (
                <ChipSeleccion
                  key={e.value}
                  texto={e.label}
                  tono="success"
                  icono="tabler:square-rounded"
                  iconoActivo="tabler:square-rounded-check-filled"
                  activo={estadosSel.includes(e.value)}
                  onClick={() => toggleEstado(e.value)}
                />
              ))}
            </div>
          </Grupo>

          <Grupo titulo="Plantillas rápidas">
            <div className="flex flex-wrap gap-2">
              {PLANTILLAS.map((p) => (
                <ChipSeleccion
                  key={p.nombre}
                  texto={p.nombre}
                  tono="info"
                  icono="tabler:file-text"
                  activo={plantillaSel === p.nombre}
                  onClick={() => aplicarPlantilla(p)}
                />
              ))}
            </div>
          </Grupo>

          <FormField
            label="Mensaje"
            icon="tabler:message-2"
            htmlFor="mensajeMasivo"
            hint={
              <>
                Usa <code className="rounded bg-muted/60 px-1 py-0.5 text-xs">{'{nombre}'}</code>{' '}
                para saludar a cada cliente por su nombre.
              </>
            }
          >
            <Textarea
              id="mensajeMasivo"
              value={mensaje}
              onChange={(e) => {
                setMensaje(e.target.value);
                setPlantillaSel(null);
              }}
              placeholder="Escribe el aviso…"
              className="min-h-32"
            />
          </FormField>

          {error && <FormCallout tone="error">{error}</FormCallout>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ld pt-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon
                icon={contando ? 'tabler:loader-2' : 'tabler:users'}
                width={16}
                className={contando ? 'animate-spin' : undefined}
              />
              {contando ? (
                'Calculando destinatarios…'
              ) : (
                <>
                  Se enviará a{' '}
                  <span className="font-semibold text-foreground">{destinatariosCount ?? 0}</span>{' '}
                  cliente{destinatariosCount === 1 ? '' : 's'}
                </>
              )}
            </p>
            <Button
              onClick={() => setConfirmando(true)}
              disabled={!mensaje.trim() || !destinatariosCount || enviandoCampania}
            >
              <Icon icon="tabler:send" width={16} />
              Enviar
            </Button>
          </div>
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
                    <span className="font-medium text-success">{c.enviados}</span>/{c.total_destinatarios} enviados
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

      {/* Confirmar envío */}
      <FormDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Confirmar envío masivo"
        subtitle="Revisa a quién y qué se va a enviar"
        icon="tabler:send"
        tone="warning"
        size="md"
        footer={
          <FormActions
            onCancel={() => setConfirmando(false)}
            submitLabel="Confirmar y enviar"
            submitIcon="tabler:send"
            onSubmit={handleEnviar}
            submitting={enviando}
          />
        }
      >
        <div className="flex flex-col gap-4">
          <FormCallout>
            Se enviará a{' '}
            <span className="font-semibold">
              {destinatariosCount ?? 0} cliente{destinatariosCount === 1 ? '' : 's'}
            </span>{' '}
            de{' '}
            <span className="font-semibold">
              {zonaNombres(zonaIdsSel.length ? zonaIdsSel : null, zonas)}
            </span>
            .
          </FormCallout>

          <FormField label="Mensaje" icon="tabler:message-2">
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ld bg-surface-2 p-3 text-sm">
              {mensaje}
            </div>
          </FormField>

          <p className="text-xs text-muted-foreground">
            Se enviará de uno en uno con una pausa de 5 a 10 segundos entre cada mensaje. Puedes
            detenerlo en cualquier momento.
          </p>
        </div>
      </FormDialog>

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
