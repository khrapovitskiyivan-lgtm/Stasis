import { Resvg } from '@resvg/resvg-js';
import type { Element, SharePublicPayload } from '@stasis/shared';

const WIDTH = 1200;
const HEIGHT = 630;

// Element accent colors for the OG card background/border. Purely cosmetic —
// no relation to any scoring/belief content.
const ELEMENT_ACCENT: Record<Element, string> = {
  fire: '#d97a4a',
  water: '#6aa6c8',
  air: '#b8a6d9',
  earth: '#8aa87d',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Render the PII-free share card as a hand-built SVG. Only the witness-copy
// fields (leadElement/headline/blurb) are ever drawn here — see
// SharePublicPayloadSchema for what's guaranteed absent.
export function renderOgSvg(payload: SharePublicPayload): string {
  const accent = ELEMENT_ACCENT[payload.leadElement];
  const headline = escapeXml(payload.headline);
  const blurb = escapeXml(payload.blurb);

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a1f" />
      <stop offset="100%" stop-color="#2a2530" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" fill="none" stroke="${accent}" stroke-width="8" rx="24" />
  <circle cx="${WIDTH - 140}" cy="140" r="90" fill="${accent}" opacity="0.25" />
  <text x="80" y="240" font-family="sans-serif" font-size="72" font-weight="700" fill="#ffffff">${headline}</text>
  <text x="80" y="320" font-family="sans-serif" font-size="34" fill="#d9d5e0">
    <tspan x="80" dy="0">${blurb}</tspan>
  </text>
  <text x="80" y="${HEIGHT - 60}" font-family="sans-serif" font-size="28" font-weight="600" fill="${accent}">Stasis</text>
</svg>`;
}

// Rasterize the SVG card to PNG bytes via resvg (native/wasm resvg-js render).
export function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg);
  const rendered = resvg.render();
  return rendered.asPng();
}
