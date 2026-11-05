/**
 * index.html loads Google Fonts as media="print" so a Mini App paints before
 * the font CSS answers. Switching them to screen media used to be an inline
 * onload handler, which the Worker's CSP (no 'unsafe-inline') blocks, so no
 * web font ever applied and every icon rendered as its ligature name. The
 * entry module is same-origin script, so it does the switch instead.
 */
export function enableAsyncFonts(root: ParentNode = document): void {
  for (const link of root.querySelectorAll<HTMLLinkElement>('link[data-async-font]')) {
    link.media = 'all';
  }
}
