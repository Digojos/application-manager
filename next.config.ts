import type { NextConfig } from "next";
import os from "node:os";

function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const networkEntries of Object.values(interfaces)) {
    if (!networkEntries) continue;

    for (const entry of networkEntries) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}

const nextConfig: NextConfig = {
  // Allow access to the dev server from this machine's LAN IPs.
  allowedDevOrigins: ["localhost", "127.0.0.1", ...getLocalIpv4Addresses()],
};

export default nextConfig;
