# Currency Lens

Currency Lens is a Manifest V3 extension for Chromium browsers. Hover over a price on a webpage—or focus a form field containing an amount—to see the detected currency and an indicative conversion to euros and US dollars.

## Install in Chrome, Edge, Brave, or another Chromium browser

1. Unzip `currency-lens-extension.zip` if you received the packaged version.
2. Open the browser's extensions page (`chrome://extensions` in Chrome).
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `currency-lens` folder.
5. Refresh any pages that were already open.

For local `file://` pages such as `demo.html`, enable **Allow access to file URLs** in the extension's details.

## How it works

- Hover directly over visible currency text such as `£149`, `EUR 1.234,56`, or `12,500 CAD`.
- Click an amount to show and pin its conversion until you close it.
- Focus or type in an input, textarea, or editable field containing a currency amount.
- Select a currency amount to convert it, including in editors that expose selected text.
- Click the target icon in the conversion card to pin it; press Escape or click the close icon to dismiss it.
- Open the extension menu to disable Currency Lens for the current site, choose how an ambiguous `$` should be interpreted, or refresh rates.

The detector supports common ISO currency codes, localized decimal/grouping separators, and common symbols for currencies including EUR, USD, GBP, JPY, CNY, CAD, AUD, CHF, INR, KRW, BRL, MXN, SGD, HKD, ZAR, PLN, CZK, HUF, RON, TRY, THB, PHP, IDR, MYR, ILS, UAH, NGN, VND, AED, and SAR.

## Rates and privacy

Latest daily reference rates come from the [Frankfurter v2 API](https://frankfurter.dev/), which requires no account or API key. Rates are cached locally for 12 hours and reused if the service is temporarily unavailable.

Page text is detected locally in the browser. Currency Lens never sends page text, the hovered amount, or the page URL to the rate service. The service receives only a generic request for the current EUR-based rate table.

Conversions are indicative, not trading, card-network, tax, or accounting rates.

## Google Docs and Sheets

Google’s editors can render document and spreadsheet content on a canvas rather than as normal webpage text. Currency Lens therefore supports clicked or keyboard-focused cells, accessibility announcements and labels, editable fields, and selected text in these editors, but cannot reliably detect arbitrary canvas text by pointer position alone.

For the best support, open **Tools → Accessibility settings**, turn on **Screen reader support**, then click or focus a cell, or select the amount. Google also documents the keyboard shortcut as **Command + Option + Z** on macOS and **Ctrl + Alt + Z** on Windows or ChromeOS.

## Development

Run the tests with Node.js 18 or newer:

```sh
node --test tests/*.test.js
```

The extension contains no build step and no third-party runtime dependencies.

## License

Currency Lens is available under the [MIT License](LICENSE).
