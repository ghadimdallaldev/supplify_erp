import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../features/auth/AuthContext";
import type {
  ReorderAssistanceResponse,
  SupplierReorderAssistanceResponse,
} from "../../../types/reorder";
import { api } from "../client";

export function useReorderGuidance(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "restaurant",
      "reorder-guidance",
      user?.id,
      user?.workspace?.tenantId,
    ],
    queryFn: () =>
      api.get<ReorderAssistanceResponse>(
        "/api/restaurant-inventory/reorder-assistance",
      ),
    enabled,
    staleTime: 60_000,
  });
}

/** Additive supplier contract; the dedicated follow-up dashboard remains web-linked. */
export function useSupplierReorderGuidance(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "supplier",
      "reorder-guidance",
      user?.id,
      user?.workspace?.tenantId,
    ],
    queryFn: () =>
      api.get<SupplierReorderAssistanceResponse>(
        "/api/supplier/reorder-assistance",
      ),
    enabled: enabled && user?.role === "SUPPLIER",
    staleTime: 60_000,
  });
}
