-- ==============================================================================
-- SurtiFácil SaaS - Esquema Multi-Tenant en Cloudflare D1 (SQLite Edge)
-- Diseñado para Tiendas de Abastos, Minimercados y Comercio Vecinal en Medellín
-- ==============================================================================

-- 0. Tabla Maestra de Negocios / Tiendas (Multi-Tenant SaaS)
CREATE TABLE IF NOT EXISTS negocios (
  id TEXT PRIMARY KEY, -- ej: 'surtifacil', 'abastos-la-80'
  slug TEXT NOT NULL UNIQUE, -- ruta pública para /tienda/:slug y /kiosco/:slug
  nombre TEXT NOT NULL,
  barrio TEXT DEFAULT 'Medellín',
  ciudad TEXT DEFAULT 'Medellín',
  telefono_whatsapp TEXT,
  direccion TEXT,
  horario TEXT DEFAULT 'Lunes a Domingo 7:00 AM - 9:00 PM',
  logo_url TEXT,
  estado TEXT NOT NULL CHECK(estado IN ('activo', 'pendiente', 'suspendido')) DEFAULT 'activo',
  plan_id TEXT NOT NULL CHECK(plan_id IN ('prueba_3d', 'semanal_7d', 'quincenal_15d', 'mensual_30d', 'enterprise')) DEFAULT 'prueba_3d',
  suscripcion_vence_en TEXT,
  cuota_ia_total INTEGER NOT NULL DEFAULT 300,
  cuota_ia_usada INTEGER NOT NULL DEFAULT 0,
  costo_domicilio_cents INTEGER NOT NULL DEFAULT 0,
  datos_pago_offline TEXT, -- Nequi / Bancolombia Ahorro a la Mano informativo
  config_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_negocios_slug ON negocios(slug);
CREATE INDEX IF NOT EXISTS idx_negocios_estado ON negocios(estado);

-- 1. Tabla de Usuarios y Roles (vinculados al UID de Firebase Auth y a un negocio_id)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Firebase Auth UID
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'cashier')) DEFAULT 'cashier',
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT,
  deleted_at TEXT,
  deleted_by_uid TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_negocio ON users(negocio_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Tabla de Proveedores (Suppliers) por Negocio
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  category TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suppliers_negocio ON suppliers(negocio_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(negocio_id, active);

-- 3. Tabla de Productos y Menú de Abastos por Negocio
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  unit TEXT NOT NULL DEFAULT 'unidad', -- unidad, libra, kilo, litro, paquete, cubeta
  category TEXT DEFAULT 'General',
  image_url TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  barcode TEXT,
  visible_kiosco INTEGER NOT NULL DEFAULT 1,
  visible_tienda INTEGER NOT NULL DEFAULT 1,
  en_oferta INTEGER NOT NULL DEFAULT 0,
  precio_oferta_cents INTEGER,
  wholesale_tiers_json TEXT NOT NULL DEFAULT '[]', -- Array de { min_quantity, unit_price_cents }
  allow_fractional INTEGER NOT NULL DEFAULT 0, -- 1 = permite venta a granel / peso decimal
  last_cost_cents INTEGER,
  last_cost_source TEXT CHECK(last_cost_source IN ('purchase', 'fallback_price')),
  last_cost_updated_at TEXT,
  expiration_date TEXT, -- ISO YYYY-MM-DD para alertas de vencimiento en Fruver/Lácteos
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_negocio ON products(negocio_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(negocio_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(negocio_id, category);

-- 3.1 Tabla de Combos y Kits de Mercado por Negocio
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]', -- Array de { product_id, product_name, quantity, unit_price_cents }
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  visible_kiosco INTEGER NOT NULL DEFAULT 1,
  visible_tienda INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_combos_negocio ON combos(negocio_id);

-- 4. Tabla de Clientes de Crédito (Fiados) por Negocio
CREATE TABLE IF NOT EXISTS credit_customers (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_entry_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_credit_customers_negocio ON credit_customers(negocio_id);
CREATE INDEX IF NOT EXISTS idx_credit_customers_active ON credit_customers(negocio_id, active);

-- 5. Tabla de Movimientos del Libro de Fiados (Deudas y Abonos)
CREATE TABLE IF NOT EXISTS credit_entries (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES credit_customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('debt', 'payment')),
  amount_cents INTEGER NOT NULL,
  description TEXT,
  sale_id TEXT,
  created_by_uid TEXT NOT NULL,
  created_by_role TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_entries_negocio ON credit_entries(negocio_id);
CREATE INDEX IF NOT EXISTS idx_credit_entries_customer ON credit_entries(customer_id);

-- 6. Tabla de Ventas (Sales) por Negocio
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  total_cents INTEGER NOT NULL,
  subtotal_cents INTEGER DEFAULT 0,
  coupon_code TEXT,
  coupon_discount_cents INTEGER NOT NULL DEFAULT 0,
  loyalty_account_id TEXT,
  loyalty_phone TEXT,
  loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  loyalty_discount_cents INTEGER NOT NULL DEFAULT 0,
  loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'other', 'credit', 'mixed')),
  payment_breakdown_json TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'voided')),
  voided_at TEXT,
  voided_by_uid TEXT,
  voided_by_name TEXT,
  void_reason TEXT,
  credit_customer_id TEXT REFERENCES credit_customers(id) ON DELETE SET NULL,
  credit_customer_name TEXT,
  total_cost_cents INTEGER DEFAULT 0,
  created_by_uid TEXT,
  created_by_role TEXT,
  schema_version INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_negocio_date ON sales(negocio_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(credit_customer_id);

-- 7. Items de Venta (Detalle relacional)
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER DEFAULT 0,
  cost_subtotal_cents INTEGER DEFAULT 0,
  cost_source TEXT,
  cost_is_estimated INTEGER DEFAULT 0,
  category TEXT
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- 8. Órdenes de Compra a Proveedores (Purchase Orders)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'ordered', 'partial', 'received', 'cancelled')) DEFAULT 'draft',
  total_cents INTEGER NOT NULL DEFAULT 0,
  received_total_cents INTEGER NOT NULL DEFAULT 0,
  expected_date TEXT,
  received_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_negocio ON purchase_orders(negocio_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);

