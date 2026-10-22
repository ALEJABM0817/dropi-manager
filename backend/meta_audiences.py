# -*- coding: utf-8 -*-
"""
Dropi -> Meta Ads Custom Audiences, built directly from the orders already
loaded in this app's database (no re-upload needed).

Ported from C:\\Users\\RentAdvisor\\dropi-meta-audiences\\core.py. Business
rules (modo_valor="entrega", piso_bajo_valor=25000, valor_base="ganancia",
etc.) are documented there and in memory — do not change without asking.
"""
from __future__ import annotations

import csv
import json
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

CONFIG_DEFAULT = {
    "pais_iso": "co",
    "indicativo": "57",
    "moneda": "COP",
    "valor_base": "ganancia",
    "referencia_fecha": "hoy",
    "dias_en_riesgo": 90,
    "dias_desinteresado": 180,
    "percentil_alto": 75,
    "percentil_bajo": 25,
    "min_clientes_percentil": 20,
    "factor_alto": 1.25,
    "factor_bajo": 0.75,
    "restar_devoluciones": True,
    "modo_valor": "entrega",
    "piso_bajo_valor": 25000,
    "apellido": "dos",
    "minimo_meta": 100,
    "prefijo": "DP",
}


def sin_tildes(txt) -> str:
    if txt is None:
        return ""
    return "".join(c for c in unicodedata.normalize("NFD", str(txt))
                   if unicodedata.category(c) != "Mn")


def clave(txt) -> str:
    t = sin_tildes(txt).upper().replace("_", " ").replace(".", " ")
    t = re.sub(r"[^A-Z0-9 ]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def es_vacio(v) -> bool:
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() in ("nan", "none", "nat", "null", "-")


# --------------------------------------------------------------------------
# CLASIFICACION DE ESTATUS DE DROPI  ->  "senal" de comportamiento
# --------------------------------------------------------------------------
SENALES = {
    "entregado": ["ENTREGADO", "ENTREGADA", "ENTREGADO CON NOVEDAD",
                  "FINALIZADO", "ENTREGA EXITOSA", "COMPLETADO"],
    "devolucion": ["DEVOLUCION", "DEVOLUCIONES", "DEVUELTO",
                   "DEVOLUCION EN BODEGA", "EN PROCESO DE DEVOLUCION",
                   "DEVOLUCION EN TRANSITO", "DEVOLUCION ENTREGADA", "RETORNADO"],
    "rechazado": ["RECHAZADO", "RECHAZADA", "NO ACEPTADO"],
    "cancelado": ["CANCELADO", "CANCELADA", "ANULADO", "ANULADA"],
    "novedad": ["NOVEDAD", "NOVEDAD SOLUCIONADA", "INTENTO DE ENTREGA",
                "RECLAME EN OFICINA", "EN GESTION DE NOVEDAD"],
    "transito": ["DESPACHADA", "DESPACHADO", "EN REPARTO", "EN TRANSITO",
                 "EN BODEGA DESTINO", "EN BODEGA TRANSPORTADORA", "EN BODEGA",
                 "GUIA GENERADA", "PREPARANDO", "PREPARANDO PEDIDO",
                 "CONFIRMADO", "CONFIRMADA", "EN RUTA", "ADMITIDO", "RECOGIDO"],
    "pendiente": ["PENDIENTE CONFIRMACION", "POR CONFIRMAR", "PENDIENTE",
                  "SIN CONFIRMAR", "NUEVO", "EN ESPERA"],
    "perdido": ["EN PROCESO DE INDEMNIZACION", "INDEMNIZADO", "INDEMNIZACION",
                "PERDIDO", "EXTRAVIADO", "SINIESTRO"],
}
MAPA_SENAL = {clave(v): sen for sen, vals in SENALES.items() for v in vals}


def senal_estatus(estatus) -> str:
    k = clave(estatus)
    if not k:
        return "desconocido"
    if k in MAPA_SENAL:
        return MAPA_SENAL[k]
    for texto, sen in MAPA_SENAL.items():
        if texto in k:
            return sen
    if "DEVOLU" in k:
        return "devolucion"
    if "ENTREGA" in k:
        return "entregado"
    if "CANCEL" in k:
        return "cancelado"
    return "desconocido"


NOVEDAD_RECHAZO = ["REHUSA", "SE NIEGA", "NIEGA A RECIBIR", "NO QUIERE",
                   "RECHAZA", "PEDIDO CANCELADO", "NO SOLICITO", "ARREPENT",
                   "DESISTE", "NO DESEA", "CANCELA EL PEDIDO", "NO RECONOCE"]
NOVEDAD_DIRECCION = ["DIRECCION", "NO EXISTE", "INCOMPLETA", "ERRADA",
                     "ZONA DE ALTO RIESGO", "FUERA DE COBERTURA",
                     "NO CONOCEN DESTINATARIO", "SIN COBERTURA", "MUNICIPIO NO",
                     "DATOS ERRADOS", "TELEFONO ERRADO"]
NOVEDAD_RECUPERABLE = ["COORDINAR", "NO CONTESTA", "NO HAY QUIEN RECIBA",
                       "REPROGRAMAR", "AUSENTE", "NO SE ENCONTRABA", "CERRADO",
                       "VIAJE", "REPROGRAMADO", "SOLICITA", "HORARIO", "REAGENDA"]


def motivo_novedad(texto) -> str:
    k = clave(texto)
    if not k:
        return "sin_motivo"
    for p in NOVEDAD_RECHAZO:
        if p in k:
            return "rechazo"
    for p in NOVEDAD_DIRECCION:
        if p in k:
            return "direccion"
    for p in NOVEDAD_RECUPERABLE:
        if p in k:
            return "recuperable"
    return "otro"


# --------------------------------------------------------------------------
# NORMALIZACION DE DATOS PARA META
# --------------------------------------------------------------------------
RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s.]+\.[a-zA-Z]{2,}$")


