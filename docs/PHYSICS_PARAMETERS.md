# ПОЛНЫЙ СПИСОК ПАРАМЕТРОВ ФИЗИКИ ИГРЫ

Этот документ содержит **АБСОЛЮТНО ВСЕ** характеристики и параметры физики, используемые в игре.

---

## 1. ФИЗИКА ИГРОВОГО МИРА (Game Physics)

### Глобальные параметры физического движка

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `gravity` | `Vector3(0, -19.6, 0)` | м/с² | Гравитация игрового мира | `src/client/game/GamePhysics.ts` |
| `substeps` | `2` | - | Количество подшагов физики | `src/client/game/GamePhysics.ts` |
| `fixedTimeStep` | `1/60` | секунды | Фиксированный шаг времени (60 FPS) | `src/client/game/GamePhysics.ts` |
| `GRAVITY` (траектории) | `9.81` | м/с² | Гравитация для расчёта траекторий снарядов | `src/client/game/GameProjectile.ts` |
| `DT` (траектории) | `0.02` | секунды | Шаг времени для расчёта траекторий | `src/client/game/GameProjectile.ts` |
| `MAX_TIME` (траектории) | `10` | секунды | Максимальное время расчёта траектории | `src/client/game/GameProjectile.ts` |

---

## 2. ФИЗИКА ТАНКА ИГРОКА (TankController)

### 2.1. Основные параметры

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `mass` | `3500` | кг | Масса танка (базовое значение, переопределяется типом корпуса) | `src/client/tankController.ts:160` |
| `hoverHeight` | `1.0` | метры | Высота парения над землёй | `src/client/tankController.ts:161` |
| `moveSpeed` | `24` | м/с | Максимальная скорость движения | `src/client/tankController.ts:164` |
| `turnSpeed` | `2.5` | рад/с | Скорость поворота танка | `src/client/tankController.ts:165` |
| `acceleration` | `40000` | Н | Ускорение (сила тяги) | `src/client/tankController.ts:166` |
| `maxHealth` | `100` | HP | Максимальное здоровье (переопределяется типом корпуса) | `src/client/tankController.ts:204` |

### 2.2. Стабильность и подвеска

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `hoverStiffness` | `7000` | Н/м | Жёсткость подвески (сила пружины) | `src/client/tankController.ts:176` |
| `hoverDamping` | `18000` | Н·с/м | Демпфирование парения (сопротивление движению) | `src/client/tankController.ts:177` |
| `linearDamping` | `0.8` | - | Линейное демпфирование физического тела | `src/client/tankController.ts:692` |
| `angularDamping` | `4.0` | - | Угловое демпфирование физического тела | `src/client/tankController.ts:693` |
| `uprightForce` | `12000` | Н | Сила выравнивания танка на склонах | `src/client/tankController.ts:178` |
| `uprightDamp` | `8000` | Н·с/м | Демпфирование выравнивания | `src/client/tankController.ts:179` |
| `stabilityForce` | `3000` | Н | Стабилизация при движении | `src/client/tankController.ts:180` |
| `emergencyForce` | `18000` | Н | Экстренное выравнивание при опрокидывании | `src/client/tankController.ts:181` |
| `liftForce` | `0` | Н | Подъёмная сила (отключено для предотвращения взлёта) | `src/client/tankController.ts:182` |
| `downForce` | `1500` | Н | Прижимная сила (минимальное прижатие к земле) | `src/client/tankController.ts:183` |

### 2.3. Движение и управление

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `turnAccel` | `11000` | Н·м | Угловое ускорение поворота | `src/client/tankController.ts:167` |
| `stabilityTorque` | `2000` | Н·м | Стабилизация при повороте на скорости | `src/client/tankController.ts:168` |
| `yawDamping` | `4500` | Н·м·с/рад | Демпфирование рыскания (бокового вращения) | `src/client/tankController.ts:169` |
| `sideFriction` | `17000` | Н | Боковое трение (сопротивление боковому скольжению) | `src/client/tankController.ts:170` |
| `sideDrag` | `8000` | Н | Боковое сопротивление при остановке | `src/client/tankController.ts:171` |
| `fwdDrag` | `7000` | Н | Продольное сопротивление при остановке | `src/client/tankController.ts:172` |
| `angularDrag` | `5000` | Н·м | Угловое сопротивление при остановке | `src/client/tankController.ts:173` |

