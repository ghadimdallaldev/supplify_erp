import type { OrderStatus } from '@supplify/config';

export interface CartItem {
  productId: string;
  supplierId: string;
  qty: number;
  unitPrice: number;
  notes?: string;
}

export interface Cart {
  id: string;
  restaurantId: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  supplierId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  status: OrderStatus;
  notes?: string;
  createdAt: Date;
}

export interface PlaceOrderInput {
  deliveryAddressId: string;
  notes?: string;
}

export interface PlaceOrderResult {
  orders: Order[];
  success: boolean;
}