def normalizar_telefono(valor, indicativo="57"):
    if es_vacio(valor):
        return None
    s = str(valor).strip()
    if s.endswith(".0"):
        s = s[:-2]
    d = re.sub(r"\D", "", s).lstrip("0")
    if not d:
        return None
    if d.startswith(indicativo) and len(d) == len(indicativo) + 10:
        return d
    if len(d) == 10:
        return indicativo + d
    if 11 <= len(d) <= 15:
        return d
    return None


def normalizar_email(valor):
    if es_vacio(valor):
        return None
    s = str(valor).strip().lower()
    return s if RE_EMAIL.match(s) else None


def limpiar_nombre(txt):
    if es_vacio(txt):
        return ""
    t = str(txt).lower()
    t = re.sub(r"[0-9]", " ", t)
    t = re.sub(r"[^\wà-ÿ ]", " ", t, flags=re.UNICODE)
    return re.sub(r"\s+", " ", t).strip()


BASURA_NOMBRE = {"sr", "sra", "srta", "don", "dona", "na", "cliente", "senor",
                 "senora", "de", "del", "la", "los", "las"}


def partir_nombre(txt, modo="dos"):
    limpio = limpiar_nombre(txt)
    toks = [t for t in limpio.split() if len(t) > 1 and t not in BASURA_NOMBRE]
    if not toks:
        return "", ""
    if len(toks) == 1:
        return toks[0], ""
    nombre, resto = toks[0], toks[1:]
    if modo == "todo" or len(resto) == 1:
        apellido = " ".join(resto)
    elif modo == "ultimo":
        apellido = resto[-1]
    else:
        apellido = " ".join(resto[-2:])
    return nombre, apellido


def limpiar_lugar(txt):
    if es_vacio(txt):
        return ""
    t = re.sub(r"\([^)]*\)", " ", str(txt))
    return re.sub(r"[^a-z0-9]", "", sin_tildes(t).lower())


def leer_numero(valor):
    if es_vacio(valor):
        return 0.0
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        f = float(valor)
        return 0.0 if f != f else f
    s = re.sub(r"[^\d,.\-]", "", str(valor))
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = (s.replace(".", "").replace(",", ".")
             if s.rfind(",") > s.rfind(".") else s.replace(",", ""))
    elif "," in s:
        s = s.replace(",", ".") if len(s.split(",")[-1]) <= 2 else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


FORMATOS_FECHA = ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d",
                  "%d-%m-%y", "%d/%m/%y", "%m/%d/%Y"]


def leer_fecha(valor):
    if es_vacio(valor):
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    s = str(valor).strip()[:19].split(" ")[0]
    for f in FORMATOS_FECHA:
        try:
            return datetime.strptime(s, f).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        return None


