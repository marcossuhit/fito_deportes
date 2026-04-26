"use strict";

const DEFAULT_TIMEOUT_MS = Number(process.env.ARCA_TIMEOUT_MS || 20000);

function buildAbortController(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pickComprobanteId(payload) {
  if (!payload || typeof payload !== "object") return null;

  return (
    payload.comprobanteId ||
    payload.comprobante_id ||
    payload.idComprobante ||
    payload.id ||
    payload?.data?.comprobanteId ||
    payload?.data?.idComprobante ||
    payload?.data?.id ||
    null
  );
}

function buildArcaPayload({ sale, items }) {
  return {
    sourceSystem: "fito-deportes",
    saleId: sale.id,
    invoiceNumber: sale.invoice_number,
    createdAt: sale.created_at,
    seller: sale.seller,
    paymentMethod: sale.payment_method,
    totalAmount: Number(sale.total_amount),
    items: (items || []).map((item) => ({
      productId: item.product_id,
      description: item.product_name_snapshot,
      variant: item.size_color_snapshot,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total)
    }))
  };
}

async function issueArcaComprobante({ sale, items }) {
  const mockMode = String(process.env.ARCA_MOCK_MODE || "").toLowerCase() === "1";
  const apiUrl = process.env.ARCA_COMPROBANTE_URL;
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const useDevFallbackMock = !apiUrl && !isProduction;

  if (mockMode || useDevFallbackMock) {
    return {
      comprobanteId: `ARCA-MOCK-${sale.id}-${Date.now()}`,
      raw: {
        mock: true,
        message: mockMode
          ? "Comprobante ARCA simulado en modo mock."
          : "Comprobante ARCA simulado automáticamente (dev sin ARCA_COMPROBANTE_URL)."
      }
    };
  }

  if (!apiUrl) {
    const error = new Error(
      "No está configurado ARCA_COMPROBANTE_URL. Definí la URL del WS ARCA o activá ARCA_MOCK_MODE=1."
    );
    error.status = 500;
    throw error;
  }

  const payload = buildArcaPayload({ sale, items });
  const headers = {
    "Content-Type": "application/json"
  };

  if (process.env.ARCA_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ARCA_TOKEN}`;
  }

  const { controller, timeout } = buildAbortController(DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    const json = safeJsonParse(text);

    if (!response.ok) {
      const detail = json?.message || text || "sin detalle";
      const error = new Error(`ARCA respondió ${response.status}: ${detail}`);
      error.status = 502;
      throw error;
    }

    const comprobanteId = pickComprobanteId(json);
    if (!comprobanteId) {
      const error = new Error("ARCA respondió OK pero no devolvió identificador de comprobante.");
      error.status = 502;
      throw error;
    }

    return {
      comprobanteId: String(comprobanteId),
      raw: json ?? { raw: text }
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  issueArcaComprobante
};
