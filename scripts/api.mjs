import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const isWindows = process.platform === "win32";
const python =
  process.env.LEARNINGTREE_PYTHON ||
  (existsSync(join(root, ".venv", isWindows ? "Scripts/python.exe" : "bin/python"))
    ? join(root, ".venv", isWindows ? "Scripts/python.exe" : "bin/python")
    : isWindows
      ? "python.exe"
      : "python3");
const port = process.env.LEARNINGTREE_API_PORT || "8000";
const host = process.env.LEARNINGTREE_API_HOST || "127.0.0.1";

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
    "--forwarded-allow-ips=*",
  ],
  { cwd: root, stdio: "inherit", env: process.env },
);

api.on("error", (error) => {
  console.error("无法启动 FastAPI：", error);
  process.exitCode = 1;
});
api.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => api.kill());
}
