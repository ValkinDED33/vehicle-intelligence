import { Module } from "@nestjs/common";
import { GarageModule } from "../garage/garage.module";
import { VehicleProfileModule } from "../vehicle-profile/vehicle-profile.module";
import { VinModule } from "../vin/vin.module";
import { VehicleArtworkController } from "./vehicle-artwork.controller";
import { VehicleArtworkService } from "./vehicle-artwork.service";
import { OpenAiArtworkProvider } from "./openai-artwork.provider";

@Module({ imports: [GarageModule, VehicleProfileModule, VinModule], controllers: [VehicleArtworkController], providers: [VehicleArtworkService, OpenAiArtworkProvider] })
export class VehicleArtworkModule {}
