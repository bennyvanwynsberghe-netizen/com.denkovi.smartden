'use strict';

const fetch = require('node-fetch');
const AbortController = global.AbortController || require('abort-controller');

/**
 * Low-level HTTP/JSON client for Denkovi smartDEN IP modules
 * (smartDEN IP-16R relay boards, smartDEN IP-32IN input modules, and
 * similar smartDEN devices exposing the current_state.json HTTP API).
 *
 * The device must be configured with:
 *  - HTTP/XML/JSON access: enabled
 *  - Encrypt Password: disabled
 *  - Access mode: "Multiple Access" (so pw=... can be sent with every
 *    request instead of needing a stateful two-step login)
 *
 * See the smartDEN IP-16R-XX / smartDEN IP-32IN user manuals, chapter
 * "HTTP/XML/JSON access", for protocol details.
 */
class DenkoviClient {

  /**
   * @param {object} opts
   * @param {string} opts.address IP address or hostname
   * @param {number} [opts.port] HTTP port, default 80
   * @param {string} opts.password Device password (default "admin")
   * @param {number} [opts.timeout] Request timeout in ms, default 4000
   */
  constructor({ address, port = 80, password = 'admin', timeout = 15000, retries = 1 }) {
    this.address = address;
    this.port = port;
    this.password = password;
    this.timeout = timeout;
    this.retries = retries;

    // These modules serve only a couple of connections at a time, so all
    // traffic to one board is funnelled through this promise chain. That keeps
    // a relay command from colliding with a status poll.
    this._queue = Promise.resolve();
  }

  get baseUrl() {
    return `http://${this.address}:${this.port}`;
  }

