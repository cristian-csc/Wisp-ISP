import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import BorneDots from 'src/components/apps/cajasnap/BorneDots';
import CajaNapDetailDialog from 'src/components/apps/cajasnap/CajaNapDetailDialog';
import RingProgress, { toneForPct } from 'src/components/apps/cajasnap/RingProgress';
import { listCajasNap, createCajaNap, type CajaNap } from 'src/lib/cajasnap';
import { getZona, type Zona } from 'src/lib/zonas';
import { listMufas, type Mufa } from 'src/lib/mufas';

const STAT_CARDS = [
  { key: 'cajas', icon: 'tabler:box', label: 'Cajas NAP', bg: 'bg-primary/10', text: 'text-primary' },
  { key: 'libres', icon: 'tabler:circle-check', label: 'Bornes libres', bg: 'bg-success/10', text: 'text-success' },
  { key: 'ocupados', icon: 'tabler:plug-connected', label: 'Bornes ocupados', bg: 'bg-info/10', text: 'text-info' },
  { key: 'danados', icon: 'tabler:alert-triangle', label: 'Bornes dañados', bg: 'bg-error/10', text: 'text-error' },
] as const;

const StatCard = ({
  icon,
  label,
  value,
  bg,
  text,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  bg: string;
  text: string;
}) => (
  <CardBox className="p-4">
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${bg} ${text}`}>
        <Icon icon={icon} height={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  </CardBox>
);

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
          <StatCard key={s.key} icon={s.icon} label={s.label} value={statValues[s.key]} bg={s.bg} text={s.text} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cajasFiltradas.length === 0 && (
          <CardBox>
            <p className="text-center text-muted-foreground py-4">
              {cajas.length === 0 ? 'No hay cajas NAP registradas en esta zona.' : 'Ninguna caja coincide con la búsqueda.'}
            </p>
          </CardBox>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar caja NAP</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="codigoCaja">Código</Label>
              <Input
                id="codigoCaja"
                className="mt-2"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Mufa</Label>
              <Select value={mufaId} onValueChange={setMufaId}>
                <SelectTrigger className="w-full mt-2">
                  <SelectValue placeholder="Selecciona la mufa de origen" />
                </SelectTrigger>
                <SelectContent>
                  {mufas.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.codigo}
                    </SelectItem>
                  ))}
                  {mufas.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Esta zona no tiene mufas todavía — créala primero en Zonas.</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="capacidad">Capacidad de bornes</Label>
              <Input
                id="capacidad"
                type="number"
                className="mt-2"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CajaNapZona;
