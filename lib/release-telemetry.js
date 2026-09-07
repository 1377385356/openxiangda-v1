const DEFAULT_PROGRESS_HEARTBEAT_MS = 15_000;

class ReleaseTelemetry {
  constructor(options = {}) {
    this.operation = String(options.operation || 'release').trim() || 'release';
    this.now = options.now || Date.now;
    this.onProgress =
      typeof options.onProgress === 'function' ? options.onProgress : () => {};
    this.heartbeatMs = normalizePositiveInteger(
      options.heartbeatMs,
      DEFAULT_PROGRESS_HEARTBEAT_MS
    );
    this.setInterval = options.setInterval || global.setInterval;
    this.clearInterval = options.clearInterval || global.clearInterval;
    this.startedAtMs = Number(this.now());
    this.finishedAtMs = null;
    this.phases = [];
    this.active = [];
    this.timer = null;
    this.stopped = false;
  }

  start() {
    if (this.stopped || this.timer) return this;
    this.timer = this.setInterval(() => this.emitHeartbeat(), this.heartbeatMs);
    this.timer?.unref?.();
    return this;
  }

  async runPhase(name, metadata, operation) {
    if (typeof metadata === 'function') {
      operation = metadata;
      metadata = {};
    }
    if (typeof operation !== 'function') {
      throw new TypeError('release telemetry phase operation 必须是函数');
    }
    const phase = this.beginPhase(name, metadata);
    try {
      const value = await operation();
      this.endPhase(phase, 'success');
      return value;
    } catch (error) {
      this.endPhase(phase, 'failed', {
        errorCode: error?.code || error?.errorCode || null,
        errorMessage: String(error?.message || error || '').slice(0, 500),
      });
      throw error;
    }
  }

  beginPhase(name, metadata = {}) {
    const phase = {
      name: normalizeName(name),
      status: 'running',
      startedAtMs: Number(this.now()),
      finishedAtMs: null,
      durationMs: null,
      metadata: normalizeMetadata(metadata),
    };
    this.phases.push(phase);
    this.active.push(phase);
    this.emit({ type: 'phase-start', phase: this.serializePhase(phase) });
    return phase;
  }

  endPhase(phase, status = 'success', metadata = {}) {
    if (!phase || phase.status !== 'running') return phase;
    phase.finishedAtMs = Number(this.now());
    phase.durationMs = Math.max(0, phase.finishedAtMs - phase.startedAtMs);
    phase.status = status;
    phase.metadata = {
      ...phase.metadata,
      ...normalizeMetadata(metadata),
    };
    const index = this.active.lastIndexOf(phase);
    if (index >= 0) this.active.splice(index, 1);
    this.emit({ type: 'phase-end', phase: this.serializePhase(phase) });
    return phase;
  }

  addMetadata(phase, metadata = {}) {
    if (!phase) return;
    phase.metadata = {
      ...phase.metadata,
      ...normalizeMetadata(metadata),
    };
  }

  emitHeartbeat() {
    if (this.stopped || this.active.length === 0) return;
    const now = Number(this.now());
    const phase = this.active[this.active.length - 1];
    this.emit({
      type: 'heartbeat',
      phase: this.serializePhase(phase, now),
      operationElapsedMs: Math.max(0, now - this.startedAtMs),
    });
  }

  snapshot() {
    const now =
      this.finishedAtMs === null ? Number(this.now()) : this.finishedAtMs;
    return {
      operation: this.operation,
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt:
        this.finishedAtMs === null
          ? null
          : new Date(this.finishedAtMs).toISOString(),
      durationMs: Math.max(0, now - this.startedAtMs),
      phases: this.phases.map(phase => this.serializePhase(phase, now)),
    };
  }

  stop() {
    if (this.timer) {
      this.clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.stopped) {
      this.finishedAtMs = Number(this.now());
      for (const phase of [...this.active]) {
        this.endPhase(phase, 'interrupted');
      }
    }
    this.stopped = true;
    return this.snapshot();
  }

  serializePhase(phase, now = Number(this.now())) {
    const finishedAtMs = phase.finishedAtMs;
    return {
      name: phase.name,
      status: phase.status,
      startedAt: new Date(phase.startedAtMs).toISOString(),
      finishedAt:
        finishedAtMs === null ? null : new Date(finishedAtMs).toISOString(),
      durationMs:
        phase.durationMs === null
          ? Math.max(0, now - phase.startedAtMs)
          : phase.durationMs,
      metadata: { ...phase.metadata },
    };
  }

  emit(event) {
    try {
      this.onProgress({ operation: this.operation, ...event });
    } catch {
      // Telemetry must never change release correctness.
    }
  }
}

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name) throw new TypeError('release telemetry phase name 不能为空');
  return name.slice(0, 128);
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function createReleaseTelemetry(options) {
  return new ReleaseTelemetry(options);
}

module.exports = {
  DEFAULT_PROGRESS_HEARTBEAT_MS,
  ReleaseTelemetry,
  createReleaseTelemetry,
};
