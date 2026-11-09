"""Reportes descargables en Excel y PDF.

Este módulo NO calcula nada: recibe las filas ya armadas por el router y solo
las formatea. Así el archivo que se descarga dice exactamente lo mismo que la
pantalla de la que salió, y cualquier cambio en los cálculos vive en un solo
sitio (el router), no duplicado aquí.
"""

from __future__ import annotations

import io
import os
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .config import settings

LOGO = os.path.join(os.path.dirname(__file__), "assets", "logo-wisp.png")

# Mismos colores que el panel: azul para lo principal, naranja solo de acento.
AZUL = colors.HexColor("#2563EB")
AZUL_SUAVE = colors.HexColor("#EFF6FF")
NARANJA = colors.HexColor("#F97316")
GRIS_TEXTO = colors.HexColor("#475569")
GRIS_LINEA = colors.HexColor("#E2E8F0")
GRIS_FILA = colors.HexColor("#F8FAFC")

XL_AZUL = "2563EB"
XL_AZUL_SUAVE = "EFF6FF"
XL_GRIS_LINEA = "E2E8F0"

MESES_NOMBRE = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

# Etiquetas para leer, no códigos. El recibo usa mayúsculas porque es un
# ticket; en un reporte que se imprime en hoja quedan mejor así.
METODO_LABEL = {
    "efectivo": "Efectivo",
    "yape": "Yape",
    "plin": "Plin",
    "transferencia": "Transferencia",
    "deposito": "Depósito",
    "otro": "Otro",
}

ESTADO_LABEL = {
    "pagado": "Pagado",
    "pendiente": "Pendiente",
    "vencido": "Vencido",
    "corte_temporal": "Corte temporal",
}


def etiqueta_mes(mes: str) -> str:
    """'2026-11' -> 'Noviembre 2026'. Devuelve el original si no tiene ese formato."""
    try:
        anio, m = mes.split("-")
        return f"{MESES_NOMBRE[int(m) - 1]} {anio}"
    except (ValueError, IndexError):
        return mes


# -- Descripcion de un reporte -----------------------------------------------

@dataclass
class Columna:
    titulo: str
    # "texto" | "entero" | "dinero" | "fecha"
    tipo: str = "texto"
    # Peso relativo del ancho en el PDF (en Excel se calcula por contenido).
    peso: float = 1.0


@dataclass
class Bloque:
    """Resumen corto que se imprime antes de la tabla de detalle.

    Por ejemplo "por metodo de pago" o "quien cobro" en el corte de caja.
    """
    titulo: str
    filas: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class Reporte:
    titulo: str
    columnas: list[Columna]
    filas: list[list[Any]]
    # Nombre base del archivo, sin extension ni fecha.
    archivo: str = "reporte"
    subtitulo: str = ""
    # Lineas de contexto: que filtros estaban aplicados cuando se descargo.
    filtros: list[str] = field(default_factory=list)
    bloques: list[Bloque] = field(default_factory=list)
    # Fila final de totales; misma cantidad de celdas que columnas.
    totales: Optional[list[Any]] = None
    generado_por: str = ""
    # Añade la fecha de hoy al nombre del archivo. Se desactiva cuando el
    # nombre ya lleva su propia fecha (un corte de caja, un mes concreto),
    # para no terminar con "corte-caja-2026-10-02-2026-11-08.xlsx".
    fechar: bool = True


def parte_de_nombre(texto: str) -> str:
    """Convierte un nombre en algo que sirva dentro de un nombre de archivo.

    Quita tildes, deja solo letras y números y une con guiones, para que el
    archivo abra igual en Windows, en el celular y al mandarlo por correo.
    """
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    limpio = re.sub(r"[^A-Za-z0-9]+", "-", sin_tildes).strip("-").lower()
    return limpio[:48] or "sin-nombre"


def nombre_archivo(r: Reporte, formato: str) -> str:
    ext = "xlsx" if formato == "excel" else "pdf"
    sufijo = f"-{date.today().isoformat()}" if r.fechar else ""
    return f"{r.archivo}{sufijo}.{ext}"


