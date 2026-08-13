'use strict';

const Homey = require('homey');

class DenkoviApp extends Homey.App {

  async onInit() {
    this.log('Denkovi smartDEN app is running');

    // Flow: toggle a relay
    this.homey.flow.getActionCard('relay_toggle')
      .registerRunListener(async (args) => {
        await args.device.toggleRelay();
      });

    // Flow: pulse a relay (duration in tenths of a second, per Denkovi "Pulsei" parameter)
    this.homey.flow.getActionCard('relay_pulse')
      .registerRunListener(async (args) => {
        await args.device.pulseRelay(args.duration);
      });
  }

}

module.exports = DenkoviApp;
