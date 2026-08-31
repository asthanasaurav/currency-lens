(function attachRateTools(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CurrencyLensRates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function rateToolsFactory() {
  "use strict";

  function rowsToRateMap(rows) {
    const rates = { EUR: 1 };
    let date = null;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.base !== "EUR" || typeof row.quote !== "string" || !Number.isFinite(Number(row.rate))) continue;
      rates[row.quote.toUpperCase()] = Number(row.rate);
      if (!date || String(row.date) > date) date = String(row.date);
    }
    return { rates, date };
  }

  function convertFromEuroBase(amount, sourceCurrency, rateMap) {
    const source = String(sourceCurrency || "").toUpperCase();
    const rates = rateMap || {};
    const sourcePerEuro = source === "EUR" ? 1 : Number(rates[source]);
    const usdPerEuro = Number(rates.USD);
    if (!Number.isFinite(amount) || !Number.isFinite(sourcePerEuro) || sourcePerEuro <= 0 || !Number.isFinite(usdPerEuro) || usdPerEuro <= 0) return null;
    const eur = amount / sourcePerEuro;
    return { EUR: eur, USD: eur * usdPerEuro };
  }

  return Object.freeze({ rowsToRateMap, convertFromEuroBase });
});
