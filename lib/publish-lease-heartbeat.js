const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_RENEW_WINDOW_MS = 60_000;

class PublishLeaseLostError extends Error {
  constructor(message, cause) {
    const detail = String(
      message || '应用发布租约已丢失，已停止后续写入。'
    );
    super(
      detail.startsWith('PUBLISH_LEASE_LOST:')
        ? detail
        : `PUBLISH_LEASE_LOST: ${detail}`
    );
    this.name = 'PublishLeaseLostError';
    this.code = 'PUBLISH_LEASE_LOST';
    if (cause !== undefined) this.cause = cause;
  }
}

class PublishLeaseHeartbeat {
  constructor(options = {}) {
    if (typeof options.renew !== 'function') {
      throw new TypeError('publish lease heartbeat renew 必须是函数');
    }
    this.lease = options.lease || null;
    this.renew = options.renew;
    this.now = options.now || Date.now;
    this.intervalMs = normalizePositiveInteger(
      options.intervalMs,
      DEFAULT_HEARTBEAT_INTERVAL_MS
    );
    this.renewWindowMs = normalizePositiveInteger(
      options.renewWindowMs,
      DEFAULT_RENEW_WINDOW_MS
    );
    this.setInterval = options.setInterval || global.setInterval;
    this.clearInterval = options.clearInterval || global.clearInterval;
    this.onRenew =
      typeof options.onRenew === 'function' ? options.onRenew : () => {};
    this.onLost =
      typeof options.onLost === 'function' ? options.onLost : () => {};
    this.timer = null;
    this.inFlight = null;
    this.lostError = null;
    this.stopped = false;
  }

  start() {
    if (this.stopped || this.timer) return this;
    this.timer = this.setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer?.unref?.();
    return this;
  }

  setLease(lease) {
    if (!lease?.leaseId) {
      throw new TypeError('publish lease heartbeat lease 缺少 leaseId');
    }
    if (
      this.lease?.leaseId &&
      String(lease.leaseId) !== String(this.lease.leaseId)
    ) {
      throw new TypeError('不能把 heartbeat 切换到另一条 publish lease');
    }
    this.lease = lease;
    return this.lease;
  }

  async tick() {
    if (this.stopped || this.lostError || !this.shouldRenew()) return this.lease;
    try {
      return await this.renewOnce();
    } catch {
      return null;
    }
  }

  async beforeWrite(options = {}) {
    this.assertHealthy();
    if (options.forceRenew || this.shouldRenew()) {
      await this.renewOnce();
    }
    this.assertHealthy();
    return this.lease;
  }

  shouldRenew() {
    const expiresAt = new Date(this.lease?.expiresAt || 0).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
    return expiresAt - Number(this.now()) <= this.renewWindowMs;
  }

  async renewOnce() {
    this.assertHealthy();
    if (this.stopped) {
      throw this.markLost(
        new Error('publish lease heartbeat 已停止，不能继续续租')
      );
    }
    if (this.inFlight) return await this.inFlight;

    this.inFlight = Promise.resolve()
      .then(() => this.renew(this.lease))
      .then(nextLease => {
        if (!nextLease?.leaseId || !nextLease?.expiresAt) {
          throw new Error('续租响应缺少 leaseId 或 expiresAt');
        }
        if (
          this.lease?.leaseId &&
          String(nextLease.leaseId) !== String(this.lease.leaseId)
        ) {
          throw new Error('续租响应 leaseId 与当前租约不一致');
        }
        this.lease = nextLease;
        this.onRenew(nextLease);
        return nextLease;
      })
      .catch(error => {
        throw this.markLost(error);
      })
      .finally(() => {
        this.inFlight = null;
      });
    return await this.inFlight;
  }

  assertHealthy() {
    if (this.lostError) throw this.lostError;
  }

  markLost(cause) {
    if (!this.lostError) {
      const detail = String(cause?.message || cause || '').trim();
      this.lostError = new PublishLeaseLostError(
        detail
          ? `应用发布租约续期失败，已停止后续写入：${detail}`
          : undefined,
        cause
      );
      try {
        this.onLost(this.lostError);
      } catch {
        // Observability callbacks must not replace the stable safety error.
      }
    }
    return this.lostError;
  }

  async stop() {
    if (this.timer) {
      this.clearInterval(this.timer);
      this.timer = null;
    }
    this.stopped = true;
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        // The caller can inspect the stable error with assertHealthy().
      }
    }
  }
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function createPublishLeaseHeartbeat(options) {
  return new PublishLeaseHeartbeat(options);
}

module.exports = {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_RENEW_WINDOW_MS,
  PublishLeaseHeartbeat,
  PublishLeaseLostError,
  createPublishLeaseHeartbeat,
};
