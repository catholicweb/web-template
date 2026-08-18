// Cloudflare Web Analytics (RUM) — head injection helper.
//
// Consulted by config.js to decide whether to emit the analytics beacon into
// every page's <head>, and by unit tests so the wiring is checked without a
// VitePress build. Pure module: no side effects.
//
// Primary tracking is Cloudflare's per-zone AUTOMATIC injection (enabled
// server-side via the dashboard or the RUM API with `auto_install: true`);
// that path needs no code here. This token path is the fallback for hosts
// automatic injection can't reach (e.g. *.pages.dev or domains not on a
// Cloudflare zone): the manual beacon snippet Cloudflare provides on the
// analytics site's "Manage site" tab, parameterized by a per-site token.
//
// The token is visible in the page source — it is not a secret, exactly like
// the previous GoatCounter site code.
export function webAnalyticsHead(token) {
  if (!token) return [];
  return [
    [
      "script",
      {
        type: "module",
        src: "https://static.cloudflareinsights.com/beacon.min.js",
        // data-cf-beacon is a JSON-encoded object {token, ...}; VitePress
        // entity-escapes attribute values, which browsers decode back to the
        // literal JSON — the same contract as Cloudflare's own snippet.
        "data-cf-beacon": JSON.stringify({ token }),
      },
    ],
  ];
}