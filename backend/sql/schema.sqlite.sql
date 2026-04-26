CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'employee',
  requires_password INTEGER NOT NULL DEFAULT 1 CHECK (requires_password IN (0, 1)),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  size_color TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 2 CHECK (low_stock_threshold >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by_user_id INTEGER NOT NULL,
  closed_by_user_id INTEGER,
  opening_amount NUMERIC NOT NULL CHECK (opening_amount >= 0),
  closing_amount NUMERIC,
  expected_amount NUMERIC,
  difference_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  FOREIGN KEY (opened_by_user_id) REFERENCES users (id),
  FOREIGN KEY (closed_by_user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE,
  seller_user_id INTEGER NOT NULL,
  cash_session_id INTEGER,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  arca_status TEXT NOT NULL DEFAULT 'not_generated' CHECK (arca_status IN ('not_generated', 'pending', 'issued', 'error')),
  arca_comprobante_id TEXT,
  arca_emitted_at TEXT,
  arca_last_error TEXT,
  arca_response_payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_user_id) REFERENCES users (id),
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  size_color_snapshot TEXT NOT NULL,
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE TABLE IF NOT EXISTS price_update_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_by_user_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('percentage', 'fixed')),
  value NUMERIC NOT NULL,
  affected_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (changed_by_user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products (stock, low_stock_threshold);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions (status);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales (created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cash_session_id ON sales (cash_session_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items (product_id);
