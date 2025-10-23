import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { InvoicesController } from '../invoices/invoices.controller';
import { PdfService } from './pdf.service';

@Module({
  providers: [InvoicingService, PdfService],
  controllers: [InvoicingController, InvoicesController],
  exports: [InvoicingService],
})
export class InvoicingModule {}

