'use strict';

const Homey = require('homey');
const DenkoviClient = require('../../lib/DenkoviClient');
const PollerRegistry = require('../../lib/PollerRegistry');

const ARRAY_KEY = 'Output';

class IP16RDriver extends Homey.Driver {

  /**
   * Get the shared poller for a board, so every device on that board — across
   * all drivers in this app — rides on a single HTTP polling loop.
   */
  getPoller(store) {
    return PollerRegistry.getPoller(store, (msg) => this.log(msg));
  }

  async onPair(session) {
    let boardSettings = null;
    let channels = [];

    session.setHandler('board_settings', async (data) => {
      const address = (data.address || '').trim();
      if (!address) throw new Error('Please fill in an IP address.');

      const client = new DenkoviClient({
        address,
        port: 80,
        password: data.password || 'admin',
      });

      const state = await client.getState();
      channels = DenkoviClient.parseNamedArray(state, ARRAY_KEY);
      if (channels.length === 0) {
        throw new Error('Connected, but no relay states were found in the reply. Check the device\'s HTTP/XML/JSON settings (Encrypt Password must be disabled, access mode "Multiple Access").');
      }

      boardSettings = {
        address,
        port: 80,
        password: data.password || 'admin',
        pollInterval: Number(data.pollInterval) || 5,
        name: (data.name || '').trim() || address,
      };

      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!boardSettings) throw new Error('Board is not configured yet.');

      return channels.map((ch) => ({
        name: `${boardSettings.name} - ${ch.name}`,
        data: {
          id: `${boardSettings.address}-relay-${ch.index}`,
        },
        store: {
          address: boardSettings.address,
          port: boardSettings.port,
          password: boardSettings.password,
          pollInterval: boardSettings.pollInterval,
          relayIndex: ch.index,
        },
      }));
    });
  }

}

module.exports = IP16RDriver;
