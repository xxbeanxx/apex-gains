import { Expose, Transform } from "class-transformer";
import { IsBoolean } from "class-validator";

import { toBoolean } from "./app.config";

/**
 * Off by default - only e2e/CI environments should ever set this. Unlike
 * the other config slices, absence isn't a failure: it just means disabled.
 */
export class TestLoginConfig {
  @Transform(toBoolean())
  @Expose({ name: "ENABLE_TEST_LOGIN" })
  @IsBoolean({ message: "ENABLE_TEST_LOGIN must be true or false" })
  readonly enableTestLogin: boolean = false;
}
