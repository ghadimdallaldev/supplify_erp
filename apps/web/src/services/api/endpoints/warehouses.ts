import { api } from '../base'
export const warehousesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getWarehouses: builder.query<{ warehouses: any[] }, void>({
      query: () => '/api/warehouses',
      providesTags: ['Inventory'],
    }),
    createWarehouse: builder.mutation<
      { warehouse: any },
      {
        name: string
        code?: string
        address?: string
        city?: string
        country?: string
        capacity?: number
        contact_name?: string
        contact_email?: string
        contact_phone?: string
        type?: string
      }
    >({
      query: (body) => ({
        url: '/api/warehouses',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),
    setDefaultWarehouse: builder.mutation<{ warehouse: any }, string>({
      query: (id) => ({ url: `/api/warehouses/${id}/set-default`, method: 'POST' }),
      invalidatesTags: ['Inventory'],
    }),
    updateWarehouse: builder.mutation<
      { warehouse: any },
      {
        id: string
        name?: string
        code?: string
        address?: string
        is_active?: boolean
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/api/warehouses/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),
    getSupplierFulfillment: builder.query<{ fulfillment: any }, void>({
      query: () => '/api/suppliers/me/fulfillment',
    }),
    updateSupplierFulfillment: builder.mutation<
      { fulfillment: any },
      {
        multi_warehouse_enabled?: boolean
        fulfillment_mode?: 'single' | 'multi'
        confirm_disable?: boolean
      }
    >({
      query: (body) => ({ url: '/api/suppliers/me/fulfillment', method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    getWarehouseRoutingRules: builder.query<{ rules: any[] }, void>({
      query: () => '/api/warehouses/routing/rules',
    }),
    simulateWarehouseRouting: builder.mutation<
      { preview: any[]; warehouseName?: string | null },
      {
        items?: Array<{ productId: string; quantity: number }>
        restaurant_id?: string
        postal_code?: string
      }
    >({
      query: (body) => ({
        url: '/api/warehouses/routing/simulate',
        method: 'POST',
        body: {
          items: (body.items || []).map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          restaurant_id: body.restaurant_id,
          postal_code: body.postal_code,
        },
      }),
    }),
    getOrderWarehouseAssignments: builder.query<
      { assignments: any[]; multiLocation: boolean },
      string
    >({
      query: (orderId) => `/api/orders/${orderId}/warehouses`,
    }),
    reassignOrderWarehouse: builder.mutation<
      { assignment: any },
      { orderId: string; assignmentId: string; warehouseId: string; reason: string }
    >({
      query: ({ orderId, assignmentId, warehouseId, reason }) => ({
        url: `/api/orders/${orderId}/warehouses/${assignmentId}`,
        method: 'PATCH',
        body: { warehouse_id: warehouseId, reason },
      }),
      invalidatesTags: ['Inventory', 'Order'],
    }),
    dispatchOrderWarehouse: builder.mutation<
      { assignment: any },
      { orderId: string; assignmentId: string }
    >({
      query: ({ orderId, assignmentId }) => ({
        url: `/api/orders/${orderId}/warehouses/${assignmentId}/dispatch`,
        method: 'POST',
      }),
      invalidatesTags: ['Inventory', 'Order'],
    }),
    listZones: builder.query<{ zones: WarehouseDeliveryZone[] }, string>({
      query: (warehouseId) => `/api/warehouses/${warehouseId}/zones`,
      providesTags: (result, error, warehouseId) => [
        { type: 'Inventory', id: `warehouse-zones-${warehouseId}` },
      ],
    }),
    createZone: builder.mutation<
      { zone: WarehouseDeliveryZone },
      { warehouseId: string; body: WarehouseZoneInput }
    >({
      query: ({ warehouseId, body }) => ({
        url: `/api/warehouses/${warehouseId}/zones`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { warehouseId }) => [
        { type: 'Inventory', id: `warehouse-zones-${warehouseId}` },
      ],
    }),
    updateZone: builder.mutation<
      { zone: WarehouseDeliveryZone },
      { warehouseId: string; zoneId: string; body: Partial<WarehouseZoneInput> }
    >({
      query: ({ warehouseId, zoneId, body }) => ({
        url: `/api/warehouses/${warehouseId}/zones/${zoneId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { warehouseId }) => [
        { type: 'Inventory', id: `warehouse-zones-${warehouseId}` },
      ],
    }),
    deleteZone: builder.mutation<{ deleted: boolean }, { warehouseId: string; zoneId: string }>({
      query: ({ warehouseId, zoneId }) => ({
        url: `/api/warehouses/${warehouseId}/zones/${zoneId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { warehouseId }) => [
        { type: 'Inventory', id: `warehouse-zones-${warehouseId}` },
      ],
    }),
  }),
})

export type WarehouseDeliveryZone = {
  id: string
  warehouse_id: string
  supplier_id: string
  name: string
  zone_type: 'polygon' | 'radius' | 'postal_codes'
  geometry?: unknown
  postal_codes?: string[] | null
  radius_km?: number | string | null
  center_lat?: number | string | null
  center_lng?: number | string | null
  min_order_amount: number | string
  delivery_fee: number | string
  estimated_delivery_hours?: number | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export type WarehouseZoneInput = {
  name: string
  zone_type?: 'polygon' | 'radius' | 'postal_codes'
  postal_codes?: string[] | null
  min_order_amount?: number
  delivery_fee?: number
  radius_km?: number | null
  center_lat?: number | null
  center_lng?: number | null
}

export const {
  useListZonesQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useDeleteZoneMutation,
} = warehousesApi
