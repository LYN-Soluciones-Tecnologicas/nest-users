import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceEntity } from './entities/data-source.entity';
import { Tender } from '../tenders/entities/tender.entity';
import { SourceRegistryService } from './services/source-registry.service';
import { IngestionService } from './services/ingestion.service';
import { SourcesController } from './sources.controller';
import { PlacspModule } from './adapters/placsp/placsp.module';
import { PlacspAdapter } from './adapters/placsp/placsp.adapter';
import { PlacspMenoresAdapter } from './adapters/placsp/placsp-menores.adapter';
import { EuskadiModule } from './adapters/euskadi/euskadi.module';
import { EuskadiAdapter } from './adapters/euskadi/euskadi.adapter';
import { CatalunaModule } from './adapters/cataluna/cataluna.module';
import { CatalunaAdapter } from './adapters/cataluna/cataluna.adapter';
import { GaliciaModule } from './adapters/galicia/galicia.module';
import { GaliciaAdapter } from './adapters/galicia/galicia.adapter';
import { DATA_SOURCE_ADAPTERS } from '../common/interfaces/data-source.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([DataSourceEntity, Tender]),
    PlacspModule,
    EuskadiModule,
    CatalunaModule,
    GaliciaModule,
  ],
  controllers: [SourcesController],
  providers: [
    {
      provide: DATA_SOURCE_ADAPTERS,
      useFactory: (
        placsp: PlacspAdapter,
        menores: PlacspMenoresAdapter,
        euskadi: EuskadiAdapter,
        cataluna: CatalunaAdapter,
        galicia: GaliciaAdapter,
      ) => [placsp, menores, euskadi, cataluna, galicia],
      inject: [
        PlacspAdapter,
        PlacspMenoresAdapter,
        EuskadiAdapter,
        CatalunaAdapter,
        GaliciaAdapter,
      ],
    },
    SourceRegistryService,
    IngestionService,
  ],
  exports: [SourceRegistryService, IngestionService],
})
export class SourcesModule {}
