#!/usr/bin/env node
/**
 * Returns the best LAN IPv4 for Expo Go (Wi-Fi/Ethernet, not virtual adapters).
 */
import os from 'node:os';

const VIRTUAL_ADAPTER = /hyper-v|wsl|vethernet|virtual|vmware|docker|loopback|bluetooth/i;
const PREFERRED_ADAPTER = /wi-?fi|wlan|wireless|ethernet/i;

function isIpv4(addr) {
  return addr.family === 'IPv4' || addr.family === 4;
}

const candidates = [];

for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
  if (!addrs || VIRTUAL_ADAPTER.test(name)) {
    continue;
  }

  for (const addr of addrs) {
    if (!isIpv4(addr) || addr.internal) {
      continue;
    }

    candidates.push({
      name,
      address: addr.address,
      preferred: PREFERRED_ADAPTER.test(name),
    });
  }
}

const wifi = candidates.find((c) => /wi-?fi|wlan|wireless/i.test(c.name));
if (wifi) {
  process.stdout.write(wifi.address);
  process.exit(0);
}

const preferred = candidates.find((c) => c.preferred);
if (preferred) {
  process.stdout.write(preferred.address);
  process.exit(0);
}

if (candidates[0]) {
  process.stdout.write(candidates[0].address);
  process.exit(0);
}

process.exit(1);
