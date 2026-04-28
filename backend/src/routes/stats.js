const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/overview", (_req, res) => {
  const todaySales = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM sales
       WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')`
    )
    .get();

  const paymentBreakdown = db
    .prepare(
      `SELECT payment_method, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
       FROM sales
       WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
       GROUP BY payment_method
       ORDER BY total DESC`
    )
    .all();

  const topProduct = db
    .prepare(
      `SELECT p.id, p.name, p.size_color,
              COALESCE(SUM(si.quantity), 0) AS total_units
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       GROUP BY p.id, p.name, p.size_color
       ORDER BY total_units DESC
       LIMIT 1`
    )
    .get();

  const lowStockProducts = db
    .prepare(
      `SELECT id, barcode, name, size_color, stock, low_stock_threshold
       FROM products
       WHERE stock <= low_stock_threshold
       ORDER BY stock ASC, name ASC
       LIMIT 20`
    )
    .all();

  const inventoryTotals = db
    .prepare(
      `SELECT COUNT(*) AS product_count, COALESCE(SUM(stock), 0) AS units_in_stock
       FROM products`
    )
    .get();

  const salesByUserToday = db
    .prepare(
      `SELECT u.id AS user_id,
              u.username,
              COALESCE(SUM(s.total_amount), 0) AS total,
              COUNT(s.id) AS ticket_count
       FROM users u
       LEFT JOIN sales s
         ON s.seller_user_id = u.id
        AND DATE(s.created_at, 'localtime') = DATE('now', 'localtime')
       GROUP BY u.id, u.username
       ORDER BY total DESC, ticket_count DESC, u.username ASC`
    )
    .all();

  return res.json({
    stats: {
      todaySalesTotal: Number(todaySales.total || 0),
      todayTickets: Number(todaySales.count || 0),
      paymentBreakdown,
      topProduct: topProduct || null,
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      productCount: Number(inventoryTotals.product_count || 0),
      unitsInStock: Number(inventoryTotals.units_in_stock || 0),
      salesByUserToday: salesByUserToday.map((item) => ({
        userId: item.user_id,
        username: item.username,
        total: Number(item.total || 0),
        ticketCount: Number(item.ticket_count || 0)
      }))
    }
  });
});

router.get("/top-products", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);

  const products = db
    .prepare(
      `SELECT p.id, p.name, p.size_color,
              COALESCE(SUM(si.quantity), 0) AS units_sold,
              COALESCE(SUM(si.line_total), 0) AS revenue
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       GROUP BY p.id, p.name, p.size_color
       ORDER BY units_sold DESC
       LIMIT ?`
    )
    .all(limit);

  return res.json({ products });
});

module.exports = router;
