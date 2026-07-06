const express = require("express");
const db = require("../db");
const { issueArcaComprobante } = require("../services/arca");
const {
  getInvoiceEmailConfigError,
  isInvoiceEmailEnabled,
  isValidEmail,
  sendSaleInvoiceEmail,
  sendSaleQuoteEmail
} = require("../services/invoiceEmail");
const { buildInvoiceHtml } = require("../services/invoiceTemplate");

const router = express.Router();

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatBuenosAiresTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function buildInvoiceNumber(saleId) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `FAC-${values.year}${values.month}${values.day}-${String(saleId).padStart(6, "0")}`;
}

function buildQuoteNumber() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `PRE-${values.year}${values.month}${values.day}-${values.hour}${values.minute}${values.second}`;
}

function resolveManualItemName(rawItem) {
  const name = String(
    rawItem?.productName ??
      rawItem?.name ??
      rawItem?.description ??
      rawItem?.label ??
      rawItem?.title ??
      rawItem?.product?.name ??
      ""
  ).trim();

  return name || "Producto manual";
}

function resolveManualItemPrice(rawItem) {
  const candidate = rawItem?.unitPrice ?? rawItem?.price ?? rawItem?.unit_price ?? rawItem?.amount ?? rawItem?.value;
  const price = Number(candidate);
  return Number.isFinite(price) ? price : 0;
}

function getSaleWithItems(id) {
  const sale = db
    .prepare(
      `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount, s.customer_id,
              s.arca_status, s.arca_comprobante_id, s.arca_emitted_at, s.arca_last_error, s.arca_response_payload,
              s.created_at,
              u.username AS seller,
              c.first_name AS customer_first_name,
              c.last_name AS customer_last_name,
              c.cuit AS customer_cuit,
              c.condicion_iva AS customer_condicion_iva,
              c.email AS customer_email
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       LEFT JOIN clients c ON c.id = s.customer_id
       WHERE s.id = ?`
    )
    .get(id);

  if (!sale) {
    return null;
  }

  const items = db
    .prepare(
      `SELECT product_id, product_name_snapshot, size_color_snapshot,
              unit_price, quantity, line_total
       FROM sale_items
       WHERE sale_id = ?`
    )
    .all(id);

  return { ...sale, items };
}

function withArcaFields(sale) {
  let payload = null;
  try {
    payload = sale?.arca_response_payload ? JSON.parse(sale.arca_response_payload) : null;
  } catch {
    payload = null;
  }

  return {
    ...sale,
    arca_cae: payload?.cae || null,
    arca_cae_vto: payload?.caeVto || null,
    arca_cbte_tipo: payload?.cbteTipo || null
  };
}

router.get("/", (_req, res) => {
  const sales = db
    .prepare(
      `SELECT
         s.id,
         s.invoice_number,
         s.payment_method,
         s.total_amount,
         s.customer_id,
         s.arca_status,
         s.arca_comprobante_id,
         s.arca_emitted_at,
         s.created_at,
         u.username AS seller,
         c.first_name AS customer_first_name,
         c.last_name AS customer_last_name,
         c.cuit AS customer_cuit,
         c.email AS customer_email,
         (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       LEFT JOIN clients c ON c.id = s.customer_id
       ORDER BY s.created_at DESC`
    )
    .all();

  return res.json({ sales });
});

