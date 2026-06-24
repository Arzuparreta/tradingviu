import { z } from 'zod';

export const IdeaDirectionSchema = z.enum(['long', 'short', 'neutral']);
export type IdeaDirection = z.infer<typeof IdeaDirectionSchema>;

export const IdeaVisibilitySchema = z.enum(['public', 'private']);
export type IdeaVisibility = z.infer<typeof IdeaVisibilitySchema>;

export const IdeasQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(80).optional(),
  author: z.string().trim().min(1).max(80).optional(),
  direction: IdeaDirectionSchema.optional(),
  visibility: IdeaVisibilitySchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type IdeasQuery = z.infer<typeof IdeasQuerySchema>;

export const CreateIdeaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(20_000).optional(),
  symbol: z.string().trim().min(1).max(80).optional(),
  direction: IdeaDirectionSchema.optional(),
  visibility: IdeaVisibilitySchema.default('public'),
  snapshotUrl: z.string().trim().url().max(2048).optional(),
});
export type CreateIdea = z.infer<typeof CreateIdeaSchema>;

export const UpdateIdeaSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  direction: IdeaDirectionSchema.optional(),
  visibility: IdeaVisibilitySchema.optional(),
  snapshotUrl: z.string().trim().url().max(2048).optional(),
});
export type UpdateIdea = z.infer<typeof UpdateIdeaSchema>;

export const CreateCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentId: z.string().trim().min(1).max(40).optional(),
});
export type CreateComment = z.infer<typeof CreateCommentSchema>;

// Marketplace scripts.
// public   → open-source, source readable by anyone in the tenant
// protected → closed-source, listed + installable, source hidden from non-authors
// private   → only the author can see or install it
export const ScriptVisibilitySchema = z.enum(['public', 'protected', 'private']);
export type ScriptVisibility = z.infer<typeof ScriptVisibilitySchema>;

export const ScriptsSortSchema = z.enum(['recent', 'popular']);
export type ScriptsSort = z.infer<typeof ScriptsSortSchema>;

export const ScriptsQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  author: z.string().trim().min(1).max(80).optional(),
  visibility: ScriptVisibilitySchema.optional(),
  free: z.coerce.boolean().optional(),
  sort: ScriptsSortSchema.default('recent'),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type ScriptsQuery = z.infer<typeof ScriptsQuerySchema>;

export const PublishScriptSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000).optional(),
  source: z.string().trim().min(1).max(100_000),
  visibility: ScriptVisibilitySchema.default('public'),
  license: z.string().trim().min(1).max(80).default('AGPL-3.0'),
  priceCents: z.coerce.number().int().min(0).max(10_000_00).default(0),
});
export type PublishScript = z.infer<typeof PublishScriptSchema>;

export const UpdateScriptSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  source: z.string().trim().min(1).max(100_000).optional(),
  visibility: ScriptVisibilitySchema.optional(),
  license: z.string().trim().min(1).max(80).optional(),
  priceCents: z.coerce.number().int().min(0).max(10_000_00).optional(),
});
export type UpdateScript = z.infer<typeof UpdateScriptSchema>;

// Subscription channels ("Spaces").
// public  → listed in the tenant feed
// private → unlisted; reachable (and subscribable) only by direct id (invite link)
export const SpaceVisibilitySchema = z.enum(['public', 'private']);
export type SpaceVisibility = z.infer<typeof SpaceVisibilitySchema>;

export const SpacesSortSchema = z.enum(['recent', 'popular']);
export type SpacesSort = z.infer<typeof SpacesSortSchema>;

export const SpacesQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  owner: z.string().trim().min(1).max(80).optional(),
  free: z.coerce.boolean().optional(),
  subscribed: z.coerce.boolean().optional(),
  sort: SpacesSortSchema.default('recent'),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type SpacesQuery = z.infer<typeof SpacesQuerySchema>;

export const CreateSpaceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000).optional(),
  visibility: SpaceVisibilitySchema.default('public'),
  priceCents: z.coerce.number().int().min(0).max(10_000_00).default(0),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
});
export type CreateSpace = z.infer<typeof CreateSpaceSchema>;

export const UpdateSpaceSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  visibility: SpaceVisibilitySchema.optional(),
  priceCents: z.coerce.number().int().min(0).max(10_000_00).optional(),
});
export type UpdateSpace = z.infer<typeof UpdateSpaceSchema>;

export const CreateSpacePostSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(20_000),
});
export type CreateSpacePost = z.infer<typeof CreateSpacePostSchema>;
