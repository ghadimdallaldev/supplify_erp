import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as ExcelJS from 'exceljs';

/**
 * S3 Service
 * Handles file uploads, downloads, and presigned URLs
 */
@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.bucket = process.env.AWS_S3_BUCKET || 'supplify-uploads';
  }

  /**
   * Generate presigned POST URL for file upload
   */
  async getPresignedUploadUrl(
    supplierId: string,
    fileName: string,
    fileType: string,
  ): Promise<{ uploadUrl: string; fileKey: string }> {
    const fileKey = `catalog/imports/${supplierId}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    return {
      uploadUrl,
      fileKey,
    };
  }

  /**
   * Generate and upload Excel template
   */
  async generateTemplate(format: 'xlsx' | 'csv'): Promise<string> {
    if (format === 'xlsx') {
      return this.generateExcelTemplate();
    } else {
      return this.generateCsvTemplate();
    }
  }

  /**
   * Generate Excel template
   */
  private async generateExcelTemplate(): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns
    worksheet.columns = [
      { header: 'Supplier SKU', key: 'sku', width: 20 },
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Unit', key: 'unit', width: 12 },
      { header: 'Pack Size', key: 'packSize', width: 15 },
      { header: 'Brand', key: 'brand', width: 20 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Min Order Qty', key: 'minOrderQty', width: 15 },
      { header: 'Lead Time (Days)', key: 'leadTimeDays', width: 18 },
      { header: 'Stock Qty', key: 'stockQty', width: 12 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Image URL', key: 'imageUrl', width: 50 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };

    // Add example rows
    worksheet.addRow({
      sku: 'CHK-BR-001',
      name: 'Fresh Chicken Breast',
      category: 'Proteins > Poultry > Chicken',
      unit: 'KG',
      packSize: '2kg',
      brand: 'Premium Farms',
      price: 8.99,
      currency: 'USD',
      minOrderQty: 1,
      leadTimeDays: 2,
      stockQty: 100,
      description: 'Fresh, boneless chicken breast',
      imageUrl: 'https://example.com/chicken.jpg',
    });

    worksheet.addRow({
      sku: 'MLK-WHL-001',
      name: 'Whole Milk',
      category: 'Dairy > Milk',
      unit: 'L',
      packSize: '1L',
      brand: 'Dairy Co',
      price: 2.49,
      currency: 'USD',
      minOrderQty: 6,
      leadTimeDays: 1,
      stockQty: 500,
      description: 'Fresh whole milk',
      imageUrl: '',
    });

    // Add instructions sheet
    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Product Upload Template - Instructions']);
    instructions.addRow([]);
    instructions.addRow(['Required Fields:']);
    instructions.addRow(['- Supplier SKU: Unique identifier for your product']);
    instructions.addRow(['- Product Name: Full product name']);
    instructions.addRow(['- Category: e.g., "Dairy > Cheese" or "Proteins > Seafood"']);
    instructions.addRow(['- Unit: EACH, KG, G, L, ML, CASE, PACK']);
    instructions.addRow(['- Price: Numeric value (e.g., 12.99)']);
    instructions.addRow([]);
    instructions.addRow(['Optional Fields:']);
    instructions.addRow(['- Pack Size: e.g., "6x1L", "2kg"']);
    instructions.addRow(['- Brand: Manufacturer or brand name']);
    instructions.addRow(['- Currency: ISO code (default: USD)']);
    instructions.addRow(['- Min Order Qty: Minimum order quantity (default: 1)']);
    instructions.addRow(['- Lead Time (Days): Delivery lead time (default: 2)']);
    instructions.addRow(['- Stock Qty: Available inventory (default: 0)']);
    instructions.addRow(['- Description: Product description']);
    instructions.addRow(['- Image URL: URL to product image (optional)']);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Upload to S3
    const key = `catalog/templates/product-upload-template-${Date.now()}.xlsx`;
    
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer as Buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    // Return presigned download URL
    const downloadCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, downloadCommand, { expiresIn: 3600 });
  }

  /**
   * Generate CSV template
   */
  private async generateCsvTemplate(): Promise<string> {
    const csvContent = `Supplier SKU,Product Name,Category,Unit,Pack Size,Brand,Price,Currency,Min Order Qty,Lead Time (Days),Stock Qty,Description,Image URL
CHK-BR-001,Fresh Chicken Breast,Proteins > Poultry > Chicken,KG,2kg,Premium Farms,8.99,USD,1,2,100,Fresh boneless chicken breast,https://example.com/chicken.jpg
MLK-WHL-001,Whole Milk,Dairy > Milk,L,1L,Dairy Co,2.49,USD,6,1,500,Fresh whole milk,`;

    const key = `catalog/templates/product-upload-template-${Date.now()}.csv`;
    
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: csvContent,
        ContentType: 'text/csv',
      }),
    );

    const downloadCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, downloadCommand, { expiresIn: 3600 });
  }
}