def _momento() -> str:
    return datetime.now().strftime("%d/%m/%Y %H:%M")


def _empresa() -> str:
    partes = [settings.EMPRESA_NOMBRE]
    if settings.EMPRESA_RUBRO:
        partes.append(settings.EMPRESA_RUBRO)
    return " - ".join(p for p in partes if p)


# -- Excel -------------------------------------------------------------------

def excel(r: Reporte) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = (r.titulo[:31] or "Reporte")

    ancho_tabla = max(len(r.columnas), 2)
    borde = Side(style="thin", color=XL_GRIS_LINEA)
    fila = 1

    def escribir_titulo(texto: str, tam: int, negrita: bool, color: str = "000000"):
        nonlocal fila
        celda = ws.cell(row=fila, column=1, value=texto)
        celda.font = Font(size=tam, bold=negrita, color=color)
        ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=ancho_tabla)
        fila += 1

    escribir_titulo(_empresa(), 12, True, XL_AZUL)
    escribir_titulo(r.titulo, 14, True)
    if r.subtitulo:
        escribir_titulo(r.subtitulo, 10, False, "475569")
    for f in r.filtros:
        escribir_titulo(f, 9, False, "475569")
    pie = f"Generado el {_momento()}"
    if r.generado_por:
        pie += f" por {r.generado_por}"
    escribir_titulo(pie, 9, False, "94A3B8")
    fila += 1

    # Bloques de resumen, uno debajo del otro.
    for b in r.bloques:
        escribir_titulo(b.titulo, 11, True)
        for etiqueta, valor in b.filas:
            ws.cell(row=fila, column=1, value=etiqueta).font = Font(size=10)
            ws.cell(row=fila, column=2, value=valor).font = Font(size=10, bold=True)
            fila += 1
        if not b.filas:
            ws.cell(row=fila, column=1, value="Sin movimientos").font = Font(size=10, color="94A3B8")
            fila += 1
        fila += 1

    # Cabecera de la tabla de detalle.
    encabezado = fila
    for i, col in enumerate(r.columnas, start=1):
        c = ws.cell(row=fila, column=i, value=col.titulo)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = PatternFill("solid", fgColor=XL_AZUL)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(top=borde, bottom=borde, left=borde, right=borde)
    ws.row_dimensions[fila].height = 22
    fila += 1

    def formato_celda(c, tipo: str):
        if tipo == "dinero":
            c.number_format = '"S/ "#,##0.00'
            c.alignment = Alignment(horizontal="right")
        elif tipo == "entero":
            c.number_format = "0"
            c.alignment = Alignment(horizontal="right")
        elif tipo == "fecha":
            c.number_format = "DD/MM/YYYY"
            c.alignment = Alignment(horizontal="center")
        else:
            c.alignment = Alignment(horizontal="left")

    for datos in r.filas:
        for i, (col, valor) in enumerate(zip(r.columnas, datos), start=1):
            c = ws.cell(row=fila, column=i, value=valor)
            c.font = Font(size=10)
            c.border = Border(top=borde, bottom=borde, left=borde, right=borde)
            formato_celda(c, col.tipo)
        fila += 1

    ultima_detalle = fila - 1

    if r.totales:
        for i, (col, valor) in enumerate(zip(r.columnas, r.totales), start=1):
            c = ws.cell(row=fila, column=i, value=valor)
            c.font = Font(size=10, bold=True)
            c.fill = PatternFill("solid", fgColor=XL_AZUL_SUAVE)
            c.border = Border(top=borde, bottom=borde, left=borde, right=borde)
            formato_celda(c, col.tipo)
            if col.tipo == "texto":
                c.alignment = Alignment(horizontal="left")
        fila += 1

    # Filtro y panel fijo sobre la cabecera: asi se puede ordenar y buscar
    # sin perder de vista los titulos al bajar.
    if ultima_detalle > encabezado:
        ws.auto_filter.ref = f"A{encabezado}:{get_column_letter(len(r.columnas))}{ultima_detalle}"
    ws.freeze_panes = f"A{encabezado + 1}"

    # Ancho de columna segun el contenido mas largo.
    for i, col in enumerate(r.columnas, start=1):
        largo = len(col.titulo)
        for datos in r.filas:
            if i - 1 < len(datos):
                valor = datos[i - 1]
                largo = max(largo, len("" if valor is None else str(valor)))
        ws.column_dimensions[get_column_letter(i)].width = min(max(largo + 4, 10), 42)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# -- PDF ---------------------------------------------------------------------

