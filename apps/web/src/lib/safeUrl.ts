/**
 * Validate an untrusted external URL before binding it to an anchor `href`.
 * Allows only explicit `https:` and `http:` schemes, rejecting `javascript:`,
 * `data:`, protocol-relative, and malformed URLs.
 */
export function safeHttpUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
