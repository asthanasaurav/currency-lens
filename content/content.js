(function startCurrencyLens() {
  "use strict";

  if (window.__currencyLensLoaded || !window.CurrencyLensCurrency || !window.CurrencyLensDom) return;
  window.__currencyLensLoaded = true;

  const HOVER_DELAY_MS = 110;
  const HIDE_DELAY_MS = 140;
  const INPUT_DELAY_MS = 170;
  const MAX_ELEMENT_TEXT = 600;
  const state = {
    settings: { enabledDomains: [], dollarPreference: "auto", conversionTargets: ["EUR", "USD"] },
    enabled: false,
    pinned: false,
    currentKey: "",
    activeField: null,
    hoverTimer: 0,
    hideTimer: 0,
    inputTimer: 0,
    selectionTimer: 0,
    framePending: false,
    lastPointer: null,
    requestId: 0
  };

  const tooltip = createTooltip();
  document.documentElement.appendChild(tooltip.host);
  loadSettings();

  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  document.addEventListener("click", onClick, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("input", onFieldInput, true);
  document.addEventListener("selectionchange", onSelectionChange, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange, { passive: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.currencyLensSettings) return;
    applySettings(changes.currencyLensSettings.newValue || {});
  });

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      if (response && response.ok) applySettings(response.settings);
    } catch (_) {
      // The extension may have been reloaded while this page was open.
    }
  }

  function applySettings(settings) {
    state.settings = {
      enabledDomains: Array.isArray(settings.enabledDomains) ? settings.enabledDomains : [],
      dollarPreference: settings.dollarPreference || "auto",
      conversionTargets: conversionTargetsFromSettings(settings)
    };
    state.enabled = state.settings.enabledDomains.includes(siteHostname());
    if (!state.enabled) hideTooltip(true);
  }

  function conversionTargetsFromSettings(settings) {
    const allowed = CurrencyLensCurrency.CURRENCIES;
    const fallback = ["EUR", "USD"];
    const input = settings && Array.isArray(settings.conversionTargets) ? settings.conversionTargets : fallback;
    const normalized = [];
    for (const code of input) {
      const value = String(code || "").toUpperCase();
      if (!allowed[value] || normalized.includes(value)) continue;
      normalized.push(value);
      if (normalized.length >= 2) break;
    }
    return normalized.length ? normalized : fallback.slice();
  }

  function activeConversionTargets() {
    return conversionTargetsFromSettings(state.settings);
  }

  function siteHostname() {
    try {
      const ancestors = location.ancestorOrigins;
      if (ancestors && ancestors.length) return new URL(ancestors[ancestors.length - 1]).hostname.toLowerCase();
    } catch (_) {
      // Fall back to this frame's hostname.
    }
    return location.hostname.toLowerCase();
  }

  function onPointerMove(event) {
    if (!state.enabled || state.pinned) return;
    if (event.composedPath().includes(tooltip.host)) {
      clearTimeout(state.hideTimer);
      return;
    }
    state.lastPointer = { x: event.clientX, y: event.clientY, target: event.target };
    if (state.framePending) return;
    state.framePending = true;
    requestAnimationFrame(() => {
      state.framePending = false;
      inspectPointer(state.lastPointer);
    });
  }

  function onClick(event) {
    if (!state.enabled || event.composedPath().includes(tooltip.host)) return;
    const click = { x: event.clientX, y: event.clientY, target: event.target };
    window.setTimeout(() => {
      const candidate = candidateFromSelection()
        || candidateFromPoint(click.x, click.y, click.target)
        || candidateFromElementState(document.activeElement, pointRect(click.x, click.y))
        || candidateFromGoogleEditorState(pointRect(click.x, click.y));
      if (candidate) showCandidate(candidate, { pin: true });
    }, isGoogleEditor() ? 120 : 0);
  }

  function inspectPointer(pointer) {
    if (!pointer || !state.enabled) return;
    const field = getEditableField(pointer.target);
    if (field) {
      const candidate = candidateFromField(field);
      if (candidate) scheduleShow(candidate);
      else scheduleHide();
      return;
    }

    const candidate = candidateFromPoint(pointer.x, pointer.y, pointer.target);
    if (candidate) scheduleShow(candidate);
    else scheduleHide();
  }

  function candidateFromPoint(x, y, target) {
    const context = detectionContext();
    const hit = elementFromPointIgnoringTooltip(x, y);
    const numericRoot = hit && hit.closest instanceof Function
      ? hit.closest("[data-automation-id='numericText']")
      : null;
    if (numericRoot && numericRoot !== tooltip.host && !tooltip.host.contains(numericRoot)) {
      const workdayNumeric = candidateFromWorkdayNumericText(numericRoot, x, y, context, hit);
      if (workdayNumeric) return workdayNumeric;
      return null;
    }

    const cellRoot = hit && hit.closest instanceof Function
      ? hit.closest("td, th, [role='gridcell'], [data-automation-id='tabGridVisbleCell']")
      : null;
    if (cellRoot) {
      for (const numeric of cellRoot.querySelectorAll("[data-automation-id='numericText']")) {
        const rect = numeric.getBoundingClientRect();
        if (!pointNearRect(x, y, rect, 2)) continue;
        const workdayNumeric = candidateFromWorkdayNumericText(numeric, x, y, context, hit);
        if (workdayNumeric) return workdayNumeric;
        return null;
      }
    }

    const element = target instanceof Element ? target : target && target.parentElement;
    if (!element || element === tooltip.host) return null;

    const workdayNumeric = candidateFromWorkdayNumericText(element, x, y, context, hit || element);
    if (workdayNumeric) return workdayNumeric;

    const stackedCell = candidateFromStackedCell(element, x, y, context);
    if (stackedCell) return stackedCell;

    const nestedLine = candidateFromNestedLine(element, x, y, context);
    if (nestedLine) return nestedLine;

    const caret = caretAtPoint(x, y);
    if (caret && caret.node && caret.node.nodeType === Node.TEXT_NODE) {
      const text = caret.node.nodeValue || "";
      let match = CurrencyLensCurrency.findCurrencyAtOffset(text, caret.offset, context);
      if (match) {
        return candidateFromMatch(match, caret.node, caret.node, match.start, match.end);
      }

      const host = caret.node.parentElement;
      if (host) {
        const containers = CurrencyLensDom.textContainersFrom(host, { maxLength: MAX_ELEMENT_TEXT, maxDepth: 5 });
        for (const container of containers) {
          const offset = CurrencyLensDom.textOffsetInContainer(container, caret.node, caret.offset);
          if (offset == null) continue;
          const containerText = container.textContent || "";
          match = CurrencyLensCurrency.findBestCurrencyAtPoint(containerText, offset, context);
          if (match) return candidateFromContainerMatch(container, match);
        }

        const expanded = CurrencyLensDom.expandedTextFrom(host);
        if (expanded && expanded !== text) {
          const expandedOffset = expanded.indexOf(text.trim());
          const offset = expandedOffset >= 0 ? expandedOffset + caret.offset : caret.offset;
          match = CurrencyLensCurrency.findBestCurrencyAtPoint(expanded, offset, context);
          if (match) {
            const rect = usefulRect(host.getBoundingClientRect());
            if (rect) return { match, rect, identity: host };
          }
        }
      }
    }

    const containers = CurrencyLensDom.textContainersFrom(element, { maxLength: MAX_ELEMENT_TEXT, maxDepth: 5 });
    for (const container of containers) {
      const candidate = bestContainerCandidate(container, x, y, context);
      if (candidate) return candidate;
    }
    return null;
  }

  function candidateFromWorkdayNumericText(element, x, y, context, hitElement) {
    const parts = CurrencyLensDom.workdayNumericParts(element);
    if (!parts) return null;

    const pageCurrency = CurrencyLensDom.workdayPageCurrency();
    const enrichedContext = pageCurrency
      ? { ...context, currencyHint: context.currencyHint || pageCurrency }
      : context;

    const hit = hitElement instanceof Element ? hitElement : null;
    const onPreferred = Boolean(
      parts.preferred
      && parts.preferredText
      && hit
      && (parts.preferred === hit || parts.preferred.contains(hit))
    );

    if (onPreferred) {
      const preferredMatch = parseWorkdayPreferredAmount(parts.preferredText, enrichedContext);
      if (preferredMatch) {
        const preferredRect = usefulRect(parts.preferredRect) || usefulRect(parts.preferred.getBoundingClientRect());
        if (preferredRect) {
          return { match: preferredMatch, rect: preferredRect, identity: parts.preferred };
        }
      }
    }

    if (parts.primaryText) {
      const primaryMatch = parseWorkdayPrimaryAmount(parts.primaryText, enrichedContext);
      if (primaryMatch) {
        const primaryRect = usefulRect(parts.primaryRect) || usefulRect(parts.numeric.getBoundingClientRect());
        if (primaryRect) {
          return { match: primaryMatch, rect: primaryRect, identity: parts.numeric };
        }
      }
    }

    return null;
  }

  function parseWorkdayPrimaryAmount(text, context) {
    const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, context);
    if (matches.length === 1) return matches[0];

    const inherited = CurrencyLensCurrency.inferCellCurrencyFromLines([text], context)
      || String(context.currencyHint || CurrencyLensDom.workdayPageCurrency() || "").toUpperCase();
    return CurrencyLensCurrency.parseCurrencyLine(text, context, inherited);
  }

  function parseWorkdayPreferredAmount(text, context) {
    const normalized = String(text || "").trim();
    if (!normalized) return null;
    const matches = CurrencyLensCurrency.parseCurrencyAmounts(normalized, context);
    if (matches.length === 1) return matches[0];
    if (/^[\d\s.,]+$/u.test(normalized)) {
      return CurrencyLensCurrency.parseCurrencyLine(normalized, context, "USD");
    }
    return CurrencyLensCurrency.parseCurrencyLine(normalized, context, "USD");
  }

  function candidateFromStackedCell(element, x, y, context) {
    const root = CurrencyLensDom.cellRootFrom(element);
    if (!(root instanceof Element) || root === tooltip.host) return null;

    let segments = CurrencyLensDom.expandSegmentsWithNewlines(CurrencyLensDom.collectLineSegments(root));
    if (segments.length < 2) return null;

    const visibleSegments = segments.filter((segment) => pointNearRect(x, y, segment.rect, 8));
    if (!visibleSegments.length) return null;

    const cellCurrency = CurrencyLensCurrency.inferCellCurrencyFromLines(segments.map((segment) => segment.text), context);
    let best = null;
    let bestScore = Infinity;

    for (const segment of visibleSegments) {
      const match = CurrencyLensCurrency.parseCurrencyLine(segment.text, context, cellCurrency);
      if (!match) continue;
      const score = CurrencyLensDom.distanceToRect(x, y, segment.rect);
      if (score < bestScore) {
        bestScore = score;
        best = { match, rect: usefulRect(segment.rect) || segment.rect, identity: segment.element };
      }
    }

    return best;
  }

  function candidateFromNestedLine(element, x, y, context) {
    const root = CurrencyLensDom.cellRootFrom(element);
    if (!(root instanceof Element) || root === tooltip.host) return null;

    const hits = [];
    collectSingleMatchElements(root, hits, context, x, y, 0);
    if (!hits.length) return null;

    hits.sort((left, right) => {
      const leftDistance = CurrencyLensDom.distanceToRect(x, y, left.rect);
      const rightDistance = CurrencyLensDom.distanceToRect(x, y, right.rect);
      if (Math.abs(leftDistance - rightDistance) > 1) return leftDistance - rightDistance;
      const leftVertical = Math.abs(y - (left.rect.top + left.rect.height / 2));
      const rightVertical = Math.abs(y - (right.rect.top + right.rect.height / 2));
      if (Math.abs(leftVertical - rightVertical) > 1) return leftVertical - rightVertical;
      if (right.depth !== left.depth) return right.depth - left.depth;
      return left.area - right.area;
    });

    const best = hits[0];
    return { match: best.match, rect: best.rect, identity: best.element };
  }

  function collectSingleMatchElements(element, hits, context, x, y, depth) {
    if (depth > 8 || !(element instanceof Element) || element === tooltip.host) return;

    const text = String(element.textContent || "").trim();
    if (text && text.length <= 160) {
      const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, context);
      if (matches.length === 1) {
        const rect = usefulRect(element.getBoundingClientRect());
        if (rect && pointNearRect(x, y, rect, 4)) {
          hits.push({
            element,
            match: matches[0],
            rect,
            area: rect.width * rect.height,
            depth
          });
        }
      }
    }

    for (const child of element.children) {
      collectSingleMatchElements(child, hits, context, x, y, depth + 1);
    }
  }

  function candidateFromMatch(match, startNode, endNode, startOffset, endOffset) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const rect = usefulRect(range.getBoundingClientRect());
    if (!rect) return null;
    return { match, rect, identity: startNode };
  }

  function candidateFromContainerMatch(container, match) {
    const range = rangeForTextOffsets(container, match.start, match.end);
    if (!range) return null;
    const rect = usefulRect(range.getBoundingClientRect());
    if (!rect) return null;
    return { match, rect, identity: container };
  }

  function bestContainerCandidate(container, x, y, context) {
    const text = container.textContent || "";
    const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, context);
    if (!matches.length) return null;

    const lineCount = CurrencyLensCurrency.lineCountForText(text);
    let pointerLine = null;
    if (lineCount > 1) {
      const containerRect = usefulRect(container.getBoundingClientRect());
      if (containerRect) {
        pointerLine = Math.max(0, Math.min(
          lineCount - 1,
          Math.floor(((y - containerRect.top) / containerRect.height) * lineCount)
        ));
      }
    }

    let best = null;
    let bestScore = Infinity;
    for (const match of matches) {
      if (pointerLine != null && CurrencyLensCurrency.lineIndexForOffset(text, match.start) !== pointerLine) continue;
      const range = rangeForTextOffsets(container, match.start, match.end);
      if (!range) continue;
      const rect = usefulRect(range.getBoundingClientRect());
      if (!rect || !pointNearRect(x, y, rect, 8)) continue;
      const score = CurrencyLensDom.distanceToRect(x, y, rect) - Math.min(rect.width, rect.height) * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = { match, rect, identity: container };
      }
    }
    return best;
  }

  function caretAtPoint(x, y) {
    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(x, y);
      return position ? { node: position.offsetNode, offset: position.offset } : null;
    }
    if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(x, y);
      return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    return null;
  }

  function rangeForTextOffsets(container, start, end) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    let position = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    while ((node = walker.nextNode())) {
      const next = position + (node.nodeValue || "").length;
      if (!startNode && start >= position && start <= next) {
        startNode = node;
        startOffset = Math.min(start - position, (node.nodeValue || "").length);
      }
      if (end >= position && end <= next) {
        endNode = node;
        endOffset = Math.min(end - position, (node.nodeValue || "").length);
        break;
      }
      position = next;
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function pointNearRect(x, y, rect, padding) {
    return x >= rect.left - padding && x <= rect.right + padding && y >= rect.top - padding && y <= rect.bottom + padding;
  }

  function usefulRect(rect) {
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function elementFromPointIgnoringTooltip(x, y) {
    if (typeof document.elementsFromPoint === "function") {
      for (const element of document.elementsFromPoint(x, y)) {
        if (!(element instanceof Element) || element === tooltip.host || tooltip.host.contains(element)) continue;
        return element;
      }
      return null;
    }
    const hit = document.elementFromPoint(x, y);
    if (hit instanceof Element && hit !== tooltip.host && !tooltip.host.contains(hit)) return hit;
    return null;
  }

  function getEditableField(target) {
    if (!(target instanceof Element)) return null;
    const field = target.closest("input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']");
    if (!field || tooltip.host.contains(field)) return null;
    if (field instanceof HTMLInputElement && ["password", "hidden", "checkbox", "radio", "file"].includes(field.type)) return null;
    return field;
  }

  function fieldText(field) {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field.value;
    return field.textContent || "";
  }

  function candidateFromField(field) {
    const text = fieldText(field);
    const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, detectionContext());
    if (!matches.length) return null;
    let offset = 0;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) offset = field.selectionStart == null ? 0 : field.selectionStart;
    const match = matches.find((item) => offset >= item.start && offset <= item.end) || matches[0];
    return { match, rect: field.getBoundingClientRect(), identity: field };
  }

  function candidateFromAccessibleElement(element, context = detectionContext()) {
    const texts = CurrencyLensDom.accessibleTextsFrom(element);
    for (const text of texts) {
      const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, context);
      if (matches.length === 1) return { match: matches[0], rect: element.getBoundingClientRect(), identity: element };
    }
    return null;
  }

  function candidateFromElementState(element, fallbackRect) {
    if (!(element instanceof Element) || element === tooltip.host) return null;
    const field = getEditableField(element);
    if (field) {
      const fieldCandidate = candidateFromField(field);
      if (fieldCandidate) return fieldCandidate;
    }

    const context = detectionContext();
    const accessible = candidateFromAccessibleElement(element, context);
    if (accessible) return withUsefulAnchor(accessible, fallbackRect);

    const text = String(element.textContent || "").trim();
    if (text && text.length <= 300) {
      const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, context);
      if (matches.length === 1) {
        return { match: matches[0], rect: usefulRect(element.getBoundingClientRect()) || fallbackRect, identity: element };
      }
    }
    return null;
  }

  function candidateFromGoogleEditorState(fallbackRect) {
    if (!isGoogleEditor()) return null;
    const selectors = [
      '[role="gridcell"][aria-selected="true"]',
      '[role="gridcell"][tabindex="0"]',
      '[aria-selected="true"]',
      '[aria-current="true"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
      '[aria-label*="formula" i]'
    ];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || element === tooltip.host) continue;
        seen.add(element);
        const candidate = candidateFromElementState(element, fallbackRect);
        if (candidate) return candidate;
      }
    }
    return null;
  }

  function withUsefulAnchor(candidate, fallbackRect) {
    const rect = usefulRect(candidate.rect);
    return { ...candidate, rect: rect || fallbackRect };
  }

  function pointRect(x, y) {
    return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
  }

  function isGoogleEditor() {
    return siteHostname() === "docs.google.com";
  }

  function onFocusIn(event) {
    if (!state.enabled) return;
    const field = getEditableField(event.target);
    const candidate = field ? candidateFromField(field) : candidateFromAccessibleElement(event.target);
    if (field) state.activeField = field;
    if (candidate) scheduleShow(candidate, 0);
  }

  function onFocusOut(event) {
    if (state.activeField !== event.target) return;
    state.activeField = null;
    if (!state.pinned) scheduleHide();
  }

  function onFieldInput(event) {
    const field = getEditableField(event.target);
    if (!state.enabled || !field) return;
    clearTimeout(state.inputTimer);
    state.inputTimer = window.setTimeout(() => {
      const candidate = candidateFromField(field);
      if (candidate) showCandidate(candidate);
      else hideTooltip(false);
    }, INPUT_DELAY_MS);
  }

  function onSelectionChange() {
    if (!state.enabled || state.pinned) return;
    clearTimeout(state.selectionTimer);
    state.selectionTimer = window.setTimeout(() => {
      const candidate = candidateFromSelection();
      if (candidate) scheduleShow(candidate, 0);
    }, 80);
  }

  function candidateFromSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) return null;
    const text = selection.toString().trim();
    if (!text || text.length > 300) return null;
    const matches = CurrencyLensCurrency.parseCurrencyAmounts(text, detectionContext());
    if (!matches.length) return null;
    const range = selection.getRangeAt(0);
    const rect = usefulRect(range.getBoundingClientRect());
    return rect ? { match: matches[0], rect, identity: range.commonAncestorContainer } : null;
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && tooltip.host.hidden === false) hideTooltip(true);
  }

  function onViewportChange() {
    if (!state.pinned) hideTooltip(true);
  }

  function scheduleShow(candidate, delay = HOVER_DELAY_MS) {
    clearTimeout(state.hideTimer);
    clearTimeout(state.hoverTimer);
    const key = candidateKey(candidate);
    if (key === state.currentKey && !tooltip.host.hidden) {
      placeTooltip(candidate.rect);
      return;
    }
    state.hoverTimer = window.setTimeout(() => showCandidate(candidate), delay);
  }

  function scheduleHide() {
    clearTimeout(state.hoverTimer);
    clearTimeout(state.hideTimer);
    state.hideTimer = window.setTimeout(() => hideTooltip(false), HIDE_DELAY_MS);
  }

  async function showCandidate(candidate, options) {
    const pin = Boolean(options && options.pin);
    if (!state.enabled || !candidate || (state.pinned && !pin)) return;
    clearTimeout(state.hideTimer);
    if (pin) {
      state.pinned = true;
      tooltip.setPinned(true);
    }
    const key = candidateKey(candidate);
    state.currentKey = key;
    state.requestId += 1;
    const requestId = state.requestId;
    tooltip.renderLoading(candidate.match, activeConversionTargets());
    tooltip.host.hidden = false;
    placeTooltip(candidate.rect);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_CONVERSION",
        amount: candidate.match.amount,
        currency: candidate.match.currency,
        targets: activeConversionTargets()
      });
      if (requestId !== state.requestId || key !== state.currentKey) return;
      if (!response || !response.ok) {
        tooltip.renderError(candidate.match, response && response.error);
      } else {
        tooltip.renderResult(candidate.match, response, activeConversionTargets());
      }
      placeTooltip(candidate.rect);
    } catch (_) {
      if (requestId === state.requestId) tooltip.renderError(candidate.match, "Reload this page to reconnect Currency Lens.");
    }
  }

  function candidateKey(candidate) {
    return `${candidate.match.currency}:${candidate.match.amount}:${candidate.match.raw}:${candidate.rect.left.toFixed(0)}:${candidate.rect.top.toFixed(0)}`;
  }

  function hideTooltip(force) {
    if (state.pinned && !force) return;
    clearTimeout(state.hoverTimer);
    clearTimeout(state.hideTimer);
    state.pinned = false;
    state.currentKey = "";
    state.requestId += 1;
    tooltip.setPinned(false);
    tooltip.host.hidden = true;
  }

  function placeTooltip(anchor) {
    requestAnimationFrame(() => {
      if (tooltip.host.hidden) return;
      const margin = 10;
      const gap = 11;
      const rect = tooltip.host.getBoundingClientRect();
      let left = anchor.left + anchor.width / 2 - rect.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
      let top = anchor.bottom + gap;
      const above = top + rect.height > window.innerHeight - margin;
      if (above) top = anchor.top - rect.height - gap;
      top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
      tooltip.host.style.left = `${Math.round(left)}px`;
      tooltip.host.style.top = `${Math.round(top)}px`;
      tooltip.setAbove(above);
    });
  }

  function detectionContext() {
    return {
      locale: document.documentElement.lang || navigator.language || "",
      currencyHint: pageCurrencyHint() || CurrencyLensDom.workdayPageCurrency(),
      dollarPreference: state.settings.dollarPreference
    };
  }

  let cachedHint;
  function pageCurrencyHint() {
    if (cachedHint !== undefined) return cachedHint;
    const selectors = [
      "meta[property='product:price:currency']",
      "meta[property='og:price:currency']",
      "meta[name='currency']",
      "[itemprop='priceCurrency']"
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element && (element.getAttribute("content") || element.getAttribute("value") || element.textContent || "").trim().toUpperCase();
      if (value && CurrencyLensCurrency.CURRENCIES[value]) {
        cachedHint = value;
        return cachedHint;
      }
    }
    cachedHint = "";
    return cachedHint;
  }

  function createTooltip() {
    const host = document.createElement("div");
    host.id = "currency-lens-tooltip-host";
    host.hidden = true;
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;width:272px;left:0;top:0;display:block;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color-scheme:light;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host([hidden]){display:none!important}
        *{box-sizing:border-box}
        .lens{position:relative;width:272px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;color:#f5fff8;background:#11271a;box-shadow:0 18px 44px rgba(7,23,13,.34);font:13px/1.35 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .lens:after{content:"";position:absolute;left:calc(50% - 7px);top:-7px;width:13px;height:13px;background:#11271a;border-left:1px solid rgba(255,255,255,.12);border-top:1px solid rgba(255,255,255,.12);transform:rotate(45deg)}
        .lens.above:after{top:auto;bottom:-7px;border:0;border-right:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12)}
        .head{display:flex;align-items:center;gap:7px;padding-right:25px;color:#a8bbae;font-size:10px;font-weight:750;letter-spacing:.055em;text-transform:uppercase}
        .dot{width:7px;height:7px;border-radius:50%;background:#72e4a0;box-shadow:0 0 0 3px rgba(114,228,160,.13)}
        .pin{position:absolute;right:9px;top:8px;width:28px;height:28px;border:0;border-radius:8px;color:#9fb1a5;background:transparent;cursor:pointer;font:17px/1 sans-serif}
        .pin:hover,.pin.active{color:#72e4a0;background:rgba(114,228,160,.1)}
        .source{margin:9px 0 10px;font-size:20px;font-weight:760;letter-spacing:-.02em}
        .row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid rgba(255,255,255,.1)}
        .label{color:#aab8af}.value{font-weight:760;font-variant-numeric:tabular-nums}
        .meta{margin-top:8px;color:#819489;font-size:9px}.error{padding:9px 0 1px;border-top:1px solid rgba(255,255,255,.1);color:#ffcfb8;font-size:11px;line-height:1.45}
        .skeleton{height:13px;width:76px;border-radius:5px;background:linear-gradient(90deg,#274233,#355641,#274233);background-size:200% 100%;animation:pulse 1.2s linear infinite}
        @keyframes pulse{to{background-position:-200% 0}}
        @media (prefers-reduced-motion:reduce){.skeleton{animation:none}}
      </style>
      <section class="lens" role="tooltip" aria-live="polite">
        <button class="pin" type="button" title="Keep this conversion open" aria-label="Keep this conversion open">⌖</button>
        <div class="content"></div>
      </section>`;
    const card = shadow.querySelector(".lens");
    const content = shadow.querySelector(".content");
    const pin = shadow.querySelector(".pin");
    pin.addEventListener("click", () => {
      state.pinned = !state.pinned;
      setPinned(state.pinned);
    });
    host.addEventListener("pointerenter", () => clearTimeout(state.hideTimer));
    host.addEventListener("pointerleave", () => { if (!state.pinned && !state.activeField) scheduleHide(); });

    function header(match) {
      return `<div class="head"><i class="dot"></i>Detected · ${escapeHtml(match.currencyName)}</div><div class="source">${escapeHtml(formatSource(match.amount, match.currency))}</div>`;
    }
    function targetRows(targets, converted, loading) {
      return targets.map((code) => {
        const label = CurrencyLensCurrency.CURRENCIES[code] || code;
        const value = loading
          ? '<i class="skeleton"></i>'
          : `<b class="value">${escapeHtml(formatCurrency(converted[code], code))}</b>`;
        return `<div class="row"><span class="label">${escapeHtml(label)}</span>${value}</div>`;
      }).join("");
    }
    function renderLoading(match, targets) {
      const list = Array.isArray(targets) && targets.length ? targets : ["EUR", "USD"];
      content.innerHTML = `${header(match)}${targetRows(list, null, true)}<div class="meta">Getting the latest cached rate…</div>`;
    }
    function renderResult(match, response, targets) {
      const list = Array.isArray(targets) && targets.length ? targets : ["EUR", "USD"];
      const freshness = response.stale ? "Cached rate" : "Indicative rate";
      const date = response.rateDate ? ` · ${escapeHtml(response.rateDate)}` : "";
      content.innerHTML = `${header(match)}${targetRows(list, response.converted, false)}<div class="meta">${freshness}${date}${match.ambiguous ? ` · “${escapeHtml(match.marker)}” inferred from page context` : ""}</div>`;
    }
    function renderError(match, message) {
      content.innerHTML = `${header(match)}<div class="error">${escapeHtml(message || "Conversion is temporarily unavailable.")}</div>`;
    }
    function setPinned(value) {
      pin.classList.toggle("active", value);
      pin.textContent = value ? "×" : "⌖";
      pin.title = value ? "Close this conversion" : "Keep this conversion open";
      pin.setAttribute("aria-label", pin.title);
    }
    function setAbove(value) { card.classList.toggle("above", value); }
    return { host, renderLoading, renderResult, renderError, setPinned, setAbove };
  }

  function formatSource(amount, currency) {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }

  function formatCurrency(amount, currency) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
  }
})();
