# 🐛 Найденные баги - Полная проверка кода

**Дата:** 3 февраля 2026  
**Статус:** Критические проблемы требуют исправления

---

## 🔴 КРИТИЧЕСКИЕ БАГИ

### 1. ❌ HotkeyManager - Event Listeners не удаляются полностью

**Файл:** `src/client/hotkeyManager.ts`

**Проблема:**
- `contextmenu` и `beforeunload` listeners добавляются как анонимные функции (строки 111, 118)
- Они НЕ удаляются в `cleanup()` методе
- Утечка памяти при перезапуске игры

**Код:**
```typescript
// Строка 111-115
window.addEventListener("contextmenu", (e) => {
    if (this.isGameActive) {
        e.preventDefault();
    }
});

// Строка 118-124
window.addEventListener("beforeunload", (e) => {
    if (this.isGameActive) {
        e.preventDefault();
        e.returnValue = "Вы уверены, что хотите покинуть игру?";
        return e.returnValue;
    }
});
```

**Исправление:**
```typescript
private contextMenuHandler: ((e: Event) => void) | null = null;
private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

private setupEventListeners(): void {
    // ...
    this.contextMenuHandler = (e) => {
        if (this.isGameActive) {
            e.preventDefault();
        }
    };
    window.addEventListener("contextmenu", this.contextMenuHandler);

    this.beforeUnloadHandler = (e) => {
        if (this.isGameActive) {
            e.preventDefault();
            e.returnValue = "Вы уверены, что хотите покинуть игру?";
            return e.returnValue;
        }
    };
    window.addEventListener("beforeunload", this.beforeUnloadHandler);
}

cleanup(): void {
    // ...
    if (this.contextMenuHandler) {
        window.removeEventListener("contextmenu", this.contextMenuHandler);
        this.contextMenuHandler = null;
    }
    if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
    }
}
```

**Приоритет:** 🔴 КРИТИЧНО

---

### 2. ❌ HotkeyManager - setTimeout без сохранения ID

**Файл:** `src/client/hotkeyManager.ts`

**Проблема:**
- `setTimeout` на строке 216 не сохраняет ID
- Если `openChat()` вызывается несколько раз быстро, могут накапливаться таймеры
- Потенциальная утечка памяти

**Код:**
```typescript
// Строка 216-224
setTimeout(() => {
    const input = document.getElementById("terminal-command-input") as HTMLInputElement;
    if (input) {
        input.focus();
        if (initialText) {
            input.value = initialText;
        }
    }
}, 50);
```

**Исправление:**
```typescript
private focusTimeout: NodeJS.Timeout | null = null;

private openChat(initialText: string = ""): void {
    if (!this.chatSystem) return;

    // Очищаем предыдущий таймер если есть
    if (this.focusTimeout) {
        clearTimeout(this.focusTimeout);
    }

    this.chatSystem.setVisible(true);

    this.focusTimeout = setTimeout(() => {
        const input = document.getElementById("terminal-command-input") as HTMLInputElement;
        if (input) {
            input.focus();
            if (initialText) {
                input.value = initialText;
            }
        }
        this.focusTimeout = null;
    }, 50);
}

cleanup(): void {
    // ...
    if (this.focusTimeout) {
        clearTimeout(this.focusTimeout);
        this.focusTimeout = null;
    }
}
```

**Приоритет:** 🟡 СРЕДНИЙ

---

### 3. ❌ Game - visitedMaps массив без лимита

**Файл:** `src/client/game.ts`

**Проблема:**
- Массив `visitedMaps` в localStorage может расти бесконечно
- При длительной игре может занять много места в localStorage
- Нет ограничения на размер

**Код:**
```typescript
// Строка 2412-2416
const visitedMaps = JSON.parse(localStorage.getItem('visitedMaps') || '[]') as string[];
if (!visitedMaps.includes(this.currentMapType)) {
    visitedMaps.push(this.currentMapType);
    localStorage.setItem('visitedMaps', JSON.stringify(visitedMaps));
}
```

**Исправление:**
```typescript
const visitedMaps = JSON.parse(localStorage.getItem('visitedMaps') || '[]') as string[];
if (!visitedMaps.includes(this.currentMapType)) {
    visitedMaps.push(this.currentMapType);
    
    // Ограничиваем размер массива (храним последние 50 карт)
    const MAX_VISITED_MAPS = 50;
    if (visitedMaps.length > MAX_VISITED_MAPS) {
        visitedMaps.shift(); // Удаляем самый старый
    }
    
    localStorage.setItem('visitedMaps', JSON.stringify(visitedMaps));
}
```

**Приоритет:** 🟡 СРЕДНИЙ

---

## 🟡 ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ

### 4. ⚠️ Game - networkPlayerTanks Map без явной очистки

**Файл:** `src/client/game.ts`

**Проблема:**
- `networkPlayerTanks` Map может накапливать танки если они не удаляются правильно
- Нужно проверить что все танки удаляются при выходе игроков

**Статус:** Требует проверки логики удаления

**Приоритет:** 🟡 СРЕДНИЙ

---

### 5. ⚠️ Game - enemyTanks массив

**Файл:** `src/client/game.ts`

**Проблема:**
- Массив `enemyTanks` очищается в `startGame()`, но нужно убедиться что все враги правильно удаляются при смерти

**Статус:** Требует проверки логики удаления

**Приоритет:** 🟡 СРЕДНИЙ

---

## ✅ УЖЕ ИСПРАВЛЕНО (для справки)

### ✅ EnemyTank - setTimeout утечки
- Исправлено: все setTimeout сохраняют ID в `activeTimeouts`
- Очищаются в `dispose()`

### ✅ ChatSystem - setInterval и event listeners
- Исправлено: все интервалы и listeners очищаются

### ✅ BotPerformanceMonitor - Observable утечки
- Исправлено: все observers сохраняются и удаляются

---

## 📊 Статистика проверки

**Проверено файлов:** 78+  
**Найдено критических багов:** 1  
**Найдено средних проблем:** 4  
**Уже исправлено:** 3+ (из предыдущих проверок)

---

## 🎯 Рекомендации

1. **Немедленно исправить:**
   - HotkeyManager event listeners (критично)

2. **Исправить в ближайшее время:**
   - HotkeyManager setTimeout
   - Game visitedMaps лимит

3. **Проверить дополнительно:**
   - Логику удаления networkPlayerTanks
   - Логику удаления enemyTanks
   - Другие места с setTimeout/setInterval без сохранения ID

---

## 📝 Чеклист исправлений

- [ ] Исправить HotkeyManager event listeners
- [ ] Исправить HotkeyManager setTimeout
- [ ] Добавить лимит для visitedMaps
- [ ] Проверить логику удаления networkPlayerTanks
- [ ] Проверить логику удаления enemyTanks
- [ ] Провести полный аудит всех setTimeout/setInterval

---

**Следующий шаг:** Исправить критические баги немедленно!
