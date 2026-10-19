import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import { listZonas, type Zona } from 'src/lib/zonas';
import { getResumenPorZona, type ResumenZonaGastos } from 'src/lib/gastos';

const MESES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
];

const hoy = new Date();
const ANIOS = Array.from({ length: 4 }, (_, i) => String(hoy.getFullYear() - i));

const VACIO: ResumenZonaGastos = { zona_id: null, fijo: 0, variable: 0, total_gastos: 0, ingresos: 0, margen: 0 };

function TarjetaZona({ titulo, sub, icono, dashed, resumen, onClick }: {
  titulo: string; sub: string; icono: string; dashed?: boolean; resumen: ResumenZonaGastos; onClick: () => void;
}) {
  const margenPositivo = resumen.margen >= 0;
  return (
    <CardBox
      className={`p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${dashed ? 'border-dashed' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide mb-1">
            <Icon icon={icono} height={13} />
            {sub}
          </div>
          <h3 className="text-lg font-semibold truncate mb-1">{titulo}</h3>
          <p className="text-2xl font-bold">S/ {resumen.total_gastos.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">gastado este mes</p>
        </div>
        <div className={`flex flex-col items-end gap-0.5 shrink-0 ${margenPositivo ? 'text-success' : 'text-error'}`}>
          <Icon icon={margenPositivo ? 'tabler:trending-up' : 'tabler:trending-down'} height={26} />
          <span className="text-sm font-semibold whitespace-nowrap">S/ {resumen.margen.toFixed(2)}</span>
          <span className="text-[11px] text-muted-foreground">margen</span>
        </div>
      </div>

      <div className="flex justify-between mt-4 pt-4 border-t border-ld text-xs">
        <span className="text-info font-medium">Fijo: S/ {resumen.fijo.toFixed(2)}</span>
        <span className="text-warning font-medium">Variable: S/ {resumen.variable.toFixed(2)}</span>
        <span className="text-muted-foreground">Ingresos: S/ {resumen.ingresos.toFixed(2)}</span>
      </div>
    </CardBox>
  );
}

const Gastos = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [resumen, setResumen] = useState<ResumenZonaGastos[]>([]);
  const [mesSel, setMesSel] = useState(String(hoy.getMonth() + 1).padStart(2, '0'));
  const [anioSel, setAnioSel] = useState(String(hoy.getFullYear()));

  const mes = `${anioSel}-${mesSel}`;

  useEffect(() => {
    listZonas().then(setZonas);
  }, []);

  useEffect(() => {
    getResumenPorZona(mes).then(setResumen);
  }, [mes]);

  const porZona = new Map(resumen.map((r) => [r.zona_id, r]));
  const general = porZona.get(null) ?? VACIO;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl">Gastos</h1>
          <p className="text-sm text-muted-foreground">Fijos, variables y margen por zona — selecciona una para ver el detalle</p>
        </div>
        <div className="flex gap-2">
          <Select value={mesSel} onValueChange={setMesSel}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={anioSel} onValueChange={setAnioSel}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANIOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {zonas.map((z) => (
          <TarjetaZona
            key={z.id}
            titulo={z.nombre}
            sub="Zona"
            icono="tabler:map-pin"
            resumen={porZona.get(z.id) ?? { ...VACIO, zona_id: z.id }}
            onClick={() => navigate(`/gastos/zona/${z.id}?mes=${mes}`)}
          />
        ))}

        <TarjetaZona
          titulo="General"
          sub="Sin zona"
          icono="tabler:building"
          dashed
          resumen={general}
          onClick={() => navigate(`/gastos/zona/general?mes=${mes}`)}
        />
      </div>
    </div>
  );
};

export default Gastos;
