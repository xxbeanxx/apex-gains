import { registerAs } from '@nestjs/config';
import { Expose } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

import { validateConfigSlice } from './validate';

/** Google OIDC client credentials, used to build/validate the OIDC flow. */
export class GoogleOAuthConfig {
  @Expose({ name: 'GOOGLE_CLIENT_ID' })
  @IsString({ message: 'GOOGLE_CLIENT_ID must be set' })
  @MinLength(1, { message: 'GOOGLE_CLIENT_ID must be set' })
  readonly googleClientId!: string;

  @Expose({ name: 'GOOGLE_CLIENT_SECRET' })
  @IsString({ message: 'GOOGLE_CLIENT_SECRET must be set' })
  @MinLength(1, { message: 'GOOGLE_CLIENT_SECRET must be set' })
  readonly googleClientSecret!: string;
}

export const googleOAuthConfig = registerAs('googleOAuthConfig', () => validateConfigSlice(GoogleOAuthConfig, process.env));
