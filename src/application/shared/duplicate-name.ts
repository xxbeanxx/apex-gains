/**
 * The name a duplicate takes, so a workout or plan library never ends up
 * with two rows named identically: "<name> (copy)", then "(copy 2)",
 * "(copy 3)"… against whatever the athlete's own list already holds.
 */
export function nextCopyName(name: string, existingNames: ReadonlySet<string>): string {
  const first = `${name} (copy)`;
  if (!existingNames.has(first)) return first;

  let n = 2;
  while (existingNames.has(`${name} (copy ${n})`)) n++;
  return `${name} (copy ${n})`;
}
