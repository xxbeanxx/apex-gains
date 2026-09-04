import { Expose, Transform } from "class-transformer";
import { IsString, MinLength } from "class-validator";

/**
 * Google OIDC credentials, plus the base URL the app is served from
 * (`ORIGIN`) - it's grouped here rather than in `core.config.ts` because
 * its only consumer is building/validating the OIDC `redirect_uri` (see
 * `server/auth/oidc-client.provider.ts` and the routes under
 * `app/routes/auth.*`).
 */
export class GoogleOAuthConfig {
  @Expose({ name: "GOOGLE_CLIENT_ID" })
  @IsString({ message: "GOOGLE_CLIENT_ID must be set" })
  @MinLength(1, { message: "GOOGLE_CLIENT_ID must be set" })
  readonly googleClientId!: string;

  @Expose({ name: "GOOGLE_CLIENT_SECRET" })
  @IsString({ message: "GOOGLE_CLIENT_SECRET must be set" })
  @MinLength(1, { message: "GOOGLE_CLIENT_SECRET must be set" })
  readonly googleClientSecret!: string;

  // Strips trailing slashes, same as the old `getOrigin()` did - callers
  // build URLs like `${origin}/auth/google/callback`.
  @Transform(({ value }: { value: unknown }) =>
    String(value).replace(/\/+$/, ""),
  )
  @Expose({ name: "ORIGIN" })
  @IsString({ message: "ORIGIN must be set" })
  @MinLength(1, { message: "ORIGIN must be set" })
  readonly origin!: string;
}
