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

test("does not merge an adjacent spreadsheet value into a currency amount", () => {
  assert.deepEqual(pick(one("$5,631.943.9", { locale: "en-US" })), {
    amount: 5631.94,
    currency: "USD",
    raw: "$5,631.94"
  });
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
  assert.equal(one("20,685.60د.إ.").amount, 20685.6);
});

test("does not bind a suffix marker across a line break", () => {
  const results = currency.parseCurrencyAmounts("458,325.00 د.إ\n124,785.40 د.إ");
  assert.equal(results.length, 2);
  assert.equal(results[0].amount, 458325);
  assert.equal(results[1].amount, 124785.4);
});

test("findBestCurrencyAtPoint prefers the amount under the caret", () => {
  const text = "458,325.00 د.إ\n124,785.40 د.إ";
  assert.equal(currency.findBestCurrencyAtPoint(text, 3, { locale: "en-US" }).amount, 458325);
  assert.equal(currency.findBestCurrencyAtPoint(text, 20, { locale: "en-US" }).amount, 124785.4);
  assert.equal(currency.findBestCurrencyAtPoint(text, 3, { locale: "en-US" }).currency, "AED");
});

test("does not guess across stacked lines when the caret is between amounts", () => {
  const text = "458,325.00د.إ.\n$124,785.40";
  assert.equal(currency.findBestCurrencyAtPoint(text, 16, { locale: "en-US" }), null);
  assert.equal(currency.lineIndexForOffset(text, 16), 1);
});

test("parses Workday Arabic dirham labels before the amount", () => {
  assert.deepEqual(pick(one("د.إ.\u200f458,325.00")), {
    amount: 458325,
    currency: "AED",
    raw: "د.إ.\u200f458,325.00"
  });
});

test("infers bare stacked line amounts from a shared Arabic marker", () => {
  const lines = ["458,325.00", "124,785.40 د.إ"];
  assert.equal(currency.inferCellCurrencyFromLines(lines, { locale: "en-US" }), "AED");
  const match = currency.parseCurrencyLine("458,325.00", { locale: "en-US" }, "AED");
  assert.equal(match.amount, 458325);
  assert.equal(match.currency, "AED");
  assert.equal(match.inferred, true);
});

test("keeps explicit dollar amounts on conversion rows", () => {
  const match = currency.parseCurrencyLine("$124,785.40", { locale: "en-US" }, "AED");
  assert.equal(match.currency, "USD");
  assert.equal(match.amount, 124785.4);
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

test("formats detected and converted amounts with a space before or after the marker", () => {
  assert.equal(
    currency.formatCurrencyDisplay(149, "GBP", { marker: "£", raw: "£149.00", numberRaw: "149.00" }),
    "£ 149.00"
  );
  assert.equal(
    currency.formatCurrencyDisplay(12500, "CAD", { marker: "CAD", raw: "12,500 CAD", numberRaw: "12,500" }),
    "12,500 CAD"
  );
  assert.equal(
    currency.formatCurrencyDisplay(40, "USD", { marker: "$", raw: "$40", numberRaw: "40" }),
    "$ 40"
  );
  assert.match(currency.formatCurrencyDisplay(40, "USD"), /(?:\$|USD)\s+40(?:[.,]00)?/);
  assert.match(currency.formatCurrencyDisplay(117, "EUR"), /(?:€|EUR)\s+117(?:[.,]00)?|117(?:[.,]00)?\s+(?:€|EUR)/);
});

function pick(result) {
  return { amount: result.amount, currency: result.currency, raw: result.raw };
}
