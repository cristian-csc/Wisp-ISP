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
import BorneDots from 'src/components/apps/cajasnap/BorneDots';
import CajaNapDetailDialog from 'src/components/apps/cajasnap/CajaNapDetailDialog';
import RingProgress, { toneForPct } from 'src/components/apps/cajasnap/RingProgress';
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cajasFiltradas.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
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
          const tone = toneForPct(pct);
          return (
            <CardBox
              key={c.id}
              className="p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
              onClick={() => setCajaAbierta(c.id)}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                    <Icon icon="tabler:box" height={12} />
                    Caja NAP
                  </div>
                  <h3 className="text-sm font-semibold truncate">{c.codigo}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {mufas.find((m) => m.id === c.mufa_id)?.codigo ?? '—'}
                  </p>
                </div>
                <RingProgress pct={pct} tone={tone} size="sm" />
              </div>

              <BorneDots bornes={c.bornes} size="sm" />

              <div className="flex justify-between mt-3 pt-3 border-t border-ld text-[11px]">
                <span className="text-success font-medium">{ocupados} ocup.</span>
                <span className="text-info font-medium">{libres} libres</span>
                <span className={danados > 0 ? 'text-error font-medium' : 'text-muted-foreground'}>
                  {danados} dañ.
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
