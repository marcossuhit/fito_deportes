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

function normalizeIvaCondition(payload) {
  return String(
    payload?.customerIvaCondition ||
    payload?.customer_iva_condition ||
    payload?.condicionIva ||
    ""
  )
    .trim()
    .toLowerCase();
}

function isConsumidorFinal(ivaCondition) {
  return ivaCondition === "consu final" || ivaCondition === "consumidoriva final" || ivaCondition === "consumidor final";
}

function parseDocNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCuit(raw) {
  if (!/^\d{11}$/.test(raw)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const check = raw
    .slice(0, 10)
    .split("")
    .reduce((sum, digit, idx) => sum + Number(digit) * weights[idx], 0);
  const mod = 11 - (check % 11);
  const verifier = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return verifier === Number(raw[10]);
}

function docFromPayload(payload, docTipoDefault) {
  const explicitDocTipo = Number(
    payload?.customerDocTipo || payload?.customer_doc_tipo || payload?.docTipo || payload?.doc_tipo || 0
  );
  const explicitDocNroRaw = parseDocNumber(
    payload?.customerDocNro || payload?.customer_doc_nro || payload?.docNro || payload?.doc_nro
  );

  if (Number.isInteger(explicitDocTipo) && explicitDocTipo > 0) {
    return {
      docTipo: explicitDocTipo,
      docNro: explicitDocNroRaw ? Number(explicitDocNroRaw) : 0
    };
  }

  const ivaCondition = normalizeIvaCondition(payload);
  const rawDoc = parseDocNumber(
    payload?.customerCuit ||
    payload?.customer_cuit ||
    payload?.customerDocNro ||
    payload?.customer_doc_nro
  );

  if (isConsumidorFinal(ivaCondition)) {
    if (rawDoc.length >= 7 && rawDoc.length <= 8) {
      return { docTipo: 96, docNro: Number(rawDoc) }; // DNI
    }
    return { docTipo: Number(docTipoDefault || 99), docNro: 0 };
  }

  if (isValidCuit(rawDoc)) {
    return { docTipo: 80, docNro: Number(rawDoc) }; // CUIT
  }

  if (rawDoc.length >= 7 && rawDoc.length <= 8) {
    return { docTipo: 96, docNro: Number(rawDoc) }; // DNI
  }

  return { docTipo: Number(docTipoDefault || 99), docNro: 0 };
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

function condicionIvaReceptorIdFromPayload(payload) {
  const raw = normalizeIvaCondition(payload);

  const byName = new Map([
    ["iva resp inscripto", 1],
    ["iva responsable inscripto", 1],
    ["responsable inscripto", 1],
    ["monotributo", 6],
    ["exento", 4],
    ["iva exento", 4],
    ["consumidor final", 5],
    ["consu final", 5],
    ["consumidoriva final", 5],
    ["monotributista", 6],
    ["iva no alcanzado", 7],
    ["sujeto no categorizado", 7],
    ["proveedor del exterior", 8],
    ["cliente del exterior", 9],
    ["iva liberado - ley 19.640", 10],
    ["iva liberado", 10],
    ["monotributista social", 13],
    ["pequeño contribuyente eventual", 15],
    ["responsable no inscripto", 15]
  ]);

  if (byName.has(raw)) {
    return byName.get(raw);
  }
  return 5;
}

function resolveCbteTipoFromPayload(payload, fallbackCbteTipo) {
  const raw = normalizeIvaCondition(payload);

  // Factura A
  if (
    raw === "iva resp inscripto" ||
    raw === "iva responsable inscripto" ||
    raw === "responsable inscripto" ||
    raw === "monotributo" ||
    raw === "monotributista"
  ) {
    return 1;
  }

  // Factura B
  if (
    raw === "iva exento" ||
    raw === "exento" ||
    raw === "consu final" ||
    raw === "consumidoriva final" ||
    raw === "consumidor final" ||
    raw === "iva no alcanzado"
  ) {
    return 6;
  }

  return Number(fallbackCbteTipo || 6);
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
    const condicionIvaReceptorId = condicionIvaReceptorIdFromPayload(payload);
    const cbteTipo = resolveCbteTipoFromPayload(payload, cfg.cbteTipo);

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
      cbteTipo,
      timeoutMs: cfg.timeoutMs
    });

    const cbteDesde = Number(ultimo) + 1;
    const result = await createComprobante({
      wsfeUrl: cfg.wsfeUrl,
      auth,
      cuit: cfg.cuit,
      ptoVta: cfg.ptoVta,
      cbteTipo,
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
      condicionIvaReceptorId,
      timeoutMs: cfg.timeoutMs
    });

    return res.status(201).json({
      comprobanteId: result.comprobanteId,
      cae: result.cae,
      caeVto: result.caeVto,
      cbteNro: result.cbteNro,
      cbteTipo,
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
