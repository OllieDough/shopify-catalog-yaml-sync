# Starter Store Example

This is a minimal example showing the basic folder structure for a store.

## Structure

```
starter-store/
├── .env                    # Your Shopify credentials (not committed to Git)
├── catalog.yaml            # Product catalog
├── images/                 # Product images
│   ├── classic-tee/
│   │   ├── 01-black-front.png
│   │   ├── 02-white-front.png
│   │   └── 03-navy-front.png
│   └── wool-beanie/
│       ├── 01-black.png
│       └── 02-gray.png
└── .shopify-sync/          # Auto-generated state (not committed to Git)
    └── state.json
```

## Quick Start

1. Copy `.env.example` to `.env` and add your Shopify token
2. Run: `shopify-catalog-yaml-sync pull` to download your store
3. Edit `catalog.yaml`
4. Run: `shopify-catalog-yaml-sync sync` to push changes
