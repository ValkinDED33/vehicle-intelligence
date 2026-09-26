import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateVehicleProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  engineCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  engineFamily?: string;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(20000)
  displacementCc?: number;

  @IsOptional()
  @IsString()
  @IsIn([
    "petrol",
    "diesel",
    "lpg",
    "cng",
    "hybrid",
    "phev",
    "electric",
    "hydrogen",
  ])
  fuelType?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    "naturally-aspirated",
    "turbo",
    "twin-turbo",
    "supercharged",
    "electric",
    "none",
  ])
  aspirationType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  powerKw?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3000)
  powerHp?: number;

  @IsOptional()
  @IsString()
  @IsIn(["manual", "automatic", "dct", "cvt", "single-speed", "other"])
  transmissionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transmissionCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["fwd", "rwd", "awd", "4wd", "other"])
  driveType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  fuelTankCapacityLiters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  adBlueTankCapacityLiters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  batteryGrossCapacityKwh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  batteryUsableCapacityKwh?: number;
}
