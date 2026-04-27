# shopify-catalog-yaml-sync

**Stop clicking through Shopify's admin. Use Git to manage your product catalog.**

Bidirectional sync between YAML files and Shopify. Edit products in your favorite editor, commit to Git, and push to Shopify with a single command.

```bash
# Pull your store into version control
shopify-catalog-yaml-sync pull

# Make changes to catalog.yaml, then push to Shopify
shopify-catalog-yaml-sync sync
```

---

## Why Use This?

### ✅ Version Control Your Products
- Track every price change, description edit, and product addition in Git
- Rollback mistakes with `git revert`
- Review changes before pushing with `git diff`

### ✅ Multiple Store Variants
- Use Git branches for different stores (US, Canada, EU)
- Cherry-pick changes between stores
- Test changes on staging, then merge to production

### ✅ No More Repetitive Clicking
- Bulk update 100 products in seconds
- Edit in your favorite code editor
- Automate with CI/CD

### ✅ Conflict-Free Collaboration
- Tool detects when Shopify changed since your last pull
- Never accidentally overwrite teammate's admin edits
- Merge conflicts in Git, not in your head

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Commands](#commands)
- [YAML Format](#yaml-format)
- [Workflows](#workflows)
- [Advanced Features](#advanced-features)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Requirements
- Node.js 18+
- Shopify Admin API access token

### Install

```bash
# Clone the repository
git clone https://github.com/OllieDough/shopify-catalog-yaml-sync.git
cd shopify-catalog-yaml-sync

# Install dependencies
npm install

# Link the CLI globally (optional)
npm link
```

Now you can use `shopify-catalog-yaml-sync` from anywhere.

### Get Your Shopify API Token

1. Go to **Shopify Admin → Settings → Apps and sales channels**
2. Click **Develop apps** → **Create an app**
3. Name it whatever you want (e.g., "Catalog Sync")
4. **Configuration → Admin API integration → Configure**
5. Add these scopes:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`
   - `read_locations`
   - `write_files`
6. **Save → Install app**
7. Copy the **Admin API access token** (starts with `shpat_`)

---

## Quick Start

### Option 1: Pull Existing Store (Recommended)

Start by downloading your existing Shopify store:

```bash
# Create a new directory for your store
mkdir my-store
cd my-store

# Create .env file with your credentials
echo "SHOPIFY_ADMIN_TOKEN=shpat_your_token_here" > .env
echo "SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com" >> .env

# Pull your entire store
shopify-catalog-yaml-sync pull

# You now have:
# - catalog.yaml (all products)
# - images/ (all product images)
# - .shopify-sync/state.json (sync state)

# Initialize Git
git init
git add .
git commit -m "Initial catalog from Shopify"

# Make changes to catalog.yaml, then:
shopify-catalog-yaml-sync sync
```

### Option 2: Start from Scratch

```bash
# Copy the starter example
cp -r examples/starter-store my-store
cd my-store

# Add your credentials
cp .env.example .env
# Edit .env and add your token

# Edit catalog.yaml with your products

# Push to Shopify
shopify-catalog-yaml-sync sync
```

---

## Project Structure

Here's what a typical store folder looks like:

```
my-store/
├── .env                        # Shopify credentials (NEVER commit this!)
├── catalog.yaml                # Your products (commit this!)
├── images/                     # Product images (commit this!)
│   ├── product-handle-1/
│   │   ├── 01-black-front.png
│   │   ├── 02-black-back.png
│   │   └── 03-white-front.png
│   └── product-handle-2/
│       └── 01-front.png
├── .shopify-sync/              # Auto-generated state (DON'T commit)
│   └── state.json
└── sync-log.json               # Last sync results (optional to commit)
```

### What Goes in Git?

✅ **Commit:**
- `catalog.yaml` - Your source of truth
- `images/` - Product images
- `.env.example` - Template for credentials

❌ **Don't Commit:**
- `.env` - Contains secrets
- `.shopify-sync/` - Local state
- `sync-log.json` - Optional logs

---

## Commands

### `pull` - Download from Shopify

Pull your entire Shopify store into local YAML + images:

```bash
# Pull everything
shopify-catalog-yaml-sync pull

# Pull without downloading images (faster, metadata only)
shopify-catalog-yaml-sync pull --no-images

# Pull to a specific file
shopify-catalog-yaml-sync pull examples/my-store/catalog.yaml
```

**What it does:**
- Fetches all products from Shopify
- Converts to YAML format
- Downloads all product images
- Updates `.shopify-sync/state.json`

### `sync` - Push to Shopify

Push local changes to Shopify:

```bash
# Push changes
shopify-catalog-yaml-sync sync

# Preview without pushing (dry run)
shopify-catalog-yaml-sync sync --dry-run

# Force push (override conflicts)
shopify-catalog-yaml-sync sync --force

# Only create new products, don't update existing
shopify-catalog-yaml-sync sync --only-new

# Re-upload images even if product has media
shopify-catalog-yaml-sync sync --force-images

# Include inventory quantities in sync
shopify-catalog-yaml-sync sync --with-inventory
```

**What it does:**
- Compares YAML with Shopify
- Updates changed products
- Creates new products
- Uploads images (if needed)
- Detects conflicts (warns if Shopify changed since last pull)

### `validate` - Check YAML

Validate your YAML syntax before pushing:

```bash
shopify-catalog-yaml-sync validate

# Output:
# ✓ Catalog valid
#   Store: yourstore.myshopify.com
#   Products: 3
#     - Classic T-Shirt (classic-tee) — 12 variants
#     - Wool Beanie (wool-beanie) — 3 variants
```

### `diff` - Preview Changes

See what would change without pushing:

```bash
shopify-catalog-yaml-sync diff

# Output:
# Diffing 3 products...
#   UPDATE  classic-tee  (existing: 12 variants → catalog: 12)
#   CREATE  new-product  (6 variants)
```

### `history` - View Sync History

See when products were last pushed/pulled:

```bash
shopify-catalog-yaml-sync history

# Output:
# Handle                    Last Pushed              Last Pulled
# ────────────────────────────────────────────────────────────────
# classic-tee              1/15/2024, 10:30 AM      1/15/2024, 10:25 AM
# wool-beanie              1/14/2024, 3:15 PM       1/15/2024, 10:25 AM
```

---

## YAML Format

### Basic Product

```yaml
store: yourstore.myshopify.com

products:
  - title: Classic T-Shirt
    price: 32
    colors: [Black, White, Navy]
    sizes: [S, M, L, XL]
    images: ./images/classic-tee/
    type: Apparel
    tags: [basics, essentials]
    description: Premium cotton t-shirt.
```

This creates a product with:
- 3 colors × 4 sizes = **12 variants**
- Images auto-mapped to color variants
- All variants at $32

### Complete Reference

```yaml
store: yourstore.myshopify.com

# Global defaults (optional)
defaults:
  vendor: My Brand
  inventory_qty: 25
  weight_grams: 500

# Global sync rules (optional)
sync:
  manage: [title, price, tags]     # Only sync these fields
  # OR
  ignore: [description, inventory] # Never sync these fields

products:
  - title: My Product               # REQUIRED
    handle: my-product              # Auto-generated from title if omitted

    # Pricing
    price: 128                      # REQUIRED
    compare_at: 148                 # "Compare at" price (strikethrough)
    cost: 38                        # Your cost (for profit tracking)

    # Variants (generates all combinations)
    colors: [Black, White]          # Creates "Color" option
    sizes: [S, M, L]                # Creates "Size" option
    # OR custom options:
    options:
      - name: Material
        values: [Cotton, Wool]

    # Images
    images: ./images/my-product/    # Path to image folder

    # Metadata
    type: Apparel
    vendor: My Brand
    tags: [tag1, tag2]
    status: active                  # active | draft | archived

    # Physical
    weight_grams: 500
    inventory_qty: 25               # Initial quantity (only set on create)

    # SEO
    seo_title: My Product | My Brand
    seo_description: SEO description here

    # Google Shopping (optional)
    google_category: "Apparel & Accessories > Clothing"
    gender: unisex

    # Description (supports basic markdown)
    description: |
      Product description here.

      - Feature 1
      - Feature 2

    # Per-product sync override (optional)
    sync:
      manage: [price]               # Only sync price for this product
```

### Image Naming Convention

Name your images with this pattern for auto-mapping:

```
01-black-front.png     → Position 1, mapped to Black variants, front view
02-black-back.png      → Position 2, mapped to Black variants, back view
03-white-front.png     → Position 3, mapped to White variants, front view
04-lifestyle.png       → Position 4, not mapped to variants
```

**Recognized patterns:**
- **Colors:** black, white, navy, gray, ivory, charcoal, sand, olive, rust, red, blue, green, brown, pink, yellow
- **Sides:** front, back, side, detail
- **Lifestyle:** Images with "lifestyle", "campaign", "model" in filename won't be mapped to variants

---

## Workflows

### 📥 Workflow 1: Capture Existing Store

```bash
# 1. Pull your store
shopify-catalog-yaml-sync pull

# 2. Review what was downloaded
cat catalog.yaml

# 3. Commit to Git
git init
git add .
git commit -m "Initial catalog snapshot"

# 4. Now you can make changes and push
# Edit catalog.yaml...
shopify-catalog-yaml-sync sync
git commit -am "Updated pricing"
```

### 🌳 Workflow 2: Multiple Store Variants

Use Git branches to manage different store versions:

```bash
# Main US store
git checkout main
shopify-catalog-yaml-sync pull

# Create Canadian variant
git checkout -b store-canada
# Edit catalog.yaml:
#   - Change store: to canada.myshopify.com
#   - Update prices to CAD
#   - Adjust inventory
shopify-catalog-yaml-sync sync

# Create EU variant
git checkout -b store-eu
# Edit for EU market...
shopify-catalog-yaml-sync sync

# Switch back to main
git checkout main
```

### ⚠️ Workflow 3: Handle Conflicts

**Scenario:** Someone edited a product in Shopify admin while you were working.

```bash
# You try to push
shopify-catalog-yaml-sync sync

# Output:
# ⚠ CONFLICT: Shopify updated since last push

# Option 1: Pull their changes, merge manually
shopify-catalog-yaml-sync pull
git diff                    # See what changed
# Edit catalog.yaml to resolve conflicts
shopify-catalog-yaml-sync sync
git commit -am "Merge admin edits"

# Option 2: Force push (your changes win)
shopify-catalog-yaml-sync sync --force
```

### 🔄 Workflow 4: Periodic Sync

If your team makes manual edits in Shopify admin:

```bash
# Every Monday:
shopify-catalog-yaml-sync pull
git diff                    # Review what changed
git commit -am "Sync from admin edits"
```

### 🚀 Workflow 5: Bulk Updates

```bash
# Add 10 new products without touching existing 50
shopify-catalog-yaml-sync sync --only-new

# Update all prices (preview first)
shopify-catalog-yaml-sync sync --dry-run
shopify-catalog-yaml-sync sync

# Full catalog refresh
shopify-catalog-yaml-sync sync --force-images --with-inventory
```

---

## Advanced Features

### Selective Sync

Control which fields get synced on updates:

#### Default Behavior

**On first push (product doesn't exist):**
- Everything is pushed

**On updates (product exists):**
- ✅ Synced: title, description, price, tags, vendor, type, SKU, weight, cost
- ❌ Skipped: images (already uploaded), inventory (ops team owns it)

#### Global Override

```yaml
# In catalog.yaml
sync:
  manage: [price, tags]      # Only sync price and tags on updates
```

Now only price and tags get updated. Everything else is preserved.

**Or use blocklist:**
```yaml
sync:
  ignore: [description]      # Never touch description
```

#### Per-Product Override

```yaml
products:
  - title: Limited Edition
    sync:
      manage: [price]        # Only sync price for this product
```

#### Per-Run Override

```bash
# Force images this one time
shopify-catalog-yaml-sync sync --force-images

# Push inventory this run
shopify-catalog-yaml-sync sync --with-inventory
```

### Sync Tokens Reference

Use these in `manage` and `ignore` lists:

**Product fields:**
- `title`, `description`, `vendor`, `type`, `tags`, `seo`, `status`, `google_shopping`

**Variant fields:**
- `price`, `compare_at`, `cost`, `weight`, `sku`

**Operations:**
- `images` - Upload product images
- `variant_images` - Map images to color variants
- `inventory` - Push inventory quantities
- `variants` - Allow adding/removing variants

### State Tracking

The tool maintains `.shopify-sync/state.json`:

```json
{
  "products": {
    "classic-tee": {
      "lastPushed": "2024-01-15T10:30:00Z",
      "lastPulled": "2024-01-15T10:25:00Z",
      "shopifyUpdatedAt": "2024-01-15T10:30:00Z",
      "shopifyId": "gid://shopify/Product/123",
      "hash": "abc123..."
    }
  }
}
```

This enables:
- **Conflict detection** - Warns if Shopify changed since your last push
- **Smart pull** - Only updates YAML if Shopify is newer
- **History tracking** - See when products were last synced

**Note:** `.shopify-sync/` is already in `.gitignore`. State is local to your machine.

---

## Troubleshooting

### "CONFLICT: Shopify updated since last push"

Someone edited the product in Shopify admin.

**Solution:**
```bash
# Pull their changes first
shopify-catalog-yaml-sync pull
git diff                    # See what changed
# Edit to resolve conflicts, then push
shopify-catalog-yaml-sync sync

# OR force push (overwrites admin edits)
shopify-catalog-yaml-sync sync --force
```

### "No catalog.yaml found" on first pull

You need to set the store domain.

**Solution:**
```bash
# Add to .env
echo "SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com" >> .env

# Then pull
shopify-catalog-yaml-sync pull
```

### Images upload every run

Product has no media yet, or you're using `--force-images`.

**Solution:**
- After first upload, images are skipped automatically
- Check `sync-log.json` to see what happened

### "Variant not found by option values"

Option names changed in YAML vs Shopify (e.g., "Color" vs "Colour").

**Solution:**
- Match option names exactly in YAML
- Check existing product in Shopify admin

### Changes not appearing in Shopify

You may have `sync` rules blocking the field.

**Solution:**
```bash
# Check what's being synced
shopify-catalog-yaml-sync sync --dry-run

# Remove sync rules temporarily
# Or use --force to override
```

---

## Examples

Check the `examples/` folder:

- **`starter-store/`** - Minimal setup for new stores
- **`full-example/`** - Comprehensive example showing all features

---

## CLI Reference

```
shopify-catalog-yaml-sync <command> [catalog.yaml] [flags]

Commands:
  pull         Download from Shopify → YAML + images
  sync         Push YAML → Shopify
  validate     Check YAML syntax
  diff         Preview changes
  history      View sync history

Pull Flags:
  --no-images          Skip downloading images

Sync Flags:
  --dry-run            Preview without making changes
  --force              Override conflicts
  --only-new           Only create, never update
  --force-images       Re-upload images
  --skip-images        Skip image upload
  --with-inventory     Push inventory quantities
  --skip-inventory     Skip inventory

Environment Variables:
  SHOPIFY_ADMIN_TOKEN     Your Shopify admin API token (required)
  SHOPIFY_API_VERSION     API version (default: 2024-10)
  SHOPIFY_STORE_DOMAIN    Store domain (for first pull only)
```

---

## Further Reading

- **[WORKFLOW.md](./WORKFLOW.md)** - Detailed workflow guide with visual diagrams
- **[examples/full-example/catalog.yaml](./examples/full-example/catalog.yaml)** - Fully documented example

---

## License

MIT

---

## Contributing

Issues and PRs welcome! This tool is designed for agency teams managing multiple Shopify stores.

---

## Support

- 🐛 **Bug reports:** [GitHub Issues](https://github.com/OllieDough/shopify-catalog-yaml-sync/issues)
- 📖 **Documentation:** This README + [WORKFLOW.md](./WORKFLOW.md)
- 💡 **Feature requests:** [GitHub Issues](https://github.com/OllieDough/shopify-catalog-yaml-sync/issues)
