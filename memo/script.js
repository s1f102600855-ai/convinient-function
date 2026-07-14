const titleInput = document.getElementById("title");
const bodyEditor = document.getElementById("body");
const memoList = document.getElementById("memoList");
const folderList = document.getElementById("folderList");
const folderSelect = document.getElementById("folderSelect");
const statusText = document.getElementById("status");
const charCount = document.getElementById("charCount");
const wordCount = document.getElementById("wordCount");
const newMemoButton = document.getElementById("newMemoButton");
const newFolderButton = document.getElementById("newFolderButton");
const deleteButton = document.getElementById("deleteButton");
const imageButton = document.getElementById("imageButton");
const imageInput = document.getElementById("imageInput");
const restoreButton = document.getElementById("restoreButton");
const exportButton = document.getElementById("exportButton");
const importButton = document.getElementById("importButton");
const importInput = document.getElementById("importInput");

const storageKey = "memoAppDataV2";
const oldStorageKey = "memos";
const backupVersion = 1;

let folders = [];
let memos = [];
let currentFolderId = "all";
let currentId = null;
let autoSaveTimer = null;

function createId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

function defaultFolder() {
  return {
    id: "default",
    name: "未分類"
  };
}

function loadData() {
  try {
    const savedData = localStorage.getItem(storageKey);

    if (savedData) {
      const data = JSON.parse(savedData);
      folders = data.folders || [defaultFolder()];
      memos = data.memos || [];
    } else {
      folders = [defaultFolder()];

      const oldMemos = JSON.parse(localStorage.getItem(oldStorageKey)) || [];
      memos = oldMemos.map((memo) => ({
        id: String(memo.id || createId()),
        title: memo.title || "",
        body: memo.body || "",
        folderId: "default",
        history: []
      }));
    }
  } catch (error) {
    folders = [defaultFolder()];
    memos = [];
  }

  if (folders.length === 0) {
    folders = [defaultFolder()];
  }

  const folderIds = new Set(folders.map((folder) => folder.id));

  memos = memos.map((memo) => ({
    id: String(memo.id || createId()),
    title: memo.title || "",
    body: memo.body || "",
    folderId: folderIds.has(memo.folderId) ? memo.folderId : "default",
    history: memo.history || []
  }));

  currentId = memos[0]?.id || null;
}

function saveData() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ folders, memos }));
    return true;
  } catch (error) {
    if (error?.name === "QuotaExceededError" || error?.code === 22) {
      statusText.textContent =
        "保存容量がいっぱいです。画像を減らすか、バックアップを保存してください。";
    } else {
      statusText.textContent =
        "保存できませんでした。ブラウザの保存設定を確認してください。";
    }

    return false;
  }
}

function getCurrentMemo() {
  return memos.find((memo) => memo.id === currentId);
}

function getVisibleMemos() {
  if (currentFolderId === "all") {
    return memos;
  }

  return memos.filter((memo) => memo.folderId === currentFolderId);
}

function pushHistory(memo) {
  const last = memo.history[memo.history.length - 1];

  if (
    last &&
    last.title === memo.title &&
    last.body === memo.body &&
    last.folderId === memo.folderId
  ) {
    return;
  }

  memo.history.push({
    title: memo.title,
    body: memo.body,
    folderId: memo.folderId,
    savedAt: new Date().toISOString()
  });

  if (memo.history.length > 30) {
    memo.history.shift();
  }
}

function countWords(text) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return 0;
  }

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

    return [...segmenter.segment(normalizedText)].filter((segment) => {
      return segment.isWordLike;
    }).length;
  }

  const words = normalizedText.match(
    /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?|[\u3040-\u30ff\u3400-\u9fff]+/g
  );

  return words ? words.length : 0;
}

function updateCounts() {
  const text = bodyEditor.innerText || "";

  charCount.textContent = [...text.trim()].length;
  wordCount.textContent = countWords(text);
}

function updateButtons() {
  const memo = getCurrentMemo();
  restoreButton.disabled = !memo || memo.history.length === 0;
  deleteButton.disabled = !memo;
}

function renderFolders() {
  folderList.innerHTML = "";

  const allFolder = document.createElement("div");
  allFolder.className = "folder" + (currentFolderId === "all" ? " active" : "");
  allFolder.textContent = `すべてのメモ（${memos.length}）`;

  allFolder.addEventListener("click", () => {
    currentFolderId = "all";
    renderAll();
  });

  folderList.appendChild(allFolder);

  folders.forEach((folder) => {
    const count = memos.filter((memo) => memo.folderId === folder.id).length;

    const div = document.createElement("div");
    div.className = "folder" + (folder.id === currentFolderId ? " active" : "");
    div.textContent = `${folder.name}（${count}）`;

    div.addEventListener("click", () => {
      currentFolderId = folder.id;
      renderAll();
    });

    folderList.appendChild(div);
  });
}

