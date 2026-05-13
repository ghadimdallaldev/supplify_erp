import { isValidEmail, isValidUrl, slugify, sanitizeHtml, generateId } from './validators.ts';

describe('validators', () => {
  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('name+tag@domain.co')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@missing-local.com')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('accepts valid URLs', () => {
      expect(isValidUrl('https://supplify.com/path')).toBe(true);
    });

    it('rejects invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('slugify', () => {
    it('normalizes text into URL slugs', () => {
      expect(slugify('  Hello World!  ')).toBe('hello-world');
      expect(slugify('Fresh_Foods & Co.')).toBe('fresh-foods-co');
    });
  });

  describe('sanitizeHtml', () => {
    it('strips script and iframe tags', () => {
      const dirty = '<p>ok</p><script>alert(1)</script><iframe src="x"></iframe>';
      expect(sanitizeHtml(dirty)).toBe('<p>ok</p>');
    });
  });

  describe('generateId', () => {
    it('returns unique string ids', () => {
      const a = generateId();
      const b = generateId();
      expect(a).not.toBe(b);
      expect(a.length).toBeGreaterThan(5);
    });
  });
});
