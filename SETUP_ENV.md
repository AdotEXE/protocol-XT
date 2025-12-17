# Настройка переменных окружения для Firebase

## Способ 1: Использование файла .env (Рекомендуется)

### Шаг 1: Установите dotenv
```bash
npm install dotenv
```

### Шаг 2: Создайте файл .env в корне проекта
Скопируйте `.env.example` в `.env` и заполните значения:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
PORT=8080
```

### Шаг 3: Обновите src/server/index.ts
Добавьте в начало файла:
```typescript
import 'dotenv/config';
```

## Способ 2: Установка в PowerShell (для текущей сессии)

```powershell
$env:FIREBASE_PROJECT_ID="your-project-id"
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
$env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com"
$env:PORT="8080"
```

## Способ 3: Установка в PowerShell (постоянно для пользователя)

```powershell
[System.Environment]::SetEnvironmentVariable('FIREBASE_PROJECT_ID', 'your-project-id', 'User')
[System.Environment]::SetEnvironmentVariable('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n', 'User')
[System.Environment]::SetEnvironmentVariable('FIREBASE_CLIENT_EMAIL', 'firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com', 'User')
[System.Environment]::SetEnvironmentVariable('PORT', '8080', 'User')
```

После установки перезапустите PowerShell.

## Как получить значения из Firebase Console

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите ваш проект
3. Перейдите в **Project Settings** (⚙️) → **Service Accounts**
4. Нажмите **Generate New Private Key**
5. Скачайте JSON файл
6. Откройте JSON файл и скопируйте:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (сохраните с кавычками и `\n`)
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

## Важно!

- **НЕ коммитьте файл `.env` в Git!** Он уже должен быть в `.gitignore`
- `FIREBASE_PRIVATE_KEY` должен быть в кавычках и содержать `\n` для переносов строк
- После изменения переменных окружения перезапустите сервер

