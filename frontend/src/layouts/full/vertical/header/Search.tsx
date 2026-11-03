import { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import SidebarContent, { ChildItem, MenuItem } from '../sidebar/sidebaritems';
import { Link } from 'react-router';
import SimpleBar from 'simplebar-react';
import { Input } from 'src/components/ui/input';

interface SearchResult {
  name: string;
  url: string;
  path: string | undefined;
  icon?: string;
}

function Search() {
  const [query, setQuery] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  // Ctrl/⌘ + K enfoca el buscador, como anuncia la propia pista del campo.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
      if (e.key === 'Escape') setQuery('');
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  const searchItems = (
    items: (MenuItem | ChildItem)[],
    q: string,
    parentPath = '',
  ): SearchResult[] => {
    let results: SearchResult[] = [];

    items.forEach((item) => {
      const currentPath = parentPath ? `${parentPath} → ${item.name}` : item.name;

      if (item.name?.toLowerCase().includes(q.toLowerCase()) && item.url) {
        results.push({
          name: item.name,
          url: item.url,
          path: currentPath,
          icon: item.icon,
        });
      }

      if (item.children) {
        results = [...results, ...searchItems(item.children, q, currentPath)];
      }
    });

    return results;
  };

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchItems(SidebarContent, query);
  }, [query]);

  return (
    <div className="relative w-full max-w-md">
      <div className="relative flex items-center">
        <Icon
          icon="tabler:search"
          width="18"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />

        <Input
          ref={campo}
          placeholder="Buscar clientes, zonas, ONUs…"
          className="h-10 rounded-xl pl-10 pr-20"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Pista del atajo: desaparece al escribir para no estorbar */}
        {!query && (
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-ld bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Ctrl + K
          </kbd>
        )}
      </div>

      <div
        className={`absolute start-0 top-12 z-20 w-full overflow-hidden rounded-xl border border-ld bg-popover shadow-lg ${
          query ? 'block' : 'hidden'
        }`}
      >
        <SimpleBar className="custom-scroll max-h-72 p-2">
          {results.length ? (
            results.map((item, i) => (
              <Link
                key={i}
                to={item.url}
                onClick={() => setQuery('')}
                className="transition-ui mb-1 flex w-full items-center gap-3 rounded-lg p-2.5 last:mb-0 hover:bg-lightprimary hover:text-primary"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                  <Icon icon={item.icon || 'tabler:circle'} width={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.path}</span>
                </span>
              </Link>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Sin resultados para “{query}”
              </p>
            </div>
          )}
        </SimpleBar>
      </div>
    </div>
  );
}

export default Search;
