// Top-level sync runner with selective field/operation control (Pattern C).
//
// For each product:
//   1. Check if it exists in Shopify
//   2. Build a SyncPolicy from global config + per-product config + CLI flags
//   3. Build productSet input that ONLY includes fields the policy allows
//   4. Run productSet (creates new variants, preserves existing ones via IDs)
//   5. Run inventory/images/variant-image operations only if allowed

import fs from 'fs/promises';
import mime from 'mime-types';
import { readImageFolder, pickVariantImage } from './images.js';
import { SyncPolicy } from './sync-policy.js';
import { StateManager } from './state.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function syncCatalog({ shopify, catalog, log, dryRun = false, cliFlags = {}, stateManager }) {
  const stats = {
    productsCreated: 0,
    productsUpdated: 0,
    productsSkipped: 0,
    conflicts: 0,
    imagesUploaded: 0,
    imagesSkipped: 0,
    variantsMapped: 0,
    inventoryUpdates: 0,
    errors: [],
    durationMs: 0,
  };

  const start = Date.now();
  const locationId = await shopify.getPrimaryLocationId();

  for (const product of catalog.products) {
    log(`\n── ${product.title} (${product.handle}) ──`);

    const existing = await shopify.findProductByHandle(product.handle);
    const policy = new SyncPolicy({
      globalConfig: catalog.sync || {},
      productConfig: product.sync || {},
      cliFlags,
    });

    const mode = policy.modeFor(!!existing);

    if (mode === 'skip') {
      log(`  → SKIP (--only-new and product exists)`);
      stats.productsSkipped++;
      continue;
    }

    // Conflict detection: check if Shopify changed since our last push
    if (mode === 'update' && existing && stateManager && !cliFlags.force) {
      const hasConflict = stateManager.hasConflict(product.handle, existing.updatedAt);
      if (hasConflict) {
        log(`  ⚠ CONFLICT: Shopify updated since last push. Run 'pull' first or use --force to override.`);
        stats.conflicts++;
        stats.productsSkipped++;
        continue;
      }
    }

    if (mode === 'create') {
      log(`  → CREATE (new product)`);
    } else {
      const skipped = policy.describeSkips(mode);
      log(`  → UPDATE` + (skipped.length ? ` (skipping: ${skipped.join(', ')})` : ''));
    }

    if (dryRun) {
      log(`  [dry-run] would push ${product.variants.length} variants`);
      continue;
    }

    // 1. Build productSet input respecting the policy
    const input = buildProductSetInput({ product, existing, policy, mode });

    let result;
    try {
      result = await shopify.productSet(input);
      if (mode === 'create') stats.productsCreated++;
      else stats.productsUpdated++;
      log(`  ✓ Synced (${result.variants.edges.length} variants)`);

      // Record push in state
      if (stateManager) {
        const hash = StateManager.hashProduct(product);
        stateManager.recordPush(product.handle, result, hash);
      }
    } catch (err) {
      log(`  ✗ productSet failed: ${err.message}`);
      stats.errors.push({ handle: product.handle, error: err.message });
      continue;
    }

    // 2. Inventory — only if policy allows
    if (policy.shouldSync('inventory', mode) && locationId) {
      try {
        const updated = await applyInventory(shopify, result, product, locationId);
        stats.inventoryUpdates += updated;
        log(`  ✓ Inventory: ${updated} variant(s) updated`);
      } catch (err) {
        log(`  ⚠ Inventory partial: ${err.message}`);
      }
    } else if (mode === 'update') {
      log(`  ○ Inventory: skipped (operations team owns this — pass --with-inventory to override)`);
    }

    // 3. Images — only if policy allows + skip-if-present check
    let uploaded = [];
    const shouldDoImages = policy.shouldSync('images', mode);
    const productHasMedia = existing && existing.media.edges.length > 0;
    const skipImagesBecauseExisting = productHasMedia && !cliFlags.forceImages && mode === 'update';

    if (shouldDoImages && !skipImagesBecauseExisting) {
      const images = await readImageFolder(product.imagesDir);
      if (!images.length) {
        log(`  ○ Images: no folder or empty (${product.imagesDir || 'unset'})`);
      } else {
        // Upload images with progress indication
        log(`  ↑ Uploading ${images.length} images...`);
        for (const img of images) {
          try {
            const media = await uploadImage(shopify, result.id, img);
            uploaded.push({ ...img, mediaId: media.id });
            stats.imagesUploaded++;
            process.stdout.write(`    ${uploaded.length}/${images.length} uploaded\r`);
            await sleep(200);
          } catch (err) {
            log(`\n    ✗ ${img.filename}: ${err.message}`);
            stats.errors.push({ handle: product.handle, file: img.filename, error: err.message });
          }
        }
        log(`\n  ✓ Images: ${uploaded.length}/${images.length} uploaded`);
      }
    } else if (skipImagesBecauseExisting) {
      log(`  ○ Images: skipped (product has ${existing.media.edges.length} existing — pass --force-images to re-upload)`);
      stats.imagesSkipped += existing.media.edges.length;
    } else if (!shouldDoImages) {
      log(`  ○ Images: skipped (sync policy)`);
    }

    // 4. Variant images — only if we uploaded new images this run AND policy allows
    if (uploaded.length && policy.shouldSync('variant_images', mode)) {
      await sleep(2000);
      const colorOption = product.options.find(o => o.name.toLowerCase() === 'color');
      if (colorOption) {
        for (const color of colorOption.values) {
          const target = pickVariantImage(color, uploaded);
          if (!target) continue;
          const colorVariants = result.variants.edges
            .map(e => e.node)
            .filter(v => v.selectedOptions.some(o =>
              o.name.toLowerCase() === 'color' && o.value === color
            ));
          for (const v of colorVariants) {
            try {
              await shopify.setVariantImage({ variantId: v.id, mediaId: target.mediaId });
              stats.variantsMapped++;
            } catch {}
            await sleep(120);
          }
          log(`  ✓ Mapped ${colorVariants.length} "${color}" variant(s) → ${target.filename}`);
        }
      }
    }
  }

  // Save state after sync
  if (stateManager) {
    await stateManager.save();
  }

  stats.durationMs = Date.now() - start;
  return stats;
}

