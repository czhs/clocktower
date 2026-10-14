let ipCounter = 1;
/** Distinct X-Forwarded-For per simulated client (the server trusts loopback proxies, like Funnel). */
export function fakeClientIp(): string {
  const n = ipCounter++ + (process.pid % 200) * 1000;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}
