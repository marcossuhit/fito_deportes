# ARCA Gateway (WSAA + WSFEv1)

Microservicio intermedio para mantener `FitoDeportes` como cliente HTTP.

## Contrato

Endpoint:
- `POST /comprobantes`
- Header: `Authorization: Bearer <API_TOKEN>`
- Body: payload de venta que hoy manda `backend/src/services/arca.js`

Respuesta esperada por FitoDeportes:
```json
{
  "comprobanteId": "..."
}
```

## Variables de entorno
Copiá `.env.example` a `.env` y completá:
- `API_TOKEN`: el mismo valor que `ARCA_TOKEN` en `FitoDeportes/backend/.env`
- `ARCA_MODE`: `homologacion` o `produccion`
- `ARCA_CERT_PATH`, `ARCA_KEY_PATH`
- `ARCA_CUIT`, `ARCA_PTO_VTA`, `ARCA_CBTE_TIPO`

## Ejecutar local
```bash
cd arca-gateway
npm install
cp .env.example .env
npm run dev
```

Healthcheck:
```bash
curl http://localhost:3090/health
```

## Integración con FitoDeportes backend
En `FitoDeportes/backend/.env`:
```env
ARCA_MOCK_MODE=0
ARCA_COMPROBANTE_URL=http://localhost:3090/comprobantes
ARCA_TOKEN=CAMBIAR_TOKEN
ARCA_TIMEOUT_MS=30000
```

Reiniciar backend de FitoDeportes.

## Producción
1. Desplegar este servicio en `https://<tu-dominio-arca>/comprobantes`.
2. Configurar certificados/clave y variables ARCA en ese host.
3. En API principal:
```env
ARCA_MOCK_MODE=0
ARCA_COMPROBANTE_URL=https://<tu-dominio-arca>/comprobantes
ARCA_TOKEN=<mismo API_TOKEN del gateway>
```
4. Reiniciar servicios.

## Notas
- Este gateway implementa flujo base WSAA + FECAESolicitar.
- Si tu operador fiscal requiere reglas adicionales (tipos de doc, alícuotas múltiples, tributos, exentos), extendé `src/index.js` y `src/arcaSoap.js`.