function renderFolderSelect() {
  folderSelect.innerHTML = "";

  folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  });

  const memo = getCurrentMemo();
  folderSelect.value = memo?.folderId || "default";
}

function renderList() {
  memoList.innerHTML = "";

  const visibleMemos = getVisibleMemos();

  if (visibleMemos.length === 0) {
    const empty = document.createElement("div");
    empty.className = "note";
    empty.textContent = "このフォルダにメモはありません";
    memoList.appendChild(empty);
    return;
  }

  visibleMemos.forEach((memo) => {
    const div = document.createElement("div");
    div.className = "note" + (memo.id === currentId ? " active" : "");

    const header = document.createElement("div");
    header.className = "note-header";

    const title = document.createElement("div");
    title.className = "note-title";
    title.textContent = memo.title || "無題のメモ";

    const select = document.createElement("select");
    select.className = "note-folder-select";
    select.setAttribute("aria-label", "メモのフォルダ");

    folders.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.name;
      select.appendChild(option);
    });

    select.value = memo.folderId;

    select.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    select.addEventListener("change", (event) => {
      event.stopPropagation();

      if (memo.folderId !== select.value) {
        pushHistory(memo);
        memo.folderId = select.value;
        const saved = saveData();

        if (!saved) {
          return;
        }
      }

      if (memo.id === currentId) {
        folderSelect.value = select.value;
      }

      renderAll();
      statusText.textContent = "フォルダを変更しました";
    });

    header.appendChild(title);
    header.appendChild(select);
    div.appendChild(header);

    div.addEventListener("click", () => {
      selectMemo(memo.id);
    });

    memoList.appendChild(div);
  });
}

function renderAll() {
  renderFolders();
  renderFolderSelect();
  renderList();
  updateButtons();
}

function selectMemo(id) {
  currentId = id;

  const memo = getCurrentMemo();

  titleInput.value = memo?.title || "";
  bodyEditor.innerHTML = memo?.body || "";

  updateCounts();
  renderAll();

  statusText.textContent = "保存済み";
}

function newFolder() {
  const name = prompt("フォルダ名を入力してください");

  if (!name || !name.trim()) return;

  const folder = {
    id: createId(),
    name: name.trim()
  };

  folders.push(folder);
  currentFolderId = folder.id;

  saveData();
  renderAll();
}

function newMemo() {
  const folderId = currentFolderId === "all" ? "default" : currentFolderId;

  const memo = {
    id: createId(),
    title: "",
    body: "",
    folderId,
    history: []
  };

  memos.unshift(memo);
  currentId = memo.id;

  saveData();
  selectMemo(currentId);

  titleInput.focus();
}

