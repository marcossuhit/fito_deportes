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

function resolveInvoiceLetterByIvaCondition(condition) {
  const raw = String(condition || "").trim().toLowerCase();
  if (
    raw === "iva resp inscripto" ||
    raw === "iva responsable inscripto" ||
    raw === "responsable inscripto" ||
    raw === "monotributo" ||
    raw === "monotributista"
  ) {
    return "A";
  }
  return "B";
}

function buildInvoiceHtml(sale, options = {}) {
  const documentTypeRaw = String(options.documentType || "invoice").toLowerCase();
  const documentType = documentTypeRaw === "quote" ? "quote" : documentTypeRaw === "arca" ? "arca" : "invoice";
  const isQuote = documentType === "quote";
  const isArca = documentType === "arca";
  const items = Array.isArray(sale?.items) ? sale.items.map(normalizeItem) : [];
  const total = Number(sale?.total_amount || 0);
  const saleDate = sale?.created_at ? new Date(sale.created_at).toLocaleString("es-AR") : "-";
  const issueDate = new Date().toLocaleString("es-AR");
  const customerName =
    `${sale?.customer_first_name || ""} ${sale?.customer_last_name || ""}`.trim() || "Consumidor Final";
  const customerCuit = String(sale?.customer_cuit || "-").trim() || "-";
  const autoPrint = Boolean(options.autoPrint);
  const docLabel = isQuote ? "PRESUPUESTO" : "FACTURA";
  const docNumberLabel = isQuote ? "Presupuesto N°" : "N°";
  const htmlTitle = `${docLabel} ${escapeHtml(sale?.invoice_number || "-")}`;
  const footerLegend = isQuote
    ? "Este documento es un presupuesto y no es valido como factura ni comprobante fiscal."
    : isArca
      ? "Comprobante fiscal autorizado por ARCA."
    : "Comprobante emitido por sistema interno Fito Deportes.";
  const arcaCae = String(sale?.arca_cae || "-");
  const arcaCaeVto = String(sale?.arca_cae_vto || "-");
  const arcaComprobanteLabel = `fac-${String(sale?.invoice_number || "-")}`;
  const arcaCbteTipo = Number(sale?.arca_cbte_tipo || 0);
  const arcaLetter = arcaCbteTipo === 1 ? "A" : "B";
  const arcaDocCode = arcaCbteTipo === 1 ? "001" : "006";
  const internalLetter = resolveInvoiceLetterByIvaCondition(sale?.customer_condicion_iva);

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

  if (isArca) {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${htmlTitle}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    .sheet { border: 2px solid #111827; min-height: 280mm; padding: 0; display: flex; flex-direction: column; background: #fff; }
    .top-original { text-align: center; font-weight: 800; border-bottom: 2px solid #111827; padding: 4px 0; letter-spacing: .03em; }
    .head { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 2px solid #111827; }
    .head > div { padding: 10px; min-height: 150px; }
    .head .left { border-right: 2px solid #111827; }
    .biz { font-size: 37px; font-weight: 800; margin: 0 0 8px; letter-spacing: .03em; }
    .muted { font-size: 12px; margin: 3px 0; }
    .doc-row { display: flex; align-items: stretch; gap: 10px; margin-bottom: 6px; }
    .letter { width: 66px; border: 2px solid #111827; display: grid; place-items: center; font-weight: 800; font-size: 36px; }
    .doctype { font-size: 28px; font-weight: 800; line-height: 1.1; }
    .doctype-code { font-size: 14px; font-weight: 700; }
    .kv { font-size: 12px; margin: 4px 0; }
    .kv b { display: inline-block; min-width: 122px; }
    .client { border-bottom: 2px solid #111827; padding: 0; }
    .client-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #111827; }
    .client-row:last-child { border-bottom: 0; }
    .client-cell { padding: 6px 10px; font-size: 12px; min-height: 30px; }
    .client-cell + .client-cell { border-left: 1px solid #111827; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #111827; padding: 3px 5px; }
    th { background: #f3f4f6; text-align: left; font-size: 11px; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .detail-wrap { padding: 0; }
    .spacer { flex: 1; }
    .totals { padding: 10px; display: flex; justify-content: space-between; border-top: 2px solid #111827; border-bottom: 2px solid #111827; }
    .totals .total { font-weight: 800; font-size: 16px; }
    .foot { padding: 10px; display: grid; grid-template-columns: 120px 1fr 1fr; gap: 12px; align-items: end; min-height: 120px; }
    .cae { font-size: 12px; }
    .cae b { display: inline-block; min-width: 120px; }
    .legend { font-size: 11px; color: #374151; text-align: right; }
    .qr-placeholder { width: 105px; height: 105px; border: 1px solid #111827; background:
      linear-gradient(45deg, #111 25%, transparent 25%) -4px 0/8px 8px,
      linear-gradient(-45deg, #111 25%, transparent 25%) -4px 0/8px 8px,
      linear-gradient(45deg, transparent 75%, #111 75%) -4px 0/8px 8px,
      linear-gradient(-45deg, transparent 75%, #111 75%) -4px 0/8px 8px;
      opacity: .15;
    }
    .auth { font-size: 11px; color: #111; margin-top: 4px; font-weight: 700; }
    .soft { color: #6b7280; font-size: 10px; }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="top-original">ORIGINAL</div>
    <section class="head">
      <div class="left">
        <h1 class="biz">FITO DEPORTES</h1>
        <p class="muted"><b>Razón Social:</b> FITO DEPORTES</p>
        <p class="muted"><b>Domicilio:</b> 4 de Abril 418</p>
        <p class="muted"><b>Localidad:</b> Tandil</p>
        <p class="muted"><b>Condición IVA:</b> Responsable Inscripto</p>
      </div>
      <div>
        <div class="doc-row">
          <div class="letter">${arcaLetter}</div>
          <div>
            <div class="doctype">FACTURA</div>
            <div class="doctype-code">(cod.${arcaDocCode})</div>
          </div>
        </div>
        <p class="kv"><b>Comprobante:</b> ${escapeHtml(arcaComprobanteLabel)}</p>
        <p class="kv"><b>Fecha Emisión:</b> ${escapeHtml(saleDate)}</p>
        <p class="kv"><b>CUIT:</b> 20333566096</p>
        <p class="kv"><b>Inicio Actividades:</b> 01/06/2014</p>
        <p class="kv"><b>ID ARCA:</b> ${escapeHtml(sale?.arca_comprobante_id || "-")}</p>
      </div>
    </section>

    <section class="client">
      <div class="client-row">
        <div class="client-cell"><b>Cliente:</b> ${escapeHtml(customerName)}</div>
        <div class="client-cell"><b>CUIT/DNI:</b> ${escapeHtml(customerCuit)}</div>
      </div>
      <div class="client-row">
        <div class="client-cell"><b>Domicilio:</b> -</div>
        <div class="client-cell"><b>Condición IVA:</b> ${escapeHtml(sale?.customer_condicion_iva || "Consumidor Final")}</div>
      </div>
    </section>

    <section class="detail-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th class="num">Cantidad</th>
            <th class="num">Precio Unit.</th>
            <th class="num">Descuento</th>
            <th class="num">Alícuota %</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${
            items
              .map(
                (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.description)} <span class="muted">${escapeHtml(item.variant)}</span></td>
              <td class="num">${item.quantity.toFixed(2)}</td>
              <td class="num">${Number(item.unitPrice).toFixed(2)}</td>
              <td class="num">0.00</td>
              <td class="num">21.00</td>
              <td class="num">${Number(item.lineTotal).toFixed(2)}</td>
            </tr>`
              )
              .join("") || '<tr><td colspan="7" style="text-align:center">Sin items</td></tr>'
          }
        </tbody>
      </table>
    </section>

    <div class="spacer"></div>

    <section class="totals">
      <div><b>Pagos</b><br/><span class="soft">${escapeHtml(paymentMethodLabel(sale?.payment_method))}: ${toMoney(total)}</span></div>
      <div class="total">Importe Total: ${toMoney(total)}</div>
    </section>

    <section class="foot">
      <div>
        <div class="qr-placeholder"></div>
        <div class="auth">Comprobante Autorizado</div>
      </div>
      <div class="cae">
        <div><b>CAE Nro:</b> ${escapeHtml(arcaCae)}</div>
        <div><b>Fecha Vto CAE:</b> ${escapeHtml(arcaCaeVto)}</div>
      </div>
      <div class="legend">
        Comprobante autorizado por ARCA<br/>
        Impreso: ${escapeHtml(issueDate)}
      </div>
    </section>
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

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${htmlTitle}</title>
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
        <p class="sub"><strong>CUIT:</strong> 20333566096</p>
        <p class="sub"><strong>Domicilio comercial:</strong> Tandil, Buenos Aires, Argentina</p>
        <p class="sub"><strong>Condicion frente al IVA:</strong> Responsable Inscripto</p>
      </div>
      <div class="doc">
        <div class="type">${docLabel}</div>
        <div class="letter">${internalLetter}</div>
        <div class="sub"><strong>${docNumberLabel}:</strong> ${escapeHtml(sale?.invoice_number || "-")}</div>
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

    ${
      isArca
        ? `<section class="box grid2">
      <div>
        <div class="label">CAE</div>
        <div class="value">${escapeHtml(arcaCae)}</div>
      </div>
      <div>
        <div class="label">Vencimiento CAE</div>
        <div class="value">${escapeHtml(arcaCaeVto)}</div>
      </div>
    </section>`
        : ""
    }

    <p class="footer">
      ${footerLegend} Fecha de impresion: ${escapeHtml(issueDate)}.
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