  /**
   * Queue a request so only one is in flight per board at any moment, and
   * retry once on a network error before giving up.
   */
  async request(params = {}) {
    const run = async () => {
      let lastErr;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          return await this._request(params);
        } catch (err) {
          lastErr = err;
          // A rejected login or a bad reply won't fix itself by retrying.
          if (!/Could not reach/.test(err.message)) throw err;
          if (attempt < this.retries) await new Promise((r) => setTimeout(r, 400));
        }
      }
      throw lastErr;
    };

    const result = this._queue.then(run, run);
    // Keep the chain alive regardless of this call's outcome.
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /**
   * Perform a GET request against current_state.json, optionally with
   * extra control parameters (e.g. { Relay3: 1 } or { Pulse2: 10 }).
   * Returns the parsed JSON body.
   */
  async _request(params = {}) {
    const query = new URLSearchParams({ pw: this.password, ...params });
    const url = `${this.baseUrl}/current_state.json?${query.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw new Error(`Could not reach ${this.address}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${this.address}`);
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error(`Unexpected (non-JSON) reply from ${this.address}. Check that HTTP/JSON access is enabled on the device.`);
    }

    const state = json.CurrentState || json;

    if (state.LoginKey !== undefined) {
      throw new Error(
        `Login rejected by ${this.address}. Check the password, and make sure ` +
        `"Encrypt Password" is disabled and access mode is set to "Multiple Access" ` +
        `in the device's HTTP/XML/JSON settings.`,
      );
    }

    return state;
  }

  /** Fetch the current state without changing any output. */
  async getState() {
    return this.request();
  }

  /**
   * Set a single relay output (1-based index) on/off.
   * @param {number} index 1-based relay number
   * @param {boolean} value
   */
  async setRelay(index, value) {
    return this.request({ [`Relay${index}`]: value ? 1 : 0 });
  }

  /**
   * Generate a pulse on a relay output.
   * @param {number} index 1-based relay number
   * @param {number} tenthsOfSecond Pulse duration (1...65535, in 0.1s steps)
   */
  async pulseRelay(index, tenthsOfSecond) {
    return this.request({ [`Pulse${index}`]: tenthsOfSecond });
  }

  /**
   * Extract indexed 0/1 values (relay outputs or digital inputs) from a
   * current_state.json reply. Denkovi firmware versions differ slightly in
   * how they name/shape these fields, so this looks for every known
   * variant:
   *  - flat numbered keys:      Relay1, Relay2, ...  /  DigitalInput1, ...
   *  - flat numbered objects:   Relay1: { Value: "1" }
   *  - array of named objects:  Relay: [ { Name, Value }, ... ]
   *                             DigitalInput: [ { Name, Value }, ... ]
   *
   * @param {object} state Parsed current_state.json body
   * @param {string[]} prefixes Key prefixes to look for, e.g. ['Relay'] or ['DigitalInput','DIn']
   * @param {number} count Expected number of channels
   * @returns {Map<number, {value: number, name: ?string}>} 1-based index -> value
   */
  static extractChannels(state, prefixes, count) {
    const result = new Map();

    const readValue = (raw) => {
      if (raw === null || raw === undefined) return undefined;
      if (typeof raw === 'object') return readValue(raw.Value !== undefined ? raw.Value : raw.value);
      const n = Number(raw);
      return Number.isNaN(n) ? undefined : (n ? 1 : 0);
    };

    for (const prefix of prefixes) {
      // Flat keys: Relay1, Relay2, ... / DigitalInput1, ...
      for (let i = 1; i <= count; i++) {
        const raw = state[`${prefix}${i}`];
        if (raw !== undefined) {
          const value = readValue(raw);
          if (value !== undefined) result.set(i, { value, name: (raw && raw.Name) || null });
        }
      }

      // Array form: { Relay: [ {Name, Value}, ... ] } (also tries plural "Relays")
      for (const key of [prefix, `${prefix}s`]) {
        const arr = state[key];
        if (Array.isArray(arr)) {
          arr.forEach((entry, idx) => {
            const i = idx + 1;
            if (result.has(i)) return;
            const value = readValue(entry);
            if (value !== undefined) result.set(i, { value, name: entry && entry.Name ? entry.Name : null });
          });
        }
      }
    }

    return result;
  }

  /**
   * Parse one of the named-channel arrays Denkovi devices return, e.g.:
   *   "DigitalInput": [ {"Name": "wind", "Value": "0", "Count": "0"}, ... ]
   *   "AnalogInput":   [ {"Name": "ph",   "Value": "0", "Measure": "0.0 V"}, ... ]
   *   "TemperatureInput": [ {"Name": "TI1", "Value": "21.4 C"}, ... ]
   *
   * @param {object} state Parsed current_state.json body
   * @param {string} key Array key, e.g. 'DigitalInput', 'AnalogInput', 'TemperatureInput'
   * @returns {Array<{index:number, name:string, value:*, measure:?string}>} 1-based, in device order
   */
  static parseNamedArray(state, key) {
    const arr = state[key];
    if (!Array.isArray(arr)) return [];
    return arr.map((entry, idx) => ({
      index: idx + 1,
      name: (entry && entry.Name) ? entry.Name : `${key}${idx + 1}`,
      value: entry ? entry.Value : undefined,
      measure: entry ? entry.Measure : undefined,
    }));
  }

  /** Parse a Denkovi 0/1 (string or number) value into a boolean. */
  static parseBool(value) {
    const n = Number(value);
    return Number.isNaN(n) ? undefined : !!n;
  }

  /**
   * Parse a leading number out of a Denkovi "Measure" string, e.g.
   * "21.4 C" -> 21.4, "0.3 V" -> 0.3. Returns undefined for placeholder
   * readings like "--- C" (disconnected probe).
   */
  static parseMeasureNumber(str) {
    if (typeof str === 'number') return str;
    if (typeof str !== 'string') return undefined;
    const match = str.trim().match(/^-?\d+(\.\d+)?/);
    if (!match) return undefined;
    return Number(match[0]);
  }

}

module.exports = DenkoviClient;