### 2.4. Система подъёма на препятствия

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `climbAssistForce` | `40000` | Н | Автоподъём для склонов | `src/client/tankController.ts:186` |
| `maxClimbHeight` | `1.5` | метры | Максимальная высота подъёма препятствия | `src/client/tankController.ts:187` |
| `slopeBoostMax` | `1.8` | - | Множитель тяги на склонах | `src/client/tankController.ts:188` |
| `frontClimbForce` | `60000` | Н | Сила подъёма передней части танка | `src/client/tankController.ts:189` |
| `wallPushForce` | `25000` | Н | Сила проталкивания через препятствия | `src/client/tankController.ts:190` |
| `climbTorque` | `12000` | Н·м | Момент для наклона вперёд при подъёме | `src/client/tankController.ts:191` |

### 2.5. Вертикальные стены (система прилипания)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `verticalWallThreshold` | `0.34` | - | Порог определения вертикальной стены (sin(70°)) | `src/client/tankController.ts:194` |
| `wallAttachmentForce` | `15000` | Н | Сила прилипания к стене (направлена к стене) | `src/client/tankController.ts:195` |
| `wallAttachmentDistance` | `2.0` | метры | Максимальное расстояние для прилипания | `src/client/tankController.ts:196` |
| `wallFrictionCoefficient` | `0.8` | - | Коэффициент трения для горизонтального движения по стене | `src/client/tankController.ts:197` |
| `wallSlideGravityMultiplier` | `1.2` | - | Множитель гравитации для соскальзывания | `src/client/tankController.ts:198` |
| `wallMinHorizontalSpeed` | `0.5` | м/с | Минимальная горизонтальная скорость для предотвращения соскальзывания | `src/client/tankController.ts:199` |
| `wallAttachmentSmoothing` | `0.2` | - | Плавность перехода в режим прилипания (0-1) | `src/client/tankController.ts:200` |
| `wallBaseAttachmentForce` | `8000` | Н | Базовая сила прилипания (работает всегда) | `src/client/tankController.ts:201` |
| `wallAngularDamping` | `0.85` | - | Демпфирование угловой скорости на стене (оставляем 15% скорости) | `src/client/tankController.ts:4173` |

### 2.6. Ограничения скорости

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `maxUpwardSpeed` | `4.0` | м/с | Максимальная скорость вверх (предотвращение подпрыгиваний) | `src/client/tankController.ts:3324` |
| `maxDownwardSpeed` | `35` | м/с | Максимальная скорость вниз (нормально для падения) | `src/client/tankController.ts:3325` |
| `maxAngularSpeed` | `2.5` | рад/с | Максимальная угловая скорость | `src/client/tankController.ts:3343` |

### 2.7. Центр масс

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `centerOfMass` | `Vector3(0, -0.55, -0.3)` | метры | Центр масс (смещён вниз и назад для лучшего подъёма) | `src/client/tankController.ts:691` |

### 2.8. Материалы коллизий (трение и упругость)

| Элемент | Трение | Упругость | Описание | Файл |
|---------|--------|-----------|----------|------|
| Центральный бокс | `0.1` | `0.0` | Основной корпус | `src/client/tankController.ts:657` |
| Передний цилиндр | `0.15` | `0.0` | Скруглённый передний край | `src/client/tankController.ts:669` |
| Задний цилиндр | `0.15` | `0.0` | Скруглённый задний край | `src/client/tankController.ts:681` |

### 2.9. Фильтры коллизий

| Параметр | Значение | Описание | Файл |
|----------|----------|----------|------|
| `filterMembershipMask` | `1` | Группа игрока | `src/client/tankController.ts:685` |
| `filterCollideMask` | `2 \| 32` | Может сталкиваться с окружением (2) и защитными стенами (32) | `src/client/tankController.ts:686` |

---

## 3. БАШНЯ И СТВОЛ

### 3.1. Управление башней

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `turretSpeed` | `0.04` | рад/кадр | Базовая скорость вращения башни | `src/client/tankController.ts:275` |
| `baseTurretSpeed` | `0.06` | рад/кадр | Базовая скорость башни для центрирования | `src/client/tankController.ts:276` |
| `turretLerpSpeed` | `0.15` | - | Скорость интерполяции башни (0-1) | `src/client/tankController.ts:277` |
| `mouseSensitivity` | `0.003` | - | Чувствительность мыши для управления башней | `src/client/tankController.ts:291` |

