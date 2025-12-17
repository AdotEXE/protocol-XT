# 🔑 Разница между Firebase Client SDK и Admin SDK

## 📊 Два разных SDK

### 1. Firebase Client SDK (для браузера) ✅ У вас уже есть

**Где используется:** `src/client/firebaseService.ts`

**Конфигурация:**
```typescript
const firebaseConfig = {
  apiKey: "AIzaSyBvTtaOb9NuWgwJJgQ0lhnyLDkoRpvhAAY",
  authDomain: "protocol-tx.firebaseapp.com",
  projectId: "protocol-tx",
  storageBucket: "protocol-tx.firebasestorage.app",
  messagingSenderId: "513687323344",
  appId: "1:513687323344:web:bdcbda7d8aa142cac8d4d5",
  measurementId: "G-HP3TNXC04H"
};
```

**Где найти:**
1. Firebase Console → ⚙️ Project Settings → **General**
2. Прокрутите вниз до раздела **Your apps**
3. Выберите ваше веб-приложение
4. Скопируйте конфигурацию

**Это для:** Клиентской части (браузер) - авторизация, Firestore, Storage

---

### 2. Firebase Admin SDK (для сервера) ❌ Нужно получить

**Где используется:** `src/server/auth.ts`

**Нужны переменные:**
```env
FIREBASE_PROJECT_ID=protocol-tx
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@protocol-tx.iam.gserviceaccount.com
```

**Где найти:**
1. Firebase Console → ⚙️ Project Settings → **Service Accounts**
2. Нажмите **Generate New Private Key**
3. Скачается JSON файл
4. Из JSON возьмите:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

**Это для:** Серверной части - валидация токенов, админские операции

---

## 🎯 Что вам нужно сделать

### Шаг 1: Получите Service Account ключ

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект **protocol-tx**
3. ⚙️ Settings → **Service Accounts**
4. Нажмите **Generate New Private Key**
5. Скачается файл типа `protocol-tx-firebase-adminsdk-xxxxx.json`

### Шаг 2: Откройте JSON файл

JSON будет выглядеть так:
```json
{
  "type": "service_account",
  "project_id": "protocol-tx",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@protocol-tx.iam.gserviceaccount.com",
  ...
}
```

### Шаг 3: Создайте файл `.env` в корне проекта

```env
# Firebase Admin SDK (для сервера)
FIREBASE_PROJECT_ID=protocol-tx
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@protocol-tx.iam.gserviceaccount.com

# Server
PORT=8080

# Firebase Client SDK (для клиента - уже есть в firebaseService.ts)
VITE_FIREBASE_API_KEY=AIzaSyBvTtaOb9NuWgwJJgQ0lhnyLDkoRpvhAAY
VITE_FIREBASE_AUTH_DOMAIN=protocol-tx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=protocol-tx
VITE_FIREBASE_STORAGE_BUCKET=protocol-tx.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=513687323344
VITE_FIREBASE_APP_ID=1:513687323344:web:bdcbda7d8aa142cac8d4d5
```

**⚠️ ВАЖНО:**
- `FIREBASE_PRIVATE_KEY` должен быть в **двойных кавычках** `"`
- Все переносы строк должны быть как `\n` (не реальные переносы!)
- Скопируйте `private_key` из JSON полностью, включая `-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----`

---

## 📝 Сравнение

| Параметр | Client SDK | Admin SDK |
|----------|-----------|-----------|
| **Где используется** | Браузер (`src/client/`) | Сервер (`src/server/`) |
| **Где найти** | Project Settings → General | Project Settings → Service Accounts |
| **Что нужно** | apiKey, authDomain, projectId и т.д. | project_id, private_key, client_email |
| **Безопасность** | Можно публиковать (ограничено правилами) | НИКОГДА не публиковать! |
| **Для чего** | Авторизация, чтение/запись данных | Валидация токенов, админские операции |

---

## ✅ Проверка

После создания `.env` файла:

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

4. Должно появиться:
   ```
   [Auth] Firebase Admin initialized successfully
   ```

---

## 🚨 Безопасность

- ✅ `.env` файл уже в `.gitignore` - не будет закоммичен
- ❌ НЕ коммитьте JSON файл с приватным ключом
- ❌ НЕ делитесь `FIREBASE_PRIVATE_KEY` публично
- ✅ Client SDK конфигурацию можно публиковать (но лучше через переменные окружения)

---

**Подробнее:** См. [docs/FIREBASE_ADMIN_SETUP.md](FIREBASE_ADMIN_SETUP.md)

