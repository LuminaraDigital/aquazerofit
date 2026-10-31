/**
 * scrollIntoView({ behavior: 'smooth' }) on the thread end restarts on every
 * streamed token, and the CSS smooth-scroll on <html> joins in. The composer
 * then stops mid-viewport with empty space under it. Pinning scrollTop is
 * instant and lands on the latest bubble.
 */
export function pinThreadToLatest(doc: Document = document): void {
  for (const node of [doc.scrollingElement, doc.documentElement, doc.body]) {
    if (!node) continue;
    node.scrollTop = node.scrollHeight;
  }
}
