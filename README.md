# Denkovi smartDEN — Homey app

Homey (SDK 3) app for [Denkovi](https://denkovi.com) smartDEN Ethernet relay boards and input modules. Every relay, digital input, analog input and temperature probe on a board becomes its own Homey device, using the channel names you configured on the module itself.

## Supported hardware

| Module | Homey devices |
| --- | --- |
| smartDEN IP-16R | 16 relay outputs (`onoff`), with toggle and pulse Flow actions |
| smartDEN IP-32IN | 16 digital inputs (`alarm_generic`, with turned on/off Flow triggers), 8 analog inputs (`measure_voltage`), 8 NTC temperature inputs (`measure_temperature`) |

Communication uses the modules' HTTP/JSON API (`current_state.json`), so no cloud service or extra software is involved.

## Device configuration

Before pairing, open the module's own web interface and set, under **HTTP/XML/JSON**:

- HTTP/XML/JSON access: **enabled**
- Encrypt Password: **disabled**
- Access mode: **Multiple Access**

Without these settings the app cannot authenticate, because the password has to be sent with each request rather than through a stateful login.

## Installation

Requires [Node.js](https://nodejs.org) and the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started).

```bash
npm install -g homey
git clone https://github.com/<your-github-username>/com.denkovi.smartden.git
cd com.denkovi.smartden
npm install
homey login
homey app run      # run with live logs
homey app install  # install permanently
```

Then add devices in Homey via **Add device → Denkovi smartDEN** and pick the relevant type. For an IP-32IN board you pair three times (digital, analog, temperature) to get all channels.

## How it works

- `lib/DenkoviClient.js` — HTTP/JSON client. Requests to one board are serialized and retried once on a network error, so a relay command never collides with a status poll.
- `lib/BoardPoller.js` — one polling loop per board, fanning state out to all its devices. Devices are only marked unavailable after several consecutive failures, so a single dropped request does not take them offline.
- `lib/PollerRegistry.js` — app-wide registry keyed by IP address, shared across drivers. This is what keeps the three IP-32IN drivers from each polling the same module separately.
- `drivers/*` — one driver per device type, each with a custom pairing view for IP address, password and poll interval.

## Development

```bash
homey app validate --level publish
homey app run --clean   # wipes paired devices, useful for testing pairing
```

## Credits

Product photography of the smartDEN modules is courtesy of Denkovi Assembly Electronics Ltd. This is an independent community app and is not affiliated with or endorsed by Denkovi or Athom.

## License

[MIT](LICENSE)
