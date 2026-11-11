// Official Lucide icons, bundled locally. See THIRD-PARTY-NOTICES.md.
const names = {
  search: 'search',
  download: 'download',
  library: 'library-big',
  settings: 'settings',
  heart: 'heart',
  coffee: 'coffee',
  plus: 'plus',
  close: 'x',
  play: 'play',
  pause: 'pause',
  next: 'skip-forward',
  previous: 'skip-back',
  volume: 'volume-2',
  muted: 'volume-x',
  edit: 'square-pen',
  more: 'ellipsis',
  scissors: 'scissors',
  external: 'external-link',
  arrow: 'arrow-right',
  clipboard: 'clipboard',
  refresh: 'refresh-cw',
  folder: 'folder',
  check: 'check',
  trash: 'trash-2',
  queue: 'list-music',
  shuffle: 'shuffle',
  repeat: 'repeat',
  list: 'list',
  grid: 'layout-grid',
  table: 'table-2',
  help: 'circle-help',
  chevron: 'chevron-down',
};
export function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '/lucide.svg#' + (names[name] || names.play));
  svg.append(use);
  return svg;
}
