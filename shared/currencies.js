(function attachCurrencyTools(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CurrencyLensCurrency = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function currencyToolsFactory() {
  "use strict";

  const CURRENCIES = Object.freeze({
    AED: "UAE dirham",
    AUD: "Australian dollar",
    BGN: "Bulgarian lev",
    BRL: "Brazilian real",
    CAD: "Canadian dollar",
    CHF: "Swiss franc",
    CNY: "Chinese yuan",
    CZK: "Czech koruna",
    DKK: "Danish krone",
    EUR: "Euro",
    GBP: "British pound",
    HKD: "Hong Kong dollar",
    HUF: "Hungarian forint",
    IDR: "Indonesian rupiah",
    ILS: "Israeli new shekel",
    INR: "Indian rupee",
    ISK: "Icelandic króna",
    JPY: "Japanese yen",
    KRW: "South Korean won",
    MXN: "Mexican peso",
    MYR: "Malaysian ringgit",
    NGN: "Nigerian naira",
    NOK: "Norwegian krone",
    NZD: "New Zealand dollar",
    PHP: "Philippine peso",
    PLN: "Polish złoty",
    RON: "Romanian leu",
    RUB: "Russian ruble",
    SAR: "Saudi riyal",
    SEK: "Swedish krona",
    SGD: "Singapore dollar",
    THB: "Thai baht",
    TRY: "Turkish lira",
    TWD: "New Taiwan dollar",
    UAH: "Ukrainian hryvnia",
    USD: "US dollar",
    VND: "Vietnamese đồng",
    ZAR: "South African rand"
  });

  const DIRECT_MARKERS = Object.freeze({
    "US$": "USD", "USD": "USD", "U.S.$": "USD",
    "CA$": "CAD", "C$": "CAD", "CAD": "CAD",
    "AU$": "AUD", "A$": "AUD", "AUD": "AUD",
    "NZ$": "NZD", "NZD": "NZD",
    "HK$": "HKD", "HKD": "HKD",
    "SG$": "SGD", "S$": "SGD", "SGD": "SGD",
    "MX$": "MXN", "MXN": "MXN",
    "NT$": "TWD", "TWD": "TWD",
    "R$": "BRL", "BRL": "BRL",
    "CN¥": "CNY", "RMB": "CNY", "CNY": "CNY",
    "JP¥": "JPY", "JPY": "JPY",
    "€": "EUR", "EUR": "EUR",
    "£": "GBP", "GBP": "GBP",
    "CHF": "CHF",
    "₹": "INR", "INR": "INR",
    "₩": "KRW", "KRW": "KRW",
    "₽": "RUB", "RUB": "RUB",
    "₺": "TRY", "TRY": "TRY",
    "₫": "VND", "VND": "VND",
    "฿": "THB", "THB": "THB",
    "₱": "PHP", "PHP": "PHP",
    "₪": "ILS", "ILS": "ILS",
    "₴": "UAH", "UAH": "UAH",
    "₦": "NGN", "NGN": "NGN",
    "zł": "PLN", "PLN": "PLN",
    "Kč": "CZK", "CZK": "CZK",
    "Ft": "HUF", "HUF": "HUF",
    "lei": "RON", "RON": "RON",
    "лв": "BGN", "BGN": "BGN",
    "Rp": "IDR", "IDR": "IDR",
    "RM": "MYR", "MYR": "MYR",
    "AED": "AED", "د.إ": "AED",
    "SAR": "SAR", "ر.س": "SAR",
    "ZAR": "ZAR",
    "SEK": "SEK", "NOK": "NOK", "DKK": "DKK", "ISK": "ISK"
  });

  const WORD_MARKERS = Object.freeze({
    "US dollars": "USD", "US dollar": "USD", dollars: "USD", dollar: "USD",
    euros: "EUR", euro: "EUR",
    "pounds sterling": "GBP", "pound sterling": "GBP",
    "British pounds": "GBP", "British pound": "GBP",
    "Japanese yen": "JPY", yen: "JPY",
    "Chinese yuan": "CNY", yuan: "CNY",
    "Canadian dollars": "CAD", "Canadian dollar": "CAD",
    "Australian dollars": "AUD", "Australian dollar": "AUD",
    "New Zealand dollars": "NZD", "New Zealand dollar": "NZD",
    rupees: "INR", rupee: "INR",
    "Swiss francs": "CHF", "Swiss franc": "CHF"
  });

  const AMBIGUOUS_MARKERS = Object.freeze({ "$": "dollar", "¥": "yen", "￥": "yen", "kr": "krone" });
  const ALL_MARKERS = [...Object.keys(DIRECT_MARKERS), ...Object.keys(WORD_MARKERS), ...Object.keys(AMBIGUOUS_MARKERS)]
    .sort((a, b) => b.length - a.length);
  const MARKER_PATTERN = ALL_MARKERS.map(escapeRegExp).join("|");
  const DIGITS = String.raw`0-9\u0660-\u0669\u06f0-\u06f9`;
  const INTER_MARKER_SPACE = String.raw`[\s\u200e\u200f\u061c]*`;
  const PREFIX_MARKER_GAP = String.raw`[\s\u200e\u200f\u061c.,،٫]*`;
  // Match Indian lakh/crore grouping before the generic alternatives. Without
  // this branch, `11,20,000` is truncated to `11,20` and parsed as 11.2.
  // Pier's RFE: Arabic AED pages may use Arabic-Indic digits plus `٬` and `٫` separators.
  // Keep thousands separators consistent within one amount. Spreadsheet DOM
  // layers can join neighbouring values (for example `$5,631.94` + `3.9`),
  // which must never be reinterpreted as `$5,631,943.9`.
  const NUMBER_PATTERN = String.raw`[-+−]?(?:[${DIGITS}]{1,3}(?:,[${DIGITS}]{2})+,[${DIGITS}]{3}|[${DIGITS}]{1,3}(?:,[${DIGITS}]{3})+|[${DIGITS}]{1,3}(?:\.[${DIGITS}]{3})+|[${DIGITS}]{1,3}(?:[\s\u00a0\u202f][${DIGITS}]{3})+|[${DIGITS}]{1,3}(?:['’][${DIGITS}]{3})+|[${DIGITS}]{1,3}(?:\u066c[${DIGITS}]{3})+|[${DIGITS}]+)(?:[.,\u066b][${DIGITS}]{1,2})?`;
  const PREFIX_RE = new RegExp(String.raw`(${MARKER_PATTERN})${PREFIX_MARKER_GAP}(${NUMBER_PATTERN})`, "giu");
  const SUFFIX_RE = new RegExp(String.raw`(${NUMBER_PATTERN})${INTER_MARKER_SPACE}(${MARKER_PATTERN})`, "giu");

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeMarker(marker) {
    const candidates = [String(marker || "").trim()];
    const trimmed = candidates[0].replace(/[.,،٫]+$/u, "");
    if (trimmed && trimmed !== candidates[0]) candidates.push(trimmed);
    for (const candidate of candidates) {
      const exact = Object.keys(DIRECT_MARKERS).find((item) => item.toLocaleLowerCase() === candidate.toLocaleLowerCase());
      if (exact) return { currency: DIRECT_MARKERS[exact], ambiguous: false };
      const word = Object.keys(WORD_MARKERS).find((item) => item.toLocaleLowerCase() === candidate.toLocaleLowerCase());
      if (word) return { currency: WORD_MARKERS[word], ambiguous: false };
      const ambiguous = Object.keys(AMBIGUOUS_MARKERS).find((item) => item.toLocaleLowerCase() === candidate.toLocaleLowerCase());
      if (ambiguous) return { currency: null, ambiguous: AMBIGUOUS_MARKERS[ambiguous] };
    }
    return null;
  }

  function resolveAmbiguous(markerType, context) {
    const ctx = context || {};
    const dollarPreference = String(ctx.dollarPreference || "auto").toUpperCase();
    if (markerType === "dollar" && dollarPreference !== "AUTO" && CURRENCIES[dollarPreference]) return dollarPreference;

    const explicit = String(ctx.currencyHint || "").toUpperCase();
    if (explicit && CURRENCIES[explicit]) {
      if (markerType === "dollar" && ["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN", "TWD"].includes(explicit)) return explicit;
      if (markerType === "yen" && ["JPY", "CNY"].includes(explicit)) return explicit;
      if (markerType === "krone" && ["SEK", "NOK", "DKK", "ISK"].includes(explicit)) return explicit;
    }

    const locale = String(ctx.locale || "").replace("_", "-").toLowerCase();
    const region = locale.split("-")[1] || "";
    if (markerType === "dollar") {
      return ({ ca: "CAD", au: "AUD", nz: "NZD", sg: "SGD", hk: "HKD", mx: "MXN", tw: "TWD" })[region] || "USD";
    }
    if (markerType === "yen") return locale.startsWith("zh") ? "CNY" : "JPY";
    if (markerType === "krone") {
      return ({ se: "SEK", no: "NOK", dk: "DKK", is: "ISK" })[region] || null;
    }
    return null;
  }

  function parseNumber(raw) {
    let value = String(raw)
      .trim()
      .replace(/−/g, "-")
      .replace(/[\u200e\u200f\u061c]/g, "")
      .replace(/\u066b/g, ".")
      .replace(/\u066c/g, ",")
      .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/[\s\u00a0\u202f'’]/g, "");
    const negative = value.startsWith("-");
    value = value.replace(/^[-+]/, "");
    if (!value) return NaN;

    const comma = value.lastIndexOf(",");
    const dot = value.lastIndexOf(".");
    let decimal = "";

    if (comma >= 0 && dot >= 0) {
      decimal = comma > dot ? "," : ".";
    } else {
      const separator = comma >= 0 ? "," : dot >= 0 ? "." : "";
      if (separator) {
        const pieces = value.split(separator);
        const tailLength = pieces[pieces.length - 1].length;
        if (pieces.length === 2 && (tailLength === 1 || tailLength === 2)) decimal = separator;
        if (pieces.length > 2 && (tailLength === 1 || tailLength === 2)) decimal = separator;
      }
    }

    if (decimal) {
      const decimalIndex = value.lastIndexOf(decimal);
      const whole = value.slice(0, decimalIndex).replace(/[.,]/g, "");
      const fraction = value.slice(decimalIndex + 1).replace(/[.,]/g, "");
      value = `${whole}.${fraction}`;
    } else {
      value = value.replace(/[.,]/g, "");
    }

    const number = Number(value);
    return negative ? -number : number;
  }

  function boundaryIsSafe(text, start, end, marker, prefix) {
    const before = text[start - 1] || "";
    const after = text[end] || "";
    const markerIsCodeOrWord = /^[\p{L}.]+$/u.test(marker);
    const segment = text.slice(start, end);
    // When one marker sits between two numbers (for example Flipkart's
    // struck-through `26,499₹17,999`), it belongs to the following amount.
    // Rejecting the suffix interpretation lets the prefix match win.
    if (!prefix && /^\s*[-+−]?\d/u.test(text.slice(end))) return false;
    // Workday and spreadsheet cells often stack converted amounts on the next
    // line. A suffix marker must stay on the same line as its amount.
    if (!prefix && /[\n\r\u2028\u2029]/u.test(segment)) return false;
    if (!markerIsCodeOrWord) return true;
    if (prefix && /[\p{L}\p{N}]/u.test(before)) return false;
    if (!prefix && /[\p{L}\p{N}]/u.test(after) && !/^[.,،٫]/u.test(after)) return false;
    return true;
  }

  function trimMergedSpreadsheetMatch(text, match, prefix) {
    const marker = prefix ? match[1] : match[2];
    let numberRaw = prefix ? match[2] : match[1];
    let raw = match[0];
    const tail = text.slice(match.index + raw.length);
    // Spreadsheet DOM layers can join neighbouring values (for example
    // `$5,631.94` + `3.9`), which must never become `$5,631.943.9`.
    if (!/^[.,]\d/u.test(tail)) return { marker, numberRaw, raw };

    const decimalMatch = numberRaw.match(/^(.*[.,]\d{1,2})([.,]\d+)$/u);
    if (!decimalMatch) return { marker, numberRaw, raw };

    numberRaw = decimalMatch[1];
    raw = prefix ? `${marker}${numberRaw}` : `${numberRaw}${marker}`;
    return { marker, numberRaw, raw };
  }

  function makeResult(text, match, prefix, context) {
    const trimmed = trimMergedSpreadsheetMatch(text, match, prefix);
    const marker = trimmed.marker;
    const numberRaw = trimmed.numberRaw;
    const start = match.index;
    const end = start + trimmed.raw.length;
    if (!boundaryIsSafe(text, start, end, marker, prefix)) return null;
    const markerInfo = normalizeMarker(marker);
    if (!markerInfo) return null;
    const currency = markerInfo.currency || resolveAmbiguous(markerInfo.ambiguous, context);
    const amount = parseNumber(numberRaw);
    if (!currency || !Number.isFinite(amount) || Math.abs(amount) >= 1e15) return null;
    return {
      amount,
      currency,
      currencyName: CURRENCIES[currency],
      marker,
      numberRaw,
      raw: trimmed.raw,
      start,
      end,
      ambiguous: markerInfo.ambiguous || false
    };
  }

  function findBestCurrencyAtPoint(text, offset, context) {
    const matches = parseCurrencyAmounts(text, context);
    if (!matches.length) return null;
    const direct = matches.filter((item) => offset >= item.start - 1 && offset <= item.end + 1);
    if (direct.length) {
      return direct.sort((a, b) => Math.abs((a.start + a.end) / 2 - offset) - Math.abs((b.start + b.end) / 2 - offset))[0];
    }
    const lineCount = (text.match(/[\n\r\u2028\u2029]/g) || []).length + 1;
    if (lineCount > 1) return null;
    return matches
      .slice()
      .sort((a, b) => offsetDistance(a, offset) - offsetDistance(b, offset))[0];
  }

  function lineIndexForOffset(text, offset) {
    let line = 0;
    for (let index = 0; index < offset && index < text.length; index += 1) {
      if (/[\n\r\u2028\u2029]/u.test(text[index])) line += 1;
    }
    return line;
  }

  function lineCountForText(text) {
    return (String(text).match(/[\n\r\u2028\u2029]/g) || []).length + 1;
  }

  const BARE_AMOUNT_RE = new RegExp(String.raw`^[\s\u200e\u200f\u061c]*(${NUMBER_PATTERN})[\s\u200e\u200f\u061c\.،٫]*$`, "iu");
  const CELL_MARKER_RE = /(?:د\.إ|ر\.س|\bAED\b|\bSAR\b)/iu;

  function inferCellCurrencyFromLines(lineTexts, context) {
    for (const lineText of lineTexts) {
      const matches = parseCurrencyAmounts(String(lineText || ""), context);
      for (const match of matches) {
        if (match.currency === "AED" || match.currency === "SAR") return match.currency;
      }
    }
    for (const lineText of lineTexts) {
      if (CELL_MARKER_RE.test(String(lineText || ""))) {
        if (/د\.إ|\bAED\b/iu.test(lineText)) return "AED";
        if (/ر\.س|\bSAR\b/iu.test(lineText)) return "SAR";
      }
    }
    return null;
  }

  function parseCurrencyLine(text, context, inheritedCurrency) {
    const lineText = String(text || "").trim();
    if (!lineText) return null;

    const matches = parseCurrencyAmounts(lineText, context);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;

    if (!inheritedCurrency || !CURRENCIES[inheritedCurrency]) return null;
    const bare = lineText.match(BARE_AMOUNT_RE);
    if (!bare) return null;

    const amount = parseNumber(bare[1]);
    if (!Number.isFinite(amount) || Math.abs(amount) >= 1e15) return null;
    return {
      amount,
      currency: inheritedCurrency,
      currencyName: CURRENCIES[inheritedCurrency],
      marker: inheritedCurrency,
      numberRaw: bare[1],
      raw: lineText,
      start: 0,
      end: lineText.length,
      ambiguous: false,
      inferred: true
    };
  }

  function offsetDistance(match, offset) {
    if (offset < match.start) return match.start - offset;
    if (offset > match.end) return offset - match.end;
    return 0;
  }

  function formatNumberAmount(amount, maximumFractionDigits) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: maximumFractionDigits == null ? 2 : maximumFractionDigits
    }).format(amount);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function markerPlacement(raw, marker) {
    const text = String(raw || "").trim();
    const token = String(marker || "").trim();
    if (!text || !token) return /^[A-Z]{3}$/.test(token) ? "suffix" : "prefix";
    if (text.startsWith(token)) return "prefix";
    if (text.endsWith(token)) return "suffix";
    if (new RegExp(`^${escapeRegex(token)}\\s*`, "u").test(text)) return "prefix";
    if (new RegExp(`\\s*${escapeRegex(token)}$`, "u").test(text)) return "suffix";
    return /^[A-Z]{3}$/.test(token) ? "suffix" : "prefix";
  }

  function formatMarkerAmount(amount, marker, raw, numberRaw, currencyCode) {
    const token = String(marker || currencyCode || "").trim();
    const number = String(numberRaw || formatNumberAmount(amount)).trim();
    if (!token) return `${number} ${currencyCode || ""}`.trim();
    if (markerPlacement(raw, token) === "suffix") return `${number} ${token}`;
    return `${token} ${number}`;
  }

  function formatIsoCurrencyAmount(amount, currencyCode) {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2
    }).formatToParts(amount);
    const currencyPart = parts.find((part) => part.type === "currency");
    if (!currencyPart) return `${formatNumberAmount(amount)} ${currencyCode}`;

    const numberTypes = new Set(["integer", "decimal", "fraction", "group"]);
    const numberText = parts
      .filter((part) => numberTypes.has(part.type) || (part.type === "literal" && /[.,\s\u00a0\u202f]/u.test(part.value)))
      .map((part) => part.value)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const currencyText = currencyPart.value.trim();
    const currencyIndex = parts.indexOf(currencyPart);
    const firstNumberIndex = parts.findIndex((part) => numberTypes.has(part.type));
    if (currencyIndex < firstNumberIndex) return `${currencyText} ${numberText}`.trim();
    return `${numberText} ${currencyText}`.trim();
  }

  function formatCurrencyDisplay(amount, currencyCode, options) {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.marker != null || opts.raw || opts.numberRaw) {
      return formatMarkerAmount(amount, opts.marker, opts.raw, opts.numberRaw, currencyCode);
    }
    return formatIsoCurrencyAmount(amount, currencyCode);
  }

  function parseCurrencyAmounts(text, context) {
    if (typeof text !== "string" || !text.trim()) return [];
    const results = [];
    for (const [regex, prefix] of [[PREFIX_RE, true], [SUFFIX_RE, false]]) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const result = makeResult(text, match, prefix, context);
        if (result) results.push(result);
        if (match[0].length === 0) regex.lastIndex += 1;
      }
    }
    results.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    return results.filter((item, index, list) => !list.some((other, otherIndex) => otherIndex < index && item.start >= other.start && item.end <= other.end));
  }

  function findCurrencyAtOffset(text, offset, context) {
    const matches = parseCurrencyAmounts(text, context);
    const direct = matches.filter((item) => offset >= item.start - 1 && offset <= item.end + 1);
    if (direct.length) return direct.sort((a, b) => Math.abs((a.start + a.end) / 2 - offset) - Math.abs((b.start + b.end) / 2 - offset))[0];
    return null;
  }

  return Object.freeze({
    CURRENCIES,
    parseNumber,
    parseCurrencyAmounts,
    parseCurrencyLine,
    inferCellCurrencyFromLines,
    findBestCurrencyAtPoint,
    findCurrencyAtOffset,
    lineCountForText,
    lineIndexForOffset,
    resolveAmbiguous,
    formatCurrencyDisplay,
    formatNumberAmount
  });
});
