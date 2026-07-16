const pythonCode = document.getElementById("pythonCode");
const pythonOutput = document.getElementById("pythonOutput");
const pythonStatus = document.getElementById("pythonStatus");
const runPythonButton = document.getElementById("runPythonButton");
const stopPythonButton = document.getElementById("stopPythonButton");
const savePythonButton = document.getElementById("savePythonButton");
const copyPythonButton = document.getElementById("copyPythonButton");
const copyPythonOutputButton = document.getElementById("copyPythonOutputButton");
const downloadPythonButton = document.getElementById("downloadPythonButton");
const resetPythonButton = document.getElementById("resetPythonButton");
const clearPythonOutputButton = document.getElementById("clearPythonOutputButton");
const autoSavePython = document.getElementById("autoSavePython");
const lessonTabs = document.getElementById("lessonTabs");
const lessonProgress = document.getElementById("lessonProgress");
const lessonTitle = document.getElementById("lessonTitle");
const lessonDescription = document.getElementById("lessonDescription");
const lessonPoints = document.getElementById("lessonPoints");
const lessonChallenge = document.getElementById("lessonChallenge");
const insertLessonButton = document.getElementById("insertLessonButton");
const runLessonButton = document.getElementById("runLessonButton");
const nextLessonButton = document.getElementById("nextLessonButton");

const pythonStorageKey = "pythonEditorCodeV1";
const pythonWorkerUrl = "python-worker.js?v=20260716-runfix";
const defaultPythonCode = `# ブラウザ内でPythonを実行できます
name = "便利サイト"
numbers = [1, 2, 3, 4, 5]

print(f"Hello, {name}!")
print("合計:", sum(numbers))
print("2乗:", [number ** 2 for number in numbers])
`;

let pythonWorker = null;
let activeRunId = 0;
let saveTimer = null;
let pythonEditor = null;
let currentLessonIndex = 0;

const pythonLessons = [
  {
    title: "変数とprint",
    description: "変数に値を入れて、printで画面に表示する基本を練習します。",
    points: [
      "文字は引用符で囲みます。",
      "変数名は内容が分かる名前にすると読みやすくなります。",
      "f文字列を使うと、文字と変数を組み合わせて表示できます。"
    ],
    challenge: "nameやfavoriteを書き換えて、自分用の自己紹介文を作ってみましょう。",
    code: `# 変数とprint
name = "便利サイト"
favorite = "Python"

print("こんにちは")
print(f"私は{name}で{favorite}を学習しています。")
`
  },
  {
    title: "ifで条件分岐",
    description: "条件によって処理を変えるif文を練習します。",
    points: [
      "条件の後ろにはコロンを書きます。",
      "条件に当てはまる処理はインデントします。",
      "elseは条件に当てはまらない場合の処理です。"
    ],
    challenge: "scoreの数字を変えて、表示される結果がどう変わるか試してみましょう。",
    code: `# ifで条件分岐
score = 82

if score >= 80:
    print("よくできました")
elif score >= 60:
    print("合格です")
else:
    print("もう一度練習しましょう")
`
  },
  {
    title: "forで繰り返し",
    description: "同じような処理を何度も行うfor文を練習します。",
    points: [
      "forはリストの中身を1つずつ取り出します。",
      "繰り返す処理はインデントします。",
      "rangeを使うと回数を指定した繰り返しもできます。"
    ],
    challenge: "itemsに好きな単語を追加して、表示が増えるか確認しましょう。",
    code: `# forで繰り返し
items = ["メモ", "カレンダー", "Python"]

for item in items:
    print(f"{item}を確認しました")

for number in range(1, 4):
    print(f"{number}回目の練習")
`
  },
  {
    title: "リストと合計",
    description: "複数の値をまとめるリストと、合計・平均の出し方を練習します。",
    points: [
      "リストは角かっこで作ります。",
      "sumで合計、lenで個数を調べられます。",
      "計算結果を変数に入れると後で使いやすくなります。"
    ],
    challenge: "scoresの点数を増やして、合計と平均がどう変わるか見てみましょう。",
    code: `# リストと合計
scores = [72, 88, 91, 65]

total = sum(scores)
average = total / len(scores)

print(f"合計: {total}")
print(f"平均: {average}")
`
  },
  {
    title: "関数を作る",
    description: "よく使う処理をまとめる関数を練習します。",
    points: [
      "defで関数を作ります。",
      "returnで結果を返します。",
      "同じ処理を何度も使いたいときに便利です。"
    ],
    challenge: "priceやcountを変えて、合計金額を計算してみましょう。",
    code: `# 関数を作る
def calc_total(price, count):
    return price * count

apple_total = calc_total(120, 3)
orange_total = calc_total(90, 5)

print(f"りんご: {apple_total}円")
print(f"オレンジ: {orange_total}円")
print(f"合計: {apple_total + orange_total}円")
`
  }
];

