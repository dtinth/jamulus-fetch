// SPDX-License-Identifier: GPL-2.0-or-later
//
// Jamulus wire protocol implementation
// Ported from C++ source (protocol.cpp / protocol.h / util.cpp) and
// cross-referenced against jamulus-php (softins/jamulus-php)
//
// Jamulus is Copyright (c) 2004-2026 Volker Fischer and contributors,
// licensed under the GNU General Public License v2.0 or later.

import { createSocket } from "node:dgram";

// --- Protocol constants ---
export const MESS_HEADER_LENGTH_BYTE = 7;

export const CLM = {
  PING_MS_WITHNUMCLIENTS: 1002,
  SERVER_LIST: 1006,
  REQ_SERVER_LIST: 1007,
  VERSION_AND_OS: 1011,
  REQ_VERSION_AND_OS: 1012,
  CONN_CLIENTS_LIST: 1013,
  REQ_CONN_CLIENTS_LIST: 1014,
  RED_SERVER_LIST: 1018,
} as const;

// ============================================================
// CRC-16 (exact port of CCRC from util.cpp)
// ============================================================
class CRC16 {
  private sr: number = ~0 >>> 0;
  private readonly poly = (1 << 5) | (1 << 12);
  private readonly bmask = 1 << 16;

  reset() { this.sr = ~0 >>> 0; }
  addByte(b: number) {
    b &= 0xff;
    for (let i = 0; i < 8; i++) {
      this.sr <<= 1;
      if (this.sr & this.bmask) this.sr |= 1;
      if (b & (1 << (7 - i))) this.sr ^= 1;
      if (this.sr & 1) this.sr ^= this.poly;
      this.sr >>>= 0;
    }
  }
  getCRC() { return (~this.sr >>> 0) & 0xffff; }
  compute(bytes: Uint8Array) {
    this.reset();
    for (let i = 0; i < bytes.length; i++) this.addByte(bytes[i]);
    return this.getCRC();
  }
}

// ============================================================
// Low-level binary encode/decode (little-endian)
// ============================================================
function putVal(buf: Uint8Array, pos: number, val: number, n: number): number {
  for (let i = 0; i < n; i++) buf[pos++] = (val >>> (i * 8)) & 0xff;
  return pos;
}

function getVal(buf: Uint8Array, pos: number, n: number): [number, number] {
  let v = 0;
  for (let i = 0; i < n; i++) v |= buf[pos++] << (i * 8);
  return [v >>> 0, pos];
}

function getStr(buf: Uint8Array, pos: number, lenBytes = 2, maxLen = 9999): [string, number] {
  const [strLen, p] = getVal(buf, pos, lenBytes);
  const end = p + Math.min(strLen, maxLen);
  return [new TextDecoder().decode(buf.slice(p, end)), end];
}

// ============================================================
// Message framing
// ============================================================
export function encodeMessage(id: number, data: Uint8Array): Uint8Array {
  const buf = new Uint8Array(MESS_HEADER_LENGTH_BYTE + data.length + 2);
  let pos = 0;
  pos = putVal(buf, pos, 0, 2);   // TAG (all zero)
  pos = putVal(buf, pos, id, 2);   // ID
  pos = putVal(buf, pos, 0, 1);    // counter (0 for connectionless)
  pos = putVal(buf, pos, data.length, 2);
  buf.set(data, pos);
  pos += data.length;
  const crcVal = new CRC16().compute(buf.slice(0, pos));
  pos = putVal(buf, pos, crcVal, 2);
  return buf;
}

function encodeSimpleRequest(id: number): Uint8Array {
  return encodeMessage(id, new Uint8Array(0));
}

