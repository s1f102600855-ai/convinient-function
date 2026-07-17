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
    pythonEditor.save();
    window.setTimeout(() => pythonEditor.refresh(), 0);
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

function insertPythonSample(sampleId) {
  const template = document.getElementById(sampleId);
  if (!template) return;

  const code = `${template.content.textContent.trim()}\n`;
  setPythonCode(code);
  clearTimeout(saveTimer);
  saveTimer = null;

  try {
    localStorage.setItem(pythonStorageKey, code);
  } catch (error) {
    // サンプル挿入自体は続けます。
  }

  pythonOutput.textContent = "まだ実行していません。";
  setPythonStatus("サンプルコードを入れました。実行できます。");

  const runner = document.getElementById("pythonLearningRunner") || document.querySelector(".python-workspace");
  runner?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (pythonEditor) {
    pythonEditor.focus();
  } else {
    pythonCode.focus();
  }
}

function setupPythonSampleButtons() {
  document.querySelectorAll("[data-python-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      insertPythonSample(button.dataset.pythonSample);
    });
  });
}

function setupPythonQuizzes() {
  const quizCards = [...document.querySelectorAll(".quiz-card[data-quiz-answer]")];
  const quizScore = document.getElementById("quizScore");
  const resetQuizButton = document.getElementById("resetPythonQuiz");

  if (!quizCards.length) return;

  function updateQuizScore() {
    const correctCount = quizCards.filter((card) => card.dataset.quizState === "correct").length;

    if (quizScore) {
      quizScore.textContent = `${correctCount} / ${quizCards.length} 問 正解`;
    }
  }

  function resetQuiz() {
    quizCards.forEach((card) => {
      card.dataset.quizState = "";
      card.querySelectorAll("[data-quiz-choice]").forEach((button) => {
        button.classList.remove("is-selected", "is-correct", "is-incorrect");
        button.setAttribute("aria-pressed", "false");
      });

      const result = card.querySelector(".quiz-result");
      if (result) {
        result.textContent = "答えを選んでください。";
        result.classList.remove("is-correct", "is-incorrect");
      }
    });

    updateQuizScore();
  }

  quizCards.forEach((card) => {
    const choices = [...card.querySelectorAll("[data-quiz-choice]")];
    const result = card.querySelector(".quiz-result");

    choices.forEach((button) => {
      button.addEventListener("click", () => {
        const isCorrect = button.dataset.quizChoice === card.dataset.quizAnswer;

        choices.forEach((choice) => {
          choice.classList.remove("is-selected", "is-correct", "is-incorrect");
          choice.setAttribute("aria-pressed", "false");
        });

        button.classList.add("is-selected");
        button.classList.add(isCorrect ? "is-correct" : "is-incorrect");
        button.setAttribute("aria-pressed", "true");

        if (!isCorrect) {
          const correctChoice = choices.find((choice) => choice.dataset.quizChoice === card.dataset.quizAnswer);
          correctChoice?.classList.add("is-correct");
        }

        if (result) {
          result.textContent = `${isCorrect ? "正解です。" : "もう一度確認しましょう。"}${card.dataset.quizExplanation || ""}`;
          result.classList.toggle("is-correct", isCorrect);
          result.classList.toggle("is-incorrect", !isCorrect);
        }

        card.dataset.quizState = isCorrect ? "correct" : "incorrect";
        updateQuizScore();
      });
    });
  });

  resetQuizButton?.addEventListener("click", resetQuiz);
  updateQuizScore();
}

function setupPythonCodeQuizzes() {
  const codeQuizCards = [...document.querySelectorAll(".code-quiz-card[data-code-answers]")];
  const codeQuizScore = document.getElementById("codeQuizScore");
  const resetCodeQuizButton = document.getElementById("resetPythonCodeQuiz");

  if (!codeQuizCards.length) return;

  function normalizeCodeAnswer(value, mode) {
    const normalizedLines = value
      .replace(/\r\n/g, "\n")
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");

    if (mode === "compact") {
      return normalizedLines.replace(/\s+/g, "");
    }

    return normalizedLines;
  }

  function updateCodeQuizScore() {
    const correctCount = codeQuizCards.filter((card) => card.dataset.codeQuizState === "correct").length;

    if (codeQuizScore) {
      codeQuizScore.textContent = `${correctCount} / ${codeQuizCards.length} 問 正解`;
    }
  }

  function setCodeQuizResult(card, input, result, state, message) {
    card.dataset.codeQuizState = state;

    input.classList.toggle("is-correct", state === "correct");
    input.classList.toggle("is-incorrect", state === "incorrect");

    if (result) {
      result.textContent = message;
      result.classList.toggle("is-correct", state === "correct");
      result.classList.toggle("is-incorrect", state === "incorrect");
    }

    updateCodeQuizScore();
  }

  function resetCodeQuiz() {
    codeQuizCards.forEach((card) => {
      const input = card.querySelector(".code-answer-input");
      const result = card.querySelector(".code-quiz-result");

      card.dataset.codeQuizState = "";

      if (input) {
        input.value = "";
        input.classList.remove("is-correct", "is-incorrect");
      }

      if (result) {
        result.textContent = "コードを入力して確認してください。";
        result.classList.remove("is-correct", "is-incorrect");
      }
    });

    updateCodeQuizScore();
  }

  codeQuizCards.forEach((card) => {
    const input = card.querySelector(".code-answer-input");
    const checkButton = card.querySelector(".code-check-button");
    const result = card.querySelector(".code-quiz-result");
    const mode = card.dataset.codeMode || "exact";
    const answers = (card.dataset.codeAnswers || "")
      .split("|||")
      .map((answer) => answer.trim())
      .filter(Boolean);

    if (!input || !checkButton || !answers.length) return;

    checkButton.addEventListener("click", () => {
      const value = input.value.trim();

      if (!value) {
        setCodeQuizResult(card, input, result, "empty", "コードを入力してください。");
        return;
      }

      const normalizedValue = normalizeCodeAnswer(value, mode);
      const isCorrect = answers.some((answer) => normalizeCodeAnswer(answer, mode) === normalizedValue);
      const explanation = card.dataset.codeExplanation || "";
      const correctExample = answers[0];

      setCodeQuizResult(
        card,
        input,
        result,
        isCorrect ? "correct" : "incorrect",
        isCorrect
          ? `正解です。${explanation}`
          : `もう一度確認しましょう。正解例: ${correctExample}。${explanation}`,
      );
    });
  });

  resetCodeQuizButton?.addEventListener("click", resetCodeQuiz);
  updateCodeQuizScore();
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
setupPythonSampleButtons();
setupPythonQuizzes();
setupPythonCodeQuizzes();
