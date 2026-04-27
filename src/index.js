#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { loadCatalog } from './catalog.js';
import { Shopify } from './shopify.js';
import { syncCatalog } from './sync.js';
import { pullCatalog } from './pull.js';
import { StateManager } from './state.js';

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
    force: flags.has('--force'),
    noImages: flags.has('--no-images'),
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
    case 'pull':     return cmdPull(cat, cliFlags);
    case 'history':  return cmdHistory(cat);
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
shopify-catalog-yaml-sync — Bidirectional sync between YAML catalogs and Shopify.

Usage:
  shopify-catalog-yaml-sync pull [catalog.yaml] [flags]       # Download from Shopify → YAML
  shopify-catalog-yaml-sync sync [catalog.yaml] [flags]       # Push YAML → Shopify
  shopify-catalog-yaml-sync validate [catalog.yaml]           # Validate YAML structure
  shopify-catalog-yaml-sync diff [catalog.yaml]               # Preview changes
  shopify-catalog-yaml-sync history [catalog.yaml]            # View sync history

Pull flags:
  --no-images          Skip downloading product images

Sync flags (selective sync):
  --dry-run            Preview without making API calls
  --only-new           Only create new products; never update existing ones
  --force              Push even if Shopify has conflicting changes
  --force-images       Re-upload images even if product already has media
  --skip-images        Skip image upload entirely this run
  --with-inventory     Push inventory quantities (skipped by default on updates)
  --skip-inventory     Force-skip inventory even if YAML opts in

Auth: set SHOPIFY_ADMIN_TOKEN in .env (root) or in the same dir as the catalog.

Examples:
  # Initial setup: pull existing store into version control
  shopify-catalog-yaml-sync pull

  # Make changes to YAML, then push
  shopify-catalog-yaml-sync sync

  # Preview before pushing
  shopify-catalog-yaml-sync sync --dry-run

  # If someone edited products in Shopify admin, pull those changes
  shopify-catalog-yaml-sync pull

  # Force push despite conflicts
  shopify-catalog-yaml-sync sync --force
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
  const catalogDir = path.dirname(path.resolve(catalogPath));
  const stateManager = new StateManager(catalogDir);
  await stateManager.load();

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
    stateManager,
  });

  console.log('\n────────────────────');
  console.log(`✅ Done in ${(stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`   Created:        ${stats.productsCreated}`);
  console.log(`   Updated:        ${stats.productsUpdated}`);
  console.log(`   Skipped:        ${stats.productsSkipped}`);
  if (stats.conflicts) console.log(`   Conflicts:      ${stats.conflicts} (use --force to override or pull first)`);
  console.log(`   Images uploaded: ${stats.imagesUploaded}`);
  if (stats.imagesSkipped) console.log(`   Images skipped:  ${stats.imagesSkipped} (already on product)`);
  console.log(`   Variant images:  ${stats.variantsMapped}`);
  console.log(`   Inventory updates: ${stats.inventoryUpdates}`);
  if (stats.errors.length) {
    console.log(`   Errors:          ${stats.errors.length}`);
  }

  // Save log next to catalog
  const logPath = path.join(catalogDir, 'sync-log.json');
  await fs.writeFile(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    catalog: catalogPath,
    flags: cliFlags,
    ...stats,
  }, null, 2));
  console.log(`📝 Log: ${logPath}`);
}

async function cmdPull(catalogPath, cliFlags) {
  // For pull, we need the store domain but don't need a full catalog yet
  // So we'll either:
  // 1. Load existing catalog to get store domain
  // 2. Or require SHOPIFY_STORE_DOMAIN env var for first-time pulls

  let storeDomain, catalogDir;

  try {
    const catalog = await loadCatalog(catalogPath);
    storeDomain = catalog.store;
    catalogDir = path.dirname(path.resolve(catalogPath));
  } catch {
    // Catalog doesn't exist yet — first pull
    storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    if (!storeDomain) {
      console.error('No catalog.yaml found. Set SHOPIFY_STORE_DOMAIN env var for first pull.');
      process.exit(1);
    }
    catalogDir = path.dirname(path.resolve(catalogPath));
  }

  const shopify = makeClient(storeDomain, catalogPath);
  const stateManager = new StateManager(catalogDir);
  await stateManager.load();

  console.log(`📥 Pulling products from ${storeDomain}...`);

  const stats = await pullCatalog({
    shopify,
    outputPath: path.resolve(catalogPath),
    log: console.log,
    downloadImages: !cliFlags.noImages,
    stateManager,
  });

  console.log('\n────────────────────');
  console.log(`✅ Done in ${(stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`   Products:       ${stats.productsDownloaded}`);
  console.log(`   Images:         ${stats.imagesDownloaded}`);
  if (stats.errors.length) {
    console.log(`   Errors:         ${stats.errors.length}`);
  }
}

async function cmdHistory(catalogPath) {
  const catalogDir = path.dirname(path.resolve(catalogPath));
  const stateManager = new StateManager(catalogDir);
  await stateManager.load();

  const history = stateManager.getHistory();

  if (!history.length) {
    console.log('No sync history yet. Run `sync` or `pull` first.');
    return;
  }

  console.log(`\n📊 Sync history (${history.length} products)\n`);
  console.log('Handle'.padEnd(30) + 'Last Pushed'.padEnd(25) + 'Last Pulled');
  console.log('─'.repeat(80));

  for (const entry of history) {
    const pushed = entry.lastPushed ? new Date(entry.lastPushed).toLocaleString() : 'never';
    const pulled = entry.lastPulled ? new Date(entry.lastPulled).toLocaleString() : 'never';
    console.log(entry.handle.padEnd(30) + pushed.padEnd(25) + pulled);
  }
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
