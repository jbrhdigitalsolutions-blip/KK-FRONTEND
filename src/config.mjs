import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envData = process.env.KK_FRONTEND_DATA_DIR?.trim();
const isVercel = Boolean(process.env.VERCEL);

const dataDir = envData
  ? path.resolve(envData)
  : isVercel
    ? path.join(os.tmpdir(), "kk-frontend")
    : path.join(packageRoot, "data");

export const CONFIG = Object.freeze({
  packageRoot,
  dataDir,
  runsDir: path.join(dataDir, "runs"),
  reposDir: path.join(dataDir, "repos"),
  worktreesDir: path.join(dataDir, "worktrees"),
  port: Number(process.env.KK_FRONTEND_PORT || 4317),
  defaultHeadless: String(process.env.KK_FRONTEND_HEADLESS || "false").toLowerCase() === "true",
  platform: process.platform,
  homedir: os.homedir(),
  agent: {
    command: process.env.KK_FRONTEND_AGENT_COMMAND?.trim() || "",
    args: (() => {
      try {
        return JSON.parse(process.env.KK_FRONTEND_AGENT_ARGS_JSON || "[]");
      } catch {
        return [];
      }
    })(),
  },
});

for (const dir of [CONFIG.dataDir, CONFIG.runsDir, CONFIG.reposDir, CONFIG.worktreesDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

