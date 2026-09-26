import { Module } from "@nestjs/common";

import { GarageModule } from "../garage/garage.module";
import { MileageModule } from "../mileage/mileage.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";

import { ExternalReportsController } from "./controllers/external-reports.controller";
import { ExternalReportsDbService } from "./external-reports.db.service";
import {
  SOURCE_NORMALIZERS,
  SourceNormalizationService,
} from "./normalization/source-normalization.service";
import { EuropeVinNormalizer } from "./normalization/normalizers/europe-vin.normalizer";
import { TitleCheckNormalizer } from "./normalization/normalizers/title-check.normalizer";
import { SalesHistoryNormalizer } from "./normalization/normalizers/sales-history.normalizer";
import { AuctionNormalizer } from "./normalization/normalizers/auction.normalizer";
import { MarketValueNormalizer } from "./normalization/normalizers/market-value.normalizer";
import { VehicleRecallsNormalizer } from "./normalization/normalizers/vehicle-recalls.normalizer";
import { StolenCheckNormalizer } from "./normalization/normalizers/stolen-check.normalizer";
import { BasicVinDecodeNormalizer } from "./normalization/normalizers/basic-vin-decode.normalizer";
import { AdvancedVinDecodeNormalizer } from "./normalization/normalizers/advanced-vin-decode.normalizer";
import { VinSuggestionNormalizer } from "./normalization/normalizers/vin-suggestion.normalizer";
import { VehicleDatabasesHistoryProvider } from "./providers/vehicle-history/vehicle-databases-history.provider";
import { VEHICLE_HISTORY_PROVIDER_TOKEN } from "./providers/vehicle-history/vehicle-history-provider.interface";
import { ExternalReportsService } from "./services/external-reports.service";
import { VehicleDatabasesSourcesService } from "./services/vehicle-databases-sources.service";

@Module({
  imports: [
    GarageModule,
    VehicleProfileModule,
    VehicleHistoryModule,
    MileageModule,
  ],
  controllers: [
    ExternalReportsController,
  ],
  providers: [
    ExternalReportsDbService,
    ExternalReportsService,

    VehicleDatabasesHistoryProvider,
    VehicleDatabasesSourcesService,

    EuropeVinNormalizer,
    TitleCheckNormalizer,
    SalesHistoryNormalizer,
    AuctionNormalizer,
    MarketValueNormalizer,
    VehicleRecallsNormalizer,
    StolenCheckNormalizer,
    BasicVinDecodeNormalizer,
    AdvancedVinDecodeNormalizer,
    VinSuggestionNormalizer,

    {
      provide: SOURCE_NORMALIZERS,
      useFactory: (
        europeVin: EuropeVinNormalizer,
        titleCheck: TitleCheckNormalizer,
        salesHistory: SalesHistoryNormalizer,
        auction: AuctionNormalizer,
        marketValue: MarketValueNormalizer,
        vehicleRecalls: VehicleRecallsNormalizer,
        stolenCheck: StolenCheckNormalizer,
        basicVin: BasicVinDecodeNormalizer,
        advancedVin: AdvancedVinDecodeNormalizer,
        vinSuggestion: VinSuggestionNormalizer,
      ) => [
        europeVin,
        titleCheck,
        salesHistory,
        auction,
        marketValue,
        vehicleRecalls,
        stolenCheck,
        basicVin,
        advancedVin,
        vinSuggestion,
      ],
      inject: [
        EuropeVinNormalizer,
        TitleCheckNormalizer,
        SalesHistoryNormalizer,
        AuctionNormalizer,
        MarketValueNormalizer,
        VehicleRecallsNormalizer,
        StolenCheckNormalizer,
        BasicVinDecodeNormalizer,
        AdvancedVinDecodeNormalizer,
        VinSuggestionNormalizer,
      ],
    },

    SourceNormalizationService,

    {
      provide: VEHICLE_HISTORY_PROVIDER_TOKEN,
      useExisting: VehicleDatabasesHistoryProvider,
    },
  ],
  exports: [
    ExternalReportsDbService,
    ExternalReportsService,
    VEHICLE_HISTORY_PROVIDER_TOKEN,
  ],
})
export class ExternalReportsModule {}
