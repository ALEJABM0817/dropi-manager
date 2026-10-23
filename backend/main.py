import sqlite3
import io
import os
import csv
import re
import zipfile
import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import openpyxl
import unicodedata
import meta_audiences as ma

# Statuses that are NEVER counted or stored
EXCLUDED_STATUSES = {'CANCELADO', 'RECHAZADO', 'PENDIENTE CONFIRMACION'}

# Statuses that indicate a shipment is being returned (not yet confirmed devolution)
EN_PROCESO_DEVOLUCION = {
    'RECLAME EN OFICINA', 'EN BODEGA DESTINO', 'BODEGA DESTINO',
    'EN BODEGA ORIGEN', 'EN TERMINAL DESTINO',
}

# Interrapidísimo gets 100% flete charged, others get 80%
INTERRAPIDISIMO_NAMES = {'INTERRAPIDISIMO', 'INTERRAPIDÍSIMO', 'IR'}

DB_PATH = os.path.join(os.path.dirname(__file__), "dropi.db")
META_AUDIENCES_DIR = os.path.join(os.path.dirname(__file__), "meta_audiences_salidas")
os.makedirs(META_AUDIENCES_DIR, exist_ok=True)

# Interactive API docs leak the full endpoint map to anyone — off entirely, same
# way in dev and production (nobody here uses them; curl/the frontend don't need them).
app = FastAPI(title="Dropi Manager API", docs_url=None, redoc_url=None, openapi_url=None)

