import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { FormActions, FormDialog } from 'src/components/shared/form';
import { Button } from 'src/components/ui/button';
import { getCliente, type ClienteListItem, type ClienteOut } from 'src/lib/clientes';
import { listEvidenciasCliente, getEvidenciaBlobUrl } from 'src/lib/evidencias';

/** Cuántos días faltan (o sobran) para el vencimiento. */
function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}

function Dato({
  icono,
  etiqueta,
  children,
}: {
  icono: string;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon icon={icono} height={17} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
        <div className="text-sm font-medium break-words">{children}</div>
      </div>
    </div>
  );
}

/**
 * La ficha de un cliente, en lo que cabe en una ventana.
 *
 * Es para lo que se hace diez veces al día: mirar si debe, llamarlo, ver dónde
 * vive. No reemplaza a la ficha completa —que tiene diez secciones, el
 * calendario de pagos, el historial y las evidencias—, le ahorra el viaje:
 * desde acá se vuelve a la lista con el filtro y la búsqueda intactos, que es
 * lo que se pierde al navegar.
 *
 * Abre al instante con lo que la lista ya sabe y va completando la dirección y
 * las fotos cuando llegan, en vez de enseñar una ventana vacía esperando.
 */
const ClienteVistaRapida = ({
  cliente,
  onOpenChange,
  estadoLabel,
  estadoBadge,
}: {
  cliente: ClienteListItem | null;
  onOpenChange: (abierto: boolean) => void;
  estadoLabel: string;
  estadoBadge: string;
}) => {
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<ClienteOut | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);

  useEffect(() => {
    setDetalle(null);
    setFotos([]);
    if (!cliente) return;
    let vigente = true;

    getCliente(cliente.id)
      .then((d) => vigente && setDetalle(d))
      .catch(() => {});

    listEvidenciasCliente(cliente.id)
      .then(async (evs) => {
        // Solo las primeras: es una tira de muestra, no la galería.
        const urls = await Promise.all(evs.slice(0, 4).map((e) => getEvidenciaBlobUrl(e.id)));
        if (vigente) setFotos(urls);
      })
      .catch(() => {});

    return () => {
      vigente = false;
    };
  }, [cliente?.id]);

  if (!cliente) return null;

  const dias = diasHasta(cliente.fecha_vencimiento);
  const debe = dias !== null && dias < 0;
  const telefono = detalle?.telefono_whatsapp || cliente.telefono;
  const wa = telefono ? telefono.replace(/\D/g, '') : null;

  return (
    <FormDialog
      open={!!cliente}
      onOpenChange={onOpenChange}
      title={cliente.nombre}
      subtitle={`${cliente.tipo_documento === 'ruc' ? 'RUC' : 'DNI'} ${
        cliente.ruc ?? cliente.dni ?? '—'
      } · ${cliente.zona?.nombre ?? 'Sin zona'} · ${cliente.plan?.nombre ?? 'Sin plan'}`}
      icon="tabler:user"
      size="md"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          cancelLabel="Cerrar"
          submitLabel="Ver ficha completa"
          submitIcon="tabler:external-link"
          onSubmit={() => navigate(`/clientes/${cliente.id}`)}
        >
          {wa && (
            <Button
              type="button"
              variant="outlinesuccess"
              onClick={() => window.open(`https://wa.me/51${wa}`, '_blank', 'noopener')}
              className="gap-1.5"
            >
              <Icon icon="tabler:brand-whatsapp" height={17} />
              WhatsApp
            </Button>
          )}
        </FormActions>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Estado y cobranza: lo primero que se mira al abrir un cliente. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${estadoBadge}`}>
            {estadoLabel}
          </span>
          {cliente.monto_mensual != null && (
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold">
              S/ {cliente.monto_mensual.toFixed(2)} al mes
            </span>
          )}
          {dias !== null && (
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                debe ? 'bg-lighterror text-error-text' : 'bg-lightsuccess text-success-text'
              }`}
            >
              {debe
                ? `Debe desde hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`
                : dias === 0
                ? 'Vence hoy'
                : `Vence en ${dias} día${dias === 1 ? '' : 's'}`}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Dato icono="tabler:phone" etiqueta="Teléfono">
            {telefono ?? <span className="text-muted-foreground">Sin teléfono</span>}
          </Dato>

          <Dato icono="tabler:key" etiqueta="Usuario PPPoE">
            <span className="font-mono">{cliente.usuario_pppoe}</span>
          </Dato>

          <Dato icono="tabler:map-2" etiqueta="Dirección">
            {detalle ? (
              detalle.direccion || <span className="text-muted-foreground">Sin dirección</span>
            ) : (
              <span className="text-muted-foreground">…</span>
            )}
          </Dato>

          <Dato icono="tabler:map-pin" etiqueta="Ubicación">
            {detalle?.lat != null && detalle?.lng != null ? (
              <a
                href={`https://www.google.com/maps?q=${detalle.lat},${detalle.lng}`}
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline"
              >
                Ver en Google Maps
              </a>
            ) : detalle ? (
              <span className="text-muted-foreground">Sin marcar</span>
            ) : (
              <span className="text-muted-foreground">…</span>
            )}
          </Dato>

          {cliente.ip_estatica && (
            <Dato icono="tabler:network" etiqueta="IP fija">
              <span className="font-mono">{cliente.ip_estatica}</span>
            </Dato>
          )}

          {cliente.cantidad_tv > 0 && (
            <Dato icono="tabler:device-tv" etiqueta="Televisores">
              {cliente.cantidad_tv}
            </Dato>
          )}
        </div>

        {/* Las fotos solo se miran acá; subirlas y borrarlas sigue en la ficha
            completa, que es donde el técnico trabaja. */}
        {fotos.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              Fotos y evidencias
            </p>
            <div className="flex flex-wrap gap-2">
              {fotos.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt="Evidencia del cliente"
                  className="h-16 w-16 rounded-lg border border-ld object-cover"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </FormDialog>
  );
};

export default ClienteVistaRapida;
