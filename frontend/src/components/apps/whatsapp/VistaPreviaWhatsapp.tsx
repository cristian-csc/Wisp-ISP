import { Fragment, type ReactNode } from 'react';

/** Convierte el formato de WhatsApp (*negrita*, _cursiva_, ~tachado~) en lo
 *  que se verá en el teléfono. Solo eso: no interpreta ningún HTML. */
function conFormato(linea: string): ReactNode[] {
  const partes = linea.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return partes.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

interface Props {
  mensaje: string;
  /** Con qué nombre se muestra {nombre} en la vista previa. */
  nombreEjemplo?: string;
}

/** El aviso tal como lo verá un cliente en WhatsApp. */
const VistaPreviaWhatsapp = ({ mensaje, nombreEjemplo = 'María' }: Props) => {
  const texto = mensaje.replace(/\{nombre\}/g, nombreEjemplo);
  const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rounded-xl bg-[#efeae2] p-4 dark:bg-[#0b141a]">
      {texto.trim() ? (
        <div className="relative ms-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 pb-1.5 pt-2 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
          <p className="whitespace-pre-wrap break-words leading-snug">
            {texto.split('\n').map((l, i, todas) => (
              <Fragment key={i}>
                {conFormato(l)}
                {i < todas.length - 1 && '\n'}
              </Fragment>
            ))}
          </p>
          <p className="mt-1 text-right text-[11px] text-[#667781] dark:text-[#8696a0]">{hora}</p>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-[#667781]">Aquí verás el aviso como le llegará al cliente.</p>
      )}
    </div>
  );
};

export default VistaPreviaWhatsapp;
