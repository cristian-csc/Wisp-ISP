import { useEffect, useId, useState } from 'react';
import { FieldIcon, FormField } from 'src/components/shared/form';
import { Input } from 'src/components/ui/input';
import {
  formatearCoordenadas,
  parsearCoordenadas,
  type Coordenadas,
} from 'src/lib/coordenadas';

/**
 * La ubicación, escrita y corregible a mano.
 *
 * Tocar el mapa está bien para encontrar el sitio, pero cuando la ubicación ya
 * está medida en otra parte —un recorrido hecho en Google Earth, por ejemplo—
 * pegar la coordenada es lo más exacto que hay: no depende de la imagen
 * satelital que se esté viendo ni de acertarle con el dedo.
 */
const CampoCoordenadas = ({
  valor,
  onChange,
  label = 'Ubicación',
}: {
  valor: Coordenadas | null;
  onChange: (c: Coordenadas) => void;
  label?: string;
}) => {
  const [texto, setTexto] = useState(() => formatearCoordenadas(valor));
  const [error, setError] = useState<string | null>(null);
  // Los dos diálogos (mufa y caja NAP) usan este campo: el id tiene que ser
  // distinto en cada uno o la etiqueta apuntaría al input equivocado.
  const id = useId();

  // Si la ubicación cambia desde fuera (otro toque en el mapa, o porque se
  // arrastró el punto), el campo tiene que reflejarlo.
  useEffect(() => {
    setTexto(formatearCoordenadas(valor));
    setError(null);
  }, [valor?.lat, valor?.lng]);

  function alEscribir(nuevo: string) {
    setTexto(nuevo);
    const c = parsearCoordenadas(nuevo);
    if (c) {
      setError(null);
      onChange(c);
    } else {
      setError('No entiendo esa ubicación. Pega algo como -15.491500, -70.129000');
    }
  }

  return (
    <FormField
      label={label}
      icon="tabler:crosshair"
      htmlFor={id}
      hint="Se llena al tocar el mapa. También puedes pegarla de Google Earth o Google Maps."
      error={error ?? undefined}
      wide
    >
      <FieldIcon icon="tabler:crosshair">
        <Input
          id={id}
          className="font-mono"
          placeholder="-15.491500, -70.129000"
          value={texto}
          onChange={(e) => alEscribir(e.target.value)}
        />
      </FieldIcon>
    </FormField>
  );
};

export default CampoCoordenadas;
