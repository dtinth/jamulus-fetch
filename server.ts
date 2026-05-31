// SPDX-License-Identifier: GPL-2.0-or-later

import { fetchJamulusServers, type ServerEntry } from "./jamulus_protocol.ts";

const AUTH_TOKEN = Deno.env.get("AUTH_TOKEN");
const ALLOWED_SERVERS_RAW = Deno.env.get("ALLOWED_SERVERS");

const DEFAULT_SERVERS = [
  "anygenre1.jamulus.io:22124",
  "anygenre2.jamulus.io:22224",
  "asia.jamulus.io:22624",
  "rock.jamulus.io:22424",
  "jazz.jamulus.io:22324",
  "classical.jamulus.io:22524",
  "choral.jamulus.io:22724",
];

let ALLOWED_SERVERS: string[] | null = null;
if (ALLOWED_SERVERS_RAW) {
  if (ALLOWED_SERVERS_RAW === "default") {
    ALLOWED_SERVERS = DEFAULT_SERVERS;
  } else {
    ALLOWED_SERVERS = ALLOWED_SERVERS_RAW.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")
  ?.split(",").map((s) => s.trim()).filter(Boolean) ?? ["*"];

const PORT = parseInt(Deno.env.get("PORT") ?? "8080", 10);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization",
      "vary": "origin",
    },
  });
}

function unauthorized(): Response {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function forbidden(): Response {
  return jsonResponse({ error: "Forbidden: directory not in allowed list" }, 403);
}

async function handleRequest(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Auth check
  if (AUTH_TOKEN) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`) {
      return unauthorized();
    }
  }

  const url = new URL(req.url);
  const directory = url.searchParams.get("directory");

  if (!directory) {
    return jsonResponse({ error: "Missing 'directory' query parameter" }, 400);
  }

  // Whitelist check
  if (ALLOWED_SERVERS && !ALLOWED_SERVERS.includes(directory)) {
    return forbidden();
  }

  // Fetch with 5s timeout
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 5000);

  try {
    let servers: ServerEntry[] = [];

    for await (const event of fetchJamulusServers(directory, ac.signal)) {
      if (event.type === "server-list") {
        servers = event.servers; // last list is the filtered final one
      }
    }

    clearTimeout(timeout);
    return jsonResponse(servers);
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === "AbortError") {
      return jsonResponse({ error: "Request timed out after 5 seconds" }, 504);
    }
    return jsonResponse({ error: String(e) }, 500);
  }
}

Deno.serve({ port: PORT }, handleRequest);