# --------------------------------------------------------------------------
# CATALOGO DE SEGMENTOS  (cada uno = 1 archivo CSV = 1 publico en Meta)
# --------------------------------------------------------------------------
SEGMENTOS = {
    "clientes_recurrentes": {
        "orden": 1, "titulo": "Clientes recurrentes (2+ entregas)",
        "grupo": "Clientes", "etiqueta": "Alto valor", "valor": True,
        "regla": "2 o mas pedidos ENTREGADOS",
        "uso": "Semilla #1 para Lookalike de valor. Campanas de recompra y bundles.",
    },
    "clientes_alto_valor": {
        "orden": 2, "titulo": "Clientes de alto valor",
        "grupo": "Clientes", "etiqueta": "Alto valor", "valor": True,
        "regla": "1 entrega con valor neto sobre el percentil 75 Y sobre la mediana del negocio",
        "uso": "Semilla para Lookalike 1% basado en valor. Ofertas premium.",
    },
    "clientes_generales": {
        "orden": 3, "titulo": "Clientes generales",
        "grupo": "Clientes", "etiqueta": "Clientes generales", "valor": True,
        "regla": "1 entrega, valor promedio, compra reciente",
        "uso": "Base de retencion. Excluir en campanas de captacion.",
    },
    "clientes_bajo_valor": {
        "orden": 4, "titulo": "Clientes de bajo valor",
        "grupo": "Clientes", "etiqueta": "Bajo valor", "valor": True,
        "regla": "Entrega con valor <= percentil bajo, o con devolucion en su historial",
        "uso": "Siguen siendo clientes: no los excluyas. Solo evitalos como semilla de Lookalike.",
    },
    "clientes_en_riesgo": {
        "orden": 5, "titulo": "Clientes en riesgo",
        "grupo": "Clientes", "etiqueta": "En riesgo", "valor": True,
        "regla": "Compro y recibio, pero lleva mas de N dias sin comprar",
        "uso": "Campana de reactivacion con descuento medio.",
    },
    "clientes_desinteresados": {
        "orden": 6, "titulo": "Clientes desinteresados / dormidos",
        "grupo": "Clientes", "etiqueta": "Desinteresados", "valor": True,
        "regla": "Ultima entrega hace mas de N dias",
        "uso": "Campana de win-back agresiva, o excluir para no gastar.",
    },
    "leads_calificados": {
        "orden": 7,
        "titulo": "Interesados calificados (pedido vivo o novedad recuperable)",
        "grupo": "Publicos activos", "etiqueta": "Clientes potenciales calificados",
        "valor": False,
        "regla": "Pedido en transito, pendiente de confirmar, o novedad tipo 'no estaba en casa'",
        "uso": "Remarketing de cierre. Tambien sirve de semilla de Lookalike de intencion.",
    },
    "otros_interesados": {
        "orden": 8, "titulo": "Interesados en frio (cancelados sin confirmar)",
        "grupo": "Publicos activos", "etiqueta": "Otros usuarios interesados",
        "valor": False,
        "regla": "Pedido CANCELADO: dejo los datos pero nunca confirmo",
        "uso": "Reimpacto con prueba social y garantia. Volumen alto, intencion tibia.",
    },
    "leads_descalificados": {
        "orden": 9, "titulo": "Descalificados (devolucion / rechazo)",
        "grupo": "Publicos activos", "etiqueta": "Clientes potenciales descalificados",
        "valor": False,
        "regla": "Devolucion, rechazo o negacion a recibir el paquete",
        "uso": "EXCLUIR en todas las campanas: cada uno te cuesta el flete ida y vuelta.",
    },
    "otros_1_direccion": {
        "orden": 10, "titulo": "Devolucion por datos/direccion (recuperables)",
        "grupo": "Otros publicos", "etiqueta": "Otros 1", "valor": False,
        "regla": "Devolucion por direccion inexistente, incompleta o zona sin cobertura",
        "uso": "No son malos clientes, fallo la logistica. Reintentar pidiendo mejor direccion.",
    },
    "otros_2_indemnizacion": {
        "orden": 11, "titulo": "Paquete perdido / indemnizacion",
        "grupo": "Otros publicos", "etiqueta": "Otros 2", "valor": False,
        "regla": "Pedido perdido o en indemnizacion (culpa de la transportadora)",
        "uso": "Quiso comprar y nunca recibio. Ofrecer reposicion.",
    },
    "otros_3_sin_clasificar": {
        "orden": 12, "titulo": "Sin clasificar",
        "grupo": "Otros publicos", "etiqueta": "Otros 3", "valor": False,
        "regla": "Estatus no reconocido por el algoritmo",
        "uso": "Revisar a mano. Si aparecen muchos, hay que mapear ese estatus.",
    },
}

CORTOS = {
    "maestro": "00C Maestro todos",
    "semilla": "00A Semilla valor",
    "exclusion": "00B Exclusion no pautar",
    "clientes_recurrentes": "01 Clientes recurrentes",
    "clientes_alto_valor": "02 Clientes alto valor",
    "clientes_generales": "03 Clientes generales",
    "clientes_bajo_valor": "04 Clientes bajo valor",
    "clientes_en_riesgo": "05 Clientes en riesgo",
    "clientes_desinteresados": "06 Clientes dormidos",
    "leads_calificados": "07 Interesados calificados",
    "otros_interesados": "08 Interesados en frio",
    "leads_descalificados": "09 Descalificados",
    "otros_1_direccion": "10 Devolucion por direccion",
    "otros_2_indemnizacion": "11 Paquete perdido",
    "otros_3_sin_clasificar": "12 Sin clasificar",
}

MAX_NOMBRE = 50
MAX_DESCRIPCION = 100

