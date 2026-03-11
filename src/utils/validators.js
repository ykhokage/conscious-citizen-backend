import { z } from "zod";

// Логин:
// - минимум 5 символов
// - максимум 30
// - только английские буквы, цифры, _ и .
// - начинается с английской буквы
const loginField = z
  .string()
  .trim()
  .min(5, "Логин должен содержать минимум 5 символов")
  .max(30, "Логин должен содержать не более 30 символов")
  .regex(
    /^[A-Za-z][A-Za-z0-9._]{4,29}$/,
    "Логин должен начинаться с английской буквы и содержать только английские буквы, цифры, точку или _"
  );

// Email:
// - trim
// - lowercase
// - корректный формат
// - ограничение длины
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email слишком длинный")
  .email("Введите корректный email");

// Пароль:
// - минимум 8 символов
// - минимум 1 маленькая английская буква
// - минимум 1 большая английская буква
// - минимум 1 цифра
// - минимум 1 спецсимвол
// - только английские буквы, цифры и допустимые спецсимволы
const passwordField = z
  .string()
  .min(8, "Пароль должен содержать минимум 8 символов")
  .max(64, "Пароль должен содержать не более 64 символов")
  .regex(/[a-z]/, "Пароль должен содержать хотя бы одну строчную английскую букву")
  .regex(/[A-Z]/, "Пароль должен содержать хотя бы одну заглавную английскую букву")
  .regex(/\d/, "Пароль должен содержать хотя бы одну цифру")
  .regex(
    /[!@#$%^&*()_\-+=\[{\]};:'",<.>/?\\|`~]/,
    "Пароль должен содержать хотя бы один специальный символ"
  )
  .regex(
    /^[A-Za-z\d!@#$%^&*()_\-+=\[{\]};:'",<.>/?\\|`~]+$/,
    "Пароль должен содержать только английские буквы, цифры и допустимые спецсимволы"
  );

export const registerSchema = z.object({
  login: loginField,
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  login: z
    .string()
    .trim()
    .min(1, "Введите логин или email")
    .max(254, "Слишком длинное значение"),
  password: z
    .string()
    .min(1, "Введите пароль")
    .max(64, "Слишком длинный пароль"),
});

export const profileSchema = z.object({
  surname: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().max(100).optional().nullable(),
  patronymic: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  street: z.string().trim().max(120).optional().nullable(),
  house: z.string().trim().max(30).optional().nullable(),
  flat: z.string().trim().max(30).optional().nullable(),
});

export const incidentCreateSchema = z.object({
  category: z.string().trim().min(1, "Категория обязательна").max(64, "Слишком длинная категория"),
  title: z.string().trim().min(1, "Заголовок обязателен").max(200, "Слишком длинный заголовок"),
  description: z
    .string()
    .trim()
    .min(1, "Описание обязательно")
    .max(5000, "Слишком длинное описание"),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().trim().min(1, "Адрес обязателен").max(500, "Слишком длинный адрес"),
  status: z.enum(["draft", "published"]).optional(),
});

export function parse(schema, data) {
  const r = schema.safeParse(data);

  if (!r.success) {
    const msg = r.error.issues?.[0]?.message || "Validation error";
    const err = new Error(msg);
    err.statusCode = 400;
    err.fields = r.error.flatten().fieldErrors;
    throw err;
  }

  return r.data;
}