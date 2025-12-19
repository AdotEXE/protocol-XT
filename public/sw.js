// Service Worker for Protocol TX
// Кэширует критические ресурсы для офлайн-поддержки и быстрой загрузки

const CACHE_VERSION = 'v1';
const CACHE_NAME = `ptx-cache-${CACHE_VERSION}`;

// Критические ресурсы для кэширования
const CRITICAL_RESOURCES = [
  '/',
  '/index.html',
  '/favicon.svg',
];

// Расширения файлов, которые нужно кэшировать
const CACHEABLE_EXTENSIONS = ['.js', '.css', '.wasm', '.woff', '.woff2', '.ttf', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp'];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching critical resources');
        return cache.addAll(CRITICAL_RESOURCES);
      })
      .then(() => {
        return self.skipWaiting(); // Активируем сразу
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Удаляем старые кэши
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Берем контроль над всеми клиентами
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Пропускаем запросы к Vite dev server (HMR и другие dev запросы)
  if (url.pathname.includes('/@vite/') || 
      url.pathname.includes('/node_modules/') ||
      url.searchParams.has('t') || // Vite timestamp параметр
      url.hostname === 'localhost' && url.port !== self.location.port) {
    return; // Пропускаем запрос, не перехватываем
  }
  
  // Пропускаем запросы к внешним доменам (кроме статических ресурсов)
  if (url.origin !== self.location.origin) {
    // Для внешних ресурсов используем Network First
    if (url.pathname.match(/\.(js|css|wasm|woff|woff2|ttf|svg|png|jpg|jpeg|gif|ico|webp)$/)) {
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          }).catch(() => {
            // Офлайн: возвращаем базовую страницу
            return caches.match('/index.html');
          });
        })
      );
    }
    return; // Пропускаем другие внешние запросы
  }
  
  // Стратегия кэширования для статических ресурсов
  if (CACHEABLE_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Cache First для статики
          return cachedResponse;
        }
        // Если нет в кэше, загружаем из сети и кэшируем
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // Офлайн: возвращаем базовую страницу для HTML, или ничего для других ресурсов
          if (url.pathname.endsWith('.html') || url.pathname === '/') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
  } else {
    // Network First для HTML и API запросов
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            // Кэшируем только успешные ответы
            if (url.pathname === '/' || url.pathname.endsWith('.html')) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
          }
          return response;
        })
        .catch(() => {
          // Офлайн: возвращаем из кэша
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Если нет в кэше, возвращаем index.html
            if (url.pathname !== '/index.html') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
        })
    );
  }
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
    });
  }
});

