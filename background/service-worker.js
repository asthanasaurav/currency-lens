"use strict";

importScripts(chrome.runtime.getURL("shared/rates.js"));

const API_URL = "https://api.frankfurter.dev/v2/rates?base=EUR";
const CACHE_KEY = "currencyLensRateCache";
const SETTINGS_KEY = "currencyLensSettings";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const FAILURE_RETRY_DELAY_MS = 10 * 60 * 1000;
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  dollarPreference: "auto",
  siteOverrides: {}
});

let refreshPromise = null;
let lastRefreshFailureAt = 0;

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  if (!stored[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  chrome.alarms.create("currencyLensRefresh", { periodInMinutes: 360 });
  getRates(true).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("currencyLensRefresh", { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "currencyLensRefresh") getRates(true).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" });
  });
  return true;
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") return { ok: false, error: "Invalid request" };

  if (message.type === "GET_CONVERSION") {
    const amount = Number(message.amount);
    const currency = String(message.currency || "").toUpperCase();
    if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Invalid amount or currency" };
    const cache = await getRates(false);
    const converted = CurrencyLensRates.convertFromEuroBase(amount, currency, cache.rates);
    if (!converted) return { ok: false, error: `No current rate is available for ${currency}.`, rateDate: cache.date || null };
    return { ok: true, converted, rateDate: cache.date, fetchedAt: cache.fetchedAt, stale: Boolean(cache.stale) };
  }

  if (message.type === "GET_SETTINGS") {
    return { ok: true, settings: await getSettings(), rate: await getRateStatus() };
  }

  if (message.type === "SET_SITE_ENABLED") {
    const hostname = normalizeHostname(message.hostname);
    if (!hostname) return { ok: false, error: "This page has no configurable website." };
    const settings = await getSettings();
    settings.siteOverrides[hostname] = Boolean(message.enabled);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    return { ok: true, settings };
  }

  if (message.type === "SET_DOLLAR_PREFERENCE") {
    const allowed = ["auto", "USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN", "TWD"];
    const preference = String(message.preference || "auto");
    if (!allowed.includes(preference)) return { ok: false, error: "Unsupported preference" };
    const settings = await getSettings();
    settings.dollarPreference = preference;
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    return { ok: true, settings };
  }

  if (message.type === "REFRESH_RATES") {
    const cache = await getRates(true);
    return { ok: true, rate: rateStatus(cache) };
  }

  return { ok: false, error: "Unknown request" };
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY] || {};
  return {
    enabled: value.enabled !== false,
    dollarPreference: value.dollarPreference || "auto",
    siteOverrides: value.siteOverrides && typeof value.siteOverrides === "object" ? value.siteOverrides : {}
  };
}

function normalizeHostname(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  return /^[a-z0-9.-]+$/.test(value) ? value : "";
}

async function getRates(force) {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  const cached = stored[CACHE_KEY];
  const isFresh = cached && cached.rates && Date.now() - Number(cached.fetchedAt || 0) < CACHE_MAX_AGE_MS;
  if (!force && isFresh) return cached;
  if (!force && cached && cached.rates && Date.now() - lastRefreshFailureAt < FAILURE_RETRY_DELAY_MS) return { ...cached, stale: true };
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(API_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Rate service returned ${response.status}`);
      const rows = await response.json();
      const parsed = CurrencyLensRates.rowsToRateMap(rows);
      if (!parsed.rates.USD || Object.keys(parsed.rates).length < 5) throw new Error("Rate service returned incomplete data");
      const next = { rates: parsed.rates, date: parsed.date, fetchedAt: Date.now(), stale: false };
      await chrome.storage.local.set({ [CACHE_KEY]: next });
      lastRefreshFailureAt = 0;
      return next;
    } catch (error) {
      lastRefreshFailureAt = Date.now();
      if (cached && cached.rates) return { ...cached, stale: true };
      throw new Error("Exchange rates are temporarily unavailable. Try refreshing in a moment.");
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function getRateStatus() {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  return rateStatus(stored[CACHE_KEY]);
}

function rateStatus(cache) {
  if (!cache) return { available: false, date: null, fetchedAt: null, stale: false };
  return { available: true, date: cache.date || null, fetchedAt: cache.fetchedAt || null, stale: Boolean(cache.stale) };
}
