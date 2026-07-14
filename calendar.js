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
const googleSyncStatus = document.getElementById("googleSyncStatus");
const googleClientIdInput = document.getElementById("googleClientId");
const googleCalendarIdInput = document.getElementById("googleCalendarId");
const saveGoogleSettingsButton = document.getElementById("saveGoogleSettingsButton");
const connectGoogleButton = document.getElementById("connectGoogleButton");
const syncGoogleButton = document.getElementById("syncGoogleButton");
const importGoogleButton = document.getElementById("importGoogleButton");
const disconnectGoogleButton = document.getElementById("disconnectGoogleButton");

const storageKey = "calendarEventsV1";
const deletedGoogleEventsKey = "calendarDeletedGoogleEventsV1";
const googleSettingsKey = "calendarGoogleSettingsV1";
const backupVersion = 1;
const googleIdentityScriptUrl = "https://accounts.google.com/gsi/client";
const googleCalendarApiBase = "https://www.googleapis.com/calendar/v3";
const googleCalendarScope = "https://www.googleapis.com/auth/calendar.events";
const categoryLabels = {
  work: "仕事",
  personal: "私用",
  important: "重要",
  other: "その他"
};

let events = [];
let deletedGoogleEvents = [];
let currentMonth = startOfMonth(new Date());
let selectedDate = toDateKey(new Date());
let googleAccessToken = null;
let googleTokenClient = null;
let googleIdentityLoadPromise = null;

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

function loadGoogleSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(googleSettingsKey)) || {};
    googleClientIdInput.value = settings.clientId || "";
    googleCalendarIdInput.value = settings.calendarId || "primary";
  } catch (error) {
    googleClientIdInput.value = "";
    googleCalendarIdInput.value = "primary";
  }

  updateGoogleButtons();
}

function isValidGoogleClientId(clientId) {
  return /^[0-9a-zA-Z._-]+\.apps\.googleusercontent\.com$/.test(clientId);
}

function getGoogleClientIdValidationMessage(clientId) {
  if (!clientId) {
    return "OAuth Client IDを入力してください。";
  }

  if (clientId.includes("@")) {
    return "メールアドレスではなく、Google Cloudで作成したOAuth Client IDを入力してください。";
  }

  if (/^https?:\/\//i.test(clientId)) {
    return "サイトURLではなく、末尾が .apps.googleusercontent.com のOAuth Client IDを入力してください。";
  }

  if (!isValidGoogleClientId(clientId)) {
    return "OAuth Client IDは xxxxx.apps.googleusercontent.com の形式です。APIキーやURLは使えません。";
  }

  return "";
}

function saveGoogleSettings() {
  const clientId = googleClientIdInput.value.trim();
  const calendarId = googleCalendarIdInput.value.trim() || "primary";
  const validationMessage = getGoogleClientIdValidationMessage(clientId);

  if (validationMessage) {
    setGoogleStatus(validationMessage);
    updateGoogleButtons();
    return false;
  }

  localStorage.setItem(
    googleSettingsKey,
    JSON.stringify({
      clientId,
      calendarId
    })
  );

  googleCalendarIdInput.value = calendarId;
  googleTokenClient = null;
  googleSyncStatus.textContent = "Google連携設定を保存しました。";
  updateGoogleButtons();
  return true;
}

function getGoogleCalendarId() {
  return googleCalendarIdInput.value.trim() || "primary";
}

function updateGoogleButtons() {
  const clientId = googleClientIdInput.value.trim();
  const hasClientId = isValidGoogleClientId(clientId);
  const connected = Boolean(googleAccessToken);

  connectGoogleButton.disabled = !hasClientId;
  syncGoogleButton.disabled = !hasClientId || !connected;
  importGoogleButton.disabled = !hasClientId || !connected;
  disconnectGoogleButton.disabled = !connected;
}

function setGoogleStatus(message) {
  googleSyncStatus.textContent = message;
}

function loadEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) || [];
    events = normalizeEvents(saved);
  } catch (error) {
    events = [];
  }
}

function loadDeletedGoogleEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(deletedGoogleEventsKey)) || [];
    deletedGoogleEvents = Array.isArray(saved)
      ? saved
          .map((item) => ({
            calendarId: String(item?.calendarId || "primary"),
            eventId: String(item?.eventId || "")
          }))
          .filter((item) => item.eventId)
      : [];
  } catch (error) {
    deletedGoogleEvents = [];
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

function saveDeletedGoogleEvents() {
  try {
    localStorage.setItem(deletedGoogleEventsKey, JSON.stringify(deletedGoogleEvents));
  } catch (error) {
    googleSyncStatus.textContent = "Google削除キューを保存できませんでした。";
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });

      if (window.google?.accounts?.oauth2) {
        resolve();
      }

      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

function loadGoogleIdentity() {
  if (!googleIdentityLoadPromise) {
    googleIdentityLoadPromise = loadScript(googleIdentityScriptUrl);
  }

  return googleIdentityLoadPromise;
}

async function ensureGoogleToken(prompt = "") {
  const clientId = googleClientIdInput.value.trim();
  const validationMessage = getGoogleClientIdValidationMessage(clientId);

  if (validationMessage) {
    setGoogleStatus(validationMessage);
    updateGoogleButtons();
    return null;
  }

  await loadGoogleIdentity();

  if (!window.google?.accounts?.oauth2) {
    setGoogleStatus("Googleログイン機能を読み込めませんでした。");
    return null;
  }

  if (!googleTokenClient) {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: googleCalendarScope,
      callback: () => {}
    });
  }

  return new Promise((resolve, reject) => {
    googleTokenClient.callback = (response) => {
      if (response?.error) {
        googleAccessToken = null;
        updateGoogleButtons();
        reject(response);
        return;
      }

      googleAccessToken = response.access_token;
      setGoogleStatus("Googleに接続しました。");
      updateGoogleButtons();
      resolve(googleAccessToken);
    };

    googleTokenClient.requestAccessToken({ prompt });
  });
}

