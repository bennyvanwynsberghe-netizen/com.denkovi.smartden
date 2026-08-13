'use strict';

const Homey = require('homey');
const DenkoviClient = require('../../lib/DenkoviClient');

const ARRAY_KEY = 'DigitalInput';

class IP32INDigitalDevice extends Homey.Device {

  async onInit() {
    const store = this.getStore();
    this.channelIndex = store.channelIndex;

    this.poller = this.driver.getPoller(store);
    this._onPoll = this._onPoll.bind(this);
    this.unsubscribe = this.poller.subscribe(this._onPoll);

    this._triggerOn = this.homey.flow.getDeviceTriggerCard('input_turned_on');
    this._triggerOff = this.homey.flow.getDeviceTriggerCard('input_turned_off');
  }

  _onPoll(state, err) {
    if (err) {
      this.setUnavailable(err.message).catch(this.error);
      return;
    }

    const channels = DenkoviClient.parseNamedArray(state, ARRAY_KEY);
    const channel = channels.find((c) => c.index === this.channelIndex);

    if (!channel) {
      this.setUnavailable('Input not found in device reply').catch(this.error);
      return;
    }

    const value = DenkoviClient.parseBool(channel.value);
    if (value === undefined) return;

    this.setAvailable().catch(this.error);

    const wasOn = !!this.getCapabilityValue('alarm_generic');
    if (value !== wasOn) {
      this.setCapabilityValue('alarm_generic', value).catch(this.error);
      const card = value ? this._triggerOn : this._triggerOff;
      if (card) card.trigger(this).catch(this.error);
    }
  }

  onDeleted() {
    if (this.unsubscribe) this.unsubscribe();
  }

}

module.exports = IP32INDigitalDevice;
