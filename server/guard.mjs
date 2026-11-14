// Request guard for standalone mode. Browsers let any web page open a WebSocket
// to, or send a simple POST to, an address on your LAN, so without these checks
// a malicious page could drive Home Assistant with the server's token or
// replace the setup. Two rules:
//   1. Host: the server must be addressed by a local name or IP. A public
//      domain name here usually means DNS rebinding, unless it is listed in
//      ALLOWED_ORIGINS (for a reverse proxy with its own domain).
//   2. Origin: a browser request that can change something (WebSocket, POST,
//      PUT, DELETE) must come from this app's own page, or from an origin in
//      ALLOWED_ORIGINS. Requests without an Origin header (curl, scripts, the
//      health check) are not browser cross-site requests and are let through.
// In add-on mode the app is only reachable through ingress, which Home
// Assistant already authenticates, so the guard is not applied there.

const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.internal', '.localdomain'];

export function parseAllowedOrigins(value = '') {
  const hosts = new Set();
  for (const raw of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    try {
      hosts.add(new URL(raw).host.toLowerCase());
    } catch {
      console.warn(`ALLOWED_ORIGINS: ignoring "${raw}" (expected e.g. https://floorplan.example.com)`);
    }
  }
  return hosts;
}

function hostname(host) {
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']')); // [::1]:8099
  return host.replace(/:\d+$/, '');
}

export function isLocalHost(host) {
  const name = hostname(host.toLowerCase());
  if (!name) return false;
  if (name === 'localhost' || name.includes(':')) return true; // localhost or IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true; // IPv4 literal
  if (!name.includes('.')) return true; // single-label LAN name, e.g. "nas"
  return LOCAL_SUFFIXES.some((s) => name.endsWith(s));
}

// Returns null when the request is fine, otherwise a short reason.
export function checkRequest({ host, origin, forwardedHost, changesState }, allowed) {
  const reqHost = (forwardedHost || host || '').split(',')[0].trim().toLowerCase();
  if (!reqHost) return 'missing Host header';
  if (!isLocalHost(reqHost) && !allowed.has(reqHost)) {
    return `host "${reqHost}" is not a local address; add its URL to ALLOWED_ORIGINS if this is your reverse proxy`;
  }
  if (!changesState || !origin) return null;
  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return 'malformed Origin header';
  }
  if (originHost === reqHost || originHost === (host || '').toLowerCase() || allowed.has(originHost)) return null;
  return `cross-site request from ${origin} blocked; add it to ALLOWED_ORIGINS if you trust it`;
}

export function requestInfo(req, { upgrade = false } = {}) {
  return {
    host: req.headers.host,
    origin: req.headers.origin,
    forwardedHost: req.headers['x-forwarded-host'],
    changesState: upgrade || !['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  };
}