### 3.2. Управление стволом (pitch)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `baseBarrelPitchSpeed` | `0.035` | рад/кадр | Базовая скорость наклона ствола | `src/client/tankController.ts:284` |
| `barrelPitchLerpSpeed` | `0.15` | - | Скорость интерполяции наклона ствола | `src/client/tankController.ts:285` |

---

## 4. СТРЕЛЬБА И СНАРЯДЫ

### 4.1. Параметры стрельбы

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `damage` | `25` | HP | Базовый урон (переопределяется типом пушки) | `src/client/tankController.ts:215` |
| `cooldown` | `1800` | мс | Время перезарядки | `src/client/tankController.ts:302` |
| `baseCooldown` | `2000` | мс | Базовый cooldown для модулей | `src/client/tankController.ts:303` |
| `projectileSpeed` | `200` | м/с | Скорость снаряда (переопределяется типом пушки) | `src/client/tankController.ts:305` |
| `projectileSize` | `0.2` | метры | Размер снаряда | `src/client/tankController.ts:306` |

### 4.2. Отдача

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `recoilForce` | `2500` | Н | Сила отдачи (линейная) | `src/client/tankController.ts:95` |
| `recoilTorque` | `10000` | Н·м | Сила угловой отдачи | `src/client/tankController.ts:96` |
| `barrelRecoilSpeed` | `0.3` | - | Скорость возврата пушки после отката | `src/client/tankController.ts:93` |
| `barrelRecoilAmount` | `-1.6` | метры | Величина отката пушки назад | `src/client/tankController.ts:94` |

### 4.3. Параметры снарядов игрока

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Масса | `0.001` | кг | Минимальная масса (аркадный стиль) | `src/client/tankController.ts:2585` |
| `linearDamping` | `0.01` | - | Линейное затухание | `src/client/tankController.ts:2586` |
| Импульс | `projectileSpeed * 0.018` | Н·с | Импульс при выстреле | `src/client/tankController.ts:2587` |
| Размеры физического тела | `Vector3(bulletSize * 0.75, bulletSize * 0.75, bulletSize * 2)` | метры | Размеры коллайдера | `src/client/tankController.ts:2577` |
| `filterMembershipMask` | `4` | - | Группа пуль игрока | `src/client/tankController.ts:2579` |
| `filterCollideMask` | `2 \| 8 \| 32` | - | Может сталкиваться с окружением (2), врагами (8), защитными стенами (32) | `src/client/tankController.ts:2580` |

### 4.4. Типы боеприпасов (TankWeaponConfig.ts)

| Тип | Урон | Скорость | Точность | Пробитие | Радиус взрыва | Файл |
|-----|------|----------|---------|----------|---------------|------|
| TRACER | `80` | `800` м/с | `0.5`° | `100` мм | - | `src/client/tank/combat/TankWeaponConfig.ts:41-46` |
| AP | `120` | `700` м/с | `0.8`° | `150` мм | - | `src/client/tank/combat/TankWeaponConfig.ts:47-52` |
| APCR | `100` | `900` м/с | `0.6`° | `200` мм | - | `src/client/tank/combat/TankWeaponConfig.ts:53-58` |
| HE | `150` | `500` м/с | `1.2`° | `50` мм | `5` м | `src/client/tank/combat/TankWeaponConfig.ts:59-65` |
| APDS | `130` | `1000` м/с | `0.4`° | `250` мм | - | `src/client/tank/combat/TankWeaponConfig.ts:66-71` |

