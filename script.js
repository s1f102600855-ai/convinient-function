const titleInput = document.getElementById("title");
const bodyEditor = document.getElementById("body");
const memoList = document.getElementById("memoList");
const folderList = document.getElementById("folderList");
const folderSelect = document.getElementById("folderSelect");
const statusText = document.getElementById("status");
const charCount = document.getElementById("charCount");
const newMemoButton = document.getElementById("newMemoButton");
const newFolderButton = document.getElementById("newFolderButton");
const deleteButton = document.getElementById("deleteButton");
const imageButton = document.getElementById("imageButton");
const imageInput = document.getElementById("imageInput");
const restoreButton = document.getElementById("restoreButton");

const storageKey = "memoAppDataV2";
const oldStorageKey = "memos";

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

  memos = memos.map((memo) => ({
    id: String(memo.id || createId()),
    title: memo.title || "",
    body: memo.body || "",
    folderId: memo.folderId || "default",
    history: memo.history || []
  }));

  currentId = memos[0]?.id || null;
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify({ folders, memos }));
}

function getCurrentMemo() {
  return memos.find((memo) => memo.id === currentId);
}

function getFolderName(folderId) {
  return folders.find((folder) => folder.id === folderId)?.name || "未分類";
}

function getVisibleMemos() {
  if (currentFolderId === "all") {
    return memos;
  }

  return memos.filter((memo) => memo.folderId === currentFolderId);
}

function pushHistory(memo) {
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

function updateCharCount() {
  charCount.textContent = [...bodyEditor.innerText.trim()].length;
}

function updateRestoreButton() {
  const memo = getCurrentMemo();
  restoreButton.disabled = !memo || memo.history.length === 0;
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
        saveData();
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
  updateRestoreButton();
}

function selectMemo(id) {
  currentId = id;

  const memo = getCurrentMemo();

  titleInput.value = memo?.title || "";
  bodyEditor.innerHTML = memo?.body || "";

  updateCharCount();
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

  saveData();
  renderAll();
  updateCharCount();

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

  saveData();
  renderAll();
  updateCharCount();

  statusText.textContent = "ひとつ前の保存状態に戻しました";
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
    const imageHtml = `<img src="${reader.result}" alt="貼り付けた写真">`;
    insertHtmlAtCursor(imageHtml);
    startAutoSave();
  });

  reader.readAsDataURL(file);
}

function deleteMemo() {
  if (!currentId) return;

  memos = memos.filter((memo) => memo.id !== currentId);
  saveData();

  currentId = getVisibleMemos()[0]?.id || memos[0]?.id || null;

  if (currentId) {
    selectMemo(currentId);
  } else {
    titleInput.value = "";
    bodyEditor.innerHTML = "";
    updateCharCount();
    renderAll();
    statusText.textContent = "メモがありません";
  }
}

titleInput.addEventListener("input", startAutoSave);
bodyEditor.addEventListener("input", startAutoSave);

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
});

imageButton.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  insertImageFile(file);
  imageInput.value = "";
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