const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getOpenCashSession() {
  return db
    .prepare(
      `SELECT id, opened_by_user_id, opening_amount
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
      `SELECT COALESCE(SUM(total_amount), 0) AS cash_sales_total
       FROM sales
       WHERE cash_session_id = ? AND payment_method = 'cash'`
    )
    .get(sessionId);
  return Number(result.cash_sales_total || 0);
}

function rotateCashSessionForUser(userId) {
  const tx = db.transaction(() => {
    const openSession = getOpenCashSession();

    if (openSession && Number(openSession.opened_by_user_id) === Number(userId)) {
      return;
    }

    if (openSession) {
      const cashSalesTotal = getCashTotalsBySession(openSession.id);
      const expectedAmount = toMoney(Number(openSession.opening_amount) + cashSalesTotal);

      db.prepare(
        `UPDATE cash_sessions
         SET status = 'closed',
             closed_by_user_id = ?,
             closing_amount = ?,
             expected_amount = ?,
             difference_amount = 0,
             closed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(userId, expectedAmount, expectedAmount, openSession.id);
    }

    db.prepare(
      `INSERT INTO cash_sessions (opened_by_user_id, opening_amount, status)
       VALUES (?, 0, 'open')`
    ).run(userId);
  });

  tx();
}

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username) {
    return res.status(400).json({ message: "Usuario obligatorio." });
  }

  const user = db
    .prepare(
      "SELECT id, username, role, requires_password, password_hash FROM users WHERE username = ?"
    )
    .get(username);

  if (!user) {
    return res.status(401).json({ message: "Credenciales inválidas." });
  }

  if (Number(user.requires_password) === 1) {
    if (!password) {
      return res.status(401).json({ message: "Este usuario requiere contraseña." });
    }

    let valid = false;
    try {
      valid = bcrypt.compareSync(password, user.password_hash);
    } catch {
      valid = false;
    }
    if (!valid) {
      return res.status(401).json({ message: "Credenciales inválidas." });
    }
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  rotateCashSessionForUser(user.id);

  return res.json({ user: req.session.user });
});

router.post("/logout", (req, res) => {
  const currentUserId = req.session?.user?.id;
  if (currentUserId) {
    const openSession = getOpenCashSession();
    if (openSession && Number(openSession.opened_by_user_id) === Number(currentUserId)) {
      const cashSalesTotal = getCashTotalsBySession(openSession.id);
      const expectedAmount = toMoney(Number(openSession.opening_amount) + cashSalesTotal);
      db.prepare(
        `UPDATE cash_sessions
         SET status = 'closed',
             closed_by_user_id = ?,
             closing_amount = ?,
             expected_amount = ?,
             difference_amount = 0,
             closed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(currentUserId, expectedAmount, expectedAmount, openSession.id);
    }
  }

  req.session.destroy(() => {
    res.clearCookie("fito-deportes.sid");
    res.status(204).send();
  });
});

router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: "No autenticado." });
  }

  return res.json({ user: req.session.user });
});

module.exports = router;
