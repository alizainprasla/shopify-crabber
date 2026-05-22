/**
 * Icon Generator Script
 * Generates PNG icons from SVG for Chrome extension
 *
 * Usage: node scripts/generate-icons.js
 *
 * Requires: sharp package (npm install sharp --save-dev)
 *
 * Or use an online converter:
 * 1. Go to https://cloudconvert.com/svg-to-png
 * 2. Upload icons/icon.svg
 * 3. Generate at sizes: 16x16, 32x32, 48x48, 128x128
 * 4. Save as icon16.png, icon32.png, icon48.png, icon128.png in icons/
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Install with: npm install sharp --save-dev');
  console.log('');
  console.log('Alternative: Use an online SVG to PNG converter');
  console.log('1. Go to https://cloudconvert.com/svg-to-png');
  console.log('2. Upload icons/icon.svg');
  console.log('3. Generate at sizes: 16x16, 32x32, 48x48, 128x128');
  console.log('4. Save in icons/ folder as icon16.png, icon32.png, icon48.png, icon128.png');
  process.exit(0);
}

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
