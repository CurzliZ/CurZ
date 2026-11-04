import { createRequire } from "node:module";
import { copyFile, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const sourceDirectory = path.join(root, "brand", "source");
const outputDirectory = path.join(root, "frontend", "public", "brand");
const colors = {
  accent: "#7C83FF",
  background: "#0B0D12",
  foreground: "#E8EAF0",
};

async function findLogo() {
  const files = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(png|svg|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => path.join(sourceDirectory, entry.name));
  if (files.length !== 1) {
    throw new Error(
      `Expected exactly one logo in brand/source; found ${files.length}: ${files.join(", ")}`,
    );
  }
  return files[0];
}

async function centeredImage(imageBuffer, size, inset = 0.8, background = null, radius = 0) {
  const inner = Math.round(size * inset);
  const shape = background
    ? `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ""} fill="${background}"/>`
    : "";
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape}</svg>`,
  );
  const fitted = await sharp(imageBuffer)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return sharp(svg)
    .composite([{
      input: fitted,
      left: Math.round((size - inner) / 2),
      top: Math.round((size - inner) / 2),
    }]);
}

function buildIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  const images = entries.map(({ size, data }, index) => {
    const position = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, position);
    header.writeUInt8(size === 256 ? 0 : size, position + 1);
    header.writeUInt8(0, position + 2);
    header.writeUInt8(0, position + 3);
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(data.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += data.length;
    return data;
  });
  return Buffer.concat([header, ...images]);
}

function glyphTextSvg(fontPath, text, fontSize, x, baseline) {
  const font = fontkit.openSync(fontPath);
  const run = font.layout(text);
  const scale = fontSize / font.unitsPerEm;
  let cursor = 0;
  const glyphs = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const transform = `translate(${x + (cursor + position.xOffset) * scale} ${baseline - position.yOffset * scale}) scale(${scale} ${-scale})`;
    cursor += position.xAdvance;
    return `<path d="${glyph.path.toSVG()}" transform="${transform}"/>`;
  });
  return `<g fill="${colors.foreground}">${glyphs.join("")}</g>`;
}

async function writeSquareLogo(logo, name, size, background, inset) {
  await (await centeredImage(logo, size, inset, background))
    .png()
    .toFile(path.join(outputDirectory, name));
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const logoPath = await findLogo();
  const original = await readFile(logoPath);
  const logo = await sharp(original).trim().png().toBuffer();

  await sharp(logo).resize(96, 32, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png()
    .toFile(path.join(outputDirectory, "logo-mark.png"));
  await sharp(logo).resize(192, 64, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png()
    .toFile(path.join(outputDirectory, "logo-mark@2x.png"));
  if (path.extname(logoPath).toLowerCase() === ".svg") {
    await copyFile(logoPath, path.join(outputDirectory, "logo-mark.svg"));
  }

  await writeSquareLogo(logo, "favicon-32.png", 32, null, 0.82);
  await writeSquareLogo(logo, "apple-touch-icon.png", 180, null, 0.82);
  await writeSquareLogo(logo, "icon-192.png", 192, null, 0.82);
  await writeSquareLogo(logo, "icon-512.png", 512, null, 0.82);
  await writeSquareLogo(logo, "icon-maskable-512.png", 512, colors.accent, 0.8);

  const faviconEntries = await Promise.all([16, 32, 48].map(async (size) => ({
    size,
    data: await (await centeredImage(logo, size, 0.82)).png().toBuffer(),
  })));
  await writeFile(path.join(outputDirectory, "favicon.ico"), buildIco(faviconEntries));

  const fontPath = path.join(
    root,
    "frontend",
    "node_modules",
    "@fontsource-variable",
    "newsreader",
    "files",
    "newsreader-latin-wght-normal.woff2",
  );
  const heading = glyphTextSvg(fontPath, "CurZ", 82, 0, 466);
  const headingWidth = fontkit.openSync(fontPath).layout("CurZ").advanceWidth * (82 / 2000);
  const headingX = (1200 - headingWidth) / 2;
  const shiftedHeading = heading.replaceAll(
    /translate\(([-\d.]+) ([-\d.]+)\)/g,
    (_match, x, y) => `translate(${Number(x) + headingX} ${y})`,
  );
  const logoImage = await sharp(logo)
    .resize(460, 160, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const socialCard = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <rect width="1200" height="630" fill="${colors.background}"/>
      <rect x="340" y="92" width="520" height="184" rx="20" fill="${colors.accent}"/>
      ${shiftedHeading}
      <text x="600" y="525" text-anchor="middle" fill="${colors.foreground}" font-family="Inter, Arial, sans-serif" font-size="26">
        Your notes become a brain you can see, question, and trust.
      </text>
    </svg>`,
  );
  await sharp(socialCard)
    .composite([{ input: logoImage, left: 370, top: 104 }])
    .png()
    .toFile(path.join(outputDirectory, "og-image.png"));

  console.log(`Generated CurZ brand assets from ${path.relative(root, logoPath)}.`);
}

main().catch((error) => {
  console.error(`Could not build CurZ brand assets: ${error.message}`);
  process.exitCode = 1;
});
