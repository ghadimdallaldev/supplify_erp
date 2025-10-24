import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { InvoicesController } from '../invoices/invoices.controller';
import { InvoicesService } from '../invoices/invoices.service';
import { PdfService } from './pdf.service';

@Module({
  providers: [InvoicingService, InvoicesService, PdfService],
  controllers: [InvoicingController, InvoicesController],
  exports: [InvoicingService, InvoicesService],
})
export class InvoicingModule {}

