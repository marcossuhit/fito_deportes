import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { api } from "./api";

const emptyForm = {
  barcode: "",
  name: "",
  brand: "",
  family: "",
  color: "",
  price: "",
  image_url: "",
  variants: [{ size: "", stock: "", low_stock_threshold: "2" }]
};
const emptyClientForm = {
  firstName: "",
  lastName: "",
  cuit: "",
  phone: "",
  email: "",
  condicionIva: "Consumidor Final"
};
const ivaConditionOptions = [
  "IVA Responsable Inscripto",
  "Monotributo",
  "IVA Exento",
  "Consumidor Final",
  "IVA No Alcanzado"
];

const productBrandOptionsRaw = [
  "JIU JISTU",
  "SPORTCOM/DRB",
  "KONNA",
  "GYMTONIC",
  "PROYEC",
  "POWERTECH",
  "ADIDAS",
  "MARATÓN",
  "ENE EME",
  "MD BUDDY",
  "IMPORTADO VARIOS"
];

const productBrandOptions = [
  ...productBrandOptionsRaw
    .filter((option) => option !== "IMPORTADO VARIOS")
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
  "IMPORTADO VARIOS"
];

const productFamilyOptions = [
  "Accesorios",
  "Atletismo",
  "Bandas",
  "Basquet",
  "Bastones",
  "Boxeo y artes marciales",
  "Colchonetas",
  "Combos",
  "Coordinacion",
  "Crossfit",
  "Deportes Raqueta y Paleta",
  "Equilibrio Propiocepcion",
  "Fitness",
  "Futbol",
  "Handball",
  "Hockey",
  "Juegos y Juguetes",
  "Kinesiologia, Masajes, Rehabilitación",
  "MAS VENDIDOS",
  "Musculacion",
  "Natacion",
  "Novedades",
  "OFERTAS",
  "Pelotas",
  "Pilates / Yoga",
  "Pisos",
  "Psicomotricidad",
  "Rugby",
  "Softball",
  "Suplementos Alimenticios",
  "Tobilleras",
  "Voley",
  "Zapatillas trail running"
].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
const defaultSizeOptions = ["XS", "S", "M", "L", "XL", "XXL"];
const shoesSizeOptions = Array.from({ length: 45 - 21 + 1 }, (_, index) => String(21 + index));

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const sqliteMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (sqliteMatch) {
    const [, year, month, day, hour, minute, second, milliseconds] = sqliteMatch;
    const normalizedMs = `${milliseconds || "0"}`.padEnd(3, "0");
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${normalizedMs}-03:00`);
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseDateValue(value);
  if (!date) {
    return "-";
  }

  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false
  });
}

function paymentMethodLabel(value) {
  const key = String(value || "").toLowerCase();
  if (key === "cash") return "Efectivo";
  if (key === "card") return "Tarjeta";
  if (key === "transfer") return "Transferencia";
  if (key === "other") return "Otro";
  return value || "-";
}

function paymentMethodTone(value) {
  const key = String(value || "").toLowerCase();
  if (key === "cash") return "bg-emerald-100 text-emerald-800";
  if (key === "card") return "bg-blue-100 text-blue-800";
  if (key === "transfer") return "bg-indigo-100 text-indigo-800";
  return "bg-slate-200 text-slate-800";
}

function splitSizeColor(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { size: "", color: "" };
  }
  if (raw.includes("/")) {
    const [sizePart, colorPart] = raw.split("/").map((item) => item.trim());
    return { size: sizePart || "", color: colorPart || "" };
  }
  return { size: raw, color: "" };
}

function normalizeBarcodePart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sizeOptionsByFamily(family) {
  const normalizedFamily = String(family || "").trim().toLowerCase();
  if (normalizedFamily === "zapatillas trail running") {
    return shoesSizeOptions;
  }
  return defaultSizeOptions;
}

function arcaStatusLabel(value) {
  const key = String(value || "not_generated").toLowerCase();
  if (key === "issued") return "Emitido";
  if (key === "pending") return "Pendiente";
  if (key === "error") return "Con error";
  return "Sin generar";
}

function arcaStatusTone(value) {
  const key = String(value || "not_generated").toLowerCase();
  if (key === "issued") return "bg-emerald-100 text-emerald-800";
  if (key === "pending") return "bg-amber-100 text-amber-800";
  if (key === "error") return "bg-red-100 text-red-800";
  return "bg-slate-200 text-slate-800";
}

function parseArcaFiscalData(arcaComprobanteId, rawPayload) {
  let payload = null;
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : null;
  } catch {
    payload = null;
  }

  const cae = String(payload?.cae || "").trim() || "-";
  const caeVto = String(payload?.caeVto || "").trim() || "-";
  const parts = String(arcaComprobanteId || "").split("-");
  const puntoVta = parts.length >= 1 ? parts[0] : "-";
  const tipoCbte = parts.length >= 2 ? parts[1] : "-";
  const numeroCbte = parts.length >= 3 ? parts[2] : "-";

  return { cae, caeVto, puntoVta, tipoCbte, numeroCbte };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

function SectionHero({ title, description }) {
  return (
    <section className="rounded-2xl border border-slate-800/60 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f766e] p-5 text-white shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Vista</p>
      <h2 className="mt-1 text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-3xl text-slate-200">{description}</p>
    </section>
  );
}

function CollapsibleSection({
  title,
  description,
  isOpen,
  onToggle,
  children,
  className = "",
  headerActions = null
}) {
  return (
    <section className={`rounded-2xl border border-slate-300 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-100/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          {description ? <p className="text-sm text-slate-600">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-300"
          >
            {isOpen ? "Ver menos" : "Ver más"}
          </button>
        </div>
      </div>

      {isOpen ? <div className="mt-4 border-t border-slate-200 pt-4">{children}</div> : null}
    </section>
  );
}

function GoldMedalBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-gradient-to-r from-amber-200 to-yellow-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-900">
      <span className="h-2 w-2 rounded-full bg-amber-500" />
      Medalla Oro
    </span>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: "Fito", password: "" });
  const [loginError, setLoginError] = useState("");
  const isAdminLogin = loginForm.username === "FitoAdmin";

  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState(null);
  const [cash, setCash] = useState({ openSession: null, metrics: null });
  const [cashHistory, setCashHistory] = useState([]);

  const [error, setError] = useState("");

  const [activeView, setActiveView] = useState("inicio");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingGroupCode, setEditingGroupCode] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [productFilters, setProductFilters] = useState({
    name: "",
    brand: "",
    family: "",
    size: "",
    color: ""
  });
  const [stockAdjustMessage, setStockAdjustMessage] = useState("");
  const [stockAdjustError, setStockAdjustError] = useState("");

  const [saleBarcode, setSaleBarcode] = useState("");
  const [cart, setCart] = useState([]);
  const [manualDesc, setManualDesc] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [cartQuantityDrafts, setCartQuantityDrafts] = useState({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saleMessage, setSaleMessage] = useState("");
  const [saleError, setSaleError] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [editingClientId, setEditingClientId] = useState(null);
  const [clientMessage, setClientMessage] = useState("");
  const [clientError, setClientError] = useState("");
  const [expandedClientPurchases, setExpandedClientPurchases] = useState({});
  const [clientDebtForms, setClientDebtForms] = useState({});

  const [openingAmount, setOpeningAmount] = useState("0");
  const [closingAmount, setClosingAmount] = useState("0");
  const [cashMessage, setCashMessage] = useState("");
  const [invoiceFilters, setInvoiceFilters] = useState({
    invoiceQuery: "",
    paymentMethod: "",
    seller: "",
    dateFrom: "",
    dateTo: ""
  });
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState(null);
  const [selectedSaleLoading, setSelectedSaleLoading] = useState(false);
  const [selectedSaleError, setSelectedSaleError] = useState("");
  const [invoiceDetailFlash, setInvoiceDetailFlash] = useState(false);

  const [priceMode, setPriceMode] = useState("percentage");
  const [priceValue, setPriceValue] = useState("");
  const [priceMessage, setPriceMessage] = useState("");
  const [arcaMessage, setArcaMessage] = useState("");
  const [arcaError, setArcaError] = useState("");
  const [arcaLoadingSaleId, setArcaLoadingSaleId] = useState(null);
  const [invoiceEmailMessage, setInvoiceEmailMessage] = useState("");
  const [invoiceEmailError, setInvoiceEmailError] = useState("");
  const [invoiceEmailLoadingSaleId, setInvoiceEmailLoadingSaleId] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerCameras, setScannerCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [salesScannerActive, setSalesScannerActive] = useState(false);
  const [salesScannerLoading, setSalesScannerLoading] = useState(false);
  const [salesScannerError, setSalesScannerError] = useState("");
  const [salesScannerCameras, setSalesScannerCameras] = useState([]);
  const [selectedSalesCameraId, setSelectedSalesCameraId] = useState("");
  const [salesScanToast, setSalesScanToast] = useState("");
  const [salesActionLoading, setSalesActionLoading] = useState(false);
  const [salesActionLabel, setSalesActionLabel] = useState("");
  const [usdQuote, setUsdQuote] = useState({
    sell: null,
    buy: null,
    source: "",
    updatedAt: null
  });
  const [expandedSections, setExpandedSections] = useState({
    stock_panel: false,
    ventas_recientes: false,
    caja_analitica: false,
    caja_historial: false,
    facturas_detalle: false,
    precios_stock_critico: false
  });
  const invoiceDetailRef = useRef(null);
  const invoiceDetailFlashTimerRef = useRef(null);
  const previousViewRef = useRef("inicio");
  const skipFacturasResetRef = useRef(false);
  const clientFormFirstInputRef = useRef(null);
  const stockFormRef = useRef(null);
  const stockBarcodeInputRef = useRef(null);
  const saleBarcodeInputRef = useRef(null);
  const barcodeScannerRef = useRef(null);
  const salesBarcodeScannerRef = useRef(null);
  const salesScanLockRef = useRef(false);
  const salesScanToastTimerRef = useRef(null);
  const SCAN_COOLDOWN_MS = 2000;

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
    [cart]
  );

  const lowStockProducts = stats?.lowStockProducts || [];
  const paymentBreakdown = stats?.paymentBreakdown || [];
  const salesByUserToday = stats?.salesByUserToday || [];
  const filteredStockProducts = useMemo(() => {
    const queryName = productFilters.name.trim().toLowerCase();
    const queryBrand = productFilters.brand;
    const queryFamily = productFilters.family;
    const querySize = productFilters.size.trim().toLowerCase();
    const queryColor = productFilters.color.trim().toLowerCase();

    return products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const matchesName = !queryName || name.includes(queryName);
      const matchesBrand = !queryBrand || String(product.brand || "") === queryBrand;
      const matchesFamily = !queryFamily || String(product.family || "") === queryFamily;
      const sizeColor = splitSizeColor(product.size_color);
      const productSize = String(sizeColor.size || "").toLowerCase();
      const productColor = String(sizeColor.color || "").toLowerCase();
      const matchesSize = !querySize || productSize.includes(querySize);
      const matchesColor = !queryColor || productColor.includes(queryColor);
      return matchesName && matchesBrand && matchesFamily && matchesSize && matchesColor;
    });
  }, [products, productFilters]);
  const groupedStockProducts = useMemo(() => {
    const map = new Map();
    for (const product of filteredStockProducts) {
      const code = String(product.product_code || product.barcode || "");
      if (!map.has(code)) {
        map.set(code, {
          product_code: code,
          items: []
        });
      }
      map.get(code).items.push(product);
    }
    return Array.from(map.values()).sort((a, b) => {
      const left = String(a.items[0]?.name || "");
      const right = String(b.items[0]?.name || "");
      return left.localeCompare(right);
    });
  }, [filteredStockProducts]);
  const saleSuggestions = useMemo(() => {
    const query = saleBarcode.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return products
      .filter((product) => {
        const barcode = String(product.barcode || "").toLowerCase();
        const name = String(product.name || "").toLowerCase();
        return barcode.includes(query) || name.includes(query);
      })
      .slice(0, 8);
  }, [products, saleBarcode]);

  const navItems = [
    { id: "inicio", label: "Inicio" },
    { id: "ventas", label: "Ventas" },
    { id: "caja", label: "Caja" },
    { id: "precios", label: "Precios" },
    { id: "facturas", label: "Facturas" },
    { id: "clientes", label: "Clientes" },
    { id: "stock", label: "Stock" },
    { id: "ajuste_stock", label: "Ajuste Stock" },
    { id: "estadisticas", label: "Estadísticas" }
  ];

  const invoiceSellers = useMemo(() => {
    return [...new Set(sales.map((sale) => sale.seller).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [sales]);

  const filteredInvoices = useMemo(() => {
    const query = invoiceFilters.invoiceQuery.trim().toLowerCase();

    return sales.filter((sale) => {
      const invoiceNumber = String(sale.invoice_number || "").toLowerCase();
      const seller = String(sale.seller || "").toLowerCase();
      const paymentMethodValue = String(sale.payment_method || "").toLowerCase();
      const createdDate = new Date(sale.created_at);

      if (query && !invoiceNumber.includes(query) && !seller.includes(query)) {
        return false;
      }

      if (invoiceFilters.paymentMethod && paymentMethodValue !== invoiceFilters.paymentMethod) {
        return false;
      }

      if (invoiceFilters.seller && sale.seller !== invoiceFilters.seller) {
        return false;
      }

      if (invoiceFilters.dateFrom) {
        const fromDate = new Date(`${invoiceFilters.dateFrom}T00:00:00`);
        if (createdDate < fromDate) {
          return false;
        }
      }

      if (invoiceFilters.dateTo) {
        const toDate = new Date(`${invoiceFilters.dateTo}T23:59:59.999`);
        if (createdDate > toDate) {
          return false;
        }
      }

      return true;
    });
  }, [invoiceFilters, sales]);

  function toggleSection(sectionId) {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  }

  function toggleClientPurchases(clientId) {
    setExpandedClientPurchases((prev) => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  }

  function clearUiMessages() {
    setError("");
    setStockAdjustMessage("");
    setStockAdjustError("");
    setSaleMessage("");
    setSaleError("");
    setCashMessage("");
    setPriceMessage("");
    setArcaMessage("");
    setArcaError("");
    setSelectedSaleError("");
    setClientMessage("");
    setClientError("");
    setInvoiceEmailMessage("");
    setInvoiceEmailError("");
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    fetchUsdQuote();
    const timer = setInterval(fetchUsdQuote, 1000 * 60 * 10);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (invoiceDetailFlashTimerRef.current) {
        clearTimeout(invoiceDetailFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    clearUiMessages();
  }, [activeView]);

  useEffect(() => {
    if (
      activeView === "facturas" &&
      previousViewRef.current !== "facturas" &&
      !skipFacturasResetRef.current
    ) {
      setSelectedSaleId(null);
      setSelectedSaleDetail(null);
      setSelectedSaleError("");
      setExpandedSections((prev) => ({
        ...prev,
        facturas_detalle: false
      }));
    }

    skipFacturasResetRef.current = false;
    previousViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    return () => {
      if (barcodeScannerRef.current) {
        barcodeScannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            barcodeScannerRef.current?.clear().catch(() => {});
            barcodeScannerRef.current = null;
          });
      }
      if (salesBarcodeScannerRef.current) {
        salesBarcodeScannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            salesBarcodeScannerRef.current?.clear().catch(() => {});
            salesBarcodeScannerRef.current = null;
          });
      }
      if (salesScanToastTimerRef.current) {
        clearTimeout(salesScanToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isFormOpen) {
      return;
    }
    if (scannerActive) {
      stopBarcodeScanner();
    }
    setScannerError("");
    setScannerCameras([]);
    setSelectedCameraId("");
  }, [isFormOpen]);

  useEffect(() => {
    if (activeView === "ventas") {
      requestAnimationFrame(() => {
        saleBarcodeInputRef.current?.focus();
      });
      return;
    }
    setSaleBarcode("");
    setCart([]);
    setSelectedCustomerId("");
    setSaleMessage("");
    setSaleError("");
    setSalesScanToast("");
    if (salesScannerActive) {
      stopSalesBarcodeScanner();
    }
    setSalesScannerError("");
    setSalesScannerCameras([]);
    setSelectedSalesCameraId("");
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "facturas" || !selectedSaleId || selectedSaleLoading) {
      return;
    }

    requestAnimationFrame(() => {
      invoiceDetailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    setInvoiceDetailFlash(true);
    if (invoiceDetailFlashTimerRef.current) {
      clearTimeout(invoiceDetailFlashTimerRef.current);
    }
    invoiceDetailFlashTimerRef.current = setTimeout(() => {
      setInvoiceDetailFlash(false);
    }, 1300);
  }, [activeView, selectedSaleId, selectedSaleLoading]);

  async function fetchUsdQuote() {
    try {
      const response = await fetch("https://dolarapi.com/v1/dolares/oficial");
      if (!response.ok) {
        throw new Error("No disponible");
      }
      const data = await response.json();
      const sell = Number(data?.venta);
      const buy = Number(data?.compra);

      if (!Number.isFinite(sell) || !Number.isFinite(buy)) {
        throw new Error("No disponible");
      }

      setUsdQuote({
        sell,
        buy,
        source: "DolarAPI",
        updatedAt: new Date().toISOString()
      });
    } catch {
      setUsdQuote((prev) => ({
        ...prev,
        updatedAt: new Date().toISOString()
      }));
    }
  }

  async function bootstrap() {
    try {
      const data = await api.me();
      setUser(data.user);
      await loadDashboard();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    try {
      const [productsData, salesData, statsData, cashData, cashHistoryData, clientsData] = await Promise.all([
        api.listProducts(),
        api.listSales(),
        api.statsOverview(),
        api.cashStatus(),
        api.cashHistory(),
        api.listClients()
      ]);

      setProducts(productsData.products || []);
      setSales(salesData.sales || []);
      setStats(statsData.stats || null);
      setCash({
        openSession: cashData.openSession || null,
        metrics: cashData.metrics || null
      });
      setCashHistory(cashHistoryData.sessions || []);
      setClients(clientsData.clients || []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function reloadProductsAndStats() {
    try {
      const [productsData, statsData, cashData, salesData, clientsData] = await Promise.all([
        api.listProducts(),
        api.statsOverview(),
        api.cashStatus(),
        api.listSales(),
        api.listClients()
      ]);
      setProducts(productsData.products || []);
      setStats(statsData.stats || null);
      setCash({
        openSession: cashData.openSession || null,
        metrics: cashData.metrics || null
      });
      setSales(salesData.sales || []);
      setClients(clientsData.clients || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");

    try {
      const data = await api.login(loginForm.username, loginForm.password);
      setUser(data.user);
      await loadDashboard();
    } catch (err) {
      setLoginError(err.message);
    }
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setProducts([]);
    setSales([]);
    setClients([]);
    setStats(null);
    setCash({ openSession: null, metrics: null });
    setCashHistory([]);
    setSelectedCustomerId("");
    setActiveView("inicio");
  }

  function openCreateForm() {
    setEditingId(null);
    setEditingGroupCode(null);
    setForm(emptyForm);
    setIsFormOpen(true);
    setError("");
    requestAnimationFrame(() => {
      stockFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      stockBarcodeInputRef.current?.focus();
    });
  }

  function openEditForm(group) {
    const first = group.items[0];
    const sizeColor = splitSizeColor(first.size_color);
    setEditingId(first.id);
    setEditingGroupCode(group.product_code);
    setForm({
      barcode: group.product_code,
      name: first.name,
      brand: first.brand || "",
      family: first.family || "",
      color: sizeColor.color,
      price: String(first.price),
      image_url: String(first.image_url || ""),
      variants: group.items.map((item) => ({
        id: item.id,
        barcode: item.barcode,
        size: splitSizeColor(item.size_color).size,
        stock: String(item.stock),
        low_stock_threshold: String(item.low_stock_threshold ?? 2)
      }))
    });
    setIsFormOpen(true);
    setError("");
    requestAnimationFrame(() => {
      stockFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      const firstInput = stockFormRef.current?.querySelector("input, select, textarea");
      firstInput?.focus();
    });
  }

  async function handleProductImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("El archivo seleccionado no es una imagen.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen supera 2MB. Elegí una más liviana.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, image_url: dataUrl }));
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo cargar la imagen.");
    } finally {
      event.target.value = "";
    }
  }

  async function saveProduct(e) {
    e.preventDefault();
    setError("");

    const baseBarcode = form.barcode.trim();
    const normalizedVariants = (form.variants || [])
      .map((variant) => ({
        size: String(variant.size || "").trim(),
        stock: Number(variant.stock),
        low_stock_threshold: Number(variant.low_stock_threshold)
      }))
      .filter((variant) => variant.size || variant.stock || variant.low_stock_threshold);

    if (!normalizedVariants.length) {
      setError("Agregá al menos una variante con talle y cantidad.");
      return;
    }

    try {
      if (editingGroupCode) {
        const existingGroupItems = products
          .filter((item) => String(item.product_code || item.barcode) === String(editingGroupCode))
          .sort((a, b) => a.id - b.id);

        for (let i = 0; i < normalizedVariants.length; i += 1) {
          const variant = normalizedVariants[i];
          const sizeColor = [variant.size, form.color.trim()].filter(Boolean).join(" / ");
          const existing = existingGroupItems[i];

          if (existing) {
            await api.updateProduct(existing.id, {
              barcode: existing.barcode,
              product_code: baseBarcode,
              name: form.name.trim(),
              brand: form.brand.trim(),
              family: form.family.trim(),
              size_color: sizeColor,
              price: Number(form.price),
              stock: Number(variant.stock),
              low_stock_threshold: Number(variant.low_stock_threshold),
              image_url: String(form.image_url || "").trim()
            });
          } else {
            await api.createProduct({
              barcode: `${baseBarcode}-VAR-${Date.now()}-${i + 1}`,
              product_code: baseBarcode,
              name: form.name.trim(),
              brand: form.brand.trim(),
              family: form.family.trim(),
              size_color: sizeColor,
              price: Number(form.price),
              stock: Number(variant.stock),
              low_stock_threshold: Number(variant.low_stock_threshold),
              image_url: String(form.image_url || "").trim()
            });
          }
        }

        if (existingGroupItems.length > normalizedVariants.length) {
          for (const extra of existingGroupItems.slice(normalizedVariants.length)) {
            await api.deleteProduct(extra.id);
          }
        }
      } else {
        for (let i = 0; i < normalizedVariants.length; i += 1) {
          const variant = normalizedVariants[i];
          const sizeColor = [variant.size, form.color.trim()].filter(Boolean).join(" / ");
          const variantParts = [normalizeBarcodePart(variant.size)].filter(Boolean);
          const generatedBarcode = variantParts.length ? `${baseBarcode}-${variantParts.join("-")}` : baseBarcode;
          const payload = {
            barcode: i === 0 ? generatedBarcode : `${generatedBarcode}-${i + 1}`,
            product_code: baseBarcode,
            name: form.name.trim(),
            brand: form.brand.trim(),
            family: form.family.trim(),
            size_color: sizeColor,
            price: Number(form.price),
            stock: Number(variant.stock),
            low_stock_threshold: Number(variant.low_stock_threshold),
            image_url: String(form.image_url || "").trim()
          };
          await api.createProduct(payload);
        }
      }

      setIsFormOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setEditingGroupCode(null);
      await reloadProductsAndStats();
    } catch (err) {
      setError(err.message);
    }
  }

  function addVariantRow() {
    setForm((prev) => ({
      ...prev,
      variants: [...(prev.variants || []), { size: "", stock: "", low_stock_threshold: "2" }]
    }));
  }

  function removeVariantRow(index) {
    setForm((prev) => {
      const nextVariants = (prev.variants || []).filter((_, itemIndex) => itemIndex !== index);
      return {
        ...prev,
        variants: nextVariants.length ? nextVariants : [{ size: "", stock: "", low_stock_threshold: "2" }]
      };
    });
  }

  function changeVariantRow(index, field, value) {
    setForm((prev) => ({
      ...prev,
      variants: (prev.variants || []).map((variant, itemIndex) =>
        itemIndex === index ? { ...variant, [field]: value } : variant
      )
    }));
  }

  async function removeProduct(id) {
    const confirmed = window.confirm("¿Seguro que querés eliminar este producto?");
    if (!confirmed) {
      return;
    }

    try {
      await api.deleteProduct(id);
      await reloadProductsAndStats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function adjustProductStock(product, delta) {
    setStockAdjustMessage("");
    setStockAdjustError("");

    try {
      const data = await api.scanBarcode(product.barcode, delta);
      const action = delta > 0 ? "+1" : "-1";
      setStockAdjustMessage(`Stock actualizado: ${data.product.name} (${action})`);
      await reloadProductsAndStats();
    } catch (err) {
      setStockAdjustError(err.message);
    }
  }

  function findSaleProduct(searchText) {
    if (!searchText) {
      return { product: null, error: "Ingresá código o nombre de producto para vender." };
    }

    let product = products.find((item) => item.barcode === searchText);

    if (!product) {
      const normalizedQuery = searchText.toLowerCase();
      const matches = products.filter((item) => {
        const barcode = String(item.barcode || "").toLowerCase();
        const name = String(item.name || "").toLowerCase();
        return barcode.includes(normalizedQuery) || name.includes(normalizedQuery);
      });

      if (matches.length === 1) {
        product = matches[0];
      } else if (matches.length > 1) {
        return { product: null, error: "Hay varias coincidencias. Elegí un producto de la lista." };
      }
    }

    if (!product) {
      return { product: null, error: "No existe producto con ese código o nombre." };
    }

    return { product, error: "" };
  }

  function addToCart() {
    setSaleError("");
    setSaleMessage("");

    const searchText = saleBarcode.trim();
    const { product, error: findError } = findSaleProduct(searchText);
    if (!product) {
      setSaleError(findError);
      return;
    }

    addProductToCart(product);
  }

  function addProductToCart(product, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setSaleError("Cantidad inválida.");
      return;
    }

    if (product.stock <= 0) {
      setSaleError("Ese producto no tiene stock disponible.");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (!existing) {
        return [
          ...prev,
          {
            productId: product.id,
            barcode: product.barcode,
            name: product.name,
            price: Number(product.price),
            quantity,
            maxStock: product.stock
          }
        ];
      }

      const nextQty = existing.quantity + quantity;
      if (nextQty > product.stock) {
        setSaleError(`Stock insuficiente para ${product.name}.`);
        return prev;
      }

      return prev.map((item) =>
        item.productId === product.id ? { ...item, quantity: nextQty, maxStock: product.stock } : item
      );
    });

    setSaleBarcode("");
    setSaleError("");
  }

  function handleAddManualProduct() {
    setSaleError("");
    setSaleMessage("");

    const desc = String(manualDesc || "").trim();
    const price = Number(String(manualPrice || "").replace(/,/g, "."));
    const qty = Number(manualQty);

    if (!desc) {
      setSaleError("Ingresá descripción del producto.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setSaleError("Precio inválido.");
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setSaleError("Cantidad inválida.");
      return;
    }

    const id = `manual-${Date.now()}`;
    setCart((prev) => [
      ...prev,
      {
        productId: id,
        barcode: null,
        name: desc,
        price: Number(price),
        quantity: qty,
        maxStock: qty
      }
    ]);

    setManualDesc("");
    setManualPrice("");
    setManualQty("1");
    setSaleMessage("Producto agregado manualmente.");
  }

  function changeCartQuantityDraft(productId, value) {
    if (!/^\d*$/.test(String(value))) {
      return;
    }
    setCartQuantityDrafts((prev) => ({
      ...prev,
      [String(productId)]: String(value)
    }));
  }

  function commitCartQuantity(productId) {
    const key = String(productId);
    const raw = cartQuantityDrafts[key];
    if (raw === undefined) {
      return;
    }

    const nextQty = Number(raw);
    if (!Number.isInteger(nextQty) || nextQty <= 0) {
      setCartQuantityDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const item = cart.find((entry) => entry.productId === productId);
    if (!item) {
      return;
    }

    if (nextQty > item.maxStock) {
      setSaleError(`Stock insuficiente para ${item.name}. Disponible: ${item.maxStock}.`);
      setCartQuantityDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setSaleError("");
    setCart((prev) =>
      prev.map((entry) => {
        if (entry.productId !== productId) {
          return entry;
        }

        return {
          ...entry,
          quantity: nextQty
        };
      })
    );

    setCartQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function removeCartItem(productId) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    setCartQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[String(productId)];
      return next;
    });
  }

  async function checkoutSale() {
    setSaleError("");
    setSaleMessage("");

    if (!cart.length) {
      setSaleError("No hay productos en el carrito.");
      return;
    }

    try {
      setSalesActionLabel("Procesando cobro y generando factura interna...");
      setSalesActionLoading(true);
      const payload = {
        paymentMethod,
        customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
        items: cart.map((item) => {
          // manual items have productId like 'manual-...'
          if (String(item.productId).startsWith("manual-") || item.productId === null) {
            return {
              productId: null,
              productName: item.name,
              name: item.name,
              description: item.name,
              unitPrice: item.price,
              price: item.price,
              quantity: item.quantity
            };
          }
          return {
            productId: Number(item.productId),
            quantity: item.quantity
          };
        })
      };

      const data = await api.createSale(payload);
      const sale = data.sale;

      setSaleMessage(`Factura ${sale.invoice_number} creada por ${money(sale.total_amount)}.`);
      setCart([]);
      setCartQuantityDrafts({});
      setSelectedCustomerId("");
      await reloadProductsAndStats();
    } catch (err) {
      setSaleError(err.message);
    } finally {
      setSalesActionLoading(false);
      setSalesActionLabel("");
    }
  }

  async function checkoutQuote() {
    setSaleError("");
    setSaleMessage("");

    if (!cart.length) {
      setSaleError("No hay productos en el carrito.");
      return;
    }

    try {
      setSalesActionLabel("Generando presupuesto...");
      setSalesActionLoading(true);
      const payload = {
        paymentMethod,
        customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
        items: cart.map((item) => {
          if (String(item.productId).startsWith("manual-") || item.productId === null) {
            return {
              productId: null,
              productName: item.name,
              name: item.name,
              description: item.name,
              unitPrice: item.price,
              price: item.price,
              quantity: item.quantity
            };
          }
          return {
            productId: Number(item.productId),
            quantity: item.quantity
          };
        })
      };

      const data = await api.createQuote(payload);
      const quote = data.quote;
      const html = String(data?.html || "");
      const hasSelectedCustomer = Boolean(selectedCustomerId);
      if (hasSelectedCustomer) {
        setSalesActionLabel("Enviando presupuesto por email...");
      }

      const openQuotePrintWindow = () => {
        const printWindow = window.open("", "_blank", "width=980,height=900");
        if (!printWindow) {
          throw new Error("El navegador bloqueó la ventana de impresión. Habilitá pop-ups e intentá de nuevo.");
        }
        if (!html) {
          printWindow.close();
          throw new Error("No se pudo generar el presupuesto para impresión.");
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      };

      if (hasSelectedCustomer) {
        if (data.emailStatus === "sent") {
          openQuotePrintWindow();
          setSaleMessage(data.emailMessage || `Presupuesto ${quote.invoice_number} enviado por email.`);
        } else {
          throw new Error(data.emailMessage || "No se pudo enviar el presupuesto por email.");
        }
      } else {
        openQuotePrintWindow();
        setSaleMessage(`Presupuesto ${quote.invoice_number} generado.`);
      }

      setCart([]);
      setCartQuantityDrafts({});
      setSelectedCustomerId("");
    } catch (err) {
      setSaleError(err.message);
    } finally {
      setSalesActionLoading(false);
      setSalesActionLabel("");
    }
  }

  async function saveClient(e) {
    e.preventDefault();
    setClientError("");
    setClientMessage("");

    try {
      const payload = {
        firstName: clientForm.firstName.trim(),
        lastName: clientForm.lastName.trim(),
        cuit: clientForm.cuit.trim(),
        phone: clientForm.phone.trim(),
        email: clientForm.email.trim(),
        condicionIva: clientForm.condicionIva
      };
      if (editingClientId) {
        await api.updateClient(Number(editingClientId), payload);
        setClientMessage("Cliente actualizado correctamente.");
      } else {
        await api.createClient(payload);
        setClientMessage("Cliente creado correctamente.");
      }
      setEditingClientId(null);
      setClientForm(emptyClientForm);
      await reloadProductsAndStats();
    } catch (err) {
      setClientError(err.message);
    }
  }

  function startClientEdit(client) {
    setClientError("");
    setClientMessage("");
    setEditingClientId(client.id);
    setClientForm({
      firstName: String(client.first_name || ""),
      lastName: String(client.last_name || ""),
      cuit: String(client.cuit || ""),
      phone: String(client.phone || ""),
      email: String(client.email || ""),
      condicionIva: String(client.condicion_iva || "IVA no alcanzado")
    });
    requestAnimationFrame(() => {
      clientFormFirstInputRef.current?.focus();
      clientFormFirstInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function cancelClientEdit() {
    setEditingClientId(null);
    setClientForm(emptyClientForm);
    setClientError("");
    setClientMessage("");
  }

  async function saveClientDebt(clientId) {
    const draft = clientDebtForms[clientId] || { amount: "", note: "" };
    const amount = Number(draft.amount);

    if (!Number.isFinite(amount) || amount === 0) {
      setClientError("Ingresá un monto de adeudamiento válido (distinto de 0).");
      return;
    }

    try {
      setClientError("");
      setClientMessage("");
      await api.createClientDebt(clientId, {
        amount,
        note: String(draft.note || "").trim()
      });
      setClientMessage("Movimiento de adeudamiento registrado.");
      setClientDebtForms((prev) => ({
        ...prev,
        [clientId]: { amount: "", note: "" }
      }));
      await reloadProductsAndStats();
    } catch (err) {
      setClientError(err.message);
    }
  }

  async function openCashSession() {
    setCashMessage("");
    try {
      await api.openCash(Number(openingAmount));
      setCashMessage("Caja abierta correctamente.");
      setOpeningAmount("0");
      await loadDashboard();
    } catch (err) {
      setCashMessage(err.message);
    }
  }

  async function closeCashSession() {
    setCashMessage("");
    try {
      const data = await api.closeCash(Number(closingAmount));
      setCashMessage(
        `Caja cerrada. Esperado: ${money(data.metrics.expectedAmount)} | Diferencia: ${money(data.metrics.differenceAmount)}`
      );
      setClosingAmount("0");
      await loadDashboard();
    } catch (err) {
      setCashMessage(err.message);
    }
  }

  async function applyPriceUpdate() {
    setPriceMessage("");
    const numericValue = Number(priceValue);

    if (Number.isNaN(numericValue)) {
      setPriceMessage("Ingresá un valor válido.");
      return;
    }

    try {
      const data = await api.bulkUpdatePrices({
        mode: priceMode,
        value: numericValue
      });
      setPriceMessage(`Se actualizaron ${data.affectedCount} productos.`);
      setPriceValue("");
      await reloadProductsAndStats();
    } catch (err) {
      setPriceMessage(err.message);
    }
  }

  function clearInvoiceFilters() {
    setInvoiceFilters({
      invoiceQuery: "",
      paymentMethod: "",
      seller: "",
      dateFrom: "",
      dateTo: ""
    });
  }

  async function openSaleDetail(saleId, { jumpToInvoices = false } = {}) {
    if (!Number.isInteger(Number(saleId))) {
      return;
    }

    if (jumpToInvoices) {
      skipFacturasResetRef.current = true;
      setActiveView("facturas");
    }
    setExpandedSections((prev) => ({
      ...prev,
      facturas_detalle: true
    }));

    setSelectedSaleId(Number(saleId));
    setSelectedSaleError("");
    setSelectedSaleLoading(true);

    try {
      const data = await api.getSale(Number(saleId));
      setSelectedSaleDetail(data.sale || null);
    } catch (err) {
      setSelectedSaleDetail(null);
      setSelectedSaleError(err.message);
    } finally {
      setSelectedSaleLoading(false);
    }
  }

  async function generateArcaComprobanteForSale(saleId, { force = false, jumpToInvoices = false } = {}) {
    if (!Number.isInteger(Number(saleId))) {
      return;
    }

    if (jumpToInvoices) {
      await openSaleDetail(Number(saleId), { jumpToInvoices: true });
    }

    setArcaMessage("");
    setArcaError("");
    setArcaLoadingSaleId(Number(saleId));
    const printWindow = window.open("", "_blank", "width=980,height=900");

    try {
      const data = await api.generateArcaComprobante(Number(saleId), force);
      setArcaMessage(data.message || "Comprobante ARCA generado correctamente.");

      if (!printWindow) {
        throw new Error("El navegador bloqueó la ventana de impresión. Habilitá pop-ups e intentá de nuevo.");
      }
      const printData = await api.getSaleArcaPrintHtml(Number(saleId));
      const html = String(printData?.html || "");
      if (!html) {
        throw new Error("No se pudo generar la factura para impresión.");
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      await reloadProductsAndStats();
      await openSaleDetail(Number(saleId), { jumpToInvoices: true });
    } catch (err) {
      if (printWindow) {
        try {
          printWindow.close();
        } catch {}
      }
      setArcaError(err.message);
      await reloadProductsAndStats();
      if (jumpToInvoices || selectedSaleId === Number(saleId)) {
        await openSaleDetail(Number(saleId), { jumpToInvoices: true });
      }
    } finally {
      setArcaLoadingSaleId(null);
    }
  }

  async function sendInvoiceEmailForSale(saleId) {
    if (!Number.isInteger(Number(saleId))) {
      return;
    }

    setInvoiceEmailMessage("");
    setInvoiceEmailError("");
    setInvoiceEmailLoadingSaleId(Number(saleId));

    try {
      const data = await api.sendSaleInvoiceEmail(Number(saleId));
      setInvoiceEmailMessage(data.message || "Factura enviada por email.");
      await openSaleDetail(Number(saleId), { jumpToInvoices: true });
    } catch (err) {
      setInvoiceEmailError(err.message || "No se pudo enviar la factura por email.");
    } finally {
      setInvoiceEmailLoadingSaleId(null);
    }
  }

  async function printSelectedInvoice() {
    if (!selectedSaleDetail) {
      setSelectedSaleError("Seleccioná una factura para imprimir el detalle.");
      setExpandedSections((prev) => ({ ...prev, facturas_detalle: true }));
      return;
    }

    const printWindow = window.open("", "_blank", "width=980,height=900");
    if (!printWindow) {
      setSelectedSaleError("El navegador bloqueó la ventana de impresión. Habilitá pop-ups e intentá de nuevo.");
      return;
    }

    try {
      const data = await api.getSalePrintHtml(Number(selectedSaleDetail.id));
      const html = String(data?.html || "");
      if (!html) {
        throw new Error("No se pudo generar la factura para impresión.");
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      printWindow.close();
      setSelectedSaleError(err.message || "No se pudo imprimir la factura.");
    }
  }

  async function printSelectedArcaInvoice() {
    if (!selectedSaleDetail) {
      setSelectedSaleError("Seleccioná una factura para imprimir el comprobante ARCA.");
      setExpandedSections((prev) => ({ ...prev, facturas_detalle: true }));
      return;
    }
    if (selectedSaleDetail.arca_status !== "issued") {
      setSelectedSaleError("La factura seleccionada aún no tiene comprobante ARCA emitido.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=980,height=900");
    if (!printWindow) {
      setSelectedSaleError("El navegador bloqueó la ventana de impresión. Habilitá pop-ups e intentá de nuevo.");
      return;
    }

    try {
      const data = await api.getSaleArcaPrintHtml(Number(selectedSaleDetail.id));
      const html = String(data?.html || "");
      if (!html) {
        throw new Error("No se pudo generar el comprobante ARCA para impresión.");
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      printWindow.close();
      setSelectedSaleError(err.message || "No se pudo imprimir el comprobante ARCA.");
    }
  }

  async function startBarcodeScanner() {
    if (scannerLoading || scannerActive) {
      return;
    }

    setScannerError("");
    setScannerLoading(true);
    setScannerActive(true);

    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        throw new Error("Para usar la cámara el sitio debe abrirse con HTTPS o en localhost.");
      }

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) {
        throw new Error("No se detectaron cámaras disponibles en este dispositivo.");
      }

      setScannerCameras(cameras);
      const preferredCamera =
        cameras.find((cam) => /back|rear|environment|trasera/i.test(String(cam.label || ""))) || cameras[0];
      const cameraId = selectedCameraId || preferredCamera.id;
      setSelectedCameraId(cameraId);

      const scanner = new Html5Qrcode("barcode-scanner-reader");
      barcodeScannerRef.current = scanner;

      await scanner.start(
        { deviceId: { exact: cameraId } },
        {
          fps: 8,
          qrbox: { width: 280, height: 140 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF
          ]
        },
        (decodedText) => {
          const value = String(decodedText || "").trim();
          if (!value) {
            return;
          }
          playScannerBeep();
          setForm((prev) => ({ ...prev, barcode: value }));
          stopBarcodeScanner();
        },
        () => {}
      );

    } catch (err) {
      setScannerError(err?.message || "No se pudo iniciar la cámara.");
      if (barcodeScannerRef.current) {
        barcodeScannerRef.current.clear().catch(() => {});
        barcodeScannerRef.current = null;
      }
      setScannerActive(false);
    } finally {
      setScannerLoading(false);
    }
  }

  async function stopBarcodeScanner() {
    const scanner = barcodeScannerRef.current;
    if (!scanner) {
      setScannerActive(false);
      return;
    }

    try {
      await scanner.stop();
    } catch {}

    try {
      await scanner.clear();
    } catch {}

    barcodeScannerRef.current = null;
    setScannerActive(false);
  }

  async function switchBarcodeScannerCamera(nextCameraId) {
    setSelectedCameraId(nextCameraId);
    if (!scannerActive) {
      return;
    }
    await stopBarcodeScanner();
    setTimeout(() => {
      setSelectedCameraId(nextCameraId);
      startBarcodeScanner();
    }, 80);
  }

  async function startSalesBarcodeScanner() {
    if (salesScannerLoading || salesScannerActive) {
      return;
    }

    setSalesScannerError("");
    setSalesScannerLoading(true);
    setSalesScannerActive(true);

    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        throw new Error("Para usar la cámara el sitio debe abrirse con HTTPS o en localhost.");
      }

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) {
        throw new Error("No se detectaron cámaras disponibles en este dispositivo.");
      }

      setSalesScannerCameras(cameras);
      const preferredCamera =
        cameras.find((cam) => /back|rear|environment|trasera/i.test(String(cam.label || ""))) || cameras[0];
      const cameraId = selectedSalesCameraId || preferredCamera.id;
      setSelectedSalesCameraId(cameraId);

      const scanner = new Html5Qrcode("sales-barcode-scanner-reader");
      salesBarcodeScannerRef.current = scanner;

      await scanner.start(
        { deviceId: { exact: cameraId } },
        {
          fps: 8,
          qrbox: { width: 280, height: 140 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF
          ]
        },
        (decodedText) => {
          if (salesScanLockRef.current) {
            return;
          }
          salesScanLockRef.current = true;

          const value = String(decodedText || "").trim();
          if (!value) {
            salesScanLockRef.current = false;
            return;
          }

          // Feedback inmediato ante lectura válida, incluso si luego no hay match único.
          playScannerBeep();
          setSaleBarcode(value);

          const { product } = findSaleProduct(value);
          if (product) {
            addProductToCart(product);
            showSalesScanToast(`${product.name} agregado al carrito`);
          } else {
            setSaleError("Código leído, pero no se encontró un producto único para ese valor.");
          }

          setTimeout(() => {
            salesScanLockRef.current = false;
          }, SCAN_COOLDOWN_MS);
        },
        () => {}
      );
    } catch (err) {
      setSalesScannerError(err?.message || "No se pudo iniciar la cámara.");
      if (salesBarcodeScannerRef.current) {
        salesBarcodeScannerRef.current.clear().catch(() => {});
        salesBarcodeScannerRef.current = null;
      }
      setSalesScannerActive(false);
    } finally {
      setSalesScannerLoading(false);
    }
  }

  async function stopSalesBarcodeScanner() {
    const scanner = salesBarcodeScannerRef.current;
    if (!scanner) {
      setSalesScannerActive(false);
      return;
    }

    try {
      await scanner.stop();
    } catch {}

    try {
      await scanner.clear();
    } catch {}

    salesBarcodeScannerRef.current = null;
    setSalesScannerActive(false);
    salesScanLockRef.current = false;
  }

  async function switchSalesBarcodeScannerCamera(nextCameraId) {
    setSelectedSalesCameraId(nextCameraId);
    if (!salesScannerActive) {
      return;
    }
    await stopSalesBarcodeScanner();
    setTimeout(() => {
      setSelectedSalesCameraId(nextCameraId);
      startSalesBarcodeScanner();
    }, 80);
  }

  function playScannerBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      master.connect(ctx.destination);

      const toneA = ctx.createOscillator();
      toneA.type = "square";
      toneA.frequency.setValueAtTime(1850, now);
      toneA.connect(master);
      toneA.start(now);
      toneA.stop(now + 0.11);

      const toneB = ctx.createOscillator();
      toneB.type = "square";
      toneB.frequency.setValueAtTime(1400, now + 0.11);
      toneB.connect(master);
      toneB.start(now + 0.11);
      toneB.stop(now + 0.24);

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 320);
    } catch {}
  }

  function showSalesScanToast(message) {
    setSalesScanToast(message);
    if (salesScanToastTimerRef.current) {
      clearTimeout(salesScanToastTimerRef.current);
    }
    salesScanToastTimerRef.current = setTimeout(() => {
      setSalesScanToast("");
    }, 1400);
  }

  function renderStockForm() {
    if (!isFormOpen) {
      return null;
    }
    const sizeOptions = sizeOptionsByFamily(form.family);

    return (
      <section ref={stockFormRef} className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold">{editingGroupCode ? "Editar Producto" : "Agregar Producto"}</h2>

        <form onSubmit={saveProduct} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <input
              ref={stockBarcodeInputRef}
              className="w-full rounded-xl border-2 border-slate-300 px-4 py-3"
              placeholder="Código de barras"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              required
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startBarcodeScanner}
                disabled={scannerLoading || scannerActive}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {scannerLoading ? "Iniciando cámara..." : scannerActive ? "Escáner activo" : "Escanear con cámara"}
              </button>
              <button
                type="button"
                onClick={stopBarcodeScanner}
                disabled={!scannerActive}
                className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-300 disabled:opacity-50"
              >
                Detener escáner
              </button>
              {scannerCameras.length > 1 ? (
                <select
                  value={selectedCameraId}
                  onChange={(e) => switchBarcodeScannerCamera(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {scannerCameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || `Cámara ${camera.id}`}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className={`overflow-hidden rounded-xl border ${scannerActive ? "border-emerald-300" : "border-slate-200"} bg-slate-50`}>
              <div
                id="barcode-scanner-reader"
                className={`w-full min-h-[240px] ${scannerActive ? "block" : "hidden"}`}
              />
              {!scannerActive ? <p className="px-3 py-2 text-sm text-slate-600">Abrí el escáner para leer el código desde cámara.</p> : null}
            </div>
            {scannerError ? <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{scannerError}</p> : null}
          </div>
          <input
            className="rounded-xl border-2 border-slate-300 px-4 py-3"
            placeholder="Nombre del artículo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-sm"
              onChange={handleProductImageChange}
            />
            <p className="px-1 text-sm text-slate-600">Cargar imagen (JPG/PNG/WebP, max 2MB).</p>
          </div>
          <div className="space-y-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
            {form.image_url ? (
              <img src={form.image_url} alt="Vista previa del producto" className="h-24 w-24 rounded-lg border border-slate-300 object-cover" />
            ) : (
              <p className="text-sm text-slate-500">Sin imagen cargada.</p>
            )}
            {form.image_url ? (
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, image_url: "" }))}
                className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-300"
              >
                Quitar imagen
              </button>
            ) : null}
          </div>
          <select
            className="rounded-xl border-2 border-slate-300 px-4 py-3"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          >
            <option value="">Seleccionar marca/provedor</option>
            {productBrandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border-2 border-slate-300 px-4 py-3"
            value={form.family}
            onChange={(e) => setForm({ ...form, family: e.target.value })}
            required
          >
            <option value="">Seleccionar familia</option>
            {productFamilyOptions.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
              ))}
            </select>
          <input
            className="rounded-xl border-2 border-slate-300 px-4 py-3"
            placeholder="Color principal"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            className="rounded-xl border-2 border-slate-300 px-4 py-3"
            placeholder="Precio"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <div className="md:col-span-2 space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase text-slate-700">Variantes (talle / cantidad / alerta)</p>
              <button
                type="button"
                onClick={addVariantRow}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900"
              >
                Agregar variante
              </button>
            </div>
            {(form.variants || []).map((variant, index) => (
              <div key={`variant-${index}`} className="grid gap-2 md:grid-cols-4">
                <select
                  className="rounded-xl border-2 border-slate-300 px-3 py-2"
                  value={variant.size}
                  onChange={(e) => changeVariantRow(index, "size", e.target.value)}
                >
                  <option value="">Seleccionar talle</option>
                  {sizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                  {variant.size && !sizeOptions.includes(variant.size) ? (
                    <option value={variant.size}>{variant.size}</option>
                  ) : null}
                </select>
                <input
                  type="number"
                  className="rounded-xl border-2 border-slate-300 px-3 py-2"
                  placeholder="Cantidad"
                  value={variant.stock}
                  onChange={(e) => changeVariantRow(index, "stock", e.target.value)}
                  required
                />
                <div className="rounded-xl border-2 border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  Color general: {form.color || "-"}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="w-full rounded-xl border-2 border-slate-300 px-3 py-2"
                    placeholder="Alerta"
                    value={variant.low_stock_threshold}
                    onChange={(e) => changeVariantRow(index, "low_stock_threshold", e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => removeVariantRow(index)}
                    className="rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-200"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-600">
              El primer registro usa el código base; los demás generan código derivado para conservar unicidad.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-700"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-xl bg-slate-500 px-5 py-3 text-lg font-bold text-white hover:bg-slate-600"
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    );
  }

  function renderStockTable() {
    return (
      <section className="overflow-x-auto rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-lg">
              <th className="px-4 py-3">Artículo</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Disponible</th>
              <th className="px-4 py-3">Mínimo</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {groupedStockProducts.map((group) => {
              const first = group.items[0];
              const totalStock = group.items.reduce((sum, item) => sum + Number(item.stock || 0), 0);
              const lowStock = group.items.some((item) => Number(item.stock) <= Number(item.low_stock_threshold ?? 2));

              return (
                <tr key={group.product_code} className={`${lowStock ? "bg-red-50" : "bg-slate-50"} text-lg`}>
                  <td className="rounded-l-xl px-4 py-3">
                    <div className="flex items-start gap-3">
                      {first.image_url ? (
                        <img src={first.image_url} alt={first.name} className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-xs font-bold text-slate-500">
                          SIN IMG
                        </div>
                      )}
                      <div>
                      <p className="text-xl font-extrabold text-slate-900">{first.name}</p>
                      <p className="text-sm font-semibold text-slate-700">Marca: {first.brand || "-"}</p>
                      <p className="text-sm font-semibold text-slate-700">Familia: {first.family || "-"}</p>
                      <p className="text-sm text-slate-600">Código: {group.product_code}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.items.map((variant) => (
                          <span key={variant.id} className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                            Talle {splitSizeColor(variant.size_color).size || "-"} · Stock {variant.stock} · Alerta {variant.low_stock_threshold ?? 2}
                          </span>
                        ))}
                      </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{money(first.price)}</td>
                  <td className={`px-4 py-3 font-bold ${lowStock ? "text-red-700" : "text-slate-900"}`}>
                    <div className="flex items-center gap-2">
                      <span>{totalStock}</span>
                      {lowStock && (
                        <span className="inline-flex rounded-full bg-red-200 px-2 py-1 text-xs font-bold uppercase text-red-800">
                          En alerta
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">Por variante</td>
                  <td className="rounded-r-xl px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(group)}
                        className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
                      >
                        Editar
                      </button>
                      {group.items.map((variant) => (
                        <button
                          key={`del-${variant.id}`}
                          type="button"
                          onClick={() => removeProduct(variant.id)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                        >
                          Elim. {splitSizeColor(variant.size_color).size || variant.id}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!groupedStockProducts.length && (
              <tr>
                <td className="px-4 py-6 text-center text-lg text-slate-600" colSpan={5}>
                  No hay productos que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    );
  }

  function renderInicio() {
    return (
      <div className="space-y-4">
        <SectionHero
          title="Inicio"
          description="Resumen operativo del día con accesos rápidos para tareas frecuentes."
        />

        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <article className="rounded-2xl border border-slate-800/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Resumen del día</p>
            <h3 className="mt-2 text-2xl font-extrabold">Visión general operativa</h3>
            <p className="mt-2 text-slate-200">
              Estado rápido del negocio para tomar decisiones sin navegar por todo el sistema.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-xs uppercase text-slate-300">Ventas hoy</p>
                <p className="text-2xl font-extrabold text-blue-200">{money(stats?.todaySalesTotal)}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-xs uppercase text-slate-300">Tickets hoy</p>
                <p className="text-2xl font-extrabold text-emerald-200">{stats?.todayTickets ?? 0}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-xs uppercase text-slate-300">Caja</p>
                <p className={`text-2xl font-extrabold ${cash.openSession ? "text-emerald-300" : "text-amber-300"}`}>
                  {cash.openSession ? "Abierta" : "Cerrada"}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Producto Más Vendido</p>
              <GoldMedalBadge />
            </div>
            <p className="mt-2 text-xl font-extrabold text-amber-900">
              {stats?.topProduct ? stats.topProduct.name : "Sin ventas todavía"}
            </p>
            <p className="mt-1 text-sm text-amber-800">
              {stats?.topProduct ? `${stats.topProduct.total_units} unidades vendidas` : "Aún no hay datos para destacar."}
            </p>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-700">Unidades en Stock</h3>
            <p className="mt-2 text-3xl font-extrabold text-emerald-900">{stats?.unitsInStock ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-blue-700">Productos Cargados</h3>
            <p className="mt-2 text-3xl font-extrabold text-blue-900">{stats?.productCount ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-700">Ticket Promedio</h3>
            <p className="mt-2 text-3xl font-extrabold text-indigo-900">
              {stats?.todayTickets ? money((Number(stats?.todaySalesTotal || 0) / Number(stats.todayTickets || 1))) : money(0)}
            </p>
          </article>
          <article className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100 p-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-rose-700">Alertas de Stock</h3>
            <p className="mt-2 text-3xl font-extrabold text-rose-900">{stats?.lowStockCount ?? 0}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-xl font-bold text-slate-900">Accesos rápidos</h3>
            <p className="mt-1 text-sm text-slate-600">Navegá directo a las acciones de mayor uso.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveView("ventas")}
                className="rounded-xl bg-blue-600 px-5 py-3 text-left text-lg font-bold text-white hover:bg-blue-700"
              >
                Nueva venta
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView("stock");
                  openCreateForm();
                }}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-left text-lg font-bold text-white hover:bg-emerald-700"
              >
                Cargar Producto
              </button>
              <button
                type="button"
                onClick={() => setActiveView("caja")}
                className="rounded-xl bg-slate-700 px-5 py-3 text-left text-lg font-bold text-white hover:bg-slate-800"
              >
                Abrir/Cerrar Caja
              </button>
              <button
                type="button"
                onClick={() => setActiveView("facturas")}
                className="rounded-xl bg-amber-600 px-5 py-3 text-left text-lg font-bold text-white hover:bg-amber-700"
              >
                Revisar facturas
              </button>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-sm">
            <h3 className="text-xl font-bold text-white">Alertas pendientes</h3>
            <p className="mt-1 text-sm text-slate-300">Productos con stock por debajo del mínimo configurado.</p>
            <div className="mt-3 space-y-2">
              {lowStockProducts.slice(0, 4).map((product) => (
                <div key={product.id} className="rounded-lg border border-red-500/30 bg-red-500/20 p-3 text-red-100">
                  <p className="font-bold">{product.name}</p>
                  <p className="text-sm">Stock actual: {product.stock}</p>
                </div>
              ))}
              {!lowStockProducts.length && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 p-3 text-emerald-100">
                  No hay alertas de stock.
                </p>
              )}
            </div>
          </article>
        </section>
      </div>
    );
  }

  function renderStock() {
    return (
      <div className="space-y-4">
        <SectionHero
          title="Stock"
          description="Administrá productos, alertas de mínimo y mantenimiento general del inventario."
        />

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl bg-blue-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-blue-700">Productos</p>
            <p className="mt-1 text-2xl font-extrabold text-blue-900">{products.length}</p>
          </article>
          <article className="rounded-2xl bg-emerald-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-emerald-700">Unidades en Stock</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-900">{stats?.unitsInStock ?? 0}</p>
          </article>
          <article className="rounded-2xl bg-amber-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-amber-700">Alertas</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-900">{stats?.lowStockCount ?? 0}</p>
          </article>
        </section>

        <section className="rounded-2xl bg-blue-50 p-4 shadow-sm">
          <h3 className="mb-2 text-2xl font-bold">Ajuste rápido de stock</h3>
          <p className="text-slate-700">
            Para sumar o restar stock sin editar el producto, usá la pantalla <strong>Ajuste Stock</strong>.
          </p>
          <button
            type="button"
            onClick={() => setActiveView("ajuste_stock")}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-lg font-bold text-white hover:bg-blue-700"
          >
            Ir a Ajuste Stock
          </button>
        </section>

        <section className="rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
          <h3 className="mb-2 text-xl font-extrabold text-emerald-900">Carga de producto</h3>
          <p className="mb-3 text-sm text-emerald-800">
            Alta y edición manual de productos con marca/provedor y familia.
          </p>
          {renderStockForm() || (
            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-700"
            >
              Agregar producto
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-sm">
          <h3 className="mb-3 text-xl font-bold text-slate-900">Filtros de productos</h3>
          <div className="grid gap-3 md:grid-cols-5">
            <input
              value={productFilters.name}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Filtrar por nombre"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            />
            <select
              value={productFilters.brand}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, brand: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            >
              <option value="">Todas las marcas/provedor</option>
              {productBrandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select
              value={productFilters.family}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, family: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            >
              <option value="">Todas las familias</option>
              {productFamilyOptions.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            <input
              value={productFilters.size}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, size: e.target.value }))}
              placeholder="Filtrar por talle"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            />
            <input
              value={productFilters.color}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, color: e.target.value }))}
              placeholder="Filtrar por color"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            />
          </div>
        </section>

        <CollapsibleSection
          title="Panel de Stock"
          description="Listado completo de inventario y acciones de mantenimiento."
          isOpen={expandedSections.stock_panel}
          onToggle={() => toggleSection("stock_panel")}
          className="border-indigo-200 bg-indigo-50/40"
        >
          {renderStockTable()}
        </CollapsibleSection>
      </div>
    );
  }

  function renderAjusteStock() {
    return (
      <div className="space-y-4">
        <SectionHero
          title="Ajuste Stock"
          description="Actualizá unidades en tiempo real buscando por código o nombre del producto."
        />

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            <input
              value={productFilters.name}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Filtrar por nombre"
              className="rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
            />
            <select
              value={productFilters.brand}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, brand: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
            >
              <option value="">Todas las marcas/provedor</option>
              {productBrandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select
              value={productFilters.family}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, family: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
            >
              <option value="">Todas las familias</option>
              {productFamilyOptions.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
            <input
              value={productFilters.size}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, size: e.target.value }))}
              placeholder="Filtrar por talle"
              className="rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
            />
            <input
              value={productFilters.color}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, color: e.target.value }))}
              placeholder="Filtrar por color"
              className="rounded-xl border-2 border-slate-300 px-4 py-3 text-lg"
            />
          </div>

          {stockAdjustError && <p className="mt-3 rounded-lg bg-red-100 p-3 text-red-700">{stockAdjustError}</p>}
          {stockAdjustMessage && <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-emerald-700">{stockAdjustMessage}</p>}
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl bg-emerald-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-emerald-700">Productos visibles</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-900">{filteredStockProducts.length}</p>
          </article>
          <article className="rounded-2xl bg-slate-200 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-slate-600">Total productos</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{products.length}</p>
          </article>
          <article className="rounded-2xl bg-amber-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-amber-700">Stock crítico</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-900">{stats?.lowStockCount ?? 0}</p>
          </article>
        </section>

        <section className="space-y-3">
          {filteredStockProducts.map((product) => (
            <article
              key={product.id}
              className={`rounded-2xl p-4 shadow-sm ${
                product.stock <= (product.low_stock_threshold ?? 2) ? "bg-red-50" : "bg-white"
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xl font-bold">{product.name}</p>
                  <p className="text-sm font-semibold text-slate-700">Marca: {product.brand || "-"}</p>
                  <p className="text-sm font-semibold text-slate-700">Familia: {product.family || "-"}</p>
                  <p className="text-slate-600">Código: {product.barcode}</p>
                  <p className={`text-lg font-bold ${product.stock <= (product.low_stock_threshold ?? 2) ? "text-red-700" : "text-slate-900"}`}>
                    Stock actual: {product.stock}
                  </p>
                </div>

                <div className="grid gap-2 sm:min-w-[200px]">
                  <button
                    type="button"
                    onClick={() => adjustProductStock(product, -1)}
                    disabled={Number(product.stock) <= 0}
                    className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Descontar 1 unidad"
                  >
                    Descontar 1
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustProductStock(product, 1)}
                    className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
                    title="Agregar 1 unidad"
                  >
                    Agregar 1
                  </button>
                </div>
              </div>
            </article>
          ))}

          {!filteredStockProducts.length && (
            <p className="rounded-2xl bg-white p-4 text-lg text-slate-600 shadow-sm">
              No se encontraron productos con ese criterio de búsqueda.
            </p>
          )}
        </section>
      </div>
    );
  }

  function renderVentas() {
    const cartItemsCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    return (
      <div className="space-y-4">
        <SectionHero
          title="Ventas"
          description="Registrá ventas, armá carritos y emití facturas con seguimiento inmediato."
        />

        <section className="grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl bg-emerald-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-emerald-700">Carrito actual</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-900">{cartItemsCount} items</p>
          </article>
          <article className={`rounded-2xl p-4 shadow-sm ${paymentMethodTone(paymentMethod)}`}>
            <p className="text-sm font-bold uppercase">Medio seleccionado</p>
            <p className="mt-1 text-2xl font-extrabold">{paymentMethodLabel(paymentMethod)}</p>
          </article>
        </section>

        {(arcaMessage || arcaError) && (
          <section className="space-y-2">
            {arcaMessage && <p className="rounded-lg bg-emerald-100 p-3 text-emerald-800">{arcaMessage}</p>}
            {arcaError && <p className="rounded-lg bg-red-100 p-3 text-red-700">{arcaError}</p>}
          </section>
        )}

        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          {salesScanToast ? (
            <p className="mb-3 rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">
              {salesScanToast}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-1">
            <div className="relative">
              <input
                ref={saleBarcodeInputRef}
                value={saleBarcode}
                onChange={(e) => {
                  setSaleBarcode(e.target.value);
                  setSaleError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addToCart();
                  }
                }}
                placeholder="Buscar por código o nombre"
                className="w-full rounded-xl border-2 border-slate-300 px-4 py-3"
              />

              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Descripción</label>
                  <input
                    type="text"
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                    placeholder="Descripción del producto"
                    className="w-full rounded-xl border-2 border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Precio</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border-2 border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-300 px-3 py-2"
                  />
                </div>
                <div className="md:col-span-3">
                  <button
                    type="button"
                    onClick={handleAddManualProduct}
                    className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-black hover:bg-amber-600"
                  >
                    Ingreso manual
                  </button>
                </div>
              </div>

              {saleBarcode.trim() && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border-2 border-amber-300 bg-amber-50 shadow-lg ring-2 ring-amber-200/70">
                  {saleSuggestions.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        addProductToCart(product);
                      }}
                      className="block w-full border-b border-amber-200 px-4 py-3 text-left hover:bg-amber-100 last:border-b-0"
                    >
                      <p className="font-extrabold text-slate-900">{product.name}</p>
                      <p className="text-sm font-semibold text-slate-700">
                        Código: {product.barcode} | Stock: {product.stock}
                      </p>
                    </button>
                  ))}

                  {!saleSuggestions.length && (
                    <p className="px-4 py-3 text-sm font-semibold text-amber-900">
                      No hay productos que coincidan.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`rounded-xl px-4 py-2 font-bold text-white ${paymentMethod === "cash" ? "bg-emerald-700 shadow-sm" : "bg-emerald-500"}`}
            >
              Efectivo
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`rounded-xl px-4 py-2 font-bold text-white ${paymentMethod === "card" ? "bg-blue-700 shadow-sm" : "bg-blue-500"}`}
            >
              Tarjeta
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("transfer")}
              className={`rounded-xl px-4 py-2 font-bold text-white ${paymentMethod === "transfer" ? "bg-indigo-700 shadow-sm" : "bg-indigo-500"}`}
            >
              Transferencia
            </button>
            <span className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-bold ${paymentMethodTone(paymentMethod)}`}>
              Seleccionado: {paymentMethodLabel(paymentMethod)}
            </span>
          </div>

          <div className="mt-3 grid gap-2 md:max-w-md">
            <label className="text-sm font-bold text-slate-700">Cliente asociado (opcional)</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            >
              <option value="">Sin cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.last_name}, {client.first_name} | CUIT: {client.cuit}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {cart.map((item) => (
              <div key={item.productId} className="grid grid-cols-[1fr_90px_170px] items-center gap-2 rounded-lg bg-slate-100 p-2">
                <p className="font-semibold">{item.name}</p>
                <input
                  type="number"
                  min="1"
                  max={item.maxStock}
                  value={cartQuantityDrafts[String(item.productId)] ?? String(item.quantity)}
                  onChange={(e) => changeCartQuantityDraft(item.productId, e.target.value)}
                  onBlur={() => commitCartQuantity(item.productId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitCartQuantity(item.productId);
                    }
                  }}
                  className="rounded-lg border-2 border-slate-300 px-2 py-1"
                />
                <div className="flex items-center justify-end gap-2">
                  <span className="inline-flex min-w-[96px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-base font-extrabold text-slate-900">
                    {money(item.price * item.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCartItem(item.productId)}
                    className="rounded-lg bg-red-600 px-2 py-1 font-bold text-white hover:bg-red-700"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}

            {!cart.length && <p className="rounded-lg bg-slate-100 p-3 text-slate-700">Carrito vacío.</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3">
            <p className="text-2xl font-extrabold text-emerald-900">Total: {money(cartTotal)}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={checkoutSale}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-700"
              >
                Cobrar
              </button>
              <button
                type="button"
                onClick={checkoutQuote}
                className="rounded-xl bg-amber-500 px-5 py-3 text-lg font-bold text-black hover:bg-amber-600"
              >
                Generar Presupuesto
              </button>
            </div>
          </div>

          {saleError && <p className="mt-3 rounded-lg bg-red-100 p-3 text-red-700">{saleError}</p>}
          {saleMessage && <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-emerald-700">{saleMessage}</p>}
        </article>

        <CollapsibleSection
          title="Últimas ventas"
          description="Historial rápido de los tickets más recientes."
          isOpen={expandedSections.ventas_recientes}
          onToggle={() => toggleSection("ventas_recientes")}
          className="border-blue-300 bg-blue-50/40"
        >
          <section className="overflow-x-auto rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
            <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-lg">
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Medio</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">ARCA</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 15).map((sale) => (
                <tr key={sale.id} className="bg-slate-50 text-lg">
                  <td className="rounded-l-xl px-4 py-3 font-semibold">{sale.invoice_number}</td>
                  <td className="px-4 py-3">{formatDateTime(sale.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${paymentMethodTone(sale.payment_method)}`}>
                      {paymentMethodLabel(sale.payment_method)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{sale.item_count}</td>
                  <td className="px-4 py-3 font-bold">{money(sale.total_amount)}</td>
                  <td className="px-4 py-3">{sale.seller}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => generateArcaComprobanteForSale(sale.id, { jumpToInvoices: true })}
                      disabled={arcaLoadingSaleId === sale.id}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {arcaLoadingSaleId === sale.id ? "Procesando..." : "ARCA"}
                    </button>
                  </td>
                  <td className="rounded-r-xl px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openSaleDetail(sale.id, { jumpToInvoices: true })}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}

              {!sales.length && (
                <tr>
                  <td className="px-4 py-6 text-center text-lg text-slate-600" colSpan={8}>
                    Aún no hay ventas registradas.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </section>
        </CollapsibleSection>
      </div>
    );
  }

  function renderCaja() {
    const todaySalesTotal = Number(stats?.todaySalesTotal || 0);
    const todayTickets = Number(stats?.todayTickets || 0);
    const cashSalesTotal = Number(cash.metrics?.cashSalesTotal || 0);
    const cashSalesCount = Number(cash.metrics?.cashSalesCount || 0);
    const nonCashSalesTotal = Math.max(0, todaySalesTotal - cashSalesTotal);
    const latestSales = sales.slice(0, 6);

    return (
      <div className="space-y-4">
        <SectionHero
          title="Caja"
          description="Controlá apertura y cierre, esperado de efectivo y movimientos del día."
        />

        <article className="rounded-2xl bg-white p-4 shadow-sm">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-sm font-bold uppercase text-slate-500">Total Hoy</p>
              <p className="text-2xl font-extrabold">{money(todaySalesTotal)}</p>
            </div>
            <div className="rounded-xl bg-emerald-100 p-3">
              <p className="text-sm font-bold uppercase text-emerald-700">Efectivo</p>
              <p className="text-2xl font-extrabold text-emerald-800">{money(cashSalesTotal)}</p>
              <p className="text-sm text-emerald-700">Tickets: {cashSalesCount}</p>
            </div>
            <div className="rounded-xl bg-blue-100 p-3">
              <p className="text-sm font-bold uppercase text-blue-700">No Efectivo</p>
              <p className="text-2xl font-extrabold text-blue-800">{money(nonCashSalesTotal)}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <p className="text-sm font-bold uppercase text-slate-500">Tickets Hoy</p>
              <p className="text-2xl font-extrabold">{todayTickets}</p>
            </div>
          </section>

          <section className="mt-4">
            {cash.openSession ? (
              <div className="space-y-3">
                <p className="rounded-lg bg-emerald-100 p-3">
                  Caja ABIERTA desde {formatDateTime(cash.openSession.opened_at)}
                </p>
                <p className="text-lg">Apertura: {money(cash.openSession.opening_amount)}</p>
                <p className="text-lg">Ventas efectivo: {money(cash.metrics?.cashSalesTotal)}</p>
                <p className="text-lg font-bold">Esperado: {money(cash.metrics?.expectedAmount)}</p>

                <div className="flex flex-wrap gap-3">
                  <input
                    type="number"
                    step="0.01"
                    value={closingAmount}
                    onChange={(e) => setClosingAmount(e.target.value)}
                    placeholder="Monto real de cierre"
                    className="rounded-xl border-2 border-slate-300 px-4 py-3"
                  />
                  <button
                    type="button"
                    onClick={closeCashSession}
                    className="rounded-xl bg-red-600 px-5 py-3 text-lg font-bold text-white hover:bg-red-700"
                  >
                    Cerrar Caja
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="rounded-lg bg-slate-100 p-3">Caja CERRADA.</p>
                <div className="flex flex-wrap gap-3">
                  <input
                    type="number"
                    step="0.01"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    placeholder="Monto inicial"
                    className="rounded-xl border-2 border-slate-300 px-4 py-3"
                  />
                  <button
                    type="button"
                    onClick={openCashSession}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-700"
                  >
                    Abrir Caja
                  </button>
                </div>
              </div>
            )}
          </section>

          {cashMessage && <p className="mt-3 rounded-lg bg-slate-100 p-3">{cashMessage}</p>}
        </article>

        <CollapsibleSection
          title="Análisis y últimas ventas"
          description="Desglose por medios de pago y movimiento reciente."
          isOpen={expandedSections.caja_analitica}
          onToggle={() => toggleSection("caja_analitica")}
          className="border-indigo-300 bg-indigo-50/40"
        >
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/40 to-slate-100 p-4 shadow-sm ring-1 ring-indigo-100">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Desglose por Medio de Pago (Hoy)</h3>
              <div className="space-y-2">
                {paymentBreakdown.map((item) => (
                  <div key={item.payment_method} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold uppercase text-slate-900">{paymentMethodLabel(item.payment_method)}</p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${paymentMethodTone(item.payment_method)}`}>
                        {item.count} tickets
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-extrabold text-slate-900">{money(item.total)}</p>
                  </div>
                ))}
                {!paymentBreakdown.length && (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-700">Sin movimientos hoy.</p>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-blue-200 bg-gradient-to-br from-white via-blue-50/40 to-slate-100 p-4 shadow-sm ring-1 ring-blue-100">
              <h3 className="mb-3 text-xl font-bold text-slate-900">Últimas Ventas</h3>
              <div className="space-y-2">
                {latestSales.map((sale) => (
                  <div key={sale.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-900">{sale.invoice_number}</p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${paymentMethodTone(sale.payment_method)}`}>
                        {paymentMethodLabel(sale.payment_method)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{formatDateTime(sale.created_at)}</p>
                    <p className="mt-2 text-sm text-slate-700">{sale.item_count} items</p>
                    <p className="text-lg font-extrabold text-slate-900">{money(sale.total_amount)}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openSaleDetail(sale.id, { jumpToInvoices: true })}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        Ver detalle
                      </button>
                      <button
                        type="button"
                        onClick={() => generateArcaComprobanteForSale(sale.id, { jumpToInvoices: true })}
                        disabled={arcaLoadingSaleId === sale.id}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {arcaLoadingSaleId === sale.id ? "Procesando..." : "ARCA"}
                      </button>
                    </div>
                  </div>
                ))}
                {!latestSales.length && (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-700">Sin ventas registradas.</p>
                )}
              </div>
            </article>
          </section>
        </CollapsibleSection>

        <CollapsibleSection
          title="Últimos cierres"
          description="Historial de aperturas y cierres de caja."
          isOpen={expandedSections.caja_historial}
          onToggle={() => toggleSection("caja_historial")}
          className="border-amber-300 bg-amber-50/40"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {cashHistory.slice(0, 8).map((session) => (
              <div key={session.id} className="rounded-xl border border-amber-200 bg-gradient-to-br from-white via-amber-50/30 to-slate-100 p-3 text-sm shadow-sm ring-1 ring-amber-100">
                <p className="flex items-center justify-between gap-2 text-slate-900">
                  <span className="font-bold">#{session.id}</span>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${session.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-800"}`}>
                    {session.status === "open" ? "Abierta" : "Cerrada"}
                  </span>
                </p>
                <p className="mt-2 text-slate-700">
                  Abierta: {session.opened_at ? formatDateTime(session.opened_at) : "-"} por {session.opened_by || "-"}
                </p>
                <p className="text-slate-700">
                  Cerrada: {session.closed_at ? formatDateTime(session.closed_at) : "-"} por {session.closed_by || "-"}
                </p>
                <p className="mt-2 text-slate-800">
                  Apertura <span className="font-bold">{money(session.opening_amount)}</span> | Cierre{" "}
                  <span className="font-bold">{money(session.closing_amount)}</span> | Dif.{" "}
                  <span className={`font-bold ${Number(session.difference_amount || 0) === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                    {money(session.difference_amount)}
                  </span>
                </p>
              </div>
            ))}
            {!cashHistory.length && <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-slate-700">Sin historial aún.</p>}
          </div>
        </CollapsibleSection>
      </div>
    );
  }

  function renderFacturas() {
    const selected = selectedSaleDetail;
    const arcaFiscal = selected
      ? parseArcaFiscalData(selected.arca_comprobante_id, selected.arca_response_payload)
      : null;

    return (
      <div className="space-y-4">
        <SectionHero
          title="Facturas"
          description="Consultá el historial completo, filtrá por criterios y revisá el detalle de cada comprobante."
        />

        <section className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl bg-blue-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-blue-700">Facturas Totales</p>
            <p className="mt-1 text-2xl font-extrabold text-blue-900">{sales.length}</p>
          </article>
          <article className="rounded-2xl bg-emerald-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-emerald-700">Facturas Filtradas</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-900">{filteredInvoices.length}</p>
          </article>
          <article className="rounded-2xl bg-amber-100 p-4 shadow-sm">
            <p className="text-sm font-bold uppercase text-amber-700">Venta Promedio</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-900">
              {filteredInvoices.length
                ? money(filteredInvoices.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) / filteredInvoices.length)
                : money(0)}
            </p>
          </article>
        </section>

        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={invoiceFilters.invoiceQuery}
              onChange={(e) => setInvoiceFilters((prev) => ({ ...prev, invoiceQuery: e.target.value }))}
              placeholder="Buscar por factura o vendedor"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            />

            <select
              value={invoiceFilters.paymentMethod}
              onChange={(e) => setInvoiceFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            >
              <option value="">Todos los medios</option>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="other">Otro</option>
            </select>

            <select
              value={invoiceFilters.seller}
              onChange={(e) => setInvoiceFilters((prev) => ({ ...prev, seller: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            >
              <option value="">Todos los vendedores</option>
              {invoiceSellers.map((seller) => (
                <option key={seller} value={seller}>
                  {seller}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={invoiceFilters.dateFrom}
              onChange={(e) => setInvoiceFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            />

            <input
              type="date"
              value={invoiceFilters.dateTo}
              onChange={(e) => setInvoiceFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={clearInvoiceFilters}
              className="rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-800 hover:bg-slate-300"
            >
              Limpiar filtros
            </button>
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-bold">{filteredInvoices.length}</span> de{" "}
              <span className="font-bold">{sales.length}</span> facturas.
            </p>
          </div>
        </article>

        <section className="overflow-x-auto rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <h3 className="text-lg font-bold text-slate-900">Lista de facturas</h3>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Seleccioná una fila y luego “Ver detalle”
            </p>
          </div>
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-lg">
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Medio</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3">Estado ARCA</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((sale) => (
                <tr key={sale.id} className={`text-lg ${selectedSaleId === sale.id ? "bg-amber-100" : "bg-slate-50"}`}>
                  <td className="rounded-l-xl px-4 py-3 font-semibold">{sale.invoice_number}</td>
                  <td className="px-4 py-3">{formatDateTime(sale.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${paymentMethodTone(sale.payment_method)}`}>
                      {paymentMethodLabel(sale.payment_method)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{sale.item_count}</td>
                  <td className="px-4 py-3 font-bold">{money(sale.total_amount)}</td>
                  <td className="px-4 py-3">
                    {sale.customer_first_name
                      ? `${sale.customer_last_name || ""}, ${sale.customer_first_name}`.replace(/^,\s*/, "")
                      : "-"}
                  </td>
                  <td className="px-4 py-3">{sale.seller}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${arcaStatusTone(sale.arca_status)}`}>
                      {arcaStatusLabel(sale.arca_status)}
                    </span>
                  </td>
                  <td className="rounded-r-xl px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openSaleDetail(sale.id)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}

              {!filteredInvoices.length && (
                <tr>
                  <td className="px-4 py-6 text-center text-lg text-slate-600" colSpan={9}>
                    No hay facturas que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <CollapsibleSection
          title="Detalle de factura seleccionada"
          description="Arranca cerrado al ingresar. Abrilo al elegir una factura de la lista."
          isOpen={expandedSections.facturas_detalle}
          onToggle={() => toggleSection("facturas_detalle")}
          className="ring-1 ring-slate-200"
          headerActions={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={printSelectedInvoice}
                disabled={!selected || selectedSaleLoading}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Imprimir Factura Interna
              </button>
              <button
                type="button"
                onClick={printSelectedArcaInvoice}
                disabled={!selected || selected.arca_status !== "issued" || selectedSaleLoading}
                className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Imprimir Factura ARCA
              </button>
            </div>
          }
        >
          <div
            ref={invoiceDetailRef}
            className={`rounded-xl transition-all duration-500 ${
              invoiceDetailFlash ? "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-white" : ""
            }`}
          >
            {!selectedSaleId && <p className="rounded-lg bg-slate-100 p-3">Seleccioná una factura para ver su detalle.</p>}
            {selectedSaleLoading && <p className="rounded-lg bg-slate-100 p-3">Cargando detalle...</p>}
            {selectedSaleError && <p className="rounded-lg bg-red-100 p-3 text-red-700">{selectedSaleError}</p>}
            {invoiceEmailError && <p className="rounded-lg bg-red-100 p-3 text-red-700">{invoiceEmailError}</p>}
            {invoiceEmailMessage && <p className="rounded-lg bg-emerald-100 p-3 text-emerald-800">{invoiceEmailMessage}</p>}

            {selected && !selectedSaleLoading && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold uppercase text-slate-500">ARCA</span>
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${arcaStatusTone(selected.arca_status)}`}>
                      {arcaStatusLabel(selected.arca_status)}
                    </span>
                    {selected.arca_comprobante_id && (
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-bold text-indigo-800">
                        ID: {selected.arca_comprobante_id}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        generateArcaComprobanteForSale(selected.id, {
                          force: selected.arca_status === "issued",
                          jumpToInvoices: true
                        })
                      }
                      disabled={arcaLoadingSaleId === selected.id}
                      className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60"
                    >
                      {arcaLoadingSaleId === selected.id
                        ? "Generando..."
                        : selected.arca_status === "issued"
                        ? "Regenerar comprobante ARCA"
                        : "Generar comprobante ARCA"}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendInvoiceEmailForSale(selected.id)}
                      disabled={invoiceEmailLoadingSaleId === selected.id}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      {invoiceEmailLoadingSaleId === selected.id ? "Enviando..." : "Enviar Factura"}
                    </button>
                  </div>
                </div>

                {selected.arca_last_error && (
                  <p className="rounded-lg bg-red-100 p-3 text-red-700">
                    Último error ARCA: {selected.arca_last_error}
                  </p>
                )}

                {selected.arca_status === "issued" && arcaFiscal && (
                  <div className="grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 md:grid-cols-2 xl:grid-cols-5">
                    <div>
                      <p className="text-xs font-bold uppercase text-indigo-700">CAE</p>
                      <p className="text-sm font-extrabold text-indigo-900">{arcaFiscal.cae}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-indigo-700">Vto. CAE</p>
                      <p className="text-sm font-extrabold text-indigo-900">{arcaFiscal.caeVto}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-indigo-700">Punto de venta</p>
                      <p className="text-sm font-extrabold text-indigo-900">{arcaFiscal.puntoVta}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-indigo-700">Tipo cbte</p>
                      <p className="text-sm font-extrabold text-indigo-900">{arcaFiscal.tipoCbte}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-indigo-700">Número</p>
                      <p className="text-sm font-extrabold text-indigo-900">{arcaFiscal.numeroCbte}</p>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-lg bg-indigo-100 p-3">
                    <p className="text-sm font-bold uppercase text-indigo-700">Factura</p>
                    <p className="text-lg font-extrabold">{selected.invoice_number}</p>
                  </div>
                  <div className="rounded-lg bg-blue-100 p-3">
                    <p className="text-sm font-bold uppercase text-blue-700">Fecha</p>
                    <p className="text-lg font-extrabold">{formatDateTime(selected.created_at)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-100 p-3">
                    <p className="text-sm font-bold uppercase text-emerald-700">Vendedor</p>
                    <p className="text-lg font-extrabold">{selected.seller}</p>
                  </div>
                  <div className="rounded-lg bg-amber-100 p-3">
                    <p className="text-sm font-bold uppercase text-amber-700">Medio de pago</p>
                    <p className="text-lg font-extrabold">{paymentMethodLabel(selected.payment_method)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 p-3">
                    <p className="text-sm font-bold uppercase text-slate-600">Cliente</p>
                    <p className="text-lg font-extrabold text-slate-900">
                      {selected.customer_first_name
                        ? `${selected.customer_last_name || ""}, ${selected.customer_first_name}`.replace(/^,\s*/, "")
                        : "-"}
                    </p>
                  </div>
                </div>

                <section className="overflow-x-auto rounded-xl bg-slate-50 p-2">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-base">
                        <th className="px-3 py-2">Artículo</th>
                        <th className="px-3 py-2">Talle/Color</th>
                        <th className="px-3 py-2">Precio unitario</th>
                        <th className="px-3 py-2">Cantidad</th>
                        <th className="px-3 py-2">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.items || []).map((item, index) => (
                        <tr key={`${selected.id}-${item.product_id}-${index}`} className="bg-white">
                          <td className="rounded-l-lg px-3 py-2 font-semibold">{item.product_name_snapshot}</td>
                          <td className="px-3 py-2">{item.size_color_snapshot || "-"}</td>
                          <td className="px-3 py-2">{money(item.unit_price)}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="rounded-r-lg px-3 py-2 font-bold">{money(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <div className="flex justify-end">
                  <p className="rounded-lg bg-emerald-100 px-4 py-2 text-xl font-extrabold text-emerald-900">
                    Total factura: {money(selected.total_amount)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>
    );
  }

  function renderClientes() {
    return (
      <div className="space-y-4">
        <SectionHero
          title="Clientes"
          description="Alta de clientes y seguimiento de compras asociadas por historial de facturas."
        />

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h3 className="mb-3 text-2xl font-bold text-slate-900">
            {editingClientId ? `Editar cliente #${editingClientId}` : "Nuevo cliente"}
          </h3>
          <form onSubmit={saveClient} className="grid gap-3 md:grid-cols-2">
            <input
              ref={clientFormFirstInputRef}
              value={clientForm.firstName}
              onChange={(e) => setClientForm((prev) => ({ ...prev, firstName: e.target.value }))}
              placeholder="Nombre"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
              required
            />
            <input
              value={clientForm.lastName}
              onChange={(e) => setClientForm((prev) => ({ ...prev, lastName: e.target.value }))}
              placeholder="Apellido"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
              required
            />
            <input
              value={clientForm.cuit}
              onChange={(e) => setClientForm((prev) => ({ ...prev, cuit: e.target.value }))}
              placeholder="CUIT"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
              required
            />
            <input
              value={clientForm.phone}
              onChange={(e) => setClientForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Teléfono"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
              required
            />
            <input
              type="email"
              value={clientForm.email}
              onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email"
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
              required
            />
            <select
              value={clientForm.condicionIva}
              onChange={(e) => setClientForm((prev) => ({ ...prev, condicionIva: e.target.value }))}
              className="rounded-xl border-2 border-slate-300 px-4 py-3"
              required
            >
              {ivaConditionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-lg font-bold text-white hover:bg-emerald-700"
              >
                {editingClientId ? "Actualizar cliente" : "Guardar cliente"}
              </button>
              {editingClientId && (
                <button
                  type="button"
                  onClick={cancelClientEdit}
                  className="rounded-xl bg-slate-200 px-5 py-3 text-lg font-bold text-slate-800 hover:bg-slate-300"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {clientError && <p className="mt-3 rounded-lg bg-red-100 p-3 text-red-700">{clientError}</p>}
          {clientMessage && <p className="mt-3 rounded-lg bg-emerald-100 p-3 text-emerald-700">{clientMessage}</p>}
        </section>

        <section className="space-y-3">
          {clients.map((client, index) => (
            <article
              key={client.id}
              className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${
                index % 2 === 0 ? "ring-indigo-200" : "ring-emerald-200"
              }`}
            >
              <div className={`px-4 py-2 ${index % 2 === 0 ? "bg-indigo-50" : "bg-emerald-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-700">
                    Cliente #{client.id}
                  </p>
                  <button
                    type="button"
                    onClick={() => startClientEdit(client)}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    Editar
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Nombre</p>
                  <p className="text-lg font-extrabold text-slate-900">{client.first_name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Apellido</p>
                  <p className="text-lg font-extrabold text-slate-900">{client.last_name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">CUIT</p>
                  <p className="text-lg font-extrabold text-slate-900">{client.cuit}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Teléfono</p>
                  <p className="text-lg font-extrabold text-slate-900">{client.phone}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Email</p>
                  <p className="break-all text-lg font-extrabold text-slate-900">{client.email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Condición IVA</p>
                  <p className="text-lg font-extrabold text-slate-900">{client.condicion_iva || "-"}</p>
                </div>
              </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-lg font-bold text-amber-900">Adeudamiento</h4>
                    <p className="rounded-lg bg-white px-3 py-1 font-bold text-amber-900">
                      Saldo: {money(client.debt_balance || 0)}
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Monto (+deuda / -pago)"
                      value={clientDebtForms[client.id]?.amount || ""}
                      onChange={(e) =>
                        setClientDebtForms((prev) => ({
                          ...prev,
                          [client.id]: { ...(prev[client.id] || { note: "" }), amount: e.target.value }
                        }))
                      }
                      className="rounded-lg border border-amber-300 px-3 py-2"
                    />
                    <input
                      type="text"
                      placeholder="Detalle (opcional)"
                      value={clientDebtForms[client.id]?.note || ""}
                      onChange={(e) =>
                        setClientDebtForms((prev) => ({
                          ...prev,
                          [client.id]: { ...(prev[client.id] || { amount: "" }), note: e.target.value }
                        }))
                      }
                      className="rounded-lg border border-amber-300 px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={() => saveClientDebt(client.id)}
                      className="rounded-lg bg-amber-600 px-3 py-2 font-bold text-white hover:bg-amber-700"
                    >
                      Registrar movimiento
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(client.debts || []).slice(0, 10).map((debt) => (
                      <div key={debt.id} className="flex flex-wrap items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                        <span>{formatDateTime(debt.created_at)}</span>
                        <span className="font-semibold">{debt.note || "Sin detalle"}</span>
                        <span className={`font-bold ${Number(debt.amount) >= 0 ? "text-red-700" : "text-emerald-700"}`}>
                          {money(debt.amount)}
                        </span>
                      </div>
                    ))}
                    {!(client.debts || []).length && (
                      <p className="text-sm text-amber-900">Sin movimientos de adeudamiento.</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <h4 className="text-lg font-bold text-slate-900">Compras realizadas</h4>
                  <button
                    type="button"
                    onClick={() => toggleClientPurchases(client.id)}
                    className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    {expandedClientPurchases[client.id] ? "Ocultar compras" : "Ver compras"}
                  </button>
                </div>

                {expandedClientPurchases[client.id] && (
                  <div className="mt-3 overflow-x-auto rounded-xl bg-slate-50 p-2">
                    <table className="min-w-full border-separate border-spacing-y-2">
                      <thead>
                        <tr className="text-left text-sm">
                          <th className="px-3 py-2">Factura</th>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Medio</th>
                          <th className="px-3 py-2">Items</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2">Vendedor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(client.purchases || []).map((sale) => (
                          <tr key={`${client.id}-${sale.id}`} className="bg-white">
                            <td className="rounded-l-lg px-3 py-2 font-semibold">{sale.invoice_number}</td>
                            <td className="px-3 py-2">{formatDateTime(sale.created_at)}</td>
                            <td className="px-3 py-2">{paymentMethodLabel(sale.payment_method)}</td>
                            <td className="px-3 py-2">{sale.item_count}</td>
                            <td className="px-3 py-2 font-bold">{money(sale.total_amount)}</td>
                            <td className="rounded-r-lg px-3 py-2">{sale.seller}</td>
                          </tr>
                        ))}
                        {!(client.purchases || []).length && (
                          <tr>
                            <td className="px-3 py-3 text-sm text-slate-600" colSpan={6}>
                              Sin compras asociadas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </article>
          ))}

          {!clients.length && (
            <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm ring-1 ring-slate-200">
              Aún no hay clientes cargados.
            </p>
          )}
        </section>
      </div>
    );
  }

  function renderPrecios() {
    return (
      <div className="space-y-4">
        <SectionHero
          title="Precios"
          description="Aplicá actualizaciones masivas y monitoreá productos con riesgo de quiebre de stock."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-2xl font-bold">Actualización de Lista de Precios</h2>
          <p className="mb-3 text-slate-600">Aplicá cambios masivos sin tocar producto por producto.</p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setPriceMode("percentage")}
                className={`rounded-xl px-4 py-2 font-bold text-white ${priceMode === "percentage" ? "bg-blue-700" : "bg-blue-500"}`}
              >
                Porcentaje
              </button>
              <button
                type="button"
                onClick={() => setPriceMode("fixed")}
                className={`rounded-xl px-4 py-2 font-bold text-white ${priceMode === "fixed" ? "bg-slate-700" : "bg-slate-500"}`}
              >
                Precio Fijo
              </button>
            </div>

            <input
              type="number"
              step="0.01"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder={priceMode === "percentage" ? "Ej: 10 para +10%, -5 para -5%" : "Nuevo precio único"}
              className="w-full rounded-xl border-2 border-slate-300 px-4 py-3"
            />

            <button
              type="button"
              onClick={applyPriceUpdate}
              className="rounded-xl bg-blue-600 px-5 py-3 text-lg font-bold text-white hover:bg-blue-700"
            >
              Actualizar Precios
            </button>

            {priceMessage && <p className="rounded-lg bg-slate-100 p-3">{priceMessage}</p>}
          </div>
          </article>

          <CollapsibleSection
            title="Productos con stock crítico"
            description="Detalle de artículos por debajo del mínimo."
            isOpen={expandedSections.precios_stock_critico}
            onToggle={() => toggleSection("precios_stock_critico")}
          >
            <div className="space-y-2">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="rounded-lg bg-red-100 p-3 text-red-900">
                  <p className="font-bold">{product.name}</p>
                  <p>
                    Disponible: {product.stock} | Mínimo: {product.low_stock_threshold}
                  </p>
                </div>
              ))}
              {!lowStockProducts.length && (
                <p className="rounded-lg bg-emerald-100 p-3 text-emerald-800">No hay alertas de stock bajo.</p>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  function renderEstadisticas() {
    const todaySalesTotal = Number(stats?.todaySalesTotal || 0);
    const todayTickets = Number(stats?.todayTickets || 0);
    const averageTicket = todayTickets > 0 ? todaySalesTotal / todayTickets : 0;

    return (
      <div className="space-y-4">
        <SectionHero
          title="Estadísticas"
          description="Panel de control comercial con foco en ventas, tickets y rendimiento de productos."
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl bg-emerald-100 p-4 shadow-sm">
            <h3 className="text-base font-bold text-emerald-700">Unidades en Stock</h3>
            <p className="mt-2 text-3xl font-extrabold text-emerald-900">{stats?.unitsInStock ?? 0}</p>
          </article>
          <article className="rounded-2xl bg-blue-100 p-4 shadow-sm">
            <h3 className="text-base font-bold text-blue-700">Alertas de Stock</h3>
            <p className="mt-2 text-3xl font-extrabold text-blue-900">{stats?.lowStockCount ?? 0}</p>
          </article>
          <article className="rounded-2xl bg-amber-100 p-4 shadow-sm">
            <h3 className="text-base font-bold text-amber-700">Productos Cargados</h3>
            <p className="mt-2 text-3xl font-extrabold text-amber-900">{stats?.productCount ?? 0}</p>
          </article>
          <article className="rounded-2xl bg-indigo-100 p-4 shadow-sm">
            <h3 className="text-base font-bold text-indigo-700">Ticket Promedio (Hoy)</h3>
            <p className="mt-2 text-3xl font-extrabold text-indigo-900">{money(averageTicket)}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-2xl font-bold">Producto Más Vendido</h2>
              <GoldMedalBadge />
            </div>
            {stats?.topProduct ? (
              <div className="rounded-lg bg-emerald-100 p-4">
                <p className="text-2xl font-bold text-emerald-900">{stats.topProduct.name}</p>
                <p className="mt-2 text-xl font-extrabold text-emerald-800">{stats.topProduct.total_units} unidades vendidas</p>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-100 p-3">Sin ventas registradas todavía.</p>
            )}
          </article>

          <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-2xl font-bold">Ventas por Medio de Pago (Hoy)</h2>
            <div className="space-y-2">
              {paymentBreakdown.map((item) => (
                <div key={item.payment_method} className="rounded-lg bg-slate-100 p-3">
                  <p className="font-bold uppercase">
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm ${paymentMethodTone(item.payment_method)}`}>
                      {paymentMethodLabel(item.payment_method)}
                    </span>
                  </p>
                  <p>
                    Total: {money(item.total)} | Tickets: {item.count}
                  </p>
                </div>
              ))}
              {!paymentBreakdown.length && <p className="rounded-lg bg-slate-100 p-3">Sin movimientos hoy.</p>}
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-fuchsia-300 bg-gradient-to-br from-fuchsia-50 via-white to-indigo-50 p-4 shadow-sm ring-2 ring-fuchsia-200">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-2xl font-extrabold text-fuchsia-900">Ventas por Usuario (Hoy)</h2>
            <span className="rounded-full bg-fuchsia-200 px-3 py-1 text-xs font-extrabold uppercase text-fuchsia-900">
              Ranking Diario
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-fuchsia-200 bg-white p-2">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-sm">
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Tickets</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {salesByUserToday.map((item, index) => (
                  <tr key={item.userId} className={`${index === 0 ? "bg-amber-50" : "bg-white"}`}>
                    <td className="rounded-l-lg px-3 py-2 font-semibold">
                      <span className="mr-2 inline-flex w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        {index + 1}
                      </span>
                      {item.username}
                    </td>
                    <td className="px-3 py-2">{item.ticketCount}</td>
                    <td className="rounded-r-lg px-3 py-2 font-bold">{money(item.total)}</td>
                  </tr>
                ))}
                {!salesByUserToday.length && (
                  <tr>
                    <td className="px-3 py-3 text-sm text-slate-600" colSpan={3}>
                      Sin datos de ventas por usuario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  function renderActiveView() {
    if (activeView === "stock") {
      return renderStock();
    }
    if (activeView === "ajuste_stock") {
      return renderAjusteStock();
    }
    if (activeView === "ventas") {
      return renderVentas();
    }
    if (activeView === "caja") {
      return renderCaja();
    }
    if (activeView === "facturas") {
      return renderFacturas();
    }
    if (activeView === "clientes") {
      return renderClientes();
    }
    if (activeView === "precios") {
      return renderPrecios();
    }
    if (activeView === "estadisticas") {
      return renderEstadisticas();
    }
    return renderInicio();
  }

  if (loading) {
    return <div className="min-h-screen p-8 text-xl">Cargando...</div>;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#090B0F] p-4 sm:p-8">
        <section className="mx-auto max-w-md rounded-2xl border border-[#D4842B]/40 bg-[#11151B] p-6 shadow-[0_0_0_1px_rgba(212,132,43,0.15)]">
          <img
            src="/fito-logo.svg"
            alt="Logo Fito Deportes"
            className="mb-5 h-auto w-full rounded-xl border border-[#D4842B]/30 bg-[#090B0F] p-2"
          />
          <div className="mb-6 border-b border-[#D4842B]/30 pb-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#D4842B]">Deportes Fito</p>
            <h1 className="mt-2 text-3xl font-extrabold text-white">Ingreso al Sistema</h1>
            <p className="mt-2 text-sm text-slate-300">Venta de materiales de indumentaria y material deportivo</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-lg font-semibold text-slate-200">Usuario</span>
              <select
                className="w-full rounded-xl border-2 border-[#D4842B] bg-[#0D1117] px-4 py-3 font-semibold text-white"
                value={loginForm.username}
                onChange={(e) =>
                  setLoginForm({
                    username: e.target.value,
                    password: e.target.value === "FitoAdmin" ? loginForm.password : ""
                  })
                }
              >
                <option value="Fito">Fito (Empleado)</option>
                <option value="Fito1">Fito1 (Empleado)</option>
                <option value="Fito2">Fito2 (Empleado)</option>
                <option value="Fito3">Fito3 (Empleado)</option>
                <option value="FitoAdmin">FitoAdmin (Administrador)</option>
              </select>
            </label>

            {isAdminLogin && (
              <label className="block">
                <span className="mb-2 block text-lg font-semibold text-slate-200">Contraseña</span>
                <input
                  type="password"
                  className="w-full rounded-xl border-2 border-[#D4842B] bg-[#0D1117] px-4 py-3 text-white placeholder:text-slate-400"
                  placeholder="Ingresá la clave de administrador"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </label>
            )}

            {!isAdminLogin && (
              <p className="rounded-lg border border-[#D4842B]/30 bg-[#1A1F27] p-3 text-base text-slate-200">
                Usuario empleado seleccionado. No requiere contraseña.
              </p>
            )}

            {loginError && <p className="rounded-lg bg-red-950/70 p-3 text-lg text-red-200">{loginError}</p>}

            <button
              type="submit"
              className="w-full rounded-xl bg-[#D4842B] px-4 py-4 text-xl font-extrabold text-black hover:bg-[#E39A47]"
            >
              Ingresar
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200 p-4 sm:p-6">
      {salesActionLoading ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-[1px]">
          <div className="flex w-[min(92vw,420px)] flex-col items-center gap-4 rounded-2xl border border-white/30 bg-white px-6 py-7 text-center shadow-2xl">
            <div className="relative h-20 w-20">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-500 border-r-emerald-400" />
              <div className="absolute inset-[22px] animate-pulse rounded-full bg-emerald-500/80" />
            </div>
            <p className="text-base font-extrabold text-slate-900">{salesActionLabel || "Procesando..."}</p>
            <p className="text-sm text-slate-600">Esperá unos segundos, estamos completando la operación.</p>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-[#D4842B] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-44 max-w-full">
                <img src="/fito-logo.svg" alt="Logo Fito Deportes" className="h-auto w-full rounded-lg border border-slate-200 bg-[#090B0F] p-1.5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Sistema comercial</p>
                <h1 className="text-3xl font-extrabold text-slate-900">Fito Deportes</h1>
                <p className="text-sm text-slate-600">
                  Gestión de stock, ventas, caja y facturación en una sola plataforma.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl bg-slate-100 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Usuario activo</p>
                <p className="text-base font-bold text-slate-900">
                  {user.username} <span className="text-slate-500">({user.role === "admin" ? "Administrador" : "Empleado"})</span>
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(new Date())}</p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
                title="Cerrar sesión"
              >
                Log out
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-800 to-slate-700 p-3 text-white shadow-inner">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Panel Operativo</p>
            <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <p className="text-xs font-bold uppercase text-blue-200">Ventas Hoy</p>
              <p className="text-xl font-extrabold text-blue-100">{money(stats?.todaySalesTotal)}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <p className="text-xs font-bold uppercase text-emerald-200">Tickets Hoy</p>
              <p className="text-xl font-extrabold text-emerald-100">{stats?.todayTickets ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <p className="text-xs font-bold uppercase text-amber-200">Caja</p>
              <p className="text-xl font-extrabold text-amber-100">{cash.openSession ? "Abierta" : "Cerrada"}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <p className="text-xs font-bold uppercase text-indigo-200">Dólar E.E.U.U</p>
              <p className="text-base font-extrabold text-indigo-100">
                {Number.isFinite(usdQuote.sell) ? `Venta $${usdQuote.sell.toFixed(2)}` : "No disponible"}
              </p>
              <p className="text-xs text-indigo-200">
                {Number.isFinite(usdQuote.buy) ? `Compra $${usdQuote.buy.toFixed(2)}` : ""}
                {usdQuote.source ? ` ${usdQuote.source}` : ""}
              </p>
            </div>
            </div>
          </div>
        </header>

        {error && <p className="rounded-lg bg-red-100 p-3 text-lg text-red-700">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-slate-800/40 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-3 text-white shadow-sm lg:sticky lg:top-4 lg:h-fit">
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Secciones</p>
            <nav className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-lg font-bold ${
                    activeView === item.id
                      ? "bg-[#D4842B] text-black shadow-sm"
                      : "border border-white/20 bg-white/10 text-slate-100 hover:bg-white/20"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-4 rounded-xl border border-slate-800/40 bg-gradient-to-br from-slate-800 via-slate-800 to-slate-700 p-4 text-white shadow-inner">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Estado En Vivo</p>
              <div className="space-y-3">
                <div className="rounded-lg bg-white/10 p-3">
                  <p className="text-xs uppercase text-slate-300">Caja</p>
                  <p className={`text-lg font-extrabold ${cash.openSession ? "text-emerald-300" : "text-amber-300"}`}>
                    {cash.openSession ? "Abierta" : "Cerrada"}
                  </p>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <p className="text-xs uppercase text-slate-300">Alertas de Stock</p>
                  <p className="text-lg font-extrabold text-red-300">{stats?.lowStockCount ?? 0}</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
            {renderActiveView()}
          </section>
        </div>
      </div>
    </main>
  );
}

export default App;
