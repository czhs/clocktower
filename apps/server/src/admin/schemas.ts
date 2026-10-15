import { z } from 'zod';
import { DisplayName } from '@ct/protocol';

// Admin console request validation (server-side; every route is also admin-gated).
// CONTRACT-REQUEST (lead): these request schemas and the response types in ./types.ts could move
// to packages/protocol/src/admin.ts so the client shares them (the client keeps a mirror today).

/** Account ids are randomId(16); accept a little slack for older/test ids, never wildcards. */
export const AccountId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'invalid account id');
export const LobbyId = z.string().regex(/^[A-Za-z0-9_-]{4,32}$/, 'invalid lobby id');

export const AccountListQuery = z.object({
  q: z.string().max(64).default('').transform((s) => s.trim()),
  match: z.enum(['contains', 'prefix']).default('contains'),
  sort: z.enum(['created', 'lastSeen', 'name', 'games']).default('created'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().min(1).optional(),
});

/** Actions on your own account need an explicit confirmation flag (the UI asks first). */
export const ConfirmSelfBody = z.object({ confirmSelf: z.boolean().optional() }).strict();
export const RenameBody = z.object({ displayName: DisplayName, confirmSelf: z.boolean().optional() }).strict();
export const DeleteBody = z.object({ confirm: z.literal('delete') }).strict();
export const BulkDeleteBody = z
  .object({ ids: z.array(AccountId).min(1).max(200), confirm: z.literal('delete') })
  .strict();
export const EmptyBody = z.object({}).strict();
