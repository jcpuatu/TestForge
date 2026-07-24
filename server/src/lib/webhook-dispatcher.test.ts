import { formatDeliveryError } from './webhook-dispatcher';

// Regression tests: fetch (undici) wraps every network failure in a generic "fetch failed"
// TypeError -- the real cause (DNS lookup failure vs. connection refused vs. anything else) lives
// one level down in err.cause, which an earlier version of this code discarded, logging the
// identical "fetch failed" for both. Tested here against synthetic errors shaped exactly like
// Node's real ones (code + message on the cause), rather than through a live DNS lookup, since
// real DNS resolution timing for a deliberately-nonexistent host varies too much across
// environments to be a reliable regression test on its own.
describe('formatDeliveryError', () => {
  it('surfaces a DNS-failure cause distinctly from a connection-refused cause', () => {
    const dnsErr = new TypeError('fetch failed');
    Object.assign(dnsErr, { cause: Object.assign(new Error('getaddrinfo ENOTFOUND this-host-does-not-exist.invalid'), { code: 'ENOTFOUND' }) });

    const refusedErr = new TypeError('fetch failed');
    Object.assign(refusedErr, { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }) });

    const dnsMessage = formatDeliveryError(dnsErr);
    const refusedMessage = formatDeliveryError(refusedErr);

    expect(dnsMessage).toMatch(/ENOTFOUND/);
    expect(refusedMessage).toMatch(/ECONNREFUSED/);
    expect(dnsMessage).not.toBe(refusedMessage);
  });

  it('falls back to the outer error message when there is no cause', () => {
    expect(formatDeliveryError(new Error('fetch failed'))).toBe('fetch failed');
  });

  it('falls back to a generic message for a non-Error throw', () => {
    expect(formatDeliveryError('not an error')).toBe('Request failed');
  });
});
