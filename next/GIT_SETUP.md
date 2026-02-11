# Настройка Git и первый пуш

Проект пока **не является Git-репозиторием** (папка была скачана архивом, без `.git`).

## 1. Установите Git (если ещё нет)

- Скачайте: https://git-scm.com/download/win  
- Установите, перезапустите терминал при необходимости.

## 2. Инициализация и коммит (один раз)

В **PowerShell** или **cmd** откройте папку проекта и выполните:

```powershell
cd "C:\Users\elluh\Desktop\protocol-XT-main"
.\scripts\git-init-and-commit.ps1
```

Либо вручную:

```bash
cd C:\Users\elluh\Desktop\protocol-XT-main
git init
git add -A
git commit -m "refactor: extract game and HUD logic to modules"
```

После этого папка станет репозиторием с одним коммитом.

## 3. Пуш на GitHub/GitLab

1. Создайте **новый пустой репозиторий** на GitHub (или GitLab), **без** README и .gitignore.
2. Подключите его и запушьте:

```bash
git remote add origin https://github.com/<ваш-логин>/<имя-репо>.git
git branch -M main
git push -u origin main
```

Подставьте свой URL репозитория. Если репозиторий уже существует и вы хотите связать этот код с ним — те же команды после `git init` и `git commit`.

## 4. Cursor Cloud Agents

После того как в папке есть `.git` (выполнен `git init`) и папка открыта в Cursor, Cloud Agents смогут работать с проектом.
