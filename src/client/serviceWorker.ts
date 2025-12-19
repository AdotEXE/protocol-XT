/**
 * Service Worker Registration
 * Регистрирует Service Worker для кэширования и офлайн-поддержки
 */

const SW_PATH = '/sw.js';

export function registerServiceWorker(): void {
  // Отключаем ServiceWorker в режиме разработки (localhost или dev сервер)
  const isDev = import.meta.env.DEV || 
                window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname.includes('localhost');
  
  if (isDev) {
    console.log('[SW] Service Worker disabled in development mode');
    // Отключаем существующие ServiceWorker в dev режиме
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
          console.log('[SW] Service Worker unregistered for dev mode');
        });
      });
    }
    return;
  }
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(SW_PATH, {
        scope: '/',
      })
        .then((registration) => {
          console.log('[SW] Service Worker registered:', registration.scope);
          
          // Проверяем обновления каждые 60 секунд
          setInterval(() => {
            registration.update();
          }, 60000);
          
          // Обработка обновлений
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Новый Service Worker установлен, можно обновить
                  console.log('[SW] New Service Worker available');
                  // Можно показать уведомление пользователю о доступном обновлении
                }
              });
            }
          });
        })
        .catch((error) => {
          console.warn('[SW] Service Worker registration failed:', error);
        });
      
      // Обработка сообщений от Service Worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('[SW] Service Worker updated');
          // Можно показать уведомление пользователю
        }
      });
      
      // Обработка контроллера
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] New Service Worker activated');
        // Перезагружаем страницу для применения обновлений
        window.location.reload();
      });
    });
  } else {
    console.warn('[SW] Service Workers are not supported in this browser');
  }
}

export function unregisterServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
        console.log('[SW] Service Worker unregistered');
      });
    });
  }
}

