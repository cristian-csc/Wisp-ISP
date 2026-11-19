import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '@iconify/react';
import { useNavigate } from 'react-router';
import { Input } from 'src/components/ui/input';
import { listClientes, type ClienteListItem } from 'src/lib/clientes';
import { listOnus, type Onu } from 'src/lib/onus';
import { puedeAbrirRuta } from 'src/lib/permisos';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { useMenu } from 'src/lib/useMenu';
import { listZonas, type Zona } from 'src/lib/zonas';
import type { ChildItem, MenuItem } from '../sidebar/sidebaritems';

type Resultado = {
  id: string;
  grupo: string;
  titulo: string;
  detalle?: string;
  icono: string;
  a: string;
};

const MINIMO_PARA_BUSCAR = 2;
const ESPERA_AL_ESCRIBIR = 220;
const MAXIMO_POR_GRUPO = 5;

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const contiene = (texto: string | null | undefined, busqueda: string) =>
  !!texto && normalizar(texto).includes(normalizar(busqueda));

function deCliente(c: ClienteListItem): Resultado {
  const documento = c.dni ? `DNI ${c.dni}` : c.ruc ? `RUC ${c.ruc}` : c.usuario_pppoe;
  return {
    id: `cliente-${c.id}`,
    grupo: 'Clientes',
    titulo: c.nombre,
    detalle: [documento, c.zona?.nombre].filter(Boolean).join(', '),
    icono: 'tabler:user',
    a: c.tipo_conexion === 'satelital' ? `/clientes-satelital/${c.id}` : `/clientes/${c.id}`,
  };
}

function deZona(z: Zona): Resultado {
  return { id: `zona-${z.id}`, grupo: 'Zonas', titulo: z.nombre, icono: 'tabler:map-pin', a: `/zonas/${z.id}` };
}

function deOnu(o: Onu): Resultado {
  return {
    id: `onu-${o.id}`,
    grupo: 'Equipos',
    titulo: o.numero_serie,
    detalle: o.cliente?.nombre ?? o.marca ?? undefined,
    icono: 'tabler:router',
    a: o.cliente_id ? `/clientes/${o.cliente_id}` : '/onus',
  };
}

function deMenu(items: (MenuItem | ChildItem)[], busqueda: string): Resultado[] {
  return items.flatMap((item) => {
    const propio: Resultado[] =
      item.url && item.name && contiene(item.name, busqueda)
        ? [{ id: `menu-${item.url}`, grupo: 'Secciones', titulo: item.name, icono: item.icon ?? 'tabler:circle', a: item.url }]
        : [];
    return [...propio, ...deMenu(item.children ?? [], busqueda)];
  });
}

