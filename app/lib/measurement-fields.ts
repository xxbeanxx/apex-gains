import { Expose, Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';

import { toOptionalNumber } from '~/lib/validate-form';
import type { MeasurementInput } from '~application/shared/measurement-values';

/**
 * The measurement fields a logged set's form posts, validated - blank is
 * absent, anything else a positive number, the counts whole.
 *
 * The property names are `MeasurementValues`' keys, so a validated DTO is
 * already the use case's input and a route hands it straight over. Extend it
 * with a form's own fields rather than restating these.
 */
export class MeasurementFieldsDto implements Omit<MeasurementInput, 'sets' | 'restSeconds'> {
  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly reps?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly weight?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly durationMinutes?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly speed?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly resistance?: number;
}

/**
 * A target's fields: a set's, plus how many sets and how long to rest.
 */
export class TargetFieldsDto extends MeasurementFieldsDto implements MeasurementInput {
  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly sets?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly restSeconds?: number;
}
