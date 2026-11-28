import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import CardBox from 'src/components/shared/CardBox';
import FotoRemota from 'src/components/shared/FotoRemota';
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
import { Switch } from 'src/components/ui/switch';
import {
  listMateriales,
  listMovimientos,
  listSaldosTecnico,
  registrarMovimiento,
  crearMaterial,
  editarMaterial,
  subirFotoMaterial,
  getMaterialFotoBlobUrl,
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
  // Que la carga falle tiene que verse. Antes se quedaba en silencio con las
  // tarjetas vacias y no habia forma de saber si era un fallo o es que no
  // habia nada.
  const [fallo, setFallo] = useState<string | null>(null);

  const [materialOpen, setMaterialOpen] = useState(false);
  const [editando, setEditando] = useState<Material | null>(null);
  const [guardandoMaterial, setGuardandoMaterial] = useState(false);
  const [errorMaterial, setErrorMaterial] = useState<string | null>(null);
  const [mNombre, setMNombre] = useState('');
  const [mUnidad, setMUnidad] = useState<'metro' | 'unidad'>('unidad');
  const [mRecupera, setMRecupera] = useState(false);
  const [mEstandar, setMEstandar] = useState('');
  const [mPres, setMPres] = useState<{ nombre: string; equivale: string }[]>([]);

  // Foto de presentación: un solo input oculto para toda la vista. Se sube al
  // vuelo desde el formulario de edición y luego se refresca la tarjeta.
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const fotoMaterialId = useRef<number | null>(null);
  const [versionFoto, setVersionFoto] = useState<Record<number, number>>({});
  const [subiendoFoto, setSubiendoFoto] = useState(false);

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
  // El material que se está editando, pero leído de la lista viva: así, tras
  // subir una foto y recargar, el formulario refleja que ya tiene foto.
  const matEdit = editando ? materiales.find((m) => m.id === editando.id) ?? editando : null;

  function reload() {
    setFallo(null);
    Promise.all([listMateriales(), listMovimientos(), listSaldosTecnico()])
      .then(([ms, mv, st]) => {
        setMateriales(ms);
        setMovimientos(mv);
        setPorTecnico(st);
      })
      .catch((err: any) => {
        setFallo(
          err?.response?.data?.detail ??
            'No se pudieron cargar los materiales. Revisa que el servidor esté respondiendo.',
        );
      })
      .finally(() => setCargando(false));
  }

  function abrirMaterial(material?: Material) {
    setEditando(material ?? null);
    setMNombre(material?.nombre ?? '');
    setMUnidad(material?.unidad ?? 'unidad');
    setMRecupera(material?.se_recupera ?? false);
    setMEstandar(material?.consumo_estandar != null ? String(material.consumo_estandar) : '');
    setMPres([]);
    setErrorMaterial(null);
    setMaterialOpen(true);
  }

  function pedirFotoMaterial(id: number) {
    fotoMaterialId.current = id;
    fotoInputRef.current?.click();
  }

  async function alElegirFotoMaterial(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    const id = fotoMaterialId.current;
    if (!archivo || id == null) return;
    setSubiendoFoto(true);
    try {
      await subirFotoMaterial(id, archivo);
      setVersionFoto((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
      toast.success('Foto del material actualizada');
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo subir la foto');
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function handleGuardarMaterial() {
    const nombre = mNombre.trim();
    if (nombre.length < 2) {
      setErrorMaterial('Escribe el nombre del material.');
      return;
    }
    const presentaciones = mPres
      .filter((p) => p.nombre.trim() && Number(p.equivale) > 0)
      .map((p) => ({ nombre: p.nombre.trim(), equivale_a: Number(p.equivale) }));
    if (mPres.length > presentaciones.length) {
      setErrorMaterial('Alguna presentación está a medias: le falta el nombre o cuántas trae.');
      return;
    }

    setGuardandoMaterial(true);
    setErrorMaterial(null);
    try {
      const estandar = mEstandar.trim() ? Number(mEstandar) : null;
      if (editando) {
        await editarMaterial(editando.id, {
          nombre,
          se_recupera: mRecupera,
          consumo_estandar: estandar,
        });
        toast.success('Material actualizado');
      } else {
        await crearMaterial({
          nombre,
          unidad: mUnidad,
          se_recupera: mRecupera,
          consumo_estandar: estandar,
          presentaciones,
        });
        toast.success('Material creado');
      }
      setMaterialOpen(false);
      reload();
    } catch (err: any) {
      setErrorMaterial(err?.response?.data?.detail ?? 'No se pudo guardar el material');
    } finally {
      setGuardandoMaterial(false);
    }
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => abrirMaterial()}>
              <Icon icon="tabler:box" height={17} className="mr-1" />
              Nuevo material
            </Button>
            <Button onClick={abrir} disabled={materiales.length === 0}>
              <Icon icon="tabler:plus" height={17} className="mr-1" />
              Registrar movimiento
            </Button>
          </div>
        }
      />

      {fallo && (
        <FormCallout tone="error">
          {fallo}{' '}
          <button type="button" onClick={reload} className="underline underline-offset-2">
            Reintentar
          </button>
        </FormCallout>
      )}

      {!fallo && materiales.length === 0 && (
        <EmptyState
          icono="tabler:box-off"
          titulo="Todavía no hay materiales"
          descripcion="Crea el primero con «Nuevo material» y luego registra su entrada al almacén."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {materiales.map((m) => (
          <CardBox key={m.id} className="flex-row gap-4 p-4">
            {/* Foto del material a la izquierda. object-contain: no deforma ni
                recorta cables, conectores ni rosetas. Sin foto → placeholder
                neutro con un icono (Lucide). */}
            <FotoRemota
              cargar={m.tiene_foto ? () => getMaterialFotoBlobUrl(m.id) : null}
              clave={`${m.id}-${versionFoto[m.id] ?? 0}`}
              alt={`Foto de ${m.nombre}`}
              iconoVacio="lucide:package"
              ajuste="contain"
              ampliable={m.tiene_foto}
              className="h-[125px] w-[115px] shrink-0 self-start rounded-xl border border-ld bg-muted/30"
            />

            {/* Datos a la derecha */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold leading-tight">{m.nombre}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Se cuenta por {m.unidad === 'metro' ? 'metro' : 'unidad'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      m.se_recupera ? 'bg-lightsuccess text-success-text' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {m.se_recupera ? 'Se recupera' : 'No vuelve'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${m.nombre}`}
                    onClick={() => abrirMaterial(m)}
                  >
                    <Icon icon="tabler:pencil" height={16} />
                  </Button>
                </div>
              </div>

              <p className="mt-2 text-2xl font-bold leading-none">
                {fmt(m.en_almacen, m.unidad)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">en almacén</p>

              {(m.consumo_estandar != null || m.presentaciones.length > 0) && (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
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
              )}
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

      <FormDialog
        open={materialOpen}
        onOpenChange={setMaterialOpen}
        title={editando ? editando.nombre : 'Nuevo material'}
        subtitle={
          editando
            ? 'Corrige su nombre y sus reglas'
            : 'Algo que se instala en fibra y no tiene número de serie'
        }
        icon="tabler:box"
        tone="brand"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setMaterialOpen(false)}
            submitLabel={editando ? 'Guardar cambios' : 'Crear material'}
            submitIcon="tabler:device-floppy"
            onSubmit={handleGuardarMaterial}
            submitting={guardandoMaterial}
          />
        }
      >
        {errorMaterial && <FormCallout tone="error">{errorMaterial}</FormCallout>}

        <FormGrid>
          {editando && (
            <FormField label="Foto del material" icon="tabler:photo" wide>
              <div className="flex items-center gap-4">
                <FotoRemota
                  cargar={matEdit?.tiene_foto ? () => getMaterialFotoBlobUrl(editando.id) : null}
                  clave={`${editando.id}-${versionFoto[editando.id] ?? 0}`}
                  alt={`Foto de ${editando.nombre}`}
                  iconoVacio="lucide:package"
                  ajuste="contain"
                  className="size-24 shrink-0 rounded-lg border border-ld bg-muted/40"
                />
                <div className="flex flex-col items-start gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => pedirFotoMaterial(editando.id)}
                    disabled={subiendoFoto}
                  >
                    <Icon
                      icon={subiendoFoto ? 'tabler:loader-2' : 'tabler:camera'}
                      height={16}
                      className={`mr-1 ${subiendoFoto ? 'animate-spin' : ''}`}
                    />
                    {matEdit?.tiene_foto ? 'Cambiar foto' : 'Añadir foto'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG o WebP. Máximo 8&nbsp;MB.
                  </p>
                </div>
              </div>
            </FormField>
          )}

          <FormField label="Nombre" icon="tabler:tag" htmlFor="matNombre">
            <FieldIcon icon="tabler:tag">
              <Input
                id="matNombre"
                value={mNombre}
                onChange={(e) => setMNombre(e.target.value)}
                placeholder="Abrazadera, cinta aislante…"
              />
            </FieldIcon>
          </FormField>

          <FormField label="Cómo se cuenta" icon="tabler:ruler-2">
            <Select
              value={mUnidad}
              onValueChange={(v) => setMUnidad(v as 'metro' | 'unidad')}
              disabled={!!editando}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unidad">Por unidad</SelectItem>
                <SelectItem value="metro">Por metro</SelectItem>
              </SelectContent>
            </Select>
            {editando && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                No se cambia: ya hay movimientos contados en esta unidad, y cambiarla convertiría
                1.800 metros en 1.800 unidades.
              </p>
            )}
          </FormField>

          <FormField label="¿Vuelve al retirar a un cliente?" icon="tabler:arrow-back-up" wide>
            <div className="flex items-start gap-3 rounded-lg border border-ld p-3">
              <Switch checked={mRecupera} onCheckedChange={setMRecupera} />
              <p className="text-sm text-muted-foreground">
                {mRecupera
                  ? 'El técnico lo recupera y vuelve al almacén, como la roseta y el patch cord.'
                  : 'Se queda puesto para siempre, como el cable tendido y los tensadores. Se da de baja el día de la instalación.'}
              </p>
            </div>
          </FormField>

          <FormField
            label="Cuánto se gasta en una instalación normal"
            icon="tabler:calculator"
            hint="Opcional"
            wide
            htmlFor="matEstandar"
          >
            <FieldIcon icon="tabler:calculator">
              <Input
                id="matEstandar"
                inputMode="decimal"
                value={mEstandar}
                onChange={(e) => setMEstandar(e.target.value)}
                placeholder="Déjalo vacío si varía en cada instalación"
              />
            </FieldIcon>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Solo cuando siempre es la misma cantidad: una roseta, dos conectores. Los metros de
              cable y los tensadores varían, y esos los dice el técnico.
            </p>
          </FormField>

          {!editando && (
            <FormField label="Cómo se compra" icon="tabler:package" wide>
              <div className="flex flex-col gap-2">
                {mPres.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Si viene en bultos —bolsa de 10, bobina de 1000 m— agrégalos aquí. Así al
                    registrar una compra escribes «2 bolsas» y el sistema traduce a unidades.
                  </p>
                )}
                {mPres.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={p.nombre}
                      onChange={(e) =>
                        setMPres((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)),
                        )
                      }
                      placeholder="Bolsa de 50"
                      aria-label={`Nombre de la presentación ${i + 1}`}
                    />
                    <Input
                      className="w-28 shrink-0"
                      inputMode="decimal"
                      value={p.equivale}
                      onChange={(e) =>
                        setMPres((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, equivale: e.target.value } : x)),
                        )
                      }
                      placeholder="50"
                      aria-label={`Cuántas trae la presentación ${i + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar esta presentación"
                      onClick={() => setMPres((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Icon icon="tabler:trash" height={16} className="text-error" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => setMPres((prev) => [...prev, { nombre: '', equivale: '' }])}
                >
                  <Icon icon="tabler:plus" height={16} className="mr-1" />
                  Agregar presentación
                </Button>
              </div>
            </FormField>
          )}
        </FormGrid>
      </FormDialog>

      {/* Input compartido para la foto de presentación de un material. */}
      <input ref={fotoInputRef} type="file" accept="image/*" hidden onChange={alElegirFotoMaterial} />
    </div>
  );
};

export default Materiales;
