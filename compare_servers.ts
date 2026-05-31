import { fetchJamulusServers, type ServerEntry } from "./jamulus_protocol.ts";

const directories = [
  "anygenre1.jamulus.app:22124",
  "anygenre2.jamulus.app:22224",
  "asia.jamulus.app:22624",
  "rock.jamulus.app:22424",
  "jazz.jamulus.app:22324",
  "classical.jamulus.app:22524",
  "choral.jamulus.app:22724",
];

function serverKey(s: ServerEntry): string {
  return `${s.ip}:${s.port}`;
}

function normalize(s: ServerEntry): Record<string, unknown> {
  return {
    name: s.name, ip: s.ip, port: s.port, ping: s.ping,
    nclients: s.nclients, maxclients: s.maxclients,
    countryid: s.countryid, city: s.city,
    os: s.os, version: s.version, versionsort: s.versionsort,
  };
}

async function fetchFrom(dir: string, apiUrl: string): Promise<ServerEntry[]> {
  const url = `${apiUrl}?directory=${encodeURIComponent(dir)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const text = await resp.text();
    return JSON.parse(text);
  } catch (e) {
    console.error(`  fetch error ${url}: ${e}`);
    return [];
  }
}

async function fetchLocal(dir: string): Promise<ServerEntry[]> {
  const servers: ServerEntry[] = [];
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    for await (const event of fetchJamulusServers(dir, ac.signal)) {
      if (event.type === "server-list") {
        servers.splice(0, servers.length, ...event.servers);
      }
    }
  } catch {}
  clearTimeout(t);
  return servers;
}

const phpApis = [
  "https://explorer.jamulus.io/servers.php",
  "https://explorer.jamulus.io/servers-lon2.php",
];

for (const dir of directories) {
  console.log(`\n=== ${dir} ===`);

  const ours = await fetchLocal(dir);
  const ourMap = new Map(ours.map(s => [serverKey(s), normalize(s)]));
  console.log(`  Ours: ${ours.length} servers (${ours.filter(s => s.ping >= 0).length} with ping)`);

  for (const api of phpApis) {
    const t0 = Date.now();
    const php = await fetchFrom(dir, api);
    const t1 = Date.now();
    if (php.length === 0) {
      console.log(`  PHP (${api}): no data (${t1 - t0}ms)`);
      continue;
    }
    const phpMap = new Map(php.map(s => [serverKey(s), s]));
    console.log(`  PHP (${api}): ${php.length} servers (${t1 - t0}ms)`);

    const ourKeys = new Set(ourMap.keys());
    const phpKeys = new Set(phpMap.keys());

    const missing = [...phpKeys].filter(k => !ourKeys.has(k));
    const extra = [...ourKeys].filter(k => !phpKeys.has(k));
    const common = [...ourKeys].filter(k => phpKeys.has(k));

    if (missing.length > 0) {
      console.log(`    ⚠ In PHP but missing from ours: ${missing.length}`);
      for (const k of missing.slice(0, 5)) {
        const s = phpMap.get(k)!;
        console.log(`      ${s.name.padEnd(30)} ${s.ip}:${s.port} ping=${s.ping} clients=${s.nclients}/${s.maxclients}`);
      }
    }
    if (extra.length > 0) {
      console.log(`    ⚠ In ours but missing from PHP: ${extra.length}`);
      for (const k of extra.slice(0, 5)) {
        const s = ourMap.get(k)!;
        console.log(`      ${s.name.padEnd(30)} ${s.ip}:${s.port} ping=${s.ping} clients=${s.nclients}/${s.maxclients}`);
      }
    }

    let pingDiffs = 0;
    let maxDiff = 0;
    let maxDiffServer = "";
    for (const k of common) {
      const o = ourMap.get(k)!;
      const p = phpMap.get(k) as Record<string, unknown>;
      const oping = o.ping as number;
      const pping = p.ping as number;
      if (oping >= 0 && pping >= 0) {
        const diff = Math.abs(oping - pping);
        if (diff > 10) {
          pingDiffs++;
          if (diff > maxDiff) {
            maxDiff = diff;
            maxDiffServer = k;
          }
        }
      }
    }
    if (pingDiffs > 0) {
      console.log(`    ⚠ ${pingDiffs} servers have ping diff >10ms, max diff=${maxDiff}ms (${maxDiffServer})`);
    }

    if (missing.length === 0 && extra.length === 0 && pingDiffs === 0) {
      console.log(`    ✓ All ${common.length} servers match!`);
    }
  }
}
