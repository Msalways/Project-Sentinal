import { describe, it, expect } from 'vitest';

const STATIC_ASSET_EXTENSIONS = [
  '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp',
];

function filterHarEntries(entries: { request?: { url?: string }; response?: { status?: number } }[]): { request?: { url?: string }; response?: { status?: number } }[] {
  return entries.filter((entry) => {
    const url = entry?.request?.url;
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      const ext = parsed.pathname.substring(parsed.pathname.lastIndexOf('.')).toLowerCase();
      if (STATIC_ASSET_EXTENSIONS.includes(ext)) return false;
    } catch {
      return false;
    }
    return true;
  });
}

describe('filterHarEntries', () => {
  it('removes entries with undefined url', () => {
    const entries = [
      { request: { url: 'https://example.com/api/data' } },
      { request: {} },
      {} as any,
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/api/data');
  });

  it('removes entries with null url', () => {
    const entries = [
      { request: { url: null as any } },
      { request: { url: 'https://example.com/valid' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/valid');
  });

  it('removes entries with empty string url', () => {
    const entries = [
      { request: { url: '' } },
      { request: { url: 'https://example.com/valid' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/valid');
  });

  it('removes entries with non-string url', () => {
    const entries = [
      { request: { url: 123 as any } },
      { request: { url: true as any } },
      { request: { url: 'https://example.com/valid' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('removes .css files', () => {
    const entries = [
      { request: { url: 'https://example.com/styles/main.css' } },
      { request: { url: 'https://example.com/api/query' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/api/query');
  });

  it('removes .js files', () => {
    const entries = [
      { request: { url: 'https://example.com/bundle.js' } },
      { request: { url: 'https://example.com/app.min.js' } },
      { request: { url: 'https://example.com/api/script' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('removes image files (.png, .jpg, .jpeg, .gif, .svg, .webp, .ico)', () => {
    const entries = [
      { request: { url: 'https://example.com/image.png' } },
      { request: { url: 'https://example.com/photo.jpg' } },
      { request: { url: 'https://example.com/photo.jpeg' } },
      { request: { url: 'https://example.com/icon.gif' } },
      { request: { url: 'https://example.com/vector.svg' } },
      { request: { url: 'https://example.com/pic.webp' } },
      { request: { url: 'https://example.com/favicon.ico' } },
      { request: { url: 'https://example.com/index.html' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/index.html');
  });

  it('removes font files (.woff, .woff2, .ttf, .eot)', () => {
    const entries = [
      { request: { url: 'https://example.com/font.woff' } },
      { request: { url: 'https://example.com/font.woff2' } },
      { request: { url: 'https://example.com/font.ttf' } },
      { request: { url: 'https://example.com/font.eot' } },
      { request: { url: 'https://example.com/page' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('removes source map files (.map)', () => {
    const entries = [
      { request: { url: 'https://example.com/bundle.js.map' } },
      { request: { url: 'https://example.com/style.css.map' } },
      { request: { url: 'https://example.com/main.ts' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('treats extension matching case-insensitively', () => {
    const entries = [
      { request: { url: 'https://example.com/style.CSS' } },
      { request: { url: 'https://example.com/bundle.JS' } },
      { request: { url: 'https://example.com/image.PNG' } },
      { request: { url: 'https://example.com/payload.Json' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('handles URLs with query parameters and fragments', () => {
    const entries = [
      { request: { url: 'https://example.com/api/data?format=json&count=10#section' } },
      { request: { url: 'https://example.com/script.js?version=2&cache=bust' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/api/data?format=json&count=10#section');
  });

  it('handles URLs with paths containing dots before the extension', () => {
    const entries = [
      { request: { url: 'https://example.com/api/v2.0/users' } },
      { request: { url: 'https://example.com/styles/main.min.css' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].request!.url).toBe('https://example.com/api/v2.0/users');
  });

  it('rejects malformed URLs', () => {
    const entries = [
      { request: { url: 'not-a-valid-url' } },
      { request: { url: 'http://' } },
      { request: { url: 'https://example.com/valid' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('preserves API endpoints regardless of response status', () => {
    const entries = [
      { request: { url: 'https://example.com/api/login' }, response: { status: 401 } },
      { request: { url: 'https://example.com/api/data' }, response: { status: 200 } },
      { request: { url: 'https://example.com/api/error' }, response: { status: 500 } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(3);
  });

  it('preserves non-static URLs like .html, .htm, .asp, .php', () => {
    const entries = [
      { request: { url: 'https://example.com/index.html' } },
      { request: { url: 'https://example.com/default.asp' } },
      { request: { url: 'https://example.com/page.php?id=1' } },
      { request: { url: 'https://example.com/script.js' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(3);
  });

  it('preserves entries with no response object', () => {
    const entries = [
      { request: { url: 'https://example.com/api/pending' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(1);
  });

  it('handles empty entry array', () => {
    const result = filterHarEntries([]);
    expect(result).toEqual([]);
  });

  it('removes only assets, keeps mixed entries correctly', () => {
    const entries = [
      { request: { url: 'https://example.com/app.js' } },
      { request: { url: 'https://example.com/api/users' } },
      { request: { url: 'https://example.com/style.css' } },
      { request: { url: 'https://example.com/api/orders' } },
      { request: { url: 'https://example.com/logo.png' } },
    ];
    const result = filterHarEntries(entries);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.request!.url)).toEqual([
      'https://example.com/api/users',
      'https://example.com/api/orders',
    ]);
  });
});
