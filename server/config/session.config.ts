import { Expose } from "class-transformer";
import { IsString, MinLength } from "class-validator";

export class SessionConfig {
  @Expose({ name: "SESSION_SECRET" })
  @IsString({ message: "SESSION_SECRET must be set" })
  @MinLength(1, { message: "SESSION_SECRET must be set" })
  readonly sessionSecret!: string;
}
