import { Link } from 'react-router';

import { Badge } from '~/components/ui/badge';
import { Avatar } from '~/components/ui/avatar';

type Account = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isSelf: boolean;
};

/**
 * Who an account belongs to, as the dashboard shortlists and the user table
 * both show it: picture, name, email, and the two badges that change what an
 * administrator is allowed to do with the row.
 *
 * The link stretches over its whole table cell (`after:absolute`), so the row
 * is clickable without nesting anything inside the anchor.
 */
function AccountIdentity({ account, stretched = false }: { account: Account; stretched?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={account.name} src={account.avatarUrl} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <Link
            to={`/admin/users/${account.id}`}
            className={stretched ? "font-medium after:absolute after:inset-0 after:content-['']" : 'font-medium'}
          >
            {account.name}
          </Link>
          {account.isAdmin ? <Badge variant="brand-subtle">Admin</Badge> : null}
          {account.isSelf ? <Badge variant="outline">You</Badge> : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">{account.email}</span>
      </span>
    </span>
  );
}

export { AccountIdentity };
