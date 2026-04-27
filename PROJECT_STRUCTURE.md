# Project Structure Guide

## Overview

This document explains how everything is organized in `shopify-catalog-yaml-sync`.

---

## Repository Layout

```
shopify-catalog-yaml-sync/
├── src/                          # Source code (don't edit unless contributing)
│   ├── index.js                  # CLI entry point
│   ├── catalog.js                # YAML parser
│   ├── shopify.js                # Shopify API client
│   ├── sync.js                   # Push logic (YAML → Shopify)
│   ├── pull.js                   # Pull logic (Shopify → YAML)
│   ├── state.js                  # State tracking for conflict detection
│   ├── sync-policy.js            # Selective sync rules
│   └── images.js                 # Image upload/download logic
│
├── examples/                     # Example stores (copy these to get started)
│   ├── starter-store/            # Minimal example
│   │   ├── .env.example          # Template for credentials
│   │   ├── catalog.yaml          # Simple 2-product catalog
│   │   ├── images/               # Image folders (empty in example)
│   │   └── README.md             # Quick start guide
│   │
│   └── full-example/             # Comprehensive example
│       └── catalog.yaml          # Shows all features with comments
│
├── package.json                  # npm package config
├── README.md                     # Main documentation (start here!)
├── WORKFLOW.md                   # Detailed workflow guide
├── PROJECT_STRUCTURE.md          # This file
├── .gitignore                    # What NOT to commit
└── LICENSE                       # MIT license

```

---

## Your Store Layout

When you use this tool, your store folder should look like this:

```
my-store/                         # Your store folder (name it whatever)
│
├── .env                          # 🔐 SECRETS (never commit!)
│   │                             # Contains:
│   │                             # - SHOPIFY_ADMIN_TOKEN=shpat_...
│   │                             # - SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
│   │
├── catalog.yaml                  # 📝 YOUR PRODUCTS (commit this!)
│   │                             # This is your source of truth
│   │                             # Edit this, then run `sync` to push
│   │
├── images/                       # 🖼️ PRODUCT IMAGES (commit this!)
│   ├── product-handle-1/
│   │   ├── 01-black-front.png
│   │   ├── 02-black-back.png
│   │   └── 03-white-front.png
│   │
│   ├── product-handle-2/
│   │   ├── 01-front.png
│   │   └── 02-back.png
│   │
│   └── product-handle-3/
│       └── 01-main.png
│
├── .shopify-sync/                # 🤖 AUTO-GENERATED (don't commit!)
│   └── state.json                # Tracks push/pull history for conflict detection
│                                 # Gets regenerated on every sync/pull
│
├── sync-log.json                 # 📊 LAST SYNC STATS (optional to commit)
│                                 # Shows what happened on last sync
│
├── .git/                         # 📦 GIT REPO (if using Git)
│
└── .gitignore                    # 🚫 WHAT NOT TO COMMIT
                                  # Should ignore: .env, .shopify-sync/
```

---

## File Details

### `catalog.yaml` - Your Product Source

This is your **source of truth** for products. Format:

```yaml
store: yourstore.myshopify.com

products:
  - title: Product Name
    price: 50
    colors: [Black, White]
    sizes: [S, M, L]
    images: ./images/product-handle/
    # ... more fields
```

**Rules:**
- ✅ Commit to Git
- ✅ Edit freely
- ✅ Push to Shopify with `sync` command

### `.env` - Your Secrets

Contains your Shopify credentials:

```bash
SHOPIFY_ADMIN_TOKEN=shpat_abc123xyz...
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_API_VERSION=2024-10
```

**Rules:**
- ❌ NEVER commit to Git
- ✅ Keep in `.gitignore`
- ✅ Copy `.env.example` to `.env` for new stores

### `images/` - Product Images

Each product gets its own folder:

```
images/
  ├── classic-tee/
  │   ├── 01-black-front.png
  │   ├── 02-black-back.png
  │   └── 03-white-front.png
  └── wool-beanie/
      └── 01-black.png
```

**Naming convention:**
```
{position}-{color}-{side}.{ext}

Examples:
01-black-front.png     → Position 1, Black variant, front view
02-white-back.png      → Position 2, White variant, back view
03-lifestyle.png       → Position 3, no variant mapping
```

**Rules:**
- ✅ Commit to Git
- ✅ Folder name = product handle
- ✅ Name images with color for auto-mapping

### `.shopify-sync/state.json` - Sync State

Auto-generated file that tracks:

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

**What it does:**
- Detects conflicts (warns if Shopify changed since your last push)
- Tracks sync history
- Enables smart pull (only updates if Shopify is newer)