DESC_CORTAS = {
    "maestro": "Todos los contactos del archivo. Exclusion global.",
    "semilla": "Todos los que recibieron su pedido, con su utilidad. Semilla del Lookalike.",
    "exclusion": "Devolvieron o rechazaron y nunca te compraron. Excluir.",
    "clientes_recurrentes": "2 o mas pedidos entregados.",
    "clientes_alto_valor": "1 entrega con valor neto muy por encima de la mediana del negocio.",
    "clientes_generales": "1 entrega, valor promedio, compra reciente.",
    "clientes_bajo_valor": "Valor neto bajo tras restar sus devoluciones.",
    "clientes_en_riesgo": "Compro y recibio, lleva mas de {dias_en_riesgo} dias sin comprar.",
    "clientes_desinteresados": "Ultima entrega hace mas de {dias_desinteresado} dias.",
    "leads_calificados": "Pedido en transito, por confirmar o novedad recuperable.",
    "otros_interesados": "Pedido cancelado: dejo datos pero nunca confirmo.",
    "leads_descalificados": "Devolucion o rechazo del paquete. Excluir.",
    "otros_1_direccion": "Devolucion por direccion mala o zona sin cobertura.",
    "otros_2_indemnizacion": "Paquete perdido por la transportadora.",
    "otros_3_sin_clasificar": "Estatus no reconocido. Revisar a mano.",
}


def nombre_publico(segmento, cfg):
    n = "%s-%s" % (cfg["prefijo"], CORTOS.get(segmento, segmento))
    return n if len(n) <= MAX_NOMBRE else n[:MAX_NOMBRE]


def descripcion_publico(segmento, cfg, corte):
    textos = dict(DESC_CORTAS)
    if cfg.get("modo_valor") == "entrega":
        textos["clientes_alto_valor"] = "Recibio y pago su pedido."
        textos["clientes_bajo_valor"] = ("Utilidad neta de %s %s o menos."
            % ("{:,.0f}".format(cfg.get("piso_bajo_valor", 0)).replace(",", "."),
               cfg.get("moneda", "")))
    base = textos.get(segmento, "").format(**cfg)
    fecha = " Corte %s." % corte
    if len(base) + len(fecha) > MAX_DESCRIPCION:
        base = base[:MAX_DESCRIPCION - len(fecha) - 1].rstrip(" .,") + "."
    return (base + fecha).strip()


# --------------------------------------------------------------------------
# AGREGACION POR CLIENTE
# --------------------------------------------------------------------------
def construir_clientes(filas, cfg):
    """filas: list of dicts already using canonical field names (telefono,
    email, nombre, ciudad, departamento, direccion, estatus, novedad, fecha,
    venta, ganancia, costo_devolucion)."""
    clientes = {}
    descartes = Counter()
    estatus_vistos = Counter()

    for f in filas:
        tel = normalizar_telefono(f.get("telefono"), cfg["indicativo"])
        mail = normalizar_email(f.get("email"))
        if not tel and not mail:
            descartes["sin_contacto_valido"] += 1
            continue
        llave = tel or mail

        est_raw = f.get("estatus")
        estatus_vistos["(vacio)" if es_vacio(est_raw) else str(est_raw).strip()] += 1
        sen = senal_estatus(est_raw)
        mot = motivo_novedad(f.get("novedad"))
        fecha = leer_fecha(f.get("fecha"))
        venta = leer_numero(f.get("venta"))
        gan = leer_numero(f.get("ganancia"))
        cdev = leer_numero(f.get("costo_devolucion"))

        c = clientes.get(llave)
        if c is None:
            c = clientes[llave] = {
                "telefono": tel, "email": mail, "nombre": "", "ciudad": "",
                "departamento": "", "direccion": "", "pedidos": 0,
                "senales": Counter(), "motivos": Counter(),
                "venta_entregada": 0.0, "ganancia_entregada": 0.0,
                "costo_devoluciones": 0.0,
                "venta_intentada": 0.0, "ultima_fecha": None,
                "primera_fecha": None, "estatus_raw": Counter(),
                "_fecha_datos": None,
            }
        if tel and not c["telefono"]:
            c["telefono"] = tel
        if mail and not c["email"]:
            c["email"] = mail

        c["pedidos"] += 1
        c["senales"][sen] += 1
        c["estatus_raw"]["(vacio)" if es_vacio(est_raw) else str(est_raw).strip()] += 1
        if sen in ("devolucion", "novedad", "rechazado"):
            c["motivos"][mot] += 1
        c["venta_intentada"] += venta
        if sen == "entregado":
            c["venta_entregada"] += venta
            c["ganancia_entregada"] += gan
        elif sen in ("devolucion", "rechazado"):
            c["costo_devoluciones"] += cdev
        if fecha:
            if c["ultima_fecha"] is None or fecha > c["ultima_fecha"]:
                c["ultima_fecha"] = fecha
            if c["primera_fecha"] is None or fecha < c["primera_fecha"]:
                c["primera_fecha"] = fecha
        mas_nuevo = (c["_fecha_datos"] is None or
                     (fecha is not None and fecha >= c["_fecha_datos"]))
        for campo in ("nombre", "ciudad", "departamento", "direccion"):
            v = f.get(campo)
            if not es_vacio(v) and (mas_nuevo or not c[campo]):
                c[campo] = str(v).strip()
        if fecha is not None:
            c["_fecha_datos"] = fecha

    return clientes, descartes, estatus_vistos


