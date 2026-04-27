// Sync configuration resolver.
//
// Decides — for each product on each run — what fields and operations
// should be pushed to Shopify. Implements Pattern C: selective sync.
//
// The mental model:
//   - NEW products (don't exist in Shopify yet): push everything from YAML.
//     The product literally needs all the data to be created.
//   - EXISTING products: apply manage/ignore rules from YAML and CLI flags.
//
// Resolution precedence (most specific wins):
//   1. CLI flag overrides      (e.g., --only-new, --force-images)
//   2. Per-product sync config  (catalog.products[].sync)
//   3. Global sync config       (catalog.sync)
//   4. Safe defaults            (defined below)

// All the field/operation tokens you can use in manage/ignore lists.
export const SYNC_TOKENS = [
  // Product-level fields
  'title',
  'description',
  'vendor',
  'type',
  'tags',
  'seo',
  'status',
  'google_shopping',     // googleCategory + gender
  // Variant-level fields (applied to all variants)
  'price',
  'compare_at',
  'cost',
  'weight',
  'sku',
  // Operations (not fields, but actions)
  'images',              // upload images
  'variant_images',      // map color variants to images
  'inventory',           // push variant quantities
  'variants',            // add new variants from YAML
];

// What the tool manages by default ON UPDATES when no sync config is given.
// Notable exclusions: inventory (operations team owns it after launch),
// images (already uploaded, don't duplicate), variants (don't risk
// deleting/orphaning).
const DEFAULT_MANAGE_ON_UPDATE = new Set([
  'title',
  'description',
  'vendor',
  'type',
  'tags',
  'seo',
  'status',
  'google_shopping',
  'price',
  'compare_at',
  'cost',
  'weight',
  'sku',
  'variant_images',
]);

// What's pushed by default for NEW products (everything except destructive ops).
const DEFAULT_MANAGE_ON_CREATE = new Set([
  ...DEFAULT_MANAGE_ON_UPDATE,
  'images',
  'inventory',
  'variants',
]);

export class SyncPolicy {
  constructor({ globalConfig = {}, productConfig = {}, cliFlags = {} }) {
    this.global = globalConfig;
    this.product = productConfig;
    this.cli = cliFlags;
  }

  // Returns 'create' | 'update' | 'skip' for this product.
  modeFor(productExists) {
    if (!productExists) return 'create';
    if (this.cli.onlyNew) return 'skip';
    return 'update';
  }

  // Should we sync this token (field or operation)?
  shouldSync(token, mode) {
    // CLI overrides first
    if (token === 'images' && this.cli.forceImages) return true;
    if (token === 'inventory' && this.cli.withInventory) return true;
    if (token === 'images' && this.cli.skipImages) return false;
    if (token === 'inventory' && this.cli.skipInventory) return false;

    // Resolve manage/ignore (per-product wins, then global)
    const manage = this._resolveList('manage');
    const ignore = this._resolveList('ignore');

    // Ignore always wins
    if (ignore && ignore.has(token)) return false;

    // Explicit manage list = strict allowlist
    if (manage) return manage.has(token);

    // Default behavior depends on mode
    const defaults = mode === 'create'
      ? DEFAULT_MANAGE_ON_CREATE
      : DEFAULT_MANAGE_ON_UPDATE;
    return defaults.has(token);
  }

  // Internal: combine global and per-product lists into a single Set,
  // or return null if no list is configured.
  _resolveList(key) {
    const productList = this.product[key];
    const globalList = this.global[key];

    if (productList === undefined && globalList === undefined) return null;

    // Per-product fully replaces global if specified
    const list = productList !== undefined ? productList : globalList;
    if (!Array.isArray(list)) return null;

    // Validate tokens
    for (const t of list) {
      if (!SYNC_TOKENS.includes(t)) {
        console.warn(`⚠ Unknown sync token: "${t}". Valid: ${SYNC_TOKENS.join(', ')}`);
      }
    }
    return new Set(list);
  }

  // Helper: return array of skipped tokens for logging.
  describeSkips(mode) {
    return SYNC_TOKENS.filter(t => !this.shouldSync(t, mode));
  }
}
