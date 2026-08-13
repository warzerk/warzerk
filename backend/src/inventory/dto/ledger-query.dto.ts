import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class LedgerQueryDto extends PaginationDto {
  @IsString()
  @IsNotEmpty()
  materialCode: string;

  @IsOptional()
  @IsString()
  warehouseCode?: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}
