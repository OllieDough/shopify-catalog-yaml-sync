# shopify-catalog-yaml-sync

**Bidirectional sync between YAML catalogs and Shopify.** Manage your product catalog in Git with full version control, branch for different stores, and sync changes both ways.

Stop clicking through Shopify's admin. Use Git as your source of truth for product catalogs.

```bash
# Pull existing store into version control
shopify-catalog-yaml-sync pull

# Make changes in YAML, commit to Git
git add catalog.yaml
git commit -m "Update prices for Q1"

# Push changes to Shopify
shopify-catalog-yaml-sync sync

# Create a branch for a different store variant
git checkout -b store-variant-b
# Edit catalog, push to different store...
```

## Key Features

### 🔄 Bidirectional Sync
- **Pull**: Download your entire Shopify store into YAML + images
- **Push**: Sync YAML changes back to Shopify
- **Conflict Detection**: Warns if Shopify changed since your last pull

### 🎯 Smart Sync Control
- Only update what changed (selective field sync)
- Skip images if already uploaded (avoid duplicates)
- Preserve manual admin edits (inventory, descriptions, etc.)
- Per-product or global sync rules

### 📦 Git-Based Workflow
- Version control your product catalog
- Branch for different store variants
- Review changes with `git diff` before pushing
- Rollback mistakes with `git revert`

### ⚡ Performance
- Parallel image downloads/uploads
- Efficient pagination for large catalogs
- Smart rate limiting

## Quick Example

```yaml
# catalog.yaml
store: yourstore.myshopify.com

products:
  - title: The Signet Hoodie
    price: 128
    images: ./images/hoodie/
    colors: [Black, Ivory]
    sizes: [XS, S, M, L, XL, XXL]
    description: |
      Heavyweight 14oz brushed cotton fleece...
```

```bash
# Push to Shopify
shopify-catalog-yaml-sync sync
```

## What's new in v0.3 — Bidirectional Sync

The major upgrade. This is now a **full bidirectional sync tool** with:

1. **Pull command** — Download your entire Shopify store to YAML + images
2. **State tracking** — Tracks what was last pushed/pulled for conflict detection
3. **Conflict detection** — Warns if Shopify changed since your last push
4. **Sync history** — See when products were last synced

Plus all the selective sync features from before:

### Layer 1 — Safe defaults

Run `npm run sync` on an existing store and the tool **will**:
- Update title, description, vendor, type, tags, SEO, prices, costs, weights
- Add new variants from the YAML
- Map color variants to their photos (if new images uploaded)

It **will NOT** (by default):
- Re-upload images if the product already has media (avoids duplicates on re-runs)
- Push inventory quantities (operations team owns these post-launch)
- Delete variants that exist in Shopify but not in YAML

### Layer 2 — YAML config (per-store or per-product)

Lock down or open up specific fields:

```yaml
# Global — applies to all products
sync:
  manage: [title, price, tags]      # only these get synced (allowlist)
  # OR
  ignore: [description, inventory]  # everything except these (blocklist)

products:
  - title: The Signet Hoodie
    sync:                            # per-product override
      manage: [price]                # for this product, only sync price
```

### Layer 3 — CLI flags (per-run)

Override config at runtime:

| Flag | Effect |
|---|---|
| `--dry-run` | Preview what would change, no API calls |
| `--only-new` | Only create new products, never touch existing ones |
| `--force-images` | Re-upload images even if product has media |
| `--skip-images` | Skip image upload entirely |
| `--with-inventory` | Push inventory quantities |
| `--skip-inventory` | Force-skip inventory even if YAML opts in |

Examples:

```bash
# Add 3 new products to YAML, push only the new ones (existing untouched)
npm run sync -- --only-new

# Full re-sync after a major catalog overhaul
npm run sync -- --force-images --with-inventory

# Safe preview before any real run
npm run sync -- --dry-run
```

### Sync tokens reference

These are the strings you can use in `manage:` and `ignore:` lists.

**Product fields:** `title`, `description`, `vendor`, `type`, `tags`, `seo`, `status`, `google_shopping`

**Variant fields:** `price`, `compare_at`, `cost`, `weight`, `sku`

**Operations:** `images`, `variant_images`, `inventory`, `variants` (variants=allow add/remove of variant set)

## Setup

```bash
git clone <this-repo>
cd shopify-sync
npm install
cp .env.example .env
# Add your Shopify admin token to .env
```

### Shopify Admin API token

1. Shopify admin → **Settings → Apps and sales channels → Develop apps**
2. **Create an app** → name it whatever
3. **Configuration → Admin API integration → Configure**
4. Add scopes: `read_products`, `write_products`, `write_inventory`, `read_inventory`, `read_locations`, `write_files`
5. **Save → Install app**
6. Copy the **Admin API access token** (starts with `shpat_`) into `.env`

## Folder layout per store

```
examples/your-store/
├── catalog.yaml              # everything about your products
├── .env                      # store-specific token
└── images/
    ├── product-handle-1/
    │   ├── 01-black-front.png
    │   ├── 02-black-back.png
    │   └── 03-ivory-front.png
    └── product-handle-2/
        └── 01-front.png
```

The folder name under `images/` becomes the product handle (URL slug).

## Image filename convention

```
01-black-front.png    →  Position 1, Black variant, front shot, mapped to Black variants
02-black-back.png     →  Position 2, Black variant, back shot
03-black-lifestyle    →  Position 3, lifestyle (won't be used as a variant photo)
04-ivory-front.png    →  Position 4, mapped to Ivory variants
```

## YAML reference

