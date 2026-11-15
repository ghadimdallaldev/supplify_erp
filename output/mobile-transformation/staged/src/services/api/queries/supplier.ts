import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProductCategoriesResponse,
  ProductsResponse,
  SupplierDeliveryBoard,
} from "../../../types/supplify";
import type { DispatchOrderCard } from "../../../types/orders-ext";
import { api } from "../client";
import { queryKeys, qs } from "./keys";

/** Supplier tenant catalog — API scopes to the signed-in supplier automatically. */
export function useSupplierProducts(params?: { q?: string; limit?: string }) {
  return useQuery({
    queryKey: queryKeys.products({
      scope: "supplier",
      includeStock: "true",
      limit: params?.limit ?? "100",
      ...(params?.q ? { q: params.q } : {}),
    }),
    queryFn: () =>
      api.get<ProductsResponse>(
        `/api/products${qs({
          includeStock: "true",
          limit: params?.limit ?? "100",
          ...(params?.q ? { q: params.q } : {}),
        })}`,
      ),
  });
}

export function useSupplierProductCategories() {
  return useQuery({
    queryKey: queryKeys.productCategories,
    queryFn: () =>
      api.get<ProductCategoriesResponse>("/api/products/categories"),
  });
}

export function useCreateSupplierProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.post<{ category: import("../../../types/supplify").ProductCategory }>(
        "/api/products/categories",
        body,
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.productCategories,
      }),
  });
}

export function useDeleteSupplierProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      api.delete<{ id: string }>(`/api/products/categories/${categoryId}`),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.productCategories,
      }),
  });
}
export function useSupplierDeliveryBoard(
  status = "active_delivery",
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.deliveryBoard(status),
    queryFn: () =>
      api.get<SupplierDeliveryBoard>(
        `/api/supplier/deliveries/board${qs({ status })}`,
      ),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useFulfillmentDispatch(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dispatch,
    queryFn: () =>
      api.get<{ orders: DispatchOrderCard[] }>("/api/fulfillment/dispatch"),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useFulfillmentDrivers() {
  return useQuery({
    queryKey: queryKeys.drivers,
    queryFn: () =>
      api.get<{
        drivers: { id: string; full_name?: string; fullName?: string }[];
      }>("/api/fulfillment/drivers"),
  });
}

export function useRestaurants() {
  return useQuery({
    queryKey: queryKeys.restaurants,
    queryFn: () =>
      api.get<{ restaurants: import("../../../types/supplify").Restaurant[] }>(
        "/api/restaurants",
      ),
  });
}
