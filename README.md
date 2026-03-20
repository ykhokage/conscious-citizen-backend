
# Conscious Citizen — Backend (Node.js + Express + PostgreSQL + Prisma)

Этот backend соответствует фронтенду из архива:
- Auth: register/login/reset-password (stub)
- Profile: GET/PUT
- Geo: /api/geo/reverse, /api/geo/search (через Nominatim + проверка зоны Самары)
- Incidents: create/list/my/getById + upload photos + pdf + send-email
- Admin: /api/admin/incidents, /api/admin/stats

## Быстрый запуск (локально)

### 1) Поднять PostgreSQL
Самый простой способ — docker-compose:
```bash
docker compose up -d
```

### 2) Настроить .env
```bash
cp .env.example .env
```

### 3) Установить зависимости
```bash
npm install
```

### 4) Миграции и генерация клиента Prisma
```bash
npm run db:migrate
npm run prisma:generate
```

### 5) Создать admin пользователя (seed)
```bash
npm run seed
```
По умолчанию создаётся:
- login: admin
- password: admin

### 6) Запуск
```bash
npm run dev
```

Backend: http://localhost:3000

## Важно про CORS
CORS настраивается через переменную FRONTEND_ORIGIN.

## Email
Если SMTP_* не заполнены, endpoint send-email вернёт 202 (без реальной отправки).
Если заполнены — отправит PDF на email пользователя.

## Описание ключевых эндпоинтов
- POST /api/auth/register {login,email,password}
- POST /api/auth/login {login,password} -> {token,user}
- POST /api/auth/reset-password {email} -> 200 (stub)
- GET /api/profile
- PUT /api/profile
- GET /api/geo/reverse?lat&lon -> {address,inServiceArea,message?}
- GET /api/geo/search?q -> {items:[{address,lat,lon}]}
- POST /api/incidents
- GET /api/incidents
- GET /api/incidents/my
- GET /api/incidents/:id
- POST /api/incidents/:id/photos (multipart field name: photo)
- GET /api/incidents/:id/document (application/pdf)
- POST /api/incidents/:id/send-email
- GET /api/admin/incidents
- GET /api/admin/stats
=======
