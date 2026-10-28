// ===== Хранилище и помощники =====
const $ = (s) => document.querySelector(s);

const store = {
  load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

let tasks = store.load('tasks', []);       // {id, text, done}
let habits = store.load('habits', []);     // {id, name, days: {'2026-10-28': true}}
let expenses = store.load('expenses', []); // {id, type: 'expense'|'income', amount, cat, note, date}
let settings = store.load('settings', { currency: '₽', lastBackup: null });

// Старые записи (до появления доходов) — это расходы
expenses.forEach((e) => (e.type ??= 'expense'));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' ' + settings.currency;

const parseAmount = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ===== Всплывающее окно =====
const sheet = $('#sheet');
let sheetSave = null;

// onSave получает поля формы; если вернёт false — окно не закрывается
function openSheet({ title, body, onSave, saveText = 'Сохранить' }) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = body;
  sheetSave = onSave || null;
  $('#sheet-ok').hidden = !onSave;
  $('#sheet-ok').textContent = saveText;
  $('#sheet-cancel').textContent = onSave ? 'Отмена' : 'Закрыть';
  sheet.showModal();
}

$('#sheet-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (sheetSave && sheetSave(e.target.elements) === false) return;
  sheet.close();
});
$('#sheet-cancel').addEventListener('click', () => sheet.close());
// Нажатие на затемнённый фон закрывает окно
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) sheet.close();
});

// ===== Вкладки =====
const titles = { tasks: 'Задачи', habits: 'Привычки', money: 'Финансы' };
let currentTab = store.load('lastTab', 'tasks');

function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#title').textContent = titles[name];
  store.save('lastTab', name);
  updateSubtitle();
  window.scrollTo(0, 0);
}

function monthTotals(monthKey) {
  let income = 0, expense = 0;
  expenses.forEach((e) => {
    if (!e.date.startsWith(monthKey)) return;
    if (e.type === 'income') income += e.amount;
    else expense += e.amount;
  });
  return { income, expense, balance: income - expense };
}

function updateSubtitle() {
  let text = '';
  if (currentTab === 'tasks') {
    const left = tasks.filter((t) => !t.done).length;
    text = tasks.length ? `Осталось: ${left} из ${tasks.length}` : '';
  } else if (currentTab === 'habits') {
    const today = dayKey();
    const done = habits.filter((h) => h.days[today]).length;
    text = habits.length ? `Сегодня выполнено: ${done} из ${habits.length}` : '';
  } else {
    text = `Баланс в этом месяце: ${money(monthTotals(dayKey().slice(0, 7)).balance)}`;
  }
  $('#subtitle').textContent = text;
}

document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ===== Задачи =====
let taskFilter = 'all';

function saveTasks() {
  store.save('tasks', tasks);
  renderTasks();
}

function renderTasks() {
  const list = tasks.filter((t) => taskFilter === 'all' || (taskFilter === 'done') === t.done);
  $('#task-list').innerHTML = list
    .map(
      (t) => `
    <li class="item ${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="Отметить">${t.done ? '✓' : ''}</button>
      <span class="text" data-act="edit">${esc(t.text)}</span>
      <button class="del" data-act="del" aria-label="Удалить">×</button>
    </li>`
    )
    .join('');
  $('#task-empty').hidden = list.length > 0;
  $('#task-empty').textContent = tasks.length ? 'Здесь пусто' : 'Задач пока нет';
  $('#task-hint').hidden = list.length === 0;
  $('#task-clear').hidden = !tasks.some((t) => t.done);
  updateSubtitle();
}

function editTask(t) {
  openSheet({
    title: 'Изменить задачу',
    body: `<input name="text" value="${esc(t.text)}" maxlength="200" autocomplete="off" required>`,
    onSave(f) {
      const text = f.text.value.trim();
      if (!text) return false;
      t.text = text;
      saveTasks();
    },
  });
}

$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#task-input').value.trim();
  if (!text) return;
  tasks.unshift({ id: uid(), text, done: false });
  $('#task-input').value = '';
  saveTasks();
});

