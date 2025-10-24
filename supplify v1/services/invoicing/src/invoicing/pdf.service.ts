import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as AWS from 'aws-sdk';
import { Readable } from 'stream';

/**
 * PDF Generation Service
 * Creates professional invoice PDFs
 */
@Injectable()
export class PdfService {
  private s3: AWS.S3;

  constructor() {
    this.s3 = new AWS.S3({
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      s3ForcePathStyle: true,
    });
  }

  async generateInvoicePDF(invoice: any, template: any): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(chunks);
        const key = `invoices/${invoice.supplierId}/${invoice.invoiceNumber}.pdf`;

        try {
          await this.s3.putObject({
            Bucket: process.env.AWS_BUCKET || 'supplify-invoices',
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
          }).promise();

          const url = `${process.env.AWS_ENDPOINT}/${process.env.AWS_BUCKET}/${key}`;
          resolve(url);
        } catch (error) {
          reject(error);
        }
      });

      // Header
      doc.fontSize(24).fillColor(template?.primaryColor || '#3B82F6').text('INVOICE', 50, 50);
      
      doc.fontSize(10).fillColor('#000')
        .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 60)
        .text(`Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, 400, 75)
        .text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, 400, 90);

      // Supplier info
      doc.fontSize(12).text('From:', 50, 120);
      doc.fontSize(10).text(`Supplier ID: ${invoice.supplierId}`, 50, 140);

      // Restaurant info
      doc.fontSize(12).text('Bill To:', 50, 180);
      doc.fontSize(10).text(`Restaurant ID: ${invoice.restaurantId}`, 50, 200);

      // Table header
      const tableTop = 260;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Description', 50, tableTop);
      doc.text('Qty', 280, tableTop);
      doc.text('Price', 350, tableTop);
      doc.text('Total', 450, tableTop);

      // Items
      doc.font('Helvetica');
      let yPos = tableTop + 20;
      invoice.items.forEach((item: any) => {
        doc.text(item.description, 50, yPos);
        doc.text(item.quantity.toString(), 280, yPos);
        doc.text(`$${item.unitPrice}`, 350, yPos);
        doc.text(`$${item.total}`, 450, yPos);
        yPos += 20;
      });

      // Totals
      yPos += 20;
      doc.text(`Subtotal: $${invoice.subtotal}`, 350, yPos);
      yPos += 20;
      doc.text(`Tax: $${invoice.taxAmount}`, 350, yPos);
      yPos += 20;
      if (invoice.discountAmount > 0) {
        doc.text(`Discount: -$${invoice.discountAmount}`, 350, yPos);
        yPos += 20;
      }
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total: $${invoice.total}`, 350, yPos);

      // Footer
      if (template?.footer) {
        doc.fontSize(8).font('Helvetica').text(template.footer, 50, 700, { align: 'center' });
      }

      doc.end();
    });
  }
}

