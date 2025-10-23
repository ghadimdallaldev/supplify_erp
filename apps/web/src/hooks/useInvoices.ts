'use client';

import { useCallback } from 'react';
import { 
  fetchInvoices, 
  fetchInvoiceStats, 
  createInvoice, 
  updateInvoiceStatus, 
  generateInvoicePDF 
} from '../lib/mockInvoiceApi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
      const result = await fetchInvoices(userId, userRole, filters);
      return result.invoices;
    },
    staleTime: 30000, // 30 seconds
  });

  const { data: stats } = useQuery({
    queryKey: ['invoice-stats', userId, userRole],
    queryFn: async () => {
      return fetchInvoiceStats(userId, userRole);
    },
    staleTime: 60000, // 1 minute
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: CreateInvoiceRequest) => {
      return createInvoice(data);
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
      return updateInvoiceStatus(invoiceId, status, amount, method);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', userId, userRole] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats', userId, userRole] });
    },
  });

  const generatePDFMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return generateInvoicePDF(invoiceId);
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
    invoices: invoices || [],
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
      return fetchInvoiceStats(userId, userRole);
    },
    staleTime: 60000, // 1 minute
  });

  return {
    stats: stats || { total: 0, paid: 0, pending: 0, overdue: 0, totalValue: 0 },
    isLoading,
    error,
  };
}
