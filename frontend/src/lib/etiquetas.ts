import JsBarcode from 'jsbarcode';

/** Un sticker: el código que lee el lector y lo que lee una persona. */
export type Etiqueta = {
  codigo: string;
  titulo: string;
  detalle?: string | null;
};

export type FormatoEtiqueta = 'termica' | 'a4';

export const FORMATOS: { valor: FormatoEtiqueta; etiqueta: string; descripcion: string }[] = [
  { valor: 'termica', etiqueta: 'Rollo térmico 50 × 25 mm', descripcion: 'Una etiqueta por sticker, para impresoras de etiquetas.' },
  { valor: 'a4', etiqueta: 'Hoja A4 (3 × 8)', descripcion: '24 stickers por hoja adhesiva, en impresora común.' },
];

/** El código de barras en SVG. Code 128 lo lee cualquier lector USB, como el
 *  NETUM que ya se usa para las ONUs. */
export function codigoDeBarrasSvg(codigo: string, alto = 34): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, codigo, {
    format: 'CODE128',
    height: alto,
    width: 1.6,
    margin: 0,
    displayValue: false,
    background: 'transparent',
    lineColor: '#000',
  });
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg.outerHTML;
}

function escapar(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** El HTML de un sticker. Se usa igual en la vista previa y al imprimir. */
export function etiquetaHtml(e: Etiqueta): string {
  return `<div class="et">
  <div class="et-top"><span class="et-marca">WISP</span><span class="et-titulo">${escapar(e.titulo)}</span></div>
  <div class="et-barras">${codigoDeBarrasSvg(e.codigo)}</div>
  <div class="et-pie"><span class="et-codigo">${escapar(e.codigo)}</span>${e.detalle ? `<span class="et-detalle">${escapar(e.detalle)}</span>` : ''}</div>
</div>`;
}

/** Estilos del sticker; se reutilizan en la vista previa. */
export const ESTILO_ETIQUETA = `
.et { box-sizing: border-box; width: 50mm; height: 25mm; padding: 1.6mm 2.2mm; display: flex; flex-direction: column;
  justify-content: space-between; font-family: 'Geist', Arial, sans-serif; color: #000; background: #fff; overflow: hidden; }
.et-top { display: flex; align-items: baseline; gap: 1.4mm; min-width: 0; }
.et-marca { font-size: 6.5pt; font-weight: 800; letter-spacing: .02em; background: #000; color: #fff; padding: .2mm 1mm; border-radius: .6mm; flex: none; }
.et-titulo { font-size: 7pt; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.et-barras { height: 10.5mm; display: flex; }
.et-barras svg { width: 100%; height: 100%; }
.et-pie { display: flex; justify-content: space-between; align-items: baseline; gap: 1mm; }
.et-codigo { font-family: 'Geist Mono', 'Courier New', monospace; font-size: 8.5pt; font-weight: 700; letter-spacing: .04em; }
.et-detalle { font-size: 5.5pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
`;

const PAGINA: Record<FormatoEtiqueta, string> = {
  termica: `@page { size: 50mm 25mm; margin: 0; }
body { margin: 0; }
.hoja { display: block; }
.et { page-break-after: always; break-after: page; }`,
  a4: `@page { size: A4; margin: 10mm 6mm; }
body { margin: 0; }
.hoja { display: grid; grid-template-columns: repeat(3, 64mm); grid-auto-rows: 34mm; justify-content: center; }
.celda { display: flex; align-items: center; justify-content: center; break-inside: avoid; }
.et { transform: scale(1.22); transform-origin: center; }`,
};

/** Arma las etiquetas en un marco oculto y abre el diálogo de impresión del
 *  navegador. Un marco y no una ventana nueva: así no lo bloquea el navegador. */
export function imprimirEtiquetas(etiquetas: Etiqueta[], formato: FormatoEtiqueta) {
  const cuerpo = etiquetas.map((e) => (formato === 'a4' ? `<div class="celda">${etiquetaHtml(e)}</div>` : etiquetaHtml(e))).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas WISP</title>
<style>${ESTILO_ETIQUETA}${PAGINA[formato]}
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head>
<body><div class="hoja">${cuerpo}</div></body></html>`;

  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(marco);
  const doc = marco.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const quitar = () => setTimeout(() => marco.remove(), 1000);
  marco.contentWindow!.addEventListener('afterprint', quitar);
  setTimeout(() => {
    marco.contentWindow!.focus();
    marco.contentWindow!.print();
    // Por si el navegador no avisa al cerrar el diálogo.
    setTimeout(() => marco.isConnected && marco.remove(), 60_000);
  }, 250);
}
