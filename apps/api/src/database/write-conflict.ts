/** Prisma may expose conflicts through either its client or driver adapter. */
export function isWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as {code?:string;name?:string;cause?:{kind?:string}};
  return value.code === 'P2034' ||
    (value.name === 'DriverAdapterError' && value.cause?.kind === 'TransactionWriteConflict');
}
