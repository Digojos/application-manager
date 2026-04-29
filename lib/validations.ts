import { z } from "zod";

const pathRegex = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const miniAppSchema = z.object({
  title: z
    .string()
    .min(2, "Título deve ter ao menos 2 caracteres")
    .max(100, "Título deve ter no máximo 100 caracteres")
    .trim(),
  path: z
    .string()
    .regex(pathRegex, "Path inválido. Use o formato /slug-da-rota (apenas letras minúsculas, números e hífens)")
    .max(100, "Path deve ter no máximo 100 caracteres"),
  description: z
    .string()
    .min(5, "Descrição deve ter ao menos 5 caracteres")
    .max(1000, "Descrição deve ter no máximo 1000 caracteres")
    .trim(),
  active: z.boolean(),
});

export const miniAppUpdateSchema = miniAppSchema.partial().extend({
  title: z
    .string()
    .min(2, "Título deve ter ao menos 2 caracteres")
    .max(100, "Título deve ter no máximo 100 caracteres")
    .trim()
    .optional(),
});

export type MiniAppInput = z.infer<typeof miniAppSchema>;
export type MiniAppUpdateInput = z.infer<typeof miniAppUpdateSchema>;
