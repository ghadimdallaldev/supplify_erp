import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Reservation,
  ReservationBoardResponse,
  ReservationStatus,
  ReservationWaitlist,
} from "../../../types/reservations";
import { api } from "../client";
import { queryKeys, qs } from "./keys";

export function useReservationBoard(date?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reservationBoard(date),
    enabled,
    queryFn: () =>
      api.get<ReservationBoardResponse>(
        `/api/reservations/board${qs({ date })}`,
      ),
    refetchInterval: 30_000,
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      customerName: string;
      customerPhone?: string;
      partySize: number;
      scheduledAt: string;
      durationMinutes?: number;
      notes?: string;
      bookingSource?: "staff" | "walk_in";
    }) => api.post<{ reservation: Reservation }>("/api/reservations", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useUpdateReservationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      api.patch<{ reservation: Reservation }>(`/api/reservations/${id}`, {
        status,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useAssignReservationTables() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tableIds }: { id: string; tableIds: string[] }) =>
      api.patch<{ reservation: Reservation }>(
        `/api/reservations/${id}/tables`,
        { tableIds },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useReservationWaitlist() {
  return useQuery({
    queryKey: queryKeys.reservationWaitlist,
    queryFn: () =>
      api.get<{ waitlist: ReservationWaitlist[] }>(
        "/api/reservations/waitlist",
      ),
  });
}

export function usePromoteWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ waitlist: ReservationWaitlist }>(
        `/api/reservations/waitlist/${id}/manually-promote`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}
