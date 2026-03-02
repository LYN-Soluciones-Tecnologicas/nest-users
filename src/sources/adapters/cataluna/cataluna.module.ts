import { Module } from '@nestjs/common';
import { CatalunaAdapter } from './cataluna.adapter';

@Module({
  providers: [CatalunaAdapter],
  exports: [CatalunaAdapter],
})
export class CatalunaModule {}
