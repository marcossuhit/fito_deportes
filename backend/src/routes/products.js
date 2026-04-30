const express = require("express");
const db = require("../db");

const router = express.Router();
const IMAGE_DATA_URL_REGEX = /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/;

function selectProductsSql(whereClause = "", orderClause = "ORDER BY name ASC") {
  return `SELECT id, barcode, product_code, name, brand, family, size_color, price, stock, low_stock_threshold, image_url, created_at, updated_at
          FROM products
          ${whereClause}
          ${orderClause}`;
}

router.get("/", (_req, res) => {
  const products = db.prepare(selectProductsSql()).all();
  return res.json({ products });
});

router.get("/alerts/low-stock", (req, res) => {
  const thresholdFromQuery = req.query.threshold;
  const threshold = thresholdFromQuery === undefined ? null : Number(thresholdFromQuery);

  if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
    return res.status(400).json({ message: "Threshold inválido." });
  }

  const products = threshold === null
    ? db.prepare(selectProductsSql("WHERE stock <= low_stock_threshold", "ORDER BY stock ASC, name ASC")).all()
    : db.prepare(selectProductsSql("WHERE stock <= ?", "ORDER BY stock ASC, name ASC")).all(threshold);

  return res.json({ products });
});

router.post("/price-update", (req, res) => {
  const { mode, value, productIds } = req.body || {};
  const normalizedMode = String(mode || "").trim().toLowerCase();
  const parsedValue = Number(value);

  if (!["percentage", "fixed"].includes(normalizedMode)) {
    return res.status(400).json({ message: "Modo inválido. Usar 'percentage' o 'fixed'." });
  }

  if (Number.isNaN(parsedValue)) {
    return res.status(400).json({ message: "Valor inválido para actualización de precio." });
  }

  if (normalizedMode === "percentage" && parsedValue < -100) {
    return res.status(400).json({ message: "El porcentaje no puede ser menor a -100." });
  }

  if (normalizedMode === "fixed" && parsedValue < 0) {
    return res.status(400).json({ message: "El precio fijo no puede ser negativo." });
  }

  const parsedIds = Array.isArray(productIds)
    ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)))
    : [];

  const runPriceUpdateTx = db.transaction(() => {
    let result;

    if (parsedIds.length > 0) {
      const placeholders = parsedIds.map(() => "?").join(", ");

      if (normalizedMode === "percentage") {
        result = db
          .prepare(
            `UPDATE products
             SET price = ROUND(price * (1 + (? / 100.0)), 2),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id IN (${placeholders})`
          )
          .run(parsedValue, ...parsedIds);
      } else {
        result = db
          .prepare(
            `UPDATE products
             SET price = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id IN (${placeholders})`
          )
          .run(parsedValue, ...parsedIds);
      }
    } else if (normalizedMode === "percentage") {
      result = db
        .prepare(
          `UPDATE products
           SET price = ROUND(price * (1 + (? / 100.0)), 2),
               updated_at = CURRENT_TIMESTAMP`
        )
        .run(parsedValue);
    } else {
      result = db
        .prepare(
          `UPDATE products
           SET price = ?,
               updated_at = CURRENT_TIMESTAMP`
        )
        .run(parsedValue);
    }

    db.prepare(
      `INSERT INTO price_update_logs (changed_by_user_id, mode, value, affected_count)
       VALUES (?, ?, ?, ?)`
    ).run(req.session.user.id, normalizedMode, parsedValue, result.changes);

    return result.changes;
  });

  const affectedCount = runPriceUpdateTx();
  return res.json({ affectedCount });
});

router.post("/", (req, res) => {
  const { barcode, product_code, name, brand, family, size_color, price, stock, low_stock_threshold, image_url } = req.body || {};

  if (!barcode || !name || !family) {
    return res.status(400).json({ message: "Código, nombre y familia son obligatorios." });
  }

  const parsedPrice = Number(price);
  const parsedStock = Number(stock ?? 0);
  const parsedThreshold = Number(low_stock_threshold ?? 2);
  const normalizedBrand = String(brand ?? "").trim();
  const normalizedFamily = String(family ?? "").trim();
  const normalizedSizeColor = String(size_color ?? "").trim();
  const normalizedImageUrl = String(image_url ?? "").trim();
  const normalizedProductCode = String(product_code ?? barcode).trim();

  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ message: "Precio inválido." });
  }

  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ message: "Stock inválido." });
  }

  if (!Number.isInteger(parsedThreshold) || parsedThreshold < 0) {
    return res.status(400).json({ message: "Stock mínimo inválido." });
  }

  if (!normalizedFamily) {
    return res.status(400).json({ message: "Familia inválida." });
  }

  if (normalizedImageUrl && !IMAGE_DATA_URL_REGEX.test(normalizedImageUrl)) {
    return res.status(400).json({ message: "Formato de imagen inválido." });
  }

  if (normalizedImageUrl.length > 3_000_000) {
    return res.status(400).json({ message: "La imagen es demasiado grande." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO products (barcode, product_code, name, brand, family, size_color, price, stock, low_stock_threshold, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        barcode,
        normalizedProductCode,
        name,
        normalizedBrand,
        normalizedFamily,
        normalizedSizeColor,
        parsedPrice,
        parsedStock,
        parsedThreshold,
        normalizedImageUrl
      );

    const product = db
      .prepare(selectProductsSql("WHERE id = ?", ""))
      .get(result.lastInsertRowid);

    return res.status(201).json({ product });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Ese código de barras ya existe." });
    }

    return res.status(500).json({ message: "No se pudo crear el producto." });
  }
});

