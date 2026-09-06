import { LOG_LEVELS, type LogLevel } from '@nestjs/common';
import { registerAs } from '@nestjs/config';
import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { toNumber, validateConfigSlice } from '~server/config/validate';

/**
 * General runtime config: which mode we're in, what port to listen on, and
 * how much the logger should print.
 */
export class CoreConfig {
  @Expose({ name: 'NODE_ENV' })
  @IsIn(['development', 'production', 'test'], { message: 'NODE_ENV must be one of: development, production, test' })
  readonly nodeEnv: 'development' | 'production' | 'test' = 'development';

  @Transform(toNumber())
  @Expose({ name: 'PORT' })
  @IsInt({ message: 'PORT must be an integer' })
  @Min(1, { message: 'PORT must be >= 1' })
  @Max(65535, { message: 'PORT must be <= 65535' })
  readonly port: number = 3000;

  /**
   * The least severe level to print; everything above it is printed too.
   * These are Nest's level names - note "log" where other loggers say
   * "info", and "verbose" where they say "trace".
   */
  @Expose({ name: 'LOG_LEVEL' })
  @IsIn(LOG_LEVELS, { message: `LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}` })
  readonly logLevel: LogLevel = 'log';

  /**
   * Optional bind address override - unset binds to every interface.
   */
  @IsOptional()
  @Expose({ name: 'HOST' })
  @IsString({ message: 'HOST must be a string' })
  readonly host?: string;

  /**
   * Number of reverse-proxy hops in front of the app whose
   * `X-Forwarded-*` headers Express should trust - see `server.set('trust
   * proxy', ...)` in `server/main.ts`. Defaults to 0 (trust none), matching
   * Express's own default for a server reached directly. Azure Container
   * Apps puts exactly one hop (its ingress) in front of the app, so the
   * deployed instance sets this to 1.
   */
  @Transform(toNumber())
  @Expose({ name: 'TRUST_PROXY' })
  @IsInt({ message: 'TRUST_PROXY must be an integer' })
  @Min(0, { message: 'TRUST_PROXY must be >= 0' })
  readonly trustProxy: number = 0;
}

/**
 * Each config slice is its own namespaced loader, so a module injects only
 * the piece it needs - `RepositoriesModule` sees `databaseConfig.KEY` and
 * has no reason to see session or OAuth secrets. Every loader listed here
 * must also appear in `AppModule`'s `ConfigModule.forRoot({ load })`: that
 * array is what turns a `registerAs()` factory into an injectable token.
 */
export const coreConfig = registerAs('coreConfig', () => validateConfigSlice(CoreConfig, process.env));