# Only the real frontend origins may call this API. ALLOWED_ORIGINS env var lets the
# deployed instance add its domain without touching code (comma-separated).
_default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB ──────────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS periods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            bogota_income REAL DEFAULT 0,
            UNIQUE(year, month, store_id)
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            fecha TEXT, nombre_cliente TEXT, telefono TEXT, numero_guia TEXT, estatus TEXT,
            tipo_envio TEXT, departamento_destino TEXT, ciudad_destino TEXT,
            direccion TEXT, transportadora TEXT,
            valor_facturado REAL DEFAULT 0, valor_compra_productos REAL DEFAULT 0,
            ganancia REAL DEFAULT 0, precio_flete REAL DEFAULT 0,
            costo_devolucion_flete REAL DEFAULT 0, comision REAL DEFAULT 0,
            total_proveedor REAL DEFAULT 0, numero_factura TEXT
        );
        CREATE TABLE IF NOT EXISTS ad_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            platform TEXT DEFAULT 'meta',
            active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ad_investments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            ad_account_id INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
            amount REAL DEFAULT 0,
            UNIQUE(period_id, store_id, ad_account_id)
        );
        CREATE TABLE IF NOT EXISTS expense_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
            amount REAL DEFAULT 0,
            UNIQUE(period_id, store_id, category_id)
        );
        CREATE TABLE IF NOT EXISTS income_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS manual_counts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            UNIQUE(period_id, store_id, name, type)
        );
        CREATE TABLE IF NOT EXISTS product_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            order_id TEXT,
            estatus TEXT,
            departamento_destino TEXT,
            ciudad_destino TEXT,
            transportadora TEXT,
            producto TEXT,
            variacion TEXT,
            cantidad INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS income_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES income_categories(id) ON DELETE CASCADE,
            amount REAL DEFAULT 0,
            UNIQUE(period_id, store_id, category_id)
        );
        CREATE TABLE IF NOT EXISTS ad_campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            account_label TEXT NOT NULL DEFAULT '',
            campaign_name TEXT NOT NULL,
            spend REAL DEFAULT 0,
            producto TEXT,
            UNIQUE(period_id, store_id, platform, account_label, campaign_name)
        );
        CREATE TABLE IF NOT EXISTS product_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            raw_key TEXT NOT NULL,
            canonical_key TEXT NOT NULL,
            canonical_label TEXT NOT NULL,
            UNIQUE(store_id, raw_key)
        );
        CREATE TABLE IF NOT EXISTS ad_region_spend (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            account_label TEXT NOT NULL DEFAULT '',
            region_raw TEXT NOT NULL,
            spend REAL DEFAULT 0,
            UNIQUE(period_id, store_id, platform, account_label, region_raw)
        );
        CREATE TABLE IF NOT EXISTS region_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            region_raw TEXT NOT NULL,
            departamento TEXT NOT NULL,
            UNIQUE(store_id, region_raw)
        );
        CREATE TABLE IF NOT EXISTS ad_campaign_region_spend (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            account_label TEXT NOT NULL DEFAULT '',
            campaign_name TEXT NOT NULL,
            region_raw TEXT NOT NULL,
            spend REAL DEFAULT 0,
            UNIQUE(period_id, store_id, platform, account_label, campaign_name, region_raw)
        );
        CREATE TABLE IF NOT EXISTS campaign_product_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            campaign_name_key TEXT NOT NULL,
            producto TEXT NOT NULL,
            UNIQUE(store_id, platform, campaign_name_key)
        );
        CREATE TABLE IF NOT EXISTS product_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            canonical_key TEXT NOT NULL,
            line TEXT NOT NULL,
            UNIQUE(store_id, canonical_key)
        );
        CREATE TABLE IF NOT EXISTS order_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL,
            store_id INTEGER NOT NULL,
            numero_guia TEXT NOT NULL,
            estatus TEXT NOT NULL,
            ganancia REAL DEFAULT 0,
            costo_devolucion_flete REAL DEFAULT 0,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_history_lookup ON order_status_history(period_id, store_id, numero_guia);
        CREATE INDEX IF NOT EXISTS idx_history_estatus ON order_status_history(period_id, store_id, estatus);
        -- Rows whose estatus is in EXCLUDED_STATUSES (CANCELADO, RECHAZADO,
        -- PENDIENTE CONFIRMACION): never counted in `orders`/financial reports,
        -- but still useful leads for Meta Audiences (DP-07/08/09 segments).
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS excluded_leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            fecha TEXT, nombre_cliente TEXT, telefono TEXT, estatus TEXT, novedad TEXT,
            departamento_destino TEXT, ciudad_destino TEXT, direccion TEXT
        );
        """)

init_db()

# ── Auth (single/few-user login — hashed password, bearer session token) ───

PBKDF2_ITERATIONS = 260_000
SESSION_DAYS = 30

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, hex_digest = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return secrets.compare_digest(digest.hex(), hex_digest)
    except (ValueError, AttributeError):
        return False

# Seed the initial admin user if the table is empty (first boot only).
with get_db() as conn:
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
            ("zindracol@gmail.com", "Zindra Col", hash_password("Guarderia1!")),
        )

PUBLIC_PATHS = {"/api/auth/login", "/api/health", "/openapi.json", "/docs", "/redoc"}

# Login brute-force guard: per-IP failed-attempt counter, in memory (fine for a
# single-worker process — resets on restart, which is an acceptable tradeoff for
# this app's scale). 5 failures -> locked out for 15 minutes.
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 15 * 60
_login_attempts: dict = {}  # ip -> (fail_count, locked_until_timestamp_or_None)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB — comfortably above any real Dropi/ads export

def check_upload_size(content: bytes):
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"El archivo supera el límite de {MAX_UPLOAD_BYTES // (1024*1024)} MB")

def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")

@app.middleware("http")
async def require_auth(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or path in PUBLIC_PATHS or not path.startswith("/api/"):
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        return JSONResponse(status_code=401, content={"detail": "No autenticado"})
    with get_db() as conn:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token=?", (token,)
        ).fetchone()
    if not row or datetime.fromisoformat(row["expires_at"]) < datetime.now():
        return JSONResponse(status_code=401, content={"detail": "Sesión expirada"})
    return await call_next(request)

class LoginIn(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
def login(body: LoginIn, request: Request):
    ip = _client_ip(request)
    fail_count, locked_until = _login_attempts.get(ip, (0, None))
    now = datetime.now().timestamp()
    if locked_until and now < locked_until:
        wait_min = max(1, int((locked_until - now) / 60) + 1)
        raise HTTPException(429, f"Demasiados intentos fallidos. Espera {wait_min} minuto(s) e intenta de nuevo.")

    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email=?", (body.email.strip().lower(),)).fetchone()
        if not user or not verify_password(body.password, user["password_hash"]):
            fail_count += 1
            if fail_count >= LOGIN_MAX_ATTEMPTS:
                _login_attempts[ip] = (0, now + LOGIN_LOCKOUT_SECONDS)
            else:
                _login_attempts[ip] = (fail_count, None)
            raise HTTPException(401, "Correo o contraseña incorrectos")
        _login_attempts.pop(ip, None)
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(days=SESSION_DAYS)).isoformat()
        conn.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
                     (token, user["id"], expires_at))
        return {"token": token, "name": user["name"], "email": user["email"]}

@app.post("/api/auth/logout")
def logout(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if token:
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    return {"ok": True}

@app.get("/api/auth/me")
def auth_me(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    with get_db() as conn:
        row = conn.execute("""
            SELECT u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token=?
        """, (token,)).fetchone()
    if not row:
        raise HTTPException(401, "No autenticado")
    return dict(row)

# Migration: add novedad to orders if missing (upload-time migration only runs
# on the next upload, but /api/meta-audiences/generate queries it immediately)
with get_db() as conn:
    existing = {r[1] for r in conn.execute("PRAGMA table_info(orders)").fetchall()}
    if "novedad" not in existing:
        conn.execute("ALTER TABLE orders ADD COLUMN novedad TEXT DEFAULT ''")

# Migration: add total_pedidos to periods if missing
with get_db() as conn:
    existing = {r[1] for r in conn.execute("PRAGMA table_info(periods)").fetchall()}
    if "total_pedidos" not in existing:
        conn.execute("ALTER TABLE periods ADD COLUMN total_pedidos INTEGER DEFAULT 0")
    if "total_pedidos_shopify" not in existing:
        conn.execute("ALTER TABLE periods ADD COLUMN total_pedidos_shopify INTEGER DEFAULT 0")
        # one-time migration: move any previously-entered total_pedidos into shopify bucket
        conn.execute("UPDATE periods SET total_pedidos_shopify = COALESCE(total_pedidos, 0)")
    if "total_pedidos_whatsapp" not in existing:
        conn.execute("ALTER TABLE periods ADD COLUMN total_pedidos_whatsapp INTEGER DEFAULT 0")

# Migration: add numero_guia to product_orders — lets us join back to the real
# per-order ganancia/costo_devolucion instead of double-counting on multi-product orders.
with get_db() as conn:
    po_cols = {r[1] for r in conn.execute("PRAGMA table_info(product_orders)").fetchall()}
    if "numero_guia" not in po_cols:
        conn.execute("ALTER TABLE product_orders ADD COLUMN numero_guia TEXT DEFAULT ''")

def rows_to_list(rows):
    return [dict(r) for r in rows]

def normalize(s: str) -> str:
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().upper().strip()

# Products often repeat under many rows that only differ by the gift-box add-on
# ("Collar Girasol Giratorio + CAJA GIRASOL" vs "... +CAJALUJO") — it's the same
# product being sold with a different box, not a different product. Strip that
# suffix and normalize case/whitespace to get a canonical grouping key used
# consistently for ad-campaign matching (also collapses "GIRATORIO" vs "Giratorio").
def canonical_product(name: str) -> str:
    base = re.split(r'\+\s*caja', name or '', maxsplit=1, flags=re.IGNORECASE)[0]
    return re.sub(r'\s+', ' ', base).strip().upper()

def product_display_label(name: str) -> str:
    """Same stripping as canonical_product but preserves original casing, for UI display."""
    base = re.split(r'\+\s*caja', name or '', maxsplit=1, flags=re.IGNORECASE)[0]
    return re.sub(r'\s+', ' ', base).strip()

def resolve_group(conn, store_id: int, producto: str):
    """Returns (canonical_key, display_label) for a raw product name, honoring any
    manual merge the user configured in product_aliases (e.g. "Collar Girasol" -> "Collar Girasol Giratorio")."""
    auto_key = canonical_product(producto)
    alias = conn.execute(
        "SELECT canonical_key, canonical_label FROM product_aliases WHERE store_id=? AND raw_key=?",
        (store_id, auto_key)
    ).fetchone()
    if alias:
        return alias["canonical_key"], alias["canonical_label"]
    return auto_key, product_display_label(producto)

def get_remembered_producto(conn, store_id: int, platform: str, campaign_name: str):
    """Looks up whether this exact campaign name was already mapped to a product in a
    previous month for this store — so a recurring campaign (e.g. "Chaqueta Motera -
    Trafico" that runs every month under cp1/cp2) doesn't need remapping each upload."""
    row = conn.execute(
        "SELECT producto FROM campaign_product_memory WHERE store_id=? AND platform=? AND campaign_name_key=?",
        (store_id, platform.upper(), normalize(campaign_name))
    ).fetchone()
    return row["producto"] if row else None

def remember_campaign_producto(conn, store_id: int, platform: str, campaign_name: str, producto: str | None):
    """Saves (or clears) the store-wide campaign→product memory. Scoped by store+platform+
    campaign name only (no period_id), same pattern as region_aliases, so it carries
    forward to every future month automatically."""
    key = normalize(campaign_name)
    if producto:
        conn.execute("""
            INSERT INTO campaign_product_memory (store_id, platform, campaign_name_key, producto)
            VALUES (?,?,?,?)
            ON CONFLICT(store_id, platform, campaign_name_key) DO UPDATE SET producto=excluded.producto
        """, (store_id, platform.upper(), key, producto))
    else:
        conn.execute(
            "DELETE FROM campaign_product_memory WHERE store_id=? AND platform=? AND campaign_name_key=?",
            (store_id, platform.upper(), key)
        )

# One-time backfill: campaigns already mapped to a product in earlier months (before this
# memory table existed) should also be remembered, not just mappings made from now on.
# Picks each campaign's mapping from its most recent period, in case it ever changed.
with get_db() as conn:
    already_mapped = conn.execute("""
        SELECT ac.store_id, ac.platform, ac.campaign_name, ac.producto
        FROM ad_campaigns ac
        JOIN (
            SELECT store_id, platform, campaign_name, MAX(period_id) as latest_period
            FROM ad_campaigns WHERE producto IS NOT NULL
            GROUP BY store_id, platform, campaign_name
        ) latest ON ac.store_id=latest.store_id AND ac.platform=latest.platform
                AND ac.campaign_name=latest.campaign_name AND ac.period_id=latest.latest_period
        WHERE ac.producto IS NOT NULL
    """).fetchall()
    for r in already_mapped:
        remember_campaign_producto(conn, r["store_id"], r["platform"], r["campaign_name"], r["producto"])

def is_envio_fantasma(producto: str) -> bool:
    """'Envío Prioritario/Express' rows are a Dropi upsell gimmick, not a real product — they
    cost Dropi about $1 and exist only to push a higher ticket (e.g. +$5.000 for faster
    shipping). Splitting an order's real ganancia proportionally by cantidad would hand this
    phantom line item half the credit for a sale it didn't actually drive."""
    return "ENVIO" in normalize(producto or "")

def allocate_product_financials(conn, period_id: int, store_id: int):
    """Per-product_orders-row ingreso/costo_devolucion, using the REAL order (joined by
    numero_guia) split proportionally by cantidad across every REAL product line in that
    same order — so an order with several products (e.g. "chaqueta motera" + "chaqueta
    ferrari" in one guide) doesn't get its ganancia/devolución cost counted in full for each
    product. "Envío Prioritario"-style phantom upsell lines are excluded from that split
    entirely (0 share) — the real product(s) in the same guide absorb 100% of the order's
    ganancia instead, since the upsell revenue is really the real product's, not a separate
    item's. Falls back to the store-wide average for rows with no guide match (older
    imports, before numero_guia was captured) — including for a standalone envío row with no
    real product sibling, so that money is never silently dropped."""
    rows = conn.execute("""
        SELECT po.producto, po.departamento_destino, po.estatus, po.cantidad, po.numero_guia,
               o.ganancia as order_ganancia, o.costo_devolucion_flete as order_costo_dev
        FROM product_orders po
        LEFT JOIN orders o ON o.period_id=po.period_id AND o.store_id=po.store_id
                           AND o.numero_guia=po.numero_guia AND po.numero_guia != ''
        WHERE po.period_id=? AND po.store_id=?
    """, (period_id, store_id)).fetchall()

    guide_totals: dict = {}
    for r in rows:
        if r["numero_guia"] and not is_envio_fantasma(r["producto"]):
            guide_totals[r["numero_guia"]] = guide_totals.get(r["numero_guia"], 0) + (r["cantidad"] or 1)

    avg_row = conn.execute("""
        SELECT
            (SELECT COALESCE(SUM(ganancia),0) FROM orders WHERE period_id=? AND store_id=? AND estatus='ENTREGADO') as ganancia_total,
            (SELECT COUNT(*) FROM orders WHERE period_id=? AND store_id=? AND estatus='ENTREGADO') as entregados_total,
            (SELECT COALESCE(SUM(costo_devolucion_flete),0) FROM orders WHERE period_id=? AND store_id=? AND estatus='DEVOLUCION') as devolucion_costo_total,
            (SELECT COUNT(*) FROM orders WHERE period_id=? AND store_id=? AND estatus='DEVOLUCION') as devoluciones_total
    """, (period_id, store_id, period_id, store_id, period_id, store_id, period_id, store_id)).fetchone()
    avg_ganancia = (avg_row["ganancia_total"] / avg_row["entregados_total"]) if avg_row["entregados_total"] else 0.0
    avg_costo_dev = (avg_row["devolucion_costo_total"] / avg_row["devoluciones_total"]) if avg_row["devoluciones_total"] else 0.0

    result = []
    for r in rows:
        cantidad = r["cantidad"] or 1
        guide = r["numero_guia"]
        is_envio = is_envio_fantasma(r["producto"])
        matched = bool(guide) and guide in guide_totals and r["order_ganancia"] is not None
        if is_envio and matched:
            share = 0.0  # a real sibling product in this guide absorbs the full ganancia instead
        elif matched:
            share = cantidad / guide_totals[guide]
        else:
            share = 1.0  # no real product sibling found — fall back to the store average below
        ingreso = costo_dev = 0.0
        if r["estatus"] == "ENTREGADO":
            ingreso = (r["order_ganancia"] * share) if matched else avg_ganancia
        elif r["estatus"] == "DEVOLUCION":
            costo_dev = (r["order_costo_dev"] * share) if matched else avg_costo_dev
        result.append({
            "producto": r["producto"], "departamento_destino": r["departamento_destino"],
            "estatus": r["estatus"], "ingreso": ingreso, "costo_devolucion": costo_dev,
        })
    return result, avg_ganancia, avg_costo_dev

# ── STORES ──────────────────────────────────────────────────────────────────

@app.get("/api/stores")
def list_stores():
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM stores ORDER BY name").fetchall())

class StoreIn(BaseModel):
    name: str

@app.post("/api/stores")
def create_store(body: StoreIn):
    try:
        with get_db() as conn:
            cur = conn.execute("INSERT INTO stores (name) VALUES (?)", (body.name.strip(),))
            return {"id": cur.lastrowid, "name": body.name.strip()}
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Store already exists")

@app.patch("/api/stores/{store_id}")
def update_store(store_id: int, body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "name required")
    with get_db() as conn:
        conn.execute("UPDATE stores SET name=? WHERE id=?", (name, store_id))
    return {"ok": True}

@app.delete("/api/stores/{store_id}")
def delete_store(store_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM stores WHERE id=?", (store_id,))
    return {"ok": True}

# ── PERIODS ──────────────────────────────────────────────────────────────────

@app.get("/api/periods")
def list_periods(store_id: Optional[int] = None):
    with get_db() as conn:
        if store_id:
            rows = conn.execute(
                "SELECT p.*, s.name as store_name FROM periods p JOIN stores s ON p.store_id=s.id WHERE p.store_id=? ORDER BY p.year DESC, p.month DESC",
                (store_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT p.*, s.name as store_name FROM periods p JOIN stores s ON p.store_id=s.id ORDER BY p.year DESC, p.month DESC"
            ).fetchall()
        return rows_to_list(rows)

class PeriodIn(BaseModel):
    year: int
    month: int
    store_id: int

@app.post("/api/periods")
def create_period(body: PeriodIn):
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO periods (year, month, store_id) VALUES (?, ?, ?)",
                (body.year, body.month, body.store_id)
            )
            return {"id": cur.lastrowid, "year": body.year, "month": body.month, "store_id": body.store_id}
        except sqlite3.IntegrityError:
            row = conn.execute(
                "SELECT * FROM periods WHERE year=? AND month=? AND store_id=?",
                (body.year, body.month, body.store_id)
            ).fetchone()
            return dict(row)

class BogotaIn(BaseModel):
    bogota_income: float

@app.patch("/api/periods/{period_id}/bogota")
def update_bogota(period_id: int, body: BogotaIn):
    with get_db() as conn:
        conn.execute("UPDATE periods SET bogota_income=? WHERE id=?", (body.bogota_income, period_id))
    return {"ok": True}

@app.delete("/api/orders/clear")
def clear_orders(period_id: int, store_id: int):
    with get_db() as conn:
        deleted = conn.execute(
            "DELETE FROM orders WHERE period_id=? AND store_id=?", (period_id, store_id)
        ).rowcount
    return {"ok": True, "deleted": deleted}

@app.delete("/api/product-orders/clear")
def clear_product_orders(period_id: int, store_id: int):
    with get_db() as conn:
        deleted = conn.execute(
            "DELETE FROM product_orders WHERE period_id=? AND store_id=?", (period_id, store_id)
        ).rowcount
    return {"ok": True, "deleted": deleted}

# ── ORDERS ───────────────────────────────────────────────────────────────────

def extract_year_month(fecha_val):
    """Best-effort (year, month) from a Dropi FECHA cell — either a real date (openpyxl
    gives those for date-formatted columns) or a DD-MM-YYYY / YYYY-MM-DD string."""
    if hasattr(fecha_val, "year") and hasattr(fecha_val, "month"):
        return (fecha_val.year, fecha_val.month)
    s = str(fecha_val or "").strip()
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", s)
    if m:
        d, mo, y = m.groups()
        return (int(y), int(mo))
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
    if m:
        y, mo, d = m.groups()
        return (int(y), int(mo))
    return None

def check_period_mismatch(fecha_values, expected_year: int, expected_month: int):
    """Compares the dominant (year, month) found across a column of FECHA cells against
    the period the user selected before upload — catches the classic "uploaded this
    month's file to last month's slot" (or the wrong store) mistake before it corrupts
    the closing. Returns None when it looks fine, or a warning dict when most rows point
    to a different month than the one selected."""
    counts: dict = {}
    for v in fecha_values:
        ym = extract_year_month(v)
        if ym:
            counts[ym] = counts.get(ym, 0) + 1
    if not counts:
        return None
    (dom_year, dom_month), dom_count = max(counts.items(), key=lambda kv: kv[1])
    total = sum(counts.values())
    if (dom_year, dom_month) == (expected_year, expected_month):
        return None
    # Only warn when the mismatch is clearly the common case, not just a few stray rows
    # (e.g. an order placed late last month but delivered into this one).
    if dom_count / total < 0.6:
        return None
    return {
        "detected_year": dom_year, "detected_month": dom_month,
        "detected_count": dom_count, "total_rows": total,
        "expected_year": expected_year, "expected_month": expected_month,
    }

COL_MAP = {
    "fecha": "FECHA",
    "nombre_cliente": "NOMBRE CLIENTE",
    "telefono": "TELEFONO",
    "numero_guia": "NUMERO GUIA",
    "estatus": "ESTATUS",
    "tipo_envio": "TIPO DE ENVIO",
    "departamento_destino": "DEPARTAMENTO DESTINO",
    "ciudad_destino": "CIUDAD DESTINO",
    "direccion": "DIRECCION",
    "transportadora": "TRANSPORTADORA",
    "novedad": "NOVEDAD",
    "valor_facturado": "VALOR FACTURADO",
    "valor_compra_productos": "VALOR DE COMPRA EN PRODUCTOS",
    "ganancia": "GANANCIA",
    "precio_flete": "PRECIO FLETE",
    "costo_devolucion_flete": "COSTO DEVOLUCION FLETE",
    "comision": "COMISION",
    "total_proveedor": "TOTAL EN PRECIOS DE PROVEEDOR",
    "numero_factura": "NUMERO DE FACTURA",
}

@app.post("/api/orders/upload")
async def upload_orders(
    file: UploadFile = File(...),
    period_id: int = Form(...),
    store_id: int = Form(...),
    confirm: bool = Form(False),
):
    content = await file.read()
    check_upload_size(content)
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    headers = {}
    for cell in ws[1]:
        if cell.value:
            headers[normalize(str(cell.value))] = cell.column - 1

    def get_col(row_vals, field):
        col_name = COL_MAP.get(field, "")
        idx = headers.get(normalize(col_name))
        if idx is None:
            return None
        v = row_vals[idx] if idx < len(row_vals) else None
        return v

    def safe_float(v):
        if v is None or v == "":
            return 0.0
        try:
            return float(str(v).replace(",", "."))
        except:
            return 0.0

    rows_data = []
    excluded_rows_data = []
    fecha_values = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(c is None for c in row):
            continue
        row_list = list(row)
        fecha_val = get_col(row_list, "fecha")
        if hasattr(fecha_val, "strftime"):
            fecha_str = fecha_val.strftime("%Y-%m-%d")
        else:
            fecha_str = str(fecha_val) if fecha_val else ""
        # Excluded statuses never land in `orders` (keeps financial reports clean),
        # but are still useful leads for Meta Audiences (DP-07/08/09 segments) —
        # stash them separately instead of discarding.
        estatus_val = str(get_col(row_list, "estatus") or "").strip().upper()
        if estatus_val in EXCLUDED_STATUSES:
            excluded_rows_data.append((
                period_id, store_id, fecha_str,
                str(get_col(row_list, "nombre_cliente") or ""),
                str(get_col(row_list, "telefono") or ""),
                str(get_col(row_list, "estatus") or ""),
                str(get_col(row_list, "novedad") or ""),
                str(get_col(row_list, "departamento_destino") or ""),
                str(get_col(row_list, "ciudad_destino") or ""),
                str(get_col(row_list, "direccion") or ""),
            ))
            continue
        fecha_values.append(fecha_val)

        rows_data.append((
            period_id, store_id,
            fecha_str,
            str(get_col(row_list, "nombre_cliente") or ""),
            str(get_col(row_list, "telefono") or ""),
            str(get_col(row_list, "numero_guia") or ""),
            str(get_col(row_list, "estatus") or ""),
            str(get_col(row_list, "tipo_envio") or ""),
            str(get_col(row_list, "departamento_destino") or ""),
            str(get_col(row_list, "ciudad_destino") or ""),
            str(get_col(row_list, "direccion") or ""),
            str(get_col(row_list, "transportadora") or ""),
            safe_float(get_col(row_list, "valor_facturado")),
            safe_float(get_col(row_list, "valor_compra_productos")),
            safe_float(get_col(row_list, "ganancia")),
            safe_float(get_col(row_list, "precio_flete")),
            safe_float(get_col(row_list, "costo_devolucion_flete")),
            safe_float(get_col(row_list, "comision")),
            safe_float(get_col(row_list, "total_proveedor")),
            str(get_col(row_list, "numero_factura") or ""),
            str(get_col(row_list, "novedad") or ""),
        ))

    if not confirm:
        with get_db() as conn:
            period_row = conn.execute("SELECT year, month FROM periods WHERE id=?", (period_id,)).fetchone()
        if period_row:
            mismatch = check_period_mismatch(fecha_values, period_row["year"], period_row["month"])
            if mismatch:
                raise HTTPException(409, detail={
                    "type": "period_mismatch",
                    "message": (
                        f"La mayoría de las fechas en este Excel ({mismatch['detected_count']}/{mismatch['total_rows']} filas) "
                        f"son de {mismatch['detected_month']}/{mismatch['detected_year']}, pero seleccionaste "
                        f"{mismatch['expected_month']}/{mismatch['expected_year']}. ¿Seguro que quieres continuar?"
                    ),
                    **mismatch,
                })

    with get_db() as conn:
        # Add columns if they don't exist yet (migration for existing DBs)
        existing = {r[1] for r in conn.execute("PRAGMA table_info(orders)").fetchall()}
        if "transportadora" not in existing:
            conn.execute("ALTER TABLE orders ADD COLUMN transportadora TEXT DEFAULT ''")
        if "direccion" not in existing:
            conn.execute("ALTER TABLE orders ADD COLUMN direccion TEXT DEFAULT ''")
        if "telefono" not in existing:
            conn.execute("ALTER TABLE orders ADD COLUMN telefono TEXT DEFAULT ''")
        if "novedad" not in existing:
            conn.execute("ALTER TABLE orders ADD COLUMN novedad TEXT DEFAULT ''")
        # Snapshot the status every guía had right before this upload replaces it — lets
        # /api/orders/status-journey answer "of the orders that were once X, what actually
        # happened to them" across re-uploads of this same month (e.g. re-uploading September
        # a few weeks later to see which RECLAME EN OFICINA packages got delivered since).
        conn.execute("""
            INSERT INTO order_status_history (period_id, store_id, numero_guia, estatus, ganancia, costo_devolucion_flete)
            SELECT period_id, store_id, numero_guia, estatus, ganancia, costo_devolucion_flete
            FROM orders WHERE period_id=? AND store_id=? AND numero_guia != ''
        """, (period_id, store_id))
        conn.execute("DELETE FROM orders WHERE period_id=? AND store_id=?", (period_id, store_id))
        conn.executemany("""
            INSERT INTO orders (period_id, store_id, fecha, nombre_cliente, telefono, numero_guia, estatus,
                tipo_envio, departamento_destino, ciudad_destino, direccion, transportadora,
                valor_facturado, valor_compra_productos, ganancia, precio_flete, costo_devolucion_flete,
                comision, total_proveedor, numero_factura, novedad)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, rows_data)

        conn.execute("DELETE FROM excluded_leads WHERE period_id=? AND store_id=?", (period_id, store_id))
        conn.executemany("""
            INSERT INTO excluded_leads (period_id, store_id, fecha, nombre_cliente, telefono, estatus,
                novedad, departamento_destino, ciudad_destino, direccion)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, excluded_rows_data)

    return {"ok": True, "imported": len(rows_data), "excluded_leads": len(excluded_rows_data)}

@app.get("/api/orders/summary")
def orders_summary(period_id: int, store_id: int):
    with get_db() as conn:
        entregado = conn.execute(
            "SELECT COALESCE(SUM(ganancia),0) as total, COUNT(*) as count FROM orders WHERE period_id=? AND store_id=? AND estatus='ENTREGADO'",
            (period_id, store_id)
        ).fetchone()
        devolucion = conn.execute(
            "SELECT COALESCE(SUM(costo_devolucion_flete),0) as total, COUNT(*) as count FROM orders WHERE period_id=? AND store_id=? AND estatus='DEVOLUCION'",
            (period_id, store_id)
        ).fetchone()
        total = conn.execute(
            "SELECT COUNT(*) as count FROM orders WHERE period_id=? AND store_id=?",
            (period_id, store_id)
        ).fetchone()
        en_proceso = conn.execute("""
            SELECT COUNT(*) as count,
                   COALESCE(SUM(CASE WHEN UPPER(transportadora) IN ('INTERRAPIDISIMO','INTERRAPIDÍSIMO','IR')
                       THEN precio_flete ELSE precio_flete * 0.8 END), 0) as costo_estimado
            FROM orders WHERE period_id=? AND store_id=? AND estatus NOT IN ('ENTREGADO','DEVOLUCION')
        """, (period_id, store_id)).fetchone()
        en_proceso_orders = conn.execute("""
            SELECT numero_guia, nombre_cliente, estatus, transportadora, departamento_destino,
                   ciudad_destino, precio_flete,
                   CASE WHEN UPPER(transportadora) IN ('INTERRAPIDISIMO','INTERRAPIDÍSIMO','IR')
                       THEN precio_flete ELSE precio_flete * 0.8 END as costo_estimado
            FROM orders WHERE period_id=? AND store_id=? AND estatus NOT IN ('ENTREGADO','DEVOLUCION')
            ORDER BY estatus, precio_flete DESC
        """, (period_id, store_id)).fetchall()
        period_row = conn.execute(
            "SELECT total_pedidos, COALESCE(total_pedidos_shopify,0) as total_pedidos_shopify, "
            "COALESCE(total_pedidos_whatsapp,0) as total_pedidos_whatsapp FROM periods WHERE id=?",
            (period_id,)
        ).fetchone()
        total_pedidos = period_row["total_pedidos"] if period_row else 0
        total_pedidos_shopify = period_row["total_pedidos_shopify"] if period_row else 0
        total_pedidos_whatsapp = period_row["total_pedidos_whatsapp"] if period_row else 0

        otros = conn.execute("""
            SELECT estatus, COUNT(*) as count
            FROM orders WHERE period_id=? AND store_id=? AND estatus NOT IN ('ENTREGADO','DEVOLUCION')
            GROUP BY estatus ORDER BY count DESC
        """, (period_id, store_id)).fetchall()

    return {
        "entregado": dict(entregado),
        "devolucion": dict(devolucion),
        "total_orders": total["count"],
        "total_pedidos": total_pedidos or 0,
        "total_pedidos_shopify": total_pedidos_shopify or 0,
        "total_pedidos_whatsapp": total_pedidos_whatsapp or 0,
        "en_proceso": {"count": en_proceso["count"], "costo_estimado": en_proceso["costo_estimado"]},
        "en_proceso_orders": rows_to_list(en_proceso_orders),
        "otros_status": rows_to_list(otros),
    }


@app.get("/api/orders/status-breakdown")
def status_breakdown(period_id: int, store_id: int):
    """Returns status counts, percentages, and en-proceso-devolucion cost estimate."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT estatus, transportadora, precio_flete, COUNT(*) as cnt FROM orders WHERE period_id=? AND store_id=? GROUP BY estatus, transportadora",
            (period_id, store_id)
        ).fetchall()

    total = sum(r["cnt"] for r in rows)
    if total == 0:
        return {"total": 0, "groups": [], "en_proceso_costo": {"interrapidisimo": 0, "otras": 0, "total": 0}}

    # Aggregate by status
    by_status: dict = {}
    for r in rows:
        st = r["estatus"] or ""
        by_status.setdefault(st, {"count": 0, "flete_inter": 0.0, "flete_otras": 0.0})
        by_status[st]["count"] += r["cnt"]
        if st in EN_PROCESO_DEVOLUCION:
            transportadora = (r["transportadora"] or "").strip().upper()
            flete = (r["precio_flete"] or 0) * r["cnt"]
            if any(n in transportadora for n in INTERRAPIDISIMO_NAMES):
                by_status[st]["flete_inter"] += flete
            else:
                by_status[st]["flete_otras"] += flete

    groups = []
    for st, data in sorted(by_status.items(), key=lambda x: -x[1]["count"]):
        pct = round(data["count"] / total * 100, 1)
        category = "entregado" if st == "ENTREGADO" else \
                   "devolucion" if st == "DEVOLUCION" else \
                   "en_proceso" if st in EN_PROCESO_DEVOLUCION else "otro"
        groups.append({
            "estatus": st,
            "count": data["count"],
            "pct": pct,
            "category": category,
            "flete_inter": data["flete_inter"],
            "flete_otras": data["flete_otras"],
        })

    # Totals for en-proceso cost
    en_proc = [g for g in groups if g["category"] == "en_proceso"]
    inter_cost = sum(g["flete_inter"] for g in en_proc)
    otras_cost = sum(g["flete_otras"] * 0.8 for g in en_proc)

    return {
        "total": total,
        "groups": groups,
        "en_proceso_costo": {
            "interrapidisimo": inter_cost,
            "otras": otras_cost,
            "total": inter_cost + otras_cost,
        },
    }


@app.get("/api/orders/by-status")
def orders_by_status(period_id: int, store_id: int, estatus: str):
    """Returns all orders for a given status in this period+store."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, fecha, nombre_cliente, numero_guia, estatus, transportadora,
                   departamento_destino, ciudad_destino, direccion,
                   valor_facturado, ganancia, precio_flete, costo_devolucion_flete
            FROM orders
            WHERE period_id=? AND store_id=? AND estatus=?
            ORDER BY fecha DESC, id DESC
        """, (period_id, store_id, estatus)).fetchall()
    # Add computed devolution cost for en-proceso orders
    result = []
    for r in rows:
        d = dict(r)
        if estatus in EN_PROCESO_DEVOLUCION:
            t = (r["transportadora"] or "").strip().upper()
            is_inter = any(n in t for n in INTERRAPIDISIMO_NAMES)
            d["costo_devolucion_estimado"] = r["precio_flete"] if is_inter else round(r["precio_flete"] * 0.8, 2)
            d["pct_flete"] = 100 if is_inter else 80
        result.append(d)
    return result

@app.get("/api/orders/by-carrier")
def orders_by_carrier(period_id: int, store_id: int):
    """Returns despachados/entregados/devoluciones/en_proceso breakdown per transportadora,
    with a detail of individual statuses (e.g. RECLAME EN OFICINA) per carrier."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT transportadora, estatus, COUNT(*) as cnt
            FROM orders WHERE period_id=? AND store_id=?
            GROUP BY transportadora, estatus
        """, (period_id, store_id)).fetchall()

    by_carrier: dict = {}
    for r in rows:
        c = (r["transportadora"] or "").strip().upper() or "SIN TRANSPORTADORA"
        st = r["estatus"] or ""
        cnt = r["cnt"]
        data = by_carrier.setdefault(c, {
            "despachados": 0, "entregados": 0, "devoluciones": 0,
            "en_proceso": 0, "otros_status": {},
        })
        data["despachados"] += cnt
        if st == "ENTREGADO":
            data["entregados"] += cnt
        elif st == "DEVOLUCION":
            data["devoluciones"] += cnt
        else:
            data["en_proceso"] += cnt
            data["otros_status"][st] = data["otros_status"].get(st, 0) + cnt

    def rate(a, b):
        return round(a / b * 100, 1) if b else 0.0

    carriers = []
    for c, d in sorted(by_carrier.items(), key=lambda x: -x[1]["despachados"]):
        desp = d["despachados"]
        carriers.append({
            "transportadora": c,
            "despachados": desp,
            "entregados": d["entregados"],
            "pct_entregados": rate(d["entregados"], desp),
            "devoluciones": d["devoluciones"],
            "pct_devoluciones": rate(d["devoluciones"], desp),
            "en_proceso": d["en_proceso"],
            "pct_en_proceso": rate(d["en_proceso"], desp),
            "otros_status": [
                {"estatus": k, "count": v}
                for k, v in sorted(d["otros_status"].items(), key=lambda x: -x[1])
            ],
        })

    total_despachados = sum(c["despachados"] for c in carriers)
    return {"carriers": carriers, "total_despachados": total_despachados}


@app.get("/api/orders/status-journey")
def status_journey(period_id: int, store_id: int, estatus: str):
    """Of every guía that was ever seen in `estatus` this period (including past re-uploads,
    via order_status_history), where did it end up as of the latest upload? Answers
    'del 100% de los pedidos a RECLAME EN OFICINA, cuántos se entregaron / siguen ahí / se
    devolvieron' with a ganancia/pérdida summary per bucket."""
    with get_db() as conn:
        rows = conn.execute("""
            WITH guias AS (
                SELECT DISTINCT numero_guia FROM order_status_history
                WHERE period_id=? AND store_id=? AND estatus=? AND numero_guia != ''
                UNION
                SELECT DISTINCT numero_guia FROM orders
                WHERE period_id=? AND store_id=? AND estatus=? AND numero_guia != ''
            )
            SELECT o.numero_guia, o.estatus, o.ganancia, o.costo_devolucion_flete,
                   o.transportadora, o.nombre_cliente, o.departamento_destino, o.ciudad_destino
            FROM guias g
            JOIN orders o ON o.numero_guia = g.numero_guia
            WHERE o.period_id=? AND o.store_id=?
        """, (period_id, store_id, estatus, period_id, store_id, estatus, period_id, store_id)).fetchall()

    buckets = {
        "still_same": {"count": 0, "ganancia": 0.0, "costo_devolucion": 0.0, "orders": []},
        "now_entregado": {"count": 0, "ganancia": 0.0, "costo_devolucion": 0.0, "orders": []},
        "now_devolucion": {"count": 0, "ganancia": 0.0, "costo_devolucion": 0.0, "orders": []},
        "now_otro": {"count": 0, "ganancia": 0.0, "costo_devolucion": 0.0, "orders": []},
    }
    for r in rows:
        st = r["estatus"]
        if st == estatus:
            key = "still_same"
        elif st == "ENTREGADO":
            key = "now_entregado"
        elif st == "DEVOLUCION":
            key = "now_devolucion"
        else:
            key = "now_otro"
        b = buckets[key]
        b["count"] += 1
        b["ganancia"] += r["ganancia"] or 0
        b["costo_devolucion"] += r["costo_devolucion_flete"] or 0
        b["orders"].append(dict(r))

    total = sum(b["count"] for b in buckets.values())
    summary = {
        "ganancia_realizada": buckets["now_entregado"]["ganancia"],
        "costo_devolucion_realizado": buckets["now_devolucion"]["costo_devolucion"],
        "resultado_neto": buckets["now_entregado"]["ganancia"] - buckets["now_devolucion"]["costo_devolucion"],
    }

    return {
        "estatus": estatus,
        "total": total,
        "still_same": buckets["still_same"],
        "now_entregado": buckets["now_entregado"],
        "now_devolucion": buckets["now_devolucion"],
        "now_otro": buckets["now_otro"],
        "summary": summary,
    }


@app.get("/api/orders/geo-breakdown")
def geo_breakdown(period_id: int, store_id: int):
    with get_db() as conn:
        # "en_proceso" here means specifically "heading toward a devolución" (RECLAME EN
        # OFICINA, EN BODEGA, etc.) — NOT every non-final status. Statuses like GUIA_GENERADA,
        # NOVEDAD or EN REPARTO are still in flight but aren't a devolución warning sign, so
        # they fall through to "otros" instead — added explicitly so total always equals
        # entregados + devoluciones + en_proceso + otros (no silently-missing orders).
        by_dept = conn.execute("""
            SELECT departamento_destino,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso,
                   SUM(CASE WHEN estatus NOT IN ('ENTREGADO','DEVOLUCION','RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as otros,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN ganancia ELSE 0 END) as ganancia_total,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN costo_devolucion_flete ELSE 0 END) as costo_devolucion
            FROM orders WHERE period_id=? AND store_id=?
            GROUP BY departamento_destino
            ORDER BY total DESC
        """, (period_id, store_id)).fetchall()

        by_city = conn.execute("""
            SELECT ciudad_destino, departamento_destino,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso,
                   SUM(CASE WHEN estatus NOT IN ('ENTREGADO','DEVOLUCION','RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as otros,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN ganancia ELSE 0 END) as ganancia_total
            FROM orders WHERE period_id=? AND store_id=?
            GROUP BY ciudad_destino, departamento_destino
            ORDER BY total DESC
        """, (period_id, store_id)).fetchall()

        by_carrier = conn.execute("""
            SELECT transportadora,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso,
                   SUM(CASE WHEN estatus NOT IN ('ENTREGADO','DEVOLUCION','RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as otros,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN ganancia ELSE 0 END) as ganancia_total,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN costo_devolucion_flete ELSE 0 END) as costo_devolucion,
                   SUM(precio_flete) as flete_total
            FROM orders WHERE period_id=? AND store_id=?
            GROUP BY transportadora
            ORDER BY total DESC
        """, (period_id, store_id)).fetchall()

        # Carrier → dept → city (flat, frontend builds hierarchy)
        carrier_geo = conn.execute("""
            SELECT transportadora, departamento_destino, ciudad_destino, estatus,
                   COUNT(*) as count,
                   SUM(ganancia) as ganancia_total,
                   SUM(costo_devolucion_flete) as costo_dev,
                   SUM(precio_flete) as flete_total
            FROM orders WHERE period_id=? AND store_id=?
            GROUP BY transportadora, departamento_destino, ciudad_destino, estatus
            ORDER BY transportadora, departamento_destino, count DESC
        """, (period_id, store_id)).fetchall()

        total_orders = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE period_id=? AND store_id=?", (period_id, store_id)
        ).fetchone()[0]

    return {
        "total_orders": total_orders,
        "byDept": rows_to_list(by_dept),
        "byCity": rows_to_list(by_city),
        "byCarrier": rows_to_list(by_carrier),
        "carrierGeo": rows_to_list(carrier_geo),
    }

# ── DISPATCH ERRORS (operational mistakes that likely caused a devolución) ────

# Real, separately-incorporated municipalities that sit right next to a metro city and
# are routinely confused with it at dispatch time — NOT neighborhoods/barrios of that
# same city (e.g. Bogotá's "Bosa" or "Kennedy" are barrios, not on this list, so they
# never trigger a false positive here). Only flag when the address names the municipality
# on the left but the order was actually shipped to the metro city on the right.
MUNICIPIO_METRO_CONFUSION = {
    "SOACHA": "BOGOTA",
    "FUNZA": "BOGOTA",
    "MOSQUERA": "BOGOTA",
    "MADRID": "BOGOTA",
    "CHIA": "BOGOTA",
    "COTA": "BOGOTA",
    "CAJICA": "BOGOTA",
    "SIBATE": "BOGOTA",
    "ITAGUI": "MEDELLIN",
    "ENVIGADO": "MEDELLIN",
    "BELLO": "MEDELLIN",
    "SABANETA": "MEDELLIN",
    "COPACABANA": "MEDELLIN",
    "LA ESTRELLA": "MEDELLIN",
    "CALDAS": "MEDELLIN",
    "GIRARDOTA": "MEDELLIN",
    "GIRON": "BUCARAMANGA",
    "FLORIDABLANCA": "BUCARAMANGA",
    "PIEDECUESTA": "BUCARAMANGA",
    "DOSQUEBRADAS": "PEREIRA",
    "SOLEDAD": "BARRANQUILLA",
    "MALAMBO": "BARRANQUILLA",
    "PUERTO COLOMBIA": "BARRANQUILLA",
    "JAMUNDI": "CALI",
    "YUMBO": "CALI",
    "PALMIRA": "CALI",
    "TURBACO": "CARTAGENA",
    "VILLA DEL ROSARIO": "CUCUTA",
    "LOS PATIOS": "CUCUTA",
}

# Known carrier names this app already recognizes elsewhere; extend detection to any of
# them (not just Interrapidísimo) when the address explicitly names a pickup-office carrier.
KNOWN_CARRIERS = ["INTERRAPIDISIMO", "ENVIA", "COORDINADORA", "TCC", "VELOCES", "JAMV-DRIVE"]

# Store-reported recaudo (valor_compra_productos) amounts that don't correspond to any
# real product price — a known source of dispatch mistakes (wrong price entered/charged
# at dispatch time). "Envío prioritario" adds a flat +5000 surcharge that's legitimate on
# a REAL price, but if it lands on top of one of these known-bad prices it's still the
# same underlying error, so each base value also flags its +5000 variant.
def _with_priority_shipping_variant(bases):
    return set(bases) | {v + 5000 for v in bases}

SUSPICIOUS_RECAUDO_BY_STORE = {
    "ZINDRA": _with_priority_shipping_variant(
        {395980, 309980, 339400, 359980, 395800, 379800, 379980, 459980, 419980}
    ),
    "CH JOYERIA": _with_priority_shipping_variant({149980, 169980}),
}

def detect_office_carrier_mismatch(direccion: str, transportadora: str):
    """If the address says "reclama/recibir en oficina de <carrier>" but the guide was
    actually shipped with a different carrier, returns the carrier named in the address."""
    d = normalize(direccion)
    if "OFICINA" not in d or not re.search(r"RECLAM|RECIB", d):
        return None
    # Interrapidísimo gets typo-tolerant matching since it's misspelled constantly
    # (interrapidicimo, interapidisimo, interneterrapidisim, etc.) — anchor on INTER…RAPID.
    if re.search(r"INTER.{0,8}RAPID", d):
        mentioned = "INTERRAPIDISIMO"
    else:
        mentioned = next((c for c in KNOWN_CARRIERS if normalize(c) in d), None)
    if not mentioned:
        return None
    actual = normalize(transportadora or "")
    matches = ("INTERRAPID" in actual) if mentioned == "INTERRAPIDISIMO" else (normalize(mentioned) in actual)
    return None if matches else mentioned

@app.get("/api/orders/dispatch-errors")
def dispatch_errors(period_id: int, store_id: int):
    """Scans this period's orders for operational mistakes that commonly cause a
    devolución: duplicate phone numbers, malformed phone numbers, an address naming a
    different municipality than the one actually shipped to, and office-pickup orders
    sent with the wrong carrier."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT fecha, numero_guia, nombre_cliente, telefono, direccion, ciudad_destino,
                   departamento_destino, transportadora, estatus, costo_devolucion_flete, ganancia,
                   valor_compra_productos
            FROM orders WHERE period_id=? AND store_id=?
        """, (period_id, store_id)).fetchall()
        store_row = conn.execute("SELECT name FROM stores WHERE id=?", (store_id,)).fetchone()
        store_name = normalize(store_row["name"]) if store_row else ""

    def make_item(r, motivo, extra=None):
        item = {
            "fecha": r["fecha"], "numero_guia": r["numero_guia"], "cliente": r["nombre_cliente"], "telefono": r["telefono"],
            "direccion": r["direccion"], "ciudad_destino": r["ciudad_destino"], "transportadora": r["transportadora"],
            "estatus": r["estatus"], "motivo": motivo, "costo_devolucion_flete": r["costo_devolucion_flete"] or 0,
        }
        if extra:
            item.update(extra)
        return item

    # When a customer's order comes back (devolución) and the dispatcher resends it, charging
    # a ~$20.000 anticipo (deposit) up front is the CORRECT way to handle it — it shows up as a
    # LATER resend whose valor_compra_productos is ~20.000 lower than the devolución that came
    # before it. That specific pattern (devolución → later resend at ~20.000 less) is not a
    # dispatch error, so it's excluded. Everything else still gets flagged, in particular:
    #   - entregado → devolución (first order delivered fine, a later one came back): still a
    #     real problem to review, no matter what the prices are.
    #   - a resend that came back as devolución AGAIN: the deposit didn't fix anything, still flag it.
    #   - a repeat customer where every order was entregado: never flagged in the first place
    #     (handled separately below) — that's just a returning buyer, not a dispatch mistake.
    # Applies across all stores.
    ANTICIPO_MONTO = 20000
    ANTICIPO_TOLERANCIA = 5000

    def parse_fecha(f):
        try:
            d, m, y = (f or "").split("-")
            return int(y) * 10000 + int(m) * 100 + int(d)
        except Exception:
            return None

    def anticipo_aplicado(orders):
        devoluciones = [o for o in orders if o["estatus"] == "DEVOLUCION"]
        for dev in devoluciones:
            dev_fecha = parse_fecha(dev["fecha"])
            if dev_fecha is None:
                continue
            dev_valor = dev["valor_compra_productos"] or 0
            for other in orders:
                if other is dev:
                    continue
                other_fecha = parse_fecha(other["fecha"])
                if other_fecha is None or other_fecha <= dev_fecha:
                    continue  # must be a LATER resend, not an earlier or same-day order
                other_valor = other["valor_compra_productos"] or 0
                if abs((dev_valor - other_valor) - ANTICIPO_MONTO) <= ANTICIPO_TOLERANCIA:
                    return True
        return False

    phone_orders: dict = {}
    for r in rows:
        tel = re.sub(r"\D", "", r["telefono"] or "")
        if tel:
            phone_orders.setdefault(tel, []).append(r)

    # 1) Duplicate phone numbers within the same month — often a repeated/duplicated order.
    by_phone: dict = {}
    for r in rows:
        tel = re.sub(r"\D", "", r["telefono"] or "")
        if tel:
            by_phone.setdefault(tel, []).append(r)
    duplicados_telefono = []
    for tel, group in by_phone.items():
        # If every order for this phone was ENTREGADO, it's just a repeat customer —
        # only worth flagging when at least one order didn't make it (devolución, en
        # tránsito, novedad, etc.), since that's the pattern that signals a real problem.
        if len(group) > 1 and any(r["estatus"] != "ENTREGADO" for r in group):
            if anticipo_aplicado(group):
                continue  # resend correctly charged the deposit — not a dispatch error
            duplicados_telefono.append({
                "telefono": tel, "count": len(group),
                "orders": [make_item(r, "Mismo celular repetido este mes") for r in group],
            })
    duplicados_telefono.sort(key=lambda x: -x["count"])

    # 2) Phone numbers that are too short to be a real Colombian mobile number.
    telefonos_invalidos = []
    for r in rows:
        tel = re.sub(r"\D", "", r["telefono"] or "")
        if tel and len(tel) < 10:
            if anticipo_aplicado(phone_orders.get(tel, [])):
                continue
            telefonos_invalidos.append(make_item(r, f"Celular con solo {len(tel)} dígitos", {"digitos": len(tel)}))

    # 3) Address names a real neighboring municipality, but the order actually shipped
    # to that municipality's metro city — a classic "va para Itagüí, se envía a Medellín" slip.
    ciudad_incorrecta = []
    for r in rows:
        if r["estatus"] == "ENTREGADO":
            continue  # delivered fine despite the address mix-up — not worth flagging
        tel = re.sub(r"\D", "", r["telefono"] or "")
        if anticipo_aplicado(phone_orders.get(tel, [])):
            continue
        d = normalize(r["direccion"] or "")
        ciudad = normalize(r["ciudad_destino"] or "")
        if not d or not ciudad:
            continue
        for municipio, metro in MUNICIPIO_METRO_CONFUSION.items():
            if ciudad != metro:
                continue  # only an error if it was actually shipped to the metro city
            if re.search(r"\b" + re.escape(municipio) + r"\b", d):
                ciudad_incorrecta.append(make_item(
                    r, f"Dirección menciona {municipio.title()} pero se despachó a {metro.title()}",
                    {"municipio_mencionado": municipio, "ciudad_despachada": metro}
                ))
                break

    # 4) Address says "reclama en oficina de <carrier>" but a different carrier shipped it.
    oficina_transportadora_incorrecta = []
    for r in rows:
        mentioned = detect_office_carrier_mismatch(r["direccion"], r["transportadora"])
        if mentioned:
            tel = re.sub(r"\D", "", r["telefono"] or "")
            if anticipo_aplicado(phone_orders.get(tel, [])):
                continue
            oficina_transportadora_incorrecta.append(make_item(
                r, f"Debía reclamarse en oficina de {mentioned.title()} pero se envió con {r['transportadora'] or '(sin transportadora)'}",
                {"transportadora_esperada": mentioned}
            ))

    # 5) Recaudo (valor a cobrar) matches a known-bad price for this store — usually a
    # wrong price entered at dispatch time, which the customer then refuses to pay.
    precio_recaudo_sospechoso = []
    suspicious_values = SUSPICIOUS_RECAUDO_BY_STORE.get(store_name, set())
    if suspicious_values:
        for r in rows:
            if r["estatus"] != "DEVOLUCION":
                continue  # only worth flagging when it actually ended in a devolución
            tel = re.sub(r"\D", "", r["telefono"] or "")
            if anticipo_aplicado(phone_orders.get(tel, [])):
                continue
            valor = r["valor_compra_productos"] or 0
            if valor in suspicious_values or round(valor) in suspicious_values:
                precio_recaudo_sospechoso.append(make_item(
                    r, f"Recaudo de {int(valor):,} no corresponde a un precio real del catálogo".replace(",", "."),
                    {"valor_recaudo": valor}
                ))

    # 6) Cross-month repeat: this phone already had a DEVOLUCION in an earlier period for
    # this store, and now they were shipped to again — a classic "sent again to someone who
    # already returned it" mistake. Unlike #1 (same-month duplicate), this spans every month.
    MONTHS_ES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    reincidentes = []
    current_phones = {re.sub(r"\D", "", r["telefono"] or "") for r in rows}
    current_phones.discard("")
    if current_phones:
        with get_db() as conn:
            current_period = conn.execute("SELECT year, month FROM periods WHERE id=?", (period_id,)).fetchone()
            current_key = current_period["year"] * 100 + current_period["month"]
            placeholders = ",".join("?" for _ in current_phones)
            history = conn.execute(f"""
                SELECT o.telefono, o.numero_guia, p.year, p.month
                FROM orders o JOIN periods p ON o.period_id = p.id
                WHERE o.store_id=? AND o.estatus='DEVOLUCION'
                  AND REPLACE(REPLACE(REPLACE(REPLACE(o.telefono,'-',''),' ',''),'(',''),')','') IN ({placeholders})
            """, [store_id] + list(current_phones)).fetchall()
        prior_devolucion: dict = {}
        for h in history:
            tel = re.sub(r"\D", "", h["telefono"] or "")
            key = h["year"] * 100 + h["month"]
            if key >= current_key:
                continue  # only earlier periods count as "already happened before"
            best = prior_devolucion.get(tel)
            if best is None or key > best["key"]:
                prior_devolucion[tel] = {"key": key, "year": h["year"], "month": h["month"], "numero_guia": h["numero_guia"]}
        for r in rows:
            if r["estatus"] != "DEVOLUCION":
                continue  # only worth flagging when it happened again, not just any repeat order
            tel = re.sub(r"\D", "", r["telefono"] or "")
            prev = prior_devolucion.get(tel)
            if prev:
                # No anticipo exception here: the current order is ALSO a devolución, meaning
                # even if a deposit was charged on this resend, it still came back — the
                # problem wasn't actually fixed, so it's always worth reviewing.
                mes_prev = MONTHS_ES[prev["month"]]
                reincidentes.append(make_item(
                    r, f"Este cliente ya tuvo una devolución en {mes_prev} {prev['year']} (guía {prev['numero_guia']}) y volvió a tener devolución ahora",
                    {"guia_anterior": prev["numero_guia"], "mes_anterior": f"{mes_prev} {prev['year']}"}
                ))

    def summarize(items):
        devoluciones = [i for i in items if i["estatus"] == "DEVOLUCION"]
        return {
            "total": len(items),
            "devoluciones": len(devoluciones),
            "costo_devoluciones": round(sum(i["costo_devolucion_flete"] for i in devoluciones), 2),
        }

    duplicados_flat = [item for g in duplicados_telefono for item in g["orders"]]

    return {
        "duplicados_telefono": {"grupos": duplicados_telefono, "resumen": summarize(duplicados_flat)},
        "telefonos_invalidos": {"items": telefonos_invalidos, "resumen": summarize(telefonos_invalidos)},
        "ciudad_incorrecta": {"items": ciudad_incorrecta, "resumen": summarize(ciudad_incorrecta)},
        "oficina_transportadora_incorrecta": {"items": oficina_transportadora_incorrecta, "resumen": summarize(oficina_transportadora_incorrecta)},
        "reincidentes_devolucion": {"items": reincidentes, "resumen": summarize(reincidentes)},
        "precio_recaudo_sospechoso": {"items": precio_recaudo_sospechoso, "resumen": summarize(precio_recaudo_sospechoso)},
    }

