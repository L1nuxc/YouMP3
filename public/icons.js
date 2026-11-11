const paths = {
  search: 'M21 21l-4.4-4.4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  library: 'M3 4h18v16H3ZM8 4v16M16 8v7m0-7-4 1M16 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  settings:
    'M9.5 3h5l.6 2.3 2 .9 2.1-.7 2.5 4.3-1.6 1.6v2.4l1.6 1.6-2.5 4.3-2.1-.7-2 .9-.6 2.1h-5l-.6-2.1-2-.9-2.1.7-2.5-4.3 1.6-1.6v-2.4L2.3 9.8l2.5-4.3 2.1.7 2-.9Z M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
  heart:
    'M20.8 4.6a5.2 5.2 0 0 0-7.3 0L12 6.1l-1.5-1.5a5.2 5.2 0 0 0-7.3 7.3L12 21l8.8-9.1a5.2 5.2 0 0 0 0-7.3Z',
  coffee:
    'M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v3m4-3v3m4-3v3M2 22h18',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  play: 'm8 4 12 8-12 8Z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  next: 'm5 4 12 8-12 8ZM19 4v16',
  previous: 'm19 4-12 8 12 8ZM5 4v16',
  volume: 'm11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'm11 4-6 5H2v6h3l6 5Zm5 5 6 6m-6 0 6-6',
  edit: 'm4 16 12-12 4 4L8 20l-5 1Zm10-10 4 4',
  more: 'M4 12h.01M12 12h.01M20 12h.01',
  scissors: 'M8 8 21 21M8 16 21 3M8 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  external: 'M14 3h7v7m0-7L10 14M10 3H4v17h17v-6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  clipboard: 'M8 5H5v16h14V5h-3M8 3h8v4H8zM8 12h8m-8 4h6',
  refresh: 'M20 9a8 8 0 0 0-14-5L3 7m0-5v5h5M4 15a8 8 0 0 0 14 5l3-3m0 5v-5h-5',
  folder: 'M3 5h7l2 3h9v12H3z',
  check: 'm5 12 4 4L20 5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  queue: 'M4 5h16M4 10h16M4 15h8m4-1 5 4-5 4Z',
  shuffle: 'M3 5h3l12 14h3M17 15l4 4-4 3M3 19h3l4-5m4-4 4-5h3m-4-3 4 3-4 4',
  repeat: 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-3v5a2 2 0 0 1-2 2H3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  table: 'M3 4h18v16H3ZM3 9h18M3 14h18M9 4v16',
  help: 'M9 8a3 3 0 1 1 5 2.2c-2 1-2 1.8-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  chevron: 'm7 10 5 5 5-5',
};
// Symmetric teeth use a shared center and grid, including the inner bearing.
const gear = [];
for (let tooth = 0; tooth < 8; tooth++)
  for (const [offset, radius] of [
    [-22.5, 8],
    [-12, 8],
    [-12, 10],
    [12, 10],
    [12, 8],
    [22.5, 8],
  ]) {
    const angle = ((tooth * 45 + offset - 90) * Math.PI) / 180;
    gear.push(
      (gear.length ? 'L' : 'M') +
        (12 + radius * Math.cos(angle)).toFixed(2) +
        ' ' +
        (12 + radius * Math.sin(angle)).toFixed(2),
    );
  }
paths.settings = gear.join(' ') + 'Z M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0';
export function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', paths[name] || paths.play);
  svg.append(p);
  return svg;
}
