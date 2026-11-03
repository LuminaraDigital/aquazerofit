/**
 * `fetchpriority` that actually reaches the HTML on React 18.
 *
 * `@types/react` 18.3 declares a camelCase `fetchPriority` prop, so
 * `<img fetchPriority="high" />` type-checks — but react-dom 18.3's renderer
 * does not know it, drops it, and logs "React does not recognize the
 * fetchPriority prop". The attribute never reaches the DOM, which means the
 * priority hint is silently lost on exactly the images it was added for. React
 * 19 handles the camelCase form natively; until this app is on it, the
 * lowercase attribute is the only form react-dom passes straight through, and
 * it has to arrive by spread because the lowercase spelling is not in the JSX
 * typings.
 *
 * Use on the LCP element only. Marking everything high priority is the same as
 * marking nothing.
 */
const HIGH = { fetchpriority: 'high' } as const;

export function fetchPriorityHigh(when = true): Record<string, string> {
  return when ? HIGH : {};
}
