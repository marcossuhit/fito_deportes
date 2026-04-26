const express = require("express");
const db = require("../db");
const { issueArcaComprobante } = require("../services/arca");

const router = express.Router();

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function buildInvoiceNumber(saleId) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `FAC-${yyyy}${mm}${dd}-${String(saleId).padStart(6, "0")}`;
}

router.get("/", (_req, res) => {
  const sales = db
    .prepare(
      `SELECT
         s.id,
         s.invoice_number,
         s.payment_method,
         s.total_amount,
         s.arca_status,
         s.arca_comprobante_id,
         s.arca_emitted_at,
         s.created_at,
         u.username AS seller,
         (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       ORDER BY s.created_at DESC`
    )
    .all();

  return res.json({ sales });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = db
    .prepare(
      `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount,
              s.arca_status, s.arca_comprobante_id, s.arca_emitted_at, s.arca_last_error,
              s.created_at,
              u.username AS seller
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       WHERE s.id = ?`
    )
    .get(id);

  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada." });
  }

  const items = db
    .prepare(
      `SELECT product_id, product_name_snapshot, size_color_snapshot,
              unit_price, quantity, line_total
       FROM sale_items
       WHERE sale_id = ?`
    )
    .all(id);

  return res.json({ sale: { ...sale, items } });
});

router.post("/:id/arca/generate", async (req, res) => {
  const id = Number(req.params.id);
  const force = Boolean(req.body?.force);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = db
    .prepare(
      `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount,
              s.arca_status, s.arca_comprobante_id, s.arca_emitted_at,
              s.created_at, u.username AS seller
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       WHERE s.id = ?`
    )
    .get(id);

  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada." });
  }

  if (sale.arca_status === "issued" && !force) {
    return res.status(409).json({
      message: "La factura ya tiene comprobante ARCA emitido. Usá force=true para regenerar.",
      sale
    });
  }

  const items = db
    .prepare(
      `SELECT product_id, product_name_snapshot, size_color_snapshot,
              unit_price, quantity, line_total
       FROM sale_items
       WHERE sale_id = ?`
    )
    .all(id);

  db.prepare(
    `UPDATE sales
     SET arca_status = 'pending',
         arca_last_error = NULL
     WHERE id = ?`
  ).run(id);

  try {
    const arcaResult = await issueArcaComprobante({ sale, items });

    db.prepare(
      `UPDATE sales
       SET arca_status = 'issued',
           arca_comprobante_id = ?,
           arca_emitted_at = CURRENT_TIMESTAMP,
           arca_last_error = NULL,
           arca_response_payload = ?
       WHERE id = ?`
    ).run(
      arcaResult.comprobanteId,
      JSON.stringify(arcaResult.raw || {}),
      id
    );

    const updatedSale = db
      .prepare(
        `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount,
                s.arca_status, s.arca_comprobante_id, s.arca_emitted_at, s.arca_last_error,
                s.created_at, u.username AS seller
         FROM sales s
         JOIN users u ON u.id = s.seller_user_id
         WHERE s.id = ?`
      )
      .get(id);

    const updatedItems = db
      .prepare(
        `SELECT product_id, product_name_snapshot, size_color_snapshot,
                unit_price, quantity, line_total
         FROM sale_items
         WHERE sale_id = ?`
      )
      .all(id);

    return res.json({
      message: "Comprobante ARCA generado correctamente.",
      sale: {
        ...updatedSale,
        items: updatedItems
      }
    });
  } catch (error) {
    db.prepare(
      `UPDATE sales
       SET arca_status = 'error',
           arca_last_error = ?
       WHERE id = ?`
    ).run(error.message || "Error al generar comprobante ARCA.", id);

    return res.status(error.status || 500).json({
      message: error.message || "No se pudo generar el comprobante ARCA."
    });
  }
});

router.post("/", (req, res) => {
  const { items, paymentMethod } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "La venta debe incluir al menos un producto." });
  }

  const normalizedPaymentMethod = String(paymentMethod || "cash").trim().toLowerCase();
  const allowedPaymentMethods = new Set(["cash", "card", "transfer", "other"]);
  if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
    return res.status(400).json({ message: "Medio de pago inválido." });
  }

  try {
    const createSaleTx = db.transaction(() => {
      const normalizedItems = items.map((rawItem) => ({
        productId: Number(rawItem.productId),
        quantity: Number(rawItem.quantity)
      }));

      const detailedItems = [];
      let saleTotal = 0;

      for (const item of normalizedItems) {
        if (!Number.isInteger(item.productId) || item.productId <= 0) {
          const error = new Error("Producto inválido en la venta.");
          error.status = 400;
          throw error;
        }

        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          const error = new Error("Cantidad inválida en la venta.");
          error.status = 400;
          throw error;
        }

        const product = db
          .prepare(
            `SELECT id, name, size_color, price, stock
             FROM products
             WHERE id = ?`
          )
          .get(item.productId);

        if (!product) {
          const error = new Error("Uno de los productos no existe.");
          error.status = 404;
          throw error;
        }

        if (product.stock < item.quantity) {
          const error = new Error(`Stock insuficiente para ${product.name}.`);
          error.status = 400;
          throw error;
        }

        const lineTotal = toMoney(Number(product.price) * item.quantity);
        saleTotal = toMoney(saleTotal + lineTotal);

        detailedItems.push({
          productId: product.id,
          productName: product.name,
          sizeColor: product.size_color,
          unitPrice: Number(product.price),
          quantity: item.quantity,
          lineTotal
        });
      }

      let cashSessionId = null;
      if (normalizedPaymentMethod === "cash") {
        const openSession = db
          .prepare(
            `SELECT id
             FROM cash_sessions
             WHERE status = 'open'
             ORDER BY opened_at DESC
             LIMIT 1`
          )
          .get();

        if (!openSession) {
          const error = new Error("Para ventas en efectivo primero abrí caja.");
          error.status = 400;
          throw error;
        }

        cashSessionId = openSession.id;
      }

      const insertSale = db
        .prepare(
          `INSERT INTO sales (invoice_number, seller_user_id, cash_session_id, payment_method, total_amount)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(null, req.session.user.id, cashSessionId, normalizedPaymentMethod, saleTotal);

      const saleId = Number(insertSale.lastInsertRowid);
      const invoiceNumber = buildInvoiceNumber(saleId);

      db.prepare("UPDATE sales SET invoice_number = ? WHERE id = ?").run(invoiceNumber, saleId);

      const insertItemStmt = db.prepare(
        `INSERT INTO sale_items
         (sale_id, product_id, product_name_snapshot, size_color_snapshot, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const updateStockStmt = db.prepare(
        `UPDATE products
         SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      );

      for (const item of detailedItems) {
        insertItemStmt.run(
          saleId,
          item.productId,
          item.productName,
          item.sizeColor,
          item.unitPrice,
          item.quantity,
          item.lineTotal
        );

        updateStockStmt.run(item.quantity, item.productId);
      }

      const sale = db
        .prepare(
          `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount,
                  s.arca_status, s.arca_comprobante_id, s.arca_emitted_at, s.arca_last_error,
                  s.created_at,
                  u.username AS seller
           FROM sales s
           JOIN users u ON u.id = s.seller_user_id
           WHERE s.id = ?`
        )
        .get(saleId);

      return {
        ...sale,
        items: detailedItems
      };
    });

    const sale = createSaleTx();
    return res.status(201).json({ sale });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "No se pudo registrar la venta." });
  }
});

module.exports = router;
