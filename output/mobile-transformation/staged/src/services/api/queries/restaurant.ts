import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { MyContractPricingResponse } from "../../../types/contractPricing";
import type {
  ProductsResponse,
  SuppliersResponse,
  Order,
} from "../../../types/supplify";
import type {
  DeliveryLocation,
  DeliveryLocationsResponse,
  DeliveryLocationUpdate,
} from "../../../types/supplify";
import { api } from "../client";
import { queryKeys, qs } from "./keys";
import type { SupplierPriceComparison } from "../../../types/supplierPriceComparison";

export function useProducts(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: () => api.get<ProductsResponse>(`/api/products${qs(params)}`),
  });
}

export function useInfiniteProducts(params?: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.products(params), "infinite"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<ProductsResponse>(
        `/api/products${qs({ ...params, limit: "30", offset: String(pageParam) })}`,
      ),
    getNextPageParam: (lastPage, pages) =>
      lastPage.pagination?.nextCursor ? pages.length * 30 : undefined,
  });
}

export function useSuppliers(params?: Record<string, string>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.suppliers(params),
    enabled,
    queryFn: () => api.get<SuppliersResponse>(`/api/suppliers${qs(params)}`),
  });
}

export function useSupplierPriceComparisons(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supplierPriceComparisons,
    queryFn: () =>
      api.get<{ comparisons: SupplierPriceComparison[] }>(
        "/api/suppliers/price-comparison?limit=8",
      ),
    enabled,
  });
}

export function useFollowSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (supplierId: string) =>
      api.post(`/api/suppliers/${supplierId}/follow`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUnfollowSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (supplierId: string) =>
      api.delete(`/api/suppliers/${supplierId}/follow`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeliveryLocations() {
  return useQuery({
    queryKey: queryKeys.deliveryLocations,
    queryFn: () =>
      api.get<DeliveryLocationsResponse>(
        "/api/restaurants/me/delivery-locations",
      ),
  });
}

export function useUpdateDeliveryLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeliveryLocationUpdate) =>
      api.patch<{ location: DeliveryLocation }>(
        "/api/restaurants/me/delivery-location",
        body,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.deliveryLocations }),
  });
}

export function useUpdateBranchDeliveryLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      branchId,
      ...body
    }: DeliveryLocationUpdate & { branchId: string }) =>
      api.patch<{ location: DeliveryLocation }>(
        `/api/restaurants/branches/${branchId}/delivery-location`,
        body,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.deliveryLocations }),
  });
}

export function useReceiveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      orderId: string;
      lineItems: {
        orderItemId: string;
        receivedQuantity: number;
        qualityStatus?:
          | "ACCEPTED"
          | "DAMAGED"
          | "EXPIRED"
          | "WRONG_ITEM"
          | "SHORT";
        notes?: string;
      }[];
      deliveryNotes?: string;
    }) => api.post("/api/receiving/receive", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: queryKeys.receivingPending });
    },
  });
}

export function usePendingReceiving(enabled = true) {
  return useQuery({
    queryKey: queryKeys.receivingPending,
    queryFn: () =>
      api.get<{ orders: Order[] }>("/api/receiving/pending-orders"),
    enabled,
  });
}

export type ResolvedContractPriceItem = {
  productId: string;
  supplierId: string;
  quantity: number;
  unitPrice: number;
  source: "DEFAULT_PRICE" | "CONTRACT_PRICE" | "QUOTE_PRICE" | string;
  defaultPrice: number | null;
  contractPriceId: string | null;
};

export function useResolveContractPrices() {
  return useMutation({
    mutationFn: (body: {
      items: Array<{ productId: string; supplierId: string; quantity: number }>;
    }) =>
      api.post<{ items: ResolvedContractPriceItem[] }>(
        "/api/restaurant-pricing/resolve",
        body,
      ),
  });
}

export function useMyContractPricing(params?: {
  q?: string;
  supplierId?: string;
  productId?: string;
}) {
  const queryParams: Record<string, string> = {};
  if (params?.q) queryParams.q = params.q;
  if (params?.supplierId) queryParams.supplierId = params.supplierId;
  if (params?.productId) queryParams.productId = params.productId;
  return useQuery({
    queryKey: queryKeys.myContractPricing(queryParams),
    queryFn: () =>
      api.get<MyContractPricingResponse>(
        `/api/restaurant-pricing/my-pricing${qs(queryParams)}`,
      ),
  });
}