router.patch("/:id/threshold", (req, res) => {
  const id = Number(req.params.id);
  const threshold = Number(req.body?.low_stock_threshold);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "ID inválido." });
  }

  if (!Number.isInteger(threshold) || threshold < 0) {
    return res.status(400).json({ message: "Stock mínimo inválido." });
  }

  const result = db
    .prepare(
      `UPDATE products
       SET low_stock_threshold = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(threshold, id);

  if (result.changes === 0) {
    return res.status(404).json({ message: "Producto no encontrado." });
  }

  const product = db.prepare(selectProductsSql("WHERE id = ?", "")).get(id);
  return res.json({ product });
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { barcode, product_code, name, brand, family, size_color, price, stock, low_stock_threshold, image_url } = req.body || {};

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }

  if (!barcode || !name || !family) {
    return res.status(400).json({ message: "Código, nombre y familia son obligatorios." });
  }

  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const hasThreshold = low_stock_threshold !== undefined;
  const parsedThreshold = hasThreshold ? Number(low_stock_threshold) : null;
  const normalizedBrand = String(brand ?? "").trim();
  const normalizedFamily = String(family ?? "").trim();
  const hasSizeColor = size_color !== undefined;
  const parsedSizeColor = hasSizeColor ? String(size_color ?? "").trim() : null;
  const normalizedImageUrl = String(image_url ?? "").trim();
  const normalizedProductCode = String(product_code ?? barcode).trim();

  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ message: "Precio inválido." });
  }

  if (!Number.isInteger(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ message: "Stock inválido." });
  }

  if (hasThreshold && (!Number.isInteger(parsedThreshold) || parsedThreshold < 0)) {
    return res.status(400).json({ message: "Stock mínimo inválido." });
  }

  if (!normalizedFamily) {
    return res.status(400).json({ message: "Familia inválida." });
  }

  if (normalizedImageUrl && !IMAGE_DATA_URL_REGEX.test(normalizedImageUrl)) {
    return res.status(400).json({ message: "Formato de imagen inválido." });
  }

  if (normalizedImageUrl.length > 3_000_000) {
    return res.status(400).json({ message: "La imagen es demasiado grande." });
  }

  try {
    const result = db
      .prepare(
        `UPDATE products
         SET barcode = ?,
             product_code = ?,
             name = ?,
             brand = ?,
             family = ?,
             size_color = COALESCE(?, size_color),
             price = ?,
             stock = ?,
             low_stock_threshold = COALESCE(?, low_stock_threshold),
             image_url = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        barcode,
        normalizedProductCode,
        name,
        normalizedBrand,
        normalizedFamily,
        parsedSizeColor,
        parsedPrice,
        parsedStock,
        parsedThreshold,
        normalizedImageUrl,
        id
      );

    if (result.changes === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }

    const product = db.prepare(selectProductsSql("WHERE id = ?", "")).get(id);
    return res.json({ product });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Ese código de barras ya existe." });
    }

    return res.status(500).json({ message: "No se pudo actualizar el producto." });
  }
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }

  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);

  if (result.changes === 0) {
    return res.status(404).json({ message: "Producto no encontrado." });
  }

  return res.status(204).send();
});

router.post("/scan", (req, res) => {
  const { barcode, quantityDelta } = req.body || {};

  if (!barcode) {
    return res.status(400).json({ message: "Código de barras requerido." });
  }

  const delta = Number.isInteger(quantityDelta) ? quantityDelta : 1;
  const product = db
    .prepare(selectProductsSql("WHERE barcode = ?", ""))
    .get(barcode);

  if (!product) {
    return res.status(404).json({ message: "No existe un producto con ese código." });
  }

  const nextStock = product.stock + delta;
  if (nextStock < 0) {
    return res.status(400).json({ message: "El stock no puede quedar negativo." });
  }

  db.prepare("UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextStock, product.id);

  const updated = db
    .prepare(selectProductsSql("WHERE id = ?", ""))
    .get(product.id);

  return res.json({ product: updated });
});

module.exports = router;
