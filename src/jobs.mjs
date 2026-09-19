import { EventEmitter } from "node:events";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class Jobs {
  constructor() {
    this.jobs = new Map();
    this.controls = new Map();
    this.bus = new EventEmitter();
    this.bus.setMaxListeners(200);
    this.sequence = 0;
  }

  create(kind, meta = {}) {
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id, kind, meta,
      status: "queued",
      stage: "queued",
      progress: 0,
      etaSeconds: null,
      completedUnits: null,
      totalUnits: null,
      startedAt: null,
      endedAt: null,
      messages: [],
      warnings: [],
      errors: [],
      result: null,
    };
    this.jobs.set(id, job);
    this.controls.set(id, { paused: false, stopRequested: false });
    this.emit(job);
    return job;
  }

  get(id) { return this.jobs.get(id) || null; }

  patch(id, patch) {
    const job = this.get(id);
    if (!job) return null;
    Object.assign(job, patch);
    this.emit(job);
    return job;
  }

  log(id, message, extra = {}) {
    const job = this.get(id);
    if (!job) return;
    const normalized = String(message || "");
    const last = job.messages.at(-1);
    if (last?.message === normalized && Date.now() - new Date(last.at).getTime() < 1500) return;
    job.messages.push({ id: ++this.sequence, at: new Date().toISOString(), message: normalized, ...extra });
    if (job.messages.length > 500) job.messages.shift();
    this.emit(job);
  }

  warn(id, message, extra = {}) {
    const job = this.get(id);
    if (!job) return;
    job.warnings.push({ id: ++this.sequence, at: new Date().toISOString(), message, ...extra });
    this.emit(job);
  }

  fail(id, error, extra = {}) {
    const job = this.get(id);
    if (!job) return;
    job.status = "failed";
    job.stage = "failed";
    job.endedAt = new Date().toISOString();
    job.errors.push({
      id: ++this.sequence,
      at: job.endedAt,
      message: String(error?.message || error),
      stack: error?.stack || null,
      ...extra,
    });
    this.emit(job);
  }

  pause(id) {
    const ctl = this.controls.get(id), job = this.get(id);
    if (!ctl || !job || !["running","paused"].includes(job.status)) return false;
    ctl.paused = true;
    this.patch(id, { status: "paused", stage: "paused" });
    this.log(id, "Pause requested. Scanner will pause at the next safe checkpoint.");
    return true;
  }

  resume(id) {
    const ctl = this.controls.get(id), job = this.get(id);
    if (!ctl || !job || !["running","paused"].includes(job.status)) return false;
    ctl.paused = false;
    this.patch(id, { status: "running", stage: "resuming" });
    this.log(id, "Resumed from safe checkpoint.");
    return true;
  }

  stop(id) {
    const ctl = this.controls.get(id), job = this.get(id);
    if (!ctl || !job || !["running","paused","stopping"].includes(job.status)) return false;
    ctl.stopRequested = true;
    ctl.paused = false;
    this.patch(id, { status: "stopping", stage: "stopping" });
    this.log(id, "Stop requested. Partial artifacts will be retained.");
    return true;
  }

  control(id) {
    const ctl = this.controls.get(id);
    if (!ctl) return null;
    return {
      checkpoint: async () => {
        while (ctl.paused && !ctl.stopRequested) await sleep(150);
        if (ctl.stopRequested) {
          const e = new Error("Scan stopped by user at a safe checkpoint.");
          e.code = "KK_STOP";
          throw e;
        }
      },
      isPaused: () => ctl.paused,
      isStopRequested: () => ctl.stopRequested,
    };
  }

  emit(job) {
    this.bus.emit(job.id, structuredClone(job));
    this.bus.emit("*", structuredClone(job));
  }

  subscribe(id, listener) {
    this.bus.on(id, listener);
    return () => this.bus.off(id, listener);
  }

  async run(job, fn) {
    this.patch(job.id, { status: "running", stage: "starting", progress: 1, startedAt: new Date().toISOString() });
    try {
      const result = await fn(job);
      if (result?.cancelled) {
        this.patch(job.id, { status: "stopped", stage: "stopped", endedAt: new Date().toISOString(), result });
      } else {
        this.patch(job.id, { status: "passed", stage: "complete", progress: 100, etaSeconds: 0, endedAt: new Date().toISOString(), result });
      }
      return result;
    } catch (error) {
      this.fail(job.id, error);
      throw error;
    }
  }
}

export const jobs = new Jobs();
