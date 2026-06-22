import { api } from '../base'
import type {
  PresignedUrlRequest,
  PresignedUrlResponse,
  AttachFileRequest,
  Attachment,
} from '../../../types'
export const filesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    generatePresignedUrl: builder.mutation<PresignedUrlResponse, PresignedUrlRequest>({
      query: (body) => ({
        url: '/api/files/presign',
        method: 'POST',
        body,
      }),
    }),
    attachFileToProduct: builder.mutation<
      Attachment,
      { productId: string; data: AttachFileRequest }
    >({
      query: ({ productId, data }) => ({
        url: `/api/files/product/${productId}/attach`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Product'],
    }),
  }),
})
