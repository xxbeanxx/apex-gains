import { PlusIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useCloseOnSubmit } from '~/components/builder/use-close-on-submit';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';

/**
 * The whole body of a plan or workout builder: palette, canvas, outline.
 *
 * At `md:` and up the palette sits in its own column; below that it moves
 * behind an "Add ..." button and dialog, which closes itself once an add
 * submitted from inside it settles (a `<Form>` transition leaves a
 * controlled dialog open otherwise). The outline shows from `lg:`, where
 * there is room for it; below that a row's own up/down controls are enough
 * to reorder.
 *
 * `rows` are `BuilderRow`s in order, rendered as the canvas's `<ol>`, or
 * `empty` in its place when there are none.
 */
function BuilderFrame({
  palette,
  rows,
  empty,
  outline,
  addLabel,
  addTitle,
}: {
  palette: ReactNode;
  rows: ReactNode[];
  empty: ReactNode;
  outline?: ReactNode;
  /**
   * The mobile trigger's label, "Add day".
   */
  addLabel: string;
  /**
   * The mobile dialog's title, "Add a day".
   */
  addTitle: string;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCloseOnSubmit(() => setPaletteOpen(false));

  return (
    <>
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="mb-4 w-full md:hidden">
            <PlusIcon aria-hidden="true" />
            {addLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="p-0 sm:max-w-sm">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>{addTitle}</DialogTitle>
          </DialogHeader>
          <div className="p-4">{palette}</div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_14rem]">
        <div className="hidden md:sticky md:top-(--header-h) md:block">{palette}</div>
        <div className="min-w-0">{rows.length === 0 ? empty : <ol className="flex flex-col gap-2">{rows}</ol>}</div>
        {outline ? <div className="hidden lg:sticky lg:top-(--header-h) lg:block">{outline}</div> : null}
      </div>
    </>
  );
}

export { BuilderFrame };
