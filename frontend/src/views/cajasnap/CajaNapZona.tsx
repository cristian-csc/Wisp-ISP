import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Cifra from 'src/components/shared/Cifra';
import Pestanas from 'src/components/shared/Pestanas';
import SearchInput from 'src/components/shared/SearchInput';
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
import OcupacionBarra from 'src/components/apps/cajasnap/OcupacionBarra';
import DisponibilidadChip, { coincideFiltro, PESTANAS_DISPONIBILIDAD, type FiltroCajas } from 'src/components/apps/cajasnap/DisponibilidadChip';
import { listCajasNap, createCajaNap, resumenBornes, type CajaNap } from 'src/lib/cajasnap';
import { getZona, type Zona } from 'src/lib/zonas';
import { listMufas, type Mufa } from 'src/lib/mufas';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeVerUrl } from 'src/lib/permisos';

const CajaNapZona = ({ gestion = false }: { gestion?: boolean }) => {
  const { user } = useCurrentUser();
  const base = gestion ? '/inventario/cajas-nap' : '/cajas-nap';
  const { zonaId } = useParams();
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
  const [filtro, setFiltro] = useState<FiltroCajas>('todas');
  const [mufaSel, setMufaSel] = useState('todas');

  async function reload() {
    setCajas(await listCajasNap(zid));
  }

  useEffect(() => {
    getZona(zid).then(setZona);
    listMufas(zid).then(setMufas);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zid]);

  const cajasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cajas
      .filter(
        (c) =>
          coincideFiltro(c, filtro) &&
          (mufaSel === 'todas' || String(c.mufa_id) === mufaSel) &&
          (!q || [c.codigo, c.mufa_codigo, c.descripcion].some((t) => t?.toLowerCase().includes(q))),
      )
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [cajas, filtro, mufaSel, search]);

  const total = resumenBornes(cajas);
  const cuenta = (f: FiltroCajas) => cajas.filter((c) => coincideFiltro(c, f)).length;
  const hayFiltros = !!search.trim() || filtro !== 'todas' || mufaSel !== 'todas';

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Ruta" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to={base} className="hover:text-foreground hover:underline">
              Cajas NAP
            </Link>
            <Icon icon="tabler:chevron-right" width={14} aria-hidden="true" />
          </nav>
          <h1 className="mt-1 truncate text-[26px] font-semibold leading-tight">{zona?.nombre ?? 'Cargando…'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cajas.length} caja{cajas.length === 1 ? '' : 's'} NAP colgando de {mufas.length} mufa{mufas.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to={`/zonas/${zid}`}>
              <Icon icon="tabler:map-pin" height={17} /> Ver la zona
            </Link>
          </Button>
          {gestion ? (
            <Button onClick={() => setOpen(true)}>
              <Icon icon="tabler:plus" height={17} /> Agregar caja NAP
            </Button>
          ) : (
            puedeVerUrl('/inventario/cajas-nap', user?.rol) && (
              <Button variant="outline" asChild>
                <Link to={`/inventario/cajas-nap/zona/${zid}`}>
                  <Icon icon="solar:box-linear" height={17} /> Gestionar en Inventario
                </Link>
              </Button>
            )
          )}
        </div>
      </div>

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Cifra etiqueta="Bornes libres" icono="solar:plug-circle-linear" tono="marca" valor={total.libres} nota={`de ${total.total} en la zona`} />
          <Cifra
            etiqueta="Ocupación"
            icono="solar:pie-chart-2-linear"
            tono={total.pct >= 85 ? 'alerta' : 'neutro'}
            valor={`${total.pct}%`}
            progreso={{ valor: total.ocupados, total: total.total }}
            nota={`${total.ocupados} bornes con cliente`}
          />
          <Cifra
            etiqueta="Cajas llenas o casi"
            icono="solar:box-linear"
            tono={cuenta('llenas') ? 'alerta' : 'neutro'}
            valor={cuenta('llenas') + cuenta('casi')}
            nota={`${cuenta('llenas')} sin ningún borne libre`}
          />
          <Cifra
            etiqueta="Bornes dañados"
            icono="solar:danger-triangle-linear"
            tono={total.danados ? 'peligro' : 'neutro'}
            valor={total.danados}
            nota={total.danados ? 'Por reparar' : 'Ninguno por reparar'}
          />
        </div>
      </CardBox>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código o descripción" className="sm:w-72" />
          {mufas.length > 1 && (
            <Select value={mufaSel} onValueChange={setMufaSel}>
              <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Mufa">
                <Icon icon="tabler:git-fork" width={16} className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las mufas</SelectItem>
                {mufas.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Pestanas
          label="Disponibilidad"
          valor={filtro}
          onChange={setFiltro}
          pestanas={PESTANAS_DISPONIBILIDAD.map((p) => ({ ...p, cuenta: cuenta(p.valor) }))}
        />
      </div>

      {cajasFiltradas.length === 0 ? (
        <CardBox className="!p-0">
          <EmptyState
            icono="tabler:box-off"
            titulo={cajas.length === 0 ? 'Esta zona no tiene cajas NAP' : 'Ninguna caja coincide'}
            descripcion={
              cajas.length === 0
                ? mufas.length
                  ? 'Agrega la primera caja y elige la mufa de la que sale.'
                  : 'Primero registra una mufa en la ficha de la zona; las cajas cuelgan de ella.'
                : 'Prueba con otro código o quita el filtro.'
            }
            accion={
              cajas.length === 0 && gestion ? (
                <Button onClick={() => setOpen(true)} disabled={!mufas.length}>
                  <Icon icon="tabler:plus" height={17} /> Agregar caja NAP
                </Button>
              ) : hayFiltros ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setFiltro('todas');
                    setMufaSel('todas');
                  }}
                >
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        </CardBox>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cajasFiltradas.map((c) => {
            const r = resumenBornes([c]);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCajaAbierta(c.id)}
                className="flex flex-col gap-4 rounded-2xl border border-ld bg-card p-5 text-left transition-[border-color,transform] duration-150 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-brand [@media(hover:hover)]:hover:border-foreground/25"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold">{c.codigo}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.mufa_codigo ? `Mufa ${c.mufa_codigo}` : 'Sin mufa'}
                      {c.descripcion ? ` · ${c.descripcion}` : ''}
                    </span>
                  </span>
                  <DisponibilidadChip caja={c} />
                </span>
                <BorneDots bornes={c.bornes} size="md" />
                <span className="flex flex-col gap-2">
                  <OcupacionBarra r={r} />
                  <span className="flex items-baseline justify-between text-xs text-muted-foreground tabular-nums">
                    <span>
                      <span className="text-base font-semibold text-foreground">{r.libres}</span> libre{r.libres === 1 ? '' : 's'} de {r.total}
                    </span>
                    <span>{r.pct}% ocupado</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <CajaNapDetailDialog
        gestion={gestion}
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
