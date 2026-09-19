import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return file;
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeText(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, value, "utf8");
  return file;
}

export function exists(file) {
  return fssync.existsSync(file);
}

export function safeSlug(value, max = 100) {
  const s = String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return s || "root";
}

export function id(prefix = "run") {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}-${crypto.randomBytes(3).toString("hex")}`;
}

export function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const stream = fssync.createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export function normalizePathForJson(p) {
  return p.split(path.sep).join("/");
}

export async function listFiles(root, {
  maxFiles = 20000,
  ignore = ["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache"]
} = {}) {
  const out = [];
  async function walk(dir) {
    if (out.length >= maxFiles) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      if (ignore.includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(full);
    }
  }
  await walk(root);
  return out;
}

export function rel(root, file) {
  return normalizePathForJson(path.relative(root, file));
}
