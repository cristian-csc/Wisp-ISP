import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import PageHeader from 'src/components/shared/PageHeader';
import CardBox from 'src/components/shared/CardBox';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import FotoRemota from 'src/components/shared/FotoRemota';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Switch } from 'src/components/ui/switch';
import { FormActions, FormDialog, FormField, FormGrid } from 'src/components/shared/form';
import {
  listUnidades,
  crearUnidad,
  actualizarUnidad,
  eliminarUnidad,
  subirFotoUnidad,
  getUnidadFotoBlobUrl,
  type Unidad,
} from 'src/lib/flota';

type Formulario = { placa: string; marca: string; modelo: string; activo: boolean };
const VACIO: Formulario = { placa: '', marca: '', modelo: '', activo: true };

const Unidades = () => {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [dialogo, setDialogo] = useState(false);
  const [editando, setEditando] = useState<Unidad | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<Unidad | null>(null);
  // Para refrescar la foto de una unidad tras subir una nueva.
  const [versionFoto, setVersionFoto] = useState<Record<number, number>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const subiendoPara = useRef<number | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    listUnidades(false)
      .then(setUnidades)
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => cargar(), [cargar]);

  function abrirNueva() {
    setEditando(null);
    setForm(VACIO);
    setError(null);
    setDialogo(true);
  }

  function abrirEdicion(u: Unidad) {
    setEditando(u);
    setForm({ placa: u.placa, marca: u.marca ?? '', modelo: u.modelo ?? '', activo: u.activo });
    setError(null);
    setDialogo(true);
  }

  async function guardar() {
    if (!form.placa.trim()) {
      setError('La placa es obligatoria.');
      return;
    }
    setGuardando(true);
    setError(null);
    const payload = {
      placa: form.placa.trim(),
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      activo: form.activo,
    };
    try {
      if (editando) {
        await actualizarUnidad(editando.id, payload);
        toast.success('Unidad actualizada');
      } else {
        await crearUnidad(payload);
        toast.success('Unidad registrada');
      }
      setDialogo(false);
      cargar();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  function pedirFoto(id: number) {
    subiendoPara.current = id;
    fileRef.current?.click();
  }

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite re-elegir el mismo archivo
    const id = subiendoPara.current;
    if (!archivo || id == null) return;
    try {
      await subirFotoUnidad(id, archivo);
      setUnidades((prev) => prev.map((u) => (u.id === id ? { ...u, tiene_foto: true } : u)));
      setVersionFoto((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
      toast.success('Foto actualizada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo subir la foto');
    }
  }

  async function borrar() {
    if (!aBorrar) return;
    try {
      await eliminarUnidad(aBorrar.id);
      toast.success('Unidad eliminada');
      cargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'No se pudo eliminar');
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Unidades"
        descripcion="Los vehículos de la empresa: placa, marca, modelo y foto."
        icono="solar:bus-linear"
        acciones={
          <Button onClick={abrirNueva}>
            <Icon icon="tabler:plus" width={18} /> Nueva unidad
          </Button>
        }
      />

      {cargando ? (
        <LoadingState />
      ) : unidades.length === 0 ? (
        <EmptyState
          icono="solar:bus-linear"
          titulo="Aún no hay unidades"
          descripcion="Registra los vehículos de la empresa para llevar el control de combustible."
          accion={<Button onClick={abrirNueva}>Registrar la primera</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {unidades.map((u) => (
            <CardBox key={u.id} className="overflow-hidden p-0">
              <div className="relative">
                <FotoRemota
                  cargar={u.tiene_foto ? () => getUnidadFotoBlobUrl(u.id) : null}
                  clave={`${u.id}-${versionFoto[u.id] ?? 0}`}
                  alt={`Foto de ${u.placa}`}
                  iconoVacio="solar:camera-linear"
                  ampliable={u.tiene_foto}
                  className="h-44 w-full"
                />
                {!u.activo && (
                  <span className="absolute left-3 top-3 rounded-full bg-lighterror px-2.5 py-1 text-xs font-semibold text-error-text">
                    Inactiva
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => pedirFoto(u.id)}
                  className="transition-ui absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/70"
                >
                  <Icon icon="solar:camera-linear" width={15} />
                  {u.tiene_foto ? 'Cambiar foto' : 'Añadir foto'}
                </button>
              </div>

              <div className="flex items-start justify-between gap-2 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold tracking-wide">{u.placa}</h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {[u.marca, u.modelo].filter(Boolean).join(' · ') || 'Sin marca/modelo'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => abrirEdicion(u)} aria-label="Editar">
                    <Icon icon="tabler:pencil" width={17} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setABorrar(u)}
                    aria-label="Eliminar"
                    className="text-error-text hover:text-error-text"
                  >
                    <Icon icon="tabler:trash" width={17} />
                  </Button>
                </div>
              </div>
            </CardBox>
          ))}
        </div>
      )}

      {/* Un único input de archivo, reutilizado por todas las tarjetas. */}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={alElegirFoto} />

      <FormDialog
        open={dialogo}
        onOpenChange={setDialogo}
        title={editando ? 'Editar unidad' : 'Nueva unidad'}
        subtitle={editando ? editando.placa : 'Registra un vehículo de la empresa'}
        icon="solar:bus-linear"
        footer={
          <FormActions
            onCancel={() => setDialogo(false)}
            onSubmit={guardar}
            submitting={guardando}
            submitLabel={editando ? 'Guardar cambios' : 'Registrar'}
          />
        }
      >
        <FormGrid>
          <FormField label="Placa" icon="tabler:license" required error={error}>
            <Input
              value={form.placa}
              onChange={(e) => setForm({ ...form, placa: e.target.value })}
              placeholder="Ej. V1A-234"
              autoFocus
            />
          </FormField>
          <FormField label="Marca" icon="tabler:car">
            <Input
              value={form.marca}
              onChange={(e) => setForm({ ...form, marca: e.target.value })}
              placeholder="Ej. Toyota"
            />
          </FormField>
          <FormField label="Modelo" icon="tabler:tag">
            <Input
              value={form.modelo}
              onChange={(e) => setForm({ ...form, modelo: e.target.value })}
              placeholder="Ej. Hilux"
            />
          </FormField>
          <FormField
            label="Activa"
            icon="tabler:toggle-right"
            wide
            hint="Las inactivas no aparecen al cargar combustible desde la app."
          >
            <div className="flex items-center gap-2.5 pt-1">
              <Switch checked={form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
              <span className="text-sm text-muted-foreground">{form.activo ? 'En servicio' : 'Fuera de servicio'}</span>
            </div>
          </FormField>
        </FormGrid>
      </FormDialog>

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(o) => !o && setABorrar(null)}
        title={`¿Eliminar la unidad ${aBorrar?.placa ?? ''}?`}
        description="Solo se puede si no tiene recargas de combustible registradas. Si las tiene, desactívala en vez de borrarla."
        onConfirm={borrar}
      />
    </div>
  );
};

export default Unidades;
