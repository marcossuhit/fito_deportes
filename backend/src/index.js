require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");

require("./db");
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const salesRoutes = require("./routes/sales");
const cashRoutes = require("./routes/cash");
const statsRoutes = require("./routes/stats");
const { requireAuth } = require("./middleware/auth");

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true
  })
);

app.use(express.json());

app.use(
  session({
    name: "fito-deportes.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-cambiar",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", requireAuth, productRoutes);
app.use("/api/sales", requireAuth, salesRoutes);
app.use("/api/cash", requireAuth, cashRoutes);
app.use("/api/stats", requireAuth, statsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Error interno del servidor." });
});

app.listen(port, () => {
  console.log(`Backend fito-deportes escuchando en http://localhost:${port}`);
});
