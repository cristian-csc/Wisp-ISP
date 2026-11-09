import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Button } from 'src/components/ui/button';
import type { DescripcionEstado } from './estadoConexion';

interface Props {
  estado: DescripcionEstado;
  /** La imagen del QR tal como la devuelve el bot (data URL). Nunca se inventa. */
  qr: string | null;
  pidiendoQr: boolean;
  onGenerarQr: () => void;
  /** Teléfono vinculado, si lo hay */
  telefono?: string | null;
}

const CABECERA: Record<DescripcionEstado['estado'], string> = {
  conectado: 'bg-success',
  desconectado: 'bg-error',
  error: 'bg-error',
  conectando: 'bg-warning',
};

/** Tarjeta de vinculación: cabecera de color según el estado, el código QR
 *  real y el botón para pedirlo. No simula conexiones ni genera códigos
 *  falsos: si el bot no da QR, se dice. */
const PanelVinculacion = ({ estado, qr, pidiendoQr, onGenerarQr, telefono }: Props) => {
  const conectado = estado.estado === 'conectado';

  return (
    <CardBox className="flex h-full flex-col overflow-hidden !p-0">
      <div className={`flex flex-wrap items-center gap-3 px-5 py-4 ${CABECERA[estado.estado]}`}>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-white">
          <Icon icon={conectado ? 'tabler:brand-whatsapp' : estado.icono} width={23} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{estado.titulo}</p>
          <p className="truncate text-xs text-white/85">{estado.detalle}</p>
        </div>
        <span className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold text-white">
          {conectado ? 'Activo' : 'Pendiente'}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-6">
        {conectado && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-lightsuccess text-success">
              <Icon icon="tabler:circle-check" width={34} />
            </span>
            <div>
              <p className="text-sm font-semibold">WhatsApp está vinculado</p>
              {telefono && <p className="mt-0.5 text-sm text-muted-foreground">{telefono}</p>}
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              Los avisos de pago, cobro, corte y las confirmaciones salen desde este número.
            </p>
          </div>
        )}

        {!conectado && qr && (
          <>
            <div className="rounded-2xl border-4 border-lightsuccess bg-white p-2">
              <img src={qr} alt="Código QR para vincular WhatsApp" className="size-48 rounded-lg" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              El código cambia cada pocos segundos. Si caduca, se genera otro solo.
            </p>
          </>
        )}

        {!conectado && !qr && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="grid size-16 place-items-center rounded-2xl border-2 border-dashed border-ld text-muted-foreground">
              <Icon icon={pidiendoQr ? 'tabler:loader-2' : 'tabler:qrcode'} width={30}
                    className={pidiendoQr ? 'animate-spin' : undefined} />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              {pidiendoQr
                ? 'Pidiendo el código al servicio de WhatsApp…'
                : estado.estado === 'error'
                  ? 'Sin el servicio de WhatsApp en marcha no se puede generar el código.'
                  : 'Todavía no hay un código disponible.'}
            </p>
          </div>
        )}

        {!conectado && (
          <Button onClick={onGenerarQr} disabled={pidiendoQr} className="w-full max-w-xs">
            <Icon icon={pidiendoQr ? 'tabler:loader-2' : 'tabler:qrcode'} width={17}
                  className={pidiendoQr ? 'animate-spin' : undefined} />
            {pidiendoQr ? 'Generando…' : 'Generar código QR'}
          </Button>
        )}

        {estado.estado === 'error' && (
          <div className="flex w-full items-start gap-2.5 rounded-xl border border-error/30 bg-lighterror px-3.5 py-3">
            <Icon icon="tabler:alert-triangle" width={17} className="mt-0.5 shrink-0 text-error" />
            <div className="min-w-0 text-xs">
              <p className="break-words font-semibold text-error-text">{estado.mensajeError}</p>
              <p className="mt-1 text-muted-foreground">
                Suele pasar cuando el servicio de WhatsApp está apagado. Revisa que esté en marcha
                y vuelve a intentarlo.
              </p>
            </div>
          </div>
        )}
      </div>
    </CardBox>
  );
};

export default PanelVinculacion;
