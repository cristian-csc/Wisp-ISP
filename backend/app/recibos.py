"""Recibo de pago en PDF, con el mismo formato de ticket que la empresa ya usaba.

Se arma en papel angosto (80 mm) y de alto variable, porque un cobro adelantado
lista un renglón por mes. No depende de la base de datos: recibe los datos ya
resueltos, así la misma función sirve para el endpoint y para el envío por
WhatsApp.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO
from typing import Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .config import settings

LOGO = os.path.join(os.path.dirname(__file__), "assets", "logo-wisp.png")

ANCHO = 80 * mm
MARGEN = 4 * mm
UTIL = ANCHO - 2 * MARGEN

NEGRO = HexColor("#000000")
GRIS = HexColor("#555555")
LINEA = HexColor("#999999")

MESES_NOMBRE = [
    "", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]

METODO_LABEL = {
    "efectivo": "EFECTIVO",
    "yape": "YAPE",
    "plin": "PLIN",
    "transferencia": "TRANSFERENCIA",
    "deposito": "DEPOSITO",
    "otro": "OTRO",
}


# ── Importe en letras ────────────────────────────────────────────────────────

_UNIDADES = [
    "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS",
    "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE",
]
_DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA",
            "SETENTA", "OCHENTA", "NOVENTA"]
_CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS",
             "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS",
             "NOVECIENTOS"]


def _centenas_en_letras(n: int) -> str:
    """0..999 en palabras."""
    if n == 0:
        return ""
    if n <= 20:
        return _UNIDADES[n]
    if n < 100:
        d, u = divmod(n, 10)
        if d == 2:
            return "VEINTI" + _UNIDADES[u] if u else "VEINTE"
        return _DECENAS[d] + (f" Y {_UNIDADES[u]}" if u else "")
    if n == 100:
        return "CIEN"
    c, resto = divmod(n, 100)
    return _CENTENAS[c] + (f" {_centenas_en_letras(resto)}" if resto else "")


def importe_en_letras(monto: float) -> str:
    """40.0 → 'CUARENTA CON 00/100 SOLES'."""
    entero = int(monto)
    centimos = int(round((monto - entero) * 100))
    if entero == 0:
        letras = "CERO"
    elif entero < 1000:
        letras = _centenas_en_letras(entero)
    else:
        miles, resto = divmod(entero, 1000)
        cabeza = "MIL" if miles == 1 else f"{_centenas_en_letras(miles)} MIL"
        letras = cabeza + (f" {_centenas_en_letras(resto)}" if resto else "")
    return f"{letras} CON {centimos:02d}/100 SOLES"


# ── Datos que necesita el recibo ─────────────────────────────────────────────

@dataclass
class LineaRecibo:
    """Un renglón de la tabla: un mes cobrado."""
    mes: str          # "2026-11"
    plan: str
    precio: float
    total: float


@dataclass
class DatosRecibo:
    numero: int
    cliente: str
    direccion: Optional[str]
    dia_pago: Optional[int]
    dia_corte: Optional[int]
    fecha_pago: date
    hora_pago: Optional[datetime]
    metodo_pago: str
    numero_operacion: Optional[str]
    cajero: Optional[str]
    lineas: list[LineaRecibo] = field(default_factory=list)
    mensualidad: float = 0.0
    otros: float = 0.0
    descuento: float = 0.0
    pagado: float = 0.0
    observaciones: Optional[str] = None

    @property
    def imp_total(self) -> float:
        return round(self.mensualidad + self.otros, 2)


def etiqueta_mes(mes: str) -> str:
    anio, m = mes.split("-")
    return f"{MESES_NOMBRE[int(m)]}-{anio}"


# ── Dibujo ───────────────────────────────────────────────────────────────────

class _Lienzo:
    """Cursor de escritura de arriba hacia abajo, en milímetros."""

    def __init__(self, c: canvas.Canvas, alto: float):
        self.c = c
        self.y = alto - MARGEN

    def saltar(self, mm_: float) -> None:
        """Baja el cursor. El valor va en milímetros, como todo el papel."""
        self.y -= mm_ * mm

    def centrado(self, texto: str, tam: float = 8, negrita: bool = False,
                 color=NEGRO, salto: float = 4.2) -> None:
        self.c.setFont("Helvetica-Bold" if negrita else "Helvetica", tam)
        self.c.setFillColor(color)
        self.c.drawCentredString(ANCHO / 2, self.y, texto)
        self.saltar(salto)

    def izq(self, texto: str, tam: float = 7.5, negrita: bool = False,
            color=NEGRO, salto: float = 4.0) -> None:
        self.c.setFont("Helvetica-Bold" if negrita else "Helvetica", tam)
        self.c.setFillColor(color)
        self.c.drawString(MARGEN, self.y, texto)
        self.saltar(salto)

    def par(self, etiqueta: str, valor: str, tam: float = 7.5) -> None:
        """Etiqueta a la izquierda, valor pegado a la derecha."""
        self.c.setFillColor(NEGRO)
        self.c.setFont("Helvetica", tam)
        self.c.drawString(MARGEN, self.y, etiqueta)
        self.c.setFont("Helvetica-Bold", tam)
        self.c.drawRightString(ANCHO - MARGEN, self.y, valor)
        self.saltar(4.0)

    def separador(self, salto: float = 3.2) -> None:
        self.c.setStrokeColor(LINEA)
        self.c.setLineWidth(0.4)
        self.c.setDash(1.2, 1.2)
        self.c.line(MARGEN, self.y + 1.2, ANCHO - MARGEN, self.y + 1.2)
        self.c.setDash()
        self.saltar(salto)

    def envuelto(self, texto: str, tam: float = 7.5, negrita: bool = False,
                 color=NEGRO, sangria: float = 0) -> None:
        """Parte el texto en varias líneas si no cabe a lo ancho."""
        fuente = "Helvetica-Bold" if negrita else "Helvetica"
        self.c.setFont(fuente, tam)
        self.c.setFillColor(color)
        ancho = UTIL - sangria
        linea = ""
        for palabra in texto.split():
            prueba = f"{linea} {palabra}".strip()
            if self.c.stringWidth(prueba, fuente, tam) <= ancho:
                linea = prueba
            else:
                self.c.drawString(MARGEN + sangria, self.y, linea)
                self.saltar(3.6)
                linea = palabra
        if linea:
            self.c.drawString(MARGEN + sangria, self.y, linea)
            self.saltar(3.6)


def generar_recibo_pdf(d: DatosRecibo) -> bytes:
    """Devuelve el PDF del recibo, listo para guardar o mandar.

    Se dibuja dos veces: la primera sobre un lienzo de sobra, solo para medir
    cuánto ocupa de verdad, y la segunda con el papel ya recortado a ese alto.
    Así el ticket nunca sale cortado ni con media hoja en blanco.
    """
    alto = _dibujar(BytesIO(), d, 600 * mm)
    buffer = BytesIO()
    _dibujar(buffer, d, alto)
    return buffer.getvalue()


def _dibujar(destino: BytesIO, d: DatosRecibo, alto: float) -> float:
    """Pinta el recibo y devuelve el alto que realmente ocupó."""
    c = canvas.Canvas(destino, pagesize=(ANCHO, alto))
    c.setTitle(f"Recibo {d.numero}")
    L = _Lienzo(c, alto)

    # Logo
    if os.path.exists(LOGO):
        ancho_mm, alto_mm = 44.0, 16.0
        L.saltar(alto_mm)
        c.drawImage(
            LOGO, (ANCHO - ancho_mm * mm) / 2, L.y, width=ancho_mm * mm, height=alto_mm * mm,
            preserveAspectRatio=True, mask="auto",
        )
        L.saltar(2.5)

    # Encabezado de la empresa
    L.centrado(settings.EMPRESA_NOMBRE, tam=10, negrita=True, salto=4.6)
    L.centrado(f"RUC: {settings.EMPRESA_RUC}", tam=7.5)
    L.centrado(f"DIRECCION: {settings.EMPRESA_DIRECCION}", tam=7.5)
    L.centrado(settings.EMPRESA_CIUDAD, tam=7.5)
    L.centrado(f"TELEFONO: {settings.EMPRESA_TELEFONOS}", tam=7.5)
    L.centrado(f"CORREO: {settings.EMPRESA_CORREO}", tam=7.5, salto=5)

    L.separador()
    L.centrado("RECIBO DE PAGO", tam=9, negrita=True, salto=4.4)
    L.centrado(f"N° {d.numero}", tam=8.5, salto=5)
    L.separador()

    # Datos del cobro
    L.izq(f"CLIENTE: {d.cliente}", negrita=True)
    if d.direccion:
        L.envuelto(f"DIRECCION: {d.direccion}")
    if d.dia_pago:
        L.izq(f"DIA DE PAGO: {d.dia_pago} De cada mes")
    if d.dia_corte:
        L.izq(f"DIA DE CORTE: {d.dia_corte} De cada mes")
    L.izq(f"FECHA DE PAGO: {d.fecha_pago.isoformat()}")
    if d.hora_pago:
        L.izq(f"HORA DE PAGO: {d.hora_pago.strftime('%H:%M:%S')}")
    L.izq("ESTADO DEL RECIBO: Pagado")
    L.izq(f"TIPO DE PAGO: {METODO_LABEL.get(d.metodo_pago, d.metodo_pago.upper())}")
    L.izq(f"NUMERO DE OPERACION: {d.numero_operacion or ''}")
    if d.cajero:
        L.izq(f"CAJERO: {d.cajero}")
    L.saltar(1.5)
    L.separador()

    # Tabla de meses
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(NEGRO)
    c.drawString(MARGEN, L.y, "MES")
    c.drawString(MARGEN + 26 * mm, L.y, "PLAN")
    c.drawRightString(MARGEN + 56 * mm, L.y, "PRECIO")
    c.drawRightString(ANCHO - MARGEN, L.y, "TOTAL")
    L.saltar(3.6)
    L.separador(2.6)

    for ln in d.lineas:
        c.setFont("Helvetica", 7)
        c.setFillColor(NEGRO)
        c.drawString(MARGEN, L.y, etiqueta_mes(ln.mes))
        c.setFont("Helvetica", 6.5)
        c.drawString(MARGEN + 26 * mm, L.y, (ln.plan or "")[:14])
        c.setFont("Helvetica", 7)
        c.drawRightString(MARGEN + 56 * mm, L.y, f"{ln.precio:.2f}")
        c.drawRightString(ANCHO - MARGEN, L.y, f"{ln.total:.2f}")
        L.saltar(4.4)

    L.separador()

    # Totales
    L.par("MENSUALIDAD:", f"S/ {d.mensualidad:.2f}")
    L.par("IMP. OTROS:", f"S/ {d.otros:.2f}")
    L.par("IMP. TOTAL:", f"S/ {d.imp_total:.2f}")
    L.par("DESCUENTO:", f"S/ {d.descuento:.2f}")
    L.saltar(0.6)
    L.par("IMPORTE PAGADO:", f"S/ {d.pagado:.2f}", tam=8.5)
    L.saltar(1.5)
    L.separador()

    L.envuelto(f"IMPORTE Pagado: {importe_en_letras(d.pagado)}", tam=7)
    L.separador()
    L.izq(f"OBSERVACIONES: {d.observaciones or ''}", tam=7)
    L.separador(5)

    # Pie
    L.centrado("¡Paga puntual tu recibo, evita el corte del servicio!", tam=6.5,
               color=GRIS, salto=5)
    L.centrado("*GRACIAS POR SU PREFERENCIA*", tam=7, negrita=True, salto=4)
    L.centrado("Comprobante sin Derecho a Credito Fiscal", tam=6, color=GRIS)
    L.centrado(f"Telefono De Soporte: {settings.EMPRESA_TELEFONOS}", tam=6, color=GRIS)

    consumido = alto - L.y + MARGEN
    c.showPage()
    c.save()
    return consumido
