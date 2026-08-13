import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/pagination.dto';

export class MaterialOrdersQueryDto extends PaginationDto {
  @IsString()
  @IsNotEmpty()
  materialCode: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}