# --------------------------------------------------------------------------
# ALGORITMO DE SEGMENTACION
# --------------------------------------------------------------------------
def valor_cliente(c, cfg):
    if cfg["valor_base"] == "venta":
        v = c["venta_entregada"]
    else:
        v = c["ganancia_entregada"] or c["venta_entregada"]
    if cfg.get("restar_devoluciones", True):
        v -= c.get("costo_devoluciones", 0.0)
    return round(v, 2)


def segmentar(clientes, cfg, hoy=None):
    hoy = hoy or date.today()
    if cfg["referencia_fecha"] == "archivo":
        fechas = [c["ultima_fecha"] for c in clientes.values() if c["ultima_fecha"]]
        if fechas:
            hoy = max(fechas)

    valores = [v for v in (valor_cliente(c, cfg) for c in clientes.values()
                           if c["senales"]["entregado"] > 0) if v > 0]
    p_alto = p_bajo = mediana = None
    if valores:
        mediana = statistics.median(valores)
    if len(valores) >= cfg["min_clientes_percentil"]:
        vs = sorted(valores)

        def pct(p):
            i = int(round((p / 100.0) * (len(vs) - 1)))
            return vs[max(0, min(len(vs) - 1, i))]

        p_alto, p_bajo = pct(cfg["percentil_alto"]), pct(cfg["percentil_bajo"])
        p_alto = max(p_alto, mediana * cfg["factor_alto"])
        p_bajo = min(p_bajo, mediana * cfg["factor_bajo"])
    elif valores:
        p_alto = round(mediana * cfg["factor_alto"], 2)
        p_bajo = round(mediana * cfg["factor_bajo"], 2)
    if p_alto is not None:
        p_alto, p_bajo = round(p_alto, 2), round(p_bajo, 2)

    piso = max(0.0, float(cfg.get("piso_bajo_valor") or 0))
    for c in clientes.values():
        s = c["senales"]
        v = valor_cliente(c, cfg)
        c["valor"] = v
        c["dias"] = (hoy - c["ultima_fecha"]).days if c["ultima_fecha"] else None
        dias = c["dias"]

        if s["entregado"] > 0:
            if dias is not None and dias > cfg["dias_desinteresado"]:
                seg = "clientes_desinteresados"
            elif dias is not None and dias > cfg["dias_en_riesgo"]:
                seg = "clientes_en_riesgo"
            elif s["entregado"] >= 2:
                seg = "clientes_recurrentes"
            elif v <= piso:
                seg = "clientes_bajo_valor"
            elif cfg["modo_valor"] == "entrega":
                seg = "clientes_alto_valor"
            elif p_alto is not None and v >= p_alto:
                seg = "clientes_alto_valor"
            elif p_bajo is not None and v <= p_bajo:
                seg = "clientes_bajo_valor"
            else:
                seg = "clientes_generales"
        elif s["devolucion"] > 0 or s["rechazado"] > 0:
            m = c["motivos"]
            if m["rechazo"] > 0 or s["rechazado"] > 0:
                seg = "leads_descalificados"
            elif m["direccion"] > 0:
                seg = "otros_1_direccion"
            else:
                seg = "leads_descalificados"
        elif s["novedad"] > 0 or s["transito"] > 0 or s["pendiente"] > 0:
            seg = "leads_calificados"
        elif s["cancelado"] > 0:
            seg = "otros_interesados"
        elif s["perdido"] > 0:
            seg = "otros_2_indemnizacion"
        else:
            seg = "otros_3_sin_clasificar"

        c["segmento"] = seg

    return {"percentil_alto_valor": p_alto, "percentil_bajo_valor": p_bajo,
            "fecha_referencia": hoy.isoformat(), "clientes_con_valor": len(valores)}


# --------------------------------------------------------------------------
# ESCRITURA DE ARCHIVOS PARA META
# --------------------------------------------------------------------------
def fila_meta(c, cfg, con_valor):
    fn, ln = partir_nombre(c["nombre"], cfg["apellido"])
    fila = {
        "email": c["email"] or "",
        "phone": c["telefono"] or "",
        "fn": fn,
        "ln": ln,
        "ct": limpiar_lugar(c["ciudad"]),
        "st": limpiar_lugar(c["departamento"]),
        "country": cfg["pais_iso"],
    }
    if con_valor:
        v = float(c["valor"])
        fila["value"] = str(int(v)) if v.is_integer() else f"{v:.2f}"
    return fila