export function decodeMessage(buf: Uint8Array): { id: number; data: Uint8Array } | null {
  if (buf.length < MESS_HEADER_LENGTH_BYTE + 2) return null;
  let pos = 0;
  const [, p1] = getVal(buf, pos, 2); pos = p1;
  const [id, p2] = getVal(buf, pos, 2); pos = p2;
  const [, p3] = getVal(buf, pos, 1); pos = p3;
  const [dataLen, p4] = getVal(buf, pos, 2); pos = p4;
  if (buf.length < MESS_HEADER_LENGTH_BYTE + dataLen + 2) return null;
  const data = buf.slice(pos, pos + dataLen);
  pos += dataLen;
  const [rcvCrc] = getVal(buf, pos, 2);
  if (new CRC16().compute(buf.slice(0, pos)) !== rcvCrc) return null;
  return { id, data };
}

// ============================================================
// Mapping tables (Qt5 QLocale::Country / Jamulus enums)
// ============================================================
const COUNTRIES: Record<number, string> = {
  0: "-", 1: "Afghanistan", 2: "Albania", 3: "Algeria", 4: "American Samoa",
  5: "Andorra", 6: "Angola", 7: "Anguilla", 8: "Antarctica", 9: "Antigua And Barbuda",
  10: "Argentina", 11: "Armenia", 12: "Aruba", 13: "Australia", 14: "Austria",
  15: "Azerbaijan", 16: "Bahamas", 17: "Bahrain", 18: "Bangladesh", 19: "Barbados",
  20: "Belarus", 21: "Belgium", 22: "Belize", 23: "Benin", 24: "Bermuda",
  25: "Bhutan", 26: "Bolivia", 27: "Bosnia And Herzegowina", 28: "Botswana",
  29: "Bouvet Island", 30: "Brazil", 31: "British Indian Ocean Territory",
  32: "Brunei", 33: "Bulgaria", 34: "Burkina Faso", 35: "Burundi", 36: "Cambodia",
  37: "Cameroon", 38: "Canada", 39: "Cape Verde", 40: "Cayman Islands",
  41: "Central African Republic", 42: "Chad", 43: "Chile", 44: "China",
  45: "Christmas Island", 46: "Cocos Islands", 47: "Colombia", 48: "Comoros",
  49: "Congo Kinshasa", 50: "Congo Brazzaville", 51: "Cook Islands",
  52: "Costa Rica", 53: "Ivory Coast", 54: "Croatia", 55: "Cuba", 56: "Cyprus",
  57: "Czech Republic", 58: "Denmark", 59: "Djibouti", 60: "Dominica",
  61: "Dominican Republic", 62: "East Timor", 63: "Ecuador", 64: "Egypt",
  65: "El Salvador", 66: "Equatorial Guinea", 67: "Eritrea", 68: "Estonia",
  69: "Ethiopia", 70: "Falkland Islands", 71: "Faroe Islands", 72: "Fiji",
  73: "Finland", 74: "France", 75: "Guernsey", 76: "French Guiana",
  77: "French Polynesia", 78: "French Southern Territories", 79: "Gabon",
  80: "Gambia", 81: "Georgia", 82: "Germany", 83: "Ghana", 84: "Gibraltar",
  85: "Greece", 86: "Greenland", 87: "Grenada", 88: "Guadeloupe", 89: "Guam",
  90: "Guatemala", 91: "Guinea", 92: "Guinea Bissau", 93: "Guyana", 94: "Haiti",
  95: "Heard And McDonald Islands", 96: "Honduras", 97: "Hong Kong",
  98: "Hungary", 99: "Iceland", 100: "India", 101: "Indonesia", 102: "Iran",
  103: "Iraq", 104: "Ireland", 105: "Israel", 106: "Italy", 107: "Jamaica",
  108: "Japan", 109: "Jordan", 110: "Kazakhstan", 111: "Kenya", 112: "Kiribati",
  113: "North Korea", 114: "South Korea", 115: "Kuwait", 116: "Kyrgyzstan",
  117: "Laos", 118: "Latvia", 119: "Lebanon", 120: "Lesotho", 121: "Liberia",
  122: "Libya", 123: "Liechtenstein", 124: "Lithuania", 125: "Luxembourg",
  126: "Macau", 127: "Macedonia", 128: "Madagascar", 129: "Malawi",
  130: "Malaysia", 131: "Maldives", 132: "Mali", 133: "Malta",
  134: "Marshall Islands", 135: "Martinique", 136: "Mauritania", 137: "Mauritius",
  138: "Mayotte", 139: "Mexico", 140: "Micronesia", 141: "Moldova", 142: "Monaco",
  143: "Mongolia", 144: "Montserrat", 145: "Morocco", 146: "Mozambique",
  147: "Myanmar", 148: "Namibia", 149: "Nauru Country", 150: "Nepal",
  151: "Netherlands", 152: "Cura Sao", 153: "New Caledonia", 154: "New Zealand",
  155: "Nicaragua", 156: "Niger", 157: "Nigeria", 158: "Niue",
  159: "Norfolk Island", 160: "Northern Mariana Islands", 161: "Norway",
  162: "Oman", 163: "Pakistan", 164: "Palau", 165: "Palestinian Territories",
  166: "Panama", 167: "Papua New Guinea", 168: "Paraguay", 169: "Peru",
  170: "Philippines", 171: "Pitcairn", 172: "Poland", 173: "Portugal",
  174: "Puerto Rico", 175: "Qatar", 176: "Reunion", 177: "Romania",
  178: "Russia", 179: "Rwanda", 180: "Saint Kitts And Nevis", 181: "Saint Lucia",
  182: "Saint Vincent And The Grenadines", 183: "Samoa", 184: "San Marino",
  185: "Sao Tome And Principe", 186: "Saudi Arabia", 187: "Senegal",
  188: "Seychelles", 189: "Sierra Leone", 190: "Singapore", 191: "Slovakia",
  192: "Slovenia", 193: "Solomon Islands", 194: "Somalia", 195: "South Africa",
  196: "South Georgia And The South Sandwich Islands", 197: "Spain",
  198: "Sri Lanka", 199: "Saint Helena", 200: "Saint Pierre And Miquelon",
  201: "Sudan", 202: "Suriname", 203: "Svalbard And Jan Mayen Islands",
  204: "Swaziland", 205: "Sweden", 206: "Switzerland", 207: "Syria",
  208: "Taiwan", 209: "Tajikistan", 210: "Tanzania", 211: "Thailand",
  212: "Togo", 213: "Tokelau Country", 214: "Tonga",
  215: "Trinidad And Tobago", 216: "Tunisia", 217: "Turkey",
  218: "Turkmenistan", 219: "Turks And Caicos Islands", 220: "Tuvalu Country",
  221: "Uganda", 222: "Ukraine", 223: "United Arab Emirates",
  224: "United Kingdom", 225: "United States",
  226: "United States Minor Outlying Islands", 227: "Uruguay",
  228: "Uzbekistan", 229: "Vanuatu", 230: "Vatican City State",
  231: "Venezuela", 232: "Vietnam", 233: "British Virgin Islands",
  234: "United States Virgin Islands", 235: "Wallis And Futuna Islands",
  236: "Western Sahara", 237: "Yemen", 238: "Canary Islands", 239: "Zambia",
  240: "Zimbabwe", 241: "Clipperton Island", 242: "Montenegro", 243: "Serbia",
  244: "Saint Barthelemy", 245: "Saint Martin", 246: "Latin America",
  247: "Ascension Island", 248: "Aland Islands", 249: "Diego Garcia",
  250: "Ceuta And Melilla", 251: "Isle Of Man", 252: "Jersey",
  253: "Tristan Da Cunha", 254: "South Sudan", 255: "Bonaire",
  256: "Sint Maarten", 257: "Kosovo", 258: "European Union",
  259: "Outlying Oceania", 260: "World", 261: "Europe",
};

