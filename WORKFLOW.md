# Workflow Guide

## The Big Picture

```
┌─────────────────┐         pull          ┌─────────────────┐
│                 │ ◄─────────────────────┤                 │
│  catalog.yaml   │                       │     Shopify     │
│   + images/     │ ─────────────────────►│      Store      │
│                 │         sync          │                 │
└─────────────────┘                       └─────────────────┘
        │                                          │
        │                                          │
        ▼                                          ▼
   Git History                              Admin Edits
   (Your truth)                            (Their truth)
                                                   │
                                                   │
                                        Conflict Detection
                                        (warns on push)
```

## Common Workflows

### 🆕 Initial Setup: Bring Existing Store Under Version Control

```bash
# 1. Pull entire store
shopify-catalog-yaml-sync pull

# 2. Review what was downloaded
cat catalog.yaml
ls -R images/

# 3. Commit to Git
git init
git add .
git commit -m "Initial catalog snapshot from Shopify"

# 4. Now you can make changes and push back
# Edit catalog.yaml...
shopify-catalog-yaml-sync sync
```

**What happens during pull:**
- Downloads all products as YAML
- Downloads all product images to `images/{product-handle}/`
- Creates `.shopify-sync/state.json` for tracking
- Safe to run multiple times (overwrites catalog.yaml)

---

### 📝 Daily Development: Making Changes

```bash
# 1. Edit catalog.yaml (change prices, update descriptions, add products)
vim catalog.yaml

# 2. Preview changes
shopify-catalog-yaml-sync sync --dry-run

# 3. Push to Shopify
shopify-catalog-yaml-sync sync

# 4. Commit your changes
git add catalog.yaml
git commit -m "Update Q1 pricing"
```

**State tracking kicks in:**
- Tool remembers what you last pushed
- If someone edited in Shopify admin, you get a conflict warning
- No surprises!

---

### 🌳 Branching for Store Variants

```bash
# Main store (US)
git checkout main
shopify-catalog-yaml-sync pull

# Create variant for Canada
git checkout -b store-canada
# Edit catalog.yaml:
#   - Change prices to CAD
#   - Update store: to canada.myshopify.com
#   - Adjust inventory for Canadian warehouse
shopify-catalog-yaml-sync sync

# Create variant for EU
git checkout -b store-eu
# Edit for EU market...
shopify-catalog-yaml-sync sync

# Switch back to main
git checkout main
```

**Each branch = different store state**
- Use Git to manage multiple store variants
- Cherry-pick changes between stores
- Review differences with `git diff`

---

### ⚠️ Handling Conflicts (Someone Edited in Admin)

**Scenario:** You're working on catalog.yaml. Meanwhile, someone edits product descriptions in Shopify admin.

```bash
# You try to push your changes
shopify-catalog-yaml-sync sync

# Output:
# ── Classic T-Shirt (classic-tee) ──
#   ⚠ CONFLICT: Shopify updated since last push. Run 'pull' first or use --force to override.
```

**Option 1: Pull and merge manually**
```bash
# Pull their changes
shopify-catalog-yaml-sync pull

# Git shows you what changed
git diff

# Review conflicts, edit catalog.yaml to resolve
vim catalog.yaml

# Push merged version
shopify-catalog-yaml-sync sync
git commit -am "Merge admin edits with local changes"
```

**Option 2: Force push (overwrite their changes)**
```bash
# Your changes win, admin edits lost
shopify-catalog-yaml-sync sync --force
```

**Option 3: Keep working on your branch, sync later**
```bash
# Make a note to sync later
git commit -am "WIP: new products (conflicts, need to resolve)"
# Resolve when ready...
```

---

### 🔄 Periodic Sync from Admin Edits

If your team makes manual edits in Shopify admin, pull periodically to stay in sync:

```bash
# Every Monday morning:
shopify-catalog-yaml-sync pull
git diff                    # See what changed
git commit -am "Sync from Shopify admin edits"
```

---

### 🚀 Bulk Operations

**Add 10 new products without touching existing 50:**
```bash
# Add new products to catalog.yaml
# ...

shopify-catalog-yaml-sync sync --only-new
```

**Full catalog refresh (re-upload everything):**
```bash
shopify-catalog-yaml-sync sync --force-images --with-inventory
```

