# Fito Deportes - Starter

Estructura inicial para la app web de Fito Deportes enfocada en uso simple (botones grandes, alto contraste y flujos claros).

## Stack
- Frontend: React + Tailwind CSS + Vite
- Backend: Node.js + Express
- Base de datos: SQLite (incluida) + esquema PostgreSQL de referencia
- Escaneo: `html5-qrcode` para cámara de notebook
- Auth: Login básico por sesión (`express-session`)

## Estructura

```txt
fito-deportes/
  backend/
    sql/
      schema.sqlite.sql
      schema.postgres.sql
    src/
      middleware/auth.js
      routes/auth.js
      routes/products.js
      routes/sales.js
      routes/cash.js
      routes/stats.js
      db.js
      index.js
    .env.example
    package.json
  frontend/
    src/
      api.js
      App.jsx
      index.css
      main.jsx
    index.html
    postcss.config.js
    tailwind.config.js
    vite.config.js
    package.json
```

## Cómo ejecutar

1. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

2. Frontend
```bash
cd ../frontend
npm install
npm run dev
```

3. Abrir en navegador
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001/api`

## Login inicial
- Usuario administrador: `FitoAdmin`
- Contraseña administrador: `JOAQUINA`
- Usuario empleado: `Fito`
- Contraseña empleado: *(sin clave)*

Cambiar `SESSION_SECRET` en `backend/.env` antes de producción.

## Funciones incluidas
- Control de stock (alta, edición, baja, escaneo y alertas por stock mínimo).
- Ventas con facturación simple (número de factura automático).
- Caja diaria (apertura, ventas en efectivo y cierre con diferencia).
- Estadísticas rápidas:
  - Ventas del día.
  - Tickets del día.
  - Producto más vendido.
  - Alertas de stock bajo.
- Actualización masiva de lista de precios (por porcentaje o precio fijo).

## Nota sobre escaneo
Si la cámara falla por luz/enfoque, usar pistola de código de barras (modo teclado) funciona muy bien con el campo de código manual.
