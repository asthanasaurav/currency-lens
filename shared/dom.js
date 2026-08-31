(function attachDomTools(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CurrencyLensDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function domToolsFactory() {
  "use strict";

  const BLOCKED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"]);
  const ACCESSIBLE_ATTRIBUTES = Object.freeze([
    "aria-label",
    "aria-valuetext",
    "data-value",
    "data-tooltip",
    "data-tooltip-text",
    "title"
  ]);

  function textContainersFrom(element, options) {
    const config = options || {};
    const maxLength = Number(config.maxLength) || 600;
    const maxDepth = Number(config.maxDepth) || 5;
    const containers = [];
    let current = element;

    for (let depth = 0; current && depth < maxDepth; depth += 1, current = current.parentElement) {
      if (BLOCKED_TAGS.has(String(current.tagName || "").toUpperCase())) break;
      const length = String(current.textContent || "").length;
      if (length > maxLength) break;
      if (length > 0) containers.push(current);
    }

    return containers;
  }

  function accessibleTextsFrom(element) {
    if (!element || typeof element.getAttribute !== "function") return [];
    const values = [];
    for (const name of ACCESSIBLE_ATTRIBUTES) {
      const value = String(element.getAttribute(name) || "").trim();
      if (value && !values.includes(value)) values.push(value);
    }
    return values;
  }

  return Object.freeze({ accessibleTextsFrom, textContainersFrom });
});
