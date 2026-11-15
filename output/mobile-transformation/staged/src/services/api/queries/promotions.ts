import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActiveDeal,
  BoostPackage,
  CreatePromotionPayload,
  PayActivationBody,
  PromotionAnalytics,
  PromotionsAnalyticsSummary,
  SupplierPromotion,
} from "../../../types/promotions";
import { api } from "../client";
import { queryKeys, qs } from "./keys";
import { unwrapActiveDeals } from "../../../lib/dealDisplay";

export function useActiveDeals() {
  return useQuery({
    queryKey: queryKeys.deals,
    queryFn: async () => {
      const data = await api.get<{
        deals?: ActiveDeal[];
        promotions?: ActiveDeal[];
      }>("/api/promotions/active");
      return unwrapActiveDeals(data);
    },
  });
}

export function useSupplierPromotions(status?: string) {
  return useQuery({
    queryKey: queryKeys.supplierPromotions(status),
    queryFn: async () => {
      const data = await api.get<{ promotions?: SupplierPromotion[] }>(
        `/api/promotions${qs({ status })}`,
      );
      return data.promotions ?? [];
    },
  });
}

export function usePromotionPricing() {
  return useQuery({
    queryKey: queryKeys.promotionPricing,
    queryFn: async () => {
      const data = await api.get<{
        pricing?: BoostPackage[];
        packages?: BoostPackage[];
      }>("/api/promotions/pricing");
      return data.pricing ?? data.packages ?? [];
    },
  });
}

export function usePromotionAnalytics(dealId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.promotionAnalytics(dealId || ""),
    enabled: Boolean(dealId),
    queryFn: async () => {
      const data = await api.get<{ analytics?: PromotionAnalytics }>(
        `/api/promotions/${dealId}/analytics`,
      );
      return data.analytics ?? (data as unknown as PromotionAnalytics);
    },
  });
}

export function usePromotionsAnalyticsSummary(days = 30) {
  return useQuery({
    queryKey: queryKeys.promotionsAnalyticsSummary(days),
    queryFn: async () => {
      const data = await api.get<{ summary?: PromotionsAnalyticsSummary }>(
        `/api/promotions/analytics/summary${qs({ days })}`,
      );
      return data.summary ?? (data as unknown as PromotionsAnalyticsSummary);
    },
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePromotionPayload) =>
      api.post<{ promotion: SupplierPromotion }>("/api/promotions", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions"] });
    },
  });
}

export function usePayActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & PayActivationBody) =>
      api.post<{ promotion: SupplierPromotion }>(
        `/api/promotions/${id}/pay-activation`,
        body,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions"] });
    },
  });
}

export function useActivatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pricingKey }: { id: string; pricingKey: string }) =>
      api.post<{ promotion: SupplierPromotion }>(
        `/api/promotions/${id}/activate`,
        { pricingKey },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions"] });
    },
  });
}

export function usePausePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ promotion: SupplierPromotion }>(`/api/promotions/${id}/pause`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions"] });
    },
  });
}