router.post("/quote", async (req, res) => {
  const { items, paymentMethod, customerId } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "El presupuesto debe incluir al menos un producto." });
  }

  const normalizedPaymentMethod = String(paymentMethod || "cash").trim().toLowerCase();
  const allowedPaymentMethods = new Set(["cash", "card", "transfer", "other"]);
  if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
    return res.status(400).json({ message: "Medio de pago inválido." });
  }

  try {
    const detailedItems = [];
    let total = 0;

    for (const rawItem of items) {
      const qty = Number(rawItem.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        const error = new Error("Cantidad inválida en el presupuesto.");
        error.status = 400;
        throw error;
      }

      const parsedProductId = rawItem.productId !== undefined && rawItem.productId !== null ? Number(rawItem.productId) : null;

      if (parsedProductId && Number.isInteger(parsedProductId) && parsedProductId > 0) {
        const product = db
          .prepare(
            `SELECT id, name, size_color, price, stock
             FROM products
             WHERE id = ?`
          )
          .get(parsedProductId);

        if (!product) {
          const error = new Error("Uno de los productos no existe.");
          error.status = 404;
          throw error;
        }

        const lineTotal = toMoney(Number(product.price) * qty);
        total = toMoney(total + lineTotal);

        detailedItems.push({
          productId: product.id,
          productName: product.name,
          sizeColor: product.size_color,
          unitPrice: Number(product.price),
          quantity: qty,
          lineTotal
        });
      } else {
        // Manual / temporary item: accept several payload shapes from the UI
        const name = resolveManualItemName(rawItem);
        const unitPrice = resolveManualItemPrice(rawItem);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          const error = new Error("Precio inválido en el presupuesto.");
          error.status = 400;
          throw error;
        }

        const lineTotal = toMoney(unitPrice * qty);
        total = toMoney(total + lineTotal);

        detailedItems.push({
          productId: null,
          productName: name,
          sizeColor: String(rawItem.sizeColor || rawItem.size_color || ""),
          unitPrice: Number(unitPrice),
          quantity: qty,
          lineTotal
        });
      }
    }

    let customer = null;
    if (customerId !== undefined && customerId !== null && customerId !== "") {
      const parsedCustomerId = Number(customerId);
      if (!Number.isInteger(parsedCustomerId) || parsedCustomerId <= 0) {
        const error = new Error("Cliente inválido.");
        error.status = 400;
        throw error;
      }

      customer = db
        .prepare(
          `SELECT id, first_name, last_name, cuit, email
           FROM clients
           WHERE id = ?`
        )
        .get(parsedCustomerId);
      if (!customer) {
        const error = new Error("Cliente no encontrado.");
        error.status = 404;
        throw error;
      }
    }

    const quote = {
      id: null,
      invoice_number: buildQuoteNumber(),
      payment_method: normalizedPaymentMethod,
      total_amount: total,
      customer_id: customer?.id || null,
      created_at: formatBuenosAiresTimestamp(),
      seller: req.session.user.username,
      customer_first_name: customer?.first_name || null,
      customer_last_name: customer?.last_name || null,
      customer_cuit: customer?.cuit || null,
      customer_email: customer?.email || null,
      items: detailedItems
    };

    const html = buildInvoiceHtml(quote, { autoPrint: true, documentType: "quote" });

    let emailStatus = "not_applicable";
    let emailMessage = "";
    if (quote.customer_email) {
      if (!isValidEmail(quote.customer_email)) {
        return res.status(400).json({ message: "El cliente seleccionado no tiene un email valido." });
      }
      if (!isInvoiceEmailEnabled()) {
        return res.status(400).json({
          message: getInvoiceEmailConfigError() || "El envio por email no esta configurado en el servidor."
        });
      }
      try {
        await sendSaleQuoteEmail(quote);
        emailStatus = "sent";
        emailMessage = `Presupuesto ${quote.invoice_number} enviado a ${quote.customer_email}.`;
      } catch (error) {
        console.error("No se pudo enviar presupuesto por email:", error);
        emailStatus = "failed";
        emailMessage = "No se pudo enviar el presupuesto por email.";
      }
    }

    return res.status(201).json({ quote, html, emailStatus, emailMessage });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "No se pudo generar el presupuesto." });
  }
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = getSaleWithItems(id);

  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada." });
  }

  return res.json({ sale });
});

router.get("/:id/print-html", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = getSaleWithItems(id);
  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada." });
  }

  const html = buildInvoiceHtml(sale, { autoPrint: true });
  return res.json({ html });
});

router.get("/:id/arca/print-html", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = getSaleWithItems(id);
  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada." });
  }
  if (sale.arca_status !== "issued") {
    return res.status(409).json({ message: "La venta aún no tiene comprobante ARCA emitido." });
  }

  const saleWithArca = withArcaFields(sale);
  const html = buildInvoiceHtml(saleWithArca, { autoPrint: true, documentType: "arca" });
  return res.json({ html });
});

router.post("/:id/send-email", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = getSaleWithItems(id);
  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada." });
  }

  if (!sale.customer_email || !isValidEmail(sale.customer_email)) {
    return res.status(400).json({ message: "La venta no tiene un cliente con email valido." });
  }

  if (!isInvoiceEmailEnabled()) {
    return res.status(400).json({
      message: getInvoiceEmailConfigError() || "El envio por email no esta configurado en el servidor."
    });
  }

  try {
    await sendSaleInvoiceEmail(sale);
    return res.json({ message: `Factura ${sale.invoice_number} enviada a ${sale.customer_email}.` });
  } catch (error) {
    console.error("No se pudo enviar factura por email:", error);
    return res.status(500).json({ message: "No se pudo enviar la factura por email." });
  }
});