-- 9. Items de Órdenes de Compra
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT,
  name TEXT,
  category TEXT,
  quantity INTEGER NOT NULL,
  received_quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL,
  final_cost_cents INTEGER,
  is_new_product INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(order_id);

-- 10. Pedidos de Clientes (Modo Kiosco iPad / Tienda Web / Bot Sarin WhatsApp)
CREATE TABLE IF NOT EXISTS customer_orders (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  order_code TEXT NOT NULL, -- ej: '#K-14' (Kiosco) o '#W-22' (WhatsApp/Web)
  source TEXT NOT NULL CHECK(source IN ('kiosk', 'web', 'whatsapp')) DEFAULT 'kiosk',
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  delivery_type TEXT NOT NULL CHECK(delivery_type IN ('pickup_counter', 'delivery')) DEFAULT 'pickup_counter',
  delivery_address TEXT,
  delivery_neighborhood TEXT,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'transfer', 'credit')) DEFAULT 'cash',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal_cents INTEGER DEFAULT 0,
  coupon_code TEXT,
  coupon_discount_cents INTEGER NOT NULL DEFAULT 0,
  loyalty_account_id TEXT,
  loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  loyalty_discount_cents INTEGER NOT NULL DEFAULT 0,
  loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
  loyalty_settled INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending', 'preparing', 'ready_or_on_way', 'completed', 'cancelled')) DEFAULT 'pending',
  tracking_token TEXT UNIQUE,
  sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_negocio ON customer_orders(negocio_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_orders_token ON customer_orders(tracking_token);

-- 10.1 Tabla de Arqueos y Cierres de Caja en Pesos Colombianos (COP)
CREATE TABLE IF NOT EXISTS cash_closings (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  closing_number INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by_uid TEXT NOT NULL,
  closed_by_name TEXT,
  initial_cash_cents INTEGER NOT NULL DEFAULT 0,
  sales_cash_cents INTEGER NOT NULL DEFAULT 0,
  credit_payments_cash_cents INTEGER NOT NULL DEFAULT 0,
  expected_cash_cents INTEGER NOT NULL,
  counted_cash_cents INTEGER NOT NULL,
  difference_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('balanced', 'surplus', 'shortage')),
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  total_sales_count INTEGER NOT NULL DEFAULT 0,
  expenses_cash_cents INTEGER NOT NULL DEFAULT 0,
  shift_id TEXT,
  shift_label TEXT,
  opened_by_uid TEXT,
  opened_by_name TEXT,
  withdrawals_cash_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_closings_negocio ON cash_closings(negocio_id, closed_at);

-- 10.1.b Tabla de Turnos de Caja (Apertura / Base Inicial / Cierre por Cajero)
CREATE TABLE IF NOT EXISTS cash_shifts (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  shift_number INTEGER NOT NULL,
  shift_label TEXT NOT NULL DEFAULT 'completo',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  opened_by_uid TEXT NOT NULL,
  opened_by_name TEXT,
  opened_by_role TEXT DEFAULT 'cashier',
  initial_cash_cents INTEGER NOT NULL DEFAULT 0,
  opening_notes TEXT,
  closed_at TEXT,
  closed_by_uid TEXT,
  closed_by_name TEXT,
  closing_id TEXT,
  expected_cash_cents INTEGER,
  counted_cash_cents INTEGER,
  difference_cents INTEGER,
  closing_status TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_negocio_status ON cash_shifts(negocio_id, status, opened_at DESC);

-- 10.1.c Tabla de Retiros Parciales de Seguridad ("Sangrías" de Caja)
CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  shift_id TEXT REFERENCES cash_shifts(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  destination TEXT NOT NULL DEFAULT 'caja_fuerte',
  reason TEXT NOT NULL,
  received_by TEXT,
  created_by_uid TEXT NOT NULL DEFAULT 'system',
  created_by_name TEXT,
  created_by_role TEXT DEFAULT 'cashier',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_negocio_date ON cash_withdrawals(negocio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_shift ON cash_withdrawals(negocio_id, shift_id);

-- 10.2 Tabla de Caja Menor y Gastos Operativos del Turno
CREATE TABLE IF NOT EXISTS cash_expenses (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'otro',
  description TEXT NOT NULL,
  beneficiary TEXT,
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  created_by_uid TEXT NOT NULL DEFAULT 'system',
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_expenses_negocio_date ON cash_expenses(negocio_id, created_at DESC);

-- 10.3 Tabla de Mermas, Averías y Bajas de Inventario
CREATE TABLE IF NOT EXISTS inventory_shrinkage (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'unidad',
  quantity INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  total_cost_loss_cents INTEGER NOT NULL,
  retail_value_cents INTEGER NOT NULL DEFAULT 0,
  cost_source TEXT NOT NULL DEFAULT 'purchase' CHECK(cost_source IN ('purchase', 'estimated_fallback')),
  reason TEXT NOT NULL CHECK(reason IN ('damaged', 'expired', 'spoiled_fruver', 'internal_use', 'other')),
  notes TEXT,
  created_by_uid TEXT NOT NULL DEFAULT 'system',
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_shrinkage_negocio_date ON inventory_shrinkage(negocio_id, created_at DESC);

-- 10.4 Secretos internos y configuración de seguridad SaaS en Edge
CREATE TABLE IF NOT EXISTS _system_secrets (
  secret_key TEXT PRIMARY KEY,
  secret_value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 10.5 Fidelización Vecinal: Cuentas del Club de Puntos del Barrio por Celular
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_points_redeemed INTEGER NOT NULL DEFAULT 0,
  total_purchases_count INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_activity_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(negocio_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_negocio_phone ON loyalty_accounts(negocio_id, phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_negocio_points ON loyalty_accounts(negocio_id, points_balance DESC);

-- 10.6 Movimientos Auditables de Puntos (Acumulación, Canje, Bono, Ajuste)
CREATE TABLE IF NOT EXISTS loyalty_movements (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('earn', 'redeem', 'adjust', 'bonus')),
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  sale_id TEXT,
  order_id TEXT,
  created_by_uid TEXT NOT NULL DEFAULT 'system',
  created_by_role TEXT DEFAULT 'cashier',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loyalty_movements_account ON loyalty_movements(negocio_id, account_id, created_at DESC);

-- 10.7 Cupones de Descuento Compartibles por WhatsApp y Storefront
CREATE TABLE IF NOT EXISTS discount_coupons (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed_cents')) DEFAULT 'percentage',
  discount_value INTEGER NOT NULL,
  min_purchase_cents INTEGER NOT NULL DEFAULT 0,
  max_discount_cents INTEGER,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_uid TEXT DEFAULT 'system',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(negocio_id, code)
);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_negocio_code ON discount_coupons(negocio_id, code);

-- 10.8 Kardex Trazable de Movimientos de Inventario por Producto
CREATE TABLE IF NOT EXISTS inventory_kardex (
  id TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL DEFAULT 'surtifacil' REFERENCES negocios(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unidad',
  movement_type TEXT NOT NULL CHECK(movement_type IN ('initial', 'sale', 'sale_void', 'purchase', 'shrinkage', 'shrinkage_revert', 'adjustment')),
  quantity_delta REAL NOT NULL,
  stock_before REAL NOT NULL,
  stock_after REAL NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_value_cents INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT,
  notes TEXT,
  created_by_uid TEXT NOT NULL DEFAULT 'system',
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_kardex_product ON inventory_kardex(negocio_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_kardex_negocio_date ON inventory_kardex(negocio_id, created_at DESC);

-- ==============================================================================
-- 11. Semillas Iniciales (Negocio Insignia y SuperAdmin de la Plataforma)
-- ==============================================================================
INSERT OR IGNORE INTO negocios (
  id, slug, nombre, barrio, ciudad, telefono_whatsapp, direccion, horario, estado, plan_id, cuota_ia_total, cuota_ia_usada, costo_domicilio_cents, datos_pago_offline, config_json
) VALUES (
  'surtifacil',
  'surtifacil',
  'SurtiFácil Abastos Central - Medellín',
  'La Candelaria / Centro',
  'Medellín',
  '+573001234567',
  'Calle 50 # 50-20, Centro, Medellín',
  'Lunes a Domingo 7:00 AM - 9:00 PM',
  'activo',
  'enterprise',
  999999,
  0,
  350000, -- $ 3.500 COP
  'Nequi / Bancolombia: 300 123 4567',
  '{"slogan":"El motor digital del tendero paisa","allow_kiosk":true,"allow_whatsapp":true}'
);

INSERT OR IGNORE INTO users (
  id, negocio_id, email, display_name, role, is_super_admin, active
) VALUES
  ('admin-andres-san1404', 'surtifacil', 'andres.san1404@gmail.com', 'Andrés Sánchez (SuperAdmin)', 'admin', 1, 1),
  ('user-admin-surtifacil', 'surtifacil', 'admin@surtifacil.com', 'Don Carlos (Administrador)', 'admin', 0, 1),
  ('user-manager-surtifacil', 'surtifacil', 'gerente@surtifacil.com', 'Marta Gómez (Gerente Inventario)', 'manager', 0, 1),
  ('user-cashier-surtifacil', 'surtifacil', 'cajero@surtifacil.com', 'Mateo Restrepo (Cajero Mostrador)', 'cashier', 0, 1),
  ('user-ejemplo-mitienda', 'surtifacil', 'ejemplo@mitienda.com', 'Tendero Demo (SurtiFácil)', 'admin', 0, 1);

INSERT OR IGNORE INTO combos (
  id, negocio_id, name, description, price_cents, items_json, active, visible_kiosco, visible_tienda
) VALUES (
  'combo-desayuno-paisa',
  'surtifacil',
  'Combo Desayuno Paisa',
  'Chocolate Corona, quesito antioqueño y arepas tela x5',
  950000,
  '[{"product_id":"p3","product_name":"Leche Entera 1L","quantity":2,"unit_price_cents":350000},{"product_id":"p4","product_name":"Queso Cheddar","quantity":1,"unit_price_cents":650000},{"product_id":"p2","product_name":"Pan Integral","quantity":1,"unit_price_cents":150000}]',
  1,
  1,
  1
);


