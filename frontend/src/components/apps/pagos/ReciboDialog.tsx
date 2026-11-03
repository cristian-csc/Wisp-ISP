import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { Button } from 'src/components/ui/button';
import { FormCallout, FormDialog } from 'src/components/shared/form';
import {
  getPago,
  getReciboPdfBlobUrl,
  reenviarConfirmacionWhatsapp,
  etiquetaMes,
  mesesCubiertos,
  type Pago,
} from 'src/lib/pagos';

interface Props {
  pagoId: number | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Muestra el recibo tal cual lo recibe el cliente: el mismo PDF que se manda
 * por WhatsApp, para que lo impreso y lo enviado nunca difieran.
 */
const ReciboDialog = ({ pagoId, onOpenChange }: Props) => {
  const [pago, setPago] = useState<Pago | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState<{ ok: boolean; mensaje: string } | null>(
    null,
  );

  useEffect(() => {
    setResultadoEnvio(null);
    if (!pagoId) {
      setPago(null);
      return;
    }
    getPago(pagoId).then(setPago);

    let anulado = false;
    let urlCreada: string | null = null;
    setCargandoPdf(true);
    getReciboPdfBlobUrl(pagoId)
      .then((url) => {
        urlCreada = url;
        if (anulado) {
          URL.revokeObjectURL(url);
          return;
        }
        setPdfUrl(url);
      })
      .catch(() =>
        setResultadoEnvio({ ok: false, mensaje: 'No se pudo generar el PDF del recibo' }),
      )
      .finally(() => !anulado && setCargandoPdf(false));

    // Al cerrar se suelta el blob: si no, se queda en memoria del navegador
    return () => {
      anulado = true;
      setPdfUrl(null);
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
  }, [pagoId]);

  function handleAbrir() {
    if (pdfUrl) window.open(pdfUrl, '_blank', 'noopener');
  }

  async function handleEnviarWhatsapp() {
    if (!pago) return;
    setEnviando(true);
    setResultadoEnvio(null);
    try {
      const res = await reenviarConfirmacionWhatsapp(pago.id);
      setResultadoEnvio({ ok: true, mensaje: `Recibo enviado a ${res.telefono}` });
    } catch (err: any) {
      setResultadoEnvio({ ok: false, mensaje: err?.response?.data?.detail ?? 'No se pudo enviar' });
    } finally {
      setEnviando(false);
    }
  }

  /** El número del recibo es el del grupo cuando el cobro fue adelantado: así
   *  el título dice lo mismo que el PDF, se abra desde el mes que se abra. */
  const numeroRecibo = pago ? (pago.adelanto?.numero ?? pago.id) : null;

  /** Un cobro adelantado cubre varios meses; uno normal, solo el suyo. */
  const mesesDelRecibo = pago
    ? pago.adelanto
      ? mesesCubiertos(pago.adelanto.desde, pago.adelanto.meses)
      : [pago.mes_pagado]
    : [];
  const periodo =
    mesesDelRecibo.length > 1
      ? `${etiquetaMes(mesesDelRecibo[0])} a ${etiquetaMes(mesesDelRecibo[mesesDelRecibo.length - 1])}`
      : mesesDelRecibo.length === 1
        ? etiquetaMes(mesesDelRecibo[0])
        : '';

  return (
    <FormDialog
      open={!!pagoId}
      onOpenChange={onOpenChange}
      title={numeroRecibo ? `Recibo N° ${numeroRecibo}` : 'Recibo de pago'}
      subtitle={periodo ? `${pago?.cliente?.nombre ?? ''} · ${periodo}` : undefined}
      icon="tabler:receipt"
      tone="success"
      size="md"
      footer={
        pago ? (
          <>
            <Button
              variant="outline"
              disabled={!pdfUrl}
              onClick={handleAbrir}
              className="gap-2"
            >
              <Icon icon="tabler:printer" width={17} />
              Abrir e imprimir
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a href={pdfUrl ?? '#'} download={`recibo-${numeroRecibo}.pdf`}>
                <Icon icon="tabler:download" width={17} />
                Descargar
              </a>
            </Button>
            <Button
              variant="outlinesuccess"
              disabled={enviando}
              onClick={handleEnviarWhatsapp}
              className="gap-2"
            >
              <Icon icon="tabler:brand-whatsapp" width={17} />
              {enviando ? 'Enviando…' : 'Enviar por WhatsApp'}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {cargandoPdf && (
          <p className="py-8 text-center text-sm text-muted-foreground">Generando el recibo…</p>
        )}
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            title={`Recibo ${numeroRecibo ?? ''}`}
            className="h-[60vh] w-full rounded-xl border border-ld bg-white"
          />
        )}
        {resultadoEnvio && (
          <FormCallout tone={resultadoEnvio.ok ? 'success' : 'error'}>
            {resultadoEnvio.mensaje}
          </FormCallout>
        )}
      </div>
    </FormDialog>
  );
};

export default ReciboDialog;
