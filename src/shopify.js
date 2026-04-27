// Shopify Admin GraphQL client.
// Uses productSet — the modern single-mutation create-or-update for products
// with all variants and options. Available since 2024-04 API.

import { GraphQLClient, gql } from 'graphql-request';

export class Shopify {
  constructor({ storeDomain, adminToken, apiVersion = '2024-10' }) {
    if (!storeDomain || !adminToken) {
      throw new Error('Missing store domain or admin token');
    }
    const url = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
    this.client = new GraphQLClient(url, {
      headers: { 'X-Shopify-Access-Token': adminToken },
    });
  }

  async findProductByHandle(handle) {
    const query = gql`
      query getProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          handle
          variants(first: 100) {
            edges {
              node {
                id
                sku
                selectedOptions { name value }
              }
            }
          }
          media(first: 50) { edges { node { id } } }
        }
      }
    `;
    const data = await this.client.request(query, { handle });
    return data.productByHandle;
  }

  // Single-shot create-or-update. Pass full product spec; Shopify handles
  // variant matrix matching by option values. If a variant exists, it's
  // updated; if missing, created.
  async productSet(input) {
    const mutation = gql`
      mutation productSet($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            handle
            title
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  selectedOptions { name value }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `;
    const data = await this.client.request(mutation, { input });
    const errs = data.productSet.userErrors;
    if (errs.length) {
      throw new Error(`productSet errors: ${JSON.stringify(errs, null, 2)}`);
    }
    return data.productSet.product;
  }

  // Inventory adjustment — productSet doesn't set quantities, so we set them after.
  async setInventoryQuantity({ inventoryItemId, locationId, quantity }) {
    const mutation = gql`
      mutation setQty($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { id }
          userErrors { field message }
        }
      }
    `;
    const data = await this.client.request(mutation, {
      input: {
        reason: 'correction',
        name: 'available',
        ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId, locationId, quantity }],
      },
    });
    const errs = data.inventorySetQuantities.userErrors;
    if (errs.length) {
      throw new Error(`inventorySetQuantities errors: ${JSON.stringify(errs)}`);
    }
  }

  async getPrimaryLocationId() {
    const query = gql`{ locations(first: 1) { edges { node { id } } } }`;
    const data = await this.client.request(query);
    return data.locations.edges[0]?.node.id;
  }

  async getInventoryItemsForVariants(variantIds) {
    const query = gql`
      query getItems($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            inventoryItem { id }
          }
        }
      }
    `;
    const data = await this.client.request(query, { ids: variantIds });
    return Object.fromEntries(
      data.nodes
        .filter(n => n)
        .map(n => [n.id, n.inventoryItem.id])
    );
  }

  // Image upload pipeline (3 calls).
  async stagedUpload({ filename, mimeType, fileSize }) {
    const mutation = gql`
      mutation stage($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `;
    const data = await this.client.request(mutation, {
      input: [{
        filename, mimeType, fileSize: String(fileSize),
        httpMethod: 'POST', resource: 'IMAGE',
      }],
    });
    return data.stagedUploadsCreate.stagedTargets[0];
  }

  async postFileToStagedUrl({ stagedTarget, fileBuffer, filename, mimeType }) {
    const formData = new FormData();
    for (const p of stagedTarget.parameters) formData.append(p.name, p.value);
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);
    const res = await fetch(stagedTarget.url, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`staged upload failed: ${res.status}`);
  }

  async productCreateMedia({ productId, resourceUrl, alt }) {
    const mutation = gql`
      mutation media($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id } }
          mediaUserErrors { field message }
        }
      }
    `;
    const data = await this.client.request(mutation, {
      productId,
      media: [{ originalSource: resourceUrl, alt: alt || '', mediaContentType: 'IMAGE' }],
    });
    const errs = data.productCreateMedia.mediaUserErrors;
    if (errs.length) throw new Error(`createMedia: ${JSON.stringify(errs)}`);
    return data.productCreateMedia.media[0];
  }

  async setVariantImage({ variantId, mediaId }) {
    const mutation = gql`
      mutation update($productVariants: [ProductVariantsBulkInput!]!, $productId: ID!) {
        productVariantsBulkUpdate(productId: $productId, variants: $productVariants) {
          userErrors { field message }
        }
      }
    `;
    // productVariantsBulkUpdate requires productId; caller provides via a higher-level wrapper.
    // We expose a simpler imageId set via a different mutation:
    const simpler = gql`
      mutation v($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant { id }
          userErrors { field message }
        }
      }
    `;
    const data = await this.client.request(simpler, {
      input: { id: variantId, imageId: mediaId },
    });
    const errs = data.productVariantUpdate.userErrors;
    if (errs.length) throw new Error(`variantUpdate: ${JSON.stringify(errs)}`);
  }
}
