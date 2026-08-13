import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CurrentStockQueryDto {
  @IsString()
  @IsNotEmpty()
  materialCode: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}
