import { ArgumentMetadata, BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class UuidRouteParamsPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const name = metadata.data;

    if (metadata.type !== "param" || typeof value !== "string" || !name) {
      return value;
    }

    if (name !== "id" && !name.endsWith("Id")) {
      return value;
    }

    if (!UUID_RE.test(value)) {
      throw new BadRequestException(`Некорректный идентификатор: ${name}`);
    }

    return value;
  }
}
