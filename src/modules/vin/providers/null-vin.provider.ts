import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import {
  type VinDecodeResult,
  type VinProvider,
} from "./vin-provider.interface";

@Injectable()
export class NullVinProvider implements VinProvider {
  async decode(_vin: string): Promise<VinDecodeResult> {
    throw new ServiceUnavailableException("VIN provider is not configured");
  }
}
