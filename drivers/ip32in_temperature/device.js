'use strict';

const Homey = require('homey');
const DenkoviClient = require('../../lib/DenkoviClient');

const ARRAY_KEY = 'TemperatureInput';

class IP32INTemperatureDevice extends Homey.Device {

  async onInit() {
    const store = this.getStore();
    this.channelIndex = store.channelIndex;

    this.poller = this.driver.getPoller(store);
    this._onPoll = this._onPoll.bind(this);
    this.unsubscribe = this.poller.subscribe(this._onPoll);
  }

  _onPoll(state, err) {
    if (err) {
      this.setUnavailable(err.message).catch(this.error);
      return;
    }

    const channels = DenkoviClient.parseNamedArray(state, ARRAY_KEY);
    const channel = channels.find((c) => c.index === this.channelIndex);

    if (!channel) {
      this.setUnavailable('Channel not found in device reply').catch(this.error);
      return;
    }

    this.setAvailable().catch(this.error);

    // e.g. "21.4 C" -> 21.4. A disconnected probe reports "--- C", which
    // parses to undefined; in that case we simply leave the last known
    // value in place rather than writing a bogus number.
    const value = DenkoviClient.parseMeasureNumber(channel.measure)
      ?? DenkoviClient.parseMeasureNumber(channel.value);

    if (value === undefined) return;

    this.setCapabilityValue('measure_temperature', value).catch(this.error);
  }

  onDeleted() {
    if (this.unsubscribe) this.unsubscribe();
  }

}

module.exports = IP32INTemperatureDevice;
