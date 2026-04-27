// Walks a product's image folder, parses each filename for metadata,
// and decides which image represents each color (for variant mapping).
//
// Naming convention (all optional):
//   <position>-<color>-<side>.<ext>   e.g. 01-black-front.png
//   <anything>.<ext>                   uploads in alphabetical order
//
// You can also drop completely arbitrary filenames; they upload but
// don't get variant-mapped.

import fs from 'fs/promises';
import path from 'path';

const COLORS = [
  'black', 'ivory', 'white', 'cream', 'natural', 'charcoal',
  'navy', 'sand', 'olive', 'rust', 'red', 'blue', 'green',
  'gray', 'grey', 'tan', 'brown', 'pink', 'yellow',
];
const SIDES = ['front', 'back', 'side', 'detail'];
const LIFESTYLE_HINTS = ['lifestyle', 'campaign', 'editorial', 'model'];

const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;

export async function readImageFolder(dir) {
  if (!dir) return [];
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  return files
    .filter(f => IMG_RE.test(f))
    .map(f => parseFilename(f, path.join(dir, f)))
    .sort((a, b) => a.position - b.position || a.filename.localeCompare(b.filename));
}

function parseFilename(filename, fullPath) {
  const base = filename.replace(IMG_RE, '');
  const tokens = base.toLowerCase().split(/[-_\s]+/);

  let position = 999;
  if (/^\d+$/.test(tokens[0])) position = parseInt(tokens[0], 10);

  const color = tokens.find(t => COLORS.includes(t));
  const side = tokens.find(t => SIDES.includes(t));
  const isLifestyle = tokens.some(t => LIFESTYLE_HINTS.some(h => t.includes(h)));

  const altParts = [];
  if (color) altParts.push(capitalize(color));
  if (side) altParts.push(side);
  if (isLifestyle && !side) altParts.push('lifestyle');
  const alt = altParts.length ? altParts.join(' — ') : base.replace(/[-_]/g, ' ');

  return {
    filename,
    fullPath,
    position,
    color: color ? capitalize(color) : null,
    side,
    isLifestyle,
    alt: capitalize(alt),
  };
}

// Pick the canonical photo for a color (front shot preferred).
export function pickVariantImage(color, parsedImages) {
  if (!color) return null;
  const target = color.toLowerCase();
  const matches = parsedImages.filter(i => i.color?.toLowerCase() === target);
  if (!matches.length) return null;
  return (
    matches.find(i => i.side === 'front' && !i.isLifestyle) ||
    matches.find(i => !i.isLifestyle) ||
    matches[0]
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
