import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RepositoriesModule } from "../repositories/repositories.module";
import { ServicesModule } from "../services/services.module";
import { LoadContextProvider } from "./load-context.provider";

@Module({
  imports: [AuthModule, RepositoriesModule, ServicesModule],
  providers: [LoadContextProvider],
  exports: [LoadContextProvider],
})
export class ReactRouterModule {}
