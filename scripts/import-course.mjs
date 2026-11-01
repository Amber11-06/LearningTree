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

const child = spawn(
  python,
  ["-m", "backend.scripts.import_course", ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit", env: process.env },
);
child.on("error", (error) => {
  console.error("无法运行课程导入脚本：", error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
