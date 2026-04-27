#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { loadCatalog } from './catalog.js';
import { Shopify } from './shopify.js';
import { syncCatalog } from './sync.js';

async function main() {
  const [, , command, ...rest] = process.argv;

  if (!command || command === 'help' || command === '--help') return printHelp();

  // Parse flags vs positional args
  const flags = new Set(rest.filter(a => a.startsWith('--')));
  const positional = rest.filter(a => !a.startsWith('--'));
  const cliFlags = {
    onlyNew: flags.has('--only-new'),
    forceImages: flags.has('--force-images'),
    skipImages: flags.has('--skip-images'),
    withInventory: flags.has('--with-inventory'),
    skipInventory: flags.has('--skip-inventory'),
    dryRun: flags.has('--dry-run'),
  };

  const cat = positional[0] || './catalog.yaml';
  if (!(await exists(cat))) {
    console.error(`Catalog not found: ${cat}`);
    process.exit(1);
  }

  switch (command) {
    case 'validate': return cmdValidate(cat);
    case 'diff':     return cmdDiff(cat);
    case 'sync':     return cmdSync(cat, cliFlags);
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
shopify-sync — YAML in, Shopify products out.

Usage:
  shopify-sync sync [catalog.yaml] [flags]
  shopify-sync validate [catalog.yaml]
  shopify-sync diff [catalog.yaml]

Sync flags (Pattern C — selective sync):
  --dry-run            Preview without making API calls
  --only-new           Only create new products; never update existing ones
  --force-images       Re-upload images even if product already has media
  --skip-images        Skip image upload entirely this run
  --with-inventory     Push inventory quantities (skipped by default on updates)
  --skip-inventory     Force-skip inventory even if YAML opts in

Auth: set SHOPIFY_ADMIN_TOKEN in .env (root) or in the same dir as the catalog.

Examples:
  shopify-sync sync                                       # uses ./catalog.yaml
  shopify-sync sync examples/ember-tide/catalog.yaml
  shopify-sync sync --dry-run                             # safe preview
  shopify-sync sync --only-new                            # add new products only
  shopify-sync sync --force-images --with-inventory       # full re-sync
`);
}

async function cmdValidate(catalogPath) {
  const catalog = await loadCatalog(catalogPath);
  console.log(`✓ Catalog valid`);
  console.log(`  Store: ${catalog.store}`);
  console.log(`  Products: ${catalog.products.length}`);
  for (const p of catalog.products) {
    console.log(`    - ${p.title} (${p.handle}) — ${p.variants.length} variants`);
  }
}

async function cmdDiff(catalogPath) {
  const catalog = await loadCatalog(catalogPath);
  const shopify = makeClient(catalog.store, catalogPath);
  console.log(`Diffing ${catalog.products.length} products...\n`);
  for (const p of catalog.products) {
    const existing = await shopify.findProductByHandle(p.handle);
    if (existing) {
      console.log(`  UPDATE  ${p.handle}  (existing: ${existing.variants.edges.length} variants → catalog: ${p.variants.length})`);
    } else {
      console.log(`  CREATE  ${p.handle}  (${p.variants.length} variants)`);
    }
  }
}

async function cmdSync(catalogPath, cliFlags) {
  const catalog = await loadCatalog(catalogPath);
  const shopify = makeClient(catalog.store, catalogPath);
  if (cliFlags.dryRun) console.log('🟡 DRY RUN — no changes will be made\n');
  console.log(`📦 ${catalog.products.length} products → ${catalog.store}`);

  // Print active flags
  const activeFlags = Object.entries(cliFlags)
    .filter(([k, v]) => v && k !== 'dryRun')
    .map(([k]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
  if (activeFlags.length) console.log(`🚩 Flags: ${activeFlags.join(' ')}`);

  const stats = await syncCatalog({
    shopify, catalog, log: console.log,
    dryRun: cliFlags.dryRun,
    cliFlags,
  });

  console.log('\n────────────────────');
  console.log(`✅ Done in ${(stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`   Created:        ${stats.productsCreated}`);
  console.log(`   Updated:        ${stats.productsUpdated}`);
  console.log(`   Skipped:        ${stats.productsSkipped}`);
  console.log(`   Images uploaded: ${stats.imagesUploaded}`);
  if (stats.imagesSkipped) console.log(`   Images skipped:  ${stats.imagesSkipped} (already on product)`);
  console.log(`   Variant images:  ${stats.variantsMapped}`);
  console.log(`   Inventory updates: ${stats.inventoryUpdates}`);
  if (stats.errors.length) {
    console.log(`   Errors:          ${stats.errors.length}`);
  }

  // Save log next to catalog
  const logPath = path.join(path.dirname(path.resolve(catalogPath)), 'sync-log.json');
  await fs.writeFile(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    catalog: catalogPath,
    flags: cliFlags,
    ...stats,
  }, null, 2));
  console.log(`📝 Log: ${logPath}`);
}

function makeClient(storeDomain, catalogPath) {
  // Look for .env next to the catalog first, fall back to global
  const localEnvPath = path.join(path.dirname(path.resolve(catalogPath)), '.env');
  let env = {};
  try {
    env = dotenv.parse(require('fs').readFileSync(localEnvPath));
  } catch { /* fall through */ }

  const token = env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN;
  const apiVersion = env.SHOPIFY_API_VERSION || process.env.SHOPIFY_API_VERSION || '2024-10';

  if (!token) {
    console.error(`Missing SHOPIFY_ADMIN_TOKEN. Set in .env (root) or ${localEnvPath}`);
    process.exit(1);
  }

  return new Shopify({ storeDomain, adminToken: token, apiVersion });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

main().catch(err => {
  console.error(`\n❌ ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