$('#task-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const t = tasks.find((t) => t.id === btn.closest('li').dataset.id);
  if (btn.dataset.act === 'toggle') {
    t.done = !t.done;
    saveTasks();
  } else if (btn.dataset.act === 'edit') {
    editTask(t);
  } else {
    tasks = tasks.filter((x) => x !== t);
    saveTasks();
  }
});

$('#task-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  taskFilter = btn.dataset.f;
  document.querySelectorAll('#task-filter button').forEach((b) => b.classList.toggle('active', b === btn));
  renderTasks();
});

$('#task-clear').addEventListener('click', () => {
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
});

// ===== Привычки =====
const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function saveHabits() {
  store.save('habits', habits);
  renderHabits();
}

// Сколько дней подряд выполнена привычка (если сегодня ещё не отмечено — считаем до вчера)
function streak(h) {
  const d = new Date();
  if (!h.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (h.days[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function lastSevenDays() {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d);
  }
  return result;
}

function renderHabits() {
  const days = lastSevenDays();
  const today = dayKey();
  $('#habit-list').innerHTML = habits
    .map((h) => {
      const s = streak(h);
      const cells = days
        .map((d) => {
          const k = dayKey(d);
          return `<button class="day ${h.days[k] ? 'on' : ''} ${k === today ? 'today' : ''}" data-act="day" data-day="${k}">
            <small>${weekDays[d.getDay()]}</small>${d.getDate()}</button>`;
        })
        .join('');
      return `
      <li class="card habit" data-id="${h.id}">
        <div class="habit-top">
          <span class="text" data-act="edit">${esc(h.name)}</span>
          <span class="streak">${s ? '🔥 ' + s + ' дн. подряд' : ''}</span>
          <button class="del" data-act="del" aria-label="Удалить">×</button>
        </div>
        <div class="days">${cells}</div>
      </li>`;
    })
    .join('');
  $('#habit-empty').hidden = habits.length > 0;
  updateSubtitle();
}

function editHabit(h) {
  openSheet({
    title: 'Переименовать привычку',
    body: `<input name="name" value="${esc(h.name)}" maxlength="60" autocomplete="off" required>`,
    onSave(f) {
      const name = f.name.value.trim();
      if (!name) return false;
      h.name = name;
      saveHabits();
    },
  });
}

$('#habit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#habit-input').value.trim();
  if (!name) return;
  habits.push({ id: uid(), name, days: {} });
  $('#habit-input').value = '';
  saveHabits();
});

$('#habit-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const h = habits.find((h) => h.id === btn.closest('li').dataset.id);
  if (btn.dataset.act === 'day') {
    const k = btn.dataset.day;
    if (h.days[k]) delete h.days[k];
    else h.days[k] = true;
    saveHabits();
  } else if (btn.dataset.act === 'edit') {
    editHabit(h);
  } else {
    if (!confirm(`Удалить привычку «${h.name}» вместе с историей?`)) return;
    habits = habits.filter((x) => x !== h);
    saveHabits();
  }
});

// ===== Финансы =====
const categories = {
  expense: [
    { id: 'food', name: 'Еда', icon: '🍔' },
    { id: 'transport', name: 'Транспорт', icon: '🚌' },
    { id: 'home', name: 'Дом', icon: '🏠' },
    { id: 'shopping', name: 'Покупки', icon: '🛍️' },
    { id: 'fun', name: 'Развлечения', icon: '🎮' },
    { id: 'health', name: 'Здоровье', icon: '💊' },
    { id: 'other', name: 'Другое', icon: '📦' },
  ],
  income: [
    { id: 'salary', name: 'Зарплата', icon: '💼' },
    { id: 'side', name: 'Подработка', icon: '🧑‍💻' },
    { id: 'gift', name: 'Подарок', icon: '🎁' },
    { id: 'other', name: 'Другое', icon: '💵' },
  ],
};

function catOf(e) {
  const list = categories[e.type] || categories.expense;
  return list.find((c) => c.id === e.cat) || list[list.length - 1];
}

