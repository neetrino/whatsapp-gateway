/**
 * Live WAHA multi-session check against the pinned image.
 * Skips unless WAHA_INTEGRATION=1.
 *
 *   docker compose -f docker-compose.yml -f docker-compose.integration.yml up -d waha
 *   WAHA_BASE_URL=http://127.0.0.1:3001 WAHA_INTEGRATION=1 npm run test:waha
 *
 * Do not point WAHA_BASE_URL at the Gateway (host port 3000).
 */
import axios, { type AxiosInstance } from 'axios';
import { randomBytes } from 'node:crypto';

const enabled = process.env.WAHA_INTEGRATION === '1';
const baseURL = process.env.WAHA_BASE_URL ?? 'http://127.0.0.1:3001';
const apiKey = process.env.WAHA_API_KEY ?? '';
const describeLive = enabled ? describe : describe.skip;

const isGatewayPayload = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  if (record.success === true && record.data && typeof record.data === 'object') {
    const inner = record.data as Record<string, unknown>;
    return 'gateway' in inner || 'database' in inner;
  }
  return false;
};

const requireMultiSession = (status: number, body: unknown, name: string): void => {
  const text = JSON.stringify(body ?? {});
  if (status === 422 && /only default session/i.test(text)) {
    throw new Error(
      `WAHA image does not support named sessions (tried "${name}"). ` +
        'Pinned contract is devlikeapro/waha:noweb-2026.8.1 with independent NOWEB sessions.',
    );
  }
  if (status < 200 || status >= 300) {
    throw new Error(`WAHA session create/start for "${name}" failed: HTTP ${status} ${text.slice(0, 300)}`);
  }
};

describeLive('WAHA multi-session (live)', () => {
  const http: AxiosInstance = axios.create({
    baseURL,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    },
    validateStatus: () => true,
  });

  const runId = randomBytes(4).toString('hex');
  const sessionA = `wa_it_${runId}_a`;
  const sessionB = `wa_it_${runId}_b`;

  const deleteSession = async (name: string): Promise<void> => {
    await http.delete(`/api/sessions/${encodeURIComponent(name)}`);
    await http.post('/api/sessions/stop', { name });
  };

  beforeAll(async () => {
    const probe = await http.get('/api/sessions');
    if (isGatewayPayload(probe.data)) {
      throw new Error(
        `WAHA_BASE_URL=${baseURL} is the Gateway, not WAHA. ` +
          'Use docker-compose.integration.yml and http://127.0.0.1:3001.',
      );
    }
    if (probe.status === 404 || probe.status === 401) {
      throw new Error(
        `WAHA_BASE_URL=${baseURL} did not accept GET /api/sessions (HTTP ${probe.status}).`,
      );
    }
  });

  afterAll(async () => {
    await deleteSession(sessionA);
    await deleteSession(sessionB);
  });

  const createNamedSession = async (name: string): Promise<void> => {
    const created = await http.post('/api/sessions', { name });
    requireMultiSession(created.status, created.data, name);
    const started = await http.post(`/api/sessions/${encodeURIComponent(name)}/start`);
    if (started.status !== 201 && started.status !== 200) {
      requireMultiSession(started.status, started.data, name);
    }
  };

  it('creates two independent NOWEB sessions with distinct status and QR', async () => {
    await createNamedSession(sessionA);
    await createNamedSession(sessionB);
    expect(sessionA).not.toBe(sessionB);

    const statusA = await http.get(`/api/sessions/${encodeURIComponent(sessionA)}`);
    const statusB = await http.get(`/api/sessions/${encodeURIComponent(sessionB)}`);
    expect(statusA.status).toBe(200);
    expect(statusB.status).toBe(200);
    const nameA = (statusA.data as { name?: string }).name;
    const nameB = (statusB.data as { name?: string }).name;
    expect(nameA).toBe(sessionA);
    expect(nameB).toBe(sessionB);
    expect(nameA).not.toBe(nameB);
    expect(statusA.data).not.toEqual(statusB.data);

    const qrA = await http.get(`/api/${encodeURIComponent(sessionA)}/auth/qr`, {
      params: { format: 'json' },
    });
    const qrB = await http.get(`/api/${encodeURIComponent(sessionB)}/auth/qr`, {
      params: { format: 'json' },
    });
    const working = (raw: { status?: string }) => raw.status === 'WORKING';
    const expectQr = (status: number, sessionStatus: { status?: string }, label: string) => {
      if (working(sessionStatus)) {
        expect([200, 422]).toContain(status);
        return;
      }
      expect(status).toBe(200);
      if (status !== 200) {
        throw new Error(`${label} QR was not independently available (HTTP ${status})`);
      }
    };
    expectQr(qrA.status, statusA.data as { status?: string }, sessionA);
    expectQr(qrB.status, statusB.data as { status?: string }, sessionB);
  });
});
