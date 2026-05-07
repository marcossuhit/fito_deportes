const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dbPathFromEnv = process.env.SQLITE_PATH || "./data/fito-deportes.db";
const dbPath = path.isAbsolute(dbPathFromEnv)
  ? dbPathFromEnv
  : path.join(__dirname, "..", dbPathFromEnv);

const dbDir = path.dirname(dbPath);
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schemaPath = path.join(__dirname, "..", "sql", "schema.sqlite.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSql);

function addColumnIfMissing(table, column, alterSql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    db.exec(alterSql);
  }
}

function runMigrations() {
  addColumnIfMissing(
    "users",
    "role",
    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'"
  );
  addColumnIfMissing(
    "users",
    "requires_password",
    "ALTER TABLE users ADD COLUMN requires_password INTEGER NOT NULL DEFAULT 1 CHECK (requires_password IN (0, 1))"
  );
  addColumnIfMissing(
    "products",
    "low_stock_threshold",
    "ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 2 CHECK (low_stock_threshold >= 0)"
  );
  addColumnIfMissing(
    "products",
    "brand",
    "ALTER TABLE products ADD COLUMN brand TEXT NOT NULL DEFAULT ''"
  );
  addColumnIfMissing(
    "products",
    "family",
    "ALTER TABLE products ADD COLUMN family TEXT NOT NULL DEFAULT ''"
  );
  addColumnIfMissing(
    "products",
    "image_url",
    "ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''"
  );
  addColumnIfMissing(
    "products",
    "product_code",
    "ALTER TABLE products ADD COLUMN product_code TEXT NOT NULL DEFAULT ''"
  );
  db.exec("UPDATE products SET product_code = barcode WHERE product_code = '' OR product_code IS NULL");
  addColumnIfMissing(
    "sales",
    "arca_status",
    "ALTER TABLE sales ADD COLUMN arca_status TEXT NOT NULL DEFAULT 'not_generated' CHECK (arca_status IN ('not_generated', 'pending', 'issued', 'error'))"
  );
  addColumnIfMissing(
    "sales",
    "arca_comprobante_id",
    "ALTER TABLE sales ADD COLUMN arca_comprobante_id TEXT"
  );
  addColumnIfMissing(
    "sales",
    "arca_emitted_at",
    "ALTER TABLE sales ADD COLUMN arca_emitted_at TEXT"
  );
  addColumnIfMissing(
    "sales",
    "arca_last_error",
    "ALTER TABLE sales ADD COLUMN arca_last_error TEXT"
  );
  addColumnIfMissing(
    "sales",
    "arca_response_payload",
    "ALTER TABLE sales ADD COLUMN arca_response_payload TEXT"
  );
  addColumnIfMissing(
    "sales",
    "customer_id",
    "ALTER TABLE sales ADD COLUMN customer_id INTEGER"
  );
  addColumnIfMissing(
    "clients",
    "condicion_iva",
    "ALTER TABLE clients ADD COLUMN condicion_iva TEXT NOT NULL DEFAULT 'Consumidor Final'"
  );

  db.exec("CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales (customer_id)");
  db.exec(
    `CREATE TABLE IF NOT EXISTS client_debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      amount NUMERIC NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
    )`
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_client_debts_client_id ON client_debts (client_id)");
}

function seedPredefinedUsers() {
  function matchesPassword(plainText, hash) {
    try {
      return bcrypt.compareSync(plainText, hash);
    } catch {
      return false;
    }
  }

  const predefinedUsers = [
    { username: "FitoAdmin", role: "admin", requiresPassword: true, password: "JOAQUINA" },
    { username: "Fito", role: "employee", requiresPassword: false, password: "__NO_PASSWORD__" },
    { username: "Fito1", role: "employee", requiresPassword: false, password: "__NO_PASSWORD__" },
    { username: "Fito2", role: "employee", requiresPassword: false, password: "__NO_PASSWORD__" },
    { username: "Fito3", role: "employee", requiresPassword: false, password: "__NO_PASSWORD__" }
  ];

  for (const predefinedUser of predefinedUsers) {
    const existing = db
      .prepare(
        "SELECT id, role, requires_password, password_hash FROM users WHERE username = ?"
      )
      .get(predefinedUser.username);

    const needsPassword = predefinedUser.requiresPassword ? 1 : 0;
    let passwordHash = existing?.password_hash;

    if (
      !passwordHash ||
      (predefinedUser.requiresPassword &&
        !matchesPassword(predefinedUser.password, passwordHash))
    ) {
      passwordHash = bcrypt.hashSync(predefinedUser.password, 10);
    }

    if (!existing) {
      db.prepare(
        "INSERT INTO users (username, role, requires_password, password_hash) VALUES (?, ?, ?, ?)"
      ).run(predefinedUser.username, predefinedUser.role, needsPassword, passwordHash);
      continue;
    }

    const shouldUpdate =
      existing.role !== predefinedUser.role ||
      Number(existing.requires_password) !== needsPassword ||
      existing.password_hash !== passwordHash;

    if (shouldUpdate) {
      db.prepare(
        "UPDATE users SET role = ?, requires_password = ?, password_hash = ? WHERE id = ?"
      ).run(predefinedUser.role, needsPassword, passwordHash, existing.id);
    }
  }
}

runMigrations();
seedPredefinedUsers();

module.exports = db;
