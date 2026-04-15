---
name: Currency conversion with real-time TRM
description: Dynamic COP/USD conversion using Frankfurter API, per-company salesCurrency field, cached TRM
type: feature
---
- Each company stores `sales_currency` (DB) / `salesCurrency` (TS) indicating the currency its sales data was entered in (default COP)
- `src/lib/exchangeRate.ts` fetches USD→COP rate from Frankfurter API, caches 1h in localStorage + memory, fallback 4200
- `convertWithTRM(value, from, to, trm)` does the math
- CompanyTable and CompanyProfile show TRM info and convert on toggle
- SalesChart accepts `sourceCurrency` and `trm` props for dynamic conversion
- CompanyForm has "Moneda principal de ventas" selector (COP/USD)
