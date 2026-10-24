import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicLiveUrl, isBlockedIp, parseLiveUrl } from "@/lib/validation/live-url";

test("parseLiveUrl accepts public sites and keeps the path", () => {
  assert.deepEqual(parseLiveUrl("my-app.vercel.app"), { url: "https://my-app.vercel.app/", origin: "https://my-app.vercel.app", path: "/" });
  const l = parseLiveUrl("https://team.netlify.app/dashboard#top");
  assert.equal(l.url, "https://team.netlify.app/dashboard");
  assert.equal(l.path, "/dashboard");
  assert.equal(parseLiveUrl("http://example.com").origin, "http://example.com");
});

test("parseLiveUrl rejects local, private and non-web addresses", () => {
  const saved = process.env.DEMOFORGE_ALLOW_PRIVATE_URLS;
  delete process.env.DEMOFORGE_ALLOW_PRIVATE_URLS;
  try {
    for (const bad of [
      "http://localhost:3000",
      "http://app.localhost",
      "http://127.0.0.1:8080",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5",
      "http://192.168.1.20:5173",
      "http://172.20.0.1",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[::ffff:127.0.0.1]/",
      "file:///etc/passwd",
      "ftp://example.com",
      "https://user:pass@example.com",
    ])
      assert.throws(() => parseLiveUrl(bad), Error, bad);
  } finally {
    if (saved !== undefined) process.env.DEMOFORGE_ALLOW_PRIVATE_URLS = saved;
  }
});

test("DEMOFORGE_ALLOW_PRIVATE_URLS=1 allows LAN addresses (local use only)", async () => {
  const saved = process.env.DEMOFORGE_ALLOW_PRIVATE_URLS;
  process.env.DEMOFORGE_ALLOW_PRIVATE_URLS = "1";
  try {
    const l = parseLiveUrl("http://192.168.1.20:5173/");
    await assertPublicLiveUrl(l);
    assert.equal(l.origin, "http://192.168.1.20:5173");
  } finally {
    if (saved === undefined) delete process.env.DEMOFORGE_ALLOW_PRIVATE_URLS;
    else process.env.DEMOFORGE_ALLOW_PRIVATE_URLS = saved;
  }
});

test("isBlockedIp covers private ranges but not public ones", () => {
  for (const ip of ["0.0.0.0", "100.64.1.1", "198.18.0.1", "224.0.0.1", "fe80::1", "::"]) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "76.76.21.21", "172.32.0.1", "2606:4700::1111"]) assert.equal(isBlockedIp(ip), false, ip);
});
