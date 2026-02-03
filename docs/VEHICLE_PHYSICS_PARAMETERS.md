# Справочник физических параметров техники (корпуса и пушки)

Документ содержит полный перечень параметров всех **корпусов (chassis)** и **пушек (cannon)** для баланса, разработки и отладки. Реальное время подстройки — через конфиг модификаторов: [src/client/config/vehiclePhysicsConfig.ts](../src/client/config/vehiclePhysicsConfig.ts).

---

## Содержание

1. [Корпуса (Chassis)](#корпуса-chassis)
2. [Пушки (Cannons)](#пушки-cannons)
3. [Формулы](#формулы)
4. [Конфиг модификаторов](#конфиг-модификаторов)

---

## Корпуса (Chassis)

Источник: [src/client/tankTypes.ts](../src/client/tankTypes.ts) — `CHASSIS_TYPES`.

| id | name | width | height | depth | mass | maxHealth | moveSpeed | turnSpeed | acceleration |
|----|------|-------|--------|-------|------|-----------|-----------|-----------|--------------|
| racer | Racer | 1.5 | 0.55 | 2.6 | 900 | 50 | 42 | 8.0 | 18000 |
| siege | Siege | 3.0 | 1.1 | 4.5 | 3500 | 200 | 12 | 3.0 | 5000 |
| amphibious | Amphibious | 2.1 | 0.8 | 3.6 | 1600 | 95 | 26 | 5.6 | 11000 |
| shield | Shield | 2.3 | 0.9 | 3.7 | 2000 | 110 | 20 | 4.4 | 9000 |
| artillery | Artillery | 2.8 | 1.0 | 4.2 | 2800 | 130 | 16 | 3.6 | 6500 |
| light | Light | 1.8 | 0.7 | 3.0 | 1250 | 80 | 30 | 6.0 | 12500 |
| medium | Medium | 2.2 | 0.8 | 3.5 | 1875 | 100 | 24 | 5.0 | 10000 |
| heavy | Heavy | 2.6 | 0.9 | 4.0 | 2500 | 150 | 18 | 4.0 | 7500 |
| assault | Assault | 2.4 | 0.85 | 3.8 | 2125 | 120 | 22 | 4.6 | 9375 |
| scout | Scout | 1.6 | 0.6 | 2.8 | 1000 | 60 | 36 | 7.0 | 15000 |
| stealth | Stealth | 1.9 | 0.65 | 3.2 | 1100 | 70 | 28 | 6.4 | 13000 |
| hover | Hover | 2.0 | 0.7 | 3.4 | 1400 | 85 | 32 | 6.2 | 12000 |
| destroyer | Destroyer | 2.7 | 0.95 | 4.1 | 2700 | 140 | 17 | 3.8 | 7000 |
| command | Command | 2.5 | 0.9 | 3.9 | 2300 | 125 | 19 | 4.2 | 8000 |
| drone | Drone | 1.4 | 0.5 | 2.4 | 600 | 40 | 38 | 8.5 | 17000 |
| plane | Warhawk | 3.5 | 1.2 | 4.0 | 1500 | 65 | 45 | 6.5 | 16000 |

Дополнительные поля: `color`, `description`, `specialAbility` (опционально).

---

## Пушки (Cannons)

Источник: [src/client/tankTypes.ts](../src/client/tankTypes.ts) — `CANNON_TYPES`.  
DPS = damage / (cooldown / 1000). maxRange задаётся явно или через `calculateMaxRange(barrelLength, projectileSpeed)`.

| id | name | damage | cooldown(ms) | projectileSpeed | barrelLength | DPS | maxRange (formula) |
|----|------|--------|--------------|-----------------|--------------|-----|--------------------|
| rapid | Rapid | 15 | 1000 | 160 | 1.7 | 15.0 | — |
| standard | Standard | 25 | 2000 | 200 | 2.1 | 12.5 | baseRange + speedBonus |
| heavy | Heavy | 40 | 3500 | 240 | 2.5 | ~11.4 | — |
| sniper | Sniper | 50 | 4000 | 300 | 3.0 | 12.5 | — |
| gatling | Gatling | 10 | 300 | 180 | 1.9 | ~33.3 | — |
| plasma | Plasma Cannon | 35 | 2500 | 220 | 2.3 | 14.0 | — |
| laser | Laser Beam | 30 | 1500 | 400 | 2.8 | 20.0 | — |
| tesla | Tesla Coil | 20 | 1800 | 190 | 1.8 | ~11.1 | — |
| railgun | Railgun | 60 | 5000 | 500 | 3.5 | 12.0 | — |
| rocket | Rocket Launcher | 45 | 3000 | 200 | 2.2 | 15.0 | — |
| mortar | Mortar | 55 | 4500 | 150 | 2.0 | ~12.2 | — |
| cluster | Cluster | 30 | 2800 | 180 | 2.4 | ~10.7 | — |
| explosive | Explosive | 50 | 3800 | 210 | 2.6 | ~13.2 | — |
| flamethrower | Flamethrower | 8 | 200 | 120 | 1.6 | 40.0 | — |
| acid | Acid | 22 | 2200 | 170 | 1.9 | 10.0 | — |
| freeze | Freeze | 18 | 1600 | 220 | 2.0 | 11.25 | — |
| poison | Poison | 24 | 2400 | 160 | 2.1 | 10.0 | — |
| emp | EMP | 12 | 1200 | 350 | 2.5 | 10.0 | — |
| shotgun | Shotgun | 35 | 2200 | 250 | 2.3 | ~15.9 | — |
| multishot | Multishot | 20 | 1800 | 230 | 2.2 | ~11.1 | — |
| homing | Homing | 28 | 2600 | 180 | 2.4 | ~10.8 | — |
| piercing | Piercing | 42 | 3200 | 280 | 2.7 | 13.125 | — |
| shockwave | Shockwave | 38 | 3400 | 190 | 2.5 | ~11.2 | — |
| beam | Beam | 32 | 1400 | 400 | 2.8 | ~22.9 | — |
| vortex | Vortex | 26 | 2000 | 200 | 2.1 | 13.0 | — |
| support | Support | 20 | 1500 | 250 | 2.2 | 13.3 | — |
| ricochet | Ricochet Master | 28 | 2200 | 250 | 2.4 | ~12.7 | — |

Дополнительные поля: `barrelWidth`, `projectileSize`, `color`, `description`, `recoilMultiplier`; у части пушек — `maxRicochets`, `ricochetSpeedRetention`, `ricochetAngle`, `maxRange`.

---

## Формулы

- **DPS** (Damage Per Second):  
  `DPS = damage / (cooldown / 1000)`  
  Реализация: [tankTypes.ts](../src/client/tankTypes.ts) — `calculateDPS(cannon)`.

- **Максимальная дальность** (если не задана явно):  
  `baseRange = barrelLength * 80`  
  `speedBonus = projectileSpeed * 0.5`  
  `maxRange = Math.round(baseRange + speedBonus)`  
  Реализация: в [tankTypes.ts](../src/client/tankTypes.ts) — `calculateMaxRange(barrelLength, projectileSpeed)`.

---

## Конфиг модификаторов

Файл [src/client/config/vehiclePhysicsConfig.ts](../src/client/config/vehiclePhysicsConfig.ts) позволяет подставлять модификаторы по `id` корпуса/пушки для разработки и тестов без правки основных массивов:

- **CHASSIS_MODIFIERS** — частичные переопределения по `chassis.id`.
- **CANNON_MODIFIERS** — частичные переопределения по `cannon.id`.
- **applyChassisModifiers(base, id)** / **applyCannonModifiers(base, id)** — применение модификаторов к объекту, полученному из `getChassisById` / `getCannonById`.

В браузере в консоли доступен глобальный объект `window.vehiclePhysicsConfig` для отладки (те же константы и функции).

Подробнее по самолётам и будущим типам техники: [AIRCRAFT_AND_VEHICLES_PARAMETERS.md](AIRCRAFT_AND_VEHICLES_PARAMETERS.md).
