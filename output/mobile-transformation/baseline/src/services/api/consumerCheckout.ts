import { api } from "./client";
import type { ConsumerOrderSummary } from "../../types/consumer";

/** Public diner checkout contract; retain the same key and body after an uncertain response. */
export type PublicConsumerCheckoutRequest = {
  idempotencyKey: string;
  branchId: string;
  fulfillmentType: "DELIVERY" | "TAKEAWAY" | "DINE_IN";
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  deliveryAddress?: Record<string, unknown>;
  deliveryZoneId?: string;
  notes?: string;
  scheduledFor?: string;
  pointsToRedeem?: number;
  lines: Array<{
    menuItemId: string;
    quantity: number;
    modifierOptionIds?: string[];
    notes?: string;
  }>;
};

export function createPublicConsumerOrder(
  restaurantSlug: string,
  payload: PublicConsumerCheckoutRequest,
) {
  return api.post<{
    order: ConsumerOrderSummary;
    lines: unknown[];
    receiptToken: string;
  }>(
    `/api/public/consumer/${encodeURIComponent(restaurantSlug)}/orders`,
    payload,
  );
}
