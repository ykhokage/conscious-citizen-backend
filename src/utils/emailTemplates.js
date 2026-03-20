export function buildVerifyEmailText(code) {
  return `Ваш код подтверждения: ${code}

Код действует 10 минут.
Если вы не регистрировались, просто проигнорируйте это письмо.`;
}

export function buildResetPasswordText(code) {
  return `Ваш код для сброса пароля: ${code}

Код действует 10 минут.
Если это были не вы, просто проигнорируйте это письмо.`;
}