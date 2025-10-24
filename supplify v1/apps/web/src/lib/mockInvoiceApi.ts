// Mock API endpoints for invoices
// In a real app, these would be actual API routes

export const mockInvoices = [
  {
    id: 'inv-001',
    invoiceNumber: 'INV-202501-0001',
    orderId: 'order-001',
    restaurantId: 'golden-fork',
    supplierId: 'fresh-foods',
    status: 'SENT',
    issueDate: '2025-01-20T00:00:00Z',
    dueDate: '2025-02-19T00:00:00Z',
    subtotal: 1000.00,
    taxAmount: 100.00,
    discountAmount: 0,
    total: 1100.00,
    currency: 'USD',
    notes: 'Monthly produce order',
    pdfUrl: null,
    paidAt: null,
    paidAmount: null,
    paymentMethod: null,
    createdAt: '2025-01-20T00:00:00Z',
    updatedAt: '2025-01-20T00:00:00Z',
    items: [
      {
        id: 'item-001',
        productId: 'prod-001',
        productName: 'Fresh Tomatoes',
        sku: 'SKU-001',
        quantity: 50,
        unitPrice: 2.00,
        taxRate: 0.1,
        total: 100.00,
      },
      {
        id: 'item-002',
        productId: 'prod-002',
        productName: 'Organic Lettuce',
        sku: 'SKU-002',
        quantity: 30,
        unitPrice: 3.00,
        taxRate: 0.1,
        total: 90.00,
      },
    ],
    order: {
      id: 'order-001',
      status: 'Delivered',
      approvedAt: '2025-01-19T10:30:00Z',
      approvedBy: 'SYSTEM',
    },
  },
  {
    id: 'inv-002',
    invoiceNumber: 'INV-202501-0002',
    orderId: 'order-002',
    restaurantId: 'golden-fork',
    supplierId: 'premium-meats',
    status: 'PAID',
    issueDate: '2025-01-18T00:00:00Z',
    dueDate: '2025-02-17T00:00:00Z',
    subtotal: 1500.00,
    taxAmount: 150.00,
    discountAmount: 0,
    total: 1650.00,
    currency: 'USD',
    notes: 'Premium beef order',
    pdfUrl: '/api/invoices/inv-002/pdf',
    paidAt: '2025-01-25T14:30:00Z',
    paidAmount: 1650.00,
    paymentMethod: 'BANK_TRANSFER',
    createdAt: '2025-01-18T00:00:00Z',
    updatedAt: '2025-01-25T14:30:00Z',
    items: [
      {
        id: 'item-003',
        productId: 'prod-003',
        productName: 'Premium Beef',
        sku: 'SKU-003',
        quantity: 20,
        unitPrice: 15.00,
        taxRate: 0.1,
        total: 300.00,
      },
    ],
    order: {
      id: 'order-002',
      status: 'Delivered',
      approvedAt: '2025-01-17T09:15:00Z',
      approvedBy: 'SYSTEM',
    },
  },
  {
    id: 'inv-003',
    invoiceNumber: 'INV-202501-0003',
    orderId: 'order-003',
    restaurantId: 'golden-fork',
    supplierId: 'local-produce',
    status: 'OVERDUE',
    issueDate: '2025-01-15T00:00:00Z',
    dueDate: '2025-01-30T00:00:00Z',
    subtotal: 800.00,
    taxAmount: 80.00,
    discountAmount: 0,
    total: 880.00,
    currency: 'USD',
    notes: 'Local vegetables',
    pdfUrl: null,
    paidAt: null,
    paidAmount: null,
    paymentMethod: null,
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
    items: [
      {
        id: 'item-004',
        productId: 'prod-004',
        productName: 'Local Carrots',
        sku: 'SKU-004',
        quantity: 100,
        unitPrice: 0.80,
        taxRate: 0.1,
        total: 80.00,
      },
    ],
    order: {
      id: 'order-003',
      status: 'Delivered',
      approvedAt: '2025-01-14T16:45:00Z',
      approvedBy: 'SYSTEM',
    },
  },
];

export const mockInvoiceStats = {
  total: 3,
  paid: 1,
  pending: 1,
  overdue: 1,
  totalValue: 3630.00,
};

// Mock API functions
export async function fetchInvoices(userId: string, userRole: 'restaurant' | 'supplier', filters?: any) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  let filteredInvoices = mockInvoices.filter(invoice => {
    if (userRole === 'restaurant') {
      return invoice.restaurantId === userId;
    } else {
      return invoice.supplierId === userId;
    }
  });

  if (filters?.status && filters.status !== 'ALL') {
    filteredInvoices = filteredInvoices.filter(invoice => invoice.status === filters.status);
  }

  return {
    invoices: filteredInvoices,
    total: filteredInvoices.length,
  };
}

export async function fetchInvoiceStats(userId: string, userRole: 'restaurant' | 'supplier') {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const filteredInvoices = mockInvoices.filter(invoice => {
    if (userRole === 'restaurant') {
      return invoice.restaurantId === userId;
    } else {
      return invoice.supplierId === userId;
    }
  });

  const stats = {
    total: filteredInvoices.length,
    paid: filteredInvoices.filter(inv => inv.status === 'PAID').length,
    pending: filteredInvoices.filter(inv => inv.status === 'SENT').length,
    overdue: filteredInvoices.filter(inv => inv.status === 'OVERDUE').length,
    totalValue: filteredInvoices.reduce((sum, inv) => sum + inv.total, 0),
  };

  return stats;
}

export async function createInvoice(data: any) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const newInvoice = {
    id: `inv-${Date.now()}`,
    invoiceNumber: `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(mockInvoices.length + 1).padStart(4, '0')}`,
    orderId: data.orderId,
    restaurantId: data.restaurantId,
    supplierId: data.supplierId,
    status: 'DRAFT',
    issueDate: data.issueDate || new Date().toISOString(),
    dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    subtotal: 1000.00, // Mock calculation
    taxAmount: 100.00,
    discountAmount: 0,
    total: 1100.00,
    currency: 'USD',
    notes: data.notes,
    pdfUrl: null,
    paidAt: null,
    paidAmount: null,
    paymentMethod: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
    order: {
      id: data.orderId,
      status: 'Delivered',
      approvedAt: new Date().toISOString(),
      approvedBy: 'SYSTEM',
    },
  };

  mockInvoices.push(newInvoice);
  return newInvoice;
}

export async function updateInvoiceStatus(invoiceId: string, status: string, amount?: number, method?: string) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 600));
  
  const invoice = mockInvoices.find(inv => inv.id === invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  invoice.status = status;
  invoice.updatedAt = new Date().toISOString();

  if (status === 'PAID') {
    invoice.paidAt = new Date().toISOString();
    invoice.paidAmount = amount;
    invoice.paymentMethod = method;
  }

  return invoice;
}

export async function generateInvoicePDF(invoiceId: string) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const invoice = mockInvoices.find(inv => inv.id === invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
  invoice.pdfUrl = pdfUrl;

  return { pdfUrl };
}
