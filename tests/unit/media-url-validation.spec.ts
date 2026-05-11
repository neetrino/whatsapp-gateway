import { assertExtensionMatches } from '../../src/messages/media-url-validation';
import { AppException } from '../../src/common/errors/app.exception';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

describe('assertExtensionMatches', () => {
  it('allows image extensions', () => {
    expect(() => assertExtensionMatches('/a/b.JPEG', 'IMAGE')).not.toThrow();
    expect(() => assertExtensionMatches('/x.webp', 'IMAGE')).not.toThrow();
  });

  it('rejects image URL with video extension', () => {
    expect(() => assertExtensionMatches('/a.mp4', 'IMAGE')).toThrow(AppException);
    try {
      assertExtensionMatches('/a.mp4', 'IMAGE');
    } catch (e) {
      expect(e).toMatchObject({ code: ERROR_CODES.INVALID_MEDIA_URL });
    }
  });

  it('allows video extensions', () => {
    expect(() => assertExtensionMatches('/v.MP4', 'VIDEO')).not.toThrow();
  });
});
