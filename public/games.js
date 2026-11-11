import {
  slide2048,
  equipment,
  milestones,
  stages,
  studioState,
  studioRate,
  studioClick,
  studioPrice,
  buyEquipment,
  earn,
  offlineIncome,
  newSnake,
  validSnake,
  stepSnake,
  valid2048,
  shuffle,
  guessLibrary,
  movePlan,
} from './game-models.js';
const $ = (s) => document.querySelector(s);
const make = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const catalog = [
  [
    'studio',
    'Своя студия',
    'От первого дубля до собственного лейбла',
    'Записывайте дубли, покупайте оборудование и выполняйте задания. Мониторы и следующие покупки приносят пассивный доход.',
    'Мышь / пробел / Enter — записать дубль. В магазине Enter покупает выбранное улучшение.',
  ],
  [
    'snake',
    'Змейка',
    'Соберите еду и заполните поле',
    'Ешьте оранжевые ноты, избегайте стен и своего хвоста. Выберите темп перед началом партии.',
    'Стрелки / WASD или кнопки направлений. P — пауза.',
  ],
  [
    '2048',
    '2048',
    'Объединяйте плитки, стройте большие числа',
    'Сдвигайте поле: две одинаковые плитки соединяются один раз за ход. Достигните 2048 и продолжайте ставить рекорды.',
    'Стрелки / WASD, кнопки или свайп. Z — отменить последний ход.',
  ],
  [
    'guess',
    'Угадай трек',
    'Узнайте музыку из своей библиотеки',
    'Слушайте фрагмент и выбирайте название. В каждой партии до пяти разных треков. Нужны хотя бы два готовых аудиофайла.',
    'Пробел — повторить фрагмент. Клавиши 1–4 — выбрать ответ. Enter — следующий раунд.',
  ],
];
let recoveryBase = 0;
let ctx,
  store = { schema: 2, records: {}, states: {} },
  game = '',
  paused = false,
  finished = false,
  handle = () => {},
  dispose = () => {},
  onPause = () => {},
  checkpoint = () => {},
  generation = 0,
  saveTimer,
  saveChain = Promise.resolve(),
  dirty = false,
  unavailable = false,
  saveStamp = 0,
  sound = false,
  ac;