### 4.5. Гильзы (Shell Casings)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `SHELL_CASING_DIAMETER_MULTIPLIER` | `1.0` | - | Диаметр гильзы = размер снаряда | `src/client/tank/constants.ts:32` |
| `SHELL_CASING_LENGTH_MULTIPLIER` | `3.0` | - | Длина гильзы = размер снаряда * 3 | `src/client/tank/constants.ts:33` |
| `SHELL_CASING_POSITION_OFFSET` | `0.3` | метры | Смещение гильзы назад от дула | `src/client/tank/constants.ts:34` |
| `SHELL_CASING_SIDE_OFFSET` | `0.2` | метры | Смещение гильзы вбок | `src/client/tank/constants.ts:35` |
| `SHELL_CASING_MASS` | `0.1` | кг | Масса гильзы | `src/client/tank/constants.ts:36` |
| `SHELL_CASING_LINEAR_DAMPING` | `0.5` | - | Линейное затухание | `src/client/tank/constants.ts:37` |
| `SHELL_CASING_ANGULAR_DAMPING` | `0.8` | - | Угловое затухание | `src/client/tank/constants.ts:38` |
| `SHELL_CASING_EJECT_SPEED_MIN` | `8` | м/с | Минимальная скорость выброса | `src/client/tank/constants.ts:39` |
| `SHELL_CASING_EJECT_SPEED_MAX` | `12` | м/с | Максимальная скорость выброса | `src/client/tank/constants.ts:40` |
| `SHELL_CASING_ROTATION_MULTIPLIER` | `10` | - | Множитель случайного вращения | `src/client/tank/constants.ts:41` |
| `SHELL_CASING_PHYSICS_EXTENT_MULTIPLIER` | `0.75` | - | Размер физического тела гильзы | `src/client/tank/constants.ts:42` |
| `SHELL_CASING_PHYSICS_HEIGHT_MULTIPLIER` | `0.5` | - | Высота физического тела гильзы | `src/client/tank/constants.ts:43` |
| `SHELL_CASING_FILTER_MEMBERSHIP_MASK` | `64` | - | Группа фильтра гильз | `src/client/tank/constants.ts:44` |
| `SHELL_CASING_FILTER_COLLIDE_MASK` | `2` | - | Маска коллизий гильз (окружение) | `src/client/tank/constants.ts:45` |
| `SHELL_CASING_LIFETIME` | `5000` | мс | Время жизни гильзы | `src/client/tank/constants.ts:28` |

---

## 5. ФИЗИКА ВРАЖЕСКИХ ТАНКОВ (EnemyTank)

### 5.1. Основные параметры

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `mass` | `3000` | кг | Масса бота | `src/client/enemyTank.ts:44` |
| `hoverHeight` | `1.0` | метры | Высота парения | `src/client/enemyTank.ts:45` |
| `moveSpeed` | `20` | м/с | Максимальная скорость (немного медленнее игрока) | `src/client/enemyTank.ts:50` |
| `turnSpeed` | `2.2` | рад/с | Скорость поворота | `src/client/enemyTank.ts:51` |
| `acceleration` | `40000` | Н | Ускорение | `src/client/enemyTank.ts:52` |

### 5.2. Стабильность

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `hoverStiffness` | `7000` | Н/м | Жёсткость подвески | `src/client/enemyTank.ts:46` |
| `hoverDamping` | `18000` | Н·с/м | Демпфирование парения | `src/client/enemyTank.ts:47` |
| `linearDamping` | `0.5` | - | Линейное демпфирование | `src/client/enemyTank.ts:848` |
| `angularDamping` | `3.0` | - | Угловое демпфирование | `src/client/enemyTank.ts:849` |

### 5.3. Система подъёма (усиленная версия)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `climbAssistForce` | `120000` | Н | Автоподъём (усилено x2.7) | `src/client/enemyTank.ts:55` |
| `maxClimbHeight` | `3.0` | метры | Максимальная высота подъёма (усилено x2.5) | `src/client/enemyTank.ts:56` |
| `slopeBoostMax` | `2.5` | - | Множитель тяги на склонах (усилено x1.4) | `src/client/enemyTank.ts:57` |
| `frontClimbForce` | `180000` | Н | Сила подъёма передней части | `src/client/enemyTank.ts:58` |
| `wallPushForce` | `80000` | Н | Сила проталкивания через стену | `src/client/enemyTank.ts:59` |
| `climbTorque` | `25000` | Н·м | Момент для наклона вперёд при подъёме | `src/client/enemyTank.ts:60` |

### 5.4. Центр масс

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `centerOfMass` | `Vector3(0, -0.55, -0.3)` | метры | Центр масс (как у игрока) | `src/client/enemyTank.ts:846` |

### 5.5. Фильтры коллизий

| Параметр | Значение | Описание | Файл |
|----------|----------|----------|------|
| `filterMembershipMask` | `8` | Группа врагов | `src/client/enemyTank.ts:834` |
| `filterCollideMask` | `2 \| 4 \| 32` | Может сталкиваться с окружением (2), пулями игрока (4), защитными стенами (32) | `src/client/enemyTank.ts:835` |

