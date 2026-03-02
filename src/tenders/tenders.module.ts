import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tender } from './entities/tender.entity';
import { TendersService } from './services/tenders.service';
import { TendersController } from './tenders.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tender])],
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
