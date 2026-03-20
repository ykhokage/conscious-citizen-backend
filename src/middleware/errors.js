export function notFound(req, res, next) {
  res.status(404).json({ message: "Ресурс не найден" });
}

export function errorHandler(err, req, res, next) {
  console.error(err);
  
  // Обработка ошибок валидации Zod
  if (err.name === 'ZodError') {
    return res.status(400).json({ 
      message: 'Ошибка валидации данных',
      errors: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
  }
  
  // Обработка ошибок Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      message: 'Файл слишком большой. Максимальный размер - 8MB' 
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ 
      message: 'Неожиданное поле файла' 
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ 
      message: 'Слишком много файлов' 
    });
  }
  
  // Обработка ошибок Prisma
  if (err.code === 'P2002') {
    return res.status(409).json({ 
      message: 'Запись с такими данными уже существует' 
    });
  }
  
  if (err.code === 'P2025') {
    return res.status(404).json({ 
      message: 'Запись не найдена' 
    });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({ 
      message: 'Ошибка внешнего ключа' 
    });
  }
  
  const status = err.statusCode || 500;
  res.status(status).json({ 
    message: err.message || 'Внутренняя ошибка сервера' 
  });
}