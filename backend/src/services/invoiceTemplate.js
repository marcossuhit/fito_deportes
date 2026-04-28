function toMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paymentMethodLabel(value) {
  const key = String(value || "").toLowerCase();
  if (key === "cash") return "Efectivo";
  if (key === "card") return "Tarjeta";
  if (key === "transfer") return "Transferencia";
  if (key === "other") return "Otro";
  return value || "-";
}

function normalizeItem(item) {
  return {
    description: item.productName || item.product_name_snapshot || "Articulo",
    variant: item.sizeColor || item.size_color_snapshot || "-",
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
    lineTotal: Number(item.lineTotal ?? item.line_total ?? 0)
  };
}

function buildInvoiceHtml(sale, options = {}) {
  const items = Array.isArray(sale?.items) ? sale.items.map(normalizeItem) : [];
  const total = Number(sale?.total_amount || 0);
  const saleDate = sale?.created_at ? new Date(sale.created_at).toLocaleString("es-AR") : "-";
  const issueDate = new Date().toLocaleString("es-AR");
  const customerName =
    `${sale?.customer_first_name || ""} ${sale?.customer_last_name || ""}`.trim() || "Consumidor Final";
  const customerCuit = String(sale?.customer_cuit || "-").trim() || "-";
  const autoPrint = Boolean(options.autoPrint);

  const rows = items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.description)}<br/><span class="muted">${escapeHtml(item.variant)}</span></td>
          <td>${item.quantity}</td>
          <td>${toMoney(item.unitPrice)}</td>
          <td>${toMoney(item.lineTotal)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Factura ${escapeHtml(sale?.invoice_number || "-")}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
    .invoice { border: 2px solid #0f172a; padding: 14px; }
    .row { display: flex; gap: 12px; }
    .between { justify-content: space-between; align-items: flex-start; }
    .brand { width: 65%; }
    .doc { width: 35%; border: 2px solid #0f172a; padding: 10px; text-align: center; }
    .doc .type { font-size: 22px; font-weight: 800; letter-spacing: .04em; }
    .doc .letter { margin: 6px auto; width: 44px; height: 44px; border: 2px solid #0f172a; border-radius: 50%; display: grid; place-items: center; font-size: 24px; font-weight: 800; }
    .title { font-size: 26px; font-weight: 800; margin: 0 0 4px; }
    .sub { font-size: 12px; color: #374151; margin: 2px 0; }
    .box { border: 1px solid #94a3b8; padding: 10px; margin-top: 10px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; font-size: 12px; }
    .label { color: #475569; font-weight: 700; text-transform: uppercase; font-size: 11px; }
    .value { font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
    th { background: #e2e8f0; text-transform: uppercase; font-size: 11px; }
    td:nth-child(1), td:nth-child(3), td:nth-child(4), td:nth-child(5) { text-align: right; white-space: nowrap; }
    .muted { color: #64748b; font-size: 11px; }
    .totals { margin-top: 12px; width: 310px; margin-left: auto; border: 1px solid #94a3b8; }
    .totals .line { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
    .totals .line:last-child { border-bottom: 0; font-size: 16px; font-weight: 800; background: #dcfce7; }
    .footer { margin-top: 12px; font-size: 11px; color: #334155; border-top: 1px dashed #94a3b8; padding-top: 8px; }
  </style>
</head>
<body>
  <main class="invoice">
    <section class="row between">
      <div class="brand">
        <h1 class="title">FITO DEPORTES</h1>
        <p class="sub">Indumentaria y articulos deportivos</p>
        <p class="sub"><strong>CUIT:</strong> 30-71234567-8 | <strong>Ingresos Brutos:</strong> 901-123456-7</p>
        <p class="sub"><strong>Domicilio comercial:</strong> Buenos Aires, Argentina</p>
        <p class="sub"><strong>Condicion frente al IVA:</strong> Responsable Inscripto</p>
      </div>
      <div class="doc">
        <div class="type">FACTURA</div>
        <div class="letter">B</div>
        <div class="sub"><strong>N°:</strong> ${escapeHtml(sale?.invoice_number || "-")}</div>
        <div class="sub"><strong>Fecha:</strong> ${escapeHtml(saleDate)}</div>
      </div>
    </section>

    <section class="box grid2">
      <div>
        <div class="label">Cliente</div>
        <div class="value">${escapeHtml(customerName)}</div>
      </div>
      <div>
        <div class="label">CUIT/DNI</div>
        <div class="value">${escapeHtml(customerCuit)}</div>
      </div>
      <div>
        <div class="label">Vendedor</div>
        <div class="value">${escapeHtml(sale?.seller || "-")}</div>
      </div>
      <div>
        <div class="label">Medio de pago</div>
        <div class="value">${escapeHtml(paymentMethodLabel(sale?.payment_method))}</div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Detalle</th>
          <th>Cant.</th>
          <th>P. Unit.</th>
          <th>Importe</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="text-align:center">Sin items</td></tr>'}
      </tbody>
    </table>

    <section class="totals">
      <div class="line"><span>Total</span><span>${toMoney(total)}</span></div>
    </section>

    <p class="footer">
      Comprobante emitido por sistema interno Fito Deportes. Fecha de impresion: ${escapeHtml(issueDate)}.
    </p>
  </main>
  ${
    autoPrint
      ? `<script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>`
      : ""
  }
</body>
</html>`;
}

module.exports = {
  buildInvoiceHtml
};