const INSTRUMENTS: Record<number, string> = {
  0: "-", 1: "Drums", 2: "Djembe", 3: "Electric Guitar", 4: "Acoustic Guitar",
  5: "Bass Guitar", 6: "Keyboard", 7: "Synthesizer", 8: "Grand Piano",
  9: "Accordion", 10: "Vocal", 11: "Microphone", 12: "Harmonica", 13: "Trumpet",
  14: "Trombone", 15: "French Horn", 16: "Tuba", 17: "Saxophone", 18: "Clarinet",
  19: "Flute", 20: "Violin", 21: "Cello", 22: "Double Bass", 23: "Recorder",
  24: "Streamer", 25: "Listener", 26: "Guitar Vocal", 27: "Keyboard Vocal",
  28: "Bodhran", 29: "Bassoon", 30: "Oboe", 31: "Harp", 32: "Viola",
  33: "Congas", 34: "Bongo", 35: "Vocal Bass", 36: "Vocal Tenor",
  37: "Vocal Alto", 38: "Vocal Soprano", 39: "Banjo", 40: "Mandolin",
  41: "Ukulele", 42: "Bass Ukulele", 43: "Vocal Baritone", 44: "Vocal Lead",
  45: "Mountain Dulcimer", 46: "Scratching", 47: "Rapping", 48: "Vibraphone",
  49: "Conductor",
};

