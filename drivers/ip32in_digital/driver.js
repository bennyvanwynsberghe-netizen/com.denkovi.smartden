'use strict';

const Homey = require('homey');
const DenkoviClient = require('../../lib/DenkoviClient');
const PollerRegistry = require('../../lib/PollerRegistry');

const ARRAY_KEY = 'DigitalInput';

class IP32INDigitalDriver extends Homey.Driver {

  /**
   * Shared with the analog and temperature drivers: all three read the same
   * physical IP-32IN module, so they must not each poll it separately.
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
        throw new Error(`Connected, but no "${ARRAY_KEY}" channels were found in the reply.`);
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
          id: `${boardSettings.address}-digital-${ch.index}`,
        },
        store: {
          address: boardSettings.address,
          port: boardSettings.port,
          password: boardSettings.password,
          pollInterval: boardSettings.pollInterval,
          channelIndex: ch.index,
        },
      }));
    });
  }

}

module.exports = IP32INDigitalDriver;
