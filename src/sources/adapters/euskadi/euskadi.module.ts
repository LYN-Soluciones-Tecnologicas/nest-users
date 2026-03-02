import { Module } from '@nestjs/common';
import { EuskadiAdapter } from './euskadi.adapter';

@Module({
  providers: [EuskadiAdapter],
  exports: [EuskadiAdapter],
})
export class EuskadiModule {}