const SKILLS: Record<number, string> = {
  0: "-", 1: "Beginner", 2: "Intermediate", 3: "Expert",
};

const OPSYS: Record<number, string> = {
  0: "Windows", 1: "MacOS", 2: "Linux", 3: "Android", 4: "iOS", 5: "Unix",
};

// ============================================================
// Types
// ============================================================

export interface ClientEntry {
  chanid: number;
  countryid: number;
  country: string;
  instrumentid: number;
  instrument: string;
  skillid: number;
  skill: string;
  name: string;
  city: string;
}

export interface ServerEntry {
  index: number;
  name: string;
  numip: number;
  ip: string;
  port: number;
  countryid: number;
  country: string;
  maxclients: number;
  perm: number;
  city: string;
  ping: number;
  nclients: number;
  os: string;
  version: string;
  versionsort: string;
  clients?: ClientEntry[];
}

export type FetchEvent =
  | { type: "server-list"; servers: ServerEntry[]; from: string }
  | { type: "server-update"; server: ServerEntry; from: string }
  | { type: "error"; message: string; from: string }
  | { type: "done" };

// ============================================================
// IP helpers
// ============================================================
function ip2long(ip: string): number {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function long2ip(v: number): string {
  return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
}

// ============================================================
// Message builders / parsers
// ============================================================

function buildReqServerList(): Uint8Array {
  return encodeSimpleRequest(CLM.REQ_SERVER_LIST);
}

function buildPingMsg(timestamp: number): Uint8Array {
  const buf = new Uint8Array(5);
  let pos = 0;
  pos = putVal(buf, pos, timestamp, 4);
  pos = putVal(buf, pos, 0, 1);
  return encodeMessage(CLM.PING_MS_WITHNUMCLIENTS, buf);
}

function buildReqVersionAndOS(): Uint8Array {
  return encodeSimpleRequest(CLM.REQ_VERSION_AND_OS);
}

function buildReqConnClientsList(): Uint8Array {
  return encodeSimpleRequest(CLM.REQ_CONN_CLIENTS_LIST);
}

function parseServerListFromMsg(
  data: Uint8Array, dirIP: string, dirPort: number,
  startIndex = 0,
): ServerEntry[] {
  const servers: ServerEntry[] = [];
  let i = startIndex;

  while (i < data.length) {
    if (data.length - i < 10) break;
    const [numip, p1] = getVal(data, i, 4); i = p1;
    const [port, p2] = getVal(data, i, 2); i = p2;
    const [countryid, p3] = getVal(data, i, 2); i = p3;
    const [maxclients, p4] = getVal(data, i, 1); i = p4;
    const [perm, p5] = getVal(data, i, 1); i = p5;
    const [name, p6] = getStr(data, i, 2, 256); i = p6;
    const [, p7] = getStr(data, i, 2, 64); i = p7; // legacy IP string
    const [city, p8] = getStr(data, i, 2, 256); i = p8;

    servers.push({
      index: 0,
      name,
      numip: (numip === 0 && port === 0) ? ip2long(dirIP) : numip,
      ip: (numip === 0 && port === 0) ? dirIP : long2ip(numip),
      port: port === 0 ? dirPort : port,
      countryid,
      country: COUNTRIES[countryid] ?? "Unknown",
      maxclients,
      perm,
      city,
      ping: -1,
      nclients: 0,
      os: "",
      version: "",
      versionsort: "",
    });
  }

  return servers;
}

function parseRedServerListFromMsg(
  data: Uint8Array, _dirIP: string, _dirPort: number,
  startIndex = 0,
): ServerEntry[] {
  const servers: ServerEntry[] = [];
  let i = startIndex;

  while (i < data.length) {
    if (data.length - i < 6) break;
    const [numip, p1] = getVal(data, i, 4); i = p1;
    const [port, p2] = getVal(data, i, 2); i = p2;
    const [name, p3] = getStr(data, i, 1, 256); i = p3;

    servers.push({
      index: 0,
      name,
      numip,
      ip: long2ip(numip),
      port,
      countryid: 0,
      country: "-",
      maxclients: 0,
      perm: 0,
      city: "",
      ping: -1,
      nclients: 0,
      os: "",
      version: "",
      versionsort: "",
    });
  }

  return servers;
}

function parsePingResponseData(data: Uint8Array, startIndex = 0):
  { timestamp: number; nclients: number } | null {
  if (data.length - startIndex < 5) return null;
  let i = startIndex;
  const [timestamp, p1] = getVal(data, i, 4); i = p1;
  const [nclients] = getVal(data, i, 1);
  return { timestamp, nclients };
}

function parseVersionAndOSData(data: Uint8Array, startIndex = 0):
  { os: string; version: string; versionsort: string } | null {
  if (data.length - startIndex < 3) return null;
  let i = startIndex;
  const [osid, p1] = getVal(data, i, 1); i = p1;
  const [version, p2] = getStr(data, i, 2, 64); i = p2;
  return { os: OPSYS[osid] ?? "Unknown", version, versionsort: makeVersionSort(version) };
}

function makeVersionSort(ver: string): string {
  const m = ver.match(/(\d+)\.(\d+)\.(\d+)([^:]*)(?::(.+))?/);
  if (!m) return "";
  const [, ma, mi, pa, suffix, ts] = m;
  const k = !suffix ? "=" : /^rc|^beta|^alpha/.test(suffix) ? "<" : !ts ? ">" : "?";
  const s = ts || suffix.replace(/^:/, "");
  return `${ma.padStart(3, "0")}${mi.padStart(3, "0")}${pa.padStart(3, "0")}${k}${s}`;
}

function parseConnClientsListData(data: Uint8Array, startIndex = 0): ClientEntry[] {
  const clients: ClientEntry[] = [];
  let i = startIndex;

  while (i < data.length) {
    if (data.length - i < 14) break;
    const [chanid, p1] = getVal(data, i, 1); i = p1;
    const [countryid, p2] = getVal(data, i, 2); i = p2;
    const [instrumentid, p3] = getVal(data, i, 4); i = p3;
    const [skillid, p4] = getVal(data, i, 1); i = p4;
    i += 4; // legacy IP (zeroed)
    const [name, p6] = getStr(data, i, 2, 128); i = p6;
    const [city] = getStr(data, i, 2, 128);

    clients.push({
      chanid,
      countryid,
      country: COUNTRIES[countryid] ?? "Unknown",
      instrumentid,
      instrument: INSTRUMENTS[instrumentid] ?? "Unknown",
      skillid,
      skill: SKILLS[skillid] ?? "Unknown",
      name,
      city,
    });
  }

  return clients;
}

// ============================================================
// DNS resolution
// ============================================================
async function resolveHostname(hostname: string): Promise<string> {
  const ips = await Deno.resolveDns(hostname, "A");
  if (ips.length === 0) throw new Error(`Could not resolve ${hostname}`);
  return ips[0];
}

// ============================================================
// Main fetch function — async generator
// ============================================================

export async function* fetchJamulusServers(
  directoryAddr: string,
  signal?: AbortSignal,
): AsyncGenerator<FetchEvent> {
  const [hostname, portStr] = directoryAddr.split(":");
  const dirPort = parseInt(portStr || "22124", 10);

  let dirIP: string;
  try {
    dirIP = await resolveHostname(hostname);
  } catch (e) {
    yield { type: "error", message: `DNS error: ${e}`, from: directoryAddr };
    return;
  }

  const socket = createSocket("udp4");
  socket.unref();
  const cleanup = () => { try { socket.close(); } catch { /* */ } };
  if (signal) signal.addEventListener("abort", cleanup, { once: true });

  // Packet queue bridging event-based socket to async generator
  const queue: Array<{ msg: Uint8Array; addr: { address: string; port: number } }> = [];
  let packetResolve: ((v: { msg: Uint8Array; addr: { address: string; port: number } } | undefined) => void) | null = null;

  socket.on("message", (data: Uint8Array, rinfo: { address: string; port: number }) => {
    if (packetResolve) {
      const r = packetResolve;
      packetResolve = null;
      r({ msg: data, addr: rinfo });
    } else {
      queue.push({ msg: data, addr: rinfo });
    }
  });

  const waitForPacket = (timeout: number) =>
    new Promise<{ msg: Uint8Array; addr: { address: string; port: number } } | undefined>((r) => {
      if (queue.length > 0) return r(queue.shift()!);
      packetResolve = r;
      setTimeout(() => {
        if (packetResolve) {
          const r2 = packetResolve;
          packetResolve = null;
          r2(undefined);
        }
      }, timeout);
    });

  await new Promise<void>((resolve, reject) => {
    socket.on("error", reject);
    socket.bind(0, resolve);
  });

  try {
    // State per server, indexed by "ip:port"
    const servers = new Map<string, ServerEntry>();
    // Track ping state: -1 = initial (need to send first ping),
    //                    0 = first ping received (send second ping),
    //                   >0 = ping calculated
    const pingState = new Map<string, number>();
    // How many servers are fully processed (have ping > 0)
    let serversInProgress = 0;
    let serversDone = 0;
    let listComplete = false;

    // Send initial request to directory
    const reqMsg = buildReqServerList();
    let lastSendTime = Date.now();
    socket.send(reqMsg, 0, reqMsg.length, dirPort, dirIP);

    const GLOBAL_TIMEOUT = 15000;
    const IDLE_TIMEOUT = 2000;
    const startTime = Date.now();
    let lastActivity = startTime;

    while (Date.now() - startTime < GLOBAL_TIMEOUT) {
      if (signal?.aborted) break;

      // Determine idle timeout: once list is complete and all servers have
      // been pinged at least once, use idle timeout
      const remaining = Math.min(GLOBAL_TIMEOUT - (Date.now() - startTime), IDLE_TIMEOUT);
      if (remaining <= 0) break;

      const result = await waitForPacket(remaining);
      if (!result) {
        // Timeout / no packet
        if (listComplete && serversInProgress === 0 && serversDone > 0) {
          break; // normal exit — idle after processing
        }
        if (!listComplete && Date.now() - lastSendTime > 2000) {
          // Retry server list request if no response yet
          lastSendTime = Date.now();
          socket.send(reqMsg, 0, reqMsg.length, dirPort, dirIP);
        }
        continue;
      }

      lastActivity = Date.now();
      const { msg, addr } = result;

      // Filter messages from the directory for server list
      const fromDir = addr.address === dirIP && addr.port === dirPort;

      // Decode and handle connectionless messages only
      const decoded = decodeMessage(msg);
      if (!decoded) continue;

      const { id, data } = decoded;

      switch (id) {
        case CLM.SERVER_LIST: {
          if (fromDir) {
            const parsed = parseServerListFromMsg(data, dirIP, dirPort);
            for (const s of parsed) {
              const key = `${s.ip}:${s.port}`;
              if (!servers.has(key)) {
                servers.set(key, s);
                pingState.set(key, -1);
                serversInProgress++;
              }
            }
            yield { type: "server-list", servers: Array.from(servers.values()), from: directoryAddr };
            listComplete = true;

            // Send pings to all servers
            for (const [key, srv] of servers) {
              if (pingState.get(key) === -1 && srv.port > 0) {
                const ts = (performance.now() | 0) >>> 0;
                const pingMsg = buildPingMsg(ts);
                socket.send(pingMsg, 0, pingMsg.length, srv.port, srv.ip);
              }
            }
          }
          break;
        }

        case CLM.RED_SERVER_LIST: {
          if (fromDir) {
            const parsed = parseRedServerListFromMsg(data, dirIP, dirPort);
            for (const s of parsed) {
              const key = `${s.ip}:${s.port}`;
              if (!servers.has(key)) {
                servers.set(key, s);
                pingState.set(key, -1);
                serversInProgress++;
              }
            }
            yield { type: "server-list", servers: Array.from(servers.values()), from: directoryAddr };
            listComplete = true;

            for (const [key, srv] of servers) {
              if (pingState.get(key) === -1 && srv.port > 0) {
                const ts = (performance.now() | 0) >>> 0;
                const pingMsg = buildPingMsg(ts);
                socket.send(pingMsg, 0, pingMsg.length, srv.port, srv.ip);
              }
            }
          }
          break;
        }

        case CLM.PING_MS_WITHNUMCLIENTS: {
          const key = `${addr.address}:${addr.port}`;
          if (!servers.has(key)) break;

          const pingRes = parsePingResponseData(data);
          if (!pingRes) break;

          const state = pingState.get(key)!;
          const server = servers.get(key)!;

          if (state === -1) {
            // First ping response: discard, send second ping
            pingState.set(key, 0);
            server.nclients = pingRes.nclients;
            // Send second ping
            const ts = (performance.now() | 0) >>> 0;
            const pingMsg = buildPingMsg(ts);
            socket.send(pingMsg, 0, pingMsg.length, addr.port, addr.address);
          } else if (state === 0) {
            // Second ping response: calculate actual ping
            const now = (performance.now() | 0) >>> 0;
            let pingVal = (now - pingRes.timestamp) >>> 0;
            if (pingVal > 100000) pingVal = 0; // sanity: clamp obviously-wrapped values
            server.ping = pingVal;
            server.nclients = pingRes.nclients;
            pingState.set(key, pingVal);
            serversDone++;

            // Send version request
            const verMsg = buildReqVersionAndOS();
            socket.send(verMsg, 0, verMsg.length, addr.port, addr.address);

            // Send connected clients request if there are clients
            if (pingRes.nclients > 0) {
              const cliMsg = buildReqConnClientsList();
              socket.send(cliMsg, 0, cliMsg.length, addr.port, addr.address);
            }

            yield { type: "server-update", server: { ...server }, from: key };

            serversInProgress--;
          }
          break;
        }

        case CLM.VERSION_AND_OS: {
          const key = `${addr.address}:${addr.port}`;
          if (!servers.has(key)) break;
          const verRes = parseVersionAndOSData(data);
          if (!verRes) break;
          const server = servers.get(key)!;
          server.os = verRes.os;
          server.version = verRes.version;
          server.versionsort = verRes.versionsort;
          yield { type: "server-update", server: { ...server }, from: key };
          break;
        }

        case CLM.CONN_CLIENTS_LIST: {
          const key = `${addr.address}:${addr.port}`;
          if (!servers.has(key)) break;
          const clients = parseConnClientsListData(data);
          const server = servers.get(key)!;
          server.clients = clients;
          yield { type: "server-update", server: { ...server }, from: key };
          break;
        }

        default:
          break;
      }
    }

    // Re-index and yield final server list
    const finalServers = Array.from(servers.values())
      .filter((s) => s.ping >= 0)
      .map((s, i) => ({ ...s, index: i }));

    yield { type: "server-list", servers: finalServers, from: directoryAddr };
    yield { type: "done" };
  } finally {
    cleanup();
  }
}
