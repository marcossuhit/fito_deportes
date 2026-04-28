const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (_req, res) => {
  const clients = db
    .prepare(
      `SELECT id, first_name, last_name, cuit, phone, email, created_at, updated_at
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
    return {
      ...client,
      purchases,
      purchase_count: purchases.length
    };
  });

  return res.json({ clients: payload });
});

router.post("/", (req, res) => {
  const { firstName, lastName, cuit, phone, email } = req.body || {};

  const normalizedFirstName = String(firstName || "").trim();
  const normalizedLastName = String(lastName || "").trim();
  const normalizedCuit = String(cuit || "").trim();
  const normalizedPhone = String(phone || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedFirstName || !normalizedLastName || !normalizedCuit || !normalizedPhone || !normalizedEmail) {
    return res.status(400).json({ message: "Nombre, apellido, CUIT, teléfono y email son obligatorios." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO clients (first_name, last_name, cuit, phone, email)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(normalizedFirstName, normalizedLastName, normalizedCuit, normalizedPhone, normalizedEmail);

    const client = db
      .prepare(
        `SELECT id, first_name, last_name, cuit, phone, email, created_at, updated_at
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

module.exports = router;
