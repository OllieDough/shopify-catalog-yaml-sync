// State tracking for bidirectional sync.
//
// Tracks what we last pushed/pulled for each product to enable:
// - Conflict detection: warn if Shopify changed since our last pull
// - Smart pull: only update local YAML if Shopify is newer
// - Push history: see when products were last synced
//
// State file: .shopify-sync/state.json (gitignored recommended)
//
// Format:
// {
//   "products": {
//     "product-handle": {
//       "lastPushed": "2024-01-15T10:30:00.000Z",
//       "lastPulled": "2024-01-15T10:25:00.000Z",
//       "shopifyUpdatedAt": "2024-01-15T10:30:00.000Z",
//       "shopifyId": "gid://shopify/Product/123",
//       "hash": "abc123..."  // hash of what we pushed
//     }
//   }
// }

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class StateManager {
  constructor(catalogDir) {
    this.stateDir = path.join(catalogDir, '.shopify-sync');
    this.statePath = path.join(this.stateDir, 'state.json');
    this.state = { products: {} };
  }

  async load() {
    try {
      const raw = await fs.readFile(this.statePath, 'utf8');
      this.state = JSON.parse(raw);
      if (!this.state.products) this.state.products = {};
    } catch {
      // State file doesn't exist yet; start fresh
      this.state = { products: {} };
    }
  }

  async save() {
    await fs.mkdir(this.stateDir, { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
  }

  // Get state for a product
  get(handle) {
    return this.state.products[handle] || null;
  }

  // Record a push
  recordPush(handle, shopifyProduct, dataHash) {
    this.state.products[handle] = {
      ...this.state.products[handle],
      lastPushed: new Date().toISOString(),
      shopifyUpdatedAt: shopifyProduct.updatedAt,
      shopifyId: shopifyProduct.id,
      hash: dataHash,
    };
  }

  // Record a pull
  recordPull(handle, shopifyProduct) {
    this.state.products[handle] = {
      ...this.state.products[handle],
      lastPulled: new Date().toISOString(),
      shopifyUpdatedAt: shopifyProduct.updatedAt,
      shopifyId: shopifyProduct.id,
    };
  }

  // Check if Shopify was modified since our last push (conflict detection)
  hasConflict(handle, shopifyUpdatedAt) {
    const state = this.get(handle);
    if (!state || !state.lastPushed) return false;

    // If Shopify's updatedAt is newer than what we saw last time, someone
    // edited it in the admin
    return new Date(shopifyUpdatedAt) > new Date(state.shopifyUpdatedAt || 0);
  }

  // Check if we should update local YAML from Shopify
  shouldPullUpdate(handle, shopifyUpdatedAt) {
    const state = this.get(handle);

    // Never pulled this product → should pull
    if (!state || !state.lastPulled) return true;

    // Shopify is newer than our last pull → should pull
    return new Date(shopifyUpdatedAt) > new Date(state.shopifyUpdatedAt || 0);
  }

  // Generate hash of product data for change detection
  static hashProduct(product) {
    // Hash the critical fields to detect changes
    const data = JSON.stringify({
      title: product.title,
      description: product.descriptionHtml,
      variants: product.variants,
      tags: product.tags,
      vendor: product.vendor,
      productType: product.productType,
    });
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  // Get push history for all products (for logging/debugging)
  getHistory() {
    return Object.entries(this.state.products).map(([handle, state]) => ({
      handle,
      ...state,
    }));
  }
}
