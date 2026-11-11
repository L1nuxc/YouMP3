import { createIcon } from './icons.js';

const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// Each view owns its layout. Table cells never share the card grid's positioning.
export function renderLibrary(list, view, ctx) {
  const select = (j) => {
    const input = node('input', 'track-select');
    input.type = 'checkbox';
    input.checked = ctx.selected.has(j.id);
    input.setAttribute('aria-label', 'Выбрать ' + j.title);
    input.onchange = () => ctx.select(j.id, input.checked);
    return input;
  };
  const action = (name, label, fn) => {
    const b = node('button', 'icon-button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(createIcon(name));
    b.onclick = fn;
    return b;
  };
  const actions = (j) => {
    const group = node('div', 'track-actions');
    const favorite = ctx.favorite(j);
    group.append(
      favorite,
      action('plus', 'Включить следующим', () => ctx.enqueue(j)),
      action('trash', 'Удалить из библиотеки', () => ctx.trash(j.id)),
    );
    return group;
  };
  const title = (j) => {
    const b = node('button', 'tile-title', j.title);
    b.type = 'button';
    b.title = j.title;
    b.onclick = () => ctx.open(j);
    return b;
  };
  const art = (j) => {
    const b = node('button', 'tile-cover');
    b.type = 'button';
    b.setAttribute('aria-label', (j.status === 'done' ? 'Слушать: ' : 'Открыть: ') + j.title);
    const overlay = node('span', 'tile-play-overlay');
    overlay.append(createIcon(j.id === ctx.playing() && !ctx.audio.paused ? 'pause' : 'play'));
    b.append(ctx.cover(j), overlay);
    b.onclick = () => {
      ctx.open(j);
      if (j.status !== 'done') return;
      if (j.id === ctx.playing() && !ctx.audio.paused) ctx.audio.pause();
      else ctx.play(j);
    };
    return b;
  };
  const decorate = (row, j) => {
    row.dataset.id = j.id;
    row.classList.add('track-tile');
    row.classList.toggle('selected', j.id === ctx.inspected());
    row.classList.toggle('bulk-selected', ctx.selected.has(j.id));
    row.classList.toggle('is-playing', j.id === ctx.playing() && !ctx.audio.paused);
    row.oncontextmenu = (e) => {
      e.preventDefault();
      ctx.menu(j, row.querySelector('.tile-title'));
    };
    return row;
  };
  const artist = (j) =>
    j.artist || { youtube: 'YouTube', soundcloud: 'SoundCloud' }[j.service] || 'Аудиофайл';
  const duration = (j) => (j.status === 'done' ? ctx.time(j.duration) : ctx.statuses[j.status]);
  if (view === 'grid')
    return list.map((j) => {
      const card = ctx.tile(j, 0);
      card.prepend(select(j));
      return decorate(card, j);
    });
  if (view === 'list')
    return list.map((j) => {
      const row = decorate(node('article', 'library-row'), j);
      const main = node('div', 'track-main');
      const by = node('span', 'track-artist', artist(j));
      by.title = by.textContent;
      main.append(title(j), by);
      row.append(select(j), art(j), main, node('span', 'track-duration', duration(j)), actions(j));
      return row;
    });
  const table = node('table', 'library-table');
  table.setAttribute('aria-label', 'Треки библиотеки');
  const cols = node('colgroup');
  for (const cls of ['select', 'name', 'artist', 'duration', 'bpm', 'key', 'format', 'actions'])
    cols.append(node('col', 'column-' + cls));
  const head = node('thead'),
    heading = node('tr');
  for (const label of [
    'Выбор',
    'Трек',
    'Исполнитель',
    'Время',
    'BPM',
    'Тональность',
    'Формат',
    'Действия',
  ]) {
    const th = node('th', undefined, label);
    th.scope = 'col';
    heading.append(th);
  }
  head.append(heading);
  const body = node('tbody');
  for (const j of list) {
    const row = decorate(node('tr'), j),
      m = ctx.music(j);
    const cell = (content, cls) => {
      const td = node('td', cls);
      if (typeof content === 'string') {
        td.textContent = content;
        td.title = content;
      } else td.append(content);
      row.append(td);
    };
    cell(select(j));
    const main = node('div', 'table-track');
    main.append(art(j), title(j));
    cell(main);
    cell(artist(j), 'track-artist');
    cell(duration(j), 'track-duration');
    cell(m.bpm ? String(m.bpm) : '—');
    cell(m.key ? m.key + (m.scale ? ' ' + m.scale : '') : '—');
    cell((j.format || '').toUpperCase());
    cell(actions(j));
    body.append(row);
  }
  table.append(cols, head, body);
  return [table];
}
