import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from '../movements/movements.service';
import * as XLSX from 'xlsx';

export interface BulkUploadItem {
  name: string;
  sku?: string;
  category?: string;
  storageType: 'DRY' | 'CHILL' | 'FREEZE' | 'CHEMICAL';
  uomBase: string;
  description?: string;
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;
  unitCost?: number;
  expiryDate?: Date;
  lotCode?: string;
  quantity?: number;
}

export interface BulkUploadResult {
  success: boolean;
  totalRows: number;
  processedRows: number;
  errors: string[];
  items: any[];
}

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);

  constructor(
    private prisma: PrismaService,
    private movementsService: MovementsService,
  ) {}

  async uploadRestaurantInventory(
    fileBuffer: Buffer,
    restaurantId: string,
    userId: string,
  ): Promise<BulkUploadResult> {
    this.logger.log(`Processing bulk inventory upload for restaurant ${restaurantId}`);

    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData || jsonData.length === 0) {
        throw new BadRequestException('Uploaded file is empty or could not be parsed');
      }

      const result: BulkUploadResult = {
        success: true,
        totalRows: jsonData.length,
        processedRows: 0,
        errors: [],
        items: [],
      };

      // Get or create default location
      const location = await this.getOrCreateDefaultLocation(restaurantId);

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any;
        const rowNum = i + 2; // +2 because Excel is 1-indexed and we skip header

        try {
          const item = await this.processRestaurantInventoryRow(row, restaurantId, location.id, userId);
          if (item) {
            result.items.push(item);
            result.processedRows++;
          }
        } catch (error) {
          const errorMsg = `Row ${rowNum}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      this.logger.log(`Bulk upload completed: ${result.processedRows}/${result.totalRows} items processed`);
      return result;

    } catch (error) {
      this.logger.error(`Bulk upload failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException(`Bulk upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async uploadSupplierProducts(
    fileBuffer: Buffer,
    supplierId: string,
    userId: string,
  ): Promise<BulkUploadResult> {
    this.logger.log(`Processing bulk product upload for supplier ${supplierId}`);

    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData || jsonData.length === 0) {
        throw new BadRequestException('Uploaded file is empty or could not be parsed');
      }

      const result: BulkUploadResult = {
        success: true,
        totalRows: jsonData.length,
        processedRows: 0,
        errors: [],
        items: [],
      };

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any;
        const rowNum = i + 2; // +2 because Excel is 1-indexed and we skip header

        try {
          const product = await this.processSupplierProductRow(row, supplierId, userId);
          if (product) {
            result.items.push(product);
            result.processedRows++;
          }
        } catch (error) {
          const errorMsg = `Row ${rowNum}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          this.logger.warn(errorMsg);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

      this.logger.log(`Bulk upload completed: ${result.processedRows}/${result.totalRows} products processed`);
      return result;

    } catch (error) {
      this.logger.error(`Bulk upload failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException(`Bulk upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processRestaurantInventoryRow(
    row: any,
    restaurantId: string,
    locationId: string,
    userId: string,
  ): Promise<any> {
    // Validate required fields
    const name = row['Item Name']?.toString().trim();
    const sku = row['SKU']?.toString().trim();
    const storageType = row['Storage Type']?.toString().trim().toUpperCase();
    const uomBase = row['UOM']?.toString().trim().toLowerCase();
    const quantity = parseFloat(row['Quantity']) || 0;
    const unitCost = parseFloat(row['Unit Cost']) || 0;

    if (!name) {
      throw new Error('Item Name is required');
    }

    if (!storageType || !['DRY', 'CHILL', 'FREEZE', 'CHEMICAL'].includes(storageType)) {
      throw new Error('Storage Type must be DRY, CHILL, FREEZE, or CHEMICAL');
    }

    if (!uomBase) {
      throw new Error('UOM is required');
    }

    // Create or update item
    let item = await this.prisma.item.findFirst({
      where: {
        restaurantId,
        name,
      },
    });

    if (!item) {
      item = await this.prisma.item.create({
        data: {
          restaurantId,
          name,
          sku: sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          storageType: storageType as any,
          uomBase,
          barcode: row['Barcode']?.toString().trim(),
          yieldPct: row['Yield %'] ? parseFloat(row['Yield %'].toString()) : null,
          active: true,
        },
      });
    }

    // If quantity is provided, create a receipt movement
    if (quantity > 0) {
      const expiryDate = row['Expiry Date'] ? new Date(row['Expiry Date']) : undefined;
      const lotCode = row['Lot Code']?.toString().trim();

      await this.movementsService.receiveStock({
        itemId: item.id,
        locationId,
        qty: quantity,
        uom: uomBase,
        unitCost,
        refType: 'BULK_UPLOAD',
        refId: `bulk-${Date.now()}`,
        causedBy: userId,
        reason: 'Bulk inventory upload',
        metadata: {
          uploadType: 'restaurant_inventory',
          originalQuantity: quantity,
        },
        idempotencyKey: `bulk-${item.id}-${Date.now()}`,
        expiryDate: expiryDate?.toISOString(),
        lotCode,
      });
    }

    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      storageType: item.storageType,
      uomBase: item.uomBase,
      quantity: quantity,
      unitCost: unitCost,
    };
  }

  private async processSupplierProductRow(
    row: any,
    supplierId: string,
    userId: string,
  ): Promise<any> {
    // Validate required fields
    const name = row['Product Name']?.toString().trim();
    const sku = row['SKU']?.toString().trim();
    const category = row['Category']?.toString().trim();
    const price = parseFloat(row['Price']);
    const unit = row['Unit']?.toString().trim();
    const stock = parseInt(row['Stock'], 10) || 0;

    if (!name) {
      throw new Error('Product Name is required');
    }

    if (!sku) {
      throw new Error('SKU is required');
    }

    if (!category) {
      throw new Error('Category is required');
    }

    if (isNaN(price) || price <= 0) {
      throw new Error('Price must be a positive number');
    }

    if (!unit) {
      throw new Error('Unit is required');
    }

    // Create supplier product (this would typically be in a catalog service)
    // For now, we'll create it in the inventory service as a supplier product
    const product = await this.prisma.item.create({
      data: {
        restaurantId: supplierId, // Using supplierId as restaurantId for supplier products
        name,
        sku,
        storageType: 'DRY', // Default for supplier products
        uomBase: unit.toLowerCase(),
        active: true,
      },
    });

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category,
      price,
      unit,
      stock,
    };
  }

  private async getOrCreateDefaultLocation(restaurantId: string) {
    let location = await this.prisma.location.findFirst({
      where: { restaurantId, active: true },
    });

    if (!location) {
      location = await this.prisma.location.create({
        data: {
          restaurantId,
          name: 'Main Storage',
          code: 'MAIN',
          active: true,
        },
      });
    }

    return location;
  }

  generateRestaurantInventoryTemplate(): Buffer {
    const headers = [
      'Item Name',
      'SKU',
      'Storage Type',
      'UOM',
      'Quantity',
      'Unit Cost',
      'Description',
      'Min Stock',
      'Max Stock',
      'Reorder Point',
      'Expiry Date',
      'Lot Code',
    ];

    const sampleData = [
      [
        'Fresh Tomatoes',
        'TOM-001',
        'CHILL',
        'each',
        25,
        2.50,
        'Fresh organic tomatoes',
        5,
        50,
        10,
        '2025-02-15',
        'LOT-001',
      ],
      [
        'Organic Lettuce',
        'LET-001',
        'CHILL',
        'each',
        15,
        3.00,
        'Fresh organic lettuce',
        3,
        30,
        8,
        '2025-02-10',
        'LOT-002',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  generateSupplierProductTemplate(): Buffer {
    const headers = [
      'Product Name',
      'SKU',
      'Category',
      'Price',
      'Unit',
      'Stock',
      'Description',
      'Barcode',
      'Image URL',
    ];

    const sampleData = [
      [
        'Fresh Tomatoes',
        'TOM-001',
        'Vegetables',
        2.50,
        'each',
        100,
        'Fresh organic tomatoes',
        '1234567890123',
        'https://example.com/tomatoes.jpg',
      ],
      [
        'Organic Lettuce',
        'LET-001',
        'Vegetables',
        3.00,
        'each',
        50,
        'Fresh organic lettuce',
        '1234567890124',
        'https://example.com/lettuce.jpg',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Template');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