```yaml
store: yourstore.myshopify.com

defaults:
  vendor: My Brand
  inventory_qty: 25

# Optional: global sync rules
sync:
  manage: [...]    # allowlist of fields to sync on UPDATES
  ignore: [...]    # blocklist of fields to NEVER sync

products:
  - title: My Product              # required
    handle: my-product              # auto from title if omitted
    type: Hoodie
    vendor: My Brand
    
    price: 128                      # required for new variants
    compare_at: 148
    cost: 38
    weight_grams: 780
    inventory_qty: 25
    
    colors: [Black, Ivory]          # generates Color option + variants
    sizes: [XS, S, M, L]            # generates Size option + variants
    
    options:                        # custom options
      - name: Material
        values: [Cotton, Linen]
    
    images: ./images/my-product/
    
    tags: [hoodie, fleece]
    google_category: "Apparel & Accessories > Clothing > Activewear"
    gender: unisex
    
    seo_title: "My Product"
    seo_description: "..."
    
    status: active
    
    description: |
      Markdown-ish description.
    
    sync:                            # per-product override
      manage: [price, tags]
```

## Commands

### Pull (Shopify → Local)

```bash
# Pull entire store into YAML + download all images
shopify-catalog-yaml-sync pull

# Pull without downloading images (faster, metadata only)
shopify-catalog-yaml-sync pull --no-images

# Pull specific catalog file
shopify-catalog-yaml-sync pull examples/my-store/catalog.yaml
```

**First-time pull**: If `catalog.yaml` doesn't exist, set `SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com` in `.env`.

### Push (Local → Shopify)

```bash
# Push changes to Shopify
shopify-catalog-yaml-sync sync

# Preview changes without pushing (dry run)
shopify-catalog-yaml-sync sync --dry-run

# Force push despite conflicts
shopify-catalog-yaml-sync sync --force

# Push specific catalog
shopify-catalog-yaml-sync sync examples/my-store/catalog.yaml
```

### Other Commands

```bash
# Validate YAML structure (no API calls)
shopify-catalog-yaml-sync validate

# Show what would change against the live store (read-only)
shopify-catalog-yaml-sync diff

# View sync history
shopify-catalog-yaml-sync history
```

## How re-runs interact with manual admin edits

| Scenario | Tool behavior |
|---|---|
| Client edits inventory in admin, you re-sync | **Inventory preserved** (default skips it) |
| Client edits product description in admin, you re-sync | **Description overwritten** (default manages it) — set `ignore: [description]` to protect |
| Client uploads custom photo via admin, you re-sync | **Photo preserved** (default skips images if any exist) |
| You add a new variant size to YAML, re-sync | **New variant created**, existing untouched |
| You remove a variant size from YAML, re-sync | **Existing variant preserved** (default doesn't prune); add `manage: [variants]` to allow pruning |

## Recommended Workflows

### Initial Setup (Existing Store)

```bash
# 1. Pull entire store into version control
shopify-catalog-yaml-sync pull

# 2. Review what was downloaded
cat catalog.yaml
ls images/

# 3. Commit to Git
git add .
git commit -m "Initial catalog snapshot"

# 4. Make changes to YAML, push back
# Edit catalog.yaml...
shopify-catalog-yaml-sync sync
```

### Branching for Store Variants

```bash
# Main store
git checkout main
shopify-catalog-yaml-sync pull  # Get latest from main store

# Create variant for different market
git checkout -b store-canada
# Edit catalog.yaml (change prices to CAD, adjust inventory, etc.)
shopify-catalog-yaml-sync sync  # Push to canada.myshopify.com

# Switch back to main
git checkout main
```

### Handling Conflicts

If someone edits products in Shopify admin while you're working:

```bash
# Try to push
shopify-catalog-yaml-sync sync
# ⚠ CONFLICT: Shopify updated since last push

# Option 1: Pull their changes, merge manually
shopify-catalog-yaml-sync pull
git diff  # See what changed
# Merge conflicts, then push
shopify-catalog-yaml-sync sync

# Option 2: Force push (overwrite their changes)
shopify-catalog-yaml-sync sync --force
```

### During Development

- Run with defaults. Edit freely in YAML, re-sync often.
- Use `--dry-run` to preview changes before pushing.

### After Client Handoff

- Add `sync: { manage: [price, tags] }` to your global config so the tool only manages bulk-update-friendly fields. Client owns descriptions and inventory in admin.
- Run periodic pulls to capture their manual changes.

### Bulk Operations

**Adding new products to live store:**
```bash
shopify-catalog-yaml-sync sync --only-new
```
Existing 50 products untouched, new 10 created.

**Annual catalog refresh:**
```bash
shopify-catalog-yaml-sync sync --force-images --with-inventory
```
Full re-sync of everything.

## State Tracking & Conflict Detection

The tool maintains a `.shopify-sync/state.json` file (auto-created) that tracks:

- When each product was last pushed/pulled
- Shopify's `updatedAt` timestamp
- Hash of what you last pushed

This enables:

- **Conflict detection**: Warns if Shopify changed since your last push
- **Smart pull**: Only updates local YAML if Shopify is newer
- **Sync history**: See when products were last modified

**Recommendation**: Add `.shopify-sync/` to `.gitignore` (state is local to your machine).

## Troubleshooting

- **"CONFLICT: Shopify updated since last push"** → Someone edited the product in Shopify admin. Run `pull` first to get their changes, or use `--force` to override.
- **"Variant not found by option values"** → Option names changed in YAML vs live (e.g., "Color" vs "Colour"). Match exactly.
- **"Throttled"** → Shopify rate limit. Tool paces itself; very large catalogs may need longer sleeps in `sync.js`.
- **Images uploading every run** → Product has no media yet, or you passed `--force-images`. Check `existing.media.edges.length` in the log.
- **"No catalog.yaml found" on first pull** → Set `SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com` in `.env`.

## License

MIT.
