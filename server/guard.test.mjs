import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRequest, isLocalHost, parseAllowedOrigins } from './guard.mjs';

const none = new Set();
const ws = (host, origin, extra = {}) => ({ host, origin, changesState: true, ...extra });

test('local hosts are recognised', () => {
  for (const h of ['localhost:8099', '127.0.0.1:8099', '192.168.1.20:8099', '[::1]:8099', 'nas:8099', 'docker.lan', 'pi.local:8099', 'box.home.arpa']) {
    assert.equal(isLocalHost(h), true, h);
  }
  for (const h of ['evil.example:8099', 'floorplan.mydomain.com', 'local.evil.com']) {
    assert.equal(isLocalHost(h), false, h);
  }
});

test('same-origin browser requests are allowed', () => {
  assert.equal(checkRequest(ws('192.168.1.20:8099', 'http://192.168.1.20:8099'), none), null);
  assert.equal(checkRequest(ws('nas:8099', 'http://nas:8099'), none), null);
});

test('cross-site WebSocket and POST are refused', () => {
  assert.match(checkRequest(ws('192.168.1.20:8099', 'https://evil.example'), none), /cross-site/);
  assert.match(checkRequest(ws('192.168.1.20:8099', 'http://192.168.1.21:8099'), none), /cross-site/);
  assert.match(checkRequest(ws('nas:8099', 'null'), none), /malformed|cross-site/);
});

test('reads from another origin are left to the browser (no CORS headers are sent)', () => {
  assert.equal(checkRequest({ host: 'nas:8099', origin: 'https://evil.example', changesState: false }, none), null);
});

test('requests without an Origin header (curl, health check) are allowed', () => {
  assert.equal(checkRequest(ws('127.0.0.1:8099', undefined), none), null);
});

test('DNS rebinding to a public name is refused', () => {
  assert.match(checkRequest({ host: 'rebind.evil.example:8099', changesState: false }, none), /not a local address/);
  assert.match(checkRequest(ws('rebind.evil.example:8099', 'http://rebind.evil.example:8099'), none), /not a local address/);
});

test('a reverse proxy domain works once it is in ALLOWED_ORIGINS', () => {
  const allowed = parseAllowedOrigins('https://floorplan.mydomain.com, https://ha.mydomain.com');
  const proxy = 'https://floorplan.mydomain.com';
  assert.match(checkRequest(ws('floorplan.mydomain.com', proxy), none), /ALLOWED_ORIGINS/);
  assert.equal(checkRequest(ws('floorplan.mydomain.com', proxy), allowed), null);
  // proxy that rewrites Host but sets X-Forwarded-Host
  assert.equal(checkRequest(ws('127.0.0.1:8099', proxy, { forwardedHost: 'floorplan.mydomain.com' }), allowed), null);
  // a page on another trusted origin, e.g. HA embedding it
  assert.equal(checkRequest(ws('192.168.1.20:8099', 'https://ha.mydomain.com'), allowed), null);
});

test('bad ALLOWED_ORIGINS entries are ignored, not fatal', () => {
  const allowed = parseAllowedOrigins('not a url,https://ok.example');
  assert.deepEqual([...allowed], ['ok.example']);
});
