const { buildInvoiceHtml } = require("./invoiceTemplate");

function toMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getEmailConfig() {
  const smtpUser = String(process.env.SMTP_USER || process.env.GMAIL_SMTP_USER || "").trim();
  const rawSmtpPass = String(
    process.env.SMTP_PASS || process.env.GMAIL_SMTP_PASS || process.env.GMAIL_SMTP_APP_PASSWORD || ""
  ).trim();
  const smtpPass = rawSmtpPass.replace(/\s+/g, "");
  const smtpHost = process.env.SMTP_HOST || (smtpUser ? "smtp.gmail.com" : "");
  const smtpPort = Number(process.env.SMTP_PORT || (smtpUser ? 587 : 0));
  const smtpSecure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || smtpPort === 465;
  const smtpFrom = String(process.env.SMTP_FROM || process.env.GMAIL_SMTP_FROM || smtpUser).trim();

  return {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser,
    pass: smtpPass,
    from: smtpFrom
  };
}

function isInvoiceEmailEnabled() {
  const cfg = getEmailConfig();
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from);
}

function getInvoiceEmailConfigError() {
  const cfg = getEmailConfig();
  const missing = [];
  if (!cfg.user) missing.push("SMTP_USER o GMAIL_SMTP_USER");
  if (!cfg.pass) missing.push("SMTP_PASS o GMAIL_SMTP_PASS");
  if (!cfg.from) missing.push("SMTP_FROM");
  if (!cfg.host) missing.push("SMTP_HOST");
  if (!cfg.port) missing.push("SMTP_PORT");
  if (!missing.length) {
    return "";
  }
  return `Configuración SMTP incompleta. Falta: ${missing.join(", ")}.`;
}

async function sendSaleInvoiceEmail(sale) {
  let nodemailer;
  try {
    // Optional dependency fallback: if nodemailer is unavailable we fail gracefully.
    nodemailer = require("nodemailer");
  } catch {
    const error = new Error("No se encontro nodemailer en el backend.");
    error.code = "EMAIL_DEP_MISSING";
    throw error;
  }

  const cfg = getEmailConfig();

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });

  const customerName = `${sale.customer_first_name || ""} ${sale.customer_last_name || ""}`.trim();
  const html = buildInvoiceHtml(sale, { autoPrint: false });

  return transport.sendMail({
    from: cfg.from,
    to: sale.customer_email,
    subject: `Factura ${sale.invoice_number} - Fito Deportes`,
    text: `Hola ${customerName || "cliente"}, tu factura ${sale.invoice_number} es por ${toMoney(sale.total_amount)}.`,
    html
  });
}

async function sendSaleQuoteEmail(sale) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    const error = new Error("No se encontro nodemailer en el backend.");
    error.code = "EMAIL_DEP_MISSING";
    throw error;
  }

  const cfg = getEmailConfig();

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });

  const customerName = `${sale.customer_first_name || ""} ${sale.customer_last_name || ""}`.trim();
  const html = buildInvoiceHtml(sale, { autoPrint: false, documentType: "quote" });

  return transport.sendMail({
    from: cfg.from,
    to: sale.customer_email,
    subject: `Presupuesto ${sale.invoice_number} - Fito Deportes`,
    text: `Hola ${customerName || "cliente"}, tu presupuesto ${sale.invoice_number} es por ${toMoney(sale.total_amount)}.`,
    html
  });
}

module.exports = {
  getInvoiceEmailConfigError,
  isInvoiceEmailEnabled,
  isValidEmail,
  sendSaleInvoiceEmail,
  sendSaleQuoteEmail
};
