import { registerAs } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

import { validateConfigSlice } from './validate';

/**
 * `DATABASE_URL` is the one env var that's optional by design: unset, the
 * app runs entirely on the in-memory repository adapters (local dev without
 * depending on Supabase). `server/repositories/repositories.module.ts` is
 * what actually branches on `databaseUrl` being present.
 */
export class DatabaseConfig {
  @Expose({ name: 'DATABASE_URL' })
  @IsOptional()
  @IsString({ message: 'DATABASE_URL must be a string' })
  readonly databaseUrl?: string;
}

export const databaseConfig = registerAs('databaseConfig', () => validateConfigSlice(DatabaseConfig, process.env));
