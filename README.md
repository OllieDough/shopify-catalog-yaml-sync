# shopify-sync (v0.3)

YAML in. Shopify products out. ~60 seconds for a full catalog. Re-runnable safely without trampling manual edits.

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
npm run sync
```

## What's new in v0.3 — Selective Sync

The big upgrade. The tool no longer blindly overwrites everything on every run. Three layers of control:

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

```bash
# Validate YAML structure (no API calls)
npm run validate -- examples/ember-tide/catalog.yaml

# Show what would change against the live store (read-only)
npm run diff -- examples/ember-tide/catalog.yaml

# Push (with selective sync defaults)
npm run sync -- examples/ember-tide/catalog.yaml

# Preview the push
npm run sync -- examples/ember-tide/catalog.yaml --dry-run
```

## How re-runs interact with manual admin edits

| Scenario | Tool behavior |
|---|---|
| Client edits inventory in admin, you re-sync | **Inventory preserved** (default skips it) |
| Client edits product description in admin, you re-sync | **Description overwritten** (default manages it) — set `ignore: [description]` to protect |
| Client uploads custom photo via admin, you re-sync | **Photo preserved** (default skips images if any exist) |
| You add a new variant size to YAML, re-sync | **New variant created**, existing untouched |
| You remove a variant size from YAML, re-sync | **Existing variant preserved** (default doesn't prune); add `manage: [variants]` to allow pruning |

## Recommended patterns

**During launch / development:**
- Run with defaults. Edit freely in YAML, re-sync often.

**After client handoff:**
- Add `sync: { manage: [price, tags] }` to your global config so the tool only manages bulk-update-friendly fields. Client owns descriptions and inventory in admin.

**Bulk-adding new products to live store:**
- Use `--only-new`. Existing 50 products untouched, new 10 created.

**Annual catalog refresh:**
- Use `--force-images --with-inventory` to do a full re-sync.

## Troubleshooting

- **"Variant not found by option values"** → option names changed in YAML vs live (e.g., "Color" vs "Colour"). Match exactly.
- **"Throttled"** → Shopify rate limit. Tool paces itself; very large catalogs may need longer sleeps in `sync.js`.
- **Images uploading every run** → product has no media yet, or you passed `--force-images`. Check `existing.media.edges.length` in the log.

## License

MIT.
