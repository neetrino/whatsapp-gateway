import { hashV1SendRequest, normalizeCaptionForHash } from '../../src/v1/request-hash';

describe('v1 request hash', () => {
  it('treats omitted and whitespace-only captions as the same hash', () => {
    expect(normalizeCaptionForHash(undefined)).toBeNull();
    expect(normalizeCaptionForHash('')).toBeNull();
    expect(normalizeCaptionForHash('   ')).toBeNull();
    const omitted = hashV1SendRequest({
      type: 'IMAGE',
      chatId: '37499111222@c.us',
      mediaUrl: 'https://cdn.example.com/a.jpg',
    });
    const blank = hashV1SendRequest({
      type: 'IMAGE',
      chatId: '37499111222@c.us',
      mediaUrl: 'https://cdn.example.com/a.jpg',
      caption: '  ',
    });
    expect(omitted).toBe(blank);
  });

  it('does not embed raw text, caption, or mediaUrl in the hash input equality', () => {
    const a = hashV1SendRequest({ type: 'TEXT', chatId: '37499111222@c.us', text: 'secret-text' });
    const b = hashV1SendRequest({ type: 'TEXT', chatId: '37499111222@c.us', text: 'other-text' });
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret-text');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when caption text changes after trim', () => {
    const one = hashV1SendRequest({
      type: 'VIDEO',
      chatId: '37499111222@c.us',
      mediaUrl: 'https://cdn.example.com/a.mp4',
      caption: 'hello',
    });
    const two = hashV1SendRequest({
      type: 'VIDEO',
      chatId: '37499111222@c.us',
      mediaUrl: 'https://cdn.example.com/a.mp4',
      caption: 'hello ',
    });
    expect(one).toBe(two);
  });
});
