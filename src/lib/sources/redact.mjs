/**
 * Strip credentials from a URL before it can reach a log or the UI.
 *
 * Error messages from the fetch clients surface in the snapshot's `problems`
 * array, which page.tsx renders in the SOURCE PROBLEMS band — so an unredacted
 * URL puts the API key in front of every visitor, not just the logs.
 *
 * Truncation is NOT a defence: `api_key` sits ~90 chars into a FRED
 * observations URL, well inside any human-readable slice. This module exists in
 * plain JS so scripts/selftest.mjs can assert on it directly — a security
 * control that isn't tested is a security control that regresses.
 */

const SECRET_PARAMS = ["api_key", "apikey", "token", "access_token", "key", "password", "secret"];

export function redactUrl(url) {
  try {
    const u = new URL(url);
    for (const k of u.searchParams.keys()) {
      if (SECRET_PARAMS.includes(k.toLowerCase())) u.searchParams.set(k, "REDACTED");
    }
    return u.toString();
  } catch {
    // Not a parseable URL — redact conservatively rather than echo it raw.
    return String(url).replace(/((?:api_?|access_)?(?:key|token|password|secret)=)[^&\s]+/gi, "$1REDACTED");
  }
}
