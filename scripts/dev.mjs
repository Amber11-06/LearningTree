import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const isWindows = process.platform === "win32";
const port = process.env.LEARNINGTREE_API_PORT || "8000";
const host = process.env.LEARNINGTREE_API_HOST || "127.0.0.1";
const python =
  process.env.LEARNINGTREE_PYTHON ||
  (existsSync(join(root, ".venv", isWindows ? "Scripts/python.exe" : "bin/python"))
    ? join(root, ".venv", isWindows ? "Scripts/python.exe" : "bin/python")
    : isWindows
      ? "python.exe"
      : "python3");

let client;
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  client?.kill();
  api.kill();
  process.exitCode = code;
}

const api = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    host,
    "--port",
    port,
    "--proxy-headers",
    "--forwarded-allow-ips",
    "*",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  },
);

api.on("error", (error) => {
  console.error("无法启动 FastAPI：", error);
  stop(1);
});
api.on("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});

async function waitForApi() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (stopping) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return true;
    } catch {
      /* The API is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

if (await waitForApi()) {
  client = spawn(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  client.on("error", (error) => {
    console.error("无法启动 Vite：", error);
    stop(1);
  });
  client.on("exit", (code) => stop(code ?? 0));
} else {
  console.error("FastAPI 未能在预期时间内启动。请检查 PostgreSQL 与 .env 配置。");
  stop(1);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop());
}
