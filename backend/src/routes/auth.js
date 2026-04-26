const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

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

  return res.json({ user: req.session.user });
});

router.post("/logout", (req, res) => {
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
