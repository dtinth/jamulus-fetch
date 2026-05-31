import { fetchJamulusServers } from "./jamulus_protocol.ts";

const dirs = [
  "anygenre1.jamulus.app:22124",
  "classical.jamulus.app:22524",
];

for (const dir of dirs) {
  console.log(`\n=== ${dir} ===`);
  let servers: any[] = [];
  for await (const evt of fetchJamulusServers(dir)) {
    if (evt.type === "server-list") servers = evt.servers;
  }
  const withP2 = servers.filter(s => s.port2);
  console.log(`Total: ${servers.length}, with port2: ${withP2.length}`);
  for (const s of withP2) {
    console.log(`  ${s.name.padEnd(30)} ${s.ip}:${s.port} -> port2=${s.port2}`);

  }
  // Check specific IPs that PHP found but we initially missed
  const checkIPs = [
    "83.243.211.6", "82.67.149.44", "45.79.142.148",
    "125.236.201.44", "151.69.16.238",
  ];
  for (const ip of checkIPs) {
    const found = servers.filter(s => s.ip === ip);
    if (found.length > 0) {
      for (const s of found) {
        console.log(`  Hit ${ip}: "${s.name}" port=${s.port}${s.port2 ? ` port2=${s.port2}` : ""} ping=${s.ping}`);
      }
    } else {
      console.log(`  Miss ${ip}`);
    }
  }
}