### 5.6. Снаряды врагов

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Масса | `0.001` | кг | Минимальная масса (аркадный стиль) | `src/client/enemyTank.ts:3176` |
| `linearDamping` | `0.01` | - | Линейное затухание | `src/client/enemyTank.ts:3177` |
| Импульс | `3` | Н·с | Импульс при выстреле (уменьшен из-за малой массы) | `src/client/enemyTank.ts:3180` |
| Размеры | `Vector3(0.5, 0.5, 2.0)` | метры | Размеры физического тела | `src/client/enemyTank.ts:3168` |
| `filterMembershipMask` | `16` | - | Группа пуль врагов | `src/client/enemyTank.ts:3170` |
| `filterCollideMask` | `1 \| 2 \| 32` | - | Может сталкиваться с игроком (1), окружением (2), защитными стенами (32) | `src/client/enemyTank.ts:3171` |
| Отдача (recoilForce) | `-400` | Н | Сила отдачи назад | `src/client/enemyTank.ts:3183` |
| Отдача (recoilTorque) | `2000` | Н·м | Угловая отдача | `src/client/enemyTank.ts:3192` |
| Базовый урон | `20` | HP | Базовый урон (масштабируется сложностью) | `src/client/enemyTank.ts:3197` |

---

## 6. ТУРЕЛИ ВРАГОВ (EnemyTurret)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Масса снаряда | `5` | кг | Масса снаряда турели | `src/client/enemy.ts:294` |
| `linearDamping` | `0` | - | Линейное затухание (нет затухания) | `src/client/enemy.ts:295` |
| Скорость снаряда | `35` | м/с | Скорость полёта снаряда | `src/client/enemy.ts:301` |
| Размеры | `Vector3(0.4, 0.4, 1.0)` | метры | Размеры физического тела | `src/client/enemy.ts:287` |
| `filterMembershipMask` | `16` | - | Группа пуль врагов | `src/client/enemy.ts:289` |
| `filterCollideMask` | `1 \| 2 \| 32` | - | Может сталкиваться с игроком (1), окружением (2), защитными стенами (32) | `src/client/enemy.ts:290` |

---

## 7. МОДУЛИ И СПЕЦИАЛЬНЫЕ СПОСОБНОСТИ

### 7.1. Модуль 6 (Защитные стены)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `MAX_WALLS` | `10` | шт | Максимальное количество активных стенок | `src/client/tankController.ts:316` |
| `WALL_MAX_HEALTH` | `100` | HP | Максимальное здоровье стенки | `src/client/tankController.ts:317` |
| `module6Cooldown` | `10000` | мс | Кулдаун модуля (10 секунд) | `src/client/tankController.ts:318` |
| Размеры стенки | `width=6, height=4, depth=0.5` | метры | Размеры защитной стенки | `src/client/tankController.ts:331` |
| `filterMembershipMask` | `32` | - | Группа защитных стен | `src/client/tankController.ts:4702` |
| `filterCollideMask` | `1 \| 2 \| 4 \| 8 \| 16` | - | Может сталкиваться со всем | `src/client/tankController.ts:4703` |

### 7.2. Модуль 7 (Ускоренная стрельба)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `module7Cooldown` | `15000` | мс | Кулдаун модуля (15 секунд) | `src/client/tankController.ts:322` |

### 7.3. Модуль 8 (Автонаводка + автострельба)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `module8Cooldown` | `20000` | мс | Кулдаун модуля (20 секунд) | `src/client/tankController.ts:326` |

### 7.4. Модуль 9 (Маневрирование)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `module9Cooldown` | `12000` | мс | Кулдаун модуля (12 секунд) | `src/client/tankController.ts:331` |

### 7.5. Модуль 0 (Прыжок)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `module0Cooldown` | `5000` | мс | Кулдаун модуля (5 секунд) | `src/client/tankController.ts:339` |
| `jumpCooldown` | `2000` | мс | Время между прыжками (2 секунды) | `src/client/tankController.ts:341` |
| `jumpDuration` | `1000` | мс | Длительность прыжка (1 секунда) | `src/client/tankController.ts:344` |
| `basePower` | `30000` | Н | Минимальная сила прыжка | `src/client/tankController.ts:5269` |
| `maxPower` | `500000` | Н | Максимальная сила прыжка (25x от базовой) | `src/client/tankController.ts:5270` |
| `maxChargeTime` | `10000` | мс | Максимальное время зарядки (10 секунд) | `src/client/tankController.ts:5265` |

---

## 8. ТОПЛИВО

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `maxFuel` | `500` | литры | Максимальное количество топлива | `src/client/tankController.ts:209` |
| `fuelConsumptionRate` | `0.5` | л/с | Расход топлива при движении (литров в секунду) | `src/client/tankController.ts:211` |

