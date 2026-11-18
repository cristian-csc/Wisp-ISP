import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import OpcionMarcable from 'src/components/shared/OpcionMarcable';
import Pasos from 'src/components/shared/Pasos';
import { FormCallout } from 'src/components/shared/form';
import { Button } from 'src/components/ui/button';
import { Textarea } from 'src/components/ui/textarea';
import { contarDestinatariosMasivo, crearMensajeMasivo, type MensajeMasivo } from 'src/lib/whatsapp';
import type { Zona } from 'src/lib/zonas';
import VistaPreviaWhatsapp from './VistaPreviaWhatsapp';

const ESTADOS: { valor: string; titulo: string; descripcion: string }[] = [
  { valor: 'activo', titulo: 'Activos', descripcion: 'Tienen el servicio funcionando' },
  { valor: 'pausado', titulo: 'Pausados', descripcion: 'Pidieron pausar el servicio' },
  { valor: 'suspendido', titulo: 'Suspendidos', descripcion: 'Cortados por falta de pago' },
];

const PLANTILLAS: { nombre: string; descripcion: string; texto: string }[] = [
  {
    nombre: 'Mantenimiento programado',
    descripcion: 'Corte con fecha y hora avisadas',
    texto: '🔧 *WISP* — Mantenimiento programado\n\nHola {nombre} 👋, le informamos que el [FECHA] el servicio de internet en su zona estará interrumpido por mantenimiento de la red, de [HORA INICIO] a [HORA FIN].\n\nEstamos trabajando para mejorar el servicio. Disculpe las molestias. 🙏\n\n_WISP — Internet para todos_',
  },
  {
    nombre: 'Corte de planta externa',
    descripcion: 'Falla en la red que ya se está atendiendo',
    texto: '⚠️ *WISP* — Corte de planta externa\n\nHola {nombre}, le informamos que se detectó una falla en la red de fibra de su zona. El equipo técnico ya está trabajando en la solución.\n\nTiempo estimado de reposición: [TIEMPO]\n\nDisculpe las molestias. 🙏 — *WISP*',
  },
  {
    nombre: 'Aviso general',
    descripcion: 'Escribe tu propio aviso',
    texto: 'Hola {nombre} 👋,\n\n[Escriba aquí el aviso]\n\n— *WISP*',
  },
];

/** Segundos promedio entre mensajes: el servidor espera de 5 a 10. */
const PAUSA_PROMEDIO = 7.5;

function duracionEstimada(total: number): string {
  const min = Math.ceil((total * PAUSA_PROMEDIO) / 60);
  if (min <= 1) return 'menos de 2 min';
  return min < 60 ? `unos ${min} min` : `unas ${Math.round(min / 6) / 10} h`;
}

interface Props {
  zonas: Zona[];
  /** Bloquea el asistente mientras otro envío está en curso. */
  ocupado: boolean;
  onEnviado: (campania: MensajeMasivo) => void;
}

/** Envío de un aviso a muchos clientes, en tres pasos: a quién, qué mensaje y
 *  revisar antes de enviar. El último paso es la confirmación: no hay una
 *  ventana extra que lo repita. */