function setPythonStatus(message) {
  pythonStatus.textContent = message;
}

function setRunning(isRunning) {
  runPythonButton.disabled = isRunning;
  stopPythonButton.disabled = !isRunning;
}

function formatWorkerError(event) {
  const parts = [];

  if (event.message) {
    parts.push(event.message);
  }

  if (event.filename) {
    const location = [event.filename, event.lineno, event.colno].filter(Boolean).join(":");
    parts.push(location);
  }

  return parts.join("\n") || "Python実行環境を読み込めませんでした。";
}

function getPythonCode() {
  if (pythonEditor) {
    return pythonEditor.getValue();
  }

  return pythonCode.value;
}

function setPythonCode(code) {
  if (pythonEditor) {
    pythonEditor.setValue(code);
    return;
  }

  pythonCode.value = code;
}

function loadPythonCode() {
  try {
    return localStorage.getItem(pythonStorageKey) || defaultPythonCode;
  } catch (error) {
    return defaultPythonCode;
  }
}

function setupPythonEditor() {
  const initialCode = loadPythonCode();

  pythonCode.value = initialCode;

  if (!window.CodeMirror) {
    pythonCode.classList.add("python-fallback-textarea");
    pythonCode.addEventListener("input", scheduleSave);
    setPythonStatus("通常入力モードで起動しました。");
    return;
  }

  pythonEditor = window.CodeMirror.fromTextArea(pythonCode, {
    mode: "python",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    smartIndent: true,
    electricChars: true,
    viewportMargin: 20,
    extraKeys: {
      Enter: "newlineAndIndent",
      "Ctrl-Enter": runPython,
      "Cmd-Enter": runPython,
      "Ctrl-S": savePythonCode,
      "Cmd-S": savePythonCode,
      "Shift-Tab"(editor) {
        editor.execCommand("indentLess");
      },
      Tab(editor) {
        if (editor.somethingSelected()) {
          editor.execCommand("indentMore");
          return;
        }

        editor.replaceSelection(" ".repeat(editor.getOption("indentUnit")), "end");
      }
    }
  });

  pythonEditor.on("change", () => {
    scheduleSave();
  });

  window.setTimeout(() => {
    pythonEditor.refresh();
  }, 0);

  setPythonStatus("準備完了");
}

function renderLesson() {
  const lesson = pythonLessons[currentLessonIndex];

  lessonProgress.textContent = `${currentLessonIndex + 1} / ${pythonLessons.length}`;
  lessonTitle.textContent = lesson.title;
  lessonDescription.textContent = lesson.description;
  lessonChallenge.textContent = lesson.challenge;
  lessonPoints.innerHTML = "";

  lesson.points.forEach((point) => {
    const item = document.createElement("li");
    item.textContent = point;
    lessonPoints.appendChild(item);
  });

  Array.from(lessonTabs.children).forEach((button, index) => {
    const isActive = index === currentLessonIndex;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });
}

function selectLesson(index) {
  currentLessonIndex = (index + pythonLessons.length) % pythonLessons.length;
  renderLesson();
}

function insertCurrentLessonCode() {
  const lesson = pythonLessons[currentLessonIndex];

  setPythonCode(lesson.code);
  scheduleSave();

  if (pythonEditor) {
    pythonEditor.focus();
  } else {
    pythonCode.focus();
  }

  setPythonStatus(`「${lesson.title}」のコードを入れました。`);
}

