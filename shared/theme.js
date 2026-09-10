(function attachThemeTools(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CurrencyLensTheme = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function themeFactory() {
  "use strict";

  const THEME_IDS = ["auto", "light", "dark", "glass"];
  const DEFAULT_UI_THEME = "glass";
  const DEFAULT_PANEL_OPACITY = 88;
  const MIN_PANEL_OPACITY = 55;
  const MAX_PANEL_OPACITY = 100;

  const PALETTES = Object.freeze({
    light: Object.freeze({
      colorScheme: "light",
      panel: [255, 255, 255],
      arrow: [255, 255, 255],
      panelBorder: "rgba(15, 23, 42, 0.12)",
      surface: "rgba(248, 250, 252, 0.78)",
      text: "#0f172a",
      textMuted: "#64748b",
      textSoft: "#94a3b8",
      accent: "#10b981",
      accentText: "#047857",
      accentSoft: "rgba(16, 185, 129, 0.14)",
      divider: "rgba(15, 23, 42, 0.08)",
      shadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
      pageBg:
        "radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), transparent 42%),"
        + "radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.1), transparent 38%),"
        + "linear-gradient(160deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92))",
      pin: "#64748b",
      pinHover: "#10b981",
      error: "#b45309",
      skeleton: ["#e2e8f0", "#cbd5e1", "#e2e8f0"]
    }),
    dark: Object.freeze({
      colorScheme: "dark",
      panel: [15, 23, 42],
      arrow: [15, 23, 42],
      panelBorder: "rgba(255, 255, 255, 0.12)",
      surface: "rgba(30, 41, 59, 0.72)",
      text: "#f8fafc",
      textMuted: "#cbd5e1",
      textSoft: "#94a3b8",
      accent: "#34d399",
      accentText: "#6ee7b7",
      accentSoft: "rgba(52, 211, 153, 0.14)",
      divider: "rgba(255, 255, 255, 0.08)",
      shadow: "0 24px 60px rgba(2, 6, 23, 0.45)",
      pageBg:
        "radial-gradient(circle at top left, rgba(52, 211, 153, 0.12), transparent 42%),"
        + "radial-gradient(circle at bottom right, rgba(96, 165, 250, 0.1), transparent 38%),"
        + "linear-gradient(160deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.92))",
      pin: "#94a3b8",
      pinHover: "#34d399",
      error: "#fdba74",
      skeleton: ["#1e293b", "#334155", "#1e293b"]
    })
  });

  function normalizePanelOpacity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_PANEL_OPACITY;
    return Math.min(MAX_PANEL_OPACITY, Math.max(MIN_PANEL_OPACITY, Math.round(number)));
  }

  function normalizeUiTheme(value) {
    const theme = String(value || DEFAULT_UI_THEME).toLowerCase();
    return THEME_IDS.includes(theme) ? theme : DEFAULT_UI_THEME;
  }

  function normalizeAppearance(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return {
      uiTheme: normalizeUiTheme(source.uiTheme),
      panelOpacity: normalizePanelOpacity(source.panelOpacity)
    };
  }

  function prefersDarkMode() {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolvePalette(uiTheme) {
    if (uiTheme === "light") return PALETTES.light;
    if (uiTheme === "dark") return PALETTES.dark;
    return prefersDarkMode() ? PALETTES.dark : PALETTES.light;
  }

  function rgbaFromRgb(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function cssVariables(settings) {
    const appearance = normalizeAppearance(settings);
    const palette = resolvePalette(appearance.uiTheme);
    const alpha = appearance.panelOpacity / 100;
    const blur = appearance.uiTheme === "glass" ? "20px" : "14px";

    return {
      "--cl-color-scheme": palette.colorScheme,
      "--cl-panel-bg": rgbaFromRgb(palette.panel, alpha),
      "--cl-panel-border": palette.panelBorder,
      "--cl-surface": palette.surface,
      "--cl-text": palette.text,
      "--cl-text-muted": palette.textMuted,
      "--cl-text-soft": palette.textSoft,
      "--cl-accent": palette.accent,
      "--cl-accent-text": palette.accentText,
      "--cl-accent-soft": palette.accentSoft,
      "--cl-divider": palette.divider,
      "--cl-shadow": palette.shadow,
      "--cl-page-bg": palette.pageBg,
      "--cl-pin": palette.pin,
      "--cl-pin-hover": palette.pinHover,
      "--cl-error": palette.error,
      "--cl-arrow": rgbaFromRgb(palette.arrow, alpha),
      "--cl-blur": blur,
      "--cl-skeleton-a": palette.skeleton[0],
      "--cl-skeleton-b": palette.skeleton[1],
      "--cl-skeleton-c": palette.skeleton[2]
    };
  }

  function applyToElement(element, settings) {
    if (!(element instanceof Element)) return normalizeAppearance(settings);
    const appearance = normalizeAppearance(settings);
    const vars = cssVariables(settings);
    for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
    element.dataset.clTheme = appearance.uiTheme;
    element.style.colorScheme = vars["--cl-color-scheme"];
    return appearance;
  }

  function tooltipStylesheet() {
    return `
      :host([hidden]){display:none!important}
      *{box-sizing:border-box}
      .lens{
        position:relative;width:272px;padding:14px;border:1px solid var(--cl-panel-border);border-radius:16px;
        color:var(--cl-text);background:var(--cl-panel-bg);backdrop-filter:blur(var(--cl-blur));-webkit-backdrop-filter:blur(var(--cl-blur));
        box-shadow:var(--cl-shadow);font:13px/1.35 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
      }
      .lens:after{
        content:"";position:absolute;left:calc(50% - 7px);top:-7px;width:13px;height:13px;background:var(--cl-arrow);
        border-left:1px solid var(--cl-panel-border);border-top:1px solid var(--cl-panel-border);transform:rotate(45deg)
      }
      .lens.above:after{top:auto;bottom:-7px;border:0;border-right:1px solid var(--cl-panel-border);border-bottom:1px solid var(--cl-panel-border)}
      .head{display:flex;align-items:center;gap:7px;padding-right:25px;color:var(--cl-text-soft);font-size:10px;font-weight:750;letter-spacing:.055em;text-transform:uppercase}
      .dot{width:7px;height:7px;border-radius:50%;background:var(--cl-accent);box-shadow:0 0 0 3px var(--cl-accent-soft)}
      .pin{
        position:absolute;right:9px;top:8px;width:28px;height:28px;border:0;border-radius:10px;color:var(--cl-pin);
        background:transparent;cursor:pointer;font:17px/1 sans-serif;transition:color .16s,background .16s
      }
      .pin:hover,.pin.active{color:var(--cl-pin-hover);background:var(--cl-accent-soft)}
      .source{margin:9px 0 10px;font-size:20px;font-weight:760;letter-spacing:-.02em;color:var(--cl-text)}
      .row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid var(--cl-divider)}
      .label{color:var(--cl-text-muted)}.value{font-weight:760;font-variant-numeric:tabular-nums;color:var(--cl-text)}
      .meta{margin-top:8px;color:var(--cl-text-soft);font-size:9px}
      .error{padding:9px 0 1px;border-top:1px solid var(--cl-divider);color:var(--cl-error);font-size:11px;line-height:1.45}
      .skeleton{
        height:13px;width:76px;border-radius:5px;
        background:linear-gradient(90deg,var(--cl-skeleton-a),var(--cl-skeleton-b),var(--cl-skeleton-a));
        background-size:200% 100%;animation:pulse 1.2s linear infinite
      }
      @keyframes pulse{to{background-position:-200% 0}}
      @media (prefers-reduced-motion:reduce){.skeleton{animation:none}}
    `;
  }

  return Object.freeze({
    THEME_IDS,
    DEFAULT_UI_THEME,
    DEFAULT_PANEL_OPACITY,
    MIN_PANEL_OPACITY,
    MAX_PANEL_OPACITY,
    normalizeAppearance,
    normalizeUiTheme,
    normalizePanelOpacity,
    cssVariables,
    applyToElement,
    tooltipStylesheet
  });
});
