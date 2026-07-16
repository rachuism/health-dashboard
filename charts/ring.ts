const CENTER = 110;
const RADIUS = 78;
const STROKE_WIDTH = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let gradientCounter = 0;

export type RingOptions = {
  valueText: string;
  unitText: string;
  subLabel?: string;
  colorFrom: string;
  colorTo: string;
  /** 0-1 fill toward a goal. Omit for a static decorative ring (no implied target/scale). */
  progress?: number;
};

export function renderRing(svg: SVGSVGElement, options: RingOptions): void {
  const { valueText, unitText, subLabel, colorFrom, colorTo, progress } = options;
  const gradientId = `ringGradient${gradientCounter++}`;

  const parts = [
    `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${STROKE_WIDTH}"></circle>`,
  ];

  if (progress == null) {
    parts.push(
      `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none" stroke="url(#${gradientId})" stroke-width="${STROKE_WIDTH}"></circle>`
    );
  } else {
    const clamped = Math.max(0, Math.min(progress, 1));
    const dashOffset = CIRCUMFERENCE * (1 - clamped);
    parts.push(
      `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="none" stroke="url(#${gradientId})" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 ${CENTER} ${CENTER})"></circle>`
    );
  }

  parts.push(
    `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${colorFrom}"/><stop offset="100%" stop-color="${colorTo}"/></linearGradient></defs>`,
    `<text x="${CENTER}" y="103" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="30" font-weight="700" fill="#e8ecf1">${valueText}</text>`,
    `<text x="${CENTER}" y="126" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.4" fill="#8b9cad">${unitText}</text>`
  );

  if (subLabel) {
    parts.push(
      `<text x="${CENTER}" y="156" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.4" fill="#8b9cad">${subLabel}</text>`
    );
  }

  svg.innerHTML = parts.join("");
}

export function clearRing(svg: SVGSVGElement): void {
  svg.innerHTML = "";
}
