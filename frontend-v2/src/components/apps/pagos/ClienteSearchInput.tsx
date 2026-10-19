import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { Input } from 'src/components/ui/input';
import { listClientes, type ClienteListItem } from 'src/lib/clientes';

interface Props {
  value: ClienteListItem | null;
  onChange: (cliente: ClienteListItem | null) => void;
  placeholder?: string;
  /** Si se indica, limita la búsqueda a clientes de esa zona (ej. al pedir un
   * retiro desde la vista de una zona específica). */
  zonaId?: number;
}

const ClienteSearchInput = ({ value, onChange, placeholder, zonaId }: Props) => {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<ClienteListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      listClientes({ search: query, page: 1, zona_id: zonaId })
        .then((data) => setResultados(data.items.slice(0, 8)))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, zonaId]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-ld p-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{value.nombre}</p>
          <p className="text-xs text-muted-foreground truncate">
            DNI {value.dni ?? '—'} · {value.usuario_pppoe}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery('');
          }}
          className="text-muted-foreground hover:text-error shrink-0"
        >
          <Icon icon="tabler:x" height={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Icon
          icon="tabler:search"
          height={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="pl-9"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </div>
      {open && query.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-ld bg-background shadow-lg max-h-64 overflow-y-auto">
          {buscando && <p className="p-3 text-xs text-muted-foreground">Buscando…</p>}
          {!buscando && resultados.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Sin resultados.</p>
          )}
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-primary/5 border-b border-ld last:border-0"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            >
              <p className="text-sm font-medium truncate">{c.nombre}</p>
              <p className="text-xs text-muted-foreground truncate">
                DNI {c.dni ?? '—'} · {c.usuario_pppoe}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClienteSearchInput;
