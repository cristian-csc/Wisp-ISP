import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
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

const ConfiguracionWhatsapp = () => {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
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
    if (s && !s.connected) {
      const q = await getWhatsappQr().catch(() => null);
      setQr(q?.qr ?? null);
    } else {
      setQr(null);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl">WhatsApp</h1>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            status?.connected ? 'bg-lightsuccess text-success' : 'bg-lighterror text-error'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {status?.connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${status?.connected ? 'bg-success' : 'bg-error'}`} />
          </span>
          {status?.connected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* Hero de conexión */}
      <CardBox className="max-w-lg overflow-hidden !p-0">
        <div
          className={`px-6 py-5 ${
            status?.connected
              ? 'bg-gradient-to-br from-success to-success/80'
              : 'bg-gradient-to-br from-error to-error/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm">
                <Icon icon="tabler:brand-whatsapp" height={26} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {status?.connected ? 'Número vinculado' : 'Sin vincular'}
                </p>
                <p className="text-xs text-white/80">
                  {status?.connected && status.phone ? status.phone : 'Escanea el QR para conectar'}
                </p>
              </div>
            </div>
            <Badge className="bg-white/20 text-white rounded-md border-0">
              {status?.connected ? 'Activo' : 'Pendiente'}
            </Badge>
          </div>
        </div>

        <div className="p-6">
          {!status?.connected && (
            <div className="flex flex-col items-center gap-4">
              {qr ? (
                <>
                  <div className="relative rounded-2xl border-4 border-lightsuccess p-2">
                    <img src={qr} alt="Código QR de WhatsApp" className="w-52 h-52 rounded-lg" />
                  </div>
                  <ol className="w-full space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lightprimary text-primary text-[10px] font-bold">1</span>
                      Abre WhatsApp en el teléfono de la empresa
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lightprimary text-primary text-[10px] font-bold">2</span>
                      Ve a Configuración → Dispositivos vinculados
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lightprimary text-primary text-[10px] font-bold">3</span>
                      Toca "Vincular un dispositivo" y escanea este código
                    </li>
                  </ol>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Icon icon="tabler:loader-2" height={28} className="animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Generando código QR…</p>
                </div>
              )}
            </div>
          )}

          {status?.connected && (
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <Icon icon="tabler:info-circle" height={16} className="text-success shrink-0 mt-0.5" />
              Los avisos de pago, cobro, corte y confirmaciones se envían desde este número.
            </p>
          )}

          {status?.error && <p className="text-sm text-error mt-3">{status.error}</p>}
        </div>
      </CardBox>

      {/* Recordatorio de pago a morosos */}
      <CardBox className="p-0 overflow-hidden border-l-4 border-l-warning">
        <div className="flex items-center justify-between flex-wrap gap-3 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lightwarning text-warning">
              <Icon icon="tabler:cash" height={20} />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Recordatorio de pago a morosos</h3>
              <p className="text-xs text-muted-foreground">Avisa a todos los clientes activos que no han pagado este mes.</p>
            </div>
          </div>
          <Button
            variant="lightwarning"
            size="sm"
            onClick={() => setConfirmandoCobros(true)}
            disabled={campaniaActiva?.estado === 'en_progreso'}
          >
            <Icon icon="tabler:send" height={14} className="mr-1" />
            Enviar recordatorios
          </Button>
        </div>
      </CardBox>

      {/* Mensaje masivo */}
      <CardBox className="p-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lightprimary text-primary">
            <Icon icon="tabler:speakerphone" height={20} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Mensaje masivo</h3>
            <p className="text-xs text-muted-foreground">
              Para avisos a toda una zona (mantenimiento, corte programado, etc.)
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-5 pl-14">
          Se envía uno por uno con una pausa aleatoria entre cada mensaje para no arriesgar que WhatsApp bloquee el número.
        </p>

        {campaniaActiva?.estado === 'en_progreso' && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-lightprimary/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Icon icon="tabler:loader-2" height={15} className="animate-spin text-primary" />
                Enviando… {campaniaActiva.enviados + campaniaActiva.fallidos} / {campaniaActiva.total_destinatarios}
              </p>
              <Button size="sm" variant="lighterror" onClick={() => handleCancelar(campaniaActiva.id)}>
                Detener envío
              </Button>
            </div>
            <div className="h-2.5 w-full rounded-full bg-white/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="text-success font-medium">{campaniaActiva.enviados} enviados</span>
              {campaniaActiva.fallidos > 0 && <> · <span className="text-error font-medium">{campaniaActiva.fallidos} fallidos</span></>}
              {' · '}{pct}%
            </p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
              Zonas <span className="font-normal normal-case">(ninguna seleccionada = todas)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {zonas.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => toggleZona(z.id)}
                  className={`flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 transition-colors ${
                    zonaIdsSel.includes(z.id)
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-ld hover:bg-primary/5'
                  }`}
                >
                  <Icon icon="tabler:map-pin" height={12} />
                  {z.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">A quiénes les llega</p>
            <div className="flex flex-wrap gap-2">
              {ESTADOS_DISPONIBLES.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => toggleEstado(e.value)}
                  className={`flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 transition-colors ${
                    estadosSel.includes(e.value)
                      ? 'border-success bg-success/10 text-success font-semibold'
                      : 'border-ld hover:bg-success/5'
                  }`}
                >
                  <Icon icon={estadosSel.includes(e.value) ? 'tabler:square-rounded-check-filled' : 'tabler:square-rounded'} height={14} />
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Plantillas rápidas</p>
            <div className="flex flex-wrap gap-2">
              {PLANTILLAS.map((p) => (
                <button
                  key={p.nombre}
                  type="button"
                  onClick={() => aplicarPlantilla(p)}
                  className={`flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 transition-colors ${
                    plantillaSel === p.nombre
                      ? 'border-info bg-info/10 text-info font-semibold'
                      : 'border-ld hover:bg-info/5'
                  }`}
                >
                  <Icon icon="tabler:file-text" height={12} />
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
              Mensaje <span className="font-normal normal-case">— usa <code className="text-xs bg-muted/60 rounded px-1 py-0.5">{'{nombre}'}</code> para saludar a cada cliente por su nombre</span>
            </p>
            <Textarea
              value={mensaje}
              onChange={(e) => { setMensaje(e.target.value); setPlantillaSel(null); }}
              placeholder="Escribe el aviso…"
              className="min-h-32"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {contando ? 'Calculando destinatarios…' : (
                <>Se enviará a <span className="font-semibold text-foreground">{destinatariosCount ?? 0}</span> cliente{destinatariosCount === 1 ? '' : 's'}</>
              )}
            </p>
            <Button
              onClick={() => setConfirmando(true)}
              disabled={!mensaje.trim() || !destinatariosCount || campaniaActiva?.estado === 'en_progreso'}
            >
              <Icon icon="tabler:send" height={16} className="mr-1" />
              Enviar
            </Button>
          </div>
        </div>
      </CardBox>

      {/* Historial */}
      <CardBox className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lightsecondary text-secondary">
            <Icon icon="tabler:history" height={20} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Historial de envíos masivos</h3>
            <p className="text-xs text-muted-foreground">Qué se mandó, a quién y quién lo envió.</p>
          </div>
        </div>
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
                <TableCell colSpan={7} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Icon icon="tabler:mail-opened" height={32} className="text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No se ha enviado ningún mensaje masivo todavía.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {campanias.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/30">
                <TableCell className="text-sm max-w-[10rem] truncate">{zonaNombres(c.zona_ids, zonas)}</TableCell>
                <TableCell className="text-sm max-w-xs truncate">{c.mensaje}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="text-success font-medium">{c.enviados}</span>/{c.total_destinatarios} enviados
                  {c.fallidos > 0 && <> · <span className="text-error font-medium">{c.fallidos} fallidos</span></>}
                </TableCell>
                <TableCell><Badge className={`${ESTADO_CAMPANIA_BADGE[c.estado]} rounded-md`}>{ESTADO_CAMPANIA_LABEL[c.estado]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(c.creado_en).toLocaleString('es-PE')}</TableCell>
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
      </CardBox>

      {/* Confirmar envío */}
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar envío masivo</DialogTitle></DialogHeader>
          <p className="text-sm">
            Se enviará a <span className="font-semibold">{destinatariosCount ?? 0} cliente{destinatariosCount === 1 ? '' : 's'}</span> de{' '}
            <span className="font-semibold">{zonaNombres(zonaIdsSel.length ? zonaIdsSel : null, zonas)}</span>.
          </p>
          <div className="rounded-lg border border-ld bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
            {mensaje}
          </div>
          <p className="text-xs text-muted-foreground">
            Se enviará de uno en uno con una pausa de 5 a 10 segundos entre cada mensaje. Puedes detenerlo en cualquier momento.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button onClick={handleEnviar} disabled={enviando}>Confirmar y enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar recordatorio de cobros */}
      <Dialog open={confirmandoCobros} onOpenChange={setConfirmandoCobros}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar recordatorio de pago</DialogTitle></DialogHeader>
          <p className="text-sm">
            Se enviará el aviso de pago pendiente a todos los clientes <span className="font-semibold">activos</span> que no
            registran pago del mes actual.
          </p>
          <p className="text-xs text-muted-foreground">
            Se enviará de uno en uno con una pausa de 5 a 10 segundos entre cada mensaje. Puedes detenerlo en cualquier momento.
          </p>
          {errorCobros && <p className="text-sm text-error">{errorCobros}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoCobros(false)}>Cancelar</Button>
            <Button onClick={handleEnviarCobros} disabled={enviandoCobros}>Confirmar y enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfiguracionWhatsapp;
