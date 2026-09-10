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

  function convertFromEuroBase(amount, sourceCurrency, rateMap, targets) {
    const source = String(sourceCurrency || "").toUpperCase();
    const rates = rateMap || {};
    const sourcePerEuro = source === "EUR" ? 1 : Number(rates[source]);
    if (!Number.isFinite(amount) || !Number.isFinite(sourcePerEuro) || sourcePerEuro <= 0) return null;
    const eur = amount / sourcePerEuro;
    const converted = {};
    for (const target of normalizeConversionTargets(targets)) {
      if (target === "EUR") {
        converted.EUR = eur;
        continue;
      }
      const targetPerEuro = Number(rates[target]);
      if (!Number.isFinite(targetPerEuro) || targetPerEuro <= 0) return null;
      converted[target] = eur * targetPerEuro;
    }
    return converted;
  }

  function normalizeConversionTargets(targets) {
    const fallback = ["EUR", "USD"];
    const input = Array.isArray(targets) ? targets : fallback;
    const normalized = [];
    for (const code of input) {
      const value = String(code || "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(value) || normalized.includes(value)) continue;
      normalized.push(value);
      if (normalized.length >= 2) break;
    }
    return normalized.length ? normalized : fallback.slice();
  }

  return Object.freeze({ rowsToRateMap, convertFromEuroBase, normalizeConversionTargets });
});