**Rules:**
- ❌ Don't commit to Git
- ❌ Don't edit manually
- ✅ Let tool manage it

### `sync-log.json` - Last Sync Results

Shows what happened on last sync:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "productsCreated": 2,
  "productsUpdated": 5,
  "imagesUploaded": 12,
  "conflicts": 0,
  "errors": []
}
```

**Rules:**
- Optional to commit
- Useful for debugging
- Gets overwritten on every sync

---

## Git Workflow

### What to Commit

```bash
git init
git add catalog.yaml images/ .gitignore
git commit -m "Initial catalog"
```

### What NOT to Commit

Your `.gitignore` should include:

```gitignore
# Secrets
.env
**/.env

# Auto-generated state
**/.shopify-sync/

# Optional logs
*.log
**/sync-log.json

# OS files
.DS_Store
```

This is **already set up** in the repository.

---

## Multiple Stores

### Option 1: One Repo, Multiple Folders

```
shopify-stores/
├── store-us/
│   ├── .env
│   ├── catalog.yaml
│   └── images/
├── store-canada/
│   ├── .env
│   ├── catalog.yaml
│   └── images/
└── store-eu/
    ├── .env
    ├── catalog.yaml
    └── images/
```

**Pros:**
- All stores in one place
- Easy to compare catalogs
- Shared Git history

**Cons:**
- Large repo if many images
- All stores together

### Option 2: One Repo, Git Branches

```bash
# Main US store
git checkout main

# Canadian variant
git checkout -b store-canada
# Edit catalog.yaml (change store domain, prices to CAD)

# EU variant
git checkout -b store-eu
# Edit catalog.yaml (change store domain, prices to EUR)
```

**Pros:**
- Use Git branches naturally
- Cherry-pick changes between stores
- Review differences with `git diff`

**Cons:**
- Need to switch branches
- Images might differ per store

### Option 3: Separate Repos

```
~/stores/
├── shopify-us/
├── shopify-canada/
└── shopify-eu/
```

**Pros:**
- Complete isolation
- Smaller repos
- Different teams per store

**Cons:**
- Harder to share changes
- No shared history

---

## Data Flow

### Pull (Shopify → Local)

```
┌─────────────┐
│   Shopify   │
│   (Source)  │
└──────┬──────┘
       │
       │ pull command
       ▼
┌─────────────────┐
│  Tool fetches:  │
│  - Products     │
│  - Images       │
│  - Metadata     │
└──────┬──────────┘
       │
       ▼
┌──────────────────────┐
│  Local Files:        │
│  - catalog.yaml      │
│  - images/           │
│  - .shopify-sync/    │
└──────────────────────┘
```

### Sync (Local → Shopify)

```
┌──────────────────────┐
│  Local Files:        │
│  - catalog.yaml      │
│  - images/           │
└──────┬───────────────┘
       │
       │ sync command
       ▼
┌─────────────────┐
│  Tool checks:   │
│  - Conflicts?   │
│  - What changed?│
│  - Images new?  │
└──────┬──────────┘
       │
       │ If OK
       ▼
┌─────────────┐
│   Shopify   │
│  (Updated)  │
└─────────────┘
       │
       ▼
┌─────────────────┐
│ Updates:        │
│ .shopify-sync/  │
│ sync-log.json   │
└─────────────────┘
```

---

## Getting Started Checklist

- [ ] Clone the repository: `git clone https://github.com/OllieDough/shopify-catalog-yaml-sync.git`
- [ ] Install dependencies: `npm install`
- [ ] Get Shopify API token (see README)
- [ ] Copy example: `cp -r examples/starter-store my-store`
- [ ] Add credentials: `cp my-store/.env.example my-store/.env` and edit
- [ ] Pull existing store: `cd my-store && shopify-catalog-yaml-sync pull`
- [ ] Or create from scratch: Edit `catalog.yaml`
- [ ] Initialize Git: `git init && git add . && git commit -m "Initial"`
- [ ] Make changes: Edit `catalog.yaml`
- [ ] Preview: `shopify-catalog-yaml-sync sync --dry-run`
- [ ] Push: `shopify-catalog-yaml-sync sync`
- [ ] Commit: `git commit -am "Update catalog"`

---

## Need Help?

- **Getting started:** See [README.md](./README.md)
- **Workflows:** See [WORKFLOW.md](./WORKFLOW.md)
- **Examples:** See `examples/`
- **Issues:** https://github.com/OllieDough/shopify-catalog-yaml-sync/issues
