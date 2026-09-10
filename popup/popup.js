"use strict";

const siteToggle = document.getElementById("site-enabled");
const siteLabel = document.getElementById("site-label");
const conversionTargetPrimary = document.getElementById("conversion-target-primary");
const conversionTargetSecondary = document.getElementById("conversion-target-secondary");
const dollarPreference = document.getElementById("dollar-preference");
const activity = document.getElementById("activity");
const rateStatus = document.getElementById("rate-status");
const refreshButton = document.getElementById("refresh");
const message = document.getElementById("message");
const googleHelp = document.getElementById("google-help");
const currencyOptions = buildCurrencyOptions();
let hostname = "";

populateTargetSelect(conversionTargetPrimary);
populateTargetSelect(conversionTargetSecondary);
initialize();

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    hostname = hostnameFromUrl(tab && tab.url);
    siteLabel.textContent = hostname || "This browser page";
    googleHelp.hidden = hostname !== "docs.google.com";
    siteToggle.disabled = !hostname;
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!response || !response.ok) throw new Error(response && response.error);
    siteToggle.checked = Array.isArray(response.settings.enabledDomains)
      && response.settings.enabledDomains.includes(hostname);
    applyConversionTargets(response.settings.conversionTargets);
    dollarPreference.value = response.settings.dollarPreference || "auto";
    activity.textContent = siteToggle.checked ? "● Enabled on this site" : "Off on this site";
    showRateStatus(response.rate);
  } catch (error) {
    message.textContent = error && error.message ? error.message : "Could not load extension settings.";
    activity.textContent = "Unavailable";
  }
}

siteToggle.addEventListener("change", async () => {
  if (!hostname) return;
  message.textContent = "";
  const response = await chrome.runtime.sendMessage({ type: "SET_SITE_ENABLED", hostname, enabled: siteToggle.checked });
  if (!response || !response.ok) {
    siteToggle.checked = !siteToggle.checked;
    message.textContent = (response && response.error) || "Could not update this website.";
    return;
  }
  activity.textContent = siteToggle.checked ? "● Enabled on this site" : "Off on this site";
});

conversionTargetPrimary.addEventListener("change", () => {
  reconcileTargetSelections();
  saveConversionTargets();
});
conversionTargetSecondary.addEventListener("change", () => {
  reconcileTargetSelections();
  saveConversionTargets();
});

dollarPreference.addEventListener("change", async () => {
  message.textContent = "";
  const response = await chrome.runtime.sendMessage({ type: "SET_DOLLAR_PREFERENCE", preference: dollarPreference.value });
  if (!response || !response.ok) message.textContent = (response && response.error) || "Could not save this preference.";
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  message.textContent = "";
  try {
    const response = await chrome.runtime.sendMessage({ type: "REFRESH_RATES" });
    if (!response || !response.ok) throw new Error(response && response.error);
    showRateStatus(response.rate);
  } catch (error) {
    message.textContent = error && error.message ? error.message : "Could not refresh rates.";
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
});

function buildCurrencyOptions() {
  const currencies = globalThis.CurrencyLensCurrency && CurrencyLensCurrency.CURRENCIES;
  if (!currencies) return [];
  return Object.keys(currencies)
    .sort((left, right) => currencies[left].localeCompare(currencies[right], undefined, { sensitivity: "base" }))
    .map((code) => ({ code, label: `${code} · ${currencies[code]}` }));
}

function populateTargetSelect(select) {
  select.innerHTML = currencyOptions.map((option) => `<option value="${option.code}">${option.label}</option>`).join("");
}

function applyConversionTargets(targets) {
  const normalized = Array.isArray(targets) && targets.length ? targets : ["EUR", "USD"];
  conversionTargetPrimary.value = normalized[0] || "EUR";
  conversionTargetSecondary.value = normalized[1] || "USD";
  reconcileTargetSelections();
}

function reconcileTargetSelections() {
  if (conversionTargetPrimary.value === conversionTargetSecondary.value) {
    const alternate = currencyOptions.find((option) => option.code !== conversionTargetPrimary.value);
    if (alternate) conversionTargetSecondary.value = alternate.code;
  }
}

async function saveConversionTargets() {
  message.textContent = "";
  const targets = [conversionTargetPrimary.value, conversionTargetSecondary.value];
  const response = await chrome.runtime.sendMessage({ type: "SET_CONVERSION_TARGETS", targets });
  if (!response || !response.ok) {
    message.textContent = (response && response.error) || "Could not save conversion currencies.";
    return;
  }
  applyConversionTargets(response.settings.conversionTargets);
}

function hostnameFromUrl(value) {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase() : "";
  } catch (_) {
    return "";
  }
}

function showRateStatus(rate) {
  if (!rate || !rate.available) {
    rateStatus.textContent = "Rates load on first conversion";
    return;
  }
  const prefix = rate.stale ? "Cached rate" : "Rates";
  rateStatus.textContent = `${prefix}${rate.date ? ` · ${rate.date}` : ""}`;
}
