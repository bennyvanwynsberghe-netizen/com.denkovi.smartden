'use strict';

const Homey = require('homey');
const DenkoviClient = require('../../lib/DenkoviClient');

const ARRAY_KEY = 'AnalogInput';

class IP32INAnalogDevice extends Homey.Device {

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

    // Prefer the human-readable "Measure" field (e.g. "0.3 V"), fall back
    // to the raw "Value" field if it's absent.
    const value = DenkoviClient.parseMeasureNumber(channel.measure)
      ?? DenkoviClient.parseMeasureNumber(channel.value);

    if (value === undefined) return;

    this.setCapabilityValue('measure_voltage', value).catch(this.error);
  }

  onDeleted() {
    if (this.unsubscribe) this.unsubscribe();
  }

}

module.exports = IP32INAnalogDevice;
