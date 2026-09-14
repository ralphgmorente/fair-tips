/**
 * Generates the PWA icons, the maskable icons and the iOS launch screens.
 *
 * Run after changing the brand mark:  node scripts/generate-pwa-assets.mjs
 * Outputs land in public/icons and public/splash and are committed, so the build
 * needs no image tooling. It also writes lib/splash-devices.ts, which is what the
 * root layout turns into <link rel="apple-touch-startup-image"> tags — keeping the
 * device list and the generated files from drifting apart.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Brand ramp, matching --accent in globals.css. */
const HI = "#2bbd9c";
const LIGHT = "#17a184";
const MID = "#0f7c67";
const DEEP = "#06483d";
const NIGHT = "#052e27";

/**
 * A superellipse, which is the continuous corner iOS uses. A plain rounded
 * rectangle next to real app icons reads as slightly wrong, and the difference
 * costs nothing to draw.
 */
function squircle(size, n = 5) {
  const a = size / 2;
  const k = 2 / n;
  const points = [];
  for (let i = 0; i <= 360; i += 1) {
    const t = (i * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = a + a * Math.sign(c) * Math.abs(c) ** k;
    const y = a + a * Math.sign(s) * Math.abs(s) ** k;
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

const polar = (cx, cy, r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;

/**
 * One share of the pooled tips: a wedge whose edges curve, so the mark reads as
 * a pot being split three ways rather than as a pie chart.
 */
function share(cx, cy, r, a0) {
  const a1 = a0 + (Math.PI * 2) / 3;
  const out = (a) => `${polar(cx, cy, r * 0.44, a - 1.02)} ${polar(cx, cy, r * 0.82, a - 0.52)}`;
  const back = (a) => `${polar(cx, cy, r * 0.82, a - 0.52)} ${polar(cx, cy, r * 0.44, a - 1.02)}`;
  return [
    `M ${cx} ${cy}`,
    `C ${out(a0)} ${polar(cx, cy, r, a0)}`,
    `A ${r} ${r} 0 0 1 ${polar(cx, cy, r, a1)}`,
    `C ${back(a1)} ${cx} ${cy}`,
    "Z"
  ].join(" ");
}

/**
 * The three shares. Gaps are strokes painted in the very gradient behind them, so
 * they read as cuts through the mark at any size instead of grey seams.
 */
function mark(cx, cy, r, gapPaint, gap) {
  const tilts = [-Math.PI / 2, -Math.PI / 2 + (Math.PI * 2) / 3, -Math.PI / 2 + (Math.PI * 4) / 3];
  const opacity = [1, 0.86, 0.72];
  return tilts
    .map(
      (a, i) =>
        `<path d="${share(cx, cy, r, a)}" fill="#ffffff" fill-opacity="${opacity[i]}" ` +
        `stroke="${gapPaint}" stroke-width="${gap.toFixed(2)}" stroke-linejoin="round" />`
    )
    .join("");
}

/** Icon tile. `bleed` squares off the corners for surfaces that mask their own. */
function iconSvg(size, { bleed = false, radiusScale = 0.31 } = {}) {
  const shape = bleed
    ? `<rect width="${size}" height="${size}" fill="url(#tile)" />`
    : `<path d="${squircle(size)}" fill="url(#tile)" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="tile" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${size}" y2="${size}">
      <stop offset="0" stop-color="${HI}" />
      <stop offset="0.42" stop-color="${LIGHT}" />
      <stop offset="0.74" stop-color="${MID}" />
      <stop offset="1" stop-color="${DEEP}" />
    </linearGradient>
  </defs>
  ${shape}
  ${mark(size / 2, size / 2, size * radiusScale, "url(#tile)", size * 0.026)}
</svg>`;
}

/** iOS launch screen: brand-coloured, so it reads the same in light and dark mode. */
function splashSvg(w, h) {
  const min = Math.min(w, h);
  const cy = h * 0.42;
  const r = min * 0.155;
  const name = min * 0.086;
  const sub = min * 0.032;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}">
      <stop offset="0" stop-color="${MID}" />
      <stop offset="0.62" stop-color="${DEEP}" />
      <stop offset="1" stop-color="${NIGHT}" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)" />
  ${mark(w / 2, cy, r, "url(#bg)", min * 0.013)}
  <text x="${w / 2}" y="${cy + r + name * 1.5}" text-anchor="middle"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700"
    font-size="${name}" letter-spacing="${name * 0.005}" fill="#ffffff">ShiftFlow</text>
  <text x="${w / 2}" y="${cy + r + name * 1.5 + sub * 2.1}" text-anchor="middle"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600"
    font-size="${sub}" letter-spacing="${sub * 0.24}" fill="#ffffff" fill-opacity="0.58">TIP DISTRIBUTION</text>
</svg>`;
}

async function write(svg, out, w, h) {
  const path = new URL(out, new URL("file://" + ROOT)).pathname;
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(w, h)
    .png({ compressionLevel: 9, palette: false })
    .toFile(path);
  const { size } = await sharp(path).metadata().then(async (m) => ({ ...m, size: (await import("node:fs")).statSync(path).size }));
  console.log(`  ${relative(ROOT, path)}  ${w}x${h}  ${(size / 1024).toFixed(0)}KB`);
}

/** Portrait launch images. iOS shows a blank screen for any device not listed here. */
const DEVICES = [
  { w: 393, h: 852, s: 3 }, { w: 402, h: 874, s: 3 }, { w: 430, h: 932, s: 3 },
  { w: 440, h: 956, s: 3 }, { w: 390, h: 844, s: 3 }, { w: 428, h: 926, s: 3 },
  { w: 375, h: 812, s: 3 }, { w: 414, h: 896, s: 3 }, { w: 414, h: 896, s: 2 },
  { w: 414, h: 736, s: 3 }, { w: 375, h: 667, s: 2 },
  { w: 768, h: 1024, s: 2 }, { w: 810, h: 1080, s: 2 }, { w: 820, h: 1180, s: 2 },
  { w: 834, h: 1194, s: 2 }, { w: 1024, h: 1366, s: 2 }
];

console.log("icons:");
for (const size of [192, 512]) {
  await write(iconSvg(size), `public/icons/icon-${size}.png`, size, size);
}
// Android crops maskable icons to its launcher's shape, so the mark stays well
// inside the 80% safe circle and the background covers every corner.
for (const size of [192, 512]) {
  await write(iconSvg(size, { bleed: true, radiusScale: 0.235 }), `public/icons/icon-maskable-${size}.png`, size, size);
}
await write(iconSvg(180, { bleed: true }), "public/icons/apple-touch-icon.png", 180, 180);
await write(iconSvg(512), "public/icons/favicon-32.png", 32, 32);
await write(iconSvg(512), "public/icons/favicon-16.png", 16, 16);
await writeFile(new URL("public/icons/icon.svg", new URL("file://" + ROOT)).pathname, iconSvg(512) + "\n");
console.log("  public/icons/icon.svg");

console.log("splash:");
for (const d of DEVICES) {
  const w = d.w * d.s;
  const h = d.h * d.s;
  await write(splashSvg(w, h), `public/splash/launch-${w}x${h}.png`, w, h);
}

const ts = `// Generated by scripts/generate-pwa-assets.mjs — do not edit by hand.
export type SplashDevice = { url: string; media: string };

export const splashDevices: SplashDevice[] = [
${DEVICES.map((d) => {
  const w = d.w * d.s;
  const h = d.h * d.s;
  return `  {
    url: "/splash/launch-${w}x${h}.png",
    media:
      "(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.s}) and (orientation: portrait)"
  }`;
}).join(",\n")}
];
`;
await writeFile(new URL("lib/splash-devices.ts", new URL("file://" + ROOT)).pathname, ts);
console.log("  lib/splash-devices.ts");
