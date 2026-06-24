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
