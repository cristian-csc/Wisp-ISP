import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'src/components/ui/dialog';
import { getPago, reenviarConfirmacionWhatsapp, type Pago } from 'src/lib/pagos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function labelMes(mesPagado: string) {
  const [anio, mes] = mesPagado.split('-').map(Number);
  return `${MESES[mes - 1]} ${anio}`;
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  otro: 'Otro',
};

interface Props {
  pagoId: number | null;
  onOpenChange: (open: boolean) => void;
}

const ReciboDialog = ({ pagoId, onOpenChange }: Props) => {
  const [pago, setPago] = useState<Pago | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState<{ ok: boolean; mensaje: string } | null>(null);

  useEffect(() => {
    if (pagoId) getPago(pagoId).then(setPago);
    else setPago(null);
    setResultadoEnvio(null);
  }, [pagoId]);

  async function handleEnviarWhatsapp() {
    if (!pago) return;
    setEnviando(true);
    setResultadoEnvio(null);
    try {
      const res = await reenviarConfirmacionWhatsapp(pago.id);
      setResultadoEnvio({ ok: true, mensaje: `Enviado a ${res.telefono}` });
    } catch (err: any) {
      setResultadoEnvio({ ok: false, mensaje: err?.response?.data?.detail ?? 'No se pudo enviar' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={!!pagoId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #ticket-imprimible, #ticket-imprimible * { visibility: visible; }
            #ticket-imprimible { position: fixed; top: 0; left: 0; }
            .no-print { display: none !important; }
          }
        `}</style>
        <DialogHeader className="no-print">
          <DialogTitle>Recibo de pago</DialogTitle>
        </DialogHeader>

        {pago && (
          <>
            <div
              id="ticket-imprimible"
              className="bg-white text-black font-mono text-xs mx-auto border border-dashed border-ld rounded-md"
              style={{ width: '80mm', padding: '4mm' }}
            >
              <div className="text-center mb-2">
                <p className="text-sm font-bold">WISP</p>
                <p>Ingeniería en Redes y Telecomunicaciones</p>
                <p>Comprobante de pago</p>
              </div>
              <div className="border-t border-dashed border-black my-2" />
              <p>Folio: #{pago.id}</p>
              <p>Fecha de emisión: {pago.fecha_pago}</p>
              <div className="border-t border-dashed border-black my-2" />
              <p>Cliente: {pago.cliente?.nombre ?? `#${pago.cliente_id}`}</p>
              <p>Mes pagado: {labelMes(pago.mes_pagado)}</p>
              <p>Método de pago: {METODO_LABEL[pago.metodo_pago] ?? pago.metodo_pago}</p>
              {pago.numero_operacion && <p>N° operación: {pago.numero_operacion}</p>}
              <div className="border-t border-dashed border-black my-2" />
              <p className="text-sm font-bold text-center">TOTAL PAGADO: S/ {pago.monto.toFixed(2)}</p>
              <div className="border-t border-dashed border-black my-2" />
              <p className="text-center">¡Gracias por su pago!</p>
              <p className="text-center">WISP — Internet para todos</p>
              <p className="text-center mt-2" style={{ fontSize: '9px' }}>
                Comprobante interno — no es boleta ni factura electrónica (SUNAT)
              </p>
            </div>

            <div className="no-print flex gap-2">
              <Button onClick={() => window.print()}>
                <Icon icon="tabler:printer" height={16} className="mr-1" />
                Imprimir
              </Button>
              <Button variant="outlinesuccess" disabled={enviando} onClick={handleEnviarWhatsapp}>
                <Icon icon="tabler:brand-whatsapp" height={16} className="mr-1" />
                {enviando ? 'Enviando…' : 'Enviar por WhatsApp'}
              </Button>
            </div>
            {resultadoEnvio && (
              <p className={`no-print text-xs ${resultadoEnvio.ok ? 'text-success' : 'text-error'}`}>
                {resultadoEnvio.mensaje}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReciboDialog;
