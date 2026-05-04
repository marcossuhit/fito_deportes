const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Error en la API");
  }

  return data;
}

export const api = {
  login: (username, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),
  logout: () =>
    request("/auth/logout", {
      method: "POST"
    }),
  me: () => request("/auth/me"),

  listProducts: () => request("/products"),
  createProduct: (payload) =>
    request("/products", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateProduct: (id, payload) =>
    request(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteProduct: (id) =>
    request(`/products/${id}`, {
      method: "DELETE"
    }),
  scanBarcode: (barcode, quantityDelta = 1) =>
    request("/products/scan", {
      method: "POST",
      body: JSON.stringify({ barcode, quantityDelta })
    }),
  listLowStockAlerts: () => request("/products/alerts/low-stock"),
  updateProductThreshold: (id, low_stock_threshold) =>
    request(`/products/${id}/threshold`, {
      method: "PATCH",
      body: JSON.stringify({ low_stock_threshold })
    }),
  bulkUpdatePrices: (payload) =>
    request("/products/price-update", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  listSales: () => request("/sales"),
  getSale: (id) => request(`/sales/${id}`),
  getSalePrintHtml: (id) => request(`/sales/${id}/print-html`),
  sendSaleInvoiceEmail: (id) =>
    request(`/sales/${id}/send-email`, {
      method: "POST"
    }),
  generateArcaComprobante: (id, force = false) =>
    request(`/sales/${id}/arca/generate`, {
      method: "POST",
      body: JSON.stringify({ force })
    }),
  createSale: (payload) =>
    request("/sales", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createQuote: (payload) =>
    request("/sales/quote", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  cashStatus: () => request("/cash/status"),
  cashHistory: () => request("/cash/history"),
  openCash: (openingAmount) =>
    request("/cash/open", {
      method: "POST",
      body: JSON.stringify({ openingAmount })
    }),
  closeCash: (closingAmount) =>
    request("/cash/close", {
      method: "POST",
      body: JSON.stringify({ closingAmount })
    }),

  statsOverview: () => request("/stats/overview"),
  topProducts: (limit = 10) => request(`/stats/top-products?limit=${limit}`),
  listClients: () => request("/clients"),
  createClient: (payload) =>
    request("/clients", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
