"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rates = require("../shared/rates.js");

test("reshapes Frankfurter v2 rows into an EUR-based map", () => {
  const result = rates.rowsToRateMap([
    { date: "2026-08-29", base: "EUR", quote: "USD", rate: 1.17 },
    { date: "2026-08-29", base: "EUR", quote: "GBP", rate: 0.86 },
    { date: "2026-08-29", base: "USD", quote: "CAD", rate: 1.3 },
    { nonsense: true }
  ]);
  assert.deepEqual(result, { rates: { EUR: 1, USD: 1.17, GBP: 0.86 }, date: "2026-08-29" });
});

test("converts a source amount to EUR and USD by triangulation", () => {
  const converted = rates.convertFromEuroBase(86, "GBP", { EUR: 1, GBP: 0.86, USD: 1.17 });
  assert.ok(Math.abs(converted.EUR - 100) < 1e-10);
  assert.ok(Math.abs(converted.USD - 117) < 1e-10);
});

test("handles EUR and rejects unavailable rates", () => {
  assert.deepEqual(rates.convertFromEuroBase(25, "EUR", { EUR: 1, USD: 1.2 }), { EUR: 25, USD: 30 });
  assert.equal(rates.convertFromEuroBase(25, "XYZ", { EUR: 1, USD: 1.2 }), null);
  assert.equal(rates.convertFromEuroBase(NaN, "EUR", { EUR: 1, USD: 1.2 }), null);
});
