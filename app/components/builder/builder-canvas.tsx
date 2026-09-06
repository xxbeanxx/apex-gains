import type { ReactNode } from 'react';
import type * as React from 'react';

import { cn } from '~/lib/utils';

/** The centre column: an ordered list of rows, each a `BuilderRow`. */
function BuilderCanvas({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn('flex flex-col gap-2', className)}>{children}</ol>;
}

export { BuilderCanvas };