router.post("/:id/arca/generate", async (req, res) => {
  const id = Number(req.params.id);
  const force = Boolean(req.body?.force);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID de venta inválido." });
  }

  const sale = db
    .prepare(
      `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount, s.customer_id,
              s.arca_status, s.arca_comprobante_id, s.arca_emitted_at,
              s.arca_response_payload,
              s.created_at, u.username AS seller,
              c.first_name AS customer_first_name,
              c.last_name AS customer_last_name,
              c.cuit AS customer_cuit,
              c.condicion_iva AS customer_condicion_iva,
              c.email AS customer_email
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       LEFT JOIN clients c ON c.id = s.customer_id
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
        `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount, s.customer_id,
                s.arca_status, s.arca_comprobante_id, s.arca_emitted_at, s.arca_last_error,
                s.created_at, u.username AS seller,
                c.first_name AS customer_first_name,
                c.last_name AS customer_last_name,
                c.cuit AS customer_cuit,
                c.email AS customer_email
         FROM sales s
         JOIN users u ON u.id = s.seller_user_id
         LEFT JOIN clients c ON c.id = s.customer_id
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

router.post("/", async (req, res) => {
  const { items, paymentMethod, customerId } = req.body || {};

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
        const detailedItems = [];
        let saleTotal = 0;

        for (const rawItem of items) {
          const qty = Number(rawItem.quantity);
          if (!Number.isInteger(qty) || qty <= 0) {
            const error = new Error("Cantidad inválida en la venta.");
            error.status = 400;
            throw error;
          }

          const parsedProductId = rawItem.productId !== undefined && rawItem.productId !== null ? Number(rawItem.productId) : null;

          if (parsedProductId && Number.isInteger(parsedProductId) && parsedProductId > 0) {
            const product = db
              .prepare(
                `SELECT id, name, size_color, price, stock
                 FROM products
                 WHERE id = ?`
              )
              .get(parsedProductId);

            if (!product) {
              const error = new Error("Uno de los productos no existe.");
              error.status = 404;
              throw error;
            }

            if (product.stock < qty) {
              const error = new Error(`Stock insuficiente para ${product.name}.`);
              error.status = 400;
              throw error;
            }

            const lineTotal = toMoney(Number(product.price) * qty);
            saleTotal = toMoney(saleTotal + lineTotal);

            detailedItems.push({
              productId: product.id,
              productName: product.name,
              sizeColor: product.size_color,
              unitPrice: Number(product.price),
              quantity: qty,
              lineTotal
            });
          } else {
            // Manual / temporary item
            const name = resolveManualItemName(rawItem);
            const unitPrice = resolveManualItemPrice(rawItem);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
              const error = new Error("Precio inválido en la venta.");
              error.status = 400;
              throw error;
            }

            const lineTotal = toMoney(unitPrice * qty);
            saleTotal = toMoney(saleTotal + lineTotal);

            detailedItems.push({
              productId: null,
              productName: name,
              sizeColor: String(rawItem.sizeColor || rawItem.size_color || ""),
              unitPrice: Number(unitPrice),
              quantity: qty,
              lineTotal
            });
          }
        }

      let cashSessionId = null;
      let normalizedCustomerId = null;
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

      if (customerId !== undefined && customerId !== null && customerId !== "") {
        const parsedCustomerId = Number(customerId);
        if (!Number.isInteger(parsedCustomerId) || parsedCustomerId <= 0) {
          const error = new Error("Cliente inválido.");
          error.status = 400;
          throw error;
        }

        const customer = db.prepare("SELECT id FROM clients WHERE id = ?").get(parsedCustomerId);
        if (!customer) {
          const error = new Error("Cliente no encontrado.");
          error.status = 404;
          throw error;
        }

        normalizedCustomerId = parsedCustomerId;
      }

      const insertSale = db
        .prepare(
          `INSERT INTO sales (invoice_number, seller_user_id, customer_id, cash_session_id, payment_method, total_amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          null,
          req.session.user.id,
          normalizedCustomerId,
          cashSessionId,
          normalizedPaymentMethod,
          saleTotal,
          formatBuenosAiresTimestamp()
        );

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

        if (item.productId) {
          updateStockStmt.run(item.quantity, item.productId);
        }
      }

      const sale = db
        .prepare(
          `SELECT s.id, s.invoice_number, s.payment_method, s.total_amount, s.customer_id,
                  s.arca_status, s.arca_comprobante_id, s.arca_emitted_at, s.arca_last_error,
                  s.created_at,
                  u.username AS seller,
                  c.first_name AS customer_first_name,
                  c.last_name AS customer_last_name,
                  c.cuit AS customer_cuit,
                  c.email AS customer_email
           FROM sales s
           JOIN users u ON u.id = s.seller_user_id
           LEFT JOIN clients c ON c.id = s.customer_id
           WHERE s.id = ?`
        )
        .get(saleId);

      return {
        ...sale,
        items: detailedItems
      };
    });

    const sale = createSaleTx();
    let emailStatus = "not_applicable";

    if (sale.customer_email && isValidEmail(sale.customer_email)) {
      if (isInvoiceEmailEnabled()) {
        try {
          await sendSaleInvoiceEmail(sale);
          emailStatus = "sent";
        } catch (emailError) {
          emailStatus = "failed";
          console.error("No se pudo enviar factura por email:", emailError);
        }
      } else {
        emailStatus = "skipped_not_configured";
      }
    }

    return res.status(201).json({ sale, emailStatus });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "No se pudo registrar la venta." });
  }
});

module.exports = router;
