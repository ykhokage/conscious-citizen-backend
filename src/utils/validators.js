import { z } from "zod";

export const registerSchema = z.object({
  login: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "login must be alnum/_"),
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const profileSchema = z.object({
  surname: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  patronymic: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  house: z.string().optional().nullable(),
  flat: z.string().optional().nullable(),
});

export const incidentCreateSchema = z.object({
  category: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1).max(500),
  status: z.enum(["draft", "published"]).optional(),
});

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues?.[0]?.message || "Validation error";
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }
  return r.data;
}
