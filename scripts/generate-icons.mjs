/**
 * Generate PNG icons from SVG
 * Run with: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [16, 32, 48, 128];
const svgPath = path.join(__dirname, '..', 'icons', 'icon.svg');
const iconsDir = path.join(__dirname, '..', 'icons');

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated: icon${size}.png`);
  }

  console.log('Done! All icons generated.');
}

generateIcons().catch(console.error);