function autoSaveMemo() {
  if (!currentId) {
    newMemo();
  }

  const memo = getCurrentMemo();
  if (!memo) return;

  const newTitle = titleInput.value;
  const newBody = bodyEditor.innerHTML;
  const newFolderId = folderSelect.value;

  if (
    memo.title !== newTitle ||
    memo.body !== newBody ||
    memo.folderId !== newFolderId
  ) {
    pushHistory(memo);
  }

  memo.title = newTitle;
  memo.body = newBody;
  memo.folderId = newFolderId;

  const saved = saveData();
  renderAll();
  updateCounts();

  if (!saved) {
    return;
  }

  const now = new Date();
  statusText.textContent =
    `自動保存しました ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function startAutoSave() {
  statusText.textContent = "保存中...";

  clearTimeout(autoSaveTimer);

  autoSaveTimer = setTimeout(() => {
    autoSaveMemo();
  }, 600);
}

function handleBodyInput() {
  updateCounts();
  startAutoSave();
}

function restorePreviousSavedState() {
  const memo = getCurrentMemo();

  if (!memo || memo.history.length === 0) return;

  const previous = memo.history.pop();

  memo.title = previous.title;
  memo.body = previous.body;
  memo.folderId = previous.folderId || "default";

  titleInput.value = memo.title;
  bodyEditor.innerHTML = memo.body;
  folderSelect.value = memo.folderId;

  const saved = saveData();
  renderAll();
  updateCounts();

  if (saved) {
    statusText.textContent = "ひとつ前の保存状態に戻しました";
  }
}

function insertHtmlAtCursor(html) {
  bodyEditor.focus();

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    bodyEditor.insertAdjacentHTML("beforeend", html);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const fragment = document.createDocumentFragment();
  let lastNode = null;

  while (wrapper.firstChild) {
    lastNode = fragment.appendChild(wrapper.firstChild);
  }

  range.insertNode(fragment);

  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function insertImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const imageHtml = `<img src="${reader.result}" alt="貼り付けた画像">`;
    insertHtmlAtCursor(imageHtml);
    updateCounts();
    startAutoSave();
  });

  reader.readAsDataURL(file);
}

function deleteMemo() {
  const memo = getCurrentMemo();
  if (!memo) return;

  const title = memo.title || "無題のメモ";
  const ok = confirm(`「${title}」を削除しますか？`);

  if (!ok) return;

  memos = memos.filter((item) => item.id !== memo.id);
  const saved = saveData();

  if (!saved) {
    return;
  }

  currentId = getVisibleMemos()[0]?.id || memos[0]?.id || null;

  if (currentId) {
    selectMemo(currentId);
  } else {
    titleInput.value = "";
    bodyEditor.innerHTML = "";
    updateCounts();
    renderAll();
    statusText.textContent = "メモがありません";
  }
}

function normalizeFolders(rawFolders) {
  const source = Array.isArray(rawFolders) ? rawFolders : [];
  const seen = new Set();
  const normalized = [];

  source.forEach((folder) => {
    const id = String(folder?.id || createId());
    const name = String(folder?.name || "").trim();

    if (!name || seen.has(id)) return;

    seen.add(id);
    normalized.push({ id, name });
  });

  if (!seen.has("default")) {
    normalized.unshift(defaultFolder());
  }

  return normalized.length > 0 ? normalized : [defaultFolder()];
}

function normalizeMemos(rawMemos, folderIds) {
  const source = Array.isArray(rawMemos) ? rawMemos : [];
  const seen = new Set();

  return source.map((memo) => {
    let id = String(memo?.id || createId());

    while (seen.has(id)) {
      id = createId();
    }

    seen.add(id);

    const history = Array.isArray(memo?.history)
      ? memo.history.slice(-30).map((item) => ({
          title: String(item?.title || ""),
          body: String(item?.body || ""),
          folderId: folderIds.has(item?.folderId) ? item.folderId : "default",
          savedAt: String(item?.savedAt || "")
        }))
      : [];

    const folderId = folderIds.has(memo?.folderId) ? memo.folderId : "default";

    return {
      id,
      title: String(memo?.title || ""),
      body: String(memo?.body || ""),
      folderId,
      history
    };
  });
}

function exportBackup() {
  const backup = {
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    folders,
    memos
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `memo-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  statusText.textContent = "バックアップファイルを作成しました";
}

async function importBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data?.folders) || !Array.isArray(data?.memos)) {
      throw new Error("Invalid memo backup");
    }

    const ok = confirm("現在のメモをバックアップ内容に置き換えます。よろしいですか？");
    if (!ok) return;

    const nextFolders = normalizeFolders(data.folders);
    const folderIds = new Set(nextFolders.map((folder) => folder.id));
    const nextMemos = normalizeMemos(data.memos, folderIds);

    folders = nextFolders;
    memos = nextMemos;
    currentFolderId = "all";
    currentId = memos[0]?.id || null;

    const saved = saveData();

    if (!saved) {
      return;
    }

    if (currentId) {
      selectMemo(currentId);
    } else {
      newMemo();
    }

    statusText.textContent = "バックアップを読み込みました";
  } catch (error) {
    statusText.textContent = "読み込めませんでした。JSONファイルを確認してください。";
  }
}

titleInput.addEventListener("input", startAutoSave);
bodyEditor.addEventListener("input", handleBodyInput);

folderSelect.addEventListener("change", () => {
  startAutoSave();
});

bodyEditor.addEventListener("paste", (event) => {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      event.preventDefault();
      insertImageFile(item.getAsFile());
      return;
    }
  }

  setTimeout(updateCounts, 0);
});

imageButton.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  insertImageFile(file);
  imageInput.value = "";
});

exportButton.addEventListener("click", exportBackup);

importButton.addEventListener("click", () => {
  importInput.click();
});

importInput.addEventListener("change", () => {
  importBackup(importInput.files[0]).finally(() => {
    importInput.value = "";
  });
});

newFolderButton.addEventListener("click", newFolder);
newMemoButton.addEventListener("click", newMemo);
deleteButton.addEventListener("click", deleteMemo);
restoreButton.addEventListener("click", restorePreviousSavedState);

loadData();

if (memos.length === 0) {
  newMemo();
} else {
  selectMemo(currentId);
}

updateCounts();
