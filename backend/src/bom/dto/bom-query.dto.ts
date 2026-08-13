import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BomQueryDto {
  @IsString()
  @IsNotEmpty()
  materialCode: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}
