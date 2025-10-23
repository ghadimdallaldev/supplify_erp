'use client';

import { useCallback } from 'react';
import { apolloClient } from '../lib/apollo-client';
import { gql } from '@apollo/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const INVOICES_QUERY = gql`
  query GetInvoices($userId: String!, $userRole: String!, $status: String) {
    invoices(userId: $userId, userRole: $userRole, status: $status)
  }
`;

const INVOICE_STATS_QUERY = gql`
  query GetInvoiceStats($userId: String!, $userRole: String!) {
    invoiceStats(userId: $userId, userRole: $userRole)
  }
`;

const CREATE_INVOICE_MUTATION = gql`
  mutation CreateInvoice($input: CreateInvoiceInput!) {
    createInvoice(input: $input)
  }
`;

const UPDATE_INVOICE_STATUS_MUTATION = gql`
  mutation UpdateInvoiceStatus($invoiceId: ID!, $status: String!, $amount: Float, $method: String) {
    updateInvoiceStatus(invoiceId: $invoiceId, status: $status, amount: $amount, method: $method)
  }
`;

const GENERATE_INVOICE_PDF_MUTATION = gql`
  mutation GenerateInvoicePDF($invoiceId: ID!) {
    generateInvoicePDF(invoiceId: $invoiceId)
  }
`;

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  restaurantId: string;
  supplierId: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  notes?: string;
  pdfUrl?: string;
  paidAt?: string;
  paidAmount?: number;
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
  order?: {
    id: string;
    status: string;
    approvedAt?: string;
    approvedBy?: string;
  };
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: number;
}

export interface InvoiceStats {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  totalValue: number;
}

export interface CreateInvoiceRequest {
  orderId: string;
  restaurantId: string;
  supplierId: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
}

export function useInvoices(userId: string, userRole: 'restaurant' | 'supplier', filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const queryClient = useQueryClient();

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['invoices', userId, userRole, filters],
    queryFn: async () => {
      try {
        console.log('Fetching invoices with variables:', { userId, userRole, status: filters?.status });
        const result = await apolloClient.query({
          query: INVOICES_QUERY,
          variables: {
            userId,
            userRole,
            status: filters?.status,
          },
        });
        console.log('Invoice query result:', result);
        return JSON.parse(result.data.invoices);
      } catch (err) {
        console.error('Error fetching invoices:', err);
        // Return empty array as fallback instead of throwing
        return { invoices: [], total: 0 };
      }
    },
    staleTime: 30000, // 30 seconds
  });

  const { data: stats } = useQuery({
    queryKey: ['invoice-stats', userId, userRole],
    queryFn: async () => {
      try {
        const result = await apolloClient.query({
          query: INVOICE_STATS_QUERY,
          variables: { userId, userRole },
        });
        return JSON.parse(result.data.invoiceStats);
      } catch (err) {
        console.error('Error fetching invoice stats:', err);
        // Return default stats as fallback
        return { total: 0, paid: 0, pending: 0, overdue: 0, totalValue: 0 };
      }
    },
    staleTime: 60000, // 1 minute
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: CreateInvoiceRequest) => {
      const result = await apolloClient.mutate({
        mutation: CREATE_INVOICE_MUTATION,
        variables: { input: data },
      });
      return JSON.parse(result.data.createInvoice);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', userId, userRole] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats', userId, userRole] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ invoiceId, status, amount, method }: {
      invoiceId: string;
      status: string;
      amount?: number;
      method?: string;
    }) => {
      const result = await apolloClient.mutate({
        mutation: UPDATE_INVOICE_STATUS_MUTATION,
        variables: { invoiceId, status, amount, method },
      });
      return JSON.parse(result.data.updateInvoiceStatus);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', userId, userRole] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats', userId, userRole] });
    },
  });

  const generatePDFMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await apolloClient.mutate({
        mutation: GENERATE_INVOICE_PDF_MUTATION,
        variables: { invoiceId },
      });
      return JSON.parse(result.data.generateInvoicePDF);
    },
  });

  const createInvoice = useCallback((data: CreateInvoiceRequest) => {
    return createInvoiceMutation.mutateAsync(data);
  }, [createInvoiceMutation]);

  const updateInvoiceStatus = useCallback((invoiceId: string, status: string, amount?: number, method?: string) => {
    return updateStatusMutation.mutateAsync({ invoiceId, status, amount, method });
  }, [updateStatusMutation]);

  const generatePDF = useCallback((invoiceId: string) => {
    return generatePDFMutation.mutateAsync(invoiceId);
  }, [generatePDFMutation]);

  return {
    invoices: invoices?.invoices || [],
    stats: stats || { total: 0, paid: 0, pending: 0, overdue: 0, totalValue: 0 },
    isLoading,
    error,
    createInvoice,
    updateInvoiceStatus,
    generatePDF,
    isCreating: createInvoiceMutation.isPending,
    isUpdating: updateStatusMutation.isPending,
    isGeneratingPDF: generatePDFMutation.isPending,
  };
}

export function useInvoiceStats(userId: string, userRole: 'restaurant' | 'supplier') {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['invoice-stats', userId, userRole],
    queryFn: async () => {
      const result = await apolloClient.query({
        query: INVOICE_STATS_QUERY,
        variables: { userId, userRole },
      });
      return JSON.parse(result.data.invoiceStats);
    },
    staleTime: 60000, // 1 minute
  });

  return {
    stats: stats || { total: 0, paid: 0, pending: 0, overdue: 0, totalValue: 0 },
    isLoading,
    error,
  };
}
