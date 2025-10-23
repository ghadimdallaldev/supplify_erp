import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { MovementsService } from './movements.service';
import {
  ReceiveStockDto,
  IssueStockDto,
  TransferStockDto,
  WasteStockDto,
  AdjustStockDto,
} from './dto/movement.dto';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Post('receive')
  receiveStock(@Body() dto: ReceiveStockDto) {
    return this.movementsService.receiveStock(dto);
  }

  @Post('issue')
  issueStock(@Body() dto: IssueStockDto) {
    return this.movementsService.issueStock(dto);
  }

  @Post('transfer')
  transferStock(@Body() dto: TransferStockDto) {
    return this.movementsService.transferStock(dto);
  }

  @Post('waste')
  wasteStock(@Body() dto: WasteStockDto) {
    return this.movementsService.wasteStock(dto);
  }

  @Post('adjust')
  adjustStock(@Body() dto: AdjustStockDto) {
    return this.movementsService.adjustStock(dto);
  }
}

