import { createIcon as icon } from './icons.js';
import { renderLibrary } from './library-view.js';
const $ = (s) => document.querySelector(s),
  all = (s) => [...document.querySelectorAll(s)];
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const read = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
function button(text, fn, cls = '', symbol) {
  const b = el('button', undefined, cls);
  b.type = 'button';
  if (symbol) b.append(icon(symbol));
  if (text) b.append(el('span', text));
  b.onclick = fn;
  return b;
}
function iconButton(symbol, label, fn) {
  const b = button('', fn, 'icon-button', symbol);
  b.title = label;
  b.setAttribute('aria-label', label);
  return b;
}
export function ask(title, message, options = {}) {
  return new Promise((resolve) => {
    const d = el('dialog', undefined, 'action-dialog'),
      form = el('form'),
      p = el('p', message),
      actions = el('div', undefined, 'dialog-actions');
    form.append(el('h2', title), p);
    let input;
    if (options.input !== undefined) {
      input = el('input');
      input.value = options.input;
      input.maxLength = options.maxLength || 200;
      input.setAttribute('aria-label', options.label || title);
      form.append(input);
    }
    actions.append(
      button('Отмена', () => d.close()),
      button(options.confirm || 'Продолжить', () => form.requestSubmit(), 'primary'),
    );
    form.append(actions);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (input && !input.value.trim()) return;
      d.returnValue = 'yes';
      d.close('yes');
    };
    d.append(form);
    document.body.append(d);
    d.addEventListener(
      'close',
      () => {
        const result = d.returnValue === 'yes' ? (input ? input.value.trim() : true) : false;
        d.remove();
        resolve(result);
      },
      { once: true },
    );
    d.showModal();
    input?.focus();
  });
}
let popup = null;
function closePopup(focus = false) {
  if (!popup) return;
  const current = popup;
  popup = null;
  current.node.classList.add('closing');
  current.owner?.setAttribute('aria-expanded', 'false');
  if (focus) current.owner?.focus();
  setTimeout(() => current.node.remove(), 130);
}
function positionPopup(node, anchor) {
  const r = anchor.getBoundingClientRect(),
    height = Math.min(node.scrollHeight, 280, innerHeight - 30),
    width = Math.max(r.width, 190);
  node.style.width = Math.min(width, innerWidth - 20) + 'px';
  node.style.maxHeight = height + 'px';
  node.style.left = Math.max(10, Math.min(innerWidth - width - 10, r.left)) + 'px';
  node.style.top =
    (r.bottom + height + 10 < innerHeight ? r.bottom + 7 : Math.max(10, r.top - height - 7)) + 'px';
}
export function enhanceSelects() {
  for (const select of all('select:not([data-enhanced])').filter((s) => !s.hidden)) {
    select.dataset.enhanced = 'true';
    const wrap = el('span', undefined, 'custom-select'),
      trigger = button('', () => open(), 'select-trigger');
    select.before(wrap);
    wrap.append(select, trigger);
    select.hidden = true;
    select.tabIndex = -1;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const sync = () => {
      trigger.replaceChildren(
        el('span', select.selectedOptions[0]?.textContent || 'Выбрать'),
        icon('chevron'),
      );
      trigger.disabled = select.disabled;
      trigger.setAttribute(
        'aria-label',
        select.getAttribute('aria-label') || select.closest('label')?.textContent || select.id,
      );
    };
    sync();
    select.addEventListener('change', sync);
    const observer = new MutationObserver(sync);
    observer.observe(select, { attributes: true, childList: true, subtree: true });
    function open() {
      if (popup?.owner === trigger) return closePopup(true);
      closePopup();
      const list = el('div', undefined, 'select-popup');
      list.id = 'select-' + select.id + '-' + Math.random().toString(36).slice(2);
      list.setAttribute('role', 'listbox');
      trigger.setAttribute('aria-controls', list.id);
      trigger.setAttribute('aria-expanded', 'true');
      for (const option of select.options) {
        const b = button(
          option.textContent,
          () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            closePopup(true);
          },
          'select-option',
        );
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(option.selected));
        b.disabled = option.disabled;
        b.dataset.value = option.value;
        if (option.selected) b.append(icon('check'));
        list.append(b);
      }
      (select.closest('dialog') || document.body).append(list);
      positionPopup(list, trigger);
      popup = { node: list, owner: trigger };
      const selected =
        list.querySelector('[aria-selected=true]') || list.querySelector('button:not(:disabled)');
      selected?.focus();
      selected?.scrollIntoView({ block: 'nearest' });
      list.onkeydown = (e) => {
        const options = [...list.querySelectorAll('button:not(:disabled)')],
          i = options.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          options[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? options.length - 1
                : (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
          ]?.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closePopup(true);
        } else if (e.key === 'Tab') closePopup();
      };
    }
    trigger.onkeydown = (e) => {
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        open();
      }
    };
  }
}
document.addEventListener('pointerdown', (e) => {
  if (popup && !popup.node.contains(e.target) && !popup.owner?.contains(e.target)) closePopup();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopup(true);
});
window.addEventListener('resize', () => closePopup());
export function installWorkspace(ctx) {
  let selected = new Set(),
    view = read('library-view', 'grid'),
    collections = read('collections', {}),
    signature = '',
    inspectorSig = '',
    restored = false,
    currentList = [],
    queue = read('play-queue', []),
    manualQueue = false,
    repeat = read('repeat', 'off'),
    shuffle = read('shuffle', false),
    ab = { a: null, b: null, on: false },
    online = null,
    onlineQueue = [],
    widget = null,
    onlinePaused = true,
    onlineDuration = 0,
    onlinePosition = 0,
    onlineToken = 0;
  const prefs = read('workspace-state', {}),
    filters = prefs.filters || {},
    positionByTrack = read('track-positions', {});
  let markSaved = 0;
  const api = ctx.api,
    post = (url, data = {}) =>
      api(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    toast = ctx.toast,
    report = ctx.report;
  const guard = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      report(e);
    }
  };
  const shuffled = (items) => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const live = () => ctx.jobs().filter((j) => !j.deletedAt),
    job = (id) => live().find((j) => j.id === id);
  const tools = el('div', undefined, 'library-extra'),
    views = el('div', undefined, 'view-switch');
  for (const [id, label] of [
    ['grid', 'Обложки'],
    ['list', 'Список'],
    ['table', 'Таблица'],
  ])
    views.append(
      iconButton(id, label, () => {
        view = id;
        write('library-view', view);
        signature = '';
        render();
      }),
    );
  const collection = el('select');
  collection.id = 'collection-filter';
  collection.setAttribute('aria-label', 'Подборка');
  function collectionOptions() {
    const value = collection.value;
    collection.replaceChildren(
      new Option('Все подборки', ''),
      ...Object.keys(collections).map((name) => new Option(name, name)),
    );
    collection.value = value;
  }
  collectionOptions();
  collection.value = prefs.collection || '';
  collection.onchange = () => {
    signature = '';
    savePreferences();
    render();
  };
  tools.append(
    views,
    collection,
    button(
      'Новая подборка',
      guard(async () => {
        const name = await ask('Новая подборка', 'Название вашей подборки', {
          input: '',
          confirm: 'Создать',
          maxLength: 60,
        });
        if (!name) return;
        collections[name] ||= [];
        write('collections', collections);
        collectionOptions();
        collection.value = name;
        signature = '';
        render();
      }),
      'text-button',
      'plus',
    ),
  );
  const filterToggle = button(
    'Фильтры',
    () => {
      filterRow.hidden = !filterRow.hidden;
    },
    'text-button',
  );
  tools.append(filterToggle);
  $('.library-tools').after(tools);
  const filterRow = el('div', undefined, 'advanced-filters');
  filterRow.hidden = true;
  for (const [id, label, placeholder] of [
    ['bpmMin', 'BPM от', '60'],
    ['bpmMax', 'BPM до', '180'],
    ['key', 'Тональность', 'F# minor'],
    ['durationMin', 'Длина от, сек', '0'],
    ['durationMax', 'Длина до, сек', '300'],
  ]) {
    const labelNode = el('label', label),
      input = el('input');
    input.id = 'filter-' + id;
    input.type = id === 'key' ? 'text' : 'number';
    if (id !== 'key') {
      input.min = 0;
      input.max = 86400;
    }
    input.placeholder = placeholder;
    input.value = filters[id] || '';
    input.oninput = () => {
      filters[id] = input.value;
      signature = '';
      savePreferences();
      render();
    };
    labelNode.append(input);
    filterRow.append(labelNode);
  }
  filterRow.append(
    button(
      'Сбросить',
      () => {
        for (const input of filterRow.querySelectorAll('input')) input.value = '';
        for (const key of Object.keys(filters)) delete filters[key];
        signature = '';
        savePreferences();
        render();
      },
      'text-button',
    ),
  );
  tools.after(filterRow);
  const bulk = el('div', undefined, 'bulk-actions');
  bulk.hidden = true;
  const count = el('strong');
  bulk.append(
    count,
    button('Все', () => {
      selected = new Set(currentList.map((j) => j.id));
      signature = '';
      render();
    }),
    button(
      'Теги',
      guard(async () => {
        const text = await ask(
          'Теги выбранных треков',
          'Теги через запятую. Они добавятся к существующим.',
          { input: '', confirm: 'Добавить' },
        );
        if (text === false) return;
        for (const id of selected) {
          const j = job(id);
          if (j) await post('/api/edit/' + id, { tags: [...(j.tags || []), ...text.split(',')] });
        }
        await ctx.refresh();
      }),
    ),
    button(
      'В подборку',
      guard(async () => {
        const name = await ask(
          'Добавить в подборку',
          'Укажите существующее название или создайте новое',
          { input: collection.value, confirm: 'Добавить', maxLength: 60 },
        );
        if (!name) return;
        collections[name] = [...new Set([...(collections[name] || []), ...selected])];
        write('collections', collections);
        collectionOptions();
        toast('Треки добавлены в «' + name + '»');
      }),
    ),
    button(
      'Экспорт',
      guard(async () => {
        const ids = [...selected];
        if (!ids.length) return;
        if (window.desktop?.exportTracks) {
          const result = await window.desktop.exportTracks(ids);
          if (result) toast('Экспортировано: ' + result.count);
          return;
        }
        for (const id of ids) {
          const a = el('a');
          a.href = '/api/files/' + id;
          a.download = '';
          document.body.append(a);
          a.click();
          a.remove();
          await new Promise((r) => setTimeout(r, 250));
        }
      }),
    ),
    button(
      'Удалить',
      guard(async () => {
        if (
          await ask('Удалить выбранные треки?', 'Их можно восстановить в настройках хранилища.', {
            confirm: 'Удалить',
          })
        )
          await trash([...selected]);
      }),
      'danger',
    ),
    iconButton('close', 'Снять выделение', () => {
      selected.clear();
      signature = '';
      render();
    }),
  );
  filterRow.after(bulk);
  $('#import').multiple = true;
  $('#import').onchange = async () => {
    await importFiles([...$('#import').files]);
    $('#import').value = '';
  };
  async function importFiles(files) {
    let good = 0;
    for (const f of files) {
      try {
        if (f.size > 200 * 1048576) throw Error(f.name + ': максимум 200 МБ');
        await api('/api/import?name=' + encodeURIComponent(f.name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: f,
        });
        good++;
      } catch (e) {
        report(e);
      }
    }
    await ctx.refresh();
    if (good) toast('Добавлено файлов: ' + good);
  }
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      document.body.classList.add('file-drag');
    }
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('file-drag');
  });
  document.addEventListener('drop', (e) => {
    document.body.classList.remove('file-drag');
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      importFiles([...e.dataTransfer.files]);
    }
  });
  function savePreferences() {
    write('workspace-state', {
      filters,
      collection: collection.value,
      query: $('#search').value,
      sort: $('#sort').value,
      source: $('#filter').value,
      page: ctx.pageName(),
    });
  }
  $('#search').value = prefs.query || '';
  $('#sort').value = prefs.sort || 'new';
  $('#filter').value = prefs.source || '';
  function getList() {
    const q = $('#search').value.toLocaleLowerCase(),
      source = $('#filter').value;
    const list = live().filter((j) => {
      const m = ctx.music(j),
        key = (m.key || '') + ' ' + (m.scale || '');
      return (
        (!source || j.service === source) &&
        (!$('#favorites').checked || j.favorite) &&
        (!collection.value || (collections[collection.value] || []).includes(j.id)) &&
        [j.title, j.artist, j.url, ...(j.tags || [])]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(q) &&
        (!filters.bpmMin || m.bpm >= +filters.bpmMin) &&
        (!filters.bpmMax || (m.bpm && m.bpm <= +filters.bpmMax)) &&
        (!filters.key || key.toLowerCase().includes(filters.key.toLowerCase())) &&
        (!filters.durationMin || j.duration >= +filters.durationMin) &&
        (!filters.durationMax || j.duration <= +filters.durationMax)
      );
    });
    return list.sort(
      $('#sort').value === 'title'
        ? (a, b) => a.title.localeCompare(b.title, 'ru')
        : $('#sort').value === 'old'
          ? (a, b) => a.created - b.created
          : (a, b) => b.created - a.created,
    );
  }
  async function trash(ids) {
    const done = [];
    for (const id of ids) {
      try {
        await post('/api/trash/' + id);
      } catch (error) {
        report(error);
        continue;
      }
      done.push(id);
      selected.delete(id);
      if (ctx.playing() === id) {
        ctx.audio.pause();
        ctx.audio.removeAttribute('src');
        ctx.clearPlaying();
      }
    }
    queue = queue.filter((id) => !done.includes(id));
    write('play-queue', queue);
    signature = '';
    inspectorSig = '';
    await ctx.refresh();
    if (!done.length) return;
    const n = el('div', undefined, 'undo-toast');
    n.append(
      el('span', 'Удалено: ' + done.length),
      button(
        'Отменить',
        guard(async () => {
          for (const id of done) await post('/api/restore/' + id);
          n.remove();
          await ctx.refresh();
        }),
      ),
    );
    document.body.append(n);
    setTimeout(() => n.remove(), 12000);
  }
  function trackMenu(j, anchor) {
    closePopup();
    const menu = el('div', undefined, 'select-popup action-popup');
    for (const [title, fn] of [
      ['Слушать', () => play(j)],
      ['Включить следующим', () => enqueue(j)],
      ['Обрезать трек', () => ctx.trim(j)],
      ['Изменить данные', () => ctx.action(j, 'Теги файла')],
      ['Удалить из библиотеки', () => trash([j.id])],
    ])
      menu.append(
        button(
          title,
          guard(async () => {
            closePopup();
            await fn();
          }),
        ),
      );
    document.body.append(menu);
    positionPopup(menu, anchor);
    popup = { node: menu, owner: anchor };
  }
  function renderInspector() {
    const j = job(ctx.inspected()) || live().find((j) => j.status === 'done'),
      panel = $('#track-inspector'),
      sig = JSON.stringify(j);
    if (inspectorSig === sig) return;
    inspectorSig = sig;
    panel.replaceChildren();
    if (!j) {
      panel.append(
        el('h2', 'Ваши треки'),
        el('p', 'Выберите трек в библиотеке, чтобы посмотреть детали.', 'muted'),
      );
      return;
    }
    const top = el('div', undefined, 'panel-heading');
    top.append(
      el('h2', 'Трек'),
      ctx.favorite(j),
      iconButton('close', 'Закрыть панель', () =>
        document.body.classList.remove('inspector-drawer'),
      ),
    );
    top.lastChild.classList.add('context-close');
    const art = el('div', undefined, 'inspector-art');
    art.append(ctx.cover(j));
    panel.append(
      top,
      art,
      el('h2', j.title, 'inspector-title'),
      el('p', j.artist || 'Неизвестный исполнитель', 'inspector-artist'),
    );
    if (j.status !== 'done') {
      panel.append(el('p', j.error || ctx.statuses[j.status], 'inspector-warning'));
      if (j.url && ['error', 'canceled'].includes(j.status))
        panel.append(
          button(
            'Повторить загрузку',
            guard(async () => {
              await post('/api/retry/' + j.id);
              await ctx.refresh();
            }),
            'primary',
            'refresh',
          ),
        );
      return;
    }
    const m = ctx.music(j),
      metrics = el('div', undefined, 'inspector-metrics');
    metrics.append(
      ctx.metric(m.bpm || '—', 'BPM'),
      ctx.metric(m.key ? m.key + (m.scale ? ' ' + m.scale : '') : '—', 'Тональность'),
    );
    const source = el('div', undefined, 'metric-source'),
      labels = { manual: 'Вручную', description: 'Из описания', algorithm: 'Оценка алгоритма' };
    source.append(
      el(
        'span',
        [...new Set([labels[m.bpmSource], labels[m.keySource]].filter(Boolean))].join(' · ') ||
          'Ещё не определено',
      ),
      iconButton('edit', 'Исправить BPM / ключ', () => ctx.action(j, 'Исправить BPM / ключ')),
    );
    panel.append(metrics, source);
    const primary = el('div', undefined, 'inspector-actions');
    const download = el('a', 'Сохранить', 'download-link');
    download.prepend(icon('download'));
    download.href = '/api/files/' + j.id;
    download.download = '';
    primary.append(
      button('Слушать', () => play(j), 'primary', 'play'),
      download,
    );
    panel.append(primary);
    const actions = el('div', undefined, 'visible-track-actions');
    actions.append(
      button('Обрезать трек', () => ctx.trim(j), '', 'scissors'),
      button('Изменить данные', () => ctx.action(j, 'Теги файла'), '', 'edit'),
      button(
        'Определить BPM / тональность',
        () => ctx.action(j, j.analysis ? 'Повторить анализ' : 'BPM / Тональность'),
        '',
        'refresh',
      ),
      button('Редактировать теги', () => ctx.action(j, '# Теги'), '', 'library'),
      button('Включить следующим', () => enqueue(j), '', 'queue'),
    );
    if (window.desktop?.showFile)
      actions.append(
        button(
          'Показать в папке',
          guard(() => window.desktop.showFile(j.id)),
          '',
          'folder',
        ),
      );
    if (j.url)
      actions.append(
        button(
          'Открыть оригинал',
          guard(() => ctx.openOriginal(j)),
          '',
          'external',
        ),
      );
    actions.append(
      button(
        'Удалить из библиотеки',
        guard(() => trash([j.id])),
        'danger',
        'trash',
      ),
    );
    panel.append(actions);
    if (j.tags?.length)
      panel.append(el('p', j.tags.map((t) => '#' + t).join(' '), 'inspector-tags'));
    for (const message of [
      j.error,
      j.analysisError,
      j.exportError,
      j.coverWarning,
      j.missing ? 'Файл отсутствует на диске. Восстановите резервную копию.' : '',
    ])
      if (message) panel.append(el('p', message, 'inspector-warning'));
  }
  function renderQueue() {
    const pending = live().filter((j) => !['done', 'canceled'].includes(j.status));
    $('#queue-count').textContent = pending.filter((j) => j.status !== 'error').length;
    $('#queue').replaceChildren();
    if (!pending.length)
      $('#queue').append(
        el('p', 'Очередь свободна. Найдите трек или вставьте ссылку.', 'queue-empty'),
      );
    for (const j of pending) {
      const row = el('div', undefined, 'queue-item'),
        copy = el('div', undefined, 'queue-copy');
      copy.append(
        el('strong', j.title || j.url),
        el(
          'small',
          ctx.statuses[j.status] + (j.progress ? ' · ' + Math.round(j.progress) + '%' : ''),
        ),
      );
      if (j.status === 'error') {
        copy.append(el('p', j.error, 'queue-error'));
        row.append(
          copy,
          iconButton(
            'refresh',
            'Повторить',
            guard(async () => {
              await post('/api/retry/' + j.id);
              await ctx.refresh();
            }),
          ),
        );
      } else {
        const progress = el('progress');
        progress.max = 100;
        progress.value = j.progress;
        copy.append(progress);
        row.append(
          copy,
          iconButton(
            'close',
            'Отменить',
            guard(async () => {
              await post('/api/cancel/' + j.id);
              await ctx.refresh();
            }),
          ),
        );
      }
      $('#queue').append(row);
    }
  }
  function render() {
    if (!job(ctx.inspected()))
      ctx.setInspected(live().find((j) => j.status === 'done')?.id || live()[0]?.id);
    currentList = getList();
    for (const id of selected) if (!job(id)) selected.delete(id);
    const sig = JSON.stringify([currentList, view, [...selected], ctx.inspected()]);
    if (sig !== signature) {
      signature = sig;
      $('#jobs').className = 'library-view view-' + view;
      $('#jobs').replaceChildren(
        ...(currentList.length
          ? renderLibrary(currentList, view, {
              ...ctx,
              selected,
              enqueue,
              menu: trackMenu,
              select: (id, checked) => {
                checked ? selected.add(id) : selected.delete(id);
                signature = '';
                render();
              },
              open: (j) => {
                ctx.setInspected(j.id);
                document.body.classList.add('inspector-drawer');
                inspectorSig = '';
                render();
              },
              play,
              trash: (id) => guard(() => trash([id]))(),
            })
          : [
              el(
                'div',
                'Здесь пока нет треков. Измените фильтры, найдите музыку или добавьте файлы.',
                'empty',
              ),
            ]),
      );
    }
    bulk.hidden = !selected.size;
    count.textContent = 'Выбрано: ' + selected.size;
    $('#library-total').textContent = currentList.length + ' треков';
    $('#count').textContent = live().filter((j) => j.status === 'done').length;
    const recent = live()
      .slice()
      .sort((a, b) => b.created - a.created)
      .slice(0, 4);
    $('#recent').replaceChildren(
      ...(recent.length
        ? recent.map(ctx.compact)
        : [el('div', 'Добавьте первую ссылку или аудиофайл.', 'empty')]),
    );
    renderInspector();
    renderQueue();
    syncPlayer();
    savePreferences();
    enhanceSelects();
    if (!restored) {
      restored = true;
      const id = read('last-track', null),
        j = job(id);
      if (j) ctx.restore(j, positionByTrack[id] || 0);
      if (!read('intro-complete', false))
        setTimeout(() => {
          if (!read('intro-complete', false)) showIntro();
        }, 400);
    }
    renderPlaybackQueue();
  }
  function enqueue(j) {
    if (j.status !== 'done') return;
    const current = ctx.playing();
    if (!queue.length && current) queue = [current];
    const at = queue.indexOf(current);
    queue = queue.filter((id) => id !== j.id);
    queue.splice(at < 0 ? queue.length : at + 1, 0, j.id);
    manualQueue = true;
    write('play-queue', queue);
    renderPlaybackQueue();
    toast('Следующим: ' + j.title);
  }
  async function play(j, keepQueue = false) {
    clearOnline();
    if (!keepQueue && !manualQueue) {
      queue = currentList.filter((j) => j.status === 'done').map((j) => j.id);
      if (!queue.includes(j.id))
        queue = live()
          .filter((j) => j.status === 'done')
          .map((j) => j.id);
      if (shuffle) queue = [j.id, ...shuffled(queue.filter((id) => id !== j.id))];
      write('play-queue', queue);
    } else if (!queue.includes(j.id)) {
      queue.unshift(j.id);
      write('play-queue', queue);
    }
    ab = { a: null, b: null, on: false };
    write('last-track', j.id);
    await ctx.play(j);
    syncPlayer();
  }
  function adjacent(direction, ended = false) {
    if (online?.service === 'soundcloud') {
      if (ended && repeat === 'one') {
        widget?.seekTo(0);
        widget?.play();
        return;
      }
      let next = onlineQueue.findIndex((j) => j.url === online.url) + direction;
      if (repeat === 'all' && onlineQueue.length)
        next = (next + onlineQueue.length) % onlineQueue.length;
      if (onlineQueue[next]) ctx.openOnline(onlineQueue[next]);
      return;
    }
    queue = queue.filter((id) => job(id)?.status === 'done');
    if (!queue.length)
      queue = live()
        .filter((j) => j.status === 'done')
        .map((j) => j.id);
    const current = ctx.playing();
    if (ended && repeat === 'one') {
      ctx.audio.currentTime = 0;
      ctx.audio.play().catch(report);
      return;
    }
    let index = queue.indexOf(current),
      next = index + direction;
    if (next < 0 || next >= queue.length) {
      if (repeat === 'all') next = (next + queue.length) % queue.length;
      else return;
    }
    if (job(queue[next])) play(job(queue[next]), true);
  }
  const transport = $('.transport'),
    shuffleButton = iconButton('shuffle', 'Перемешивание', () => {
      shuffle = !shuffle;
      if (shuffle) {
        const id = ctx.playing();
        queue = [...(id ? [id] : []), ...shuffled(queue.filter((v) => v !== id))];
        write('play-queue', queue);
      }
      write('shuffle', shuffle);
      syncPlayer();
    }),
    repeatButton = iconButton('repeat', 'Повтор', () => {
      repeat = { off: 'all', all: 'one', one: 'off' }[repeat];
      write('repeat', repeat);
      syncPlayer();
    });
  transport.prepend(shuffleButton);
  transport.append(repeatButton);
  const queueButton = iconButton('queue', 'Очередь прослушивания', () => {
    drawer.hidden = !drawer.hidden;
    renderPlaybackQueue();
  });
  $('.player-volume').append(queueButton);
  const drawer = el('aside', undefined, 'playback-drawer');
  drawer.id = 'playback-drawer';
  drawer.hidden = true;
  drawer.setAttribute('aria-label', 'Очередь прослушивания');
  document.body.append(drawer);
  function renderPlaybackQueue() {
    if (drawer.hidden) return;
    drawer.replaceChildren();
    const heading = el('div', undefined, 'panel-heading');
    heading.append(
      el('h2', 'Далее'),
      iconButton('close', 'Закрыть очередь', () => (drawer.hidden = true)),
    );
    drawer.append(heading);
    if (!queue.length) drawer.append(el('p', 'Выберите трек или нажмите «Включить следующим».'));
    let dragged;
    queue.forEach((id, i) => {
      const j = job(id);
      if (!j) return;
      const row = el('div', undefined, 'playback-row');
      row.draggable = true;
      row.ondragstart = () => (dragged = i);
      row.ondragover = (e) => e.preventDefault();
      row.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragged === undefined) return;
        const copy = queue.slice(),
          [id] = copy.splice(dragged, 1);
        copy.splice(i, 0, id);
        queue = copy;
        manualQueue = true;
        write('play-queue', queue);
        renderPlaybackQueue();
      };
      row.append(
        button(j.title, () => play(j, true), ctx.playing() === id ? 'active' : ''),
        iconButton('close', 'Убрать из очереди', () => {
          queue.splice(i, 1);
          write('play-queue', queue);
          renderPlaybackQueue();
        }),
      );
      drawer.append(row);
    });
  }
  const position = () =>
    new Promise((resolve) => {
      if (online?.service === 'soundcloud') {
        if (widget) widget.getPosition((ms) => resolve(ms / 1000));
        else resolve(null);
      } else resolve(ctx.audio.currentTime);
    });
  const abControls = el('div', undefined, 'ab-controls'),
    aButton = button('A', async () => {
      const at = await position();
      if (at === null) return;
      ab.a = at;
      ab.b = null;
      ab.on = false;
      syncPlayer();
    }),
    bButton = button('B', async () => {
      const at = await position();
      if (at === null) return;
      if (ab.a === null || at <= ab.a + 0.1)
        return toast('Сначала отметьте A, затем выберите точку B позже по треку.');
      ab.b = at;
      ab.on = true;
      syncPlayer();
    }),
    loopButton = button('A–B', () => {
      if (ab.a === null || ab.b === null) return toast('Отметьте начало A и конец B.');
      ab.on = !ab.on;
      syncPlayer();
    });
  aButton.title = 'Начало повторяемого участка';
  bButton.title = 'Конец повторяемого участка';
  abControls.append(aButton, bButton, loopButton);
  const loopPanel = el('div', undefined, 'player-loop-panel');
  loopPanel.hidden = true;
  loopPanel.id = 'player-loop-panel';
  loopPanel.append(
    el('strong', 'Повтор фрагмента'),
    el('p', 'Отметьте начало A и конец B во время прослушивания.'),
    abControls,
  );
  const loopToggle = button(
    'A–B',
    () => {
      loopPanel.hidden = !loopPanel.hidden;
      loopToggle.setAttribute('aria-expanded', String(!loopPanel.hidden));
    },
    'loop-toggle',
  );
  loopToggle.title = 'Повторить фрагмент';
  loopToggle.setAttribute('aria-label', 'Повторить фрагмент');
  loopToggle.setAttribute('aria-expanded', 'false');
  loopToggle.setAttribute('aria-controls', loopPanel.id);
  $('.player-volume').insertBefore(loopToggle, queueButton);
  $('.player-volume').append(loopPanel);
  document.addEventListener('pointerdown', (e) => {
    if (!loopPanel.contains(e.target) && !loopToggle.contains(e.target)) {
      loopPanel.hidden = true;
      loopToggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !loopPanel.hidden) {
      loopPanel.hidden = true;
      loopToggle.setAttribute('aria-expanded', 'false');
      loopToggle.focus();
    }
  });
  const seekTip = el('span', undefined, 'seek-tooltip');
  $('.timeline').append(seekTip);
  $('#seek').addEventListener('pointermove', (e) => {
    const r = $('#seek').getBoundingClientRect(),
      duration = online ? onlineDuration : ctx.audio.duration;
    seekTip.textContent = ctx.time(
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (duration || 0),
    );
    seekTip.style.left = e.clientX - $('.timeline').getBoundingClientRect().left + 'px';
  });
  $('#seek').addEventListener('pointerleave', () => (seekTip.textContent = ''));
  function syncPlayer() {
    $('#player-favorite').disabled = online?.service === 'soundcloud';
    shuffleButton.classList.toggle('active', shuffle);
    shuffleButton.setAttribute('aria-pressed', shuffle);
    repeatButton.classList.toggle('active', repeat !== 'off');
    repeatButton.title =
      'Повтор: ' + { off: 'выключен', all: 'вся очередь', one: 'один трек' }[repeat];
    repeatButton.dataset.mode = repeat;
    loopButton.classList.toggle('active', ab.on);
    loopToggle.classList.toggle('active', ab.on);
    aButton.classList.toggle('active', ab.a !== null);
    bButton.classList.toggle('active', ab.b !== null);
    aButton.title = ab.a === null ? 'Начало участка' : 'A: ' + ctx.time(ab.a);
    bButton.title = ab.b === null ? 'Конец участка' : 'B: ' + ctx.time(ab.b);
    if (online?.service === 'soundcloud') {
      $('#player-title').textContent = online.title;
      $('#player-artist').textContent = (online.artist || '') + ' · SoundCloud';
      $('#play-pause').replaceChildren(icon(onlinePaused ? 'play' : 'pause'));
      $('#play-pause').setAttribute('aria-label', onlinePaused ? 'Воспроизвести' : 'Пауза');
      $('#play-pause').disabled = !widget;
      $('#player').classList.remove('is-empty');
      $('#seek').disabled = !widget;
      $('#seek').max = onlineDuration || 100;
      $('#seek').value = onlinePosition;
      $('#elapsed').textContent = ctx.time(onlinePosition);
      $('#duration').textContent = ctx.time(onlineDuration);
      $('#volume').value = read('online-volume', 0.65);
      $('#mute').replaceChildren(icon(+$('#volume').value === 0 ? 'muted' : 'volume'));
      $('#seek').style.setProperty(
        '--range-fill',
        (onlineDuration ? (onlinePosition / onlineDuration) * 100 : 0) + '%',
      );
      for (const b of all('#previous,#next,#back10,#forward10')) b.disabled = !widget;
    }
  }
  function announce(source) {
    window.dispatchEvent(new CustomEvent('yoump3-audio-start', { detail: source }));
  }
  ctx.audio.addEventListener('play', () => announce('library'));
  ctx.audio.addEventListener('timeupdate', () => {
    if (online?.service === 'soundcloud') {
      syncPlayer();
      return;
    }
    if (ab.on && ab.b !== null && ctx.audio.currentTime >= ab.b) ctx.audio.currentTime = ab.a;
    if (Date.now() - markSaved > 2000 && ctx.playing()) {
      markSaved = Date.now();
      positionByTrack[ctx.playing()] = ctx.audio.currentTime;
      write('track-positions', positionByTrack);
    }
  });
  ctx.audio.onended = () => adjacent(1, true);
  const toggle = () => {
    if (online?.service === 'soundcloud') {
      widget?.toggle();
      return;
    }
    ctx.audio.paused ? ctx.audio.play().catch(report) : ctx.audio.pause();
  };
  $('#play-pause').onclick = toggle;
  let volumeBeforeMute = ctx.audio.volume || 0.65;
  const setVolume = (value) => {
    value = Math.max(0, Math.min(1, value));
    if (online?.service === 'soundcloud') {
      widget?.setVolume(value * 100);
      write('online-volume', value);
      if (onlineVolume) {
        onlineVolume.value = value;
        onlineVolume.style.setProperty('--range-fill', value * 100 + '%');
        $('.online-volume output').textContent = Math.round(value * 100) + '%';
      }
    } else {
      if (ctx.audio.volume > 0) volumeBeforeMute = ctx.audio.volume;
      ctx.audio.volume = value;
      ctx.audio.muted = false;
      write('volume', value);
    }
    $('#volume').value = value;
    $('#volume').style.setProperty('--range-fill', value * 100 + '%');
    ctx.sync();
  };
  $('#volume').oninput = () => setVolume(+$('#volume').value);
  const wheelVolume = (e) => {
    if (!e.deltaY || (online && !widget)) return;
    e.preventDefault();
    setVolume(
      (online ? read('online-volume', 0.65) : ctx.audio.muted ? 0 : ctx.audio.volume) -
        Math.sign(e.deltaY) * 0.05,
    );
  };
  // Capture only the volume control, so scrolling over the player still scrolls normally.
  const volumeControl = el('div', undefined, 'volume-control');
  $('#mute').before(volumeControl);
  volumeControl.append($('#mute'), $('#volume'));
  volumeControl.title = 'Громкость · колесо мыши';
  volumeControl.addEventListener('wheel', wheelVolume, { passive: false });
  $('#mute').onclick = () => {
    if (online && widget) {
      widget.getVolume((v) => {
        if (v > 0) {
          write('online-before-mute', v / 100);
          setVolume(0);
        } else setVolume(read('online-before-mute', 0.65));
      });
    } else {
      if (ctx.audio.muted || ctx.audio.volume === 0)
        setVolume(ctx.audio.volume || volumeBeforeMute);
      else {
        volumeBeforeMute = ctx.audio.volume;
        ctx.audio.muted = true;
        ctx.sync();
      }
    }
  };
  const seek = (delta) => {
    ab.on = false;
    syncPlayer();
    if (online?.service === 'soundcloud' && !widget) return;
    if (online && widget)
      widget.getPosition((ms) =>
        widget.seekTo(Math.max(0, Math.min(onlineDuration * 1000, ms + delta * 1000))),
      );
    else if (Number.isFinite(ctx.audio.duration))
      ctx.audio.currentTime = Math.max(
        0,
        Math.min(ctx.audio.duration, ctx.audio.currentTime + delta),
      );
  };
  $('#back10').onclick = () => seek(-read('seek-step', 5));
  $('#forward10').onclick = () => seek(read('seek-step', 5));
  $('#seek').oninput = () => {
    ab.on = false;
    if (online && widget) widget.seekTo(+$('#seek').value * 1000);
    else ctx.audio.currentTime = +$('#seek').value;
  };
  let onlineVolume, apiPromise;
  function widgetAPI() {
    if (window.SC?.Widget) return Promise.resolve();
    if (!apiPromise)
      apiPromise = new Promise((resolve, reject) => {
        const script = el('script');
        script.src = 'https://w.soundcloud.com/player/api.js';
        script.onload = resolve;
        script.onerror = () => {
          apiPromise = null;
          script.remove();
          reject(Error('Не удалось подключить управление SoundCloud.'));
        };
        document.head.append(script);
      });
    return apiPromise;
  }
  async function attachOnline(item) {
    const token = ++onlineToken;
    online = item;
    onlineQueue = ctx.onlineItems().filter((j) => j.service === item.service);
    ab = { a: null, b: null, on: false };
    if (item.service === 'soundcloud') $('#player-art').replaceChildren(ctx.cover(item));
    if (item.service !== 'soundcloud') return;
    const controls = el('div', undefined, 'online-volume'),
      label = el('label', 'Громкость SoundCloud'),
      value = el('output');
    onlineVolume = el('input');
    onlineVolume.type = 'range';
    onlineVolume.min = 0;
    onlineVolume.max = 1;
    onlineVolume.step = 0.01;
    onlineVolume.value = read('online-volume', 0.65);
    onlineVolume.style.setProperty('--range-fill', +onlineVolume.value * 100 + '%');
    onlineVolume.setAttribute('aria-label', 'Громкость SoundCloud');
    onlineVolume.disabled = true;
    onlineVolume.oninput = () => {
      setVolume(+onlineVolume.value);
      value.textContent = Math.round(+onlineVolume.value * 100) + '%';
    };
    label.append(onlineVolume, value);
    controls.append(label);
    controls.addEventListener('wheel', wheelVolume, { passive: false });
    $('#online-frame').after(controls);
    try {
      await widgetAPI();
      if (token !== onlineToken) return;
      const frame = $('#online-frame iframe');
      if (!frame) return;
      const w = window.SC.Widget(frame);
      w.bind(window.SC.Widget.Events.READY, () => {
        if (token !== onlineToken) return;
        widget = w;
        onlineVolume.disabled = false;
        w.setVolume(+onlineVolume.value * 100);
        value.textContent = Math.round(+onlineVolume.value * 100) + '%';
        w.getDuration((ms) => {
          onlineDuration = ms / 1000;
          syncPlayer();
        });
      });
      w.bind(window.SC.Widget.Events.PLAY, () => {
        if (token !== onlineToken) return;
        onlinePaused = false;
        announce('online');
        syncPlayer();
      });
      w.bind(window.SC.Widget.Events.PAUSE, () => {
        if (token === onlineToken) {
          onlinePaused = true;
          syncPlayer();
        }
      });
      w.bind(window.SC.Widget.Events.PLAY_PROGRESS, (e) => {
        if (token === onlineToken) {
          onlinePosition = e.currentPosition / 1000;
          if (ab.on && ab.b !== null && onlinePosition >= ab.b) {
            w.seekTo(ab.a * 1000);
            onlinePosition = ab.a;
          }
          syncPlayer();
        }
      });
      w.bind(window.SC.Widget.Events.FINISH, () => {
        if (token === onlineToken) adjacent(1, true);
      });
      w.bind(window.SC.Widget.Events.ERROR, () => {
        if (token === onlineToken)
          toast('SoundCloud не смог воспроизвести трек. Откройте оригинал.');
      });
    } catch (e) {
      if (token === onlineToken) report(e);
    }
  }
  function clearOnline() {
    if (online) ab = { a: null, b: null, on: false };
    onlineToken++;
    widget?.pause();
    widget = null;
    online = null;
    onlinePaused = true;
    onlineDuration = 0;
    onlinePosition = 0;
    $('.online-volume')?.remove();
    const j = job(ctx.playing());
    if (j) ctx.playerInfo(j);
    else ctx.clearPlaying();
    $('#player-favorite').disabled = false;
    $('#volume').value = ctx.audio.volume;
    $('#seek').max = Number.isFinite(ctx.audio.duration) ? ctx.audio.duration : 100;
    $('#seek').value = ctx.audio.currentTime || 0;
    $('#elapsed').textContent = ctx.time(ctx.audio.currentTime);
    $('#duration').textContent = ctx.time(ctx.audio.duration);
    $('#volume').style.setProperty('--range-fill', ctx.audio.volume * 100 + '%');
    $('#seek').style.setProperty(
      '--range-fill',
      (ctx.audio.duration ? (ctx.audio.currentTime / ctx.audio.duration) * 100 : 0) + '%',
    );
    if (j) ctx.sync();
  }
  // Resize the inspector without changing the application minimum width.
  const panel = $('#context-panel'),
    resize = el('div', undefined, 'panel-resizer');
  resize.tabIndex = 0;
  resize.setAttribute('role', 'separator');
  resize.setAttribute('aria-label', 'Ширина правой панели');
  resize.setAttribute('aria-orientation', 'vertical');
  panel.before(resize);
  function setWidth(width) {
    const max = Math.min(
        500,
        innerWidth -
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--sidebar'),
          ) -
          320,
      ),
      v = Math.max(240, Math.min(max, width));
    document.documentElement.style.setProperty('--panel', v + 'px');
    write('panel-width', v);
    resize.setAttribute('aria-valuenow', v);
    resize.setAttribute('aria-valuemin', 240);
    resize.setAttribute('aria-valuemax', Math.max(240, max));
  }
  setWidth(read('panel-width', 310));
  let resizing = false;
  resize.onpointerdown = (e) => {
    resizing = true;
    resize.setPointerCapture(e.pointerId);
    document.body.classList.add('panel-resizing');
  };
  resize.onpointermove = (e) => {
    if (resizing) setWidth(innerWidth - e.clientX);
  };
  resize.onpointerup = resize.onpointercancel = () => {
    resizing = false;
    document.body.classList.remove('panel-resizing');
  };
  resize.ondblclick = () => setWidth(310);
  resize.onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      setWidth(panel.clientWidth + (e.key === 'ArrowLeft' ? 20 : -20));
    }
  };
  const collapse = iconButton('arrow', 'Свернуть правую панель', () => {
    document.body.classList.toggle('panel-collapsed');
    write('panel-collapsed', document.body.classList.contains('panel-collapsed'));
  });
  collapse.classList.add('panel-collapse');
  $('.titlebar').append(collapse);
  document.body.classList.toggle('panel-collapsed', read('panel-collapsed', false));
  const helpButton = button('Как пользоваться', showIntro, 'text-button', 'help');
  $('.sidebar-bottom').prepend(helpButton);
  function showIntro() {
    if (document.querySelector('dialog[open]')) return;
    const d = el('dialog', undefined, 'intro-dialog'),
      pages = [
        [
          'Музыка остаётся у вас',
          'Найдите трек в поиске или вставьте ссылку. YouMP3 определит сервис; несколько ссылок можно добавить сразу.',
        ],
        [
          'Ваша библиотека',
          'Добавляйте файлы перетаскиванием. Выбирайте вид, фильтруйте по BPM и тональности, собирайте подборки и выделяйте несколько треков.',
        ],
        [
          'Плеер и работа со звуком',
          'Пробел — пауза, стрелки — перемотка и громкость. Кнопка очереди показывает следующие треки. A и B повторяют выбранный участок; обрезка открывается в панели трека.',
        ],
        [
          'Сохранения и перерыв',
          'В настройках можно сделать резервную копию с музыкой и прогрессом. Обновления скачиваются только по вашей кнопке. В «Перерыве» четыре игры с инструкциями.',
        ],
      ];
    let index = 0;
    const step = el('small'),
      title = el('h2'),
      text = el('p'),
      nav = el('div', undefined, 'dialog-actions'),
      back = button('Назад', () => {
        index--;
        draw();
      }),
      next = button(
        'Далее',
        () => {
          if (index === pages.length - 1) {
            write('intro-complete', true);
            d.close();
          } else {
            index++;
            draw();
          }
        },
        'primary',
      );
    nav.append(
      button(
        'Пропустить',
        () => {
          write('intro-complete', true);
          d.close();
        },
        'text-button',
      ),
      back,
      next,
    );
    d.append(icon('help'), step, title, text, nav);
    function draw() {
      step.textContent = 'Знакомство · ' + (index + 1) + ' / ' + pages.length;
      title.textContent = pages[index][0];
      text.textContent = pages[index][1];
      back.disabled = index === 0;
      next.querySelector('span').textContent = index === pages.length - 1 ? 'Начать' : 'Далее';
    }
    d.addEventListener('close', () => d.remove(), { once: true });
    document.body.append(d);
    draw();
    d.showModal();
  }
  const settings = $('.settings-card'),
    storage = el('section');
  storage.append(
    el('h2', 'Библиотека и резервная копия'),
    el(
      'p',
      'Копия включает аудио, теги, избранное, анализ и прогресс игр. Восстановление добавляет отсутствующие треки.',
    ),
  );
  const storageInfo = el(
    'p',
    'Нажмите «Проверить файлы», чтобы узнать размер библиотеки и найти отсутствующие записи.',
    'muted',
  );
  storage.append(storageInfo);
  async function scan() {
    const r = await api('/api/storage');
    storageInfo.textContent =
      'Библиотека: ' +
      (r.bytes / 1048576).toFixed(1) +
      ' МБ · временные файлы: ' +
      (r.unused / 1048576).toFixed(1) +
      ' МБ · отсутствуют: ' +
      r.missing +
      ' · удалены: ' +
      r.deleted;
    await ctx.refresh();
    if (r.warnings.length) toast(r.warnings.join('. '));
  }
  const storageActions = el('div', undefined, 'settings-actions');
  storageActions.append(
    button(
      'Создать копию',
      guard(async () => {
        if (!window.desktop?.createBackup)
          return toast('Резервная копия с аудиофайлами доступна в приложении Windows.');
        await window.yoump3FlushGames?.();
        await window.yoump3FlushPreferences?.();
        const r = await window.desktop.createBackup();
        if (r) toast('Копия создана: ' + r.folder);
      }),
      '',
      'folder',
    ),
    button(
      'Восстановить копию',
      guard(async () => {
        if (!window.desktop?.restoreBackup)
          return toast('Восстановление доступно в приложении Windows.');
        ctx.audio.pause();
        clearOnline();
        window.dispatchEvent(new CustomEvent('yoump3-audio-start', { detail: 'backup' }));
        await window.yoump3FlushGames?.();
        await window.yoump3FlushPreferences?.();
        const r = await window.desktop.restoreBackup();
        if (r) {
          toast('Восстановлено треков: ' + r.count);
          await window.yoump3ReloadPreferences?.();
          await window.yoump3RestoreGames?.();
          location.reload();
        }
      }),
    ),
    button('Проверить файлы', guard(scan)),
    button(
      'Очистить временные файлы',
      guard(async () => {
        await post('/api/storage/clean');
        await scan();
      }),
    ),
    button(
      'Удалённые треки',
      guard(async () => {
        const items = await api('/api/jobs?trash=1');
        if (!items.length) return toast('Удалённых треков нет.');
        const d = el('dialog', undefined, 'trash-dialog');
        d.append(el('h2', 'Удалённые треки'));
        for (const j of items) {
          const row = el('div', undefined, 'trash-row');
          row.append(
            el('span', j.title),
            button(
              'Восстановить',
              guard(async () => {
                await post('/api/restore/' + j.id);
                row.remove();
                await ctx.refresh();
              }),
            ),
          );
          d.append(row);
        }
        d.append(
          button(
            'Очистить корзину',
            guard(async () => {
              if (
                await ask(
                  'Удалить файлы навсегда?',
                  'Будут удалены только копии удалённых треков внутри библиотеки YouMP3.',
                  { confirm: 'Удалить файлы' },
                )
              ) {
                await post('/api/storage/clean', { purge: true });
                d.close();
                await scan();
              }
            }),
            'danger',
          ),
          button('Закрыть', () => d.close()),
        );
        d.addEventListener('close', () => d.remove(), { once: true });
        document.body.append(d);
        d.showModal();
      }),
    ),
  );
  storage.append(storageActions);
  settings.append(storage);
  const stepSection = el('section');
  stepSection.append(el('h2', 'Управление плеером'));
  const stepLabel = el('label', 'Шаг перемотки'),
    stepSelect = el('select');
  stepSelect.setAttribute('aria-label', 'Шаг перемотки');
  for (const n of [5, 10, 15, 30]) stepSelect.append(new Option(n + ' секунд', n));
  stepSelect.value = read('seek-step', 5);
  stepSelect.onchange = () => write('seek-step', +stepSelect.value);
  stepLabel.append(stepSelect);
  stepLabel.className = 'setting-field';
  const playerSettingsActions = el('div', undefined, 'settings-actions');
  playerSettingsActions.append(
    button('Горячие клавиши', showShortcuts),
    button('Повторить знакомство', showIntro),
  );
  stepSection.append(stepLabel, playerSettingsActions);
  settings.append(stepSection);
  function showShortcuts() {
    const d = el('dialog', undefined, 'shortcuts-dialog');
    d.append(el('h2', 'Горячие клавиши'));
    for (const [key, label] of [
      ['Пробел', 'Воспроизведение / пауза'],
      ['← →', 'Перемотка (шаг задаётся в настройках)'],
      ['Shift + ← →', 'Перемотка на 15 секунд'],
      ['↑ ↓', 'Громкость ±5%'],
      ['M', 'Включить / выключить звук'],
      ['Ctrl + F', 'Поиск в текущем разделе'],
      ['Escape', 'Закрыть меню или панель'],
      ['?', 'Эта подсказка'],
    ]) {
      const row = el('p');
      row.append(el('kbd', key), el('span', label));
      d.append(row);
    }
    d.append(button('Закрыть', () => d.close(), 'primary'));
    d.addEventListener('close', () => d.remove(), { once: true });
    document.body.append(d);
    d.showModal();
  }
  document.addEventListener(
    'keydown',
    (e) => {
      if (
        e.defaultPrevented ||
        e.target.closest(
          '.custom-select,.select-popup,[role=separator],[role=tablist],[role=slider]',
        ) ||
        document.querySelector('dialog[open]')
      )
        return;
      const editing = e.target.matches('input,textarea,select') || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
        e.preventDefault();
        (ctx.pageName() === 'discover' ? $('#discover-query') : $('#search')).focus();
        return;
      }
      if (!ctx.playing() && !online && e.key !== '?') return;
      if (editing || e.ctrlKey || e.metaKey || e.altKey || ctx.pageName() === 'games') return;
      let handled = true;
      switch (e.code) {
        case 'Space':
          if (e.target.closest('button,summary,a')) return;
          toggle();
          break;
        case 'ArrowLeft':
          seek(-(e.shiftKey ? 15 : read('seek-step', 5)));
          break;
        case 'ArrowRight':
          seek(e.shiftKey ? 15 : read('seek-step', 5));
          break;
        case 'ArrowUp':
          setVolume((online ? read('online-volume', 0.65) : ctx.audio.volume) + 0.05);
          break;
        case 'ArrowDown':
          setVolume((online ? read('online-volume', 0.65) : ctx.audio.volume) - 0.05);
          break;
        case 'KeyM':
          $('#mute').click();
          break;
        default:
          if (e.key === '?') showShortcuts();
          else handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  const notice = el('aside', undefined, 'update-notice');
  notice.hidden = true;
  notice.setAttribute('aria-live', 'polite');
  document.body.append(notice);
  let dismissedVersion = '',
    lastUpdateSig = '';
  async function updateUpdates() {
    if (!window.desktop?.updateState) {
      $('#update-status').textContent = 'Обновления доступны в установленном приложении Windows.';
      $('#update-action').disabled = true;
      return;
    }
    try {
      const s = await window.desktop.updateState();
      $('#update-dot').hidden = !['available', 'ready'].includes(s.status);
      $('#update-status').textContent =
        'Версия ' +
        s.version +
        ' · ' +
        (s.message || '') +
        (s.status === 'downloading' ? ' ' + (s.percent || 0) + '%' : '');
      const action = $('#update-action');
      action.textContent =
        s.status === 'available'
          ? 'Скачать обновление'
          : s.status === 'ready'
            ? 'Установить и перезапустить'
            : 'Проверить обновления';
      action.disabled = ['development', 'checking', 'downloading'].includes(s.status);
      action.onclick = guard(async () => {
        action.disabled = true;
        const result =
          s.status === 'available'
            ? await window.desktop.downloadUpdate()
            : s.status === 'ready'
              ? await window.desktop.installUpdate()
              : await window.desktop.checkUpdate();
        if (result?.error) toast(result.error);
        await updateUpdates();
      });
      const sig = JSON.stringify(s);
      if (
        sig !== lastUpdateSig &&
        ['available', 'downloading', 'ready'].includes(s.status) &&
        dismissedVersion !== s.next
      ) {
        lastUpdateSig = sig;
        notice.replaceChildren(
          el('strong', s.status === 'ready' ? 'Обновление готово' : 'Доступна версия ' + s.next),
          el('p', s.message),
          button(
            s.status === 'ready'
              ? 'Установить'
              : s.status === 'downloading'
                ? 'Загрузка ' + (s.percent || 0) + '%'
                : 'Скачать обновление',
            () => action.click(),
            'primary',
          ),
          iconButton('close', 'Позже', () => {
            dismissedVersion = s.next;
            notice.hidden = true;
          }),
        );
        notice.querySelector('.primary').disabled = s.status === 'downloading';
        notice.hidden = false;
      }
    } catch {
      $('#update-status').textContent = 'Не удалось получить состояние обновления.';
    }
  }
  // Compact link entry with bounded automatic growth.
  const input = $('#url');
  input.rows = 1;
  input.style.resize = 'none';
  function fit() {
    input.style.height = 'auto';
    input.style.height = Math.min(150, Math.max(28, input.scrollHeight)) + 'px';
  }
  input.addEventListener('input', fit);
  new MutationObserver(fit).observe(input, { attributes: true, attributeFilter: ['rows'] });
  fit();
  const fade = el('div', undefined, 'trim-fades');
  for (const [id, label] of [
    ['trim-fade-in', 'Плавное начало, сек'],
    ['trim-fade-out', 'Плавный конец, сек'],
  ]) {
    const l = el('label', label),
      n = el('input');
    n.id = id;
    n.type = 'number';
    n.min = 0;
    n.max = 10;
    n.step = 0.05;
    n.value = 0.05;
    l.append(n);
    fade.append(l);
  }
  $('.trim-fields').after(fade);
  $('#trim-audio').addEventListener('play', () => announce('trim'));
  enhanceSelects();
  let scheduled = false;
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        enhanceSelects();
        if (popup && !popup.owner?.isConnected) closePopup();
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('yoump3-preferences-error', () =>
    toast('Не удалось сохранить настройки. Проверьте свободное место; запись будет повторена.'),
  );
  window.addEventListener('pagehide', savePreferences);
  return {
    render,
    renderInspector,
    renderQueue,
    play,
    adjacent,
    syncPlayer,
    attachOnline,
    clearOnline,
    updateUpdates,
    showIntro,
    importFiles,
    savePreferences,
  };
}
