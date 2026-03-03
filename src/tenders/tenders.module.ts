import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tender } from './entities/tender.entity';
import { TendersService } from './services/tenders.service';
import { OcdsExportService } from './services/ocds-export.service';
import { TendersController } from './tenders.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tender])],
  controllers: [TendersController],
  providers: [TendersService, OcdsExportService],
  exports: [TendersService, OcdsExportService],
})
export class TendersModule {}
