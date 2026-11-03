import { Icon } from '@iconify/react';
import { Input } from '../ui/input';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/** Buscador con icono y botón de limpiar, igual en todos los módulos. */
const SearchInput = ({ value, onChange, placeholder = 'Buscar…', className = '' }: Props) => (
  <div className={`relative ${className}`}>
    <Icon
      icon="tabler:search"
      width={17}
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="pl-9 pr-9"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Limpiar búsqueda"
        className="transition-ui absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon icon="tabler:x" width={14} />
      </button>
    )}
  </div>
);

export default SearchInput;
