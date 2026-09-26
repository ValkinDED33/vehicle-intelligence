import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  @Length(17, 17)
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i, {
    message: "VIN должен содержать 17 допустимых символов",
  })
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  make?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: "modelYear должен быть четырёхзначным годом",
  })
  modelYear?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/, {
    message: "country должен быть двухбуквенным кодом страны",
  })
  country?: string;
}