def _celda(valor: Any, col: Columna, estilo: ParagraphStyle) -> Any:
    if valor is None or valor == "":
        return ""
    if col.tipo == "dinero":
        return f"S/ {float(valor):,.2f}"
    if col.tipo == "entero":
        return str(int(valor))
    if col.tipo == "fecha":
        return valor.strftime("%d/%m/%Y") if hasattr(valor, "strftime") else str(valor)
    # El texto va en Paragraph para que los nombres largos corten de linea
    # en lugar de desbordar la columna.
    return Paragraph(str(valor), estilo)


def pdf(r: Reporte) -> bytes:
    horizontal = len(r.columnas) > 6
    tamano = landscape(A4) if horizontal else A4
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=tamano,
        leftMargin=11 * mm,
        rightMargin=11 * mm,
        topMargin=11 * mm,
        bottomMargin=16 * mm,
        title=r.titulo,
        author=settings.EMPRESA_NOMBRE,
    )

    normal = ParagraphStyle("n", fontName="Helvetica", fontSize=7.6, leading=9.4)
    cabecera_col = ParagraphStyle("nb", parent=normal, textColor=colors.white,
                                  fontName="Helvetica-Bold", alignment=1)
    h_empresa = ParagraphStyle("he", fontName="Helvetica-Bold", fontSize=11,
                               leading=13, textColor=AZUL)
    h_rubro = ParagraphStyle("hr", fontName="Helvetica", fontSize=8,
                             leading=10, textColor=GRIS_TEXTO)
    h_titulo = ParagraphStyle("ht", fontName="Helvetica-Bold", fontSize=14, leading=17)
    h_sub = ParagraphStyle("hs", fontName="Helvetica", fontSize=9,
                           leading=12, textColor=GRIS_TEXTO)
    h_bloque = ParagraphStyle("hb", fontName="Helvetica-Bold", fontSize=9.5, leading=12)

    partes: list[Any] = []

    # Encabezado: logo a la izquierda, datos de la empresa al costado.
    texto_empresa = [Paragraph(settings.EMPRESA_NOMBRE, h_empresa)]
    for dato in (settings.EMPRESA_RUBRO,
                 f"RUC: {settings.EMPRESA_RUC}" if settings.EMPRESA_RUC else "",
                 settings.EMPRESA_DIRECCION,
                 settings.EMPRESA_CIUDAD,
                 f"Tel. {settings.EMPRESA_TELEFONOS}" if settings.EMPRESA_TELEFONOS else ""):
        if dato:
            texto_empresa.append(Paragraph(dato, h_rubro))

    if os.path.exists(LOGO):
        ancho_px, alto_px = ImageReader(LOGO).getSize()
        ancho = 26 * mm
        logo = Image(LOGO, width=ancho, height=ancho * alto_px / ancho_px)
        cabecera = Table([[logo, texto_empresa]], colWidths=[31 * mm, doc.width - 31 * mm])
    else:
        cabecera = Table([[texto_empresa]], colWidths=[doc.width])
    cabecera.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    partes.append(cabecera)
    partes.append(Spacer(1, 7 * mm))

    partes.append(Paragraph(r.titulo, h_titulo))
    if r.subtitulo:
        partes.append(Paragraph(r.subtitulo, h_sub))
    for f in r.filtros:
        partes.append(Paragraph(f, h_sub))
    partes.append(Spacer(1, 5 * mm))

    # Bloques de resumen, repartidos en columnas lado a lado.
    if r.bloques:
        columnas_bloque: list[Any] = []
        for b in r.bloques:
            filas: list[list[Any]] = [[Paragraph(b.titulo, h_bloque), ""]]
            filas += [[Paragraph(e, normal), Paragraph(f"<b>{v}</b>", normal)]
                      for e, v in b.filas]
            if not b.filas:
                filas.append([Paragraph("Sin movimientos", normal), ""])
            t = Table(filas)
            t.setStyle(TableStyle([
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, AZUL),
                ("ALIGN", (1, 1), (1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]))
            columnas_bloque.append(t)
        ancho_col = doc.width / len(columnas_bloque)
        rejilla = Table([columnas_bloque], colWidths=[ancho_col] * len(columnas_bloque))
        rejilla.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ]))
        partes.append(rejilla)
        partes.append(Spacer(1, 6 * mm))

    # Tabla de detalle.
    peso_total = sum(c.peso for c in r.columnas) or 1
    anchos = [doc.width * c.peso / peso_total for c in r.columnas]

    datos: list[list[Any]] = [[Paragraph(c.titulo, cabecera_col) for c in r.columnas]]
    for f in r.filas:
        datos.append([_celda(v, c, normal) for c, v in zip(r.columnas, f)])
    if not r.filas:
        datos.append(["Sin registros para estos filtros."] + [""] * (len(r.columnas) - 1))

    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), AZUL),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRIS_FILA]),
        ("GRID", (0, 0), (-1, -1), 0.25, GRIS_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if not r.filas:
        estilo += [
            ("SPAN", (0, 1), (-1, 1)),
            ("ALIGN", (0, 1), (-1, 1), "CENTER"),
            ("TEXTCOLOR", (0, 1), (-1, 1), GRIS_TEXTO),
        ]
    for i, c in enumerate(r.columnas):
        if c.tipo in ("dinero", "entero"):
            estilo.append(("ALIGN", (i, 1), (i, -1), "RIGHT"))
        elif c.tipo == "fecha":
            estilo.append(("ALIGN", (i, 1), (i, -1), "CENTER"))

    if r.totales:
        datos.append([_celda(v, c, normal) for c, v in zip(r.columnas, r.totales)])
        ultima = len(datos) - 1
        estilo += [
            ("BACKGROUND", (0, ultima), (-1, ultima), AZUL_SUAVE),
            ("FONTNAME", (0, ultima), (-1, ultima), "Helvetica-Bold"),
            ("LINEABOVE", (0, ultima), (-1, ultima), 0.8, AZUL),
        ]

    tabla = Table(datos, colWidths=anchos, repeatRows=1)
    tabla.setStyle(TableStyle(estilo))
    partes.append(tabla)

    def pie_pagina(lienzo, documento):
        lienzo.saveState()
        lienzo.setStrokeColor(NARANJA)
        lienzo.setLineWidth(1.4)
        lienzo.line(documento.leftMargin, 13 * mm,
                    documento.pagesize[0] - documento.rightMargin, 13 * mm)
        lienzo.setFont("Helvetica", 7)
        lienzo.setFillColor(GRIS_TEXTO)
        izquierda = f"Generado el {_momento()}"
        if r.generado_por:
            izquierda += f" por {r.generado_por}"
        lienzo.drawString(documento.leftMargin, 8.5 * mm, izquierda)
        lienzo.drawRightString(
            documento.pagesize[0] - documento.rightMargin, 8.5 * mm,
            f"Página {documento.page}",
        )
        lienzo.restoreState()

    doc.build(partes, onFirstPage=pie_pagina, onLaterPages=pie_pagina)
    return buf.getvalue()


def generar(r: Reporte, formato: str) -> tuple[bytes, str, str]:
    """Devuelve (contenido, nombre de archivo, tipo de contenido)."""
    if formato == "excel":
        return (
            excel(r),
            nombre_archivo(r, "excel"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    return pdf(r), nombre_archivo(r, "pdf"), "application/pdf"
