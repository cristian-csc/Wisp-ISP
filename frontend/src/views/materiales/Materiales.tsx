import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import CardBox from 'src/components/shared/CardBox';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
} from 'src/components/shared/form';
import {
  listMateriales,
  listMovimientos,
  listSaldosTecnico,
  registrarMovimiento,
  cantidad as fmt,
  type Material,
  type Movimiento,
  type SaldoTecnico,
  type TipoMovimiento,
} from 'src/lib/materiales';
import { listUsuarios } from 'src/lib/usuarios';
import type { Usuario } from 'src/lib/api';

const TIPOS: { valor: TipoMovimiento; etiqueta: string; ayuda: string }[] = [
  { valor: 'entrada', etiqueta: 'Entrada de almacén', ayuda: 'Una compra que llega al almacén.' },
  { valor: 'entrega', etiqueta: 'Entrega a técnico', ayuda: 'Sale del almacén y pasa a cargo del técnico.' },
  { valor: 'ajuste', etiqueta: 'Ajuste de cuadre', ayuda: 'Corrige el conteo cuando lo real no coincide. Admite cantidad negativa.' },
];

const ETIQUETA_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  entrega: 'Entrega',
  consumo: 'Consumo',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
};

const TONO_TIPO: Record<string, string> = {
  entrada: 'bg-lightsuccess text-success-text',
  devolucion: 'bg-lightsuccess text-success-text',
  entrega: 'bg-lightbrand text-brand-strong dark:text-brand',
  consumo: 'bg-muted text-muted-foreground',
  ajuste: 'bg-lightwarning text-warning-text',
};

