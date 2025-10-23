import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

interface ParsedRow {
  rowNumber: number;
  data: {
    sku: string;
    name: string;
    category: string;
    unit: string;
    packSize?: string;
    brand?: string;
    price: number;
    currency?: string;
    minOrderQty?: number;
    leadTimeDays?: number;
    stockQty?: number;
    description?: string;
    imageUrl?: string;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Bulk Upload Service
 * Handles Excel/CSV file parsing and validation
 */
@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private s3Client: S3Client;

  constructor(private prisma: PrismaService) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Create a new product import
   */
  async createImport(supplierId: string, fileKey: string, fileType: string, createdBy: string) {
    const importRecord = await this.prisma.productImport.create({
      data: {
        supplierId,
        fileKey,
        fileType,
        status: 'PENDING',
        createdBy,
      },
    });

    // Trigger validation (would be RMQ message in production)
    this.validateImport(importRecord.id).catch(err => {
      this.logger.error(`Validation failed for import ${importRecord.id}:`, err);
    });

    return importRecord;
  }

  /**
   * Validate import file
   */
  async validateImport(importId: string) {
    const importRecord = await this.prisma.productImport.findUnique({
      where: { id: importId },
    });

    if (!importRecord) {
      throw new Error('Import not found');
    }

    // Update status
    await this.prisma.productImport.update({
      where: { id: importId },
      data: { status: 'VALIDATING' },
    });

    try {
      // Download file from S3
      const fileContent = await this.downloadFromS3(importRecord.fileKey);

      // Parse file
      const rows = importRecord.fileType === 'xlsx'
        ? await this.parseExcel(fileContent)
        : await this.parseCsv(fileContent);

      // Validate each row
      const parsedRows = await this.validateRows(rows, importRecord.supplierId);

      // Save rows to database
      for (const row of parsedRows) {
        await this.prisma.productImportRow.create({
          data: {
            importId,
            rowNumber: row.rowNumber,
            data: row.data as any,
            status: row.errors.length > 0 ? 'INVALID' : 'VALID',
            errors: row.errors.length > 0 ? row.errors : null,
            warnings: row.warnings.length > 0 ? row.warnings : null,
          },
        });
      }

      // Update import with counts
      const validRows = parsedRows.filter(r => r.errors.length === 0).length;
      const invalidRows = parsedRows.filter(r => r.errors.length > 0).length;

      // Generate error report if there are errors
      let errorReportKey = null;
      if (invalidRows > 0) {
        errorReportKey = await this.generateErrorReport(importId, parsedRows.filter(r => r.errors.length > 0));
      }

      await this.prisma.productImport.update({
        where: { id: importId },
        data: {
          status: 'READY',
          totalRows: rows.length,
          validRows,
          invalidRows,
          errorReportKey,
        },
      });

      this.logger.log(`Validation complete for import ${importId}: ${validRows} valid, ${invalidRows} invalid`);
    } catch (error) {
      this.logger.error(`Validation error for import ${importId}:`, error);
      
      await this.prisma.productImport.update({
        where: { id: importId },
        data: {
          status: 'FAILED',
          summary: { error: error.message },
        },
      });
    }
  }

  /**
   * Parse Excel file
   */
  private async parseExcel(buffer: Buffer): Promise<any[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheet found in Excel file');
    }

    const rows: any[] = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Header row
        row.eachCell(cell => {
          headers.push(String(cell.value).trim());
        });
      } else {
        // Data row
        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        rows.push(rowData);
      }
    });

    return rows;
  }

  /**
   * Parse CSV file
   */
  private async parseCsv(buffer: Buffer): Promise<any[]> {
    const content = buffer.toString('utf-8');
    
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records;
  }

  /**
   * Validate rows
   */
  private async validateRows(rows: any[], supplierId: string): Promise<ParsedRow[]> {
    const parsedRows: ParsedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because row 1 is headers and 0-indexed

      const parsed: ParsedRow = {
        rowNumber,
        data: {
          sku: '',
          name: '',
          category: '',
          unit: '',
          price: 0,
        },
        errors: [],
        warnings: [],
      };

      // Extract and validate fields
      try {
        // SKU (required)
        const sku = row['Supplier SKU'] || row['SKU'] || row['sku'];
        if (!sku || String(sku).trim().length === 0) {
          parsed.errors.push('SKU is required');
        } else {
          parsed.data.sku = String(sku).trim();
        }

        // Product Name (required)
        const name = row['Product Name'] || row['Name'] || row['name'];
        if (!name || String(name).trim().length === 0) {
          parsed.errors.push('Product Name is required');
        } else {
          parsed.data.name = String(name).trim();
        }

        // Category (required)
        const category = row['Category'] || row['category'];
        if (!category) {
          parsed.errors.push('Category is required');
        } else {
          parsed.data.category = String(category).trim();
          
          // Validate category exists (fuzzy match)
          const categoryMatch = await this.findCategory(parsed.data.category);
          if (!categoryMatch) {
            parsed.warnings.push(`Category "${parsed.data.category}" not found - will be mapped to closest match`);
          }
        }

        // Unit (required)
        const unit = row['Unit'] || row['unit'];
        if (!unit) {
          parsed.errors.push('Unit is required');
        } else {
          parsed.data.unit = this.normalizeUnit(String(unit));
        }

        // Pack Size (optional)
        const packSize = row['Pack Size'] || row['packSize'];
        if (packSize) {
          parsed.data.packSize = String(packSize).trim();
        }

        // Brand (optional)
        const brand = row['Brand'] || row['brand'];
        if (brand) {
          parsed.data.brand = String(brand).trim();
        }

        // Price (required)
        const price = row['Price'] || row['price'];
        if (!price || isNaN(Number(price)) || Number(price) <= 0) {
          parsed.errors.push('Price must be a positive number');
        } else {
          parsed.data.price = Number(price);
        }

        // Currency (optional)
        const currency = row['Currency'] || row['currency'];
        if (currency) {
          parsed.data.currency = String(currency).toUpperCase().trim();
        }

        // Min Order Qty (optional)
        const minOrderQty = row['Min Order Qty'] || row['minOrderQty'];
        if (minOrderQty) {
          parsed.data.minOrderQty = Math.max(1, parseInt(String(minOrderQty)));
        }

        // Lead Time (optional)
        const leadTimeDays = row['Lead Time (Days)'] || row['leadTimeDays'];
        if (leadTimeDays) {
          parsed.data.leadTimeDays = Math.max(0, parseInt(String(leadTimeDays)));
        }

        // Stock Qty (optional)
        const stockQty = row['Stock Qty'] || row['stockQty'];
        if (stockQty) {
          parsed.data.stockQty = Math.max(0, parseInt(String(stockQty)));
        }

        // Description (optional)
        const description = row['Description'] || row['description'];
        if (description) {
          parsed.data.description = String(description).trim();
        }

        // Image URL (optional)
        const imageUrl = row['Image URL'] || row['imageUrl'];
        if (imageUrl) {
          parsed.data.imageUrl = String(imageUrl).trim();
        }

        // Check for duplicate SKU in this supplier
        const existingProduct = await this.prisma.product.findFirst({
          where: {
            supplierId,
            sku: parsed.data.sku,
          },
        });

        if (existingProduct) {
          parsed.warnings.push(`Product with SKU "${parsed.data.sku}" already exists - will be updated`);
        }

      } catch (error) {
        parsed.errors.push(`Parsing error: ${error.message}`);
      }

      parsedRows.push(parsed);
    }

    return parsedRows;
  }

  /**
   * Normalize unit (handle synonyms)
   */
  private normalizeUnit(unit: string): string {
    const normalized = unit.toUpperCase().trim();
    
    const synonyms: Record<string, string> = {
      'PIECE': 'EACH',
      'PCS': 'EACH',
      'PC': 'EACH',
      'ITEM': 'EACH',
      'KILOGRAM': 'KG',
      'KILO': 'KG',
      'GRAM': 'G',
      'LITER': 'L',
      'LITRE': 'L',
      'MILLILITER': 'ML',
      'MILLILITRE': 'ML',
      'GALLON': 'GAL',
    };

    return synonyms[normalized] || normalized;
  }

  /**
   * Find category by path (fuzzy match)
   */
  private async findCategory(categoryPath: string): Promise<string | null> {
    // Try exact match first
    const exact = await this.prisma.category.findFirst({
      where: {
        OR: [
          { path: categoryPath },
          { name: categoryPath },
        ],
      },
    });

    if (exact) return exact.id;

    // TODO: Implement fuzzy matching
    // For now, return null to trigger warning
    return null;
  }

  /**
   * Download file from S3
   */
  private async downloadFromS3(fileKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'supplify-uploads',
      Key: fileKey,
    });

    const response = await this.s3Client.send(command);
    
    // Convert stream to buffer
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Generate error report CSV
   */
  private async generateErrorReport(importId: string, errorRows: ParsedRow[]): Promise<string> {
    // Create CSV with errors
    const csvLines = [
      'Row Number,SKU,Product Name,Errors',
      ...errorRows.map(row =>
        `${row.rowNumber},"${row.data.sku}","${row.data.name}","${row.errors.join('; ')}"`,
      ),
    ];

    const csv Content = csvLines.join('\n');

    // Upload to S3
    const key = `catalog/imports/${importId}/errors.csv`;
    
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET || 'supplify-uploads',
        Key: key,
        Body: csvContent,
        ContentType: 'text/csv',
      }),
    );

    return key;
  }

  /**
   * Execute import (create products)
   */
  async executeImport(importId: string) {
    const importRecord = await this.prisma.productImport.findUnique({
      where: { id: importId },
      include: {
        rows: {
          where: { status: 'VALID' },
        },
      },
    });

    if (!importRecord) {
      throw new Error('Import not found');
    }

    if (importRecord.status !== 'READY') {
      throw new Error('Import is not ready for execution');
    }

    // Update status
    await this.prisma.productImport.update({
      where: { id: importId },
      data: { status: 'IMPORTING' },
    });

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of importRecord.rows) {
      try {
        const rowData = row.data as any;

        // Find or get category
        let categoryId = await this.findCategory(rowData.category);
        if (!categoryId) {
          // Create "Uncategorized" category or skip
          categoryId = await this.getUncategorizedCategory();
        }

        // Check if product exists
        const existing = await this.prisma.product.findFirst({
          where: {
            supplierId: importRecord.supplierId,
            sku: rowData.sku,
          },
        });

        if (existing) {
          // Update existing product
          await this.prisma.product.update({
            where: { id: existing.id },
            data: {
              name: rowData.name,
              brand: rowData.brand,
              categoryId,
              unit: rowData.unit,
              packSize: rowData.packSize,
              price: rowData.price,
              currency: rowData.currency || 'USD',
              minOrderQty: rowData.minOrderQty || 1,
              leadTimeDays: rowData.leadTimeDays || 2,
              stockQty: rowData.stockQty || 0,
              attributes: rowData.description ? { description: rowData.description } : {},
            },
          });

          await this.prisma.productImportRow.update({
            where: { id: row.id },
            data: { status: 'IMPORTED', productId: existing.id },
          });

          updated++;
        } else {
          // Create new product
          const product = await this.prisma.product.create({
            data: {
              supplierId: importRecord.supplierId,
              sku: rowData.sku,
              name: rowData.name,
              slug: this.generateSlug(rowData.name, rowData.sku),
              brand: rowData.brand,
              categoryId,
              unit: rowData.unit,
              packSize: rowData.packSize,
              price: rowData.price,
              currency: rowData.currency || 'USD',
              minOrderQty: rowData.minOrderQty || 1,
              leadTimeDays: rowData.leadTimeDays || 2,
              stockQty: rowData.stockQty || 0,
              imageKeys: [],
              attributes: rowData.description ? { description: rowData.description } : {},
              active: true,
            },
          });

          await this.prisma.productImportRow.update({
            where: { id: row.id },
            data: { status: 'IMPORTED', productId: product.id },
          });

          imported++;
        }
      } catch (error) {
        this.logger.error(`Error importing row ${row.rowNumber}:`, error);
        
        await this.prisma.productImportRow.update({
          where: { id: row.id },
          data: {
            status: 'SKIPPED',
            errors: [error.message],
          },
        });

        skipped++;
      }
    }

    // Update import status
    await this.prisma.productImport.update({
      where: { id: importId },
      data: {
        status: 'COMPLETED',
        summary: {
          imported,
          updated,
          skipped,
          total: importRecord.totalRows,
        },
      },
    });

    this.logger.log(`Import ${importId} completed: ${imported} created, ${updated} updated, ${skipped} skipped`);

    // TODO: Send email notification
    // TODO: Emit RMQ event: catalog.import.completed

    return {
      imported,
      updated,
      skipped,
    };
  }

  /**
   * Generate slug
   */
  private generateSlug(name: string, sku: string): string {
    const base = slugify(name, { lower: true, strict: true });
    const suffix = sku.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${base}-${suffix}-${Date.now()}`;
  }

  /**
   * Get or create uncategorized category
   */
  private async getUncategorizedCategory(): Promise<string> {
    let category = await this.prisma.category.findFirst({
      where: { slug: 'uncategorized' },
    });

    if (!category) {
      category = await this.prisma.category.create({
        data: {
          name: 'Uncategorized',
          slug: 'uncategorized',
          path: 'Uncategorized',
        },
      });
    }

    return category.id;
  }

  /**
   * Get import details
   */
  async getImport(importId: string) {
    return this.prisma.productImport.findUnique({
      where: { id: importId },
      include: {
        rows: {
          orderBy: { rowNumber: 'asc' },
          take: 100, // Limit for preview
        },
      },
    });
  }

  /**
   * Approve import (admin)
   */
  async approveImport(importId: string, reviewedBy: string) {
    await this.prisma.productImport.update({
      where: { id: importId },
      data: {
        reviewedBy,
        updatedAt: new Date(),
      },
    });

    // Execute import
    return this.executeImport(importId);
  }

  /**
   * Reject import (admin)
   */
  async rejectImport(importId: string, reviewedBy: string, reason?: string) {
    return this.prisma.productImport.update({
      where: { id: importId },
      data: {
        status: 'REJECTED',
        reviewedBy,
        summary: { rejectionReason: reason },
      },
    });
  }
}

