"use strict";

const htmlCode = document.getElementById("htmlCode");
const cssCode = document.getElementById("cssCode");
const jsCode = document.getElementById("jsCode");
const preview = document.getElementById("preview");
const statusText = document.getElementById("status");
const consoleOutput = document.getElementById("consoleOutput");
const runButton = document.getElementById("runButton");
const saveButton = document.getElementById("saveButton");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const resetButton = document.getElementById("resetButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const clearConsoleButton = document.getElementById("clearConsoleButton");
const autoRun = document.getElementById("autoRun");

const storageKeys = {
  html: "codeEditorHTML",
  css: "codeEditorCSS",
  js: "codeEditorJavaScript",
  autoRun: "codeEditorAutoRun"
};

const sampleHTML = `<div class="card">
  <p class="label">Sample</p>
  <h1>コードを実行してみよう！</h1>
  <p id="message">ボタンを押すと文章が変わります。</p>
  <button id="changeButton">クリック</button>
</div>`;

const sampleCSS = `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #eef2ff;
  font-family: system-ui, sans-serif;
}

.card {
  width: min(420px, 90%);
  padding: 30px;
  text-align: center;
  background: white;
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
}

.label {
  color: #0f766e;
  font-weight: 700;
}

h1 {
  color: #1e3a8a;
}

button {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #0f766e;
  color: white;
  font-size: 16px;
  cursor: pointer;
}`;

const sampleJavaScript = `const button = document.getElementById("changeButton");
const message = document.getElementById("message");

button.addEventListener("click", () => {
  message.textContent = "JavaScriptが実行されました！";
  console.log("ボタンがクリックされました");
});`;

let autoRunTimer = null;
let lastGeneratedDocument = "";

function setStatus(message) {
  statusText.textContent = message;
}

function writeConsole(message, type = "log") {
  const prefix = type === "error" ? "Error" : type === "warn" ? "Warn" : "Log";
  const line = `[${prefix}] ${message}`;

  if (consoleOutput.textContent === "ログはまだありません。") {
    consoleOutput.textContent = line;
    return;
  }

  consoleOutput.textContent += `\n${line}`;
}

function clearConsole() {
  consoleOutput.textContent = "ログはまだありません。";
}

function setSampleCode() {
  htmlCode.value = sampleHTML;
  cssCode.value = sampleCSS;
  jsCode.value = sampleJavaScript;
}

function escapeClosingScript(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}

function buildPreviewDocument() {
  const html = htmlCode.value;
  const css = cssCode.value;
  const javascript = escapeClosingScript(jsCode.value);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
${css}
  </style>
</head>
<body>
${html}
  <script>
    const sendMessage = (type, message) => {
      window.parent.postMessage({
        source: "code-editor-preview",
        type,
        message: String(message)
      }, "*");
    };

    ["log", "warn", "error"].forEach((method) => {
      const original = console[method];

      console[method] = (...args) => {
        sendMessage(method, args.map((item) => {
          if (typeof item === "string") return item;

          try {
            return JSON.stringify(item);
          } catch (error) {
            return String(item);
          }
        }).join(" "));

        original.apply(console, args);
      };
    });

    window.addEventListener("error", (event) => {
      sendMessage("error", event.message);
    });

    window.addEventListener("unhandledrejection", (event) => {
      sendMessage("error", event.reason?.message || event.reason || "Promise error");
    });
  <\/script>
  <script>
${javascript}
  <\/script>
</body>
</html>`;
}

function runCode() {
  clearConsole();
  setStatus("実行中...");

  lastGeneratedDocument = buildPreviewDocument();
  preview.srcdoc = lastGeneratedDocument;

  window.setTimeout(() => {
    setStatus("実行しました");
  }, 200);
}

function saveCode(silent = false) {
  try {
    localStorage.setItem(storageKeys.html, htmlCode.value);
    localStorage.setItem(storageKeys.css, cssCode.value);
    localStorage.setItem(storageKeys.js, jsCode.value);
    localStorage.setItem(storageKeys.autoRun, String(autoRun.checked));

    if (!silent) {
      setStatus("保存しました");
    }
  } catch (error) {
    setStatus("保存できませんでした");
    writeConsole(error.message, "error");
  }
}

function loadCode() {
  const savedHTML = localStorage.getItem(storageKeys.html);
  const savedCSS = localStorage.getItem(storageKeys.css);
  const savedJavaScript = localStorage.getItem(storageKeys.js);
  const savedAutoRun = localStorage.getItem(storageKeys.autoRun);
  const hasSavedCode =
    savedHTML !== null ||
    savedCSS !== null ||
    savedJavaScript !== null;

  if (hasSavedCode) {
    htmlCode.value = savedHTML ?? "";
    cssCode.value = savedCSS ?? "";
    jsCode.value = savedJavaScript ?? "";
  } else {
    setSampleCode();
  }

  autoRun.checked = savedAutoRun === "true";
  runCode();
}

async function copyDocument() {
  const documentText = lastGeneratedDocument || buildPreviewDocument();

  try {
    await navigator.clipboard.writeText(documentText);
    setStatus("コピーしました");
  } catch (error) {
    setStatus("コピーできませんでした");
    writeConsole(error.message, "error");
  }
}

function downloadDocument() {
  const documentText = lastGeneratedDocument || buildPreviewDocument();
  const blob = new Blob([documentText], { type: "text/html" });
  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = "code-editor-project.html";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(link.href);
  }, 1000);

  setStatus("HTMLを保存しました");
}

function resetCode() {
  const shouldReset = window.confirm("入力したコードをサンプルコードに戻しますか？");

  if (!shouldReset) return;

  setSampleCode();
  runCode();
  saveCode(true);
  setStatus("リセットしました");
}

function scheduleAutoRun() {
  saveCode(true);

  if (!autoRun.checked) return;

  window.clearTimeout(autoRunTimer);
  autoRunTimer = window.setTimeout(runCode, 450);
}

function insertTab(event) {
  if (event.key !== "Tab") return;

  event.preventDefault();

  const textarea = event.target;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  textarea.value =
    textarea.value.substring(0, start) +
    "  " +
    textarea.value.substring(end);

  textarea.selectionStart = start + 2;
  textarea.selectionEnd = start + 2;

  scheduleAutoRun();
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    fullscreenButton.textContent = "拡大";
    return;
  }

  await preview.requestFullscreen();
  fullscreenButton.textContent = "戻る";
}

function handlePreviewMessage(event) {
  if (event.data?.source !== "code-editor-preview") return;

  writeConsole(event.data.message, event.data.type);

  if (event.data.type === "error") {
    setStatus("エラーがあります");
  }
}

[htmlCode, cssCode, jsCode].forEach((editor) => {
  editor.addEventListener("input", scheduleAutoRun);
  editor.addEventListener("keydown", insertTab);
});

runButton.addEventListener("click", runCode);
saveButton.addEventListener("click", saveCode);
copyButton.addEventListener("click", copyDocument);
downloadButton.addEventListener("click", downloadDocument);
resetButton.addEventListener("click", resetCode);
fullscreenButton.addEventListener("click", () => {
  toggleFullscreen().catch((error) => {
    setStatus("拡大できませんでした");
    writeConsole(error.message, "error");
  });
});
clearConsoleButton.addEventListener("click", clearConsole);

autoRun.addEventListener("change", () => {
  saveCode(true);
  if (autoRun.checked) runCode();
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "戻る" : "拡大";
});

document.addEventListener("keydown", (event) => {
  const isRunShortcut =
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter";

  if (isRunShortcut) {
    event.preventDefault();
    runCode();
  }
});

window.addEventListener("message", handlePreviewMessage);

loadCode();