# ── AD ACCOUNTS ──────────────────────────────────────────────────────────────

@app.get("/api/ad-accounts")
def list_ad_accounts():
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM ad_accounts WHERE active=1 ORDER BY sort_order, id").fetchall())

class AdAccountIn(BaseModel):
    name: str
    platform: str = "meta"

@app.post("/api/ad-accounts")
def create_ad_account(body: AdAccountIn):
    with get_db() as conn:
        max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) as m FROM ad_accounts").fetchone()["m"]
        cur = conn.execute("INSERT INTO ad_accounts (name, platform, sort_order) VALUES (?,?,?)",
                           (body.name.strip(), body.platform, max_order + 1))
        return {"id": cur.lastrowid, "name": body.name.strip(), "platform": body.platform}

@app.delete("/api/ad-accounts/{account_id}")
def delete_ad_account(account_id: int):
    with get_db() as conn:
        conn.execute("UPDATE ad_accounts SET active=0 WHERE id=?", (account_id,))
    return {"ok": True}

@app.delete("/api/ad-accounts/{account_id}/investment")
def delete_ad_investment(account_id: int, period_id: int, store_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM ad_investments WHERE ad_account_id=? AND period_id=? AND store_id=?",
                     (account_id, period_id, store_id))
    return {"ok": True}

@app.get("/api/ad-accounts/investments")
def get_investments(period_id: int, store_id: int):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT a.id as ad_account_id, a.name, a.platform,
                   COALESCE(ai.amount, 0) as amount, ai.id
            FROM ad_accounts a
            LEFT JOIN ad_investments ai ON a.id=ai.ad_account_id AND ai.period_id=? AND ai.store_id=?
            WHERE a.active=1 ORDER BY a.sort_order, a.id
        """, (period_id, store_id)).fetchall()
    return rows_to_list(rows)

class InvestmentIn(BaseModel):
    period_id: int
    store_id: int
    ad_account_id: int
    amount: float = 0

@app.post("/api/ad-accounts/investments")
def upsert_investment(body: InvestmentIn):
    with get_db() as conn:
        conn.execute("""
            INSERT INTO ad_investments (period_id, store_id, ad_account_id, amount)
            VALUES (?,?,?,?)
            ON CONFLICT(period_id, store_id, ad_account_id) DO UPDATE SET amount=excluded.amount
        """, (body.period_id, body.store_id, body.ad_account_id, body.amount))
    return {"ok": True}

# ── EXPENSES ─────────────────────────────────────────────────────────────────

@app.get("/api/expenses/categories")
def list_categories():
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM expense_categories WHERE active=1 ORDER BY sort_order, id").fetchall())

class CategoryIn(BaseModel):
    name: str

@app.post("/api/expenses/categories")
def create_category(body: CategoryIn):
    try:
        with get_db() as conn:
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) as m FROM expense_categories").fetchone()["m"]
            cur = conn.execute("INSERT INTO expense_categories (name, sort_order) VALUES (?,?)",
                               (body.name.strip(), max_order + 1))
            return {"id": cur.lastrowid, "name": body.name.strip()}
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Category already exists")

@app.delete("/api/expenses/categories/{cat_id}")
def delete_category(cat_id: int):
    with get_db() as conn:
        conn.execute("UPDATE expense_categories SET active=0 WHERE id=?", (cat_id,))
    return {"ok": True}

@app.delete("/api/expenses/entry")
def delete_expense_entry(category_id: int, period_id: int, store_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM expenses WHERE category_id=? AND period_id=? AND store_id=?",
                     (category_id, period_id, store_id))
    return {"ok": True}

@app.get("/api/expenses")
def get_expenses(period_id: int, store_id: int):
    with get_db() as conn:
        # "usual_for_store" = this category had a real (>0) charge in the most recent
        # PRIOR period for this store. Based only on last month, not all of history,
        # so a category that's stopped being used drops off after one month.
        rows = conn.execute("""
            WITH cur AS (SELECT year, month FROM periods WHERE id=:period_id),
                 last_period AS (
                     SELECT p.id FROM periods p, cur
                     WHERE p.store_id=:store_id AND (p.year*100+p.month) < (cur.year*100+cur.month)
                     ORDER BY (p.year*100+p.month) DESC LIMIT 1
                 )
            SELECT c.id as category_id, c.name,
                   COALESCE(e.amount, 0) as amount, e.id,
                   (c.auto_populate = 1 AND EXISTS(
                       SELECT 1 FROM expenses e2, last_period lp
                       WHERE e2.category_id = c.id AND e2.store_id = :store_id
                         AND e2.period_id = lp.id AND e2.amount > 0
                   )) as usual_for_store
            FROM expense_categories c
            LEFT JOIN expenses e ON c.id=e.category_id AND e.period_id=:period_id AND e.store_id=:store_id
            WHERE c.active=1 ORDER BY c.sort_order, c.id
        """, {"period_id": period_id, "store_id": store_id}).fetchall()
    return rows_to_list(rows)

class ExpenseIn(BaseModel):
    period_id: int
    store_id: int
    category_id: int
    amount: float = 0

@app.post("/api/expenses")
def upsert_expense(body: ExpenseIn):
    with get_db() as conn:
        conn.execute("""
            INSERT INTO expenses (period_id, store_id, category_id, amount)
            VALUES (?,?,?,?)
            ON CONFLICT(period_id, store_id, category_id) DO UPDATE SET amount=excluded.amount
        """, (body.period_id, body.store_id, body.category_id, body.amount))
    return {"ok": True}

# ── INCOME CATEGORIES ────────────────────────────────────────────────────────

@app.get("/api/income/categories")
def list_income_categories():
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM income_categories WHERE active=1 ORDER BY sort_order, id").fetchall())

class IncomeCategoryIn(BaseModel):
    name: str

@app.post("/api/income/categories")
def create_income_category(body: IncomeCategoryIn):
    try:
        with get_db() as conn:
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) as m FROM income_categories").fetchone()["m"]
            cur = conn.execute("INSERT INTO income_categories (name, sort_order) VALUES (?,?)",
                               (body.name.strip(), max_order + 1))
            return {"id": cur.lastrowid, "name": body.name.strip(), "active": 1, "sort_order": max_order + 1}
    except sqlite3.IntegrityError:
        # Return existing if duplicate
        with get_db() as conn:
            row = conn.execute("SELECT * FROM income_categories WHERE name=?", (body.name.strip(),)).fetchone()
            if row:
                conn.execute("UPDATE income_categories SET active=1 WHERE id=?", (row["id"],))
                return dict(row)
        raise HTTPException(409, "Category already exists")

@app.delete("/api/income/categories/{cat_id}")
def delete_income_category(cat_id: int):
    with get_db() as conn:
        conn.execute("UPDATE income_categories SET active=0 WHERE id=?", (cat_id,))
    return {"ok": True}

@app.delete("/api/income/entry")
def delete_income_entry(category_id: int, period_id: int, store_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM income_entries WHERE category_id=? AND period_id=? AND store_id=?",
                     (category_id, period_id, store_id))
    return {"ok": True}

@app.get("/api/income")
def get_income(period_id: int, store_id: int):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT c.id as category_id, c.name,
                   COALESCE(e.amount, 0) as amount, e.id
            FROM income_categories c
            LEFT JOIN income_entries e ON c.id=e.category_id AND e.period_id=? AND e.store_id=?
            WHERE c.active=1 ORDER BY c.sort_order, c.id
        """, (period_id, store_id)).fetchall()
    return rows_to_list(rows)

class IncomeEntryIn(BaseModel):
    period_id: int
    store_id: int
    category_id: int
    amount: float = 0

@app.post("/api/income")
def upsert_income(body: IncomeEntryIn):
    with get_db() as conn:
        conn.execute("""
            INSERT INTO income_entries (period_id, store_id, category_id, amount)
            VALUES (?,?,?,?)
            ON CONFLICT(period_id, store_id, category_id) DO UPDATE SET amount=excluded.amount
        """, (body.period_id, body.store_id, body.category_id, body.amount))
    return {"ok": True}

# ── QUICK-ADD (create category + return it) ───────────────────────────────────

class QuickAddIn(BaseModel):
    name: str
    type: str  # 'income' | 'expense' | 'ad'
    platform: Optional[str] = "meta"

