"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const dom = require("../shared/dom.js");
const currency = require("../shared/currencies.js");

test("continues to a parent when a child contains only the price digits", () => {
  const card = fakeElement("DIV", "128 GB + 4 GB 34% 30,499 ₹19,999");
  const price = fakeElement("DIV", "₹19,999", card);
  const digits = fakeElement("SPAN", "19,999", price);

  const containers = dom.textContainersFrom(digits, { maxLength: 600, maxDepth: 5 });
  assert.deepEqual(containers, [digits, price, card]);
  assert.deepEqual(currency.parseCurrencyAmounts(containers[0].textContent), []);
  assert.equal(currency.parseCurrencyAmounts(containers[1].textContent)[0].amount, 19999);
  assert.equal(currency.parseCurrencyAmounts(containers[1].textContent)[0].currency, "INR");
});

test("finds all three Flipkart-style split prices through their parents", () => {
  for (const amount of ["19,999", "22,999", "17,999"]) {
    const price = fakeElement("DIV", `₹${amount}`);
    const digits = fakeElement("SPAN", amount, price);
    const match = dom.textContainersFrom(digits)
      .flatMap((element) => currency.parseCurrencyAmounts(element.textContent))[0];
    assert.equal(match.currency, "INR");
    assert.equal(match.amount, Number(amount.replace(",", "")));
  }
});

test("stops before scanning a large page-level container", () => {
  const large = fakeElement("MAIN", "x".repeat(601));
  const emptyOverlay = fakeElement("SPAN", "", large);
  assert.deepEqual(dom.textContainersFrom(emptyOverlay, { maxLength: 600 }), []);
});

function fakeElement(tagName, textContent, parentElement = null) {
  return { tagName, textContent, parentElement, getAttribute: () => null };
}

test("reads currency amounts exposed through accessibility attributes", () => {
  const cell = {
    tagName: "DIV",
    textContent: "",
    parentElement: null,
    getAttribute(name) {
      return name === "aria-label" ? "Cell C4, ₹22,999" : null;
    }
  };
  const texts = dom.accessibleTextsFrom(cell);
  assert.deepEqual(texts, ["Cell C4, ₹22,999"]);
  const match = currency.parseCurrencyAmounts(texts[0])[0];
  assert.equal(match.currency, "INR");
  assert.equal(match.amount, 22999);
});
