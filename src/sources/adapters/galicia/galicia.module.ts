import { Module } from '@nestjs/common';
import { GaliciaAdapter } from './galicia.adapter';

@Module({
  providers: [GaliciaAdapter],
  exports: [GaliciaAdapter],
})
export class GaliciaModule {}
