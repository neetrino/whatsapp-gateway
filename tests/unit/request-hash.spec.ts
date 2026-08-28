import { hashV1SendRequest } from '../../src/v1/request-hash';

describe('hashV1SendRequest', () => {
  it('changes when text changes and stays stable for the same text', () => {
    const a = hashV1SendRequest({ type: 'TEXT', chatId: '1@c.us', text: 'Hello' });
    const b = hashV1SendRequest({ type: 'TEXT', chatId: '1@c.us', text: 'Hello' });
    const c = hashV1SendRequest({ type: 'TEXT', chatId: '1@c.us', text: 'Hello!' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('Hello');
  });
});