def escribir_csv(ruta, filas, con_valor, con_email):
    cols = (["email"] if con_email else []) + \
           ["phone", "fn", "ln", "ct", "st", "country"] + \
           (["value"] if con_valor else [])
    with open(ruta, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)
    return len(filas)


def _ficha(archivo, segmento, titulo, grupo, etiqueta, valor, personas,
           regla, uso, vals=None, minimo=100, acumulado=False):
    vals = vals or []
    return {
        "archivo": archivo, "segmento": segmento, "titulo": titulo,
        "grupo_meta": grupo, "etiqueta_meta": etiqueta,
        "basado_en_valor": valor, "personas": personas, "acumulado": acumulado,
        "valor_total": round(sum(vals), 2),
        "valor_promedio": round(sum(vals) / len(vals), 2) if vals else 0,
        "regla": regla, "uso": uso,
        "aviso": ("Menos de %d personas: Meta puede no encontrar suficientes "
                  "coincidencias." % minimo) if personas < minimo else "",
    }


def procesar_desde_filas(filas, carpeta_salida, cfg=None, origen="Dropi Manager"):
    """Same pipeline as the standalone tool's procesar(), but `filas` is
    already a list of dicts with canonical field names (built from the
    orders table), so no file reading / column detection is needed."""
    cfg = {**CONFIG_DEFAULT, **(cfg or {})}
    carpeta_salida = Path(carpeta_salida)
    carpeta_salida.mkdir(parents=True, exist_ok=True)

    clientes, descartes, estatus_vistos = construir_clientes(filas, cfg)
    if not clientes:
        raise ValueError("No se pudo extraer ningun contacto valido de los pedidos seleccionados.")
    meta_calc = segmentar(clientes, cfg)

    grupos = defaultdict(list)
    for c in clientes.values():
        grupos[c["segmento"]].append(c)

    hay_email = any(c["email"] for c in clientes.values())
    minimo = cfg["minimo_meta"]
    archivos = []

    segmentos = {k: dict(v) for k, v in SEGMENTOS.items()}
    if cfg["modo_valor"] == "entrega":
        segmentos["clientes_alto_valor"].update(
            titulo="Clientes de alto valor (recibieron su pedido)",
            regla="Recibio y pago su pedido. En contra entrega, completar la "
                  "entrega ya es la senal de valor",
            uso="Semilla del Lookalike 1% y base de recompra. Es tu activo real.")
        segmentos["clientes_bajo_valor"].update(
            regla="Utilidad neta de %s %s o menos: compro algo muy barato o sus "
                  "devoluciones se comieron la ganancia"
                  % ("{:,.0f}".format(cfg["piso_bajo_valor"]).replace(",", "."),
                     cfg["moneda"]),
            uso="Siguen siendo clientes: no los excluyas. Solo evitalos como "
                "semilla de Lookalike.")

    for seg, info in sorted(segmentos.items(), key=lambda kv: kv[1]["orden"]):
        lista = grupos.get(seg, [])
        if not lista:
            continue
        lista.sort(key=lambda c: (-c["valor"], c["telefono"] or ""))
        nombre = "%02d_%s.csv" % (info["orden"], seg)
        escribir_csv(carpeta_salida / nombre,
                     [fila_meta(c, cfg, info["valor"]) for c in lista],
                     info["valor"], hay_email)
        archivos.append(_ficha(nombre, seg, info["titulo"], info["grupo"],
                               info["etiqueta"], info["valor"], len(lista),
                               info["regla"], info["uso"],
                               [c["valor"] for c in lista if c["valor"] > 0], minimo))

    todos = sorted(clientes.values(), key=lambda c: -c["valor"])
    escribir_csv(carpeta_salida / "00_maestro_todos.csv",
                 [fila_meta(c, cfg, False) for c in todos], False, hay_email)
    archivos.insert(0, _ficha(
        "00_maestro_todos.csv", "maestro", "Maestro: todos los contactos",
        "Otros publicos", "Otros 3", False, len(todos),
        "Todos los contactos unicos y validos de los pedidos seleccionados",
        "Publico de exclusion global en campanas de captacion.", None, minimo,
        acumulado=True))

    semilla = sorted((c for c in clientes.values()
                      if c["senales"]["entregado"] > 0 and c["valor"] > 0),
                     key=lambda c: -c["valor"])
    if semilla:
        escribir_csv(carpeta_salida / "00_semilla_lookalike_valor.csv",
                     [fila_meta(c, cfg, True) for c in semilla], True, hay_email)
        archivos.insert(1, _ficha(
            "00_semilla_lookalike_valor.csv", "semilla",
            "SEMILLA para Lookalike basado en valor", "Clientes",
            "Clientes generales", True, len(semilla),
            "Todos los que recibieron el pedido, con su valor real (%s)"
            % ("utilidad" if cfg["valor_base"] == "ganancia" else "venta"),
            "El archivo mas importante: crea aqui el Publico Similar (Lookalike) "
            "1% basado en valor. Es la suma de los archivos 01 a 06.",
            [c["valor"] for c in semilla], minimo, acumulado=True))

    excluir = [c for c in clientes.values()
               if c["segmento"] == "leads_descalificados"]
    if excluir:
        escribir_csv(carpeta_salida / "00_exclusion_no_pautar.csv",
                     [fila_meta(c, cfg, False) for c in excluir], False, hay_email)
        archivos.insert(2, _ficha(
            "00_exclusion_no_pautar.csv", "exclusion",
            "Lista negra: no volver a pautarles", "Publicos activos",
            "Clientes potenciales descalificados", False, len(excluir),
            "Devolvieron o rechazaron el paquete y nunca te compraron",
            "Cargalo como EXCLUSION en tus conjuntos de anuncios. Mismo "
            "contenido que el archivo 09.", None, minimo, acumulado=True))

    corte = meta_calc["fecha_referencia"]
    for a in archivos:
        a["nombre_publico"] = nombre_publico(a["segmento"], cfg)
        a["descripcion_publico"] = descripcion_publico(a["segmento"], cfg, corte)
        a["largo_nombre"] = len(a["nombre_publico"])
        a["largo_descripcion"] = len(a["descripcion_publico"])

    with open(carpeta_salida / "_nombres_para_meta.csv", "w", newline="",
              encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["archivo", "nombre del publico (max %d)" % MAX_NOMBRE,
                    "caracteres", "descripcion (max %d)" % MAX_DESCRIPCION,
                    "caracteres", "etiqueta a elegir", "basado en valor"])
        for a in archivos:
            w.writerow([a["archivo"], a["nombre_publico"], a["largo_nombre"],
                        a["descripcion_publico"], a["largo_descripcion"],
                        "%s > %s" % (a["grupo_meta"], a["etiqueta_meta"]),
                        "SI" if a["basado_en_valor"] else "NO"])

    with open(carpeta_salida / "_diagnostico_clientes.csv", "w", newline="",
              encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["telefono", "nombre", "ciudad", "departamento", "segmento",
                    "etiqueta_meta", "pedidos", "entregados", "devoluciones",
                    "cancelados", "novedades", "valor", "dias_desde_ultimo",
                    "ultima_fecha", "estatus_originales"])
        for c in sorted(clientes.values(), key=lambda x: (x["segmento"], -x["valor"])):
            s = c["senales"]
            w.writerow([
                c["telefono"] or "", c["nombre"], c["ciudad"], c["departamento"],
                c["segmento"], SEGMENTOS.get(c["segmento"], {}).get("etiqueta", ""),
                c["pedidos"], s["entregado"], s["devolucion"], s["cancelado"],
                s["novedad"], c["valor"],
                "" if c["dias"] is None else c["dias"],
                c["ultima_fecha"].isoformat() if c["ultima_fecha"] else "",
                " | ".join("%sx%d" % (k, v) for k, v in c["estatus_raw"].items()),
            ])

    with open(carpeta_salida / "_resumen.csv", "w", newline="",
              encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["archivo", "nombre del publico", "tipo", "publico",
                    "grupo etiqueta Meta", "etiqueta Meta", "personas",
                    "basado en valor", "valor total", "valor promedio",
                    "para que sirve"])
        for a in archivos:
            w.writerow([a["archivo"], a["nombre_publico"],
                        "acumulado" if a.get("acumulado") else "segmento",
                        a["titulo"], a["grupo_meta"], a["etiqueta_meta"],
                        a["personas"], "SI" if a["basado_en_valor"] else "NO",
                        a["valor_total"], a["valor_promedio"], a["uso"]])

    resultado = {
        "origen": origen,
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "filas_leidas": len(filas),
        "contactos_unicos": len(clientes),
        "descartados": dict(descartes),
        "estatus_encontrados": estatus_vistos.most_common(),
        "config": cfg,
        "calculo": meta_calc,
        "archivos": archivos,
        "carpeta": str(carpeta_salida),
        "tiene_email": hay_email,
    }
    (carpeta_salida / "_manifiesto.json").write_text(
        json.dumps(resultado, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8")
    (carpeta_salida / "LEEME_como_subir_a_meta.md").write_text(
        texto_instrucciones(resultado), encoding="utf-8")
    return resultado


def texto_instrucciones(r):
    cfg = r["config"]
    L = []
    a = L.append
    a("# Cómo subir estos públicos a Meta Ads\n")
    a("Origen: **%s** · %d pedidos → **%d contactos únicos** · generado %s\n"
      % (r["origen"], r["filas_leidas"], r["contactos_unicos"], r["generado"]))
    a("## Pasos en Meta\n")
    a("1. Ads Manager → **Públicos** → Crear público → **Público personalizado** → "
      "**Lista de clientes**.")
    a("2. Sube el CSV. Meta reconoce solo las columnas (`phone`, `fn`, `ln`, `ct`, "
      "`st`, `country`, `value`).")
    a("3. Si el archivo trae columna `value`, marca **\"El archivo incluye el valor "
      "del cliente\"** y elige la moneda **%s**." % cfg["moneda"])
    a("4. En **Etiqueta de público** elige el grupo y la opción exacta de la tabla.")
    a("5. Nombra el público igual que el archivo para no perderte.\n")
    a("> Los teléfonos salen con indicativo **+%s** y las ciudades sin espacios ni "
      "tildes, que es como Meta los normaliza antes de hashear.\n" % cfg["indicativo"])
    a("## Dos tipos de archivo\n")
    a("- Los **`00_`** son **acumulados**: juntan gente que también aparece en los "
      "archivos de detalle. Están hechos para usarse tal cual (sembrar el "
      "Lookalike, excluir, tener la base completa).")
    a("- Los **`01_` a `12_`** son **segmentos excluyentes**: cada persona está en "
      "uno solo. Sirven para hablarle distinto a cada grupo.\n")
    a("Por eso es normal que dos archivos lleven la misma etiqueta de Meta y que "
      "los números no sumen el total: `00_semilla_lookalike_valor` es la suma de "
      "`01`+`02`+`03`+`04`+`05`+`06`, y `00_exclusion_no_pautar` es `04`+`09`.\n")
    a("## Qué etiqueta lleva cada archivo\n")
    a("| Archivo | Tipo | Personas | Grupo de etiqueta | Etiqueta exacta | ¿Valor? | Para qué sirve |")
    a("|---|---|---:|---|---|---|---|")
    for x in r["archivos"]:
        a("| `%s` | %s | %d | %s | **%s** | %s | %s |"
          % (x["archivo"], "acumulado" if x.get("acumulado") else "segmento",
             x["personas"], x["grupo_meta"], x["etiqueta_meta"],
             "Sí" if x["basado_en_valor"] else "No", x["uso"]))
    a("\n## Cómo nombrar cada público (copia y pega)\n")
    a("La regla: **el número del archivo es el número del público**. `03_...csv` "
      "siempre es `%s-03`. Así nunca dudas cuál subiste.\n" % cfg["prefijo"])
    a("Meta limita el nombre a **%d caracteres** y la descripción a **%d**. Todo "
      "lo de abajo ya cabe.\n" % (MAX_NOMBRE, MAX_DESCRIPCION))
    a("Cuando vuelvas a generar el mes que viene, **no crees públicos nuevos**: "
      "entra al mismo público y reemplaza la lista. Si creas uno nuevo, tu "
      "Lookalike se queda apuntando al viejo.\n")
    a("| Nombre del público | Descripción |")
    a("|---|---|")
    for x in r["archivos"]:
        a("| `%s` <br><sub>%d/%d</sub> | `%s` <br><sub>%d/%d</sub> |"
          % (x["nombre_publico"], x["largo_nombre"], MAX_NOMBRE,
             x["descripcion_publico"], x["largo_descripcion"], MAX_DESCRIPCION))
    a("\n## Cómo decidió el algoritmo\n")
    for _, s in sorted(SEGMENTOS.items(), key=lambda kv: kv[1]["orden"]):
        a("- **%s** → %s › _%s_ · regla: %s"
          % (s["titulo"], s["grupo"], s["etiqueta"], s["regla"]))
    c = r["calculo"]
    a("\nUmbrales calculados con tus propios datos: alto valor ≥ %s, bajo valor ≤ %s "
      "(%s, base: %s). Recencia medida contra %s."
      % (c["percentil_alto_valor"], c["percentil_bajo_valor"], cfg["moneda"],
         "utilidad" if cfg["valor_base"] == "ganancia" else "venta",
         c["fecha_referencia"]))
    avisos = [x for x in r["archivos"] if x["aviso"]]
    if avisos:
        a("\n## Avisos\n")
        for x in avisos:
            a("- `%s`: %s" % (x["archivo"], x["aviso"]))
    if r["descartados"]:
        a("\nContactos descartados: %s" % r["descartados"])
    a("\n## Estatus encontrados en tus pedidos\n")
    for est, n in r["estatus_encontrados"]:
        a("- %s: %d → señal `%s`" % (est, n, senal_estatus(est)))
    return "\n".join(L)
