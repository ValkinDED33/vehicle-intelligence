import { Module } from "@nestjs/common";

import { OBJECT_STORAGE } from "./object-storage.constants";
import { BackblazeB2Provider } from "./providers/backblaze-b2.provider";

@Module({
  providers: [
    BackblazeB2Provider,

    {
      provide: OBJECT_STORAGE,
      useExisting: BackblazeB2Provider,
    },
  ],

  exports: [OBJECT_STORAGE],
})
export class ObjectStorageModule {}