---

## 9. СИСТЕМА ТРАССЕРОВ

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `tracerCount` | `5` | шт | Количество трассеров | `src/client/tankController.ts:218` |
| `maxTracerCount` | `5` | шт | Максимальное количество трассеров | `src/client/tankController.ts:219` |
| `tracerDamage` | `10` | HP | Урон трассера (меньше обычного) | `src/client/tankController.ts:220` |
| `tracerMarkDuration` | `15000` | мс | Время метки на враге (15 секунд) | `src/client/tankController.ts:221` |
| Радиус попадания | `4.5` | метры | Радиус попадания трассера (немного больше обычного) | `src/client/tankController.ts:3066` |

---

## 10. КОНСТАНТЫ ТАНКА (TankConstants)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `INVULNERABILITY_DURATION` | `3000` | мс | Защита от урона после респавна (3 секунды) | `src/client/tank/constants.ts:6` |
| `SHIELD_DAMAGE_REDUCTION` | `0.5` | - | Щит снижает урон на 50% | `src/client/tank/constants.ts:12` |
| `STEALTH_DAMAGE_REDUCTION` | `0.7` | - | Стелс снижает урон на 30% | `src/client/tank/constants.ts:13` |
| `HIT_RADIUS_TANK` | `4.0` | метры | Радиус попадания в танк | `src/client/tank/constants.ts:16` |
| `HIT_RADIUS_TURRET` | `2.5` | метры | Радиус попадания в турель | `src/client/tank/constants.ts:17` |
| `MAX_RICOCHETS` | `3` | шт | Максимальное количество рикошетов | `src/client/tank/constants.ts:20` |
| `RICOCHET_SPEED_RETAIN` | `0.8` | - | Сохранение скорости при рикошете (80%) | `src/client/tank/constants.ts:21` |
| `MAP_BORDER` | `1000` | метры | Граница карты для удаления снарядов | `src/client/tank/constants.ts:24` |
| `PROJECTILE_MAX_DISTANCE` | `1200` | метры | Максимальное расстояние для снаряда | `src/client/tank/constants.ts:25` |
| `PROJECTILE_LIFETIME` | `6000` | мс | Время жизни снаряда (6 секунд) | `src/client/tank/constants.ts:29` |

---

## 11. ПАРАМЕТРЫ ДВИЖЕНИЯ ПО ТИПАМ ШАССИ (TankMovementConfig)

### 11.1. Light (Лёгкое)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `maxForwardSpeed` | `20` | м/с | Максимальная скорость вперёд | `src/client/tank/movement/TankMovementConfig.ts:44` |
| `maxBackwardSpeed` | `12` | м/с | Максимальная скорость назад | `src/client/tank/movement/TankMovementConfig.ts:45` |
| `acceleration` | `25` | м/с² | Ускорение | `src/client/tank/movement/TankMovementConfig.ts:46` |
| `turnSpeed` | `80` | град/с | Скорость поворота | `src/client/tank/movement/TankMovementConfig.ts:47` |

### 11.2. Medium (Среднее, по умолчанию)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `maxForwardSpeed` | `15` | м/с | Максимальная скорость вперёд | `src/client/tank/movement/TankMovementConfig.ts:30` |
| `maxBackwardSpeed` | `8` | м/с | Максимальная скорость назад | `src/client/tank/movement/TankMovementConfig.ts:31` |
| `acceleration` | `20` | м/с² | Ускорение | `src/client/tank/movement/TankMovementConfig.ts:32` |
| `deceleration` | `30` | м/с² | Замедление (торможение) | `src/client/tank/movement/TankMovementConfig.ts:33` |
| `turnSpeed` | `60` | град/с | Скорость поворота | `src/client/tank/movement/TankMovementConfig.ts:34` |
| `pivotTurnMultiplier` | `1.5` | - | Множитель скорости поворота на месте | `src/client/tank/movement/TankMovementConfig.ts:35` |
| `friction` | `0.95` | - | Трение | `src/client/tank/movement/TankMovementConfig.ts:36` |

