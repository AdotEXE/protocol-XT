# 🔐 Настройка Firebase Admin SDK - Подробное руководство

## 📍 Где найти FIREBASE_PRIVATE_KEY и другие переменные

### Шаг 1: Откройте Firebase Console

1. Перейдите на [Firebase Console](https://console.firebase.google.com/)
2. Войдите в свой аккаунт Google
3. Выберите ваш проект (или создайте новый)

### Шаг 2: Перейдите в Service Accounts

1. В левом меню нажмите на **⚙️ Settings** (Настройки проекта)
2. Выберите вкладку **Service Accounts** (Сервисные аккаунты)
3. Вы увидите раздел **Firebase Admin SDK**

### Шаг 3: Сгенерируйте приватный ключ

1. В разделе **Firebase Admin SDK** нажмите кнопку **Generate New Private Key** (Создать новый приватный ключ)
2. Появится предупреждение - нажмите **Generate Key** (Создать ключ)
3. Браузер автоматически скачает JSON файл (например, `your-project-id-firebase-adminsdk-xxxxx.json`)

### Шаг 4: Откройте скачанный JSON файл

JSON файл будет выглядеть примерно так:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com",
  "client_id": "xxxxx",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project-id.iam.gserviceaccount.com"
}
```

### Шаг 5: Извлеките нужные значения

Из JSON файла вам нужны 3 значения:

1. **`project_id`** → это будет `FIREBASE_PROJECT_ID`
2. **`private_key`** → это будет `FIREBASE_PRIVATE_KEY` (важно сохранить с `\n`)
3. **`client_email`** → это будет `FIREBASE_CLIENT_EMAIL`

---

## 🔧 Настройка переменных окружения

### Вариант 1: Файл .env (Рекомендуется)

1. Создайте файл `.env` в корне проекта (рядом с `package.json`)

2. Добавьте следующие строки:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
PORT=8080
```

**⚠️ ВАЖНО для FIREBASE_PRIVATE_KEY:**
- Должен быть в **двойных кавычках** `"`
- Все переносы строк должны быть как `\n` (не реальные переносы!)
- Пример правильного формата:
  ```env
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
  ```

3. Убедитесь, что файл `.env` в `.gitignore` (он уже там)

### Вариант 2: PowerShell (временные переменные)

Откройте PowerShell и выполните:

```powershell
$env:FIREBASE_PROJECT_ID="your-project-id"
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
$env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com"
$env:PORT="8080"
```

**Примечание:** Эти переменные действуют только в текущей сессии PowerShell.

### Вариант 3: PowerShell (постоянные переменные)

Для установки переменных постоянно (для текущего пользователя):

```powershell
[System.Environment]::SetEnvironmentVariable('FIREBASE_PROJECT_ID', 'your-project-id', 'User')
[System.Environment]::SetEnvironmentVariable('FIREBASE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n', 'User')
[System.Environment]::SetEnvironmentVariable('FIREBASE_CLIENT_EMAIL', 'firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com', 'User')
[System.Environment]::SetEnvironmentVariable('PORT', '8080', 'User')
```

После этого **перезапустите PowerShell**.

---

## ✅ Проверка настройки

После настройки переменных окружения:

1. Убедитесь, что `dotenv` установлен:
   ```bash
   npm install dotenv
   ```

2. Проверьте, что в `src/server/index.ts` есть:
   ```typescript
   import 'dotenv/config';
   ```

3. Запустите сервер:
   ```bash
   npm run server
   ```

4. В консоли должно появиться:
   ```
   [Auth] Firebase Admin initialized successfully
   ```

Если видите предупреждение:
```
[Auth] Firebase Admin credentials not found. Auth validation will be disabled.
```

Это значит, что переменные окружения не загружены. Проверьте:
- Файл `.env` существует и находится в корне проекта
- В `src/server/index.ts` есть `import 'dotenv/config';`
- Значения в `.env` правильные (особенно `FIREBASE_PRIVATE_KEY` с кавычками и `\n`)

---

## 🔍 Альтернативный способ: Использование JSON файла напрямую

Если вы хотите использовать JSON файл напрямую (не рекомендуется для продакшена):

```typescript
// В src/server/auth.ts
import serviceAccount from './path/to/serviceAccountKey.json';

adminApp = initializeApp({
    credential: cert(serviceAccount as admin.ServiceAccount)
});
```

Но лучше использовать переменные окружения для безопасности.

---

## 🚨 Безопасность

1. **НЕ коммитьте** файл `.env` в Git (он уже в `.gitignore`)
2. **НЕ коммитьте** JSON файл с приватным ключом
3. **НЕ делитесь** приватным ключом публично
4. Если ключ скомпрометирован - немедленно удалите его в Firebase Console и создайте новый

---

## 📝 Пример полного .env файла

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=my-awesome-game-project
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bN1Ev0QD6q5J5Q2S3f8G2K5L8M9N0P1Q2R3S4T5U6V7W8X9Y0Z\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc123@my-awesome-game-project.iam.gserviceaccount.com

# Server
PORT=8080

# Client Firebase (для клиента)
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=my-awesome-game-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=my-awesome-game-project
VITE_FIREBASE_STORAGE_BUCKET=my-awesome-game-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

---

## 🆘 Решение проблем

### Проблема: "Firebase Admin credentials not found"

**Решение:**
1. Проверьте, что файл `.env` существует в корне проекта
2. Проверьте, что в `src/server/index.ts` есть `import 'dotenv/config';`
3. Проверьте формат `FIREBASE_PRIVATE_KEY` (должен быть в кавычках с `\n`)
4. Перезапустите сервер

### Проблема: "Invalid private key"

**Решение:**
1. Убедитесь, что `FIREBASE_PRIVATE_KEY` в двойных кавычках
2. Убедитесь, что все `\n` присутствуют (не реальные переносы строк)
3. Скопируйте `private_key` из JSON файла полностью, включая `-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----`

### Проблема: "Permission denied"

**Решение:**
1. Убедитесь, что Service Account имеет необходимые права в Firebase Console
2. Проверьте, что `client_email` правильный
3. Попробуйте создать новый ключ

---

## 📚 Дополнительные ресурсы

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Service Accounts Guide](https://cloud.google.com/iam/docs/service-accounts)
- [SETUP_ENV.md](../SETUP_ENV.md) - Краткая инструкция
- [docs/SECURITY.md](SECURITY.md) - Безопасность

---

**Последнее обновление:** 2025-12-XX

