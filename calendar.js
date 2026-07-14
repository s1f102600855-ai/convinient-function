const calendarHeading = document.getElementById("calendar-heading");
const calendarGrid = document.getElementById("calendarGrid");
const selectedDateHeading = document.getElementById("selected-date-heading");
const eventSummary = document.getElementById("eventSummary");
const prevMonthButton = document.getElementById("prevMonthButton");
const nextMonthButton = document.getElementById("nextMonthButton");
const todayButton = document.getElementById("todayButton");
const eventForm = document.getElementById("eventForm");
const eventDateInput = document.getElementById("eventDate");
const eventTimeInput = document.getElementById("eventTime");
const eventTitleInput = document.getElementById("eventTitle");
const eventCategoryInput = document.getElementById("eventCategory");
const eventNoteInput = document.getElementById("eventNote");
const eventList = document.getElementById("eventList");
const exportCalendarButton = document.getElementById("exportCalendarButton");
const importCalendarButton = document.getElementById("importCalendarButton");
const importCalendarInput = document.getElementById("importCalendarInput");

const storageKey = "calendarEventsV1";
const backupVersion = 1;
const categoryLabels = {
  work: "仕事",
  personal: "私用",
  important: "重要",
  other: "その他"
};

let events = [];
let currentMonth = startOfMonth(new Date());
let selectedDate = toDateKey(new Date());

function createId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

