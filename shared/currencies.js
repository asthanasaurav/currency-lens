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
  const NUMBER_PATTERN = String.raw`[-+−]?(?:\d{1,3}(?:[\s\u00a0\u202f.,'’]\d{3})+|\d+)(?:[.,]\d{1,2})?`;
  const PREFIX_RE = new RegExp(String.raw`(${MARKER_PATTERN})\s*(${NUMBER_PATTERN})`, "giu");
  const SUFFIX_RE = new RegExp(String.raw`(${NUMBER_PATTERN})\s*(${MARKER_PATTERN})`, "giu");

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeMarker(marker) {
    const exact = Object.keys(DIRECT_MARKERS).find((item) => item.toLocaleLowerCase() === marker.toLocaleLowerCase());
    if (exact) return { currency: DIRECT_MARKERS[exact], ambiguous: false };
    const word = Object.keys(WORD_MARKERS).find((item) => item.toLocaleLowerCase() === marker.toLocaleLowerCase());
    if (word) return { currency: WORD_MARKERS[word], ambiguous: false };
    const ambiguous = Object.keys(AMBIGUOUS_MARKERS).find((item) => item.toLocaleLowerCase() === marker.toLocaleLowerCase());
    return ambiguous ? { currency: null, ambiguous: AMBIGUOUS_MARKERS[ambiguous] } : null;
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
    let value = String(raw).trim().replace(/−/g, "-").replace(/[\s\u00a0\u202f'’]/g, "");
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
    // When one marker sits between two numbers (for example Flipkart's
    // struck-through `26,499₹17,999`), it belongs to the following amount.
    // Rejecting the suffix interpretation lets the prefix match win.
    if (!prefix && /^\s*[-+−]?\d/u.test(text.slice(end))) return false;
    if (!markerIsCodeOrWord) return true;
    if (prefix && /[\p{L}\p{N}]/u.test(before)) return false;
    if (!prefix && /[\p{L}\p{N}]/u.test(after)) return false;
    return true;
  }

  function makeResult(text, match, prefix, context) {
    const marker = prefix ? match[1] : match[2];
    const numberRaw = prefix ? match[2] : match[1];
    const start = match.index;
    const end = start + match[0].length;
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
      raw: match[0],
      start,
      end,
      ambiguous: markerInfo.ambiguous || false
    };
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

  return Object.freeze({ CURRENCIES, parseNumber, parseCurrencyAmounts, findCurrencyAtOffset, resolveAmbiguous });
});
