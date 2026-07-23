import { describe, it, expect } from 'vitest';
import type { SharePublicPayload } from '@stasis/shared';
import { renderOgSvg, svgToPng } from './og-image.js';

const payload: SharePublicPayload = {
  leadElement: 'fire',
  headline: 'Я — Огонь 🔥 <script>alert(1)</script> & "quoted"',
  blurb: 'Ты живёшь через энергию и движение вперёд.',
};

describe('renderOgSvg', () => {
  it('returns a well-formed SVG containing the escaped headline and the element accent color', () => {
    const svg = renderOgSvg(payload);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    // Fire accent color present.
    expect(svg).toContain('#d97a4a');
    // Headline text is XML-escaped: no raw '<script>' or unescaped '&'/'"'.
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert(1)</script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;quoted&quot;');
    // Blurb text present.
    expect(svg).toContain('Ты живёшь через энергию и движение вперёд.');
    // Wordmark present.
    expect(svg).toContain('Stasis');
  });

  it('renders a distinct accent color per element', () => {
    const ACCENTS = { fire: '#d97a4a', water: '#6aa6c8', air: '#b8a6d9', earth: '#8aa87d' } as const;
    for (const [leadElement, accent] of Object.entries(ACCENTS) as [keyof typeof ACCENTS, string][]) {
      const svg = renderOgSvg({ leadElement, headline: 'h', blurb: 'b' });
      expect(svg).toContain(accent);
    }
    // And that they're actually distinct values (sanity on the fixture itself).
    expect(new Set(Object.values(ACCENTS)).size).toBe(4);
  });
});

describe('svgToPng', () => {
  it('renders a non-empty PNG buffer with the correct magic bytes', () => {
    const svg = renderOgSvg(payload);
    const png = svgToPng(svg);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(0);
    expect(png.subarray(0, 4).toString('latin1')).toBe('\x89PNG');
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
