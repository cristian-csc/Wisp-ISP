import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import StatCard from 'src/components/shared/StatCard';
import EmptyState from 'src/components/shared/EmptyState';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
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
import CajaNapDetailDialog from 'src/components/apps/cajasnap/CajaNapDetailDialog';
import { listCajasNap, createCajaNap, type CajaNap } from 'src/lib/cajasnap';
import { getZona, type Zona } from 'src/lib/zonas';
import { listMufas, type Mufa } from 'src/lib/mufas';

const STAT_CARDS = [
  { key: 'cajas', icono: 'tabler:box', etiqueta: 'Cajas NAP', tono: 'primary' },
  { key: 'libres', icono: 'tabler:circle-check', etiqueta: 'Bornes libres', tono: 'success' },
  { key: 'ocupados', icono: 'tabler:plug-connected', etiqueta: 'Bornes ocupados', tono: 'info' },
  { key: 'danados', icono: 'tabler:alert-triangle', etiqueta: 'Bornes dañados', tono: 'error' },
] as const;

const CajaNapZona = () => {
  const { zonaId } = useParams();
  const navigate = useNavigate();
  const zid = Number(zonaId);

  const [zona, setZona] = useState<Zona | null>(null);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [cajaAbierta, setCajaAbierta] = useState<number | null>(null);
  const [mufas, setMufas] = useState<Mufa[]>([]);
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [mufaId, setMufaId] = useState('');
  const [capacidad, setCapacidad] = useState('8');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function reload() {
    setCajas(await listCajasNap(zid));
  }

  useEffect(() => {
    getZona(zid).then(setZona);
    listMufas(zid).then(setMufas);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zid]);

  const cajasFiltradas = cajas.filter((c) =>
    c.codigo.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const statValues: Record<(typeof STAT_CARDS)[number]['key'], number> = {
    cajas: cajasFiltradas.length,
    libres: cajasFiltradas.reduce((n, c) => n + c.bornes.filter((b) => b.estado === 'libre').length, 0),
    ocupados: cajasFiltradas.reduce((n, c) => n + c.bornes.filter((b) => b.estado === 'ocupado').length, 0),
    danados: cajasFiltradas.reduce((n, c) => n + c.bornes.filter((b) => b.estado === 'danado').length, 0),
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mufaId) {
      setError('Selecciona la mufa de donde sale esta caja.');
      return;
    }
    try {
      await createCajaNap({ codigo, zona_id: zid, mufa_id: Number(mufaId), capacidad_bornes: Number(capacidad) || 8 });
      setOpen(false);
      setCodigo('');
      setMufaId('');
      setCapacidad('8');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear la caja NAP');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/cajas-nap')}>
          <Icon icon="tabler:arrow-left" height={20} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl truncate">{zona?.nombre ?? 'Cargando…'}</h1>
          <p className="text-sm text-muted-foreground">Cajas NAP de esta zona</p>
        </div>
        <Button onClick={() => setOpen(true)} className="ml-auto whitespace-nowrap">
          Agregar caja NAP
        </Button>
      </div>

      <div className="relative sm:max-w-60 w-full">
        <Icon
          icon="tabler:search"
          height={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código…"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map((s) => (
          <StatCard key={s.key} icono={s.icono} etiqueta={s.etiqueta} valor={statValues[s.key]} tono={s.tono} />
        ))}
      </div>

      {/* Dos columnas donde cabe, una cuando no.
          El corte es xl y no lg a propósito: con el menú lateral puesto, a
          1024 px cada columna queda en unos 350 px y la fila de la tarjeta
          —código, ocupación y «Ver detalle»— se parte en tres líneas. A
          partir de 1280 px entra entera.
          Con un número impar de cajas, la última cae sola en la primera
          columna y conserva el mismo ancho: lo hace la rejilla, sin ayuda. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {cajasFiltradas.length === 0 && (
          <div className="xl:col-span-2">
            <EmptyState
              icono="tabler:box-off"
              titulo={cajas.length === 0 ? 'Sin cajas NAP registradas' : 'Ninguna caja coincide con la búsqueda'}
              descripcion={cajas.length === 0 ? 'Todavía no hay cajas NAP en esta zona.' : undefined}
            />
          </div>
        )}
        {cajasFiltradas.map((c) => {
          const libres = c.bornes.filter((b) => b.estado === 'libre').length;
          const ocupados = c.bornes.filter((b) => b.estado === 'ocupado').length;
          const danados = c.bornes.filter((b) => b.estado === 'danado').length;
          const pct = c.capacidad_bornes > 0 ? Math.round((ocupados / c.capacidad_bornes) * 100) : 0;
          return (
            <CardBox
              key={c.id}
              className="transition-ui cursor-pointer p-4 hover:border-brand/50 hover:shadow-md"
              onClick={() => setCajaAbierta(c.id)}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                {/* Quién es y dónde está */}
                <div className="min-w-0 sm:w-56 sm:shrink-0">
                  <h3 className="truncate text-lg font-bold leading-tight">{c.codigo}</h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {mufas.find((m) => m.id === c.mufa_id)?.codigo ?? 'Sin mufa'}
                    {zona?.nombre ? ` · ${zona.nombre}` : ''}
                  </p>
                  <span className="mt-1.5 inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {c.capacidad_bornes} bornes
                  </span>
                </div>

                {/* Cómo está de llena */}
                <div className="min-w-0 flex-1 sm:border-l sm:border-ld sm:pl-5">
                  <p className="text-sm">
                    Ocupación: <span className="font-bold">{pct}%</span>
                  </p>
                  <div
                    className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`Ocupación ${pct} por ciento`}
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  {/* Los libres, primero y en negrita: es el dato que se viene
                      a buscar, porque decide si aquí cabe un cliente más. */}
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">{libres} libres</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {ocupados} ocupados
                      {' · '}
                    </span>
                    <span
                      className={
                        danados > 0
                          ? 'font-semibold text-error-text dark:text-error'
                          : 'text-muted-foreground'
                      }
                    >
                      {danados} dañados
                    </span>
                  </p>
                </div>

                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-strong dark:text-brand">
                  Ver detalle
                  <Icon icon="tabler:arrow-right" height={16} />
                </span>
              </div>
            </CardBox>
          );
        })}
      </div>

      <CajaNapDetailDialog
        cajaId={cajaAbierta}
        onOpenChange={(o) => !o && setCajaAbierta(null)}
        onChanged={reload}
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Agregar caja NAP"
        subtitle="Nueva caja de distribución en la zona"
        icon="tabler:box"
        size="md"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Guardar"
            submitForm="caja-create-form"
          />
        }
      >
        <form id="caja-create-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormGrid>
            <FormField label="Código" icon="tabler:hash" htmlFor="codigoCaja" required>
              <FieldIcon icon="tabler:hash">
                <Input
                  id="codigoCaja"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                />
              </FieldIcon>
            </FormField>

            <FormField label="Mufa" icon="tabler:git-fork">
              <FieldIcon icon="tabler:git-fork">
                <Select value={mufaId} onValueChange={setMufaId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona la mufa de origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {mufas.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.codigo}
                      </SelectItem>
                    ))}
                    {mufas.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        Esta zona no tiene mufas todavía — créala primero en Zonas.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </FieldIcon>
            </FormField>

            <FormField label="Capacidad de bornes" icon="tabler:plug" htmlFor="capacidad" wide>
              <Input
                id="capacidad"
                type="number"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
              />
            </FormField>
          </FormGrid>

          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>
    </div>
  );
};

export default CajaNapZona;
