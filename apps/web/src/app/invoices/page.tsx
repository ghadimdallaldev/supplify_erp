'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, DollarSign, FileText, CheckCircle, Clock } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';

/**
 * Invoices Page
 * View and manage invoices
 */
export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/invoices${params}`);
      return res.json();
    },
  });

  const stats = {
    total: invoices?.length || 0,
    paid: invoices?.filter((i: any) => i.status === 'PAID').length || 0,
    pending: invoices?.filter((i: any) => i.status === 'SENT').length || 0,
    overdue: invoices?.filter((i: any) => i.status === 'OVERDUE').length || 0,
    totalValue: invoices?.reduce((sum: number, i: any) => sum + Number(i.total), 0) || 0,
  };

  const columns = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (invoice: any) => (
        <div className="font-mono text-sm font-medium">{invoice.invoiceNumber}</div>
      ),
    },
    {
      key: 'supplierId',
      header: 'Supplier',
    },
    {
      key: 'status',
      header: 'Status',
      render: (invoice: any) => <StatusBadge status={invoice.status} />,
    },
    {
      key: 'issueDate',
      header: 'Issue Date',
      render: (invoice: any) => new Date(invoice.issueDate).toLocaleDateString(),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      render: (invoice: any) => new Date(invoice.dueDate).toLocaleDateString(),
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right' as const,
      render: (invoice: any) => (
        <span className="font-semibold">${Number(invoice.total).toFixed(2)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      render: (invoice: any) => (
        <div className="flex gap-2 justify-end">
          {invoice.pdfUrl && (
            <a
              href={invoice.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button className="text-gray-600 hover:text-gray-700">
            <Eye className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-2">Manage your invoices and payments</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Total Invoices</div>
              <FileText className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Paid</div>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Pending</div>
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Overdue</div>
              <Clock className="h-5 w-5 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Total Value</div>
              <DollarSign className="h-5 w-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              ${stats.totalValue.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Filter by status:</span>
            {['ALL', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Invoices Table */}
        <DataTable
          data={invoices || []}
          columns={columns}
          keyExtractor={(invoice) => invoice.id}
          isLoading={isLoading}
          emptyMessage="No invoices found"
        />
      </div>
    </div>
  );
}

