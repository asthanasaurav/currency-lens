"use strict";

const siteToggle = document.getElementById("site-enabled");
const siteLabel = document.getElementById("site-label");
const dollarPreference = document.getElementById("dollar-preference");
const activity = document.getElementById("activity");
const rateStatus = document.getElementById("rate-status");
const refreshButton = document.getElementById("refresh");
const message = document.getElementById("message");
const googleHelp = document.getElementById("google-help");
let hostname = "";

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
    const siteSetting = response.settings.siteOverrides[hostname];
    siteToggle.checked = response.settings.enabled !== false && siteSetting !== false;
    dollarPreference.value = response.settings.dollarPreference || "auto";
    activity.textContent = siteToggle.checked ? "● Active" : "Paused on this site";
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
  activity.textContent = siteToggle.checked ? "● Active" : "Paused on this site";
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