const EnvioMasivo = ({ zonas, ocupado, onEnviado }: Props) => {
  const [paso, setPaso] = useState(0);
  const [zonaIds, setZonaIds] = useState<number[]>([]);
  const [estados, setEstados] = useState<string[]>(['activo']);
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [porEstado, setPorEstado] = useState<Record<string, number | null>>({});
  const [contando, setContando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Cuántos reciben el aviso, total y por tipo, según las zonas elegidas.
  useEffect(() => {
    setContando(true);
    const t = setTimeout(() => {
      Promise.all([
        estados.length ? contarDestinatariosMasivo({ zonaIds, estados }) : Promise.resolve(0),
        ...ESTADOS.map((e) => contarDestinatariosMasivo({ zonaIds, estados: [e.valor] }).catch(() => null)),
      ])
        .then(([t, ...partes]) => {
          setTotal(t);
          setPorEstado(Object.fromEntries(ESTADOS.map((e, i) => [e.valor, partes[i]])));
        })
        .catch(() => setTotal(null))
        .finally(() => setContando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [zonaIds, estados]);

  const alternar = <T,>(lista: T[], valor: T) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  const pendientes = [...new Set(mensaje.match(/\[[^\]\n]+\]/g) ?? [])];
  const nombresZonas = zonaIds.length === 0 ? 'Todas las zonas' : zonas.filter((z) => zonaIds.includes(z.id)).map((z) => z.nombre).join(', ');
  const nombresEstados = ESTADOS.filter((e) => estados.includes(e.valor)).map((e, i) => (i ? e.titulo.toLowerCase() : e.titulo)).join(', ');

  const puedeSeguir = [
    estados.length > 0 && !!total && !contando,
    mensaje.trim().length > 0 && pendientes.length === 0,
    true,
  ];

  function insertarNombre() {
    const el = campo.current;
    const i = el?.selectionStart ?? mensaje.length;
    const f = el?.selectionEnd ?? mensaje.length;
    const nuevo = mensaje.slice(0, i) + '{nombre}' + mensaje.slice(f);
    setMensaje(nuevo);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(i + 8, i + 8);
    });
  }

  async function enviar() {
    if (enviando || !total) return;
    setEnviando(true);
    setError(null);
    try {
      const campania = await crearMensajeMasivo({
        zona_ids: zonaIds.length ? zonaIds : undefined,
        estados,
        mensaje: mensaje.trim(),
        plantilla_nombre: plantilla ?? undefined,
      });
      toast.success(`Envío iniciado a ${total} cliente${total === 1 ? '' : 's'}`);
      onEnviado(campania);
      setPaso(0);
      setMensaje('');
      setPlantilla(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo iniciar el envío. Revisa la conexión de WhatsApp e inténtalo otra vez.');
    } finally {
      setEnviando(false);
    }
  }

  const textoTotal = contando ? 'Calculando…' : `${total ?? 0} cliente${total === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col">
      <div className="border-b border-ld px-5 py-3">
        <Pasos
          actual={paso}
          onIr={ocupado ? undefined : setPaso}
          pasos={[
            { titulo: 'A quién', resumen: `${textoTotal} · ${nombresZonas}` },
            { titulo: 'Mensaje', resumen: plantilla ?? 'Mensaje propio' },
            { titulo: 'Revisar y enviar' },
          ]}
        />
      </div>

      <div className="p-5">
        {paso === 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Zonas</legend>
              <p className="mb-3 text-xs text-muted-foreground">Si no marcas ninguna, el aviso va a todas.</p>
              <div className="flex flex-col gap-2">
                <OpcionMarcable
                  titulo="Todas las zonas"
                  icono="tabler:world"
                  marcada={zonaIds.length === 0}
                  onCambiar={() => setZonaIds([])}
                  tipo="unica"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {zonas.map((z) => (
                    <OpcionMarcable
                      key={z.id}
                      titulo={z.nombre}
                      marcada={zonaIds.includes(z.id)}
                      onCambiar={() => setZonaIds((l) => alternar(l, z.id))}
                    />
                  ))}
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Clientes que lo reciben</legend>
              <p className="mb-3 text-xs text-muted-foreground">La cifra es cuántos hay en las zonas elegidas.</p>
              <div className="flex flex-col gap-2">
                {ESTADOS.map((e) => (
                  <OpcionMarcable
                    key={e.valor}
                    titulo={e.titulo}
                    descripcion={e.descripcion}
                    cuenta={contando ? '…' : porEstado[e.valor]}
                    marcada={estados.includes(e.valor)}
                    onCambiar={() => setEstados((l) => alternar(l, e.valor))}
                  />
                ))}
              </div>
              {estados.length === 0 && (
                <p className="mt-2 text-sm text-error-text">Marca al menos un tipo de cliente.</p>
              )}
            </fieldset>
          </div>
        )}

        {paso === 1 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="flex min-w-0 flex-col gap-4">
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">Empieza con una plantilla</legend>
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                  {PLANTILLAS.map((p) => (
                    <OpcionMarcable
                      key={p.nombre}
                      tipo="unica"
                      titulo={p.nombre}
                      descripcion={p.descripcion}
                      marcada={plantilla === p.nombre}
                      onCambiar={() => {
                        setPlantilla(p.nombre);
                        setMensaje(p.texto);
                      }}
                    />
                  ))}
                </div>
              </fieldset>

              <div>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <label htmlFor="mensajeMasivo" className="text-sm font-semibold">
                    Mensaje
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={insertarNombre}>
                    <Icon icon="tabler:user" width={16} />
                    Insertar nombre del cliente
                  </Button>
                </div>
                <Textarea
                  id="mensajeMasivo"
                  ref={campo}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Escribe el aviso o elige una plantilla."
                  className="min-h-56 font-normal leading-relaxed"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  *texto* sale en negrita y _texto_ en cursiva. {mensaje.length} caracteres.
                </p>
              </div>

              {pendientes.length > 0 && (
                <FormCallout tone="warning">
                  Completa {pendientes.join(', ')} antes de seguir: así llegaría tal cual al cliente.
                </FormCallout>
              )}
            </div>

            <div className="min-w-0">
              <p className="mb-3 text-sm font-semibold">Así le llega al cliente</p>
              <VistaPreviaWhatsapp mensaje={mensaje} />
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <dl className="divide-y divide-border rounded-xl border border-ld">
              {[
                ['Destinatarios', textoTotal],
                ['Zonas', nombresZonas],
                ['Tipo de cliente', nombresEstados],
                ['Tiempo aproximado', total ? duracionEstimada(total) : '—'],
              ].map(([t, v]) => (
                <div key={t} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <dt className="text-muted-foreground">{t}</dt>
                  <dd className="min-w-0 text-right font-medium">{v}</dd>
                </div>
              ))}
              <div className="px-4 py-3 text-xs text-muted-foreground">
                Se envía de uno en uno, con una pausa de 5 a 10 segundos entre mensajes, para que
                WhatsApp no bloquee el número de la empresa. Puedes detenerlo en cualquier momento.
              </div>
            </dl>
            <div className="min-w-0">
              <p className="mb-3 text-sm font-semibold">Mensaje</p>
              <VistaPreviaWhatsapp mensaje={mensaje} />
            </div>
          </div>
        )}

        {error && <FormCallout tone="error" className="mt-4">{error}</FormCallout>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ld px-5 py-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon icon={contando ? 'tabler:loader-2' : 'tabler:users'} width={16} className={contando ? 'animate-spin' : ''} />
          Llegará a <span className="font-semibold text-foreground">{textoTotal}</span>
        </p>
        <div className="flex gap-2">
          {paso > 0 && (
            <Button type="button" variant="outline" onClick={() => setPaso((p) => p - 1)} disabled={enviando}>
              Atrás
            </Button>
          )}
          {paso < 2 ? (
            <Button type="button" onClick={() => setPaso((p) => p + 1)} disabled={!puedeSeguir[paso] || ocupado}>
              Siguiente
              <Icon icon="tabler:arrow-right" width={16} />
            </Button>
          ) : (
            <Button type="button" onClick={enviar} disabled={enviando || ocupado || !total}>
              <Icon icon={enviando ? 'tabler:loader-2' : 'tabler:send'} width={16} className={enviando ? 'animate-spin' : ''} />
              {enviando ? 'Iniciando…' : `Enviar a ${textoTotal}`}
            </Button>
          )}
        </div>
      </div>
      {ocupado && (
        <p className="border-t border-ld px-5 py-3 text-xs text-muted-foreground">
          Hay un envío en curso. Podrás preparar otro cuando termine.
        </p>
      )}
    </div>
  );
};

export default EnvioMasivo;
