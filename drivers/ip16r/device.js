'use strict';

const Homey = require('homey');
const DenkoviClient = require('../../lib/DenkoviClient');

const ARRAY_KEY = 'Output';

class IP16RDevice extends Homey.Device {

  async onInit() {
    const store = this.getStore();
    this.relayIndex = store.relayIndex;

    this.poller = this.driver.getPoller(store);
    this.client = this.poller.client;

    this._onPoll = this._onPoll.bind(this);
    this.unsubscribe = this.poller.subscribe(this._onPoll);

    this.registerCapabilityListener('onoff', (value) => this._setRelay(value));
  }

  _onPoll(state, err) {
    if (err) {
      this.setUnavailable(err.message).catch(this.error);
      return;
    }

    const channels = DenkoviClient.parseNamedArray(state, ARRAY_KEY);
    const channel = channels.find((c) => c.index === this.relayIndex);

    if (!channel) {
      this.setUnavailable('Relay state not found in device reply').catch(this.error);
      return;
    }

    const isOn = DenkoviClient.parseBool(channel.value);
    if (isOn === undefined) return;

    this.setAvailable().catch(this.error);

    if (this.getCapabilityValue('onoff') !== isOn) {
      this.setCapabilityValue('onoff', isOn).catch(this.error);
    }
  }

  async _setRelay(value) {
    await this.client.setRelay(this.relayIndex, value);
  }

  /** Used by the "Toggle relay" flow action card. */
  async toggleRelay() {
    const current = !!this.getCapabilityValue('onoff');
    const next = !current;
    await this.client.setRelay(this.relayIndex, next);
    await this.setCapabilityValue('onoff', next).catch(this.error);
  }

  /** Used by the "Pulse relay" flow action card. duration is in 0.1s steps. */
  async pulseRelay(duration) {
    await this.client.pulseRelay(this.relayIndex, duration);
  }

  onDeleted() {
    if (this.unsubscribe) this.unsubscribe();
  }

}

module.exports = IP16RDevice;