### 11.3. Heavy (Тяжёлое)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `maxForwardSpeed` | `10` | м/с | Максимальная скорость вперёд | `src/client/tank/movement/TankMovementConfig.ts:56` |
| `maxBackwardSpeed` | `5` | м/с | Максимальная скорость назад | `src/client/tank/movement/TankMovementConfig.ts:57` |
| `acceleration` | `12` | м/с² | Ускорение | `src/client/tank/movement/TankMovementConfig.ts:58` |
| `turnSpeed` | `40` | град/с | Скорость поворота | `src/client/tank/movement/TankMovementConfig.ts:59` |

### 11.4. Superheavy (Сверхтяжёлое)

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| `maxForwardSpeed` | `6` | м/с | Максимальная скорость вперёд | `src/client/tank/movement/TankMovementConfig.ts:62` |
| `maxBackwardSpeed` | `3` | м/с | Максимальная скорость назад | `src/client/tank/movement/TankMovementConfig.ts:63` |
| `acceleration` | `8` | м/с² | Ускорение | `src/client/tank/movement/TankMovementConfig.ts:64` |
| `turnSpeed` | `25` | град/с | Скорость поворота | `src/client/tank/movement/TankMovementConfig.ts:65` |

---

## 12. ФИЗИКА ОКРУЖЕНИЯ

### 12.1. Статические объекты

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Масса | `0` | кг | Статичные объекты (неподвижные) | Различные файлы |
| Трение (большинство) | `0.5` | - | Трение для большинства объектов окружения | `src/client/maps/shared/BaseMapGenerator.ts:139` |
| Трение (горы) | `0.8` | - | Трение для гор | `src/client/maps/shared/ChunkHelpers.ts:156` |
| Трение (заборы) | `0.6` | - | Трение для заборов | `src/client/maps/shared/ChunkHelpers.ts:298` |

---

## 13. СИСТЕМА ПОПАДАНИЙ

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Радиус попадания в танк | `4.0` | метры | Радиус обнаружения попадания в корпус | `src/client/tank/constants.ts:16` |
| Радиус попадания в башню | `2.5` | метры | Радиус обнаружения попадания в башню | `src/client/tank/constants.ts:17` |
| Максимальное расстояние снаряда | `1200` | метры | Максимальная дальность полёта снаряда | `src/client/tank/constants.ts:25` |
| Время жизни снаряда | `6000` | мс | Время до автоматического удаления снаряда | `src/client/tank/constants.ts:29` |

---

## 14. ДОПОЛНИТЕЛЬНЫЕ ПАРАМЕТРЫ

### 14.1. Экстренное демпфирование

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Порог вертикальной скорости | `3.0` | м/с | Порог для активации экстренного демпфирования | `src/client/tankController.ts:3339` |
| Множитель демпфирования | `200` | - | Множитель для расчёта силы демпфирования | `src/client/tankController.ts:3340` |

### 14.2. Raycast параметры

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Длина луча для земли | `10.0` | метры | Длина луча для определения высоты земли | `src/client/tankController.ts:3445` |
| Кэш-время raycast | `8` | кадры | Интервал обновления кэша raycast | `src/client/tankController.ts:3439` |

### 14.3. Защита от проваливания

| Параметр | Значение | Единицы | Описание | Файл |
|----------|----------|---------|----------|------|
| Порог проваливания | `1.0` | метры | Порог для коррекции позиции при проваливании | `src/client/tankController.ts:3493` |

---

## ПРИМЕЧАНИЯ

1. **Единицы измерения**:
   - Силы: Ньютоны (Н)
   - Массы: килограммы (кг)
   - Расстояния: метры (м)
   - Скорости: метры в секунду (м/с)
   - Угловые скорости: радианы в секунду (рад/с) или градусы в секунду (град/с)
   - Время: миллисекунды (мс) или секунды (с)

2. **Фильтры коллизий**:
   - `1` = Игрок
   - `2` = Окружение
   - `4` = Пули игрока
   - `8` = Вражеские танки
   - `16` = Пули врагов
   - `32` = Защитные стены
   - `64` = Гильзы

3. **Переопределение параметров**:
   - Многие параметры переопределяются типом корпуса (`chassisType`)
   - Параметры пушки переопределяются типом пушки (`cannonType`)
   - Параметры движения могут переопределяться типом шасси

4. **Аркадный стиль**:
   - Снаряды имеют минимальную массу (`0.001` кг) для предотвращения толкания танков
   - Используется система "скруглённых гусениц" для улучшенной проходимости

---

**Дата создания**: 2024  
**Версия документа**: 1.0  
**Последнее обновление**: Полный список всех параметров физики игры

