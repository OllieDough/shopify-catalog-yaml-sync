// Pull products FROM Shopify INTO local YAML + images.
//
// This is the reverse of sync.js — instead of pushing YAML → Shopify,
// we download Shopify → YAML.
//
// Use cases:
// - Initial setup: capture existing store into version control
// - Sync changes made in Shopify admin back to local
// - Create a snapshot/backup of the store

import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function pullCatalog({ shopify, outputPath, log, downloadImages = true, stateManager }) {
  const stats = {
    productsDownloaded: 0,
    imagesDownloaded: 0,
    errors: [],
    durationMs: 0,
  };

  const start = Date.now();
  log('📥 Pulling products from Shopify...');

  // Fetch all products
  const products = await shopify.getAllProducts(log);
  log(`Found ${products.length} products\n`);

  const catalogDir = path.dirname(path.resolve(outputPath));
  const imagesBaseDir = path.join(catalogDir, 'images');

  const catalogProducts = [];

  for (const sp of products) {
    log(`── ${sp.title} (${sp.handle}) ──`);

    try {
      // Convert Shopify product to catalog format
      const catalogProduct = await convertProduct(sp);
      catalogProducts.push(catalogProduct);

      // Download images if requested (parallel download)
      if (downloadImages && sp.media.edges.length > 0) {
        const productImageDir = path.join(imagesBaseDir, sp.handle);
        await fs.mkdir(productImageDir, { recursive: true });

        const imageNodes = sp.media.edges
          .map(e => e.node)
          .filter(m => m.__typename === 'MediaImage');

        // Download in parallel (max 3 concurrent)
        const results = await Promise.allSettled(
          imageNodes.map((media, idx) =>
            downloadImage({
              url: media.image.url,
              dir: productImageDir,
              position: idx + 1,
              alt: media.alt,
            })
          )
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected');

        stats.imagesDownloaded += successful;

        if (failed.length) {
          failed.forEach(f => {
            log(`  ✗ Image download failed: ${f.reason?.message || 'Unknown error'}`);
            stats.errors.push({ handle: sp.handle, error: f.reason?.message });
          });
        }

        log(`  ↓ Images: ${successful}/${imageNodes.length} downloaded`);
      }

      // Record pull in state
      if (stateManager) {
        stateManager.recordPull(sp.handle, sp);
      }

      stats.productsDownloaded++;
      log(`  ✓ Done`);
    } catch (err) {
      log(`  ✗ Failed: ${err.message}`);
      stats.errors.push({ handle: sp.handle, error: err.message });
    }
  }

  // Generate catalog.yaml
  const catalog = {
    store: shopify.storeDomain,
    products: catalogProducts,
  };

  const yamlContent = YAML.stringify(catalog, {
    indent: 2,
    lineWidth: 0, // Don't wrap lines
  });

  await fs.writeFile(outputPath, yamlContent);
  log(`\n📝 Catalog saved: ${outputPath}`);

  if (stateManager) {
    await stateManager.save();
    log(`📝 State saved: ${stateManager.statePath}`);
  }

  stats.durationMs = Date.now() - start;
  return stats;
}

// Convert Shopify product format → catalog YAML format
function convertProduct(sp) {
  // Extract unique option values
  const options = sp.options.map(opt => ({
    name: opt.name,
    values: opt.optionValues.map(v => v.name),
  }));

  // Extract variant data
  const variants = sp.variants.edges.map(e => e.node);

  // Infer common price/cost/weight (use first variant as template)
  const firstVariant = variants[0] || {};
  const price = parseFloat(firstVariant.price || '0');
  const compareAt = firstVariant.compareAtPrice ? parseFloat(firstVariant.compareAtPrice) : null;
  const cost = firstVariant.inventoryItem?.unitCost?.amount
    ? parseFloat(firstVariant.inventoryItem.unitCost.amount)
    : null;
  const weight = firstVariant.inventoryItem?.measurement?.weight?.value || 0;

  // If options are "Color" and "Size", use shorthand
  const colorOption = options.find(o => o.name.toLowerCase() === 'color');
  const sizeOption = options.find(o => o.name.toLowerCase() === 'size');

  const product = {
    title: sp.title,
    handle: sp.handle,
    type: sp.productType || undefined,
    vendor: sp.vendor || undefined,
    price,
  };

  if (compareAt) product.compare_at = compareAt;
  if (cost) product.cost = cost;
  if (weight) product.weight_grams = weight;

  // Use shorthand if possible
  if (colorOption) {
    product.colors = colorOption.values;
  }
  if (sizeOption) {
    product.sizes = sizeOption.values;
  }

  // Add custom options (not color/size)
  const customOptions = options.filter(
    o => o.name.toLowerCase() !== 'color' && o.name.toLowerCase() !== 'size'
  );
  if (customOptions.length) {
    product.options = customOptions;
  }

  if (sp.descriptionHtml) {
    product.description = convertHtmlToPlaintext(sp.descriptionHtml);
  }

  if (sp.tags.length) {
    product.tags = sp.tags;
  }

  if (sp.seo?.title) product.seo_title = sp.seo.title;
  if (sp.seo?.description) product.seo_description = sp.seo.description;

  product.status = sp.status.toLowerCase();

  // Point to images folder
  product.images = `./images/${sp.handle}/`;

  return product;
}

// Download an image from Shopify to local disk
async function downloadImage({ url, dir, position, alt }) {
  const ext = path.extname(new URL(url).pathname) || '.png';
  const filename = `${String(position).padStart(2, '0')}${ext}`;
  const filePath = path.join(dir, filename);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filename;
}

// Very basic HTML → plain text (good enough for descriptions)
function convertHtmlToPlaintext(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
