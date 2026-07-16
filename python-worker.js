const pyodideBaseUrl = "https://cdn.jsdelivr.net/pyodide/v314.0.2/full/";

let pyodideModulePromise = null;
let pyodideReadyPromise = null;

function formatError(error) {
  if (!error) {
    return "不明なエラーです。";
  }

  if (error.stack) {
    return error.stack;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

async function getPyodideModule() {
  if (!pyodideModulePromise) {
    pyodideModulePromise = import(`${pyodideBaseUrl}pyodide.mjs`);
  }

  return pyodideModulePromise;
}

async function getPyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = getPyodideModule().then(({ loadPyodide }) =>
      loadPyodide({
        indexURL: pyodideBaseUrl
      })
    );
  }

  return pyodideReadyPromise;
}

self.addEventListener("message", async (event) => {
  const data = event.data || {};

  if (data.type !== "run") {
    return;
  }

  const { runId, code } = data;

  try {
    self.postMessage({ type: "status", runId, message: "Pythonを読み込んでいます..." });
    const pyodide = await getPyodide();

    self.postMessage({ type: "status", runId, message: "必要なパッケージを確認しています..." });
    await pyodide.loadPackagesFromImports(code);

    pyodide.globals.set("__user_code__", code);

    self.postMessage({ type: "status", runId, message: "実行しています..." });
    const result = await pyodide.runPythonAsync(`
import contextlib
import io
import traceback

__buffer = io.StringIO()
__had_error = False

try:
    with contextlib.redirect_stdout(__buffer), contextlib.redirect_stderr(__buffer):
        exec(compile(__user_code__, "<browser-python>", "exec"), globals())
except BaseException:
    __had_error = True
    traceback.print_exc(file=__buffer)

(__buffer.getvalue(), __had_error)
`);

    const [output, hadError] = result.toJs();
    result.destroy();

    self.postMessage({
      type: "output",
      runId,
      output,
      error: Boolean(hadError)
    });
  } catch (error) {
    pyodideReadyPromise = null;

    self.postMessage({
      type: "error",
      runId,
      message: formatError(error)
    });
  }
});