function runCurrentLessonCode() {
  insertCurrentLessonCode();
  runPython();
}

function setupPythonLessons() {
  pythonLessons.forEach((lesson, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lesson-tab";
    button.role = "tab";
    button.textContent = `${index + 1}. ${lesson.title}`;
    button.addEventListener("click", () => selectLesson(index));
    lessonTabs.appendChild(button);
  });

  insertLessonButton.addEventListener("click", insertCurrentLessonCode);
  runLessonButton.addEventListener("click", runCurrentLessonCode);
  nextLessonButton.addEventListener("click", () => selectLesson(currentLessonIndex + 1));

  renderLesson();
}

function createPythonWorker() {
  if (pythonWorker) {
    return pythonWorker;
  }

  pythonWorker = new Worker(pythonWorkerUrl, { type: "module" });

  pythonWorker.addEventListener("message", (event) => {
    const data = event.data || {};

    if (data.runId && data.runId !== activeRunId) {
      return;
    }

    if (data.type === "status") {
      setPythonStatus(data.message);
      return;
    }

    if (data.type === "output") {
      pythonOutput.textContent = data.output || "出力はありません。";
      setPythonStatus(data.error ? "エラーがあります。" : "実行が完了しました。");
      setRunning(false);
      return;
    }

    if (data.type === "error") {
      pythonOutput.textContent = data.message || "実行中にエラーが発生しました。";
      setPythonStatus("実行に失敗しました。");
      setRunning(false);
    }
  });

  pythonWorker.addEventListener("error", (event) => {
    pythonOutput.textContent = formatWorkerError(event);
    setPythonStatus("実行環境の読み込みに失敗しました。");
    setRunning(false);
  });

  return pythonWorker;
}

function stopPython() {
  activeRunId += 1;

  if (pythonWorker) {
    pythonWorker.terminate();
    pythonWorker = null;
  }

  setRunning(false);
  setPythonStatus("停止しました。");
}

function runPython() {
  activeRunId += 1;
  const runId = activeRunId;
  let worker = null;

  pythonOutput.textContent = "";
  setRunning(true);
  setPythonStatus("Pythonを準備しています...");

  try {
    worker = createPythonWorker();
  } catch (error) {
    pythonOutput.textContent = error?.message || "Python実行環境を起動できませんでした。";
    setPythonStatus("実行環境の起動に失敗しました。");
    setRunning(false);
    return;
  }

  worker.postMessage({
    type: "run",
    runId,
    code: getPythonCode()
  });
}

function savePythonCode() {
  try {
    localStorage.setItem(pythonStorageKey, getPythonCode());
    setPythonStatus("保存しました。");
  } catch (error) {
    setPythonStatus("保存できませんでした。ブラウザの保存容量を確認してください。");
  }
}

function scheduleSave() {
  if (!autoSavePython.checked) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePythonCode, 500);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setPythonStatus(successMessage);
  } catch (error) {
    setPythonStatus("コピーできませんでした。");
  }
}

function downloadPythonFile() {
  const blob = new Blob([getPythonCode()], { type: "text/x-python" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "python-code.py";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setPythonStatus(".pyファイルを作成しました。");
}

function resetPythonCode() {
  const ok = confirm("Pythonコードを初期状態に戻しますか？");
  if (!ok) return;

  setPythonCode(defaultPythonCode);
  savePythonCode();
  setPythonStatus("初期コードに戻しました。");
}

runPythonButton.addEventListener("click", runPython);
stopPythonButton.addEventListener("click", stopPython);
savePythonButton.addEventListener("click", savePythonCode);
copyPythonButton.addEventListener("click", () => {
  copyText(getPythonCode(), "コードをコピーしました。");
});
copyPythonOutputButton.addEventListener("click", () => {
  copyText(pythonOutput.textContent, "実行結果をコピーしました。");
});
downloadPythonButton.addEventListener("click", downloadPythonFile);
resetPythonButton.addEventListener("click", resetPythonCode);
clearPythonOutputButton.addEventListener("click", () => {
  pythonOutput.textContent = "";
  setPythonStatus("実行結果を消去しました。");
});

setupPythonEditor();
setupPythonLessons();
