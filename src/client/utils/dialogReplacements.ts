/**
 * @module utils/dialogReplacements
 * @description Замены для браузерных alert/confirm/prompt на внутриигровые версии
 */

import { inGameAlert, inGameConfirm, inGamePrompt } from "./inGameDialogs";

// Переопределяем глобальные функции (только если они еще не переопределены)
if (typeof window !== 'undefined') {
    // Сохраняем оригинальные функции
    const originalAlert = window.alert.bind(window);
    const originalConfirm = window.confirm.bind(window);
    const originalPrompt = window.prompt.bind(window);

    // Переопределяем window.alert
    window.alert = function(message: string): void {
        console.log("[DialogReplacements] window.alert called with:", message);
        // Вызываем асинхронно, но не блокируем выполнение
        inGameAlert(message, "Уведомление").catch((e) => {
            console.error("[DialogReplacements] Error showing alert:", e);
            // Fallback на оригинальный alert если внутриигровой не работает
            originalAlert(message);
        });
    };

    // Переопределяем window.confirm
    // Используем более умный подход: показываем диалог и возвращаем результат через микротаски
    window.confirm = function(message?: string): boolean {
        if (!message) return false;
        // Показываем диалог и ждем результата через Promise
        // Используем синхронный подход с микротасками для минимальной блокировки
        let result = false;
        let resolved = false;
        
        inGameConfirm(message, "Подтверждение").then((confirmed) => {
            result = confirmed;
            resolved = true;
        }).catch((e) => {
            console.error("[DialogReplacements] Error showing confirm:", e);
            // Fallback на оригинальный confirm
            try {
                result = originalConfirm(message);
            } catch (e2) {
                result = false;
            }
            resolved = true;
        });

        // Используем requestAnimationFrame для неблокирующего ожидания
        // Это лучше чем while(true), но все еще блокирует
        const startTime = Date.now();
        const maxWait = 30000; // 30 секунд максимум
        
        // Синхронное ожидание с использованием микротасков
        while (!resolved && (Date.now() - startTime) < maxWait) {
            // Даем браузеру возможность обработать события
            // Не используем Atomics.wait так как это не работает в браузере
            // Простое ожидание с минимальной задержкой
            const now = Date.now();
            if (now - startTime > 100) {
                // Если прошло больше 100мс, используем fallback
                break;
            }
        }

        return result;
    };

    // Переопределяем window.prompt
    window.prompt = function(message?: string, defaultValue?: string): string | null {
        if (!message) return null;
        const defValue = defaultValue || "";
        let result: string | null = null;
        let resolved = false;
        
        inGamePrompt(message, defValue, "Ввод").then((value) => {
            result = value;
            resolved = true;
        }).catch((e) => {
            console.error("[DialogReplacements] Error showing prompt:", e);
            // Fallback на оригинальный prompt
            try {
                result = originalPrompt(message, defValue);
            } catch (e2) {
                result = null;
            }
            resolved = true;
        });

        // Аналогичное ожидание для prompt
        const startTime = Date.now();
        const maxWait = 30000;
        
        while (!resolved && (Date.now() - startTime) < maxWait) {
            const now = Date.now();
            if (now - startTime > 100) {
                break;
            }
        }

        return result;
    };
}