@app.post("/api/quick-add")
def quick_add(body: QuickAddIn):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    with get_db() as conn:
        # Case-insensitive lookup first: "Contador" and "contador" must be the same
        # category, otherwise the same expense/income ends up duplicated across stores
        # under near-identical names (this bit us in practice — see quick-add below).
        if body.type == "income":
            existing = conn.execute("SELECT * FROM income_categories WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
            if existing:
                conn.execute("UPDATE income_categories SET active=1 WHERE id=?", (existing["id"],))
                return {"id": existing["id"], "name": existing["name"], "category_id": existing["id"]}
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) as m FROM income_categories").fetchone()["m"]
            cur = conn.execute("INSERT INTO income_categories (name, sort_order) VALUES (?,?)", (name, max_order+1))
            return {"id": cur.lastrowid, "name": name, "category_id": cur.lastrowid}
        elif body.type == "expense":
            existing = conn.execute("SELECT * FROM expense_categories WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
            if existing:
                conn.execute("UPDATE expense_categories SET active=1 WHERE id=?", (existing["id"],))
                return {"id": existing["id"], "name": existing["name"], "category_id": existing["id"]}
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) as m FROM expense_categories").fetchone()["m"]
            cur = conn.execute("INSERT INTO expense_categories (name, sort_order) VALUES (?,?)", (name, max_order+1))
            return {"id": cur.lastrowid, "name": name, "category_id": cur.lastrowid}
        elif body.type == "ad":
            existing = conn.execute("SELECT * FROM ad_accounts WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
            if existing:
                conn.execute("UPDATE ad_accounts SET active=1 WHERE id=?", (existing["id"],))
                return {"id": existing["id"], "name": existing["name"], "ad_account_id": existing["id"]}
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order),0) as m FROM ad_accounts").fetchone()["m"]
            cur = conn.execute("INSERT INTO ad_accounts (name, platform, sort_order) VALUES (?,?,?)",
                               (name, body.platform or "meta", max_order+1))
            return {"id": cur.lastrowid, "name": name, "ad_account_id": cur.lastrowid}
    raise HTTPException(400, "Unknown type")

# ── MANUAL COUNTS (Bogotá entregados/devoluciones, pedidos recibidos) ─────────

@app.patch("/api/periods/{period_id}/total-pedidos")
def update_total_pedidos(period_id: int, body: dict):
    shopify = int(body.get("total_pedidos_shopify", 0))
    whatsapp = int(body.get("total_pedidos_whatsapp", 0))
    with get_db() as conn:
        conn.execute(
            "UPDATE periods SET total_pedidos_shopify=?, total_pedidos_whatsapp=?, total_pedidos=? WHERE id=?",
            (shopify, whatsapp, shopify + whatsapp, period_id)
        )
    return {"ok": True}

@app.get("/api/manual-counts")
def get_manual_counts(period_id: int, store_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM manual_counts WHERE period_id=? AND store_id=? ORDER BY type, name",
            (period_id, store_id)
        ).fetchall()
    return rows_to_list(rows)

@app.post("/api/manual-counts")
def upsert_manual_count(body: dict):
    period_id = body["period_id"]
    store_id = body["store_id"]
    name = body["name"].strip()
    typ = body["type"]
    quantity = int(body.get("quantity", 0))
    with get_db() as conn:
        conn.execute("""
            INSERT INTO manual_counts (period_id, store_id, name, type, quantity)
            VALUES (?,?,?,?,?)
            ON CONFLICT(period_id, store_id, name, type) DO UPDATE SET quantity=excluded.quantity
        """, (period_id, store_id, name, typ, quantity))
    return {"ok": True}

@app.post("/api/manual-counts/add")
def add_manual_count(body: dict):
    name = body["name"].strip()
    typ = body["type"]
    if not name:
        raise HTTPException(400, "name required")
    return {"name": name, "type": typ, "quantity": 0}

@app.delete("/api/manual-counts")
def delete_manual_count(period_id: int, store_id: int, name: str, type: str):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM manual_counts WHERE period_id=? AND store_id=? AND name=? AND type=?",
            (period_id, store_id, name, type)
        )
    return {"ok": True}

# ── PRODUCT ORDERS ────────────────────────────────────────────────────────────

PRODUCT_COL_MAP = {
    "order_id": "ID",
    "numero_guia": "NUMERO GUIA",
    "fecha": "FECHA",
    "estatus": "ESTATUS",
    "departamento_destino": "DEPARTAMENTO DESTINO",
    "ciudad_destino": "CIUDAD DESTINO",
    "transportadora": "TRANSPORTADORA",
    "producto": "PRODUCTO",
    "variacion": "VARIACION",
    "cantidad": "CANTIDAD",
}

@app.post("/api/product-orders/upload")
async def upload_product_orders(
    file: UploadFile = File(...),
    period_id: int = Form(...),
    store_id: int = Form(...),
    confirm: bool = Form(False),
):
    content = await file.read()
    check_upload_size(content)
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    headers = {}
    for cell in ws[1]:
        if cell.value:
            headers[normalize(str(cell.value))] = cell.column - 1

    def get_col(row_vals, field):
        col_name = PRODUCT_COL_MAP.get(field, "")
        idx = headers.get(normalize(col_name))
        if idx is None:
            return None
        v = row_vals[idx] if idx < len(row_vals) else None
        return v

    rows_data = []
    fecha_values = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(c is None for c in row):
            continue
        row_list = list(row)
        estatus_val = str(get_col(row_list, "estatus") or "").strip().upper()
        if estatus_val in EXCLUDED_STATUSES:
            continue
        fecha_values.append(get_col(row_list, "fecha"))
        cantidad_raw = get_col(row_list, "cantidad")
        try:
            cantidad = int(cantidad_raw) if cantidad_raw else 1
        except (ValueError, TypeError):
            cantidad = 1
        rows_data.append((
            period_id, store_id,
            str(get_col(row_list, "order_id") or ""),
            str(get_col(row_list, "numero_guia") or ""),
            estatus_val,
            str(get_col(row_list, "departamento_destino") or ""),
            str(get_col(row_list, "ciudad_destino") or ""),
            str(get_col(row_list, "transportadora") or ""),
            str(get_col(row_list, "producto") or ""),
            str(get_col(row_list, "variacion") or ""),
            cantidad,
        ))

    if not confirm:
        with get_db() as conn:
            period_row = conn.execute("SELECT year, month FROM periods WHERE id=?", (period_id,)).fetchone()
        if period_row:
            mismatch = check_period_mismatch(fecha_values, period_row["year"], period_row["month"])
            if mismatch:
                raise HTTPException(409, detail={
                    "type": "period_mismatch",
                    "message": (
                        f"La mayoría de las fechas en este Excel ({mismatch['detected_count']}/{mismatch['total_rows']} filas) "
                        f"son de {mismatch['detected_month']}/{mismatch['detected_year']}, pero seleccionaste "
                        f"{mismatch['expected_month']}/{mismatch['expected_year']}. ¿Seguro que quieres continuar?"
                    ),
                    **mismatch,
                })

    with get_db() as conn:
        conn.execute("DELETE FROM product_orders WHERE period_id=? AND store_id=?", (period_id, store_id))
        conn.executemany("""
            INSERT INTO product_orders (period_id, store_id, order_id, numero_guia, estatus,
                departamento_destino, ciudad_destino, transportadora, producto, variacion, cantidad)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, rows_data)

    return {"ok": True, "imported": len(rows_data)}

@app.get("/api/product-orders/summary")
def product_orders_summary(period_id: int, store_id: int):
    with get_db() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM product_orders WHERE period_id=? AND store_id=?",
            (period_id, store_id)
        ).fetchone()[0]
        raw_rows = conn.execute("""
            SELECT producto,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso,
                   SUM(cantidad) as unidades
            FROM product_orders WHERE period_id=? AND store_id=?
            GROUP BY producto
        """, (period_id, store_id)).fetchall()
        ad_spend_rows = conn.execute("""
            SELECT producto, SUM(spend) as ad_spend
            FROM ad_campaigns WHERE period_id=? AND store_id=? AND producto IS NOT NULL
            GROUP BY producto
        """, (period_id, store_id)).fetchall()
        lines_by_key = {r["canonical_key"]: r["line"] for r in conn.execute(
            "SELECT canonical_key, line FROM product_lines WHERE store_id=?", (store_id,)
        ).fetchall()}

        # Roll box/case variants and manually-merged aliases up into a single row
        # per real product, instead of one row per raw Dropi product string.
        grouped: dict = {}
        for r in raw_rows:
            key, label = resolve_group(conn, store_id, r["producto"])
            g = grouped.setdefault(key, {
                "producto": label, "grupo": key, "total": 0, "entregados": 0,
                "devoluciones": 0, "en_proceso": 0, "unidades": 0,
                "linea": lines_by_key.get(key, "HOMBRE"),
            })
            g["total"] += r["total"] or 0
            g["entregados"] += r["entregados"] or 0
            g["devoluciones"] += r["devoluciones"] or 0
            g["en_proceso"] += r["en_proceso"] or 0
            g["unidades"] += r["unidades"] or 0

        # Real per-order ganancia/costo_devolucion, split proportionally across every
        # product in the same order (via numero_guia) — avoids double-counting when an
        # order bundles several products.
        alloc_rows, _, _ = allocate_product_financials(conn, period_id, store_id)
        ingreso_by_group: dict = {}
        costo_dev_by_group: dict = {}
        for r in alloc_rows:
            key, _ = resolve_group(conn, store_id, r["producto"])
            ingreso_by_group[key] = ingreso_by_group.get(key, 0.0) + r["ingreso"]
            costo_dev_by_group[key] = costo_dev_by_group.get(key, 0.0) + r["costo_devolucion"]

    ad_spend_by_group = {r["producto"]: r["ad_spend"] for r in ad_spend_rows}
    products_list = sorted(grouped.values(), key=lambda x: -x["total"])
    for p in products_list:
        p["ad_spend"] = ad_spend_by_group.get(p["grupo"], 0.0)
        p["ingreso_estimado"] = round(ingreso_by_group.get(p["grupo"], 0.0), 2)
        p["costo_devolucion_estimado"] = round(costo_dev_by_group.get(p["grupo"], 0.0), 2)
        p["resultado_neto"] = round(p["ingreso_estimado"] - p["costo_devolucion_estimado"] - p["ad_spend"], 2)
    return {"total_orders": total, "products": products_list}

@app.get("/api/product-orders/groups")
def product_orders_groups(period_id: int, store_id: int):
    """Distinct product names, grouped so that box/gift-wrap variants of the
    same product (…+ CAJA X, or differing only by case) collapse into a single
    canonical entry — used to populate the ad-campaign → product mapping dropdown.
    Returns [{key, label}]: key is the canonical match key, label is for display."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT producto FROM product_orders WHERE period_id=? AND store_id=? AND producto != ''",
            (period_id, store_id)
        ).fetchall()
        labels: dict = {}
        for r in rows:
            p = r["producto"]
            if not p:
                continue
            key, label = resolve_group(conn, store_id, p)
            if key not in labels:
                labels[key] = label
    return [{"key": k, "label": v} for k, v in sorted(labels.items(), key=lambda x: x[1])]

@app.get("/api/product-orders/detail")
def product_orders_detail(period_id: int, store_id: int, producto: str):
    """`producto` is the canonical group key (see /product-orders/groups or the
    `grupo` field from /product-orders/summary) — every raw Dropi product string
    that resolves to this group (box variants + manual merges) is included."""
    target_key = producto.strip().upper()
    with get_db() as conn:
        raw_names = [r["producto"] for r in conn.execute(
            "SELECT DISTINCT producto FROM product_orders WHERE period_id=? AND store_id=?",
            (period_id, store_id)
        ).fetchall()]
        matching = [p for p in raw_names if resolve_group(conn, store_id, p)[0] == target_key] or [producto]
        placeholders = ",".join("?" for _ in matching)
        params = [period_id, store_id] + matching

        by_dept = conn.execute(f"""
            SELECT departamento_destino,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso
            FROM product_orders WHERE period_id=? AND store_id=? AND producto IN ({placeholders})
            GROUP BY departamento_destino ORDER BY total DESC
        """, params).fetchall()

        by_city = conn.execute(f"""
            SELECT ciudad_destino, departamento_destino,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso
            FROM product_orders WHERE period_id=? AND store_id=? AND producto IN ({placeholders})
            GROUP BY ciudad_destino, departamento_destino ORDER BY total DESC
        """, params).fetchall()

        by_carrier = conn.execute(f"""
            SELECT transportadora,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso
            FROM product_orders WHERE period_id=? AND store_id=? AND producto IN ({placeholders})
            GROUP BY transportadora ORDER BY total DESC
        """, params).fetchall()

        by_variation = conn.execute(f"""
            SELECT producto || ' — ' || variacion as variacion,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso
            FROM product_orders WHERE period_id=? AND store_id=? AND producto IN ({placeholders})
            GROUP BY producto, variacion ORDER BY total DESC
        """, params).fetchall()

        prod_counts = conn.execute(f"""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus IN ('RECLAME EN OFICINA','EN BODEGA DESTINO','BODEGA DESTINO','EN BODEGA ORIGEN','EN TERMINAL DESTINO') THEN 1 ELSE 0 END) as en_proceso
            FROM product_orders WHERE period_id=? AND store_id=? AND producto IN ({placeholders})
        """, params).fetchone()

        # Real per-order ganancia/costo_devolucion for this product, split proportionally
        # across every product in the same order (via numero_guia) — avoids double-counting
        # when an order bundles several products (e.g. one returned order with 2 jackets
        # would otherwise charge the full devolution cost to BOTH products).
        alloc_rows, avg_ganancia, avg_costo_dev = allocate_product_financials(conn, period_id, store_id)
        alloc_for_product = [r for r in alloc_rows if resolve_group(conn, store_id, r["producto"])[0] == target_key]
        ingreso_estimado = sum(r["ingreso"] for r in alloc_for_product)
        costo_devolucion_estimado = sum(r["costo_devolucion"] for r in alloc_for_product)
        ingreso_by_dept: dict = {}
        costo_dev_by_dept: dict = {}
        for r in alloc_for_product:
            dept = r["departamento_destino"]
            ingreso_by_dept[dept] = ingreso_by_dept.get(dept, 0.0) + r["ingreso"]
            costo_dev_by_dept[dept] = costo_dev_by_dept.get(dept, 0.0) + r["costo_devolucion"]

        # `target_key` is already the canonical group key, so it matches ad_campaigns.producto directly.
        ad_spend = conn.execute(
            "SELECT COALESCE(SUM(spend),0) as total, GROUP_CONCAT(campaign_name || ' (' || platform || ')') as campaigns "
            "FROM ad_campaigns WHERE period_id=? AND store_id=? AND producto=?",
            (period_id, store_id, target_key)
        ).fetchone()

        # Cross this product's own campaigns against the campaign×region spend (only
        # available when a combined CSV with both breakdowns was uploaded) to estimate
        # profit/loss per department for THIS product specifically.
        cr_rows = conn.execute("""
            SELECT acr.region_raw, acr.spend
            FROM ad_campaign_region_spend acr
            JOIN ad_campaigns ac
              ON ac.period_id=acr.period_id AND ac.store_id=acr.store_id
             AND ac.platform=acr.platform AND ac.account_label=acr.account_label
             AND ac.campaign_name=acr.campaign_name
            WHERE acr.period_id=? AND acr.store_id=? AND ac.producto=?
        """, (period_id, store_id, target_key)).fetchall()
        ad_spend_by_dept: dict = {}
        for r in cr_rows:
            dept = resolve_department(conn, store_id, r["region_raw"])
            if dept:
                ad_spend_by_dept[dept] = ad_spend_by_dept.get(dept, 0.0) + r["spend"]

    entregados_p = prod_counts["entregados"] or 0
    devoluciones_p = prod_counts["devoluciones"] or 0
    gasto_pauta = ad_spend["total"] or 0.0
    resultado_neto = ingreso_estimado - costo_devolucion_estimado - gasto_pauta

    by_dept_financiero = []
    for r in by_dept:
        dept = r["departamento_destino"]
        ingreso_d = ingreso_by_dept.get(dept, 0.0)
        costo_dev_d = costo_dev_by_dept.get(dept, 0.0)
        spend_d = ad_spend_by_dept.get(dept, 0.0)
        by_dept_financiero.append({
            "departamento": dept, "total": r["total"], "entregados": r["entregados"] or 0, "devoluciones": r["devoluciones"] or 0,
            "ingreso_estimado": round(ingreso_d, 2), "gasto_pauta": round(spend_d, 2),
            "resultado_neto": round(ingreso_d - costo_dev_d - spend_d, 2),
        })
    by_dept_financiero.sort(key=lambda x: -x["resultado_neto"])

    return {
        "byDept": rows_to_list(by_dept),
        "byDeptFinanciero": by_dept_financiero,
        "tieneCruceDepartamento": bool(ad_spend_by_dept),
        "byCity": rows_to_list(by_city),
        "byCarrier": rows_to_list(by_carrier),
        "byVariation": rows_to_list(by_variation),
        "financiero": {
            "entregados": entregados_p,
            "devoluciones": devoluciones_p,
            "en_proceso": prod_counts["en_proceso"] or 0,
            "avg_ganancia_por_entregado": round(ingreso_estimado / entregados_p, 2) if entregados_p else 0,
            "avg_costo_por_devolucion": round(costo_devolucion_estimado / devoluciones_p, 2) if devoluciones_p else 0,
            "ingreso_estimado": round(ingreso_estimado, 2),
            "costo_devolucion_estimado": round(costo_devolucion_estimado, 2),
            "gasto_pauta": round(gasto_pauta, 2),
            "campanas": ad_spend["campaigns"] or "",
            "resultado_neto": round(resultado_neto, 2),
        },
    }


