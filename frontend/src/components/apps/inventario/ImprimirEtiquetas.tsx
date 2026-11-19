import { useEffect, useMemo, useState } from 'react';
import { FormActions, FormDialog, FormField } from 'src/components/shared/form';
import OpcionMarcable from 'src/components/shared/OpcionMarcable';
import { Input } from 'src/components/ui/input';
import { ESTILO_ETIQUETA, FORMATOS, etiquetaHtml, imprimirEtiquetas, type Etiqueta, type FormatoEtiqueta } from 'src/lib/etiquetas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etiquetas: Etiqueta[];
  /** Para un material a granel: una sola etiqueta que se imprime varias veces. */
  conCopias?: boolean;
  titulo?: string;
}

const PREVIA = 6;
let estiloPuesto = false;

/** Elige formato y copias, muestra cómo saldrá el sticker y manda a imprimir. */
const ImprimirEtiquetas = ({ open, onOpenChange, etiquetas, conCopias = false, titulo = 'Imprimir etiquetas' }: Props) => {
  const [formato, setFormato] = useState<FormatoEtiqueta>(() => {
    try {
      return (localStorage.getItem('wisp_formato_etiqueta') as FormatoEtiqueta) || 'termica';
    } catch {
      return 'termica';
    }
  });
  const [copias, setCopias] = useState('1');

  useEffect(() => {
    if (open) setCopias('1');
    if (open && !estiloPuesto) {
      // Los estilos del sticker sirven también para la vista previa.
      const s = document.createElement('style');
      s.textContent = ESTILO_ETIQUETA;
      document.head.appendChild(s);
      estiloPuesto = true;
    }
  }, [open]);

  const n = conCopias ? Math.min(Math.max(Number(copias) || 0, 0), 500) : 1;
  const todas = useMemo(() => etiquetas.flatMap((e) => Array.from({ length: n }, () => e)), [etiquetas, n]);
  const previa = useMemo(() => {
    try {
      return etiquetas.slice(0, PREVIA).map((e) => ({ codigo: e.codigo, html: etiquetaHtml(e) }));
    } catch {
      return [];
    }
  }, [etiquetas]);

  function imprimir() {
    try {
      localStorage.setItem('wisp_formato_etiqueta', formato);
    } catch {
      /* sin almacenamiento: se vuelve a elegir la próxima vez */
    }
    imprimirEtiquetas(todas, formato);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={titulo}
      subtitle={`${todas.length} sticker${todas.length === 1 ? '' : 's'} con código de barras para pegar en el equipo`}
      icon="tabler:barcode"
      size="lg"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel="Imprimir"
          submitIcon="tabler:printer"
          onSubmit={imprimir}
          disabled={todas.length === 0}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Así sale</h3>
          <div className="flex flex-wrap gap-3 rounded-xl bg-surface-2 p-4">
            {previa.map((p, i) => (
              <div
                key={`${p.codigo}-${i}`}
                className="overflow-hidden rounded-sm shadow-[0_0_0_1px_var(--border)]"
                dangerouslySetInnerHTML={{ __html: p.html }}
              />
            ))}
            {etiquetas.length > PREVIA && (
              <p className="self-center text-sm text-muted-foreground">y {etiquetas.length - PREVIA} más</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            El código de barras es Code 128: lo lee el mismo lector USB de las ONUs. Al pasarlo, el sistema encuentra la pieza.
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Papel</h3>
          <div role="radiogroup" aria-label="Formato" className="grid gap-2 sm:grid-cols-2">
            {FORMATOS.map((f) => (
              <OpcionMarcable
                key={f.valor}
                tipo="unica"
                icono={f.valor === 'termica' ? 'tabler:receipt' : 'tabler:file'}
                titulo={f.etiqueta}
                descripcion={f.descripcion}
                marcada={formato === f.valor}
                onCambiar={() => setFormato(f.valor)}
              />
            ))}
          </div>
        </section>

        {conCopias && (
          <FormField label="Copias" htmlFor="et-copias" hint="Una por cada caja, bolsa o estante donde va este material.">
            <Input
              id="et-copias"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={copias}
              onChange={(e) => setCopias(e.target.value)}
              className="w-32 tabular-nums"
            />
          </FormField>
        )}
      </div>
    </FormDialog>
  );
};

export default ImprimirEtiquetas;