const catOptions = (type, selected) =>
  categories[type]
    .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.icon} ${c.name}</option>`)
    .join('');

let moneyType = 'expense';

function setMoneyType(type) {
  moneyType = type;
  document.querySelectorAll('#money-type button').forEach((b) => b.classList.toggle('active', b.dataset.t === type));
  $('#money-cat').innerHTML = catOptions(type);
  $('#money-submit').textContent = type === 'income' ? 'Добавить доход' : 'Добавить расход';
  $('#money-submit').classList.toggle('income', type === 'income');
}

$('#money-type').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) setMoneyType(btn.dataset.t);
});

const viewMonth = new Date();
viewMonth.setDate(1);

function saveExpenses() {
  store.save('expenses', expenses);
  renderMoney();
}

function renderMoney() {
  const monthKey = dayKey(viewMonth).slice(0, 7);
  const label = viewMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
  $('#m-label').textContent = label[0].toUpperCase() + label.slice(1);

  const list = expenses
    .filter((e) => e.date.startsWith(monthKey))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const { income, expense, balance } = monthTotals(monthKey);
  $('#m-balance').textContent = money(balance);
  $('#m-balance').classList.toggle('minus', balance < 0);
  $('#m-in').textContent = '+' + money(income);
  $('#m-out').textContent = '−' + money(expense);

  // Расходы по категориям, от большей суммы к меньшей
  const byCat = {};
  list.forEach((e) => {
    if (e.type === 'expense') byCat[catOf(e).id] = (byCat[catOf(e).id] || 0) + e.amount;
  });
  $('#m-cats').innerHTML = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([id, sum]) => {
      const c = catOf({ type: 'expense', cat: id });
      return `<div class="cat-row"><span>${c.icon} ${c.name}</span><span>${money(sum)}</span>
        <div class="bar"><i style="width:${((sum / expense) * 100).toFixed(1)}%"></i></div></div>`;
    })
    .join('');

  $('#money-list').innerHTML = list
    .map((e) => {
      const c = catOf(e);
      const isIncome = e.type === 'income';
      const date = new Date(e.date + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      return `
      <li class="item tap" data-id="${e.id}">
        <span class="cat-icon">${c.icon}</span>
        <span class="text">${e.note ? esc(e.note) : c.name}<span class="sub">${date} · ${c.name}</span></span>
        <span class="amount ${isIncome ? 'plus' : ''}">${isIncome ? '+' : '−'}${money(e.amount)}</span>
        <button class="del" data-act="del" aria-label="Удалить">×</button>
      </li>`;
    })
    .join('');
  $('#money-empty').hidden = list.length > 0;
  $('#money-hint').hidden = list.length === 0;
  updateSubtitle();
}

function editEntry(e) {
  openSheet({
    title: e.type === 'income' ? 'Изменить доход' : 'Изменить расход',
    body: `
      <div class="money-form">
        <input name="amount" type="text" inputmode="decimal" value="${e.amount}" placeholder="Сумма" autocomplete="off" required>
        <select name="cat">${catOptions(e.type, catOf(e).id)}</select>
        <input name="note" class="full" value="${esc(e.note)}" placeholder="Комментарий" maxlength="100" autocomplete="off">
        <input name="date" class="full" type="date" value="${e.date}" required>
      </div>`,
    onSave(f) {
      const amount = parseAmount(f.amount.value);
      if (!(amount > 0) || !isDay(f.date.value)) return false;
      Object.assign(e, { amount, cat: f.cat.value, note: f.note.value.trim(), date: f.date.value });
      saveExpenses();
    },
  });
}

$('#money-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = parseAmount($('#money-amount').value);
  if (!(amount > 0)) {
    $('#money-amount').focus();
    return;
  }
  expenses.push({
    id: uid(),
    type: moneyType,
    amount,
    cat: $('#money-cat').value,
    note: $('#money-note').value.trim(),
    date: dayKey(),
  });
  $('#money-amount').value = '';
  $('#money-note').value = '';
  // После добавления показываем текущий месяц
  const now = new Date();
  viewMonth.setFullYear(now.getFullYear(), now.getMonth(), 1);
  saveExpenses();
});

$('#money-list').addEventListener('click', (ev) => {
  const li = ev.target.closest('li');
  if (!li) return;
  const entry = expenses.find((x) => x.id === li.dataset.id);
  if (ev.target.closest('[data-act="del"]')) {
    if (!confirm('Удалить эту запись?')) return;
    expenses = expenses.filter((x) => x !== entry);
    saveExpenses();
  } else {
    editEntry(entry);
  }
});

$('#m-prev').addEventListener('click', () => {
  viewMonth.setMonth(viewMonth.getMonth() - 1);
  renderMoney();
});
$('#m-next').addEventListener('click', () => {
  viewMonth.setMonth(viewMonth.getMonth() + 1);
  renderMoney();
});

// ===== Настройки и резервная копия =====
const currencies = ['₽', '₸', '$', '€', '₺', 'сом'];

function openSettings() {
  const list = currencies.includes(settings.currency) ? currencies : [...currencies, settings.currency];
  const last = settings.lastBackup
    ? new Date(settings.lastBackup).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'ещё не делали';
  openSheet({
    title: 'Настройки',
    body: `
      <label class="field">Валюта
        <select id="set-currency">${list.map((c) => `<option ${c === settings.currency ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <div class="backup">
        <b>Резервная копия</b>
        <p>Данные хранятся только на этом устройстве. Сохраняйте копию, чтобы не потерять их или перенести на другой телефон.</p>
        <p class="muted">Последняя копия: ${last}</p>
        <button type="button" class="primary" id="do-export">💾 Сохранить копию</button>
        <button type="button" class="ghost" id="do-import">📂 Восстановить из копии</button>
      </div>`,
  });
  $('#set-currency').addEventListener('change', (e) => {
    settings.currency = e.target.value;
    store.save('settings', settings);
    renderMoney();
  });
  $('#do-export').addEventListener('click', exportData);
  $('#do-import').addEventListener('click', () => $('#import-file').click());
}

