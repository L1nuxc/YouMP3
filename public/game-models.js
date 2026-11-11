export { slide2048 } from './games-rules.js';
export const equipment = [
  { name: 'Микрофон', detail: '+1 монета за дубль', price: 20, click: 1, rate: 0 },
  { name: 'Мониторы', detail: '+1 монета в секунду', price: 80, click: 0, rate: 1 },
  { name: 'Синтезатор', detail: '+5 монет в секунду', price: 400, click: 0, rate: 5 },
  { name: 'Рабочая станция', detail: '+20 монет в секунду', price: 2200, click: 0, rate: 20 },
  { name: 'Команда', detail: '+100 монет в секунду', price: 12000, click: 0, rate: 100 },
  { name: 'Свой лейбл', detail: '+500 монет в секунду', price: 70000, click: 0, rate: 500 },
];
export const milestones = [0, 100, 1000, 10000, 100000, 1000000, 5000000];
export const stages = [
  'Домашняя запись',
  'Комната музыканта',
  'Гаражная студия',
  'Своя студия',
  'Продюсерский центр',
  'Независимый лейбл',
  'Музыкальная империя',
];
const finite = (v, max = 1e15) => (Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
export function studioState(raw = {}, now = Date.now()) {
  return {
    coins: finite(raw.coins),
    earned: Math.max(finite(raw.earned), finite(raw.coins)),
    clicks: Math.floor(finite(raw.clicks)),
    gear: equipment.map((_, i) => Math.floor(finite(raw.gear?.[i], 100))),
    claimed: Array.isArray(raw.claimed)
      ? raw.claimed.filter((v) => Number.isInteger(v) && v >= 0 && v < 6)
      : [],
    updated: Math.min(now, finite(raw.updated) || now),
  };
}
export const studioRate = (s) => s.gear.reduce((n, v, i) => n + v * equipment[i].rate, 0);
export const studioClick = (s) => 1 + s.gear.reduce((n, v, i) => n + v * equipment[i].click, 0);
export const studioPrice = (s, i) => Math.ceil(equipment[i].price * 1.18 ** s.gear[i]);
export function buyEquipment(s, i) {
  if (!equipment[i] || s.gear[i] >= 100) return false;
  const price = studioPrice(s, i);
  if (s.coins < price) return false;
  s.coins -= price;
  s.gear[i]++;
  return true;
}
export function earn(s, n) {
  s.coins = Math.min(1e15, s.coins + n);
  s.earned = Math.min(1e15, s.earned + n);
}
export function offlineIncome(s, now = Date.now()) {
  const n = (Math.min(7200000, Math.max(0, now - s.updated)) / 1000) * studioRate(s) * 0.25;
  earn(s, n);
  s.updated = now;
  return n;
}
export function newSnake(speed = 'normal') {
  return {
    body: [
      [7, 7],
      [6, 7],
      [5, 7],
    ],
    dir: [1, 0],
    food: [11, 7],
    score: 0,
    speed: ['calm', 'normal', 'fast'].includes(speed) ? speed : 'normal',
  };
}
export function validSnake(s) {
  return (
    s &&
    Array.isArray(s.body) &&
    s.body.length >= 3 &&
    s.body.length <= 256 &&
    s.body.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((v) => Number.isInteger(v) && v >= 0 && v < 16),
    ) &&
    new Set(s.body.map((p) => p.join(','))).size === s.body.length &&
    Array.isArray(s.dir) &&
    s.dir.length === 2 &&
    s.dir.every(Number.isInteger) &&
    Math.abs(s.dir[0]) + Math.abs(s.dir[1]) === 1 &&
    Array.isArray(s.food) &&
    s.food.length === 2 &&
    s.food.every((v) => Number.isInteger(v) && v >= 0 && v < 16) &&
    !s.body.some((p) => p[0] === s.food[0] && p[1] === s.food[1]) &&
    Number.isInteger(s.score) &&
    s.score >= 0 &&
    s.score <= 253 &&
    s.body.length === s.score + 3 &&
    s.body.every(
      (p, i) => !i || Math.abs(p[0] - s.body[i - 1][0]) + Math.abs(p[1] - s.body[i - 1][1]) === 1,
    )
  );
}
export function stepSnake(s, dir, random = Math.random) {
  const head = [s.body[0][0] + dir[0], s.body[0][1] + dir[1]],
    eating = head[0] === s.food[0] && head[1] === s.food[1],
    body = eating ? s.body : s.body.slice(0, -1);
  if (head.some((v) => v < 0 || v >= 16) || body.some((p) => p[0] === head[0] && p[1] === head[1]))
    return { dead: true };
  s.dir = dir;
  s.body.unshift(head);
  if (eating) {
    s.score++;
    const free = [];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if (!s.body.some((p) => p[0] === x && p[1] === y)) free.push([x, y]);
    if (!free.length) return { won: true, eating: true };
    s.food = free[Math.min(free.length - 1, Math.floor(random() * free.length))];
  } else s.body.pop();
  return { eating };
}
export function valid2048(s) {
  return (
    s &&
    Array.isArray(s.board) &&
    s.board.length === 16 &&
    s.board.every(
      (v) => Number.isInteger(v) && v >= 0 && v <= 2 ** 30 && (v === 0 || Math.log2(v) % 1 === 0),
    ) &&
    Number.isFinite(s.score) &&
    s.score >= 0
  );
}
export function shuffle(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function movePlan(board, direction) {
  const moves = [];
  for (let line = 0; line < 4; line++) {
    const ids = Array.from({ length: 4 }, (_, i) =>
        direction === 'left'
          ? line * 4 + i
          : direction === 'right'
            ? line * 4 + 3 - i
            : direction === 'up'
              ? i * 4 + line
              : (3 - i) * 4 + line,
      ),
      filled = ids.filter((i) => board[i]);
    let slot = 0;
    for (let i = 0; i < filled.length; i++) {
      const from = filled[i],
        to = ids[slot++];
      moves.push({ from, to });
      if (board[from] === board[filled[i + 1]]) moves.push({ from: filled[++i], to });
    }
  }
  return moves;
}
export function validGameSave(value) {
  const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const amount = (v) => Number.isFinite(v) && v >= 0 && v <= 1e15;
  if (
    !object(value) ||
    value.schema !== 2 ||
    !object(value.records) ||
    !object(value.states) ||
    !amount(value.updated)
  )
    return false;
  if (
    !Object.entries(value.records).every(
      ([key, n]) => /^(studio|2048|guess|snake(?:-(calm|normal|fast))?)$/.test(key) && amount(n),
    )
  )
    return false;
  return Object.entries(value.states).every(([key, s]) => {
    if (key === '2048') return valid2048(s);
    if (key === 'snake') return validSnake(s);
    return (
      key === 'studio' &&
      object(s) &&
      amount(s.coins) &&
      amount(s.earned) &&
      amount(s.clicks) &&
      amount(s.updated) &&
      Array.isArray(s.gear) &&
      s.gear.length === 6 &&
      s.gear.every((n) => Number.isInteger(n) && n >= 0 && n <= 100) &&
      Array.isArray(s.claimed) &&
      s.claimed.length <= 6 &&
      s.claimed.every((n) => Number.isInteger(n) && n >= 0 && n < 6)
    );
  });
}
export function guessLibrary(jobs) {
  const byId = new Map(jobs.map((j) => [j.id, j])),
    identities = new Set(),
    labels = new Set();
  return jobs.filter((j) => {
    if (j.status !== 'done' || j.missing || j.deletedAt) return false;
    let base = j;
    for (let depth = 0; depth < 8 && base.parentId && byId.has(base.parentId); depth++)
      base = byId.get(base.parentId);
    const label = (String(j.artist || '') + '|' + String(j.track || j.title || ''))
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('ru-RU');
    const identity = base.sourceId
      ? base.service + ':' + base.sourceId
      : base.url || 'file:' + base.id;
    if (identities.has(identity) || labels.has(label)) return false;
    identities.add(identity);
    labels.add(label);
    return true;
  });
}
