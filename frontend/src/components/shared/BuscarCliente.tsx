import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { Input } from 'src/components/ui/input';
import { listClientes } from 'src/lib/clientes';

export type ClienteElegido = { id: number; nombre: string; detalle?: string | null };

interface Props {
  valor: ClienteElegido | null;
  onChange: (c: ClienteElegido | null) => void;
  id?: string;
  placeholder?: string;
}

/** Busca un cliente por nombre, DNI o usuario PPPoE y lo elige. Si la sesión
 *  no puede consultar clientes, lo dice en vez de quedarse vacío. */
const BuscarCliente = ({ valor, onChange, id, placeholder = 'Nombre, DNI o usuario PPPoE' }: Props) => {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ClienteElegido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const turno = useRef(0);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    const mio = ++turno.current;
    setBuscando(true);
    const t = setTimeout(() => {
      listClientes({ search: q, per_page: 8 })
        .then((p) => {
          if (mio !== turno.current) return;
          setResultados(
            p.items.map((c: any) => ({
              id: c.id,
              nombre: c.nombre,
              detalle: [c.dni, c.zona?.nombre].filter(Boolean).join(' · ') || null,
            })),
          );
          setActivo(0);
        })
        .catch((err) => {
          if (mio === turno.current && err?.response?.status === 403) setSinPermiso(true);
        })
        .finally(() => mio === turno.current && setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [texto]);

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-ld bg-card px-3 py-2">
        <Icon icon="tabler:user-check" width={18} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{valor.nombre}</span>
          {valor.detalle && <span className="block truncate text-xs text-muted-foreground">{valor.detalle}</span>}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Quitar cliente"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon icon="tabler:x" width={15} />
        </button>
      </div>
    );
  }

  if (sinPermiso) {
    return <p className="text-xs text-muted-foreground">Tu cuenta no puede consultar clientes: indícalo en la nota.</p>;
  }

  function elegir(c: ClienteElegido) {
    onChange(c);
    setTexto('');
    setResultados([]);
    setAbierto(false);
  }

  return (
    <div className="relative">
      <Icon icon="tabler:search" width={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        value={texto}
        role="combobox"
        aria-expanded={abierto && resultados.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        className="pl-9 pr-9"
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!resultados.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActivo((a) => (a + 1) % resultados.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActivo((a) => (a - 1 + resultados.length) % resultados.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            elegir(resultados[activo]);
          }
        }}
      />
      {buscando && <Icon icon="tabler:loader-2" width={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {abierto && texto.trim().length >= 2 && !buscando && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ld bg-card py-1 shadow-lg">
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Ningún cliente coincide</li>
          ) : (
            resultados.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(c)}
                  className={`block w-full px-3 py-2 text-left ${i === activo ? 'bg-surface-2' : ''}`}
                >
                  <span className="block truncate text-sm font-medium">{c.nombre}</span>
                  {c.detalle && <span className="block truncate text-xs text-muted-foreground">{c.detalle}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default BuscarCliente;
