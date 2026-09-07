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

  function textOffsetInContainer(container, node, offset) {
    if (!container || !node) return null;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let current;
    let position = 0;
    while ((current = walker.nextNode())) {
      if (current === node) return position + Math.max(0, offset || 0);
      position += (current.nodeValue || "").length;
    }
    return null;
  }

  function expandedTextFrom(element, options) {
    const config = options || {};
    const maxPartLength = Number(config.maxPartLength) || 24;
    if (!(element instanceof Element)) return String(element && element.textContent || "");
    const own = String(element.textContent || "").trim();
    const bareAmount = /^[-+−]?[\d\s.,'\u00a0\u202f\u0660-\u0669\u06f0-\u06f9]+$/u.test(own);
    if (own && !bareAmount) return own;

    const parts = [];
    let previous = element.previousElementSibling;
    let next = element.nextElementSibling;
    if (previous) {
      const text = String(previous.textContent || "").trim();
      if (text && text.length <= maxPartLength) parts.push(text);
    }
    if (own) parts.push(own);
    if (next) {
      const text = String(next.textContent || "").trim();
      if (text && text.length <= maxPartLength) parts.push(text);
    }
    return parts.join("");
  }

  function distanceToRect(x, y, rect) {
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    return Math.hypot(dx, dy);
  }

  function cellRootFrom(element) {
    if (!(element instanceof Element)) return null;
    return element.closest(
      "[role='gridcell'], td, th, [data-automation-id='tabGridVisbleCell'], [data-automation-id*='gridCell' i], [data-automation-id='numericText']"
    ) || element;
  }

  function workdayNumericParts(element) {
    if (!(element instanceof Element)) return null;
    const numeric = element.closest("[data-automation-id='numericText']") || (
      element.getAttribute && element.getAttribute("data-automation-id") === "numericText" ? element : null
    );
    if (!numeric) return null;

    const preferred = numeric.querySelector("[data-automation-id='preferredCurrency']");
    let primaryText = "";
    for (const node of numeric.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) primaryText += node.nodeValue || "";
    }

    const numericRect = numeric.getBoundingClientRect();
    const preferredRect = preferred ? preferred.getBoundingClientRect() : null;
    let primaryRect = numericRect;
    if (preferredRect && preferredRect.height > 0) {
      const splitTop = Math.max(numericRect.top, preferredRect.top - 1);
      if (splitTop > numericRect.top + 4) {
        primaryRect = {
          left: numericRect.left,
          right: numericRect.right,
          top: numericRect.top,
          bottom: splitTop,
          width: numericRect.width,
          height: splitTop - numericRect.top
        };
      }
    }

    return {
      numeric,
      preferred,
      primaryText: primaryText.trim(),
      preferredText: preferred ? String(preferred.textContent || "").trim() : "",
      primaryRect,
      preferredRect
    };
  }

  function workdayPageCurrency() {
    if (typeof document === "undefined") return "";
    const selected = document.querySelector("[data-automation-id='promptOption'][data-automation-label]");
    if (selected) {
      return String(selected.getAttribute("data-automation-label") || "").trim().toUpperCase();
    }
    const labelled = document.querySelector("[data-automation-label='AED'], [data-automation-label='USD'], [data-automation-label='GBP']");
    return String(labelled && labelled.getAttribute("data-automation-label") || "").trim().toUpperCase();
  }

  function collectLineSegments(root) {
    const segments = [];
    if (!(root instanceof Element)) return segments;

    function consider(element) {
      if (!(element instanceof Element)) return;
      const text = String(element.textContent || "").trim();
      if (!text || text.length > 160) return;

      const childElements = [...element.children].filter((child) => String(child.textContent || "").trim());
      if (!childElements.length) {
        pushSegment(element, text);
        return;
      }

      const blockChildren = childElements.filter((child) => !isInlineOnly(child));
      if (blockChildren.length >= 2) {
        for (const child of blockChildren) consider(child);
        return;
      }

      if (childElements.every(isInlineOnly)) {
        pushSegment(element, text);
        return;
      }

      for (const child of childElements) consider(child);
    }

    function pushSegment(element, text) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      segments.push({ element, text, rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      } });
    }

    consider(root);
    return filterNestedSegments(segments);
  }

  function isInlineOnly(element) {
    if (!(element instanceof Element)) return true;
    const tag = String(element.tagName || "").toUpperCase();
    if (["SPAN", "B", "I", "EM", "STRONG", "SMALL", "BDI", "BDO", "A", "LABEL", "SUP", "SUB"].includes(tag)) return true;
    if (typeof getComputedStyle === "function") {
      const display = getComputedStyle(element).display;
      return display === "inline" || display === "inline-block" || display === "contents";
    }
    return false;
  }

  function filterNestedSegments(segments) {
    return segments.filter((segment, index) => !segments.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      return segment.element !== other.element
        && other.element.contains(segment.element)
        && Math.abs(other.rect.top - segment.rect.top) < 1
        && Math.abs(other.rect.left - segment.rect.left) < 1;
    }));
  }

  function expandSegmentsWithNewlines(segments) {
    const expanded = [];
    for (const segment of segments) {
      const lines = String(segment.text).split(/[\n\r\u2028\u2029]+/);
      if (lines.filter((line) => line.trim()).length <= 1) {
        expanded.push(segment);
        continue;
      }
      const lineHeight = segment.rect.height / lines.length;
      lines.forEach((line, index) => {
        const text = line.trim();
        if (!text) return;
        expanded.push({
          element: segment.element,
          text,
          rect: {
            left: segment.rect.left,
            right: segment.rect.right,
            top: segment.rect.top + lineHeight * index,
            bottom: segment.rect.top + lineHeight * (index + 1),
            width: segment.rect.width,
            height: lineHeight
          }
        });
      });
    }
    return expanded;
  }

  return Object.freeze({
    accessibleTextsFrom,
    cellRootFrom,
    collectLineSegments,
    distanceToRect,
    expandSegmentsWithNewlines,
    expandedTextFrom,
    textContainersFrom,
    textOffsetInContainer,
    workdayNumericParts,
    workdayPageCurrency
  });
});