async function googleRequest(path, options = {}) {
  if (!googleAccessToken) {
    await ensureGoogleToken("");
  }

  if (!googleAccessToken) {
    throw new Error("Google authorization required");
  }

  const response = await fetch(`${googleCalendarApiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    googleAccessToken = null;
    updateGoogleButtons();
    throw new Error("Googleの認証期限が切れました。再接続してください。");
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || "Google Calendar APIでエラーが発生しました。");
  }

  return data;
}

function encodeCalendarId(calendarId = getGoogleCalendarId()) {
  return encodeURIComponent(calendarId);
}

function getNextDateKey(dateKey) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function createDateTime(dateKey, time) {
  const [hour, minute] = time.split(":").map(Number);
  const date = parseDateKey(dateKey);
  date.setHours(hour || 0, minute || 0, 0, 0);
  return date;
}

function eventToGoogleResource(event) {
  const resource = {
    summary: event.title,
    description: event.note || "",
    extendedProperties: {
      private: {
        convenientFunctionId: event.id,
        convenientFunctionCategory: event.category,
        convenientFunctionSource: "convenientfunction.com"
      }
    }
  };

  if (event.time) {
    const start = createDateTime(event.date, event.time);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    resource.start = { dateTime: start.toISOString() };
    resource.end = { dateTime: end.toISOString() };
  } else {
    resource.start = { date: event.date };
    resource.end = { date: getNextDateKey(event.date) };
  }

  return resource;
}

function googleEventToLocalEvent(googleEvent, calendarId) {
  const privateProperties = googleEvent.extendedProperties?.private || {};
  const start = googleEvent.start || {};
  let date = toDateKey(new Date());
  let time = "";

  if (start.dateTime) {
    const startDate = new Date(start.dateTime);
    date = toDateKey(startDate);
    time = `${padNumber(startDate.getHours())}:${padNumber(startDate.getMinutes())}`;
  } else if (start.date) {
    date = start.date;
  }

  return {
    id: privateProperties.convenientFunctionId || createId(),
    date,
    time,
    title: String(googleEvent.summary || "無題の予定").trim().slice(0, 80),
    category: categoryLabels[privateProperties.convenientFunctionCategory]
      ? privateProperties.convenientFunctionCategory
      : "other",
    note: String(googleEvent.description || "").trim().slice(0, 300),
    googleEventId: googleEvent.id || "",
    googleCalendarId: calendarId,
    googleSyncedAt: new Date().toISOString()
  };
}

async function upsertGoogleEvent(event, calendarId) {
  const calendarPath = `/calendars/${encodeCalendarId(calendarId)}/events`;
  const resource = eventToGoogleResource(event);
  let googleEvent;

  if (event.googleEventId && event.googleCalendarId === calendarId) {
    try {
      googleEvent = await googleRequest(`${calendarPath}/${encodeURIComponent(event.googleEventId)}`, {
        method: "PATCH",
        body: JSON.stringify(resource)
      });
    } catch (error) {
      if (!/Not Found|Resource has been deleted/i.test(error.message)) {
        throw error;
      }
    }
  }

  if (!googleEvent) {
    googleEvent = await googleRequest(calendarPath, {
      method: "POST",
      body: JSON.stringify(resource)
    });
  }

  event.googleEventId = googleEvent.id || event.googleEventId;
  event.googleCalendarId = calendarId;
  event.googleSyncedAt = new Date().toISOString();
}

async function deleteGoogleEventById(eventId, calendarId) {
  await googleRequest(
    `/calendars/${encodeCalendarId(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
}

async function deletePendingGoogleEvents(calendarId) {
  const remaining = [];

  for (const item of deletedGoogleEvents) {
    if (item.calendarId !== calendarId) {
      remaining.push(item);
      continue;
    }

    try {
      await deleteGoogleEventById(item.eventId, item.calendarId);
    } catch (error) {
      if (!/Not Found|Resource has been deleted|Gone/i.test(error.message)) {
        remaining.push(item);
      }
    }
  }

  deletedGoogleEvents = remaining;
  saveDeletedGoogleEvents();
}

async function importGoogleEventsForVisibleMonth(calendarId) {
  const timeMin = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
  const timeMax = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1).toISOString();
  const importedEvents = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      showDeleted: "false",
      orderBy: "startTime",
      maxResults: "250"
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const data = await googleRequest(
      `/calendars/${encodeCalendarId(calendarId)}/events?${params.toString()}`
    );

    importedEvents.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  let importedCount = 0;

  importedEvents.forEach((googleEvent) => {
    if (!googleEvent.id || googleEvent.status === "cancelled") return;

    const localEvent = googleEventToLocalEvent(googleEvent, calendarId);
    const existing = events.find((event) => {
      return (
        event.googleEventId === googleEvent.id ||
        event.id === localEvent.id
      );
    });

    if (existing) {
      Object.assign(existing, {
        ...localEvent,
        id: existing.id
      });
    } else {
      events.push(localEvent);
    }

    importedCount += 1;
  });

  return importedCount;
}

async function syncGoogleCalendar() {
  try {
    setGoogleStatus("Googleと同期しています...");
    await ensureGoogleToken(googleAccessToken ? "" : "consent");
    if (!googleAccessToken) return;

    const calendarId = getGoogleCalendarId();
    await deletePendingGoogleEvents(calendarId);

    for (const event of events) {
      await upsertGoogleEvent(event, calendarId);
    }

    const importedCount = await importGoogleEventsForVisibleMonth(calendarId);

    if (saveEvents()) {
      renderAll();
      setGoogleStatus(`同期しました。Googleから${importedCount}件を確認しました。`);
    }
  } catch (error) {
    setGoogleStatus(error.message || "Google同期に失敗しました。");
  } finally {
    updateGoogleButtons();
  }
}

async function importVisibleGoogleMonth() {
  try {
    setGoogleStatus("Googleカレンダーから取り込んでいます...");
    await ensureGoogleToken(googleAccessToken ? "" : "consent");
    if (!googleAccessToken) return;

    const importedCount = await importGoogleEventsForVisibleMonth(getGoogleCalendarId());

    if (saveEvents()) {
      renderAll();
      setGoogleStatus(`表示月の予定を${importedCount}件確認しました。`);
    }
  } catch (error) {
    setGoogleStatus(error.message || "Googleカレンダーの取り込みに失敗しました。");
  } finally {
    updateGoogleButtons();
  }
}

function disconnectGoogle() {
  if (googleAccessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(googleAccessToken, () => {});
  }

  googleAccessToken = null;
  googleTokenClient = null;
  setGoogleStatus("Google連携を切断しました。");
  updateGoogleButtons();
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
        note: String(event?.note || "").trim().slice(0, 300),
        googleEventId: event?.googleEventId ? String(event.googleEventId) : "",
        googleCalendarId: event?.googleCalendarId ? String(event.googleCalendarId) : "",
        googleSyncedAt: event?.googleSyncedAt ? String(event.googleSyncedAt) : ""
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

    if (event.googleEventId) {
      const syncBadge = document.createElement("p");
      syncBadge.className = "event-sync-badge";
      syncBadge.textContent = "Google同期済み";
      body.appendChild(syncBadge);
    }

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

  if (target.googleEventId) {
    deletedGoogleEvents.push({
      calendarId: target.googleCalendarId || getGoogleCalendarId(),
      eventId: target.googleEventId
    });
    saveDeletedGoogleEvents();
  }

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

saveGoogleSettingsButton.addEventListener("click", saveGoogleSettings);

googleClientIdInput.addEventListener("input", updateGoogleButtons);
googleCalendarIdInput.addEventListener("input", updateGoogleButtons);

connectGoogleButton.addEventListener("click", async () => {
  const saved = saveGoogleSettings();

  if (!saved) {
    return;
  }

  try {
    setGoogleStatus("Googleに接続しています...");
    await ensureGoogleToken("consent");
  } catch (error) {
    setGoogleStatus(error.message || "Google接続に失敗しました。");
  }
});

syncGoogleButton.addEventListener("click", syncGoogleCalendar);
importGoogleButton.addEventListener("click", importVisibleGoogleMonth);
disconnectGoogleButton.addEventListener("click", disconnectGoogle);

loadGoogleSettings();
loadEvents();
loadDeletedGoogleEvents();
eventDateInput.value = selectedDate;
renderAll();