// Build the productSet input, respecting which fields the policy lets us touch.
// CRITICAL: existing variants are passed through with their IDs so productSet
// preserves them. New variants from YAML get added. Missing variants in YAML
// will only be removed if 'variants' is in manage list.
function buildProductSetInput({ product, existing, policy, mode }) {
  const input = {
    handle: product.handle,
    productOptions: product.options.map(o => ({
      name: o.name,
      values: o.values.map(v => ({ name: v })),
    })),
  };

  if (existing) input.id = existing.id;

  // Conditionally include each managed field
  if (policy.shouldSync('title', mode))       input.title = product.title;
  if (policy.shouldSync('description', mode)) input.descriptionHtml = product.descriptionHtml;
  if (policy.shouldSync('vendor', mode))      input.vendor = product.vendor;
  if (policy.shouldSync('type', mode))        input.productType = product.productType;
  if (policy.shouldSync('status', mode))      input.status = product.status;
  if (policy.shouldSync('tags', mode))        input.tags = product.tags;
  if (policy.shouldSync('seo', mode)) {
    input.seo = { title: product.seoTitle, description: product.seoDescription };
  }

  // For create, certain fields are required even if not "managed"
  if (mode === 'create') {
    if (!input.title) input.title = product.title;
    if (!input.descriptionHtml) input.descriptionHtml = product.descriptionHtml;
  }

  // Variants — preserve existing ones, update fields per policy
  input.variants = buildVariantInputs({ product, existing, policy, mode });

  return input;
}

