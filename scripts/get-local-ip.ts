/**
 * Утилита для получения локального IP-адреса
 * Используется для отображения сетевого адреса при запуске dev сервера
 */

import { networkInterfaces } from 'os';

/**
 * Получить локальный IP-адрес (не localhost)
 */
export function getLocalIP(): string | null {
  const interfaces = networkInterfaces();
  
  // Приоритет интерфейсов (сначала ищем Ethernet, потом Wi-Fi)
  const priorityOrder = ['Ethernet', 'Wi-Fi', 'WiFi', 'WLAN', 'eth0', 'wlan0'];
  
  // Сначала ищем по приоритету
  for (const name of priorityOrder) {
    const iface = Object.keys(interfaces).find(key => 
      key.toLowerCase().includes(name.toLowerCase())
    );
    
    if (iface) {
      const addresses = interfaces[iface];
      if (addresses) {
        for (const addr of addresses) {
          // IPv4, не localhost, не внутренний адрес
          if (addr.family === 'IPv4' && 
              !addr.address.startsWith('127.') && 
              !addr.address.startsWith('169.254.')) {
            return addr.address;
          }
        }
      }
    }
  }
  
  // Если не нашли по приоритету, ищем любой IPv4
  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (addresses) {
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && 
            !addr.address.startsWith('127.') && 
            !addr.address.startsWith('169.254.')) {
          return addr.address;
        }
      }
    }
  }
  
  return null;
}

/**
 * Получить все локальные IP-адреса
 */
export function getAllLocalIPs(): string[] {
  const ips: string[] = [];
  const interfaces = networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (addresses) {
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && 
            !addr.address.startsWith('127.') && 
            !addr.address.startsWith('169.254.')) {
          ips.push(addr.address);
        }
      }
    }
  }
  
  return ips;
}

// Если запущен напрямую, выводим IP
if (require.main === module) {
  const ip = getLocalIP();
  if (ip) {
    console.log(ip);
  } else {
    console.error('Локальный IP не найден');
    process.exit(1);
  }
}