function Search() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const menu = useMenu();
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);
  const zonas = useRef<Promise<Zona[]> | null>(null);
  const onus = useRef<Promise<Onu[]> | null>(null);

  const [query, setQuery] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [encontrados, setEncontrados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [activo, setActivo] = useState(0);

  const texto = query.trim();
  const rol = user?.rol;

  // Ctrl/⌘ + K enfoca el buscador, como anuncia la propia pista del campo.
  useEffect(() => {
    const alPulsar = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
        setAbierto(true);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  useEffect(() => {
    setActivo(0);
    setFallo(false);
    if (texto.length < MINIMO_PARA_BUSCAR) {
      setEncontrados([]);
      setBuscando(false);
      return;
    }

    let vigente = true;
    setBuscando(true);
    const espera = setTimeout(async () => {
      const veClientes = puedeAbrirRuta('/clientes/1', rol);
      const veZonas = puedeAbrirRuta('/zonas/1', rol);
      const veOnus = puedeAbrirRuta('/onus', rol);
      if (veZonas) zonas.current ??= listZonas().catch(() => { zonas.current = null; return []; });
      if (veOnus) onus.current ??= listOnus().catch(() => { onus.current = null; return []; });

      const [clientes, listaZonas, listaOnus] = await Promise.all([
        veClientes
          ? listClientes({ search: texto, per_page: MAXIMO_POR_GRUPO }).then((r) => r.items).catch(() => null)
          : Promise.resolve([] as ClienteListItem[]),
        veZonas ? zonas.current! : Promise.resolve([] as Zona[]),
        veOnus ? onus.current! : Promise.resolve([] as Onu[]),
      ]);
      if (!vigente) return;

      setFallo(clientes === null);
      setEncontrados([
        ...(clientes ?? []).map(deCliente),
        ...listaZonas.filter((z) => contiene(z.nombre, texto)).slice(0, MAXIMO_POR_GRUPO).map(deZona),
        ...listaOnus
          .filter((o) => contiene(o.numero_serie, texto) || contiene(o.mac, texto) || contiene(o.cliente?.nombre, texto))
          .slice(0, MAXIMO_POR_GRUPO)
          .map(deOnu),
      ]);
      setBuscando(false);
    }, ESPERA_AL_ESCRIBIR);

    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto, rol]);

  const resultados = useMemo(
    () => (texto ? [...encontrados, ...deMenu(menu, texto).slice(0, MAXIMO_POR_GRUPO)] : []),
    [encontrados, menu, texto],
  );

  const grupos = useMemo(() => {
    const porGrupo = new Map<string, Resultado[]>();
    resultados.forEach((r) => porGrupo.set(r.grupo, [...(porGrupo.get(r.grupo) ?? []), r]));
    return [...porGrupo.entries()];
  }, [resultados]);

  const visible = abierto && !!texto;
  const idOpcion = (r: Resultado) => `${idLista}-${r.id}`;

  function ir(r: Resultado) {
    setQuery('');
    setAbierto(false);
    campo.current?.blur();
    navigate(r.a);
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setQuery('');
      setAbierto(false);
    } else if (e.key === 'ArrowDown' && resultados.length) {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp' && resultados.length) {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Enter' && resultados[activo]) {
      e.preventDefault();
      ir(resultados[activo]);
    }
  }

  return (
    <div className="relative w-full xl:max-w-md">
      <div className="relative flex items-center">
        <Icon
          icon="tabler:search"
          width="18"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />

        <Input
          ref={campo}
          role="combobox"
          aria-label="Buscar clientes, zonas y equipos"
          aria-expanded={visible}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={visible && resultados[activo] ? idOpcion(resultados[activo]) : undefined}
          autoComplete="off"
          placeholder="Buscar clientes, zonas, ONUs…"
          className="h-11 rounded-xl pl-10 xl:h-10 xl:pr-20"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={alTeclear}
        />

        {/* Pista del atajo: desaparece al escribir para no estorbar */}
        {!query && (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-ld bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground xl:block">
            Ctrl + K
          </kbd>
        )}
      </div>

      <div
        className={`absolute start-0 top-12 z-50 w-full overflow-hidden rounded-xl border border-ld bg-popover shadow-lg ${
          visible ? 'block' : 'hidden'
        }`}
      >
        <div id={idLista} role="listbox" aria-label="Resultados" className="max-h-[min(24rem,60dvh)] overflow-y-auto p-2">
          {grupos.map(([grupo, filas]) => (
            <div key={grupo} role="group" aria-label={grupo} className="mb-1 last:mb-0">
              <p className="px-2.5 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{grupo}</p>
              {filas.map((r) => {
                const elegido = resultados[activo]?.id === r.id;
                return (
                  <div
                    key={r.id}
                    id={idOpcion(r)}
                    role="option"
                    aria-selected={elegido}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActivo(resultados.indexOf(r))}
                    onClick={() => ir(r)}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${
                      elegido ? 'bg-lightprimary' : ''
                    }`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Icon icon={r.icono} width={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.titulo}</span>
                      {r.detalle && <span className="block truncate text-xs text-muted-foreground">{r.detalle}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {buscando && (
            <p role="status" className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
              <Icon icon="tabler:loader-2" width={16} className="animate-spin" />
              Buscando…
            </p>
          )}

          {!buscando && fallo && (
            <p role="alert" className="px-2.5 py-3 text-sm text-error-text">
              No se pudieron buscar los clientes. Revisa tu conexión e inténtalo otra vez.
            </p>
          )}

          {!buscando && !fallo && resultados.length === 0 && (
            <p role="status" className="px-2.5 py-6 text-center text-sm text-muted-foreground">
              {texto.length < MINIMO_PARA_BUSCAR
                ? 'Escribe al menos 2 letras o números.'
                : `Sin resultados para “${texto}”. Prueba con el nombre, DNI, teléfono o usuario PPPoE.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Search;
