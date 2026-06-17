/** Whether the user has asked the OS to reduce motion. */
export function prefersReducedMotion(
  matcher: (query: string) => { matches: boolean } = (query) => window.matchMedia(query)
): boolean {
  return matcher('(prefers-reduced-motion: reduce)').matches;
}