$('#open-settings').addEventListener('click', openSettings);

async function exportData() {
  const data = { app: 'moy-den', version: 1, exportedAt: new Date().toISOString(), tasks, habits, expenses, settings };
  const name = `moy-den-${dayKey()}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  // На телефоне — меню «Поделиться» (Telegram, Google Диск, Файлы…), на компьютере — обычное скачивание
  const isPhone = matchMedia('(pointer: coarse)').matches;
  if (isPhone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Мой день — резервная копия' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      download(file);
    }
  } else {
    download(file);
  }
  settings.lastBackup = Date.now();
  store.save('settings', settings);
  sheet.close();
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert('Не удалось прочитать файл.');
    return;
  }
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.habits) || !Array.isArray(data.expenses)) {
    alert('Это не файл резервной копии «Мой день».');
    return;
  }
  const msg = `Заменить текущие данные данными из копии?\n\nЗадач: ${data.tasks.length}\nПривычек: ${data.habits.length}\nЗаписей в финансах: ${data.expenses.length}`;
  if (!confirm(msg)) return;

  // Берём только корректные записи, чтобы испорченный файл не сломал приложение
  tasks = data.tasks
    .filter((t) => t && typeof t.text === 'string')
    .map((t) => ({ id: String(t.id || uid()), text: t.text, done: !!t.done }));
  habits = data.habits
    .filter((h) => h && typeof h.name === 'string')
    .map((h) => ({
      id: String(h.id || uid()),
      name: h.name,
      days: Object.fromEntries(Object.keys(h.days || {}).filter(isDay).map((k) => [k, true])),
    }));
  expenses = data.expenses
    .filter((x) => x && Number(x.amount) > 0 && isDay(x.date))
    .map((x) => ({
      id: String(x.id || uid()),
      type: x.type === 'income' ? 'income' : 'expense',
      amount: Number(x.amount),
      cat: String(x.cat || 'other'),
      note: String(x.note || ''),
      date: x.date,
    }));
  if (typeof data.settings?.currency === 'string') settings.currency = data.settings.currency;

  store.save('tasks', tasks);
  store.save('habits', habits);
  store.save('expenses', expenses);
  store.save('settings', settings);
  sheet.close();
  renderAll();
  alert('Данные восстановлены ✅');
});

// ===== Запуск =====
function renderAll() {
  renderTasks();
  renderHabits();
  renderMoney();
}

setMoneyType('expense');
renderAll();
showTab(titles[currentTab] ? currentTab : 'tasks');

// Если приложение открыто долго и наступил новый день — обновляем привычки
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderHabits();
});

// Офлайн-режим
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
