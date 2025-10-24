import { z } from 'zod';

// Common schemas
export const ClientIdSchema = z.string().min(1);
export const UserIdSchema = z.string().min(1);
export const EmailSchema = z.string().email();
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);

// Organization schemas
export const OrganizationTypeSchema = z.enum(['restaurant', 'supplier', 'admin']);
export const TierSchema = z.enum(['basic', 'premium', 'enterprise']);

// Supplier schemas
export const SupplierSchema = z.object({
  id: z.string(),
  clientId: ClientIdSchema,
  name: z.string().min(1),
  email: EmailSchema,
  phone: PhoneSchema.optional(),
  address: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateSupplierSchema = SupplierSchema.omit({
  id: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
});

// Product schemas
export const ProductSchema = z.object({
  id: z.string(),
  clientId: ClientIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().min(1), // kg, piece, liter, etc.
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProductSchema = ProductSchema.omit({
  id: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
});

// Order schemas
export const OrderStatusSchema = z.enum([
  'pending',
  'acknowledged',
  'preparing',
  'dispatched',
  'delivered',
  'cancelled'
]);

export const OrderLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
});

export const OrderSchema = z.object({
  id: z.string(),
  clientId: ClientIdSchema,
  supplierId: z.string(),
  status: OrderStatusSchema,
  lines: z.array(OrderLineSchema),
  totalAmount: z.number().nonnegative(),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateOrderSchema = OrderSchema.omit({
  id: true,
  clientId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

// Inventory schemas
export const InventoryActivityTypeSchema = z.enum([
  'delivery',
  'adjustment',
  'transfer',
  'waste'
]);

export const InventoryActivitySchema = z.object({
  id: z.string(),
  clientId: ClientIdSchema,
  productId: z.string(),
  type: InventoryActivityTypeSchema,
  quantity: z.number(),
  referenceId: z.string().optional(), // orderId, etc.
  notes: z.string().optional(),
  createdAt: z.date(),
});

export const InventorySummarySchema = z.object({
  productId: z.string(),
  productName: z.string(),
  currentStock: z.number(),
  reservedStock: z.number(),
  availableStock: z.number(),
  lastUpdated: z.date(),
});

// Feature Flag schemas
export const FeatureFlagScopeSchema = z.enum(['global', 'tenant', 'user']);
export const FeatureFlagSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  scope: FeatureFlagScopeSchema,
  clientId: ClientIdSchema.optional(),
  userId: UserIdSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateFeatureFlagSchema = FeatureFlagSchema.omit({
  createdAt: true,
  updatedAt: true,
});

// Loyalty schemas
export const LoyaltyTransactionTypeSchema = z.enum([
  'earn',
  'redeem',
  'adjustment'
]);

export const LoyaltyTransactionSchema = z.object({
  id: z.string(),
  clientId: ClientIdSchema,
  userId: UserIdSchema,
  type: LoyaltyTransactionTypeSchema,
  points: z.number(),
  referenceId: z.string().optional(),
  description: z.string(),
  createdAt: z.date(),
});

export const LoyaltyWalletSchema = z.object({
  clientId: ClientIdSchema,
  userId: UserIdSchema,
  totalPoints: z.number().nonnegative(),
  availablePoints: z.number().nonnegative(),
  lastUpdated: z.date(),
});

// Invoice schemas
export const InvoiceSchema = z.object({
  id: z.string(),
  clientId: ClientIdSchema,
  orderId: z.string(),
  amount: z.number().nonnegative(),
  status: z.enum(['pending', 'paid', 'cancelled']),
  dueDate: z.date(),
  paidAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// API Response schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

// Type exports
export type ClientId = z.infer<typeof ClientIdSchema>;
export type UserId = z.infer<typeof UserIdSchema>;
export type OrganizationType = z.infer<typeof OrganizationTypeSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type Supplier = z.infer<typeof SupplierSchema>;
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderLine = z.infer<typeof OrderLineSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type InventoryActivityType = z.infer<typeof InventoryActivityTypeSchema>;
export type InventoryActivity = z.infer<typeof InventoryActivitySchema>;
export type InventorySummary = z.infer<typeof InventorySummarySchema>;
export type FeatureFlagScope = z.infer<typeof FeatureFlagScopeSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type CreateFeatureFlag = z.infer<typeof CreateFeatureFlagSchema>;
export type LoyaltyTransactionType = z.infer<typeof LoyaltyTransactionTypeSchema>;
export type LoyaltyTransaction = z.infer<typeof LoyaltyTransactionSchema>;
export type LoyaltyWallet = z.infer<typeof LoyaltyWalletSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type ApiResponse<T = any> = z.infer<typeof ApiResponseSchema> & { data?: T };
export type Pagination = z.infer<typeof PaginationSchema>;