# ── AD CAMPAIGNS (Meta / TikTok spend, per product) ────────────────────────────

CAMPAIGN_NAME_CANDIDATES = ["CAMPAIGN NAME", "NOMBRE DE LA CAMPANA", "NOMBRE CAMPANA", "CAMPANA", "CAMPAIGN"]
CAMPAIGN_SPEND_CANDIDATES = [
    "AMOUNT SPENT (COP)", "AMOUNT SPENT (USD)", "AMOUNT SPENT", "IMPORTE GASTADO (COP)",
    "IMPORTE GASTADO (USD)", "IMPORTE GASTADO", "MONTO GASTADO (COP)", "MONTO GASTADO (USD)",
    "MONTO GASTADO", "COST", "GASTO", "SPEND", "GASTO TOTAL",
]

def parse_money(raw: str) -> float:
    s = re.sub(r'[^\d,.\-]', '', (raw or '').strip())
    if not s:
        return 0.0
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        parts = s.split(',')
        s = s.replace(',', '.') if len(parts[-1]) == 2 else s.replace(',', '')
    try:
        return float(s)
    except ValueError:
        return 0.0

def parse_campaign_csv(content: bytes) -> dict:
    """Returns {campaign_name: spend} parsed from a Meta/TikTok ads export CSV."""
    text = content.decode('utf-8-sig', errors='ignore')
    sample = text[:2048]
    delimiter = ';' if sample.count(';') > sample.count(',') else ','
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not rows:
        return {}
    header = [normalize(h) for h in rows[0]]
    name_idx = next((i for i, h in enumerate(header) if h in CAMPAIGN_NAME_CANDIDATES), None)
    spend_idx = next((i for i, h in enumerate(header) if h in CAMPAIGN_SPEND_CANDIDATES), None)
    if name_idx is None or spend_idx is None:
        raise HTTPException(400, "No se encontraron columnas de campaña/gasto en el CSV")
    result: dict = {}
    for row in rows[1:]:
        if len(row) <= max(name_idx, spend_idx):
            continue
        name = (row[name_idx] or "").strip()
        if not name:
            continue
        result[name] = result.get(name, 0.0) + parse_money(row[spend_idx])
    # Skip old/inactive campaigns that spent nothing — nothing to reconcile against a product.
    return {name: spend for name, spend in result.items() if spend > 0}


REGION_NAME_CANDIDATES = [
    "REGION", "REGION DE ENTREGA", "UBICACION", "ESTADO/PROVINCIA/REGION",
    "ESTADO/REGION", "PROVINCIA", "REGION (ENTREGA)", "DEPARTAMENTO",
]

def parse_region_csv(content: bytes) -> dict:
    """Returns {region_name: spend} parsed from a Meta/TikTok ads export CSV
    broken down by Region (Meta's "By Delivery > Region" breakdown)."""
    text = content.decode('utf-8-sig', errors='ignore')
    sample = text[:2048]
    delimiter = ';' if sample.count(';') > sample.count(',') else ','
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not rows:
        return {}
    header = [normalize(h) for h in rows[0]]
    name_idx = next((i for i, h in enumerate(header) if h in REGION_NAME_CANDIDATES), None)
    spend_idx = next((i for i, h in enumerate(header) if h in CAMPAIGN_SPEND_CANDIDATES), None)
    # Meta's region-breakdown export is often just two columns (Region, Amount spent) —
    # fall back to the first column as the region name if we couldn't recognize the header.
    if name_idx is None and spend_idx is not None and len(header) == 2:
        name_idx = 1 - spend_idx
    if name_idx is None or spend_idx is None:
        raise HTTPException(400, "No se encontraron columnas de región/gasto en el CSV")
    result: dict = {}
    for row in rows[1:]:
        if len(row) <= max(name_idx, spend_idx):
            continue
        name = (row[name_idx] or "").strip()
        if not name:
            continue
        result[name] = result.get(name, 0.0) + parse_money(row[spend_idx])
    return {name: spend for name, spend in result.items() if spend > 0}

# Colombia's 32 departments + Bogotá D.C., in Dropi's naming style (no accents, uppercase) —
# used as a fallback so every region can be manually assigned even if this store never
# shipped an order there (so its real name never appeared in orders.departamento_destino).
COLOMBIA_DEPARTMENTS = [
    "AMAZONAS", "ANTIOQUIA", "ARAUCA", "ATLANTICO", "BOGOTA D.C.", "BOLIVAR", "BOYACA",
    "CALDAS", "CAQUETA", "CASANARE", "CAUCA", "CESAR", "CHOCO", "CORDOBA", "CUNDINAMARCA",
    "GUAINIA", "GUAVIARE", "HUILA", "LA GUAJIRA", "MAGDALENA", "META", "NARIÑO",
    "NORTE DE SANTANDER", "PUTUMAYO", "QUINDIO", "RISARALDA", "SAN ANDRES Y PROVIDENCIA",
    "SANTANDER", "SUCRE", "TOLIMA", "VALLE", "VAUPES", "VICHADA",
]

# Common Meta/TikTok Colombia region labels that don't literally say the department name.
REGION_SYNONYMS = {
    "DISTRITO ESPECIAL": "BOGOTA D.C.",
    "DISTRITO CAPITAL": "BOGOTA D.C.",
    "BOGOTA DC": "BOGOTA D.C.",
    "BOGOTA D C": "BOGOTA D.C.",
    "VALLE DEL CAUCA": "VALLE",
    "NARINO": "NARIÑO",
}

def resolve_department(conn, store_id: int, region_raw: str):
    """Matches a raw Meta/TikTok region name to one of this store's real Dropi
    departamento_destino values — first via a manual alias, then via a normalized
    exact/substring match against every department this store has ever shipped to
    (across all periods). Returns None if nothing matches (needs a manual alias)."""
    key = (region_raw or "").strip().upper()
    alias = conn.execute(
        "SELECT departamento FROM region_aliases WHERE store_id=? AND region_raw=?",
        (store_id, key)
    ).fetchone()
    if alias:
        return alias["departamento"]

    norm = normalize(region_raw)
    norm = normalize(REGION_SYNONYMS.get(norm, norm))

    depts = conn.execute(
        "SELECT DISTINCT departamento_destino FROM orders WHERE store_id=? AND departamento_destino != ''",
        (store_id,)
    ).fetchall()
    dept_names = [d["departamento_destino"] for d in depts]

    # Exact match first (avoids "SANTANDER" swallowing "NORTE DE SANTANDER").
    for dept in dept_names:
        if normalize(dept) == norm:
            return dept
    # Then substring match, longest department name first — same reason.
    for dept in sorted(dept_names, key=lambda d: -len(d)):
        dn = normalize(dept)
        if dn in norm or norm in dn:
            return dept
    return None

@app.get("/api/departments/all")
def get_all_departments(store_id: int):
    """All departments selectable for manual region→department mapping: every
    department this store has ever shipped to, plus the standard Colombia list."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT departamento_destino FROM orders WHERE store_id=? AND departamento_destino != ''",
            (store_id,)
        ).fetchall()
    seen = {normalize(r["departamento_destino"]): r["departamento_destino"] for r in rows}
    for d in COLOMBIA_DEPARTMENTS:
        seen.setdefault(normalize(d), d)
    return sorted(seen.values())

@app.post("/api/ad-spend/upload")
async def upload_ad_spend(
    file: UploadFile = File(...),
    period_id: int = Form(...),
    store_id: int = Form(...),
    platform: str = Form(...),
    account_label: str = Form(""),
):
    """Single-CSV upload: if the export has both a Campaign name AND a Region
    breakdown column (Meta/TikTok let you add multiple breakdowns to one report),
    this populates campaign-level AND department-level ad spend from the same file."""
    content = await file.read()
    check_upload_size(content)
    text = content.decode('utf-8-sig', errors='ignore')
    sample = text[:2048]
    delimiter = ';' if sample.count(';') > sample.count(',') else ','
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not rows:
        raise HTTPException(400, "El CSV está vacío")
    header = [normalize(h) for h in rows[0]]
    name_idx = next((i for i, h in enumerate(header) if h in CAMPAIGN_NAME_CANDIDATES), None)
    region_idx = next((i for i, h in enumerate(header) if h in REGION_NAME_CANDIDATES), None)
    spend_idx = next((i for i, h in enumerate(header) if h in CAMPAIGN_SPEND_CANDIDATES), None)
    if region_idx is None and spend_idx is not None and name_idx is None and len(header) == 2:
        region_idx = 1 - spend_idx
    if spend_idx is None:
        raise HTTPException(400, "No se encontró la columna de gasto en el CSV")
    if name_idx is None and region_idx is None:
        raise HTTPException(400, "El CSV debe tener una columna de Campaña y/o de Región")

    campaigns: dict = {}
    regions: dict = {}
    pairs: dict = {}  # (campaign_name, region_raw) -> spend — only when BOTH columns present
    needed = [i for i in (name_idx, region_idx, spend_idx) if i is not None]
    for row in rows[1:]:
        if len(row) <= max(needed):
            continue
        spend = parse_money(row[spend_idx])
        cname = (row[name_idx] or "").strip() if name_idx is not None else None
        rname = (row[region_idx] or "").strip() if region_idx is not None else None
        if cname:
            campaigns[cname] = campaigns.get(cname, 0.0) + spend
        if rname:
            regions[rname] = regions.get(rname, 0.0) + spend
        if cname and rname:
            key = (cname, rname)
            pairs[key] = pairs.get(key, 0.0) + spend
    campaigns = {k: v for k, v in campaigns.items() if v > 0}
    regions = {k: v for k, v in regions.items() if v > 0}
    pairs = {k: v for k, v in pairs.items() if v > 0}
    if not campaigns and not regions:
        raise HTTPException(400, "El CSV no contiene campañas ni regiones con gasto")

    with get_db() as conn:
        for name, spend in campaigns.items():
            # A brand-new campaign row defaults to whatever product this exact campaign
            # name was mapped to in a previous month, if any — the ON CONFLICT branch
            # below never touches `producto`, so an existing per-period mapping (or an
            # explicit unmap) this month is never overwritten by this.
            remembered = get_remembered_producto(conn, store_id, platform, name)
            conn.execute("""
                INSERT INTO ad_campaigns (period_id, store_id, platform, account_label, campaign_name, spend, producto)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(period_id, store_id, platform, account_label, campaign_name)
                DO UPDATE SET spend=excluded.spend
            """, (period_id, store_id, platform.upper(), account_label.strip(), name, spend, remembered))
        for name, spend in regions.items():
            conn.execute("""
                INSERT INTO ad_region_spend (period_id, store_id, platform, account_label, region_raw, spend)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(period_id, store_id, platform, account_label, region_raw)
                DO UPDATE SET spend=excluded.spend
            """, (period_id, store_id, platform.upper(), account_label.strip(), name, spend))
        # Keep the campaign×region combination too — this is what lets us later answer
        # "did product X make or lose money in department Y" once the campaign is mapped to a product.
        for (cname, rname), spend in pairs.items():
            conn.execute("""
                INSERT INTO ad_campaign_region_spend (period_id, store_id, platform, account_label, campaign_name, region_raw, spend)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(period_id, store_id, platform, account_label, campaign_name, region_raw)
                DO UPDATE SET spend=excluded.spend
            """, (period_id, store_id, platform.upper(), account_label.strip(), cname, rname, spend))

    return {"ok": True, "campaigns_imported": len(campaigns), "regions_imported": len(regions)}

@app.delete("/api/ad-spend/clear")
def clear_ad_spend(period_id: int, store_id: int, platform: str, account_label: str = ""):
    """Removes an uploaded batch (both campaign-level and region-level rows) for
    this platform + account, so a mistaken/old CSV can be fully removed and re-uploaded."""
    label = account_label.strip()
    plat = platform.upper()
    with get_db() as conn:
        c1 = conn.execute(
            "DELETE FROM ad_campaigns WHERE period_id=? AND store_id=? AND platform=? AND account_label=?",
            (period_id, store_id, plat, label)
        ).rowcount
        c2 = conn.execute(
            "DELETE FROM ad_region_spend WHERE period_id=? AND store_id=? AND platform=? AND account_label=?",
            (period_id, store_id, plat, label)
        ).rowcount
        conn.execute(
            "DELETE FROM ad_campaign_region_spend WHERE period_id=? AND store_id=? AND platform=? AND account_label=?",
            (period_id, store_id, plat, label)
        )
    return {"ok": True, "deleted_campaigns": c1, "deleted_regions": c2}

@app.get("/api/ad-spend/batches")
def get_ad_spend_batches(period_id: int, store_id: int):
    """Lists each uploaded platform+account batch with its totals, so the UI can
    show a per-batch summary and an 'eliminar carga' button."""
    with get_db() as conn:
        camp_rows = conn.execute("""
            SELECT platform, account_label, COUNT(*) as n, SUM(spend) as total
            FROM ad_campaigns WHERE period_id=? AND store_id=? GROUP BY platform, account_label
        """, (period_id, store_id)).fetchall()
        region_rows = conn.execute("""
            SELECT platform, account_label, COUNT(*) as n, SUM(spend) as total
            FROM ad_region_spend WHERE period_id=? AND store_id=? GROUP BY platform, account_label
        """, (period_id, store_id)).fetchall()
    batches: dict = {}
    for r in camp_rows:
        key = (r["platform"], r["account_label"])
        b = batches.setdefault(key, {"platform": r["platform"], "account_label": r["account_label"],
                                      "campaigns": 0, "campaigns_spend": 0.0, "regions": 0, "regions_spend": 0.0})
        b["campaigns"] = r["n"]
        b["campaigns_spend"] = r["total"] or 0.0
    for r in region_rows:
        key = (r["platform"], r["account_label"])
        b = batches.setdefault(key, {"platform": r["platform"], "account_label": r["account_label"],
                                      "campaigns": 0, "campaigns_spend": 0.0, "regions": 0, "regions_spend": 0.0})
        b["regions"] = r["n"]
        b["regions_spend"] = r["total"] or 0.0
    return sorted(batches.values(), key=lambda b: (b["platform"], b["account_label"]))

@app.post("/api/ad-region-spend/upload")
async def upload_ad_region_spend(
    file: UploadFile = File(...),
    period_id: int = Form(...),
    store_id: int = Form(...),
    platform: str = Form(...),
    account_label: str = Form(""),
):
    content = await file.read()
    check_upload_size(content)
    regions = parse_region_csv(content)
    if not regions:
        raise HTTPException(400, "El CSV no contiene regiones válidas")
    with get_db() as conn:
        for name, spend in regions.items():
            conn.execute("""
                INSERT INTO ad_region_spend (period_id, store_id, platform, account_label, region_raw, spend)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(period_id, store_id, platform, account_label, region_raw)
                DO UPDATE SET spend=excluded.spend
            """, (period_id, store_id, platform.upper(), account_label.strip(), name, spend))
    return {"ok": True, "imported": len(regions)}

@app.get("/api/ad-region-spend")
def get_ad_region_spend(period_id: int, store_id: int):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, platform, account_label, region_raw, spend
            FROM ad_region_spend WHERE period_id=? AND store_id=?
            ORDER BY platform, account_label, spend DESC
        """, (period_id, store_id)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["departamento"] = resolve_department(conn, store_id, r["region_raw"])
            result.append(d)
    return result

@app.delete("/api/ad-region-spend/clear")
def clear_ad_region_spend(period_id: int, store_id: int, platform: str, account_label: str = ""):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM ad_region_spend WHERE period_id=? AND store_id=? AND platform=? AND account_label=?",
            (period_id, store_id, platform.upper(), account_label.strip())
        )
    return {"ok": True}