**Preview before doing anything destructive:**
```bash
shopify-catalog-yaml-sync sync --dry-run
```

---

## Understanding State Tracking

The `.shopify-sync/state.json` file tracks:

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

**This enables:**
- Conflict detection (warns if Shopify changed since your last push)
- History tracking (see when products were last synced)
- Smart pull (only updates YAML if Shopify is newer)

**Recommendation:** Add `.shopify-sync/` to `.gitignore` (already done). State is local to your machine.

---

## Selective Sync: What Gets Pushed

### Default Behavior

**On first push (product doesn't exist):**
- Everything gets pushed: title, price, images, inventory, all variants

**On updates (product exists):**
- ✅ Pushes: title, description, price, tags, vendor, type, SKU, weight, cost
- ❌ Skips: images (already uploaded), inventory (ops team owns it)

### Override Globally

```yaml
# In catalog.yaml
sync:
  manage: [price, tags]      # Only sync price and tags
```

Now on updates, only price and tags get pushed. Everything else is ignored.

**Or use blocklist:**
```yaml
sync:
  ignore: [description, inventory]   # Never touch these fields
```

### Override Per-Product

```yaml
products:
  - title: Limited Edition Item
    sync:
      manage: [price]        # Lock everything except price for this product
```

### Override Per-Run (CLI Flags)

```bash
# Force re-upload images this one time
shopify-catalog-yaml-sync sync --force-images

# Push inventory this run (normally skipped on updates)
shopify-catalog-yaml-sync sync --with-inventory

# Skip images entirely
shopify-catalog-yaml-sync sync --skip-images
```

---

## Image Management

### Pull (Shopify → Local)

Images are downloaded to `images/{product-handle}/`:

```
images/
  classic-tee/
    01.png
    02.png
    03.png
```

### Push (Local → Shopify)

Name your images with this convention for auto-mapping:

```
01-black-front.png       → Position 1, mapped to Black variants
02-black-back.png        → Position 2, mapped to Black variants
03-white-front.png       → Position 3, mapped to White variants
04-lifestyle.png         → Position 4, not mapped to variants
```

**Supported:**
- Colors: black, white, navy, gray, ivory, etc.
- Sides: front, back, side, detail
- Lifestyle: Any file with "lifestyle", "campaign", "model" in name

**Tool automatically:**
1. Uploads images in order (01, 02, 03...)
2. Maps color images to matching variants (e.g., black-front.png → all Black variants)
3. Skips re-upload on subsequent runs (unless `--force-images`)

---

## Quick Reference

### Commands

```bash
pull         # Shopify → Local YAML + images
sync         # Local YAML → Shopify
validate     # Check YAML syntax
diff         # Preview changes
history      # View sync history
```

### Flags

```bash
--dry-run          # Preview only
--force            # Override conflicts
--force-images     # Re-upload images
--skip-images      # Skip image upload
--with-inventory   # Push inventory
--only-new         # Only create, never update
--no-images        # (pull only) Skip downloading images
```

### Sync Tokens (for manage/ignore lists)

**Product fields:**
- `title`, `description`, `vendor`, `type`, `tags`, `seo`, `status`

**Variant fields:**
- `price`, `compare_at`, `cost`, `weight`, `sku`

**Operations:**
- `images` (upload product images)
- `variant_images` (map images to color variants)
- `inventory` (push quantities)
- `variants` (allow add/remove variants)

---

## Troubleshooting

**"CONFLICT: Shopify updated since last push"**
→ Someone edited in admin. Run `pull` first or use `--force`.

**"No catalog.yaml found" on first pull**
→ Set `SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com` in `.env`.

**Images uploading every run**
→ Product has no media yet. After first upload, they'll be skipped automatically.

**Variant not found**
→ Option names changed (e.g., "Color" vs "Colour"). Match exactly in YAML.

---

## Best Practices

✅ **Do:**
- Commit to Git after every pull/push
- Use `--dry-run` before major changes
- Pull regularly if team edits in admin
- Use branches for store variants
- Review `git diff` before pushing

❌ **Don't:**
- Edit the same products in both YAML and admin simultaneously (conflicts!)
- Force push without reviewing what you're overwriting
- Commit `.shopify-sync/` to Git (it's local state)
- Delete `.shopify-sync/` (you'll lose conflict detection)