function padNumber(number) {
  return String(number).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonth(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDate(dateKey) {
  const date = parseDateKey(dateKey);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${weekday}）`;
}

function loadEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) || [];
    events = normalizeEvents(saved);
  } catch (error) {
    events = [];
  }
}

function saveEvents() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(events));
    return true;
  } catch (error) {
    eventSummary.textContent =
      "保存できませんでした。ブラウザの保存容量や設定を確認してください。";
    return false;
  }
}

function normalizeEvents(rawEvents) {
  const source = Array.isArray(rawEvents) ? rawEvents : [];
  const seen = new Set();

  return source
    .map((event) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(event?.date || "")
        ? event.date
        : toDateKey(new Date());
      let id = String(event?.id || createId());

      while (seen.has(id)) {
        id = createId();
      }

      seen.add(id);

      return {
        id,
        date,
        time: String(event?.time || "").slice(0, 5),
        title: String(event?.title || "").trim().slice(0, 80),
        category: categoryLabels[event?.category] ? event.category : "other",
        note: String(event?.note || "").trim().slice(0, 300)
      };
    })
    .filter((event) => event.title);
}

function getEventsForDate(dateKey) {
  return events
    .filter((event) => event.date === dateKey)
    .sort((a, b) => {
      if (!a.time && b.time) return 1;
      if (a.time && !b.time) return -1;
      return a.time.localeCompare(b.time);
    });
}

function getEventCount(dateKey) {
  return events.filter((event) => event.date === dateKey).length;
}

function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  calendarHeading.textContent = formatMonth(currentMonth);
  calendarGrid.innerHTML = "";

  for (let index = 0; index < firstWeekday; index += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    calendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = toDateKey(date);
    const count = getEventCount(dateKey);
    const button = document.createElement("button");

    button.className = "calendar-day";
    if (dateKey === todayKey) button.classList.add("today");
    if (dateKey === selectedDate) button.classList.add("selected");
    button.type = "button";
    button.setAttribute("aria-label", `${formatDate(dateKey)} ${count}件の予定`);

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(day);

    const marker = document.createElement("span");
    marker.className = "calendar-event-marker";
    marker.textContent = count > 0 ? `${count}件` : "";

    button.appendChild(dayNumber);
    button.appendChild(marker);
    button.addEventListener("click", () => {
      selectedDate = dateKey;
      eventDateInput.value = dateKey;
      renderAll();
    });

    calendarGrid.appendChild(button);
  }
}

function renderSelectedDate() {
  const dayEvents = getEventsForDate(selectedDate);
  selectedDateHeading.textContent = formatDate(selectedDate);
  eventSummary.textContent =
    dayEvents.length > 0 ? `${dayEvents.length}件の予定があります。` : "予定はありません。";
  eventList.innerHTML = "";

  if (dayEvents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-events";
    empty.textContent = "この日の予定はまだありません。";
    eventList.appendChild(empty);
    return;
  }

  dayEvents.forEach((event) => {
    const item = document.createElement("article");
    item.className = `event-item ${event.category}`;

    const body = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = event.title;

    const meta = document.createElement("p");
    meta.textContent = `${event.time || "終日"} / ${categoryLabels[event.category] || "その他"}`;

    body.appendChild(title);
    body.appendChild(meta);

    if (event.note) {
      const note = document.createElement("p");
      note.className = "event-note";
      note.textContent = event.note;
      body.appendChild(note);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete";
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      deleteEvent(event.id);
    });

    item.appendChild(body);
    item.appendChild(deleteButton);
    eventList.appendChild(item);
  });
}

function renderAll() {
  renderCalendar();
  renderSelectedDate();
}

function addEvent(event) {
  events.push(event);
  const saved = saveEvents();

  if (saved) {
    selectedDate = event.date;
    currentMonth = startOfMonth(parseDateKey(event.date));
    renderAll();
  }
}

function deleteEvent(id) {
  const target = events.find((event) => event.id === id);
  if (!target) return;

  const ok = confirm(`「${target.title}」を削除しますか？`);
  if (!ok) return;

  events = events.filter((event) => event.id !== id);
  if (saveEvents()) {
    renderAll();
  }
}

function moveMonth(offset) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  renderAll();
}

function goToday() {
  const today = new Date();
  currentMonth = startOfMonth(today);
  selectedDate = toDateKey(today);
  eventDateInput.value = selectedDate;
  renderAll();
}

function exportBackup() {
  const backup = {
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    events
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `calendar-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  eventSummary.textContent = "バックアップファイルを作成しました。";
}

async function importBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data?.events)) {
      throw new Error("Invalid calendar backup");
    }

    const ok = confirm("現在の予定をバックアップ内容に置き換えます。よろしいですか？");
    if (!ok) return;

    events = normalizeEvents(data.events);
    selectedDate = events[0]?.date || toDateKey(new Date());
    currentMonth = startOfMonth(parseDateKey(selectedDate));
    eventDateInput.value = selectedDate;

    if (saveEvents()) {
      renderAll();
      eventSummary.textContent = "バックアップを読み込みました。";
    }
  } catch (error) {
    eventSummary.textContent = "読み込めませんでした。JSONファイルを確認してください。";
  }
}

eventForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = eventTitleInput.value.trim();
  const date = eventDateInput.value;

  if (!title || !date) return;

  addEvent({
    id: createId(),
    date,
    time: eventTimeInput.value,
    title,
    category: eventCategoryInput.value,
    note: eventNoteInput.value.trim()
  });

  eventTitleInput.value = "";
  eventTimeInput.value = "";
  eventNoteInput.value = "";
  eventTitleInput.focus();
});

eventDateInput.addEventListener("change", () => {
  if (!eventDateInput.value) return;

  selectedDate = eventDateInput.value;
  currentMonth = startOfMonth(parseDateKey(selectedDate));
  renderAll();
});

prevMonthButton.addEventListener("click", () => moveMonth(-1));
nextMonthButton.addEventListener("click", () => moveMonth(1));
todayButton.addEventListener("click", goToday);
exportCalendarButton.addEventListener("click", exportBackup);

importCalendarButton.addEventListener("click", () => {
  importCalendarInput.click();
});

importCalendarInput.addEventListener("change", () => {
  importBackup(importCalendarInput.files[0]).finally(() => {
    importCalendarInput.value = "";
  });
});

loadEvents();
eventDateInput.value = selectedDate;
renderAll();