@app.delete("/api/ad-region-spend/{row_id}")
def delete_ad_region_spend(row_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM ad_region_spend WHERE id=?", (row_id,))
    return {"ok": True}


# ── REGION ALIASES (manual "this Meta region = this Dropi departamento" fixes) ─

@app.get("/api/region-aliases")
def get_region_aliases(store_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, region_raw, departamento FROM region_aliases WHERE store_id=? ORDER BY departamento",
            (store_id,)
        ).fetchall()
    return rows_to_list(rows)

@app.post("/api/region-aliases")
def create_region_alias(body: dict):
    store_id = int(body["store_id"])
    region_raw = (body.get("region_raw") or "").strip().upper()
    departamento = (body.get("departamento") or "").strip()
    if not region_raw or not departamento:
        raise HTTPException(400, "Faltan datos para asignar la región")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO region_aliases (store_id, region_raw, departamento)
            VALUES (?,?,?)
            ON CONFLICT(store_id, region_raw) DO UPDATE SET departamento=excluded.departamento
        """, (store_id, region_raw, departamento))
    return {"ok": True}

@app.delete("/api/region-aliases/{alias_id}")
def delete_region_alias(alias_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM region_aliases WHERE id=?", (alias_id,))
    return {"ok": True}


@app.get("/api/geo-profitability")
def geo_profitability(period_id: int, store_id: int):
    """Per-department P&L: ingreso neto (ganancia entregado - costo devolución, i.e.
    ya después de devoluciones) cruzado con el gasto publicitario por región/departamento."""
    with get_db() as conn:
        dept_rows = conn.execute("""
            SELECT departamento_destino,
                   COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN ganancia ELSE 0 END) as ingreso,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN costo_devolucion_flete ELSE 0 END) as costo_devolucion
            FROM orders WHERE period_id=? AND store_id=? AND departamento_destino != ''
            GROUP BY departamento_destino
        """, (period_id, store_id)).fetchall()

        region_rows = conn.execute(
            "SELECT region_raw, spend FROM ad_region_spend WHERE period_id=? AND store_id=?",
            (period_id, store_id)
        ).fetchall()

        ad_spend_by_dept: dict = {}
        unmatched = []
        for r in region_rows:
            dept = resolve_department(conn, store_id, r["region_raw"])
            if dept:
                ad_spend_by_dept[dept] = ad_spend_by_dept.get(dept, 0.0) + r["spend"]
            else:
                unmatched.append({"region_raw": r["region_raw"], "spend": r["spend"]})

    departments = []
    seen_depts = set()
    for r in dept_rows:
        dept = r["departamento_destino"]
        seen_depts.add(dept)
        ingreso_neto = (r["ingreso"] or 0) - (r["costo_devolucion"] or 0)
        ad_spend = ad_spend_by_dept.get(dept, 0.0)
        departments.append({
            "departamento": dept,
            "total": r["total"],
            "entregados": r["entregados"] or 0,
            "devoluciones": r["devoluciones"] or 0,
            "ingreso_neto": round(ingreso_neto, 2),
            "ad_spend": round(ad_spend, 2),
            "resultado_neto": round(ingreso_neto - ad_spend, 2),
        })
    # Departments that got ad spend but had zero orders this period would otherwise
    # vanish from the report — show them too (pure loss: money spent, nothing delivered).
    for dept, ad_spend in ad_spend_by_dept.items():
        if dept not in seen_depts:
            departments.append({
                "departamento": dept, "total": 0, "entregados": 0, "devoluciones": 0,
                "ingreso_neto": 0.0, "ad_spend": round(ad_spend, 2), "resultado_neto": round(-ad_spend, 2),
            })
    departments.sort(key=lambda x: -x["resultado_neto"])

    return {"departamentos": departments, "unmatched_regions": unmatched}


@app.get("/api/trends")
def trends(store_id: int, period_ids: str, dimension: str = "producto"):
    """Per-{producto|departamento|transportadora} performance across several months, so you
    can spot something like 'this product/department/carrier was doing fine in January but
    fell off by March' at a glance — one series per value, one data point per selected month."""
    pids = [int(x) for x in period_ids.split(",") if x.strip()]
    if not pids:
        raise HTTPException(400, "No period_ids provided")
    if dimension not in ("producto", "departamento", "transportadora"):
        raise HTTPException(400, "dimension debe ser producto, departamento o transportadora")

    with get_db() as conn:
        placeholders = ",".join("?" for _ in pids)
        periods_info = rows_to_list(conn.execute(f"""
            SELECT id, year, month FROM periods WHERE id IN ({placeholders}) AND store_id=?
            ORDER BY year, month
        """, pids + [store_id]).fetchall())
        ordered_pids = [p["id"] for p in periods_info]

        series: dict = {}

        if dimension == "producto":
            for pid in ordered_pids:
                rows = conn.execute("""
                    SELECT producto, COUNT(*) as total,
                           SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                           SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones
                    FROM product_orders WHERE period_id=? AND store_id=?
                    GROUP BY producto
                """, (pid, store_id)).fetchall()
                grouped_this_period: dict = {}
                for r in rows:
                    key, label = resolve_group(conn, store_id, r["producto"])
                    g = grouped_this_period.setdefault(key, {"label": label, "total": 0, "entregados": 0, "devoluciones": 0, "ganancia": 0.0})
                    g["total"] += r["total"] or 0
                    g["entregados"] += r["entregados"] or 0
                    g["devoluciones"] += r["devoluciones"] or 0
                # Real per-order ganancia MINUS real ad spend per product — same "resultado neto"
                # formula as Productos → Rentabilidad, so the two pages always agree.
                alloc_rows, _, _ = allocate_product_financials(conn, pid, store_id)
                for r in alloc_rows:
                    key, _ = resolve_group(conn, store_id, r["producto"])
                    if key in grouped_this_period:
                        grouped_this_period[key]["ganancia"] += r["ingreso"] - r["costo_devolucion"]
                ad_spend_rows = conn.execute("""
                    SELECT producto, SUM(spend) as ad_spend
                    FROM ad_campaigns WHERE period_id=? AND store_id=? AND producto IS NOT NULL
                    GROUP BY producto
                """, (pid, store_id)).fetchall()
                for r in ad_spend_rows:
                    if r["producto"] in grouped_this_period:
                        grouped_this_period[r["producto"]]["ganancia"] -= r["ad_spend"] or 0
                for key, g in grouped_this_period.items():
                    s = series.setdefault(key, {"label": g["label"], "by_period": {}})
                    s["by_period"][pid] = {"total": g["total"], "entregados": g["entregados"], "devoluciones": g["devoluciones"], "ganancia": round(g["ganancia"], 2)}
        else:
            field = "departamento_destino" if dimension == "departamento" else "transportadora"
            for pid in ordered_pids:
                rows = conn.execute(f"""
                    SELECT {field} as key_val, COUNT(*) as total,
                           SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                           SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones,
                           SUM(CASE WHEN estatus='ENTREGADO' THEN ganancia ELSE 0 END) as ganancia
                    FROM orders WHERE period_id=? AND store_id=? AND {field} != ''
                    GROUP BY {field}
                """, (pid, store_id)).fetchall()
                for r in rows:
                    key = r["key_val"]
                    s = series.setdefault(key, {"label": key, "by_period": {}})
                    s["by_period"][pid] = {
                        "total": r["total"], "entregados": r["entregados"] or 0,
                        "devoluciones": r["devoluciones"] or 0, "ganancia": round(r["ganancia"] or 0, 2),
                    }

    result_series = []
    for key, s in series.items():
        total_overall = sum(bp["total"] for bp in s["by_period"].values())
        total_ganancia = sum((bp["ganancia"] or 0) for bp in s["by_period"].values())
        by_period_list = []
        for p in periods_info:
            bp = s["by_period"].get(p["id"])
            total = bp["total"] if bp else 0
            entregados = bp["entregados"] if bp else 0
            pct = round((entregados / total) * 100, 1) if total else None
            by_period_list.append({
                "period_id": p["id"], "year": p["year"], "month": p["month"],
                "total": total, "entregados": entregados,
                "devoluciones": bp["devoluciones"] if bp else 0,
                "ganancia": bp["ganancia"] if bp else None,
                "pct_entrega": pct,
            })
        # "Envío Prioritario"-style phantom upsell lines always net to $0 ganancia now (see
        # allocate_product_financials — the real product in the same order absorbs it all),
        # so there's nothing useful to show for them: drop them entirely. Standalone box/
        # packaging line items ("Caja ...") DO carry a real cost/value, so they're kept —
        # just pushed to the bottom of the ranking instead of mixed in with the catalog.
        # normalize() strips accents first — "ENVÍO" (with tilde) must match too.
        key_normalized = normalize(key)
        if dimension == "producto" and "ENVIO" in key_normalized:
            continue
        # A single order in the whole selected interval isn't a trend — it's noise (often a
        # one-off test, a mistyped product, or an item that isn't really part of the catalog).
        if dimension == "producto" and total_overall < 2:
            continue
        is_shipping_or_box = dimension == "producto" and key_normalized.startswith("CAJA")
        result_series.append({
            "key": key, "label": s["label"], "total_overall": total_overall,
            "total_ganancia": round(total_ganancia, 2), "by_period": by_period_list,
            "is_shipping_or_box": is_shipping_or_box,
        })

    # Ranked by total ganancia — the most/least profitable items matter more than raw volume —
    # with box line items always sorted after every real product.
    result_series.sort(key=lambda x: (x["is_shipping_or_box"], -x["total_ganancia"]))
    return {"periods": periods_info, "series": result_series}


@app.post("/api/ad-campaigns/upload")
async def upload_ad_campaigns(
    file: UploadFile = File(...),
    period_id: int = Form(...),
    store_id: int = Form(...),
    platform: str = Form(...),
    account_label: str = Form(""),
):
    content = await file.read()
    check_upload_size(content)
    campaigns = parse_campaign_csv(content)
    if not campaigns:
        raise HTTPException(400, "El CSV no contiene campañas válidas")

    with get_db() as conn:
        for name, spend in campaigns.items():
            remembered = get_remembered_producto(conn, store_id, platform, name)
            conn.execute("""
                INSERT INTO ad_campaigns (period_id, store_id, platform, account_label, campaign_name, spend, producto)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(period_id, store_id, platform, account_label, campaign_name)
                DO UPDATE SET spend=excluded.spend
            """, (period_id, store_id, platform.upper(), account_label.strip(), name, spend, remembered))
    return {"ok": True, "imported": len(campaigns)}

@app.get("/api/ad-campaigns")
def get_ad_campaigns(period_id: int, store_id: int):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, platform, account_label, campaign_name, spend, producto
            FROM ad_campaigns WHERE period_id=? AND store_id=?
            ORDER BY platform, account_label, spend DESC
        """, (period_id, store_id)).fetchall()
    return rows_to_list(rows)

@app.delete("/api/ad-campaigns/clear")
def clear_ad_campaigns(period_id: int, store_id: int, platform: str, account_label: str = ""):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM ad_campaigns WHERE period_id=? AND store_id=? AND platform=? AND account_label=?",
            (period_id, store_id, platform.upper(), account_label.strip())
        )
    return {"ok": True}

@app.patch("/api/ad-campaigns/{campaign_id}")
def map_ad_campaign(campaign_id: int, body: dict):
    # `producto` here is already the resolved group key sent by the mapping dropdown
    # (see /api/product-orders/groups) — no need to re-derive it.
    producto = (body.get("producto") or "").strip().upper() or None
    with get_db() as conn:
        conn.execute("UPDATE ad_campaigns SET producto=? WHERE id=?", (producto, campaign_id))
        # Remember this campaign→product mapping (or forget it, if unmapped) for this
        # store, so next month's upload of the same recurring campaign auto-applies it.
        row = conn.execute("SELECT store_id, platform, campaign_name FROM ad_campaigns WHERE id=?", (campaign_id,)).fetchone()
        if row:
            remember_campaign_producto(conn, row["store_id"], row["platform"], row["campaign_name"], producto)
    return {"ok": True}


# ── PRODUCT ALIASES (manual "these are the same product" merges) ──────────────

@app.get("/api/product-aliases")
def get_product_aliases(store_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, raw_key, canonical_key, canonical_label FROM product_aliases WHERE store_id=? ORDER BY canonical_label",
            (store_id,)
        ).fetchall()
    return rows_to_list(rows)

@app.post("/api/product-aliases")
def create_product_alias(body: dict):
    store_id = int(body["store_id"])
    from_key = (body.get("from_key") or "").strip().upper()
    into_key = (body.get("into_key") or "").strip().upper()
    into_label = (body.get("into_label") or "").strip()
    if not from_key or not into_key or not into_label:
        raise HTTPException(400, "Faltan datos para fusionar los productos")
    if from_key == into_key:
        raise HTTPException(400, "Selecciona dos productos distintos para fusionar")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO product_aliases (store_id, raw_key, canonical_key, canonical_label)
            VALUES (?,?,?,?)
            ON CONFLICT(store_id, raw_key) DO UPDATE SET canonical_key=excluded.canonical_key, canonical_label=excluded.canonical_label
        """, (store_id, from_key, into_key, into_label))
        # Re-point any campaign already mapped to the old (now-merged) group onto the target group.
        conn.execute(
            "UPDATE ad_campaigns SET producto=? WHERE store_id=? AND producto=?",
            (into_key, store_id, from_key)
        )
    return {"ok": True}

@app.delete("/api/product-aliases/{alias_id}")
def delete_product_alias(alias_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM product_aliases WHERE id=?", (alias_id,))
    return {"ok": True}


# ── PRODUCT LINES (e.g. "Hombre" vs "Dama" within the same store) ─────────────
# Only non-default rows are stored — a product with no row here is "HOMBRE" by
# default (set up for Zindra, where most of the catalog is menswear and only a
# handful of products need to be flagged as the smaller "Dama" line).

@app.get("/api/product-lines")
def get_product_lines(store_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT canonical_key, line FROM product_lines WHERE store_id=?",
            (store_id,)
        ).fetchall()
    return rows_to_list(rows)

@app.post("/api/product-lines")
def set_product_line(body: dict):
    store_id = int(body["store_id"])
    canonical_key = (body.get("canonical_key") or "").strip().upper()
    line = (body.get("line") or "HOMBRE").strip().upper()
    if not canonical_key:
        raise HTTPException(400, "Falta el producto")
    with get_db() as conn:
        if line == "HOMBRE":
            # HOMBRE is the default — just clear any override instead of storing it.
            conn.execute("DELETE FROM product_lines WHERE store_id=? AND canonical_key=?", (store_id, canonical_key))
        else:
            conn.execute("""
                INSERT INTO product_lines (store_id, canonical_key, line)
                VALUES (?,?,?)
                ON CONFLICT(store_id, canonical_key) DO UPDATE SET line=excluded.line
            """, (store_id, canonical_key, line))
    return {"ok": True}

@app.delete("/api/ad-campaigns/{campaign_id}")
def delete_ad_campaign(campaign_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM ad_campaigns WHERE id=?", (campaign_id,))
    return {"ok": True}


@app.get("/api/accumulated-summary")
def accumulated_summary(store_id: int, period_ids: str):
    pids = [int(x) for x in period_ids.split(",") if x.strip()]
    if not pids:
        raise HTTPException(400, "No period_ids provided")
    placeholders = ",".join("?" for _ in pids)
    params = pids + [store_id]

    with get_db() as conn:
        entregado = conn.execute(f"""
            SELECT COALESCE(SUM(ganancia),0) as total, COUNT(*) as count
            FROM orders WHERE period_id IN ({placeholders}) AND store_id=? AND estatus='ENTREGADO'
        """, params).fetchone()

        devolucion = conn.execute(f"""
            SELECT COALESCE(SUM(costo_devolucion_flete),0) as total, COUNT(*) as count
            FROM orders WHERE period_id IN ({placeholders}) AND store_id=? AND estatus='DEVOLUCION'
        """, params).fetchone()

        total_orders = conn.execute(f"""
            SELECT COUNT(*) as count FROM orders WHERE period_id IN ({placeholders}) AND store_id=?
        """, params).fetchone()

        en_proceso = conn.execute(f"""
            SELECT COUNT(*) as count,
                   COALESCE(SUM(CASE WHEN UPPER(transportadora) IN ('INTERRAPIDISIMO','INTERRAPIDÍSIMO','IR')
                       THEN precio_flete ELSE precio_flete * 0.8 END), 0) as costo_estimado
            FROM orders WHERE period_id IN ({placeholders}) AND store_id=? AND estatus NOT IN ('ENTREGADO','DEVOLUCION')
        """, params).fetchone()

        # Incomes aggregated by category
        incomes = conn.execute(f"""
            SELECT c.id as category_id, c.name, COALESCE(SUM(e.amount),0) as amount
            FROM income_categories c
            LEFT JOIN income_entries e ON c.id=e.category_id AND e.period_id IN ({placeholders}) AND e.store_id=?
            WHERE c.active=1 GROUP BY c.id, c.name ORDER BY c.sort_order, c.id
        """, params).fetchall()

        # Ad investments aggregated
        ads = conn.execute(f"""
            SELECT a.id as ad_account_id, a.name, a.platform, COALESCE(SUM(ai.amount),0) as amount
            FROM ad_accounts a
            LEFT JOIN ad_investments ai ON a.id=ai.ad_account_id AND ai.period_id IN ({placeholders}) AND ai.store_id=?
            WHERE a.active=1 GROUP BY a.id, a.name, a.platform ORDER BY a.sort_order, a.id
        """, params).fetchall()

        # Expenses aggregated
        expenses = conn.execute(f"""
            SELECT c.id as category_id, c.name, COALESCE(SUM(e.amount),0) as amount
            FROM expense_categories c
            LEFT JOIN expenses e ON c.id=e.category_id AND e.period_id IN ({placeholders}) AND e.store_id=?
            WHERE c.active=1 GROUP BY c.id, c.name ORDER BY c.sort_order, c.id
        """, params).fetchall()

        # Period details for display
        periods_info = conn.execute(f"""
            SELECT id, year, month, COALESCE(total_pedidos,0) as total_pedidos
            FROM periods WHERE id IN ({placeholders}) AND store_id=?
            ORDER BY year, month
        """, params).fetchall()

        # Per-period breakdown, for the month-to-month comparison chart in Acumulado.
        # Ad spend prefers the real campaign-CSV total over manual ad_investments entries,
        # same fallback rule used in the monthly Resumen.
        by_period = []
        for p in sorted(periods_info, key=lambda r: (r["year"], r["month"])):
            pid = p["id"]
            e = conn.execute(
                "SELECT COALESCE(SUM(ganancia),0) as total FROM orders WHERE period_id=? AND store_id=? AND estatus='ENTREGADO'",
                (pid, store_id)
            ).fetchone()
            d = conn.execute(
                "SELECT COALESCE(SUM(costo_devolucion_flete),0) as total FROM orders WHERE period_id=? AND store_id=? AND estatus='DEVOLUCION'",
                (pid, store_id)
            ).fetchone()
            ep = conn.execute("""
                SELECT COALESCE(SUM(CASE WHEN UPPER(transportadora) IN ('INTERRAPIDISIMO','INTERRAPIDÍSIMO','IR')
                    THEN precio_flete ELSE precio_flete * 0.8 END), 0) as costo
                FROM orders WHERE period_id=? AND store_id=? AND estatus NOT IN ('ENTREGADO','DEVOLUCION')
            """, (pid, store_id)).fetchone()
            inc = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM income_entries WHERE period_id=? AND store_id=?",
                (pid, store_id)
            ).fetchone()
            campaign_spend = conn.execute(
                "SELECT COALESCE(SUM(spend),0) as total FROM ad_campaigns WHERE period_id=? AND store_id=?",
                (pid, store_id)
            ).fetchone()["total"]
            manual_spend = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM ad_investments WHERE period_id=? AND store_id=?",
                (pid, store_id)
            ).fetchone()["total"]
            ad_spend = campaign_spend if campaign_spend > 0 else manual_spend
            gastos = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE period_id=? AND store_id=?",
                (pid, store_id)
            ).fetchone()["total"]
            devolucion_total = d["total"] + ep["costo"]
            ganancia = e["total"] + inc["total"] - devolucion_total - ad_spend - gastos
            by_period.append({
                "period_id": pid, "year": p["year"], "month": p["month"],
                "entregado": e["total"], "otros_ingresos": inc["total"], "devolucion": devolucion_total,
                "ad_spend": ad_spend, "gastos": gastos, "ganancia": ganancia,
            })

    return {
        "entregado": dict(entregado),
        "devolucion": dict(devolucion),
        "total_orders": total_orders["count"],
        "en_proceso": {"count": en_proceso["count"], "costo_estimado": en_proceso["costo_estimado"]},
        "incomes": rows_to_list(incomes),
        "ads": rows_to_list(ads),
        # Real total publicidad: prefers each period's campaign-CSV spend over its manual
        # ad_investments entries (same fallback rule as the monthly Resumen) — summing "ads"
        # directly would undercount any period that switched to CSV campaign uploads.
        "ad_spend_total": sum(p["ad_spend"] for p in by_period),
        "expenses": rows_to_list(expenses),
        "periods": rows_to_list(periods_info),
        "by_period": by_period,
    }