function status(t) {
  $('#game-status').textContent = t;
}
function storageNotice(t) {
  $('#game-save-status').textContent = t;
}
function localSave() {
  store.updated = Date.now();
  try {
    localStorage.setItem('yoump3-games', JSON.stringify(store));
  } catch {}
}
function save() {
  dirty = true;
  saveStamp++;
  localSave();
  if (!saveTimer) saveTimer = setTimeout(flush, 1000);
}
async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty) return;
  const stamp = saveStamp,
    snapshot = JSON.stringify(store);
  dirty = false;
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      try {
        if (unavailable) {
          const check = await fetch('/api/games');
          if (!check.ok) throw Error();
          const remote = await check.json();
          if (
            remote.updated > recoveryBase ||
            (!recoveryBase && Object.keys(remote.states || {}).length)
          ) {
            try {
              localStorage.setItem('yoump3-games', JSON.stringify(remote));
            } catch {}
            storageNotice(
              'Есть более новое сохранение. Перезапустите приложение для восстановления.',
            );
            return;
          }
          unavailable = false;
        }
        const r = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: snapshot,
        });
        if (!r.ok) throw Error();
        if (stamp === saveStamp) storageNotice('Прогресс сохранён');
      } catch {
        dirty = true;
        storageNotice('Нет связи: прогресс сохранён на этом устройстве. Повторяем запись…');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 5000);
      }
    });
  return saveChain;
}
function active() {
  return !paused && !finished && !$('#games-page').hidden;
}
function record(n, key = game) {
  store.records[key] = Math.max(store.records[key] || 0, n);
  $('#game-record').textContent = 'Рекорд: ' + Math.floor(store.records[key]);
}
function put(s) {
  if (finished) return;
  store.states[game] = structuredClone(s);
  save();
}
function button(text, fn, parent = $('#game-controls'), cls = '') {
  const b = make('button', text, cls);
  b.type = 'button';
  b.onclick = fn;
  parent.append(b);
  return b;
}
function effects(freq = 660) {
  if (!sound || !active()) return;
  ac ||= new AudioContext();
  ac.resume().catch(() => {});
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.045, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);
  o.connect(g);
  g.connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.1);
}
function result(score, text, key = game) {
  finished = true;
  delete store.states[game];
  record(score, key);
  save();
  onPause(true);
  $('#game-pause').disabled = true;
  $('#game-board').inert = true;
  const box = make('div', undefined, 'game-result');
  box.append(make('strong', text), make('span', 'Результат: ' + score));
  button('Играть ещё', () => start(game, false), box, 'primary');
  $('#game-playroom').append(box);
  status(text);
}
function pause(value = !paused) {
  if (finished || !game) return;
  paused = value;
  $('#game-board').inert = paused;
  $('#game-pause').textContent = paused ? 'Продолжить' : 'Пауза';
  $('#game-playroom').classList.toggle('is-paused', paused);
  $('#game-pause-message').hidden = !paused;
  onPause(paused);
  if (paused) ac?.suspend();
}
function stop() {
  generation++;
  dispose();
  dispose = () => {};
  handle = () => {};
  onPause = () => {};
  checkpoint = () => {};
  ac?.suspend();
  $('#game-playroom').classList.remove('is-paused');
}
function directions(fn) {
  const box = make('div', undefined, 'direction-pad');
  for (const [label, d] of [
    ['↑', 'up'],
    ['←', 'left'],
    ['↓', 'down'],
    ['→', 'right'],
  ]) {
    const b = button(
      label,
      () => {
        if (active()) fn(d);
      },
      box,
    );
    b.setAttribute('aria-label', { up: 'Вверх', left: 'Влево', down: 'Вниз', right: 'Вправо' }[d]);
    b.dataset.direction = d;
  }
  $('#game-controls').append(box);
  return (e) => {
    const d = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      KeyA: 'left',
      KeyD: 'right',
      KeyW: 'up',
      KeyS: 'down',
    }[e.code];
    if (d) {
      e.preventDefault();
      fn(d);
      return true;
    }
    return false;
  };
}
function start(id, resume = true) {
  if (!catalog.some((c) => c[0] === id)) id = 'studio';
  stop();
  game = id;
  paused = false;
  finished = false;
  store.last = id;
  save();
  $('#game-menu').hidden = true;
  $('#game-playroom').hidden = false;
  $('#game-board').inert = false;
  $('#game-board').replaceChildren();
  $('#game-controls').replaceChildren();
  $('#game-playroom').querySelector('.game-result')?.remove();
  $('#game-pause-message').hidden = true;
  $('#game-pause').disabled = false;
  $('#game-pause').textContent = 'Пауза';
  const info = catalog.find((c) => c[0] === id);
  $('#game-name').textContent = info[1];
  $('#game-instructions').textContent = info[3] + ' ' + info[4];
  $('#game-record').textContent = 'Рекорд: ' + (store.records[id] || 0);
  const state = resume ? store.states[id] : null;
  ({ studio, snake, numbers, guess })[id === '2048' ? 'numbers' : id](state);
}
function studio(saved) {
  let s = studioState(saved || {});
  const offline = offlineIncome(s);
  checkpoint = () => put(s);
  const panel = make('div', undefined, 'studio-game'),
    hero = make('div', undefined, 'studio-scene'),
    stage = make('strong'),
    balance = make('b'),
    rate = make('span'),
    progress = make('progress'),
    next = make('small'),
    shop = make('div', undefined, 'studio-shop'),
    tasks = make('div', undefined, 'studio-tasks');
  hero.append(make('span', 'YOUR STUDIO', 'studio-wordmark'), stage, balance, rate, progress, next);
  panel.append(hero);
  const hit = button(
    'Записать дубль',
    () => {
      if (!active()) return;
      earn(s, studioClick(s));
      s.clicks++;
      hit.classList.remove('hit');
      void hit.offsetWidth;
      hit.classList.add('hit');
      update();
    },
    panel,
    'studio-earn',
  );
  panel.append(shop, make('h3', 'Следующая цель'), tasks);
  $('#game-board').append(panel);
  const shops = equipment.map((item, i) => {
    const b = button(
      '',
      () => {
        if (active() && buyEquipment(s, i)) {
          effects(440);
          update();
        }
      },
      shop,
    );
    const name = make('strong', item.name),
      detail = make('small', item.detail),
      price = make('span');
    b.append(name, detail, price);
    return { b, name, price };
  });
  const goals = [
    ['Первые 25 дублей', () => s.clicks >= 25, 50],
    ['100 дублей', () => s.clicks >= 100, 300],
    ['Первый пассивный доход', () => studioRate(s) >= 1, 100],
    ['Доход 25 / сек', () => studioRate(s) >= 25, 1500],
    ['Заработать 10 000', () => s.earned >= 10000, 2500],
    ['Доход 500 / сек', () => studioRate(s) >= 500, 25000],
  ];
  const taskRows = goals.map(([label, ready, reward], i) => {
    const b = button(
      '',
      () => {
        if (active() && ready() && !s.claimed.includes(i)) {
          s.claimed.push(i);
          earn(s, reward);
          effects(880);
          update();
        }
      },
      tasks,
    );
    return { b, label, ready, reward };
  });
  let last = performance.now(),
    accum = 0;
  function update() {
    const level = milestones.filter((v) => s.earned >= v).length - 1;
    stage.textContent = stages[level];
    hero.dataset.level = level;
    balance.textContent = Math.floor(s.coins).toLocaleString('ru-RU') + ' монет';
    rate.textContent =
      '+' + studioClick(s) + ' за дубль · ' + studioRate(s).toLocaleString('ru-RU') + ' / сек';
    hit.textContent = 'Записать дубль · +' + studioClick(s);
    const target = milestones[level + 1];
    progress.max = target ? target - milestones[level] : 1;
    progress.value = target ? s.earned - milestones[level] : 1;
    next.textContent = target
      ? 'До «' +
        stages[level + 1] +
        '»: ' +
        Math.ceil(target - s.earned).toLocaleString('ru-RU') +
        ' монет'
      : 'Высший этап студии! Развивайте оборудование дальше.';
    shops.forEach(({ b, name, price }, i) => {
      name.textContent = equipment[i].name + ' · ' + s.gear[i] + ' ур.';
      const cost = studioPrice(s, i);
      price.textContent =
        s.gear[i] >= 100 ? 'Максимальный уровень' : cost.toLocaleString('ru-RU') + ' монет';
      b.disabled = s.coins < cost || s.gear[i] >= 100;
    });
    taskRows.forEach(({ b, label, ready, reward }, i) => {
      b.textContent = label + ' · ' + (s.claimed.includes(i) ? 'Выполнено' : 'Награда ' + reward);
      b.disabled = s.claimed.includes(i) || !ready();
    });
    s.updated = Date.now();
    record(s.earned);
    put(s);
  }
  const timer = setInterval(() => {
    const now = performance.now(),
      dt = Math.min(5, (now - last) / 1000);
    last = now;
    if (!active()) return;
    earn(s, studioRate(s) * dt);
    accum += dt;
    if (accum >= 0.25) {
      accum = 0;
      update();
    }
  }, 100);
  dispose = () => {
    clearInterval(timer);
    s.updated = Date.now();
    put(s);
  };
  onPause = () => {
    last = performance.now();
    s.updated = Date.now();
    put(s);
  };
  handle = (e) => {
    if (['Space', 'Enter'].includes(e.code) && (!e.target.closest('button') || e.target === hit)) {
      e.preventDefault();
      if (!e.repeat) hit.click();
    }
  };
  update();
  status(
    offline >= 1
      ? 'Пока вас не было: +' + Math.floor(offline) + ' монет. Офлайн: 25% дохода, максимум 2 часа.'
      : 'Покупайте оборудование и забирайте награды за цели. Офлайн: 25% дохода, до 2 часов.',
  );
}
function numbers(saved) {
  let s = valid2048(saved)
      ? structuredClone(saved)
      : { board: Array(16).fill(0), score: 0, won: false },
    undo = null,
    locked = false,
    timer,
    commit;
  const board = make('div', undefined, 'number-board');
  board.setAttribute('aria-label', 'Поле 2048');
  board.setAttribute('role', 'group');
  $('#game-board').append(board);
  const background = make('div', undefined, 'number-background');
  for (let i = 0; i < 16; i++) background.append(make('div'));
  board.append(background);
  const layer = make('div', undefined, 'number-tiles');
  board.append(layer);
  const undoButton = button('Отменить ход · Z', () => {
    if (!undo || paused || locked) return;
    s = undo;
    undo = null;
    finished = false;
    $('#game-board').inert = false;
    $('#game-pause').disabled = false;
    $('#game-playroom').querySelector('.game-result')?.remove();
    draw();
  });
  function add() {
    const empty = s.board.flatMap((v, i) => (v ? [] : [i]));
    if (!empty.length) return -1;
    const i = empty[Math.floor(Math.random() * empty.length)];
    s.board[i] = Math.random() < 0.9 ? 2 : 4;
    return i;
  }
  if (!valid2048(saved)) {
    add();
    add();
  }
  function draw(fresh = -1, merged = []) {
    layer.replaceChildren();
    s.board.forEach((value, i) => {
      if (!value) return;
      const tile = make('div', value, 'number-tile' + (i === fresh ? ' fresh' : ''));
      tile.style.left = 'calc(' + (i % 4) + ' * (100% + 8px) / 4)';
      tile.style.top = 'calc(' + Math.floor(i / 4) + ' * (100% + 8px) / 4)';
      tile.classList.toggle('merged', merged.includes(i));
      tile.dataset.value = value;
      tile.style.setProperty('--tile-hue', String(42 + Math.log2(value) * 10));
      if (value >= 1024) tile.classList.add('small-number');
      tile.dataset.index = i;
      layer.append(tile);
    });
    undoButton.disabled = !undo;
    status(
      'Счёт: ' + s.score.toLocaleString('ru-RU') + ' · цель 2048' + (s.won ? ' достигнута!' : ''),
    );
    record(s.score);
    put(s);
  }
  function move(d) {
    if (!active() || locked) return;
    const r = slide2048(s.board, d);
    if (!r.moved) return;
    undo = structuredClone(s);
    const plan = movePlan(s.board, d),
      size = (board.clientWidth + 8) / 4;
    locked = true;
    for (const m of plan) {
      const tile = layer.querySelector('[data-index=\"' + m.from + '\"]');
      if (tile)
        tile.style.transform =
          'translate(' +
          ((m.to % 4) - (m.from % 4)) * size +
          'px,' +
          (Math.floor(m.to / 4) - Math.floor(m.from / 4)) * size +
          'px)';
    }
    commit = () => {
      s.board = r.board;
      s.score += r.score;
      const fresh = add();
      locked = false;
      commit = null;
      const firstWin = !s.won && s.board.some((v) => v >= 2048);
      if (firstWin) {
        s.won = true;
        effects(880);
      }
      draw(
        fresh,
        plan
          .filter((move, i) => plan.some((other, j) => j !== i && other.to === move.to))
          .map((move) => move.to),
      );
      if (firstWin) status('2048! Цель достигнута — можно продолжать партию. Счёт: ' + s.score);
      if (['left', 'right', 'up', 'down'].every((dir) => !slide2048(s.board, dir).moved))
        result(s.score, 'Ходов больше нет');
    };
    timer = setTimeout(commit, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150);
  }
  const arrows = directions(move);
  handle = (e) => {
    if (e.code === 'KeyZ') {
      e.preventDefault();
      undoButton.click();
    } else arrows(e);
  };
  let touch;
  board.onpointerdown = (e) => {
    touch = [e.clientX, e.clientY];
  };
  board.onpointerup = (e) => {
    if (!touch) return;
    const dx = e.clientX - touch[0],
      dy = e.clientY - touch[1];
    touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 25)
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  draw();
  checkpoint = () => {
    clearTimeout(timer);
    commit?.();
    put(s);
  };
  dispose = checkpoint;
}
function snake(saved) {
  let s = validSnake(saved) ? structuredClone(saved) : newSnake(),
    queue = [],
    started = false,
    countdown = 3,
    countTime = 0,
    accum = 0,
    last = performance.now(),
    frame,
    previous = s.body.map((p) => p.slice());
  const speeds = { calm: 230, normal: 160, fast: 105 };
  if (!speeds[s.speed]) s.speed = 'normal';
  const wrapper = make('div', undefined, 'snake-field'),
    canvas = make('canvas'),
    overlay = make('div', undefined, 'snake-overlay');
  canvas.width = 640;
  canvas.height = 640;
  canvas.setAttribute('aria-label', 'Змейка, поле 16 на 16');
  wrapper.append(canvas, overlay);
  $('#game-board').append(wrapper);
  const x = canvas.getContext('2d');
  const speed = make('select');
  speed.setAttribute('aria-label', 'Скорость змейки');
  for (const [value, label] of [
    ['calm', 'Спокойно'],
    ['normal', 'Обычно'],
    ['fast', 'Быстро'],
  ]) {
    const o = make('option', label);
    o.value = value;
    speed.append(o);
  }
  speed.value = s.speed;
  const showRecord = () => {
    $('#game-record').textContent = 'Рекорд: ' + (store.records['snake-' + s.speed] || 0);
  };
  showRecord();
  checkpoint = () => put(s);
  speed.onchange = () => {
    s.speed = speed.value;
    showRecord();
    put(s);
  };
  $('#game-controls').append(speed);
  const begin = button('Начать', () => {
    if (!active() || started) return;
    started = true;
    speed.disabled = true;
    begin.hidden = true;
    countdown = 3;
    countTime = 0;
    last = performance.now();
  });
  const turn = (d) => {
    const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d],
      base = queue.at(-1) || s.dir;
    if (
      queue.length < 2 &&
      (v[0] !== base[0] || v[1] !== base[1]) &&
      (v[0] !== -base[0] || v[1] !== -base[1])
    )
      queue.push(v);
  };
  const arrows = directions(turn);
  handle = (e) => {
    if (e.code === 'Space' && !started) {
      e.preventDefault();
      begin.click();
    } else arrows(e);
  };
  function draw() {
    x.fillStyle = '#11171b';
    x.fillRect(0, 0, 640, 640);
    x.strokeStyle = '#ffffff07';
    x.lineWidth = 1;
    for (let i = 1; i < 16; i++) {
      x.beginPath();
      x.moveTo(i * 40, 0);
      x.lineTo(i * 40, 640);
      x.moveTo(0, i * 40);
      x.lineTo(640, i * 40);
      x.stroke();
    }
    x.fillStyle = '#ffb56b';
    x.beginPath();
    x.arc(s.food[0] * 40 + 20, s.food[1] * 40 + 20, 11, 0, Math.PI * 2);
    x.fill();
    const fraction = started && countdown === 0 ? Math.min(1, accum / speeds[s.speed]) : 1;
    s.body.forEach(([a, b], i) => {
      const old = previous[i] || [a, b],
        px = (old[0] + (a - old[0]) * fraction) * 40 + 4,
        py = (old[1] + (b - old[1]) * fraction) * 40 + 4;
      x.fillStyle = i ? '#5caa9f' : '#b8ebd7';
      x.beginPath();
      x.roundRect(px, py, 32, 32, i ? 9 : 11);
      x.fill();
      if (!i) {
        x.fillStyle = '#19342e';
        x.beginPath();
        x.arc(
          px + 16 + s.dir[0] * 7 - s.dir[1] * 6,
          py + 16 + s.dir[1] * 7 + s.dir[0] * 6,
          2.5,
          0,
          7,
        );
        x.arc(
          px + 16 + s.dir[0] * 7 + s.dir[1] * 6,
          py + 16 + s.dir[1] * 7 - s.dir[0] * 6,
          2.5,
          0,
          7,
        );
        x.fill();
      }
    });
    overlay.hidden = started && countdown === 0;
    const overlayLabel = !started ? 'Выберите скорость и нажмите «Начать»' : String(countdown);
    if (overlay.textContent !== overlayLabel) overlay.textContent = overlayLabel;
  }
  function loop(now) {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(100, now - last);
    last = now;
    if (active() && started) {
      if (countdown > 0) {
        countTime += dt;
        if (countTime >= 1000) {
          countTime -= 1000;
          countdown--;
        }
      } else {
        accum += dt;
        if (accum >= speeds[s.speed]) {
          accum -= speeds[s.speed];
          previous = s.body.map((p) => p.slice());
          const r = stepSnake(s, queue.shift() || s.dir);
          if (r.dead) {
            result(s.score, 'Столкновение', 'snake-' + s.speed);
            return;
          }
          if (r.eating) effects();
          put(s);
          status('Очки: ' + s.score + ' · длина: ' + s.body.length + '/256');
          if (r.won) {
            draw();
            result(s.score, 'Всё поле заполнено!', 'snake-' + s.speed);
            return;
          }
        }
      }
    }
    draw();
  }
  onPause = () => {
    last = performance.now();
  };
  dispose = () => {
    cancelAnimationFrame(frame);
    put(s);
  };
  status('Собирайте ноты. Чем длиннее змейка, тем важнее планировать повороты.');
  draw();
  frame = requestAnimationFrame(loop);
}
function guess() {
  const library = guessLibrary(ctx.jobs());
  if (library.length < 2) {
    status(
      'Нужны хотя бы два разных трека. Копии и фрагменты одной записи считаются одним треком.',
    );
    return;
  }
  const targets = shuffle(library).slice(0, 5);
  let index = 0,
    score = 0,
    answered = 0,
    media,
    loadTimer,
    ready = false,
    heard = false,
    revealed = false,
    startTime = 0,
    length = 5,
    segmentTimer,
    token = 0,
    nextAction,
    playRequest = 0;
  const panel = make('div', undefined, 'guess-game'),
    round = make('strong'),
    feedback = make('p', undefined, 'guess-feedback'),
    choices = make('div', undefined, 'guess-choices'),
    settings = make('div', undefined, 'guess-settings');
  const lengthSelect = make('select');
  lengthSelect.setAttribute('aria-label', 'Длительность фрагмента');
  for (const n of [3, 5, 8]) {
    const o = make('option', n + ' секунд');
    o.value = n;
    lengthSelect.append(o);
  }
  lengthSelect.value = 5;
  const volume = make('input');
  volume.type = 'range';
  volume.min = 0;
  volume.max = 1;
  volume.step = 0.01;
  volume.value = localStorage.getItem('guess-volume') || '.65';
  volume.setAttribute('aria-label', 'Громкость угадай трек');
  const volumeText = make('span');
  function setVolume() {
    if (media) media.volume = +volume.value;
    volume.style.setProperty('--range-fill', +volume.value * 100 + '%');
    volumeText.textContent = Math.round(+volume.value * 100) + '%';
    localStorage.setItem('guess-volume', volume.value);
  }
  volume.oninput = setVolume;
  volume.addEventListener(
    'wheel',
    (e) => {
      if (!e.deltaY) return;
      e.preventDefault();
      volume.value = Math.max(0, Math.min(1, +volume.value - Math.sign(e.deltaY) * 0.05));
      setVolume();
    },
    { passive: false },
  );
  settings.append(
    make('span', 'Фрагмент'),
    lengthSelect,
    make('span', 'Громкость'),
    volume,
    volumeText,
  );
  panel.append(round, settings);
  const listen = button('Загрузка фрагмента…', play, panel, 'guess-listen primary');
  listen.disabled = true;
  panel.append(choices, feedback);
  $('#game-board').append(panel);
  const next = button('Следующий раунд', () => nextAction?.());
  next.hidden = true;
  function stopAudio() {
    clearTimeout(loadTimer);
    clearTimeout(segmentTimer);
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
  }
  function play() {
    if (!active() || !ready) return;
    ctx.onSound();
    window.dispatchEvent(new CustomEvent('yoump3-audio-start', { detail: 'game' }));
    media.pause();
    media.currentTime = startTime;
    lengthSelect.disabled = true;
    heard = true;
    const request = ++playRequest,
      roundToken = token;
    media
      .play()
      .then(() => {
        if (request !== playRequest || roundToken !== token || !active()) return;
        listen.textContent = 'Повторить фрагмент · пробел';
        clearTimeout(segmentTimer);
        segmentTimer = setTimeout(() => media.pause(), length * 1000);
        [...choices.children].forEach((b) => (b.disabled = revealed));
      })
      .catch((error) => {
        if (
          error.name !== 'AbortError' &&
          request === playRequest &&
          roundToken === token &&
          active()
        )
          failure();
      });
  }
  function failure() {
    clearTimeout(loadTimer);
    ready = false;
    listen.disabled = true;
    feedback.textContent =
      'Файл недоступен или формат не поддерживается. Этот раунд не засчитывается.';
    next.hidden = false;
    next.textContent = 'Пропустить';
    nextAction = advance;
  }
  function advance() {
    if (!active()) return;
    index++;
    if (index >= targets.length) {
      stopAudio();
      return result(score, 'Верно ' + score + ' из ' + answered + ' ответов');
    }
    load();
  }
  function load() {
    stopAudio();
    const current = ++token;
    ready = false;
    heard = false;
    revealed = false;
    next.hidden = true;
    lengthSelect.disabled = false;
    feedback.textContent = '';
    round.textContent = 'Раунд ' + (index + 1) + ' из ' + targets.length;
    const correct = targets[index],
      options = shuffle([
        correct,
        ...shuffle(library.filter((j) => j.id !== correct.id)).slice(0, 3),
      ]);
    choices.replaceChildren();
    options.forEach((j, i) => {
      const b = button(
        i + 1 + '. ' + j.title + (j.artist ? ' — ' + j.artist : ''),
        () => answer(j),
        choices,
      );
      b.disabled = true;
    });
    media = new Audio('/api/stream/' + correct.id);
    media.preload = 'metadata';
    setVolume();
    media.onloadedmetadata = () => {
      if (current !== token) return;
      clearTimeout(loadTimer);
      if (!Number.isFinite(media.duration) || media.duration <= 0) return failure();
      length = Math.min(+lengthSelect.value, media.duration);
      startTime = Math.random() * Math.max(0, media.duration - length - 0.1);
      ready = true;
      listen.disabled = false;
      listen.textContent = 'Послушать ' + length.toFixed(length % 1 ? 1 : 0) + ' секунд · пробел';
    };
    media.onerror = () => {
      if (current === token) failure();
    };
    media.ontimeupdate = () => {
      if (media.currentTime >= startTime + length) media.pause();
    };
    listen.disabled = true;
    listen.textContent = 'Загрузка фрагмента…';
    loadTimer = setTimeout(() => {
      if (current === token && !ready) failure();
    }, 12000);
    nextAction = advance;
    function answer(j) {
      if (!active() || !heard || revealed) return;
      revealed = true;
      answered++;
      const good = j.id === correct.id;
      if (good) {
        score++;
        effects(880);
      }
      media.pause();
      clearTimeout(segmentTimer);
      feedback.textContent = good
        ? 'Верно! ' + correct.title
        : 'Это «' + correct.title + '»' + (correct.artist ? ' — ' + correct.artist : '');
      feedback.className = 'guess-feedback ' + (good ? 'correct' : 'incorrect');
      [...choices.children].forEach((b, i) => {
        b.disabled = true;
        b.classList.toggle('correct', options[i].id === correct.id);
      });
      lengthSelect.disabled = true;
      next.hidden = false;
      next.textContent = index === targets.length - 1 ? 'Результат' : 'Следующий раунд';
    }
  }
  lengthSelect.onchange = () => {
    if (ready && !heard) {
      length = Math.min(+lengthSelect.value, media.duration);
      startTime = Math.min(startTime, Math.max(0, media.duration - length));
      listen.textContent = 'Послушать ' + length + ' секунд · пробел';
    }
  };
  handle = (e) => {
    if (e.code === 'Space' && !e.target.matches('input,select')) {
      e.preventDefault();
      play();
    } else if (/^Digit[1-4]$/.test(e.code)) {
      e.preventDefault();
      choices.children[+e.code.slice(-1) - 1]?.click();
    } else if (e.code === 'Enter' && !next.hidden && !e.target.closest('button')) {
      e.preventDefault();
      next.click();
    }
  };
  onPause = (value) => {
    if (value) {
      clearTimeout(segmentTimer);
      media?.pause();
    }
  };
  dispose = () => {
    token++;
    stopAudio();
  };
  load();
  status('Послушайте фрагмент, выберите ответ, затем перейдите дальше.');
}
export async function initGames(context) {
  ctx = context;
  let local;
  try {
    local = JSON.parse(localStorage.getItem('yoump3-games') || 'null');
  } catch {}
  try {
    const r = await fetch('/api/games');
    if (!r.ok) throw Error();
    const remote = await r.json();
    store = local?.updated > remote.updated ? local : remote;
  } catch {
    store = local || store;
    recoveryBase = local?.updated || 0;
    unavailable = true;
  }
  if (!store || typeof store !== 'object') store = {};
  store = {
    schema: 2,
    records: store.records && typeof store.records === 'object' ? store.records : {},
    states: store.states && typeof store.states === 'object' ? store.states : {},
    last: store.last,
    updated: store.updated,
  };
  for (const id of Object.keys(store.states))
    if (!catalog.some((c) => c[0] === id)) delete store.states[id];
  store.records = Object.fromEntries(
    Object.entries(store.records).filter(
      ([k, v]) =>
        /^(studio|2048|guess|snake(?:-(calm|normal|fast))?)$/.test(k) &&
        Number.isFinite(v) &&
        v >= 0,
    ),
  );
  if (store.records.snake && !store.records['snake-normal'])
    store.records['snake-normal'] = store.records.snake;
  if (store.states.studio) store.states.studio = studioState(store.states.studio);
  if (store.states.snake && !validSnake(store.states.snake)) delete store.states.snake;
  if (store.states['2048'] && !valid2048(store.states['2048'])) delete store.states['2048'];
  delete store.states.guess;
  const instructions = make('p', undefined, 'game-instructions');
  instructions.id = 'game-instructions';
  $('#game-status').before(instructions);
  const saveStatus = make('small', 'Прогресс сохраняется автоматически', 'game-save-status');
  saveStatus.id = 'game-save-status';
  $('#game-controls').after(saveStatus);
  const pausedMessage = make('div', 'Пауза — нажмите «Продолжить» или P', 'game-pause-message');
  pausedMessage.id = 'game-pause-message';
  pausedMessage.hidden = true;
  $('#game-status').after(pausedMessage);
  const menu = $('#game-menu');
  menu.replaceChildren();
  for (const [id, title, description, rules, controls] of catalog) {
    const b = button('', () => start(id), menu, 'game-card');
    b.dataset.game = id;
    b.append(
      make('span', { studio: '01', snake: '02', 2048: '03', guess: '04' }[id], 'game-icon'),
      make('strong', title),
      make('small', description),
    );
  }
  $('#game-home').onclick = () => {
    stop();
    game = '';
    $('#game-playroom').hidden = true;
    menu.hidden = false;
    flush();
  };
  $('#game-resume').onclick = () => start(store.last);
  $('#game-restart').onclick = () => {
    if (!finished && !confirm('Начать заново? Прогресс текущей партии будет сброшен.')) return;
    delete store.states[game];
    start(game, false);
  };
  $('#game-pause').onclick = () => pause();
  $('#game-sound').checked = localStorage.getItem('game-effects') === 'true';
  sound = $('#game-sound').checked;
  $('#game-sound').onchange = () => {
    sound = $('#game-sound').checked;
    localStorage.setItem('game-effects', sound);
    if (sound) ctx.onSound();
    else ac?.suspend();
  };
  window.addEventListener('keydown', (e) => {
    if (
      $('#games-page').hidden ||
      !game ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      document.querySelector('dialog[open]') ||
      e.target.matches('input,textarea,select') ||
      e.target.closest('.custom-select')
    )
      return;
    if (e.code === 'KeyP') {
      e.preventDefault();
      pause();
      return;
    }
    if (active() || (game === '2048' && finished && e.code === 'KeyZ')) handle(e);
  });
  new MutationObserver(() => {
    if (document.querySelector('dialog[open]') && active()) pause(true);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('blur', () => {
    if (active()) pause(true);
  });
  new MutationObserver(() => {
    if ($('#games-page').hidden && game) pause(true);
  }).observe($('#games-page'), { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('yoump3-audio-start', (e) => {
    if (e.detail !== 'game' && active() && (e.detail === 'backup' || game === 'guess' || sound))
      pause(true);
  });
  window.yoump3FlushGames = async () => {
    checkpoint();
    await flush();
    await saveChain;
  };
  window.yoump3RestoreGames = async () => {
    stop();
    dirty = false;
    clearTimeout(saveTimer);
    const r = await fetch('/api/games');
    if (r.ok) {
      store = await r.json();
      localSave();
      game = '';
      $('#game-playroom').hidden = true;
      $('#game-menu').hidden = false;
      storageNotice('Сохранения восстановлены.');
    }
  };
  window.addEventListener('pagehide', () => {
    dispose();
    localSave();
    navigator.sendBeacon(
      '/api/games',
      new Blob([JSON.stringify(store)], { type: 'application/json' }),
    );
  });
  storageNotice(
    unavailable ? 'Нет связи: используем локальную копию' : 'Прогресс сохраняется автоматически',
  );
}
