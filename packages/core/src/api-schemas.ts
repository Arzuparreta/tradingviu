import { z } from 'zod';

export const AccessTokenScopeSchema = z.enum(['read', 'write']);
export type AccessTokenScope = z.infer<typeof AccessTokenScopeSchema>;

export const CreateAccessTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(AccessTokenScopeSchema).min(1).max(2).default(['read']),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((value) => value.scopes.includes('read'), {
    path: ['scopes'],
    message: 'Public API tokens must include the read scope',
  });
export type CreateAccessToken = z.infer<typeof CreateAccessTokenSchema>;

export const CreatePublicWatchlistSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreatePublicWatchlist = z.infer<typeof CreatePublicWatchlistSchema>;

export const AddPublicWatchlistItemSchema = z.object({
  symbol: z.string().trim().min(1).max(80),
  note: z.string().trim().max(200).optional(),
  color: z.string().trim().max(20).optional(),
});
export type AddPublicWatchlistItem = z.infer<typeof AddPublicWatchlistItemSchema>;

export const UpdatePublicWatchlistItemSchema = z.object({
  note: z.string().trim().max(200).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
});
export type UpdatePublicWatchlistItem = z.infer<typeof UpdatePublicWatchlistItemSchema>;
