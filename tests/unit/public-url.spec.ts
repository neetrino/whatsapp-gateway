import { validatePublicHttpsUrl } from '../../src/common/utils/public-url';
import dns from 'node:dns/promises';

jest.mock('node:dns/promises', () => ({
  resolve4: jest.fn(),
  resolve6: jest.fn(),
  lookup: jest.fn(),
}));

const mockDns = dns as jest.Mocked<typeof dns>;

describe('validatePublicHttpsUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDns.resolve4.mockRejectedValue(new Error('ENODATA'));
    mockDns.resolve6.mockRejectedValue(new Error('ENODATA'));
    mockDns.lookup.mockResolvedValue([{ address: '1.1.1.1', family: 4 }] as never);
  });

  it('accepts https URL when DNS resolves to public IP', async () => {
    mockDns.resolve4.mockResolvedValueOnce(['1.1.1.1']);
    const r = await validatePublicHttpsUrl('https://cdn.example.com/photo.jpg');
    expect(r.href).toContain('https://cdn.example.com/');
  });

  it('rejects http', async () => {
    await expect(validatePublicHttpsUrl('http://example.com/a.jpg')).rejects.toThrow(
      'must use HTTPS',
    );
  });

  it('rejects file protocol', async () => {
    await expect(validatePublicHttpsUrl('file:///C:/x.jpg')).rejects.toThrow();
  });

  it('rejects localhost', async () => {
    await expect(validatePublicHttpsUrl('https://localhost/x.jpg')).rejects.toThrow();
  });

  it('rejects 127.0.0.1', async () => {
    await expect(validatePublicHttpsUrl('https://127.0.0.1/x.jpg')).rejects.toThrow();
  });

  it('rejects 10.0.0.0/8', async () => {
    await expect(validatePublicHttpsUrl('https://10.0.0.5/x.jpg')).rejects.toThrow();
  });

  it('rejects 192.168.0.0/16', async () => {
    await expect(validatePublicHttpsUrl('https://192.168.1.10/x.jpg')).rejects.toThrow();
  });

  it('rejects 172.16.0.0/12', async () => {
    await expect(validatePublicHttpsUrl('https://172.16.0.10/x.jpg')).rejects.toThrow();
  });

  it('rejects host.docker.internal', async () => {
    await expect(validatePublicHttpsUrl('https://host.docker.internal/x.jpg')).rejects.toThrow();
  });

  it('rejects URL with credentials', async () => {
    await expect(validatePublicHttpsUrl('https://user:pass@example.com/x.jpg')).rejects.toThrow(
      'credentials',
    );
  });

  it('rejects when DNS resolves to private IP', async () => {
    mockDns.resolve4.mockResolvedValueOnce(['10.0.0.1']);
    await expect(validatePublicHttpsUrl('https://evil.example/x.jpg')).rejects.toThrow('private');
  });
});
