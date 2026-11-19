import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { FormActions, FormCallout, FormDialog, FormField, FormGrid } from 'src/components/shared/form';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'src/components/ui/table';
import { borrarUnidad, crearUnidad, editarUnidad, listUnidades, type UnidadMedida } from 'src/lib/inventario';

const VACIA = { nombre: '', plural: '', abreviatura: '' };

/** Plural en castellano para sugerirlo mientras se escribe el singular. */
function pluralDe(singular: string): string {
  const s = singular.trim().toLowerCase();
  if (!s) return '';
  if (/[aeiouáéó]$/.test(s)) return `${s}s`;
  if (s.endsWith('z')) return `${s.slice(0, -1)}ces`;
  return `${s}es`;
}

const Unidades = () => {
  const [unidades, setUnidades] = useState<UnidadMedida[] | null>(null);
  const [editando, setEditando] = useState<UnidadMedida | 'nueva' | null>(null);
  const [f, setF] = useState(VACIA);
  const [pluralTocado, setPluralTocado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<UnidadMedida | null>(null);

  const cargar = useCallback(() => {
    listUnidades().then(setUnidades).catch(() => setUnidades([]));
  }, []);
  useEffect(cargar, [cargar]);

  function abrir(u: UnidadMedida | 'nueva') {
    setEditando(u);
    setError(null);
    setPluralTocado(u !== 'nueva');
    setF(u === 'nueva' ? VACIA : { nombre: u.nombre, plural: u.plural, abreviatura: u.abreviatura });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      if (editando === 'nueva') await crearUnidad(f);
      else if (editando) await editarUnidad(editando.id, f);
      toast.success(editando === 'nueva' ? 'Unidad creada' : 'Unidad actualizada');
      setEditando(null);
      cargar();
    } catch (err: any) {
      const d = err?.response?.data?.detail;
      setError(typeof d === 'string' ? d : 'Revisa los datos');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!borrando) return;
    try {
      await borrarUnidad(borrando.id);
      toast.success('Unidad eliminada');
      cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Unidades de medida</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cómo se cuenta cada material: por unidad, metro, rollo, bobina…</p>
        </div>
        <Button onClick={() => abrir('nueva')}>
          <Icon icon="tabler:plus" width={17} /> Nueva unidad
        </Button>
      </div>

      <CardBox className="gap-0 overflow-hidden !p-0">
        {unidades === null ? (
          <LoadingState />
        ) : unidades.length === 0 ? (
          <EmptyState icono="tabler:ruler-2" titulo="No hay unidades" descripcion="Crea al menos una para poder registrar materiales." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead>Con varias</TableHead>
                <TableHead>Abreviatura</TableHead>
                <TableHead className="text-end">Materiales</TableHead>
                <TableHead className="text-end">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unidades.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium capitalize">{u.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">
                    3 {u.plural}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{u.abreviatura}</span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{u.materiales || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Editar ${u.nombre}`} onClick={() => abrir(u)}>
                        <Icon icon="tabler:pencil" height={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${u.nombre}`}
                        disabled={u.materiales > 0}
                        title={u.materiales > 0 ? 'La usan materiales: no se puede eliminar' : undefined}
                        onClick={() => setBorrando(u)}
                      >
                        <Icon icon="tabler:trash" height={18} className="text-error-text" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardBox>

      <FormDialog
        open={editando != null}
        onOpenChange={(o) => !o && setEditando(null)}
        title={editando === 'nueva' || editando == null ? 'Nueva unidad' : `Editar ${editando.nombre}`}
        subtitle="Así se lee en el stock, las entregas y el historial"
        icon="tabler:ruler-2"
        size="md"
        footer={
          <FormActions
            onCancel={() => setEditando(null)}
            submitLabel="Guardar"
            submitForm="unidad-form"
            submitting={guardando}
            disabled={!f.nombre.trim() || !f.plural.trim() || !f.abreviatura.trim()}
          />
        }
      >
        <form id="unidad-form" onSubmit={guardar} className="flex flex-col gap-5">
          <FormGrid>
            <FormField label="Nombre (una)" htmlFor="un-nombre" required hint="Ej.: bobina">
              <Input
                id="un-nombre"
                autoFocus
                maxLength={30}
                value={f.nombre}
                onChange={(e) => {
                  const nombre = e.target.value;
                  setF((x) => ({ ...x, nombre, plural: pluralTocado ? x.plural : pluralDe(nombre) }));
                }}
              />
            </FormField>
            <FormField label="Con varias" htmlFor="un-plural" required hint="Ej.: bobinas">
              <Input
                id="un-plural"
                maxLength={30}
                value={f.plural}
                onChange={(e) => {
                  setPluralTocado(true);
                  setF((x) => ({ ...x, plural: e.target.value }));
                }}
              />
            </FormField>
            <FormField label="Abreviatura" htmlFor="un-abrev" required hint="Corta, para tablas: bob">
              <Input id="un-abrev" maxLength={10} value={f.abreviatura} onChange={(e) => setF((x) => ({ ...x, abreviatura: e.target.value }))} className="font-mono" />
            </FormField>
          </FormGrid>
          {f.nombre.trim() && f.plural.trim() && (
            <p className="text-sm text-muted-foreground">
              Se leerá: <span className="text-foreground">1 {f.nombre.trim().toLowerCase()}</span>, <span className="text-foreground">25 {f.plural.trim().toLowerCase()}</span>
            </p>
          )}
          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(v) => !v && setBorrando(null)}
        title="Eliminar unidad"
        description={borrando ? `¿Eliminar la unidad «${borrando.nombre}»?` : undefined}
        onConfirm={borrar}
      />
    </div>
  );
};

export default Unidades;
