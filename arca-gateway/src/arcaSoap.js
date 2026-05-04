"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseTag(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = String(xml || "").match(regex);
  return match ? match[1].trim() : "";
}

function defaultWsaaUrl(mode) {
  return mode === "produccion"
    ? "https://wsaa.afip.gov.ar/ws/services/LoginCms"
    : "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
}

function defaultWsfeUrl(mode) {
  return mode === "produccion"
    ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
    : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
}

function buildTra({ service, cuit }) {
  const now = new Date();
  const gen = new Date(now.getTime() - 60 * 1000).toISOString();
  const exp = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const uniqueId = String(Math.floor(now.getTime() / 1000));

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${gen}</generationTime>
    <expirationTime>${exp}</expirationTime>
  </header>
  <service>${escapeXml(service)}</service>
  <destination>cn=${escapeXml(cuit)},o=afip,c=ar,serialNumber=CUIT ${escapeXml(cuit)}</destination>
</loginTicketRequest>`;
}

async function signTraCmsBase64({ traXml, certPath, keyPath }) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arca-"));
  const traFile = path.join(tempDir, "tra.xml");
  const outFile = path.join(tempDir, "tra.cms");

  try {
    await fs.promises.writeFile(traFile, traXml, "utf8");
    await execFileAsync("openssl", [
      "smime",
      "-sign",
      "-signer",
      certPath,
      "-inkey",
      keyPath,
      "-in",
      traFile,
      "-outform",
      "DER",
      "-nodetach",
      "-out",
      outFile
    ]);

    const cmsBuffer = await fs.promises.readFile(outFile);
    return cmsBuffer.toString("base64");
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function postSoap({ url, soapAction, xml, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: soapAction
      },
      body: xml,
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SOAP HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    if (/faultstring/i.test(text)) {
      const fault = parseTag(text, "faultstring") || "SOAP Fault";
      throw new Error(`SOAP Fault: ${fault}`);
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function loginCms({ wsaaUrl, certPath, keyPath, timeoutMs, cuit }) {
  const traXml = buildTra({ service: "wsfe", cuit });
  const cms = await signTraCmsBase64({ traXml, certPath, keyPath });

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const raw = await postSoap({
    url: wsaaUrl,
    soapAction: "",
    xml: envelope,
    timeoutMs
  });

  const loginTicketResponse = parseTag(raw, "loginCmsReturn");
  if (!loginTicketResponse) {
    throw new Error("WSAA no devolvió loginCmsReturn.");
  }

  const token = parseTag(loginTicketResponse, "token");
  const sign = parseTag(loginTicketResponse, "sign");

  if (!token || !sign) {
    throw new Error("WSAA no devolvió token/sign válidos.");
  }

  return { token, sign, raw: loginTicketResponse };
}

async function getLastAuthorized({ wsfeUrl, auth, cuit, ptoVta, cbteTipo, timeoutMs }) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${escapeXml(auth.token)}</ar:Token>
        <ar:Sign>${escapeXml(auth.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(cuit)}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${escapeXml(ptoVta)}</ar:PtoVta>
      <ar:CbteTipo>${escapeXml(cbteTipo)}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;

  const raw = await postSoap({
    url: wsfeUrl,
    soapAction: "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
    xml: envelope,
    timeoutMs
  });

  const nro = parseInt(parseTag(raw, "CbteNro"), 10);
  if (!Number.isInteger(nro)) {
    throw new Error("No se pudo obtener CbteNro en FECompUltimoAutorizado.");
  }

  return nro;
}

async function createComprobante({
  wsfeUrl,
  auth,
  cuit,
  ptoVta,
  cbteTipo,
  cbteDesde,
  docTipo,
  docNro,
  impNeto,
  impIva,
  impTotal,
  ivaId,
  ivaBaseImp,
  ivaImporte,
  concepto,
  monId,
  monCotiz,
  timeoutMs
}) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${escapeXml(auth.token)}</ar:Token>
        <ar:Sign>${escapeXml(auth.sign)}</ar:Sign>
        <ar:Cuit>${escapeXml(cuit)}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${escapeXml(ptoVta)}</ar:PtoVta>
          <ar:CbteTipo>${escapeXml(cbteTipo)}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${escapeXml(concepto)}</ar:Concepto>
            <ar:DocTipo>${escapeXml(docTipo)}</ar:DocTipo>
            <ar:DocNro>${escapeXml(docNro)}</ar:DocNro>
            <ar:CbteDesde>${escapeXml(cbteDesde)}</ar:CbteDesde>
            <ar:CbteHasta>${escapeXml(cbteDesde)}</ar:CbteHasta>
            <ar:CbteFch>${today}</ar:CbteFch>
            <ar:ImpTotal>${escapeXml(impTotal.toFixed(2))}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${escapeXml(impNeto.toFixed(2))}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>${escapeXml(impIva.toFixed(2))}</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>${escapeXml(monId)}</ar:MonId>
            <ar:MonCotiz>${escapeXml(String(monCotiz))}</ar:MonCotiz>
            <ar:Iva>
              <ar:AlicIva>
                <ar:Id>${escapeXml(ivaId)}</ar:Id>
                <ar:BaseImp>${escapeXml(ivaBaseImp.toFixed(2))}</ar:BaseImp>
                <ar:Importe>${escapeXml(ivaImporte.toFixed(2))}</ar:Importe>
              </ar:AlicIva>
            </ar:Iva>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  const raw = await postSoap({
    url: wsfeUrl,
    soapAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
    xml: envelope,
    timeoutMs
  });

  const resultado = parseTag(raw, "Resultado");
  const cae = parseTag(raw, "CAE");
  const caeVto = parseTag(raw, "CAEFchVto");
  const cbteNro = parseTag(raw, "CbteDesde") || String(cbteDesde);

  if (String(resultado).toUpperCase() !== "A" || !cae) {
    const errMsg = parseTag(raw, "Msg") || parseTag(raw, "ErrMsg") || "ARCA rechazó el comprobante.";
    throw new Error(errMsg);
  }

  return {
    comprobanteId: `${ptoVta}-${cbteTipo}-${cbteNro}-CAE-${cae}`,
    cae,
    caeVto,
    cbteNro,
    raw
  };
}

function buildConfigFromEnv() {
  const mode = String(process.env.ARCA_MODE || "homologacion").toLowerCase();
  const timeoutMs = Number(process.env.HTTP_TIMEOUT_MS || 30000);

  return {
    mode,
    timeoutMs,
    cuit: String(process.env.ARCA_CUIT || "").trim(),
    certPath: String(process.env.ARCA_CERT_PATH || "").trim(),
    keyPath: String(process.env.ARCA_KEY_PATH || "").trim(),
    wsaaUrl: String(process.env.WSAA_URL || "").trim() || defaultWsaaUrl(mode),
    wsfeUrl: String(process.env.WSFE_URL || "").trim() || defaultWsfeUrl(mode),
    ptoVta: Number(process.env.ARCA_PTO_VTA || 1),
    cbteTipo: Number(process.env.ARCA_CBTE_TIPO || 6),
    concepto: Number(process.env.ARCA_CONCEPTO || 1),
    docTipoDefault: Number(process.env.ARCA_DOC_TIPO_DEFAULT || 99),
    monId: String(process.env.ARCA_MON_ID || "PES").trim(),
    monCotiz: Number(process.env.ARCA_MON_COTIZ || 1),
    ivaRate: Number(process.env.ARCA_IMP_IVA_RATE || 21)
  };
}

module.exports = {
  loginCms,
  getLastAuthorized,
  createComprobante,
  buildConfigFromEnv
};