@app.get("/api/periods/by-store")
def get_periods_by_store(store_id: int):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, year, month FROM periods WHERE store_id=? ORDER BY year DESC, month DESC",
            (store_id,)
        ).fetchall()
    return rows_to_list(rows)

# ── RECOMMENDATIONS (actionable insights synthesized from data already in the app) ─

@app.get("/api/recommendations")
def recommendations(period_id: int, store_id: int, min_orders: int = 5):
    """Turns the numbers already computed elsewhere (product P&L, geo P&L, carrier
    performance) into concrete operational calls: which products to pause or scale,
    which departments to exclude or target, which carrier to avoid or prefer per zone."""
    with get_db() as conn:
        alloc_rows, _, _ = allocate_product_financials(conn, period_id, store_id)

        # ── Per-product P&L (same money as Products → Rentabilidad) ──
        prod_fin: dict = {}
        for r in alloc_rows:
            key, label = resolve_group(conn, store_id, r["producto"])
            g = prod_fin.setdefault(key, {"label": label, "ingreso": 0.0, "costo_dev": 0.0, "pedidos": 0})
            g["ingreso"] += r["ingreso"]
            g["costo_dev"] += r["costo_devolucion"]
            g["pedidos"] += 1
        ad_spend_by_product = {
            r["producto"]: r["s"] for r in conn.execute(
                "SELECT producto, SUM(spend) as s FROM ad_campaigns WHERE period_id=? AND store_id=? AND producto IS NOT NULL GROUP BY producto",
                (period_id, store_id)
            ).fetchall()
        }
        products = []
        for key, g in prod_fin.items():
            ad_spend = ad_spend_by_product.get(key, 0.0)
            resultado = g["ingreso"] - g["costo_dev"] - ad_spend
            products.append({
                "producto": g["label"], "grupo": key, "pedidos": g["pedidos"],
                "ingreso": round(g["ingreso"], 2), "ad_spend": round(ad_spend, 2),
                "resultado_neto": round(resultado, 2),
            })

        productos_apagar = sorted(
            [p for p in products if p["pedidos"] >= min_orders and p["resultado_neto"] < 0],
            key=lambda p: p["resultado_neto"]
        )[:10]
        productos_escalar = sorted(
            [p for p in products if p["pedidos"] >= min_orders and p["resultado_neto"] > 0 and p["ad_spend"] > 0],
            key=lambda p: -p["resultado_neto"]
        )[:10]

        # ── Per-department P&L (same money as Geografía → Rentabilidad) ──
        dept_rows = conn.execute("""
            SELECT departamento_destino, COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN ganancia ELSE 0 END) as ingreso,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN costo_devolucion_flete ELSE 0 END) as costo_devolucion
            FROM orders WHERE period_id=? AND store_id=? AND departamento_destino != ''
            GROUP BY departamento_destino
        """, (period_id, store_id)).fetchall()
        region_rows = conn.execute(
            "SELECT region_raw, spend FROM ad_region_spend WHERE period_id=? AND store_id=?",
            (period_id, store_id)
        ).fetchall()
        ad_spend_by_dept: dict = {}
        for r in region_rows:
            dept = resolve_department(conn, store_id, r["region_raw"])
            if dept:
                ad_spend_by_dept[dept] = ad_spend_by_dept.get(dept, 0.0) + r["spend"]

        departamentos = []
        for r in dept_rows:
            dept = r["departamento_destino"]
            ingreso_neto = (r["ingreso"] or 0) - (r["costo_devolucion"] or 0)
            ad_spend = ad_spend_by_dept.get(dept, 0.0)
            departamentos.append({
                "departamento": dept, "pedidos": r["total"],
                "resultado_neto": round(ingreso_neto - ad_spend, 2), "ad_spend": round(ad_spend, 2),
            })
        departamentos_excluir = sorted(
            [d for d in departamentos if d["pedidos"] >= min_orders and d["resultado_neto"] < 0],
            key=lambda d: d["resultado_neto"]
        )[:10]

        # ── Producto × Departamento ganador (requires a combined Campaign+Region CSV so
        # we actually know which product's ad spend landed in which department) ──
        cr_rows = conn.execute("""
            SELECT ac.producto, acr.region_raw, acr.spend
            FROM ad_campaign_region_spend acr
            JOIN ad_campaigns ac
              ON ac.period_id=acr.period_id AND ac.store_id=acr.store_id
             AND ac.platform=acr.platform AND ac.account_label=acr.account_label
             AND ac.campaign_name=acr.campaign_name
            WHERE acr.period_id=? AND acr.store_id=? AND ac.producto IS NOT NULL
        """, (period_id, store_id)).fetchall()
        ad_spend_by_product_dept: dict = {}
        for r in cr_rows:
            dept = resolve_department(conn, store_id, r["region_raw"])
            if dept:
                k = (r["producto"], dept)
                ad_spend_by_product_dept[k] = ad_spend_by_product_dept.get(k, 0.0) + r["spend"]

        pd_fin: dict = {}
        for r in alloc_rows:
            key, label = resolve_group(conn, store_id, r["producto"])
            dept = r["departamento_destino"]
            k = (key, dept)
            g = pd_fin.setdefault(k, {"producto": label, "departamento": dept, "ingreso": 0.0, "costo_dev": 0.0, "pedidos": 0})
            g["ingreso"] += r["ingreso"]
            g["costo_dev"] += r["costo_devolucion"]
            g["pedidos"] += 1

        producto_departamento_ganador = []
        for (key, dept), spend in ad_spend_by_product_dept.items():
            g = pd_fin.get((key, dept))
            if not g or g["pedidos"] < min_orders:
                continue
            resultado = g["ingreso"] - g["costo_dev"] - spend
            if resultado > 0:
                producto_departamento_ganador.append({
                    "producto": g["producto"], "departamento": dept, "pedidos": g["pedidos"],
                    "ad_spend": round(spend, 2), "resultado_neto": round(resultado, 2),
                })
        producto_departamento_ganador.sort(key=lambda x: -x["resultado_neto"])
        producto_departamento_ganador = producto_departamento_ganador[:10]

        # ── Carrier performance (overall, and per department) ──
        carrier_rows = conn.execute("""
            SELECT transportadora, COUNT(*) as total,
                   SUM(CASE WHEN estatus='ENTREGADO' THEN 1 ELSE 0 END) as entregados,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones
            FROM orders WHERE period_id=? AND store_id=? AND transportadora != ''
            GROUP BY transportadora
        """, (period_id, store_id)).fetchall()
        carriers = [
            {"transportadora": r["transportadora"], "total": r["total"],
             "pct_devolucion": round((r["devoluciones"] or 0) / r["total"] * 100, 1)}
            for r in carrier_rows if r["total"] >= min_orders
        ]
        avg_pct_devolucion = (sum(c["pct_devolucion"] for c in carriers) / len(carriers)) if carriers else 0
        transportadoras_evitar = sorted(
            [c for c in carriers if c["pct_devolucion"] > avg_pct_devolucion * 1.3 and c["pct_devolucion"] > 15],
            key=lambda c: -c["pct_devolucion"]
        )

        carrier_dept_rows = conn.execute("""
            SELECT transportadora, departamento_destino, COUNT(*) as total,
                   SUM(CASE WHEN estatus='DEVOLUCION' THEN 1 ELSE 0 END) as devoluciones
            FROM orders WHERE period_id=? AND store_id=? AND departamento_destino != '' AND transportadora != ''
            GROUP BY transportadora, departamento_destino
        """, (period_id, store_id)).fetchall()
        by_dept: dict = {}
        for r in carrier_dept_rows:
            by_dept.setdefault(r["departamento_destino"], []).append({
                "transportadora": r["transportadora"], "total": r["total"],
                "pct_devolucion": round((r["devoluciones"] or 0) / r["total"] * 100, 1),
            })
        transportadora_por_departamento = []
        for dept, options in by_dept.items():
            eligible = [o for o in options if o["total"] >= min_orders]
            if len(eligible) < 2:
                continue  # no real choice to recommend if only one carrier serves this department
            eligible.sort(key=lambda o: o["pct_devolucion"])
            best, worst = eligible[0], eligible[-1]
            if worst["pct_devolucion"] - best["pct_devolucion"] >= 15:
                transportadora_por_departamento.append({
                    "departamento": dept, "usar": best["transportadora"], "pct_devolucion_usar": best["pct_devolucion"],
                    "evitar": worst["transportadora"], "pct_devolucion_evitar": worst["pct_devolucion"],
                })
        transportadora_por_departamento.sort(key=lambda x: -(x["pct_devolucion_evitar"] - x["pct_devolucion_usar"]))
        transportadora_por_departamento = transportadora_por_departamento[:10]

    return {
        "min_orders": min_orders,
        "productos_apagar": productos_apagar,
        "productos_escalar": productos_escalar,
        "departamentos_excluir": departamentos_excluir,
        "producto_departamento_ganador": producto_departamento_ganador,
        "transportadoras_evitar": transportadoras_evitar,
        "transportadora_por_departamento": transportadora_por_departamento,
    }


@app.get("/api/health")
def health():
    return {"ok": True}


# ── Meta Custom Audiences (built from orders already loaded, no re-upload) ──

class MetaAudiencesIn(BaseModel):
    store_id: int
    period_ids: List[int]
    valor_base: Optional[str] = None        # "ganancia" | "venta"
    piso_bajo_valor: Optional[float] = None
    dias_en_riesgo: Optional[int] = None
    dias_desinteresado: Optional[int] = None
    apellido: Optional[str] = None          # "dos" | "ultimo" | "todo"
    prefijo: Optional[str] = None

@app.post("/api/meta-audiences/generate")
def generate_meta_audiences(body: MetaAudiencesIn):
    if not body.period_ids:
        raise HTTPException(400, "Selecciona al menos un período")
    with get_db() as conn:
        store = conn.execute("SELECT * FROM stores WHERE id=?", (body.store_id,)).fetchone()
        if not store:
            raise HTTPException(404, "Tienda no encontrada")
        placeholders = ",".join("?" * len(body.period_ids))
        rows = conn.execute(f"""
            SELECT fecha, nombre_cliente, telefono, estatus, novedad, departamento_destino,
                   ciudad_destino, direccion, valor_facturado, ganancia, costo_devolucion_flete
            FROM orders
            WHERE store_id=? AND period_id IN ({placeholders}) AND telefono != ''
        """, (body.store_id, *body.period_ids)).fetchall()
        excluded_rows = conn.execute(f"""
            SELECT fecha, nombre_cliente, telefono, estatus, novedad, departamento_destino,
                   ciudad_destino, direccion
            FROM excluded_leads
            WHERE store_id=? AND period_id IN ({placeholders}) AND telefono != ''
        """, (body.store_id, *body.period_ids)).fetchall()

    filas = [{
        "telefono": r["telefono"], "email": None, "nombre": r["nombre_cliente"],
        "ciudad": r["ciudad_destino"], "departamento": r["departamento_destino"],
        "direccion": r["direccion"], "estatus": r["estatus"], "novedad": r["novedad"],
        "fecha": r["fecha"], "venta": r["valor_facturado"], "ganancia": r["ganancia"],
        "costo_devolucion": r["costo_devolucion_flete"],
    } for r in rows] + [{
        "telefono": r["telefono"], "email": None, "nombre": r["nombre_cliente"],
        "ciudad": r["ciudad_destino"], "departamento": r["departamento_destino"],
        "direccion": r["direccion"], "estatus": r["estatus"], "novedad": r["novedad"],
        "fecha": r["fecha"], "venta": 0, "ganancia": 0, "costo_devolucion": 0,
    } for r in excluded_rows]

    cfg = {}
    if body.valor_base:
        cfg["valor_base"] = body.valor_base
    if body.piso_bajo_valor is not None:
        cfg["piso_bajo_valor"] = body.piso_bajo_valor
    if body.dias_en_riesgo is not None:
        cfg["dias_en_riesgo"] = body.dias_en_riesgo
    if body.dias_desinteresado is not None:
        cfg["dias_desinteresado"] = body.dias_desinteresado
    if body.apellido:
        cfg["apellido"] = body.apellido
    cfg["prefijo"] = body.prefijo or (re.sub(r'[^A-Z0-9]', '', store["name"].upper())[:6] or "DP")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_name = re.sub(r'[^A-Za-z0-9_-]', '_', f"{store['name']}_{timestamp}")
    carpeta = os.path.join(META_AUDIENCES_DIR, run_name)

    try:
        resultado = ma.procesar_desde_filas(
            filas, carpeta, cfg,
            origen=f"{store['name']} · {len(body.period_ids)} período(s) ya cargados en Dropi Manager",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    zip_path = carpeta + ".zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in os.listdir(carpeta):
            zf.write(os.path.join(carpeta, fname), fname)

    resultado["zip_name"] = os.path.basename(zip_path)
    resultado.pop("carpeta", None)
    return resultado

@app.get("/api/meta-audiences/download")
def download_meta_audiences(zip_name: str):
    safe_name = os.path.basename(zip_name)
    path = os.path.join(META_AUDIENCES_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(path, media_type="application/zip", filename=safe_name)
