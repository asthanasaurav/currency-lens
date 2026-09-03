"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const currency = require("../shared/currencies.js");

function one(text, context = {}) {
  const results = currency.parseCurrencyAmounts(text, context);
  assert.equal(results.length, 1, `Expected one result for ${text}`);
  return results[0];
}

test("detects common prefix symbols and suffix codes", () => {
  assert.deepEqual(pick(one("£149.00")), { amount: 149, currency: "GBP", raw: "£149.00" });
  assert.deepEqual(pick(one("12,500 CAD")), { amount: 12500, currency: "CAD", raw: "12,500 CAD" });
  assert.deepEqual(pick(one("R$ 1.234,50")), { amount: 1234.5, currency: "BRL", raw: "R$ 1.234,50" });
  assert.deepEqual(pick(one("₹2,999.00")), { amount: 2999, currency: "INR", raw: "₹2,999.00" });
});

test("understands common localized number formats", () => {
  assert.equal(one("€1.234,56").amount, 1234.56);
  assert.equal(one("1 234,56 EUR").amount, 1234.56);
  assert.equal(one("CHF 1’234.50").amount, 1234.5);
  assert.equal(one("JPY 250,000").amount, 250000);
  assert.equal(one("-99.95 USD").amount, -99.95);
});

test("understands Indian lakh and crore grouping", () => {
  assert.deepEqual(pick(one("₹11,20,000")), { amount: 1120000, currency: "INR", raw: "₹11,20,000" });
  assert.equal(one("INR 1,12,34,567.89").amount, 11234567.89);
  assert.equal(one("₹1,00,000").amount, 100000);
});

test("understands Arabic AED labels, digits, separators, and direction marks", () => {
  assert.deepEqual(pick(one("د.إ\u200f١٬٢٣٤٫٥٠")), { amount: 1234.5, currency: "AED", raw: "د.إ\u200f١٬٢٣٤٫٥٠" });
  assert.equal(one("١٬٢٣٤٫٥٠\u00a0د.إ\u200f").amount, 1234.5);
  assert.equal(one("0.00\u200fد.إ").currency, "AED");
});

test("uses locale and metadata hints for ambiguous symbols", () => {
  assert.equal(one("$49", { locale: "en-US" }).currency, "USD");
  assert.equal(one("$49", { locale: "en-CA" }).currency, "CAD");
  assert.equal(one("$49", { locale: "en-US", currencyHint: "AUD" }).currency, "AUD");
  assert.equal(one("¥800", { locale: "ja-JP" }).currency, "JPY");
  assert.equal(one("¥800", { locale: "zh-CN" }).currency, "CNY");
  assert.equal(one("2 999 kr", { locale: "sv-SE" }).currency, "SEK");
});

test("allows a user preference to override an ambiguous dollar", () => {
  assert.equal(one("$125", { locale: "en-US", dollarPreference: "CAD" }).currency, "CAD");
  assert.equal(one("$125", { locale: "en-AU", currencyHint: "AUD", dollarPreference: "USD" }).currency, "USD");
});

test("detects currency words without matching inside unrelated words", () => {
  assert.equal(one("Total: 85 euros").currency, "EUR");
  assert.equal(one("US dollars 1,250").currency, "USD");
  assert.deepEqual(currency.parseCurrencyAmounts("SCAD 20 and EUROPE 30"), []);
});

test("finds only the amount under a text offset", () => {
  const text = "Basic $12, Pro $29, Enterprise €80";
  assert.equal(currency.findCurrencyAtOffset(text, 17, { locale: "en-US" }).amount, 29);
  assert.equal(currency.findCurrencyAtOffset(text, 2, { locale: "en-US" }), null);
});

test("does not return unresolved krone symbols without regional context", () => {
  assert.deepEqual(currency.parseCurrencyAmounts("499 kr", { locale: "en-US" }), []);
});

test("binds a currency symbol to the following number when it sits between two amounts", () => {
  const results = currency.parseCurrencyAmounts("↓32% 26,499₹17,999");
  assert.equal(results.length, 1);
  assert.deepEqual(pick(results[0]), { amount: 17999, currency: "INR", raw: "₹17,999" });

  const separated = currency.parseCurrencyAmounts("39% 37,999 ₹22,999");
  assert.equal(separated.length, 1);
  assert.deepEqual(pick(separated[0]), { amount: 22999, currency: "INR", raw: "₹22,999" });
});

function pick(result) {
  return { amount: result.amount, currency: result.currency, raw: result.raw };
}
