const express = require("express");
const db = require("../db");

const router = express.Router();

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getOpenCashSession() {
  return db
    .prepare(
      `SELECT id, opened_by_user_id, closed_by_user_id, opening_amount, closing_amount,
              expected_amount, difference_amount, status, opened_at, closed_at
       FROM cash_sessions
       WHERE status = 'open'
       ORDER BY opened_at DESC
       LIMIT 1`
    )
    .get();
}

function getCashTotalsBySession(sessionId) {
  const result = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS cash_sales_total,
              COUNT(*) AS cash_sales_count
       FROM sales
       WHERE cash_session_id = ? AND payment_method = 'cash'`
    )
    .get(sessionId);

  return {
    cashSalesTotal: Number(result.cash_sales_total || 0),
    cashSalesCount: Number(result.cash_sales_count || 0)
  };
}

router.get("/status", (_req, res) => {
  const openSession = getOpenCashSession();

  if (!openSession) {
    return res.json({ openSession: null, metrics: null });
  }

  const totals = getCashTotalsBySession(openSession.id);
  const expectedAmount = toMoney(Number(openSession.opening_amount) + totals.cashSalesTotal);

  return res.json({
    openSession,
    metrics: {
      cashSalesTotal: totals.cashSalesTotal,
      cashSalesCount: totals.cashSalesCount,
      expectedAmount
    }
  });
});

router.get("/history", (_req, res) => {
  const sessions = db
    .prepare(
      `SELECT cs.id, cs.opening_amount, cs.closing_amount, cs.expected_amount, cs.difference_amount,
              cs.status, cs.opened_at, cs.closed_at,
              ou.username AS opened_by,
              cu.username AS closed_by
       FROM cash_sessions cs
       JOIN users ou ON ou.id = cs.opened_by_user_id
       LEFT JOIN users cu ON cu.id = cs.closed_by_user_id
       ORDER BY cs.opened_at DESC
       LIMIT 20`
    )
    .all();

  return res.json({ sessions });
});

router.post("/open", (req, res) => {
  const openingAmount = Number(req.body?.openingAmount ?? 0);

  if (Number.isNaN(openingAmount) || openingAmount < 0) {
    return res.status(400).json({ message: "Monto inicial inválido." });
  }

  const currentOpen = getOpenCashSession();
  if (currentOpen) {
    return res.status(409).json({ message: "Ya hay una caja abierta." });
  }

  const result = db
    .prepare(
      `INSERT INTO cash_sessions (opened_by_user_id, opening_amount, status)
       VALUES (?, ?, 'open')`
    )
    .run(req.session.user.id, toMoney(openingAmount));

  const openSession = db
    .prepare(
      `SELECT id, opened_by_user_id, closed_by_user_id, opening_amount, closing_amount,
              expected_amount, difference_amount, status, opened_at, closed_at
       FROM cash_sessions
       WHERE id = ?`
    )
    .get(result.lastInsertRowid);

  return res.status(201).json({ openSession });
});

router.post("/close", (req, res) => {
  const closingAmount = Number(req.body?.closingAmount);

  if (Number.isNaN(closingAmount) || closingAmount < 0) {
    return res.status(400).json({ message: "Monto de cierre inválido." });
  }

  const openSession = getOpenCashSession();
  if (!openSession) {
    return res.status(400).json({ message: "No hay caja abierta." });
  }

  const totals = getCashTotalsBySession(openSession.id);
  const expectedAmount = toMoney(Number(openSession.opening_amount) + totals.cashSalesTotal);
  const roundedClosing = toMoney(closingAmount);
  const differenceAmount = toMoney(roundedClosing - expectedAmount);

  db.prepare(
    `UPDATE cash_sessions
     SET status = 'closed',
         closed_by_user_id = ?,
         closing_amount = ?,
         expected_amount = ?,
         difference_amount = ?,
         closed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(req.session.user.id, roundedClosing, expectedAmount, differenceAmount, openSession.id);

  const closedSession = db
    .prepare(
      `SELECT id, opened_by_user_id, closed_by_user_id, opening_amount, closing_amount,
              expected_amount, difference_amount, status, opened_at, closed_at
       FROM cash_sessions
       WHERE id = ?`
    )
    .get(openSession.id);

  return res.json({
    closedSession,
    metrics: {
      cashSalesTotal: totals.cashSalesTotal,
      cashSalesCount: totals.cashSalesCount,
      expectedAmount,
      differenceAmount
    }
  });
});

module.exports = router;
