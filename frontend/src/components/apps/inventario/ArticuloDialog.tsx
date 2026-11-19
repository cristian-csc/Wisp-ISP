import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormActions, FormCallout, FormDialog, FormField, FormGrid } from 'src/components/shared/form';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import { Switch } from 'src/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import OpcionMarcable from 'src/components/shared/OpcionMarcable';
import { crearArticulo, editarArticulo, type Articulo, type Categoria, type UnidadMedida } from 'src/lib/inventario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  /** Si llega, se edita; si no, se da de alta. */
  articulo?: Articulo | null;
  onGuardado: (a: Articulo) => void;
}

const VACIO = {
  codigo: '',
  nombre: '',
  categoria_id: '',
  marca: '',
  modelo: '',
  unidad_id: '',
  por_pieza: false,
  stock_minimo: '',
  stock_inicial: '',
  costo_unitario: '',
  ubicacion: '',
  descripcion: '',
  activo: true,
};

type Campos = typeof VACIO;

function desde(a: Articulo): Campos {
  return {
    codigo: a.codigo,
    nombre: a.nombre,
    categoria_id: String(a.categoria_id),
    marca: a.marca ?? '',
    modelo: a.modelo ?? '',
    unidad_id: String(a.unidad_id),
    por_pieza: a.controla_por_unidad,
    stock_minimo: String(a.stock_minimo),
    stock_inicial: '',
    costo_unitario: a.costo_unitario != null ? String(a.costo_unitario) : '',
    ubicacion: a.ubicacion ?? '',
    descripcion: a.descripcion ?? '',
    activo: a.activo,
  };
}

