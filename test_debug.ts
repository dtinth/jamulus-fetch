import { fetchJamulusServers } from "./jamulus_protocol.ts";
import { decodeMessage } from "./jamulus_protocol.ts";
import { createSocket } from "node:dgram";

const dir = "anygenre1.jamulus.app:22124";

// Log all message IDs received
const socket = createSocket("udp4");
socket.on("message", (data: Uint8Array, rinfo) => {
  const decoded = decodeMessage(data);
  if (decoded) {
    console.log(`  [MSG] id=${decoded.id} from=${rinfo.address}:${rinfo.port} len=${decoded.data.length}`);
  } else {
    console.log(`  [MSG] invalid/CRC from=${rinfo.address}:${rinfo.port}`);
  }
});

await new Promise<void>((r) => socket.bind(0, r));

// Parse host
const [host, portStr] = dir.split(":");
const dirPort = parseInt(portStr, 10);
const ips = await Deno.resolveDns(host, "A");
const dirIP = ips[0];

// Import encodeSimpleRequest
import { encodeMessage } from "./jamulus_protocol.ts";

// Send REQ_SERVER_LIST
const reqMsg = encodeMessage(1007, new Uint8Array(0));
socket.send(reqMsg, 0, reqMsg.length, dirPort, dirIP);

console.log(`Listening on bound port, sent req to ${dirIP}:${dirPort}`);

// Wait 10 seconds
await new Promise((r) => setTimeout(r, 10000));
console.log("Done listening");
socket.close();
