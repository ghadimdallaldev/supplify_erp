import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

export interface BulkUploadResult {
  success: boolean;
  totalRows: number;
  processedRows: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  createdProducts: Array<{
    id: string;
    name: string;
    sku: string;
  }>;
}

export interface ProductUploadRow {
  name: string;
  category: string;
  sku?: string;
  barcode?: string;
  price: number;
  unit: string;
  description?: string;
  supplierId: string;
  supplierProductId?: string;
  vendorUom?: string;
  unitsPerVendorUom?: number;
  leadTimeDays?: number;
  storageType?: 'DRY' | 'CHILL' | 'FREEZE' | 'CHEMICAL';
  allergenFlags?: string[];
  yieldPct?: number;
}

@Injectable()
export class BulkUploadService {
  constructor(private prisma: PrismaService) {}

  /**
   * Process Excel file for bulk product upload
   */
  async processProductUpload(
    fileBuffer: Buffer,
    supplierId: string,
    restaurantId?: string
  ): Promise<BulkUploadResult> {
    try {
      // Parse Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (!data || data.length === 0) {
        throw new BadRequestException('Excel file is empty or invalid');
      }

      return await this.processProductData(data as any[], supplierId, restaurantId);
    } catch (error) {
      throw new BadRequestException(`Failed to process Excel file: ${error.message}`);
    }
  }

  /**
   * Process product data from Excel
   */
  private async processProductData(
    data: any[],
    supplierId: string,
    restaurantId?: string
  ): Promise<BulkUploadResult> {
    const result: BulkUploadResult = {
      success: true,
      totalRows: data.length,
      processedRows: 0,
      errors: [],
      createdProducts: [],
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 because Excel rows start at 1 and we have headers

      try {
        // Validate required fields
        const validationErrors = this.validateProductRow(row, rowNumber);
        if (validationErrors.length > 0) {
          result.errors.push(...validationErrors);
          continue;
        }

        // Create product
        const product = await this.createProductFromRow(row, supplierId, restaurantId);
        
        result.createdProducts.push({
          id: product.id,
          name: product.name,
          sku: product.sku || '',
        });
        
        result.processedRows++;
      } catch (error) {
        result.errors.push({
          row: rowNumber,
          field: 'general',
          message: error.message,
        });
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Validate a product row
   */
  private validateProductRow(row: any, rowNumber: number): Array<{row: number, field: string, message: string}> {
    const errors: Array<{row: number, field: string, message: string}> = [];

    // Required fields
    if (!row.name || typeof row.name !== 'string' || row.name.trim() === '') {
      errors.push({
        row: rowNumber,
        field: 'name',
        message: 'Product name is required',
      });
    }

    if (!row.category || typeof row.category !== 'string' || row.category.trim() === '') {
      errors.push({
        row: rowNumber,
        field: 'category',
        message: 'Category is required',
      });
    }

    if (!row.price || isNaN(parseFloat(row.price)) || parseFloat(row.price) <= 0) {
      errors.push({
        row: rowNumber,
        field: 'price',
        message: 'Valid price is required',
      });
    }

    if (!row.unit || typeof row.unit !== 'string' || row.unit.trim() === '') {
      errors.push({
        row: rowNumber,
        field: 'unit',
        message: 'Unit is required',
      });
    }

    if (!row.supplierId || typeof row.supplierId !== 'string' || row.supplierId.trim() === '') {
      errors.push({
        row: rowNumber,
        field: 'supplierId',
        message: 'Supplier ID is required',
      });
    }

    // Optional field validations
    if (row.sku && typeof row.sku !== 'string') {
      errors.push({
        row: rowNumber,
        field: 'sku',
        message: 'SKU must be a string',
      });
    }

    if (row.barcode && typeof row.barcode !== 'string') {
      errors.push({
        row: rowNumber,
        field: 'barcode',
        message: 'Barcode must be a string',
      });
    }

    if (row.storageType && !['DRY', 'CHILL', 'FREEZE', 'CHEMICAL'].includes(row.storageType)) {
      errors.push({
        row: rowNumber,
        field: 'storageType',
        message: 'Storage type must be one of: DRY, CHILL, FREEZE, CHEMICAL',
      });
    }

    if (row.yieldPct && (isNaN(parseFloat(row.yieldPct)) || parseFloat(row.yieldPct) < 0 || parseFloat(row.yieldPct) > 100)) {
      errors.push({
        row: rowNumber,
        field: 'yieldPct',
        message: 'Yield percentage must be between 0 and 100',
      });
    }

    return errors;
  }

  /**
   * Create product from validated row
   */
  private async createProductFromRow(
    row: any,
    supplierId: string,
    restaurantId?: string
  ): Promise<any> {
    // Create or find category
    let category = await this.prisma.category.findFirst({
      where: {
        name: row.category,
        ...(restaurantId && { restaurantId }),
      },
    });

    if (!category) {
      category = await this.prisma.category.create({
        data: {
          name: row.category,
          description: `Category for ${row.category}`,
          restaurantId: restaurantId || 'default',
        },
      });
    }

    // Create product
    const product = await this.prisma.product.create({
      data: {
        name: row.name.trim(),
        categoryId: category.id,
        sku: row.sku?.trim() || null,
        barcode: row.barcode?.trim() || null,
        price: parseFloat(row.price),
        unit: row.unit.trim(),
        description: row.description?.trim() || null,
        supplierId,
        supplierProductId: row.supplierProductId?.trim() || null,
        vendorUom: row.vendorUom?.trim() || row.unit.trim(),
        unitsPerVendorUom: row.unitsPerVendorUom ? parseFloat(row.unitsPerVendorUom) : 1,
        leadTimeDays: row.leadTimeDays ? parseInt(row.leadTimeDays) : null,
        storageType: row.storageType || 'DRY',
        allergenFlags: row.allergenFlags ? row.allergenFlags.split(',').map((f: string) => f.trim()) : [],
        yieldPct: row.yieldPct ? parseFloat(row.yieldPct) : null,
        active: true,
      },
    });

    return product;
  }

  /**
   * Generate Excel template for product upload
   */
  generateProductTemplate(): Buffer {
    const template = [
      {
        name: 'Fresh Chicken Breast',
        category: 'Meat & Poultry',
        sku: 'CHK-001',
        barcode: '1234567890123',
        price: 12.99,
        unit: 'per kg',
        description: 'Fresh chicken breast',
        supplierId: 'fresh-foods',
        supplierProductId: 'FF-CHK-001',
        vendorUom: 'case',
        unitsPerVendorUom: 12,
        leadTimeDays: 2,
        storageType: 'CHILL',
        allergenFlags: 'none',
        yieldPct: 85,
      },
      {
        name: 'Organic Milk',
        category: 'Dairy',
        sku: 'MLK-001',
        barcode: '1234567890124',
        price: 4.50,
        unit: 'per liter',
        description: 'Organic whole milk',
        supplierId: 'fresh-foods',
        supplierProductId: 'FF-MLK-001',
        vendorUom: 'case',
        unitsPerVendorUom: 24,
        leadTimeDays: 1,
        storageType: 'CHILL',
        allergenFlags: 'dairy',
        yieldPct: 100,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Get upload history for a supplier
   */
  async getUploadHistory(supplierId: string, limit = 10) {
    // This would typically be stored in a separate uploads table
    // For now, we'll return a mock response
    return {
      uploads: [],
      total: 0,
    };
  }
}
