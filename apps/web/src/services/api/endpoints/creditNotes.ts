import { api } from '../base'
export const creditNotesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getCreditNotes: builder.query<{ creditNotes: Array<Record<string, unknown>> }, void>({
      query: () => '/api/credit-notes',
      providesTags: ['CreditNotes'],
    }),
    applyCreditNote: builder.mutation<
      { creditNote: Record<string, unknown> },
      { id: string; invoiceId?: string }
    >({
      query: ({ id, invoiceId }) => ({
        url: `/api/credit-notes/${id}/apply`,
        method: 'POST',
        body: invoiceId ? { invoiceId } : {},
      }),
      invalidatesTags: ['CreditNotes', 'RestaurantFinance'],
    }),
  }),
})
