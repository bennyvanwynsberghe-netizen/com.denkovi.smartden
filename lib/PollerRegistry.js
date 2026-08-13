'use strict';

const DenkoviClient = require('./DenkoviClient');
const BoardPoller = require('./BoardPoller');

/**
 * App-wide registry of board pollers, keyed by "address:port".
 *
 * This lives at module scope on purpose: Node caches the module, so every
 * driver in the app shares the same registry. That matters for the IP-32IN,
 * where the digital, analog and temperature drivers all talk to the same
 * physical module — without a shared registry each driver would run its own
 * polling loop and hit the device three times per cycle. These small embedded
 * web servers only handle a couple of concurrent sessions, which showed up as
 * devices flickering to "unavailable".
 */
const pollers = new Map();

/**
 * @param {object} opts
 * @param {string} opts.address
 * @param {number} [opts.port]
 * @param {string} opts.password
 * @param {number} [opts.pollInterval] Seconds
 * @param {(msg: string) => void} [log]
 * @returns {BoardPoller}
 */
function getPoller({ address, port = 80, password, pollInterval = 5 }, log = () => {}) {
  const key = `${address}:${port}`;
  let poller = pollers.get(key);

  if (!poller) {
    const client = new DenkoviClient({ address, port, password });
    poller = new BoardPoller(client, pollInterval, log);
    pollers.set(key, poller);
    return poller;
  }

  // If a device asks for faster polling than the board is currently doing,
  // speed the shared loop up to satisfy it.
  if (pollInterval && pollInterval < poller.intervalSeconds) {
    poller.setIntervalSeconds(pollInterval);
  }
  return poller;
}

module.exports = { getPoller };