function buildVariantInputs({ product, existing, policy, mode }) {
  const updatePrice = policy.shouldSync('price', mode);
  const updateCompare = policy.shouldSync('compare_at', mode);
  const updateCost = policy.shouldSync('cost', mode);
  const updateWeight = policy.shouldSync('weight', mode);
  const updateSku = policy.shouldSync('sku', mode);
  const manageVariantSet = policy.shouldSync('variants', mode);

  // Map existing variants by their option-value key for fast lookup
  const existingByKey = new Map();
  if (existing) {
    for (const edge of existing.variants.edges) {
      const v = edge.node;
      const key = v.selectedOptions.map(o => o.value).join('|');
      existingByKey.set(key, v);
    }
  }

  // Start with our YAML variants
  const inputs = product.variants.map(v => {
    const key = v.optionValues.join('|');
    const existingVariant = existingByKey.get(key);

    const vInput = {
      optionValues: v.optionValues.map((value, i) => ({
        optionName: product.options[i].name,
        name: value,
      })),
      inventoryItem: { tracked: true },
    };

    if (existingVariant) {
      vInput.id = existingVariant.id;
      if (updatePrice) vInput.price = v.price;
      if (updateCompare && v.compareAtPrice) vInput.compareAtPrice = v.compareAtPrice;
      if (updateSku) vInput.inventoryItem.sku = v.sku;
      if (updateWeight) {
        vInput.inventoryItem.measurement = { weight: { value: v.weightGrams, unit: 'GRAMS' } };
      }
      if (updateCost && v.cost) vInput.inventoryItem.cost = v.cost;
      existingByKey.delete(key); // mark as accounted-for
    } else {
      // New variant — needs all the data
      vInput.price = v.price;
      if (v.compareAtPrice) vInput.compareAtPrice = v.compareAtPrice;
      vInput.inventoryItem.sku = v.sku;
      vInput.inventoryItem.measurement = { weight: { value: v.weightGrams, unit: 'GRAMS' } };
      if (v.cost) vInput.inventoryItem.cost = v.cost;
    }

    return vInput;
  });

  // Preserve any existing variants that aren't in YAML (unless 'variants' policy
  // explicitly allows pruning). Pass them back with just their ID + option values
  // so productSet keeps them as-is.
  if (!manageVariantSet) {
    for (const [, v] of existingByKey) {
      inputs.push({
        id: v.id,
        optionValues: v.selectedOptions.map(o => ({
          optionName: o.name,
          name: o.value,
        })),
      });
    }
  }

  return inputs;
}

async function applyInventory(shopify, syncedProduct, productSpec, locationId) {
  const variantNodes = syncedProduct.variants.edges.map(e => e.node);
  const variantIds = variantNodes.map(v => v.id);
  const itemMap = await shopify.getInventoryItemsForVariants(variantIds);

  let count = 0;
  for (const variantNode of variantNodes) {
    const optKey = variantNode.selectedOptions.map(o => o.value).join('|');
    const specVariant = productSpec.variants.find(
      sv => sv.optionValues.join('|') === optKey
    );
    if (!specVariant) continue;
    const itemId = itemMap[variantNode.id];
    if (!itemId) continue;
    await shopify.setInventoryQuantity({
      inventoryItemId: itemId,
      locationId,
      quantity: specVariant.inventoryQty,
    });
    count++;
    await sleep(80);
  }
  return count;
}

async function uploadImage(shopify, productId, img) {
  const fileBuffer = await fs.readFile(img.fullPath);
  const mimeType = mime.lookup(img.filename) || 'image/png';
  const target = await shopify.stagedUpload({
    filename: img.filename, mimeType, fileSize: fileBuffer.length,
  });
  await shopify.postFileToStagedUrl({
    stagedTarget: target, fileBuffer, filename: img.filename, mimeType,
  });
  return shopify.productCreateMedia({
    productId, resourceUrl: target.resourceUrl, alt: img.alt,
  });
}
