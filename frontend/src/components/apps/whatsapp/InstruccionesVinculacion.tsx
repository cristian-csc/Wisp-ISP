import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';

const PASOS: { texto: string; icono: string }[] = [
  { texto: 'Pulsa «Generar código QR».', icono: 'tabler:qrcode' },
  { texto: 'Abre WhatsApp en el teléfono de la empresa.', icono: 'tabler:device-mobile' },
  { texto: 'Entra en Dispositivos vinculados.', icono: 'tabler:devices' },
  { texto: 'Elige Vincular un dispositivo.', icono: 'tabler:plus' },
  { texto: 'Escanea el código y espera la confirmación.', icono: 'tabler:scan' },
];

/** Tarjeta informativa: solo explica cómo se vincula. No ejecuta nada. */
const InstruccionesVinculacion = () => (
  <CardBox className="flex h-full flex-col overflow-hidden !p-0">
    <div className="flex items-center gap-3 border-b border-ld px-5 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lightsuccess text-success">
        <Icon icon="tabler:brand-whatsapp" width={21} />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">¿Cómo vincular WhatsApp?</h2>
        <p className="text-xs text-muted-foreground">Cinco pasos, desde el teléfono de la empresa</p>
      </div>
    </div>

    <ol className="flex flex-1 flex-col gap-1 px-5 py-4">
      {PASOS.map((paso, i) => (
        <li key={paso.texto} className="flex items-start gap-3 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lightprimary text-xs font-bold text-primary">
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 items-start gap-2 pt-0.5">
            <Icon icon={paso.icono} width={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="min-w-0 text-sm leading-snug">{paso.texto}</p>
          </div>
        </li>
      ))}
    </ol>

    <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
      <Icon icon="tabler:bulb" width={16} className="mt-0.5 shrink-0 text-warning" />
      <p className="text-xs text-muted-foreground">
        Usa siempre el <span className="font-medium text-foreground">mismo teléfono de la empresa</span>.
        Si lo vinculas con otro número, los clientes recibirán los avisos desde ese número.
      </p>
    </div>
  </CardBox>
);

export default InstruccionesVinculacion;
