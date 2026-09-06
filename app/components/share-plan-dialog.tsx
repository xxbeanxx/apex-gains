import { useState } from 'react';

import { Form } from 'react-router';

import { CheckIcon, CopyIcon, Share2Icon } from 'lucide-react';

import { QrCodeImage } from '~/components/qr-code';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import type { Intent } from '~/lib/intent';
import type { QrCode } from '~/lib/qr';

/**
 * The share link for a plan: the URL to send, the QR code to point a
 * phone at, and the button that takes both away again.
 *
 * Open state is driven by the caller rather than by a trigger, because
 * minting a link is a plain form post that navigates: the action redirects
 * back with `?share`, and the page reopens the dialog on the answer. That
 * also survives the redirect a *sample* plan takes, where the link
 * belongs to the fork the share just created and the browser has to move to
 * its URL first.
 */
export function SharePlanDialog({
  open,
  onOpenChange,
  planName,
  shareUrl,
  qr,
  unshare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  shareUrl: string;
  qr: QrCode;
  unshare: Intent<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {planName}</DialogTitle>
          <DialogDescription>
            Anyone with this link can copy the plan into their own account, along with the workouts and exercises it needs.
            Their copy is theirs — nothing they change comes back to you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl border border-border bg-white p-3">
            <QrCodeImage code={qr} label={`QR code linking to the shared plan ${planName}`} />
          </div>

          <div className="flex w-full items-center gap-2">
            <Input readOnly value={shareUrl} aria-label="Share link" onFocus={(event) => event.currentTarget.select()} />
            <CopyLinkButton url={shareUrl} />
          </div>
        </div>

        <Form method="post" className="flex justify-end">
          <input {...unshare.field} />
          <SubmitButton variant="outline" size="sm" match={unshare.match} pendingLabel="Revoking link">
            <Share2Icon aria-hidden="true" />
            Stop sharing
          </SubmitButton>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Copies the link to the clipboard, and says so for two seconds.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright,
 * so a failure leaves the button alone rather than reporting success - the
 * link is selectable in the field beside it either way.
 */
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="icon" onClick={copy}>
      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      <span className="sr-only">{copied ? 'Link copied' : 'Copy share link'}</span>
    </Button>
  );
}
