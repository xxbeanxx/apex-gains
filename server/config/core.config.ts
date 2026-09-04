import { Expose, Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { toNumber } from "./app.config";

/**
 * General runtime config: which mode we're in, what port to listen on, and
 * how verbose the pino request logger (`app/lib/logger.server.ts`) should
 * be.
 */
export class CoreConfig {
  @Expose({ name: "NODE_ENV" })
  @IsIn(["development", "production", "test"], {
    message: "NODE_ENV must be one of: development, production, test",
  })
  readonly nodeEnv: "development" | "production" | "test" = "development";

  @Transform(toNumber())
  @Expose({ name: "PORT" })
  @IsInt({ message: "PORT must be an integer" })
  @Min(1, { message: "PORT must be >= 1" })
  @Max(65535, { message: "PORT must be <= 65535" })
  readonly port: number = 3000;

  @Expose({ name: "LOG_LEVEL" })
  @IsString({ message: "LOG_LEVEL must be a string" })
  readonly logLevel: string = "info";

  /** Optional bind address override - unset binds to every interface. */
  @Expose({ name: "HOST" })
  @IsOptional()
  @IsString({ message: "HOST must be a string" })
  readonly host?: string;
}
