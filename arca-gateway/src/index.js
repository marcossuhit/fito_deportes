"use strict";

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const {
  loginCms,
  getLastAuthorized,
  createComprobante,
  buildConfigFromEnv
} = require("./arcaSoap");

const app = express();
app.use(express.json({ limit: "2mb" }));

const port = Number(process.env.PORT || 3090);
const apiToken = String(process.env.API_TOKEN || "").trim();

function unauthorized(res) {
  return res.status(401).json({ message: "No autorizado." });
}

function authMiddleware(req, res, next) {
  if (!apiToken) {
    return res.status(500).json({ message: "API_TOKEN no configurado en ARCA gateway." });
  }

  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return unauthorized(res);
  }

  const token = auth.slice("Bearer ".length).trim();
  if (token !== apiToken) {
    return unauthorized(res);
  }

  return next();
}

function validateConfig(cfg) {
  if (!cfg.cuit) throw new Error("ARCA_CUIT no configurado.");
  if (!cfg.certPath || !fs.existsSync(cfg.certPath)) throw new Error("ARCA_CERT_PATH inválido o inexistente.");
  if (!cfg.keyPath || !fs.existsSync(cfg.keyPath)) throw new Error("ARCA_KEY_PATH inválido o inexistente.");
  if (!Number.isInteger(cfg.ptoVta) || cfg.ptoVta <= 0) throw new Error("ARCA_PTO_VTA inválido.");
  if (!Number.isInteger(cfg.cbteTipo) || cfg.cbteTipo <= 0) throw new Error("ARCA_CBTE_TIPO inválido.");
}

function docFromPayload(payload, docTipoDefault) {
  const raw = String(payload?.customerCuit || payload?.customer_cuit || "").replace(/\D/g, "");
  if (raw.length >= 8) {
    return { docTipo: 80, docNro: Number(raw) }; // CUIT
  }
  return { docTipo: Number(docTipoDefault), docNro: 0 };
}

function amountsFromPayload(payload, ivaRate) {
  const total = Number(payload?.totalAmount || payload?.total_amount || 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("totalAmount inválido.");
  }

  const divisor = 1 + ivaRate / 100;
  const impNeto = Number((total / divisor).toFixed(2));
  const impIva = Number((total - impNeto).toFixed(2));

  return {
    impTotal: Number(total.toFixed(2)),
    impNeto,
    impIva,
    ivaRate
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/comprobantes", authMiddleware, async (req, res) => {
  try {
    const cfg = buildConfigFromEnv();
    validateConfig(cfg);

    const payload = req.body || {};
    const { docTipo, docNro } = docFromPayload(payload, cfg.docTipoDefault);
    const { impTotal, impNeto, impIva, ivaRate } = amountsFromPayload(payload, cfg.ivaRate);

    const auth = await loginCms({
      wsaaUrl: cfg.wsaaUrl,
      certPath: cfg.certPath,
      keyPath: cfg.keyPath,
      timeoutMs: cfg.timeoutMs,
      cuit: cfg.cuit
    });

    const ultimo = await getLastAuthorized({
      wsfeUrl: cfg.wsfeUrl,
      auth,
      cuit: cfg.cuit,
      ptoVta: cfg.ptoVta,
      cbteTipo: cfg.cbteTipo,
      timeoutMs: cfg.timeoutMs
    });

    const cbteDesde = Number(ultimo) + 1;
    const result = await createComprobante({
      wsfeUrl: cfg.wsfeUrl,
      auth,
      cuit: cfg.cuit,
      ptoVta: cfg.ptoVta,
      cbteTipo: cfg.cbteTipo,
      cbteDesde,
      docTipo,
      docNro,
      impNeto,
      impIva,
      impTotal,
      ivaId: 5,
      ivaBaseImp: impNeto,
      ivaImporte: impIva,
      concepto: cfg.concepto,
      monId: cfg.monId,
      monCotiz: cfg.monCotiz,
      timeoutMs: cfg.timeoutMs
    });

    return res.status(201).json({
      comprobanteId: result.comprobanteId,
      cae: result.cae,
      caeVto: result.caeVto,
      cbteNro: result.cbteNro,
      mode: cfg.mode
    });
  } catch (error) {
    console.error("Error ARCA gateway:", error);
    return res.status(502).json({ message: error.message || "No se pudo emitir comprobante ARCA." });
  }
});

app.listen(port, () => {
  console.log(`ARCA gateway escuchando en http://localhost:${port}`);
});
