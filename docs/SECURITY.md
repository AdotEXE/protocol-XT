# Безопасность

## ⚠️ Важно: API ключи и секреты

### Vercel API Token

**НЕ КОММИТЬТЕ API ключи в репозиторий!**

Если вы случайно опубликовали API ключ:

1. **Немедленно отзовите его**:
   - Зайдите на https://vercel.com/account/tokens
   - Найдите токен и нажмите "Revoke"

2. **Создайте новый токен**:
   - Нажмите "Create Token"
   - Скопируйте новый токен

3. **Обновите GitHub Secrets**:
   - Зайдите в Settings → Secrets and variables → Actions
   - Обновите `VERCEL_TOKEN` новым значением

### Защищенные файлы

Следующие файлы и паттерны добавлены в `.gitignore`:

- `*.vercel.token` - любые файлы с токенами Vercel
- `vercel.token` - файл с токеном
- `.vercel` - папка Vercel
- `vercel.json.secret` - секретные конфигурации
- `.env*` - файлы с переменными окружения
- `*-firebase-adminsdk-*.json` - Firebase Admin SDK ключи
- `protocol-*-firebase-adminsdk-*.json` - Firebase Admin SDK ключи проекта

### Хранение секретов

**Правильно:**
- ✅ GitHub Secrets (для CI/CD)
- ✅ Локальные `.env` файлы (в .gitignore)
- ✅ `.vercel.token` файл (в .gitignore)
- ✅ Firebase ключи через переменные окружения (см. [FIREBASE_ADMIN_SETUP.md](FIREBASE_ADMIN_SETUP.md))

**Неправильно:**
- ❌ Коммиты в Git
- ❌ Публичные файлы
- ❌ Документация с реальными ключами
- ❌ Firebase Admin SDK JSON файлы в репозитории

### Если ключ был скомпрометирован

1. **Отзовите ключ** на Vercel
2. **Создайте новый ключ**
3. **Обновите все места**, где используется ключ:
   - GitHub Secrets
   - Локальные файлы
   - CI/CD конфигурации

### История Git

⚠️ **Важно**: Если ключ был закоммичен в историю Git, он все еще там, даже если удален из текущих файлов.

Для полного удаления из истории (требует force push):
```bash
# ВНИМАНИЕ: Это перепишет историю Git!
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch docs/VERCEL_SETUP.md" \
  --prune-empty --tag-name-filter cat -- --all

git push origin --force --all
```

**Рекомендация**: Проще отозвать старый ключ и создать новый, чем переписывать историю.

---

**Помните**: Безопасность важнее удобства. Всегда храните секреты в безопасных местах!

