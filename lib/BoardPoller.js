'use strict';

/**
 * Polls a single Denkovi board (one IP address) on an interval and fans the
 * resulting state out to every device that registered interest in it. A
 * 16-relay board with 16 Homey devices therefore generates a single HTTP
 * request per poll cycle, not sixteen.
 *
 * The poller is deliberately forgiving about failures: these modules are small
 * embedded web servers that occasionally drop a request, and briefly flagging
 * every device as unavailable for one missed poll is far more disruptive than
 * simply keeping the last known state for a cycle or two.
 */
class BoardPoller {

  /**
   * @param {DenkoviClient} client
   * @param {number} intervalSeconds
   * @param {(msg: string) => void} [log]
   * @param {number} [failureThreshold] Consecutive failures before reporting unavailable
   */
  constructor(client, intervalSeconds, log = () => {}, failureThreshold = 3) {
    this.client = client;
    this.intervalSeconds = Math.max(2, intervalSeconds || 5);
    this.log = log;
    this.failureThreshold = failureThreshold;

    this.listeners = new Set();
    this.timer = null;
    this.lastState = null;
    this.refCount = 0;
    this.consecutiveFailures = 0;
    this.polling = false;
  }

  /** @param {(state: object|null, error: ?Error) => void} listener */
  subscribe(listener) {
    this.listeners.add(listener);
    this.refCount++;
    if (!this.timer) this.start();
    // Immediately push the last known state, if any, to the new subscriber.
    if (this.lastState) listener(this.lastState, null);
    return () => this.unsubscribe(listener);
  }

  unsubscribe(listener) {
    this.listeners.delete(listener);
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.stop();
  }

  setIntervalSeconds(seconds) {
    const next = Math.max(2, seconds);
    if (next === this.intervalSeconds) return;
    this.intervalSeconds = next;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  start() {
    if (this.timer) return;
    this.poll(); // fire immediately, then on interval
    this.timer = setInterval(() => this.poll(), this.intervalSeconds * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll() {
    // Never let polls pile up on a slow or unresponsive board.
    if (this.polling) return;
    this.polling = true;

    try {
      const state = await this.client.getState();
      this.lastState = state;
      this.consecutiveFailures = 0;
      for (const listener of this.listeners) listener(state, null);
    } catch (err) {
      this.consecutiveFailures++;
      this.log(`Poll failed for ${this.client.address} `
        + `(${this.consecutiveFailures}/${this.failureThreshold}): ${err.message}`);

      if (this.consecutiveFailures >= this.failureThreshold) {
        // Genuinely gone: let the devices mark themselves unavailable.
        for (const listener of this.listeners) listener(null, err);
      } else if (this.lastState) {
        // Probably just a dropped request: keep the last known state so the
        // devices stay usable instead of flickering offline.
        for (const listener of this.listeners) listener(this.lastState, null);
      }
    } finally {
      this.polling = false;
    }
  }

}

module.exports = BoardPoller;
