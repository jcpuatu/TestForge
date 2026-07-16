import { lookup } from 'dns/promises';
import { assertPublicHttpUrl } from './urlSafety';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

async function rejects(url: string) {
  await expect(assertPublicHttpUrl(url)).rejects.toThrow();
}

describe('assertPublicHttpUrl', () => {
  beforeEach(() => mockLookup.mockReset());

  it('rejects malformed URLs', async () => {
    await rejects('not-a-url');
  });

  it('rejects non-http(s) schemes', async () => {
    await rejects('ftp://example.com/file');
    await rejects('file:///etc/passwd');
    await rejects('javascript:alert(1)');
  });

  it('rejects "localhost" by name', async () => {
    await rejects('http://localhost:4000/hook');
  });

  it('rejects direct IPv4 loopback/private/link-local literals without needing DNS', async () => {
    await rejects('http://127.0.0.1/hook');
    await rejects('http://10.0.0.5/hook');
    await rejects('http://172.16.0.5/hook');
    await rejects('http://172.31.255.255/hook');
    await rejects('http://192.168.1.1/hook');
    // The cloud metadata endpoint (AWS/GCP/Azure) — the single highest-value SSRF target this
    // guard exists to close off.
    await rejects('http://169.254.169.254/latest/meta-data/');
    await rejects('http://0.0.0.0/hook');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects direct IPv6 loopback/link-local/unique-local literals without needing DNS', async () => {
    await rejects('http://[::1]/hook');
    await rejects('http://[fe80::1]/hook');
    await rejects('http://[fc00::1]/hook');
    await rejects('http://[::ffff:127.0.0.1]/hook');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('accepts a direct public IPv4 literal without needing DNS', async () => {
    await expect(assertPublicHttpUrl('http://8.8.8.8/hook')).resolves.toBeUndefined();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('resolves a hostname via DNS and accepts it when every address is public', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    await expect(assertPublicHttpUrl('https://example.com/hook')).resolves.toBeUndefined();
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  // The DNS-rebinding case: a hostname that resolves to an internal address at request time,
  // even though the hostname itself looks innocuous — exactly why this is re-checked at delivery
  // time (see webhook-dispatcher.ts), not just once at registration.
  it('rejects a hostname that resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as never);
    await rejects('https://looks-fine.example.com/hook');
  });

  it('rejects a hostname that resolves to a mix of public and private addresses', async () => {
    mockLookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ] as never);
    await rejects('https://mixed.example.com/hook');
  });

  it('rejects a hostname that fails to resolve', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await rejects('https://does-not-exist.invalid/hook');
  });
});
