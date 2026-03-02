import { Module } from '@nestjs/common';
import { PlacspAdapter } from './placsp.adapter';
import { PlacspMenoresAdapter } from './placsp-menores.adapter';

@Module({
  providers: [PlacspAdapter, PlacspMenoresAdapter],
  exports: [PlacspAdapter, PlacspMenoresAdapter],
})
export class PlacspModule {}
