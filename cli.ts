// SPDX-License-Identifier: GPL-2.0-or-later
import { fetchJamulusServers, type ServerEntry } from "./jamulus_protocol.ts";

async function main() {
  const dirAddr = Deno.args[0] || "anygenre3.jamulus.io:22624";
  const outputJSON = Deno.args.includes("--json");

  if (!outputJSON) console.error(`Querying directory: ${dirAddr}`);

  const seenServerKeys = new Set<string>();
  let finalServers: ServerEntry[] = [];

  for await (const event of fetchJamulusServers(dirAddr)) {
    switch (event.type) {
      case "server-list":
        finalServers = event.servers;
        break;
      case "server-update": {
        if (!outputJSON) {
          const key = `${event.server.ip}:${event.server.port}`;
          if (!seenServerKeys.has(key)) {
            seenServerKeys.add(key);
            const s = event.server;
            const name = s.name.padEnd(30).slice(0, 30);
            const clients = s.clients
              ? s.clients.map((c) => c.name).join(", ")
              : "";
            console.log(
              `  ${name} ${String(s.ping).padStart(4)}ms  ${s.nclients}/${s.maxclients}${clients ? `  ─ ${clients}` : ""}`,
            );
          }
        }
        break;
      }
      case "error":
        if (!outputJSON) console.error(`[ERROR] ${event.message}`);
        break;
      case "done":
        break;
    }
  }

  if (outputJSON) {
    console.log(JSON.stringify(finalServers, null, 2));
  } else {
    console.error(`\nTotal: ${finalServers.length} servers`);
  }
}

if (import.meta.main) {
  main();
}
