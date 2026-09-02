import { createContext } from "react-router";

import type { User } from "~/db/schema";

export const userContext = createContext<User | null>(null);
