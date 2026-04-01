// src/mappers/order-mapper.ts
// Maps between internal order domain types and gRPC proto types

import type { InventoryRequest, InventoryItem } from "@company/shared-proto";

export interface OrderLineItem {
  orderId: string;
  skuId: string;
  count: number;
  unitPrice: number;
}

/**
 * Maps an OrderLineItem to an InventoryRequest for stock reservation.
 * BUG: Uses old field names from shared-proto v2.x.
 *      v3.0.0 renamed item_count -> quantity, sku_id -> product_sku.
 */
export function toInventoryRequest(item: OrderLineItem): InventoryRequest {
  return {
    sku_id: item.skuId,        // v3.0.0: renamed to product_sku
    item_count: item.count,    // v3.0.0: renamed to quantity
    warehouse: "us-east-1",
  };
}

/**
 * Maps an InventoryItem response back to partial OrderLineItem fields.
 * BUG: Same stale field references.
 */
export function fromInventoryItem(inv: InventoryItem): Partial<OrderLineItem> {
  return {
    skuId: inv.sku_id,         // v3.0.0: renamed to product_sku
    count: inv.item_count,     // v3.0.0: renamed to quantity
  };
}
