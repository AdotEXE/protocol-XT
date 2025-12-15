# Настройка секретов Vercel для GitHub Actions

Для успешного деплоя на Vercel через GitHub Actions необходимо настроить секреты в репозитории GitHub.

## Шаг 1: Получение токенов Vercel

1. Войдите в [Vercel Dashboard](https://vercel.com/dashboard)
2. Перейдите в **Settings** → **Tokens**
3. Создайте новый токен с именем "GitHub Actions" и скопируйте его

## Шаг 2: Получение Organization ID и Project ID

### Organization ID:
1. Перейдите в **Settings** → **General**
2. Найдите **Team ID** или **Organization ID** (для персонального аккаунта это будет ваш User ID)

### Project ID:
1. Перейдите в ваш проект на Vercel
2. Откройте **Settings** → **General**
3. Найдите **Project ID** в разделе "Project ID"

Или используйте Vercel CLI:
```bash
vercel link
# После этого в файле .vercel/project.json будет projectId
```

## Шаг 3: Добавление секретов в GitHub

1. Перейдите в ваш GitHub репозиторий
2. Откройте **Settings** → **Secrets and variables** → **Actions**
3. Нажмите **New repository secret**
4. Добавьте следующие секреты:

   - **Name**: `VERCEL_TOKEN`
     **Value**: Токен из шага 1

   - **Name**: `VERCEL_ORG_ID`
     **Value**: Organization ID из шага 2

   - **Name**: `VERCEL_PROJECT_ID`
     **Value**: Project ID из шага 2

## Альтернативный способ: Использование официальной интеграции Vercel

Вместо GitHub Actions можно использовать официальную интеграцию Vercel с GitHub:

1. В Vercel Dashboard перейдите в **Settings** → **Git**
2. Подключите ваш GitHub репозиторий
3. Vercel будет автоматически деплоить при каждом push в `main`

Этот способ проще и не требует настройки секретов вручную.

## Проверка настройки

После добавления секретов:
1. Сделайте новый commit и push
2. Проверьте статус деплоя в разделе **Actions** на GitHub
3. Убедитесь, что деплой проходит успешно

Если возникают ошибки, проверьте:
- Правильность токенов и ID
- Что секреты добавлены с правильными именами (чувствительны к регистру)
- Что у токена есть необходимые права доступа
