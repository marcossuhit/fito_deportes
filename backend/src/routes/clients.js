const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  const clients = db
    .prepare(
      `SELECT id, first_name, last_name, cuit, phone, email, condicion_iva, created_at, updated_at
       FROM clients
       ORDER BY last_name ASC, first_name ASC`
    )
    .all();

  const salesByClientStmt = db.prepare(
    `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount, s.created_at,
            u.username AS seller,
            (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
     FROM sales s
     JOIN users u ON u.id = s.seller_user_id
     WHERE s.customer_id = ?
     ORDER BY s.created_at DESC`
  );

  const payload = clients.map((client) => {
    const purchases = salesByClientStmt.all(client.id);
    const debts = db
      .prepare(
        `SELECT id, client_id, amount, note, created_at
         FROM client_debts
         WHERE client_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(client.id);
    const debtBalance = debts.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      ...client,
      purchases,
      purchase_count: purchases.length,
      debts,
      debt_balance: debtBalance
    };
  });

  return res.json({ clients: payload });
});

router.post("/", (req, res) => {
  const { firstName, lastName, cuit, phone, email, condicionIva } = req.body || {};

  const normalizedFirstName = String(firstName || "").trim();
  const normalizedLastName = String(lastName || "").trim();
  const normalizedCuit = String(cuit || "").trim();
  const normalizedPhone = String(phone || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCondicionIva = String(condicionIva || "").trim();

  if (
    !normalizedFirstName ||
    !normalizedLastName ||
    !normalizedCuit ||
    !normalizedPhone ||
    !normalizedEmail ||
    !normalizedCondicionIva
  ) {
    return res.status(400).json({ message: "Nombre, apellido, CUIT, teléfono, email y condición frente al IVA son obligatorios." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO clients (first_name, last_name, cuit, phone, email, condicion_iva)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalizedFirstName,
        normalizedLastName,
        normalizedCuit,
        normalizedPhone,
        normalizedEmail,
        normalizedCondicionIva
      );

    const client = db
      .prepare(
        `SELECT id, first_name, last_name, cuit, phone, email, condicion_iva, created_at, updated_at
         FROM clients
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ client });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Ya existe un cliente con ese CUIT." });
    }
    return res.status(500).json({ message: "No se pudo crear el cliente." });
  }
});

router.put("/:id", (req, res) => {
  const clientId = Number(req.params.id);
  const { firstName, lastName, cuit, phone, email, condicionIva } = req.body || {};

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ message: "Cliente inválido." });
  }

  const normalizedFirstName = String(firstName || "").trim();
  const normalizedLastName = String(lastName || "").trim();
  const normalizedCuit = String(cuit || "").trim();
  const normalizedPhone = String(phone || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCondicionIva = String(condicionIva || "").trim();

  if (
    !normalizedFirstName ||
    !normalizedLastName ||
    !normalizedCuit ||
    !normalizedPhone ||
    !normalizedEmail ||
    !normalizedCondicionIva
  ) {
    return res.status(400).json({ message: "Nombre, apellido, CUIT, teléfono, email y condición frente al IVA son obligatorios." });
  }

  const existing = db.prepare("SELECT id FROM clients WHERE id = ?").get(clientId);
  if (!existing) {
    return res.status(404).json({ message: "Cliente no encontrado." });
  }

  try {
    db.prepare(
      `UPDATE clients
       SET first_name = ?,
           last_name = ?,
           cuit = ?,
           phone = ?,
           email = ?,
           condicion_iva = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      normalizedFirstName,
      normalizedLastName,
      normalizedCuit,
      normalizedPhone,
      normalizedEmail,
      normalizedCondicionIva,
      clientId
    );

    const client = db
      .prepare(
        `SELECT id, first_name, last_name, cuit, phone, email, condicion_iva, created_at, updated_at
         FROM clients
         WHERE id = ?`
      )
      .get(clientId);

    return res.json({ client });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Ya existe un cliente con ese CUIT." });
    }
    return res.status(500).json({ message: "No se pudo actualizar el cliente." });
  }
});

router.post("/:id/debts", (req, res) => {
  const clientId = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || "").trim();

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ message: "Cliente inválido." });
  }
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ message: "El monto debe ser un número distinto de cero." });
  }

  const client = db.prepare("SELECT id FROM clients WHERE id = ?").get(clientId);
  if (!client) {
    return res.status(404).json({ message: "Cliente no encontrado." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO client_debts (client_id, amount, note)
         VALUES (?, ?, ?)`
      )
      .run(clientId, amount, note);

    const debt = db
      .prepare(
        `SELECT id, client_id, amount, note, created_at
         FROM client_debts
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);

    const balance = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS debt_balance FROM client_debts WHERE client_id = ?")
      .get(clientId);

    return res.status(201).json({ debt, debt_balance: Number(balance.debt_balance || 0) });
  } catch {
    return res.status(500).json({ message: "No se pudo registrar el movimiento de adeudamiento." });
  }
});

module.exports = router;