const Materiales = () => {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [porTecnico, setPorTecnico] = useState<SaldoTecnico[]>([]);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);

  const [open, setOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoMovimiento>('entrada');
  const [materialId, setMaterialId] = useState('');
  const [presentacionId, setPresentacionId] = useState('');
  const [cant, setCant] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [motivo, setMotivo] = useState('');

  const material = materiales.find((m) => String(m.id) === materialId) ?? null;
  const presentacion = material?.presentaciones.find((p) => String(p.id) === presentacionId) ?? null;

  function reload() {
    Promise.all([listMateriales(), listMovimientos(), listSaldosTecnico()])
      .then(([ms, mv, st]) => {
        setMateriales(ms);
        setMovimientos(mv);
        setPorTecnico(st);
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    reload();
    listUsuarios()
      .then((us) => setTecnicos(us.filter((u) => u.rol === 'tecnico')))
      .catch(() => setTecnicos([]));
  }, []);

  function abrir() {
    setTipo('entrada');
    setMaterialId('');
    setPresentacionId('');
    setCant('');
    setTecnicoId('');
    setMotivo('');
    setError(null);
    setOpen(true);
  }

  async function handleGuardar() {
    if (!material) {
      setError('Elige un material.');
      return;
    }
    const valor = Number(cant);
    if (!cant.trim() || Number.isNaN(valor) || valor === 0) {
      setError('Escribe una cantidad distinta de cero.');
      return;
    }
    if (tipo === 'entrega' && !tecnicoId) {
      setError('Una entrega necesita decir a qué técnico.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await registrarMovimiento({
        material_id: material.id,
        tipo,
        cantidad: valor,
        presentacion_id: presentacion ? presentacion.id : null,
        tecnico_id: tipo === 'entrega' || tipo === 'ajuste' ? Number(tecnicoId) || null : null,
        motivo: motivo.trim() || null,
      });
      toast.success('Movimiento registrado');
      setOpen(false);
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar el movimiento');
    } finally {
      setGuardando(false);
    }
  }

  // Lo que de verdad entra al almacén, para que nadie tenga que multiplicar
  // de cabeza antes de pulsar Guardar.
  const equivalente =
    presentacion && cant && !Number.isNaN(Number(cant))
      ? Number(cant) * presentacion.equivale_a
      : null;

  if (cargando) return <LoadingState />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Materiales"
        descripcion="Lo que se instala en fibra y no tiene número de serie"
        icono="solar:layers-minimalistic-linear"
        acciones={
          <Button onClick={abrir}>
            <Icon icon="tabler:plus" height={17} className="mr-1" />
            Registrar movimiento
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {materiales.map((m) => (
          <CardBox key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold">{m.nombre}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Se cuenta por {m.unidad === 'metro' ? 'metro' : 'unidad'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  m.se_recupera ? 'bg-lightsuccess text-success-text' : 'bg-muted text-muted-foreground'
                }`}
              >
                {m.se_recupera ? 'Se recupera' : 'No vuelve'}
              </span>
            </div>

            <p className="mt-3 text-2xl font-bold leading-none">
              {fmt(m.en_almacen, m.unidad)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">en almacén</p>

            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ld pt-3">
              {m.consumo_estandar != null && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {fmt(m.consumo_estandar)} por instalación
                </span>
              )}
              {m.presentaciones.map((p) => (
                <span
                  key={p.id}
                  className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {p.nombre}
                </span>
              ))}
            </div>
          </CardBox>
        ))}
      </div>

      <SectionCard
        titulo="Lo que lleva cada técnico"
        icono="tabler:truck"
        descripcion="El material no se pierde en el almacén: se pierde en la camioneta."
        sinRelleno
      >
        {porTecnico.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icono="tabler:truck-off"
              titulo="Nadie lleva material encima"
              descripcion="Cuando entregues material a un técnico aparecerá aquí su saldo."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Técnico</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Lleva</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porTecnico.map((s) => (
                <TableRow key={`${s.tecnico_id}-${s.material_id}`}>
                  <TableCell className="font-medium">{s.tecnico_nombre}</TableCell>
                  <TableCell>{s.material_nombre}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(s.cantidad, s.unidad)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard titulo="Últimos movimientos" icono="tabler:history" sinRelleno>
        {movimientos.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icono="tabler:history-off"
              titulo="Todavía no hay movimientos"
              descripcion="Registra una entrada de almacén para empezar."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {m.creado_en ? new Date(m.creado_en).toLocaleDateString('es-PE') : '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          TONO_TIPO[m.tipo] ?? 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.material_nombre ?? '—'}
                      {m.presentacion && (
                        <span className="text-muted-foreground"> · {m.presentacion}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(m.cantidad, m.unidad)}
                    </TableCell>
                    <TableCell className="text-sm">{m.tecnico_nombre ?? '—'}</TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                      {m.motivo ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar movimiento"
        subtitle="Entrada de almacén, entrega a un técnico o ajuste de cuadre"
        icon="solar:layers-minimalistic-linear"
        tone="brand"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Registrar"
            submitIcon="tabler:device-floppy"
            onSubmit={handleGuardar}
            submitting={guardando}
          />
        }
      >
        {error && <FormCallout tone="error">{error}</FormCallout>}

        <FormGrid>
          <FormField label="Qué movimiento es" icon="tabler:arrows-exchange" wide>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimiento)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {TIPOS.find((t) => t.valor === tipo)?.ayuda}
            </p>
          </FormField>

          <FormField label="Material" icon="tabler:box">
            <Select
              value={materialId}
              onValueChange={(v) => {
                setMaterialId(v);
                setPresentacionId('');
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elige un material" />
              </SelectTrigger>
              <SelectContent>
                {materiales.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label={presentacion ? `Cuántas ${presentacion.nombre.toLowerCase()}` : 'Cantidad'}
            icon="tabler:hash"
            htmlFor="matCantidad"
          >
            <FieldIcon icon="tabler:hash">
              <Input
                id="matCantidad"
                inputMode="decimal"
                value={cant}
                onChange={(e) => setCant(e.target.value)}
                placeholder={material?.unidad === 'metro' ? 'metros' : 'unidades'}
              />
            </FieldIcon>
            {equivalente != null && (
              <p className="mt-1.5 text-xs text-brand-strong dark:text-brand">
                Entran {fmt(equivalente, material?.unidad)}
              </p>
            )}
          </FormField>

          {material && material.presentaciones.length > 0 && (
            <FormField label="Viene en" icon="tabler:package" wide>
              <Select
                value={presentacionId || 'suelto'}
                onValueChange={(v) => setPresentacionId(v === 'suelto' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suelto">
                    Directo en {material.unidad === 'metro' ? 'metros' : 'unidades'}
                  </SelectItem>
                  {material.presentaciones.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {(tipo === 'entrega' || tipo === 'ajuste') && (
            <FormField
              label={tipo === 'entrega' ? 'A qué técnico' : 'De quién es el cuadre'}
              icon="tabler:user"
              wide
            >
              <Select
                value={tecnicoId || (tipo === 'ajuste' ? 'almacen' : '')}
                onValueChange={(v) => setTecnicoId(v === 'almacen' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elige un técnico" />
                </SelectTrigger>
                <SelectContent>
                  {tipo === 'ajuste' && <SelectItem value="almacen">El almacén</SelectItem>}
                  {tecnicos.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tipo === 'ajuste' && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Un ajuste corrige el conteo de un solo sitio: o el almacén, o la camioneta de ese
                  técnico.
                </p>
              )}
            </FormField>
          )}

          <FormField label="Nota" icon="tabler:note" wide htmlFor="matMotivo">
            <FieldIcon icon="tabler:note">
              <Input
                id="matMotivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Opcional: factura, por qué no cuadraba…"
              />
            </FieldIcon>
          </FormField>
        </FormGrid>
      </FormDialog>
    </div>
  );
};

export default Materiales;
