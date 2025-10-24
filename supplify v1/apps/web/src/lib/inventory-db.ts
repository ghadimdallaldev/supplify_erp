// Inventory API Service
// This simulates the inventory service calls until we have the full backend running

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  qtyOnHand: number;
  qtyAvailable: number;
  unitCost: number;
  avgCost: number;
  totalValue: number;
  location: string;
  category?: string;
  lastMovementAt?: string;
}

export interface InventorySummary {
  totalItems: number;
  totalValue: number;
  items: InventoryItem[];
}

export interface InventoryActivity {
  id: string;
  itemName: string;
  movementType: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  reason: string;
  timestamp: string;
  location: string;
  metadata?: any;
}

// Simulate database operations with localStorage persistence
class InventoryDatabase {
  private static instance: InventoryDatabase;
  private inventory: Map<string, InventoryItem> = new Map();
  private activity: InventoryActivity[] = [];
  private readonly INVENTORY_STORAGE_KEY = 'supplify-inventory';
  private readonly ACTIVITY_STORAGE_KEY = 'supplify-inventory-activity';

  static getInstance(): InventoryDatabase {
    if (!InventoryDatabase.instance) {
      InventoryDatabase.instance = new InventoryDatabase();
    }
    return InventoryDatabase.instance;
  }

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window !== 'undefined') {
      // Load inventory
      const storedInventory = localStorage.getItem(this.INVENTORY_STORAGE_KEY);
      if (storedInventory) {
        const inventoryArray = JSON.parse(storedInventory);
        this.inventory = new Map(inventoryArray);
      }

      // Load activity
      const storedActivity = localStorage.getItem(this.ACTIVITY_STORAGE_KEY);
      if (storedActivity) {
        this.activity = JSON.parse(storedActivity);
      }
    }
  }

  private saveToStorage() {
    if (typeof window !== 'undefined') {
      // Save inventory
      const inventoryArray = Array.from(this.inventory.entries());
      localStorage.setItem(this.INVENTORY_STORAGE_KEY, JSON.stringify(inventoryArray));

      // Save activity
      localStorage.setItem(this.ACTIVITY_STORAGE_KEY, JSON.stringify(this.activity));
    }
  }

  // Add items from order delivery
  addItemsFromOrder(orderId: string, restaurantId: string, items: any[]) {
    items.forEach(item => {
      const itemId = `item-${item.productId}`;
      const existingItem = this.inventory.get(itemId);
      
      if (existingItem) {
        // Update existing item
        existingItem.qtyOnHand += item.quantity;
        existingItem.qtyAvailable += item.quantity;
        existingItem.totalValue = existingItem.qtyOnHand * existingItem.avgCost;
        existingItem.lastMovementAt = new Date().toISOString();
      } else {
        // Create new item
        this.inventory.set(itemId, {
          id: itemId,
          name: item.productName,
          sku: `SKU-${item.productId}`,
          qtyOnHand: item.quantity,
          qtyAvailable: item.quantity,
          unitCost: item.unitPrice,
          avgCost: item.unitPrice,
          totalValue: item.quantity * item.unitPrice,
          location: 'Main Storage',
          category: 'General',
          lastMovementAt: new Date().toISOString(),
        });
      }

      // Add activity entry
      this.activity.unshift({
        id: `activity-${Date.now()}-${Math.random()}`,
        itemName: item.productName,
        movementType: 'RECEIPT',
        quantity: item.quantity,
        unitCost: item.unitPrice,
        totalCost: item.quantity * item.unitPrice,
        reason: `Receipt from order ${orderId}`,
        timestamp: new Date().toISOString(),
        location: 'Main Storage',
        metadata: {
          orderId,
          productId: item.productId,
        },
      });
    });

    // Save to localStorage
    this.saveToStorage();
  }

  // Get inventory summary
  getInventorySummary(restaurantId: string): InventorySummary {
    const items = Array.from(this.inventory.values());
    const totalValue = items.reduce((sum, item) => sum + item.totalValue, 0);

    return {
      totalItems: items.length,
      totalValue,
      items,
    };
  }

  // Get recent activity
  getRecentActivity(restaurantId: string, limit: number = 10): InventoryActivity[] {
    return this.activity.slice(0, limit);
  }

  // Create adjustment
  createAdjustment(itemId: string, adjustment: number, reason: string, userId: string) {
    const item = this.inventory.get(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Update item quantities
    item.qtyOnHand += adjustment;
    item.qtyAvailable += adjustment;
    item.totalValue = item.qtyOnHand * item.avgCost;
    item.lastMovementAt = new Date().toISOString();

    // Add activity entry
    this.activity.unshift({
      id: `activity-${Date.now()}-${Math.random()}`,
      itemName: item.name,
      movementType: 'ADJUSTMENT',
      quantity: adjustment,
      unitCost: item.avgCost,
      totalCost: adjustment * item.avgCost,
      reason,
      timestamp: new Date().toISOString(),
      location: item.location,
      metadata: {
        userId,
        adjustment,
      },
    });

    // Save to localStorage
    this.saveToStorage();

    return {
      success: true,
      message: 'Adjustment created successfully',
      adjustmentId: `adj-${Date.now()}`,
    };
  }
}

// Export singleton instance
export const inventoryDB = InventoryDatabase.getInstance();

// Start with empty inventory - items will be added when orders are delivered
// No more mock data!
