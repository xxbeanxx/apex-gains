import { registerAs } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

import { validateConfigSlice } from '~server/config/validate';

export class SessionConfig {
  @Expose({ name: 'SESSION_SECRET' })
  @IsString({ message: 'SESSION_SECRET must be set' })
  @MinLength(1, { message: 'SESSION_SECRET must be set' })
  readonly sessionSecret!: string;
}

export const sessionConfig = registerAs('sessionConfig', () => validateConfigSlice(SessionConfig, process.env));
