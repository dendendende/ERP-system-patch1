// Which rows of a long list are on screen (P7-T4). Rows have one fixed height, so the window is
// plain arithmetic: no measuring per row, no library.

/**
 * @param offset how far the list's top has scrolled above the viewport's top (px; negative when
 *               the list starts lower down the page)
 * @returns rows [start, end) to render, `overscan` extra on each side so fast scrolling never
 *          shows a blank gap
 */
export function visibleRange(
  offset: number,
  viewport: number,
  rowHeight: number,
  count: number,
  overscan = 10,
): { start: number; end: number } {
  const first = Math.floor(Math.max(0, offset) / rowHeight);
  const last = Math.ceil(Math.max(0, offset + viewport) / rowHeight);
  const start = Math.min(count, Math.max(0, first - overscan));
  const end = Math.min(count, Math.max(start, last + overscan));
  return { start, end };
}
