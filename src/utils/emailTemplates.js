export function buildVerifyEmailText(code) {
  return `Код подтверждения почты: ${code}\n\nОн действует 10 минут.\n\nЕсли это не вы — просто проигнорируйте письмо.`;
}

export function buildResetPasswordText(code) {
  return `Сброс пароля в системе «Сознательный гражданин»\n\nВаш код: ${code}\n\nОн действует 10 минут.\n\nЕсли вы не запрашивали сброс — проигнорируйте письмо.`;
}