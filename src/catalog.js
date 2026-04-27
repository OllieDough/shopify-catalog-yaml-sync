// Read a catalog.yaml file and normalize it into a fully-specified product
// set. The YAML supports shortcuts (just `sizes: [S, M, L]` instead of
// declaring full variant matrices); this is where those expand.

import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

// Schema-light validation. Throws with a useful message if the YAML is wrong.
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const DEFAULT_TAGS = ['new-arrivals'];

export async function loadCatalog(catalogPath) {
  const raw = await fs.readFile(catalogPath, 'utf8');
  const parsed = YAML.parse(raw);
  const baseDir = path.dirname(catalogPath);

  assert(parsed?.store, 'catalog.yaml: `store` (myshopify domain) is required');
  assert(Array.isArray(parsed.products), 'catalog.yaml: `products` must be a list');

  const defaults = {
    vendor: parsed.vendor || 'My Brand',
    status: 'ACTIVE',
    inventory_qty: 25,
    track_inventory: true,
    inventory_policy: 'DENY',
    weight_grams: 0,
    ...parsed.defaults,
  };

  const products = parsed.products.map((p, i) => normalizeProduct(p, defaults, baseDir, i));
  const collections = (parsed.collections || []).map(normalizeCollection);

  // Global sync config (manage/ignore lists)
  const sync = parsed.sync || {};

  return {
    store: parsed.store,
    sync,
    products,
    collections,
  };
}

function normalizeProduct(p, defaults, baseDir, idx) {
  assert(p.title, `product[${idx}]: missing title`);

  const handle = p.handle || slugify(p.title);

  // Build options + variant matrix
  const options = [];
  if (p.colors?.length) options.push({ name: 'Color', values: [...p.colors] });
  if (p.sizes?.length) options.push({ name: 'Size', values: [...p.sizes] });
  // Allow custom options too
  for (const o of p.options || []) {
    options.push({ name: o.name, values: [...o.values] });
  }

  // Generate cartesian product of option values → variants
  const variants = options.length
    ? cartesian(options.map(o => o.values.map(v => ({ name: o.name, value: v }))))
    : [[]]; // single variant if no options

  const fullVariants = variants.map(combo => {
    const optionValues = combo.map(c => c.value);
    const optionsByName = Object.fromEntries(combo.map(c => [c.name.toLowerCase(), c.value]));
    const sku = buildSku(handle, combo, p.sku_prefix);

    return {
      sku,
      optionValues,                  // ordered array matching options
      color: optionsByName.color,    // convenience field for image mapping
      size: optionsByName.size,
      price: String(p.price ?? 0),
      compareAtPrice: p.compare_at != null ? String(p.compare_at) : null,
      cost: p.cost != null ? String(p.cost) : null,
      inventoryQty: p.inventory_qty ?? defaults.inventory_qty,
      weightGrams: p.weight_grams ?? defaults.weight_grams,
    };
  });

  // Resolve image folder
  let imagesDir = null;
  if (p.images) {
    imagesDir = path.isAbsolute(p.images) ? p.images : path.resolve(baseDir, p.images);
  }

  // Tags
  const tags = [...new Set([...DEFAULT_TAGS, ...(p.tags || [])])];

  return {
    handle,
    title: p.title,
    descriptionHtml: p.description_html || markdownToBasicHtml(p.description || ''),
    vendor: p.vendor || defaults.vendor,
    productType: p.type || '',
    status: (p.status || defaults.status).toUpperCase(),
    tags,
    seoTitle: p.seo_title || p.title,
    seoDescription: p.seo_description || '',
    googleCategory: p.google_category || null,
    gender: p.gender || null,
    options,
    variants: fullVariants,
    imagesDir,
    sync: p.sync || {},   // per-product sync config (manage/ignore overrides)
  };
}

function normalizeCollection(c) {
  return {
    handle: c.handle || slugify(c.title),
    title: c.title,
    descriptionHtml: markdownToBasicHtml(c.description || ''),
    rules: c.rules || [],
    ruleLogic: (c.rule_logic || 'ANY').toUpperCase(),
  };
}

function cartesian(arrays) {
  if (!arrays.length) return [[]];
  return arrays.reduce(
    (acc, curr) => acc.flatMap(a => curr.map(c => [...a, c])),
    [[]]
  );
}

function buildSku(handle, combo, prefixOverride) {
  const prefix = prefixOverride || handle.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12);
  const suffix = combo.map(c => abbreviate(c.value)).join('-');
  return suffix ? `${prefix}-${suffix}` : prefix;
}

function abbreviate(value) {
  // "Black" → "BLK"; "Ivory" → "IVR"; "XS" → "XS"; "Knee-High" → "KNH"
  const v = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (v.length <= 3) return v;
  // Take first letter + first letters of remaining clusters, fall back to first 3
  return v.slice(0, 3);
}

// Lightweight markdown → HTML. Just enough for product descriptions.
// For real markdown, swap in 'marked'. Keeps this dep-light.
function markdownToBasicHtml(md) {
  if (!md) return '';
  const lines = md.trim().split(/\n\n+/);
  return lines.map(block => {
    if (block.startsWith('# ')) return `<h2>${escape(block.slice(2))}</h2>`;
    if (block.startsWith('## ')) return `<h3>${escape(block.slice(3))}</h3>`;
    if (block.match(/^\s*[-*]\s+/m)) {
      const items = block.split(/\n/).map(l => l.replace(/^\s*[-*]\s+/, ''));
      return `<ul>${items.map(i => `<li>${escape(i)}</li>`).join('')}</ul>`;
    }
    return `<p>${escape(block).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