const ArticuloDialog = ({ open, onOpenChange, categorias, unidades, articulo, onGuardado }: Props) => {
  const [f, setF] = useState<Campos>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = !!articulo;

  useEffect(() => {
    if (!open) return;
    setError(null);
    // Lo más común es contar por unidad: se deja elegida para no hacer un paso más.
    setF(articulo ? desde(articulo) : { ...VACIO, unidad_id: String(unidades.find((u) => u.nombre === 'unidad')?.id ?? '') });
  }, [open, articulo, unidades]);

  const campo = (k: keyof Campos) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const datos = {
      codigo: f.codigo.trim(),
      nombre: f.nombre.trim(),
      categoria_id: Number(f.categoria_id),
      marca: f.marca.trim() || null,
      modelo: f.modelo.trim() || null,
      unidad_id: Number(f.unidad_id),
      stock_minimo: Number(f.stock_minimo || 0),
      costo_unitario: f.costo_unitario ? Number(f.costo_unitario) : null,
      ubicacion: f.ubicacion.trim() || null,
      descripcion: f.descripcion.trim() || null,
    };
    try {
      const a = editando
        ? await editarArticulo(articulo!.id, { ...datos, activo: f.activo })
        : await crearArticulo({ ...datos, stock_inicial: Number(f.stock_inicial || 0), controla_por_unidad: f.por_pieza });
      toast.success(editando ? 'Material actualizado' : 'Material registrado');
      onOpenChange(false);
      onGuardado(a);
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setError(typeof d === 'string' ? d : 'Revisa los datos: falta algo o hay un valor no válido');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editando ? `Editar ${articulo!.nombre}` : 'Nuevo material'}
      subtitle={editando ? 'El stock se cambia con movimientos, no aquí' : 'Switch, cable, conector, herramienta…'}
      icon="tabler:package"
      size="lg"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel={editando ? 'Guardar cambios' : 'Registrar material'}
          submitForm="articulo-form"
          submitting={guardando}
          disabled={!f.codigo.trim() || f.nombre.trim().length < 2 || !f.categoria_id || !f.unidad_id}
        />
      }
    >
      <form id="articulo-form" onSubmit={guardar} className="flex flex-col gap-5">
        <FormGrid>
          <FormField label="Nombre" htmlFor="art-nombre" required wide>
            <Input id="art-nombre" autoFocus value={f.nombre} onChange={campo('nombre')} maxLength={120} placeholder="Cable drop de fibra 1 hilo" />
          </FormField>
          <FormField label="Código" htmlFor="art-codigo" required hint="Corto y único, como en la etiqueta del estante.">
            <Input id="art-codigo" value={f.codigo} onChange={campo('codigo')} maxLength={40} placeholder="DROP-1H" className="font-mono uppercase" />
          </FormField>
          <FormField label="Categoría" required>
            <Select value={f.categoria_id} onValueChange={(v) => setF((x) => ({ ...x, categoria_id: v }))}>
              <SelectTrigger className="w-full" aria-label="Categoría">
                <SelectValue placeholder="Elige una" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Marca" htmlFor="art-marca">
            <Input id="art-marca" value={f.marca} onChange={campo('marca')} maxLength={80} placeholder="TP-Link" />
          </FormField>
          <FormField label="Modelo" htmlFor="art-modelo">
            <Input id="art-modelo" value={f.modelo} onChange={campo('modelo')} maxLength={80} placeholder="TL-SG108" />
          </FormField>
          <FormField label="Se cuenta por">
            <Select value={f.unidad_id} onValueChange={(v) => setF((x) => ({ ...x, unidad_id: v }))}>
              <SelectTrigger className="w-full" aria-label="Unidad">
                <SelectValue placeholder="Elige una" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.plural[0].toUpperCase() + u.plural.slice(1)} <span className="text-muted-foreground">({u.abreviatura})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Stock mínimo" htmlFor="art-minimo" hint="Al llegar aquí el sistema avisa que hay que reponer.">
            <Input id="art-minimo" type="number" inputMode="numeric" min={0} step={1} value={f.stock_minimo} onChange={campo('stock_minimo')} placeholder="0" className="tabular-nums" />
          </FormField>
          {!editando && (
            <div className="md:col-span-2">
              <OpcionMarcable
                icono="tabler:barcode"
                titulo="Etiqueta por cada pieza"
                descripcion="Para equipos y herramientas: cada switch, router o cleaver recibe su propio código para imprimir y pegar, y se sigue uno por uno. El cable y los conectores van a granel."
                marcada={f.por_pieza}
                onCambiar={() => setF((x) => ({ ...x, por_pieza: !x.por_pieza }))}
              />
            </div>
          )}
          {!editando && (
            <FormField label="Hay ahora en almacén" htmlFor="art-inicial" hint={f.por_pieza ? 'Se genera una etiqueta por cada una.' : 'Queda registrado como la primera entrada.'}>
              <Input id="art-inicial" type="number" inputMode="numeric" min={0} step={1} value={f.stock_inicial} onChange={campo('stock_inicial')} placeholder="0" className="tabular-nums" />
            </FormField>
          )}
          <FormField label="Costo por unidad (S/)" htmlFor="art-costo">
            <Input id="art-costo" type="number" inputMode="decimal" min={0} step="0.01" value={f.costo_unitario} onChange={campo('costo_unitario')} placeholder="0.00" className="tabular-nums" />
          </FormField>
          <FormField label="Ubicación" htmlFor="art-ubicacion">
            <Input id="art-ubicacion" value={f.ubicacion} onChange={campo('ubicacion')} maxLength={80} placeholder="Estante B, caja 3" />
          </FormField>
          <FormField label="Descripción" htmlFor="art-desc" wide>
            <Textarea id="art-desc" value={f.descripcion} onChange={campo('descripcion')} rows={2} />
          </FormField>
          {editando && (
            <FormField label="Material en uso" wide hint="Apágalo si ya no se compra: deja de salir en las listas y su historial se conserva.">
              <Switch checked={f.activo} onCheckedChange={(v) => setF((x) => ({ ...x, activo: v }))} aria-label="Material en uso" />
            </FormField>
          )}
        </FormGrid>
        {error && <FormCallout tone="error">{error}</FormCallout>}
      </form>
    </FormDialog>
  );
};

export default ArticuloDialog;
