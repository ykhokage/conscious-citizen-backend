import { z } from "zod";

export const registerSchema = z.object({
  login: z
    .string()
    .min(3, "Логин должен содержать минимум 3 символа")
    .max(32, "Логин не может быть длиннее 32 символов")
    .regex(/^[a-zA-Z0-9_]+$/, "Логин может содержать только латинские буквы, цифры и _")
    .trim(),
  email: z
    .string()
    .email("Некорректный формат email")
    .min(5, "Email слишком короткий")
    .max(50, "Email не может быть длиннее 50 символов")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов")
    .max(128, "Пароль не может быть длиннее 128 символов")
    .regex(/[A-Z]/, "Пароль должен содержать хотя бы одну заглавную букву")
    .regex(/[a-z]/, "Пароль должен содержать хотя бы одну строчную букву")
    .regex(/[0-9]/, "Пароль должен содержать хотя бы одну цифру"),
});

export const loginSchema = z.object({
  login: z.string().min(1, "Введите логин или email").max(50).trim(),
  password: z.string().min(1, "Введите пароль"),
});

export const profileSchema = z.object({
  surname: z
    .string()
    .max(30, "Фамилия не может быть длиннее 30 символов")
    .regex(/^[а-яА-ЯёЁa-zA-Z\s-]*$/, "Фамилия может содержать только буквы, пробелы и дефис")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
  name: z
    .string()
    .max(30, "Имя не может быть длиннее 30 символов")
    .regex(/^[а-яА-ЯёЁa-zA-Z\s-]*$/, "Имя может содержать только буквы, пробелы и дефис")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
  patronymic: z
    .string()
    .max(30, "Отчество не может быть длиннее 30 символов")
    .regex(/^[а-яА-ЯёЁa-zA-Z\s-]*$/, "Отчество может содержать только буквы, пробелы и дефис")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
  phone: z
    .string()
    .regex(/^(\+7|8)?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, "Некорректный формат телефона")
    .optional()
    .nullable()
    .transform(val => {
      if (!val) return null;
      // Очищаем от лишних символов, оставляем только цифры
      const cleaned = val.replace(/\D/g, '');
      if (cleaned.length === 11) return cleaned;
      if (cleaned.length === 10) return '7' + cleaned;
      return val;
    }),
  city: z
    .string()
    .max(30, "Название города не может быть длиннее 30 символов")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
  street: z
    .string()
    .max(70, "Название улицы не может быть длиннее 70 символов")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
  house: z
    .string()
    .max(10, "Номер дома не может быть длиннее 10 символов")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
  flat: z
    .string()
    .max(5, "Номер квартиры не может быть длиннее 5 символов")
    .optional()
    .nullable()
    .transform(val => val?.trim() || null),
});

export const incidentCreateSchema = z.object({
  category: z
    .string()
    .min(1, "Выберите категорию")
    .max(20, "Категория не может быть длиннее 30 символов")
    .trim(),
  title: z
    .string()
    .min(5, "Заголовок должен содержать минимум 5 символов")
    .max(150, "Заголовок не может быть длиннее 30 символов")
    .trim(),
  description: z
    .string()
    .min(10, "Описание должно содержать минимум 10 символов")
    .max(1000, "Описание не может быть длиннее 1000 символов")
    .trim(),
  latitude: z
    .number()
    .min(-90, "Широта должна быть от -90 до 90")
    .max(90, "Широта должна быть от -90 до 90"),
  longitude: z
    .number()
    .min(-180, "Долгота должна быть от -180 до 180")
    .max(180, "Долгота должна быть от -180 до 180"),
  address: z
    .string()
    .min(3, "Адрес должен содержать минимум 3 символа")
    .max(1000, "Адрес не может быть длиннее 100 символов")
    .trim(),
  status: z.enum(["draft", "published"]).optional(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Некорректный email").toLowerCase().trim(),
});

export const resetPasswordConfirmSchema = z.object({
  email: z.string().email("Некорректный email").toLowerCase().trim(),
  code: z
    .string()
    .regex(/^\d{6}$/, "Код должен состоять из 6 цифр")
    .trim(),
  newPassword: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов")
    .max(128, "Пароль не может быть длиннее 128 символов"),
  confirmPassword: z.string().min(1, "Подтвердите пароль"),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

export const verifyEmailSchema = z.object({
  email: z.string().email("Некорректный email").toLowerCase().trim(),
  code: z.string().regex(/^\d{6}$/, "Код должен состоять из 6 цифр").trim(),
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
