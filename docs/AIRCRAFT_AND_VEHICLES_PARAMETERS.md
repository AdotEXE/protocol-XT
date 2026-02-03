# Параметры самолёта и будущей техники

Справочник по конфигурации **авиационной физики** и задел под другие типы техники (вертолёт, дрон, катер и т.д.). Подстройка в реальном времени — через [src/client/config/aircraftVehicleConfig.ts](../src/client/config/aircraftVehicleConfig.ts).

---

## Содержание

1. [Самолёт (AircraftPhysicsConfig)](#самолёт-aircraftphysicsconfig)
2. [Конфиг модификаторов самолёта](#конфиг-модификаторов-самолёта)
3. [Будущие типы техники](#будущие-типы-техники)

---

## Самолёт (AircraftPhysicsConfig)

Источник: [src/client/config/aircraftPhysicsConfig.ts](../src/client/config/aircraftPhysicsConfig.ts). Используется в [AircraftPhysics](../src/client/tank/aircraftPhysics.ts) и [AircraftCameraSystem](../src/client/tank/aircraftCameraSystem.ts).

### Базовые параметры

| Параметр | Значение | Описание |
|----------|----------|----------|
| controlMode | "mouseAim" | Режим: mouseAim / direct / hybrid |
| minSpeed | 20.0 м/с | Минимальная скорость |
| maxSpeed | 80.0 м/с | Максимальная скорость |
| baseSpeed | 50.0 м/с | Базовая скорость |
| mass | 15000 кг | Масса самолёта |
| centerOfMass | (0, -0.2, -0.5) | Центр масс (Vector3) |
| inertiaTensor | (5000, 8000, 3000) | Моменты инерции (кг·м²) |

### PID (pitch / yaw / roll)

| Параметр | Значение | Описание |
|----------|----------|----------|
| pitchKp, pitchKi, pitchKd | 8.0, 0.5, 12.0 | PID по тангажу |
| yawKp, yawKi, yawKd | 6.0, 0.3, 10.0 | PID по рысканию |
| rollKp, rollKi, rollKd | 10.0, 0.4, 15.0 | PID по крену |
| maxIntegral | 50.0 | Ограничение интеграла (anti-windup) |

### Аэродинамика (aerodynamics)

| Параметр | Значение | Описание |
|----------|----------|----------|
| airDensitySeaLevel | 1.225 кг/м³ | Плотность воздуха у земли |
| airDensityDecay | 0.0001 1/м | Спад плотности с высотой |
| wingArea | 50.0 м² | Площадь крыла |
| baseLiftCoefficient | 0.1 | Базовый коэффициент подъёмной силы |
| maxLiftCoefficient | 1.8 | Максимальный Cl |
| criticalAngleOfAttack | 0.26 рад (~15°) | Критический угол атаки |
| zeroLiftDragCoefficient | 0.02 | Сопротивление при нулевой подъёмной силе |
| inducedDragFactor | 0.05 | Индуцированное сопротивление |
| maxThrust | 75000 Н | Максимальная тяга |
| minThrust | 10000 Н | Минимальная (idle) тяга |
| throttleRate | 0.3 1/с | Скорость изменения тяги (%/с) |

### Mouse-Aim (mouseAim)

| Параметр | Значение | Описание |
|----------|----------|----------|
| lookAheadDistance | 1000.0 м | Дистанция до цели по лучу мыши |
| minLookAheadDistance | 200.0 м | Минимум |
| maxLookAheadDistance | 2000.0 м | Максимум |
| maxBankAngle | 0.785 рад (45°) | Макс. крен для координированного виража |
| bankTransitionSpeed | 3.0 | Скорость выхода в крен |
| alphaLimit | 0.35 рад | Ограничение угла атаки (анти-сваливание) |
| enableAlphaLimiter | true | Вкл/выкл ограничитель |
| mouseAimGain | 2.2 | Усиление отклика на ошибку |
| mouseAimDeadzone | 0.05 рад | Мёртвая зона по ошибке |
| pointerLockSensitivityMultiplier | 0.4 | Множитель чувствительности при pointer lock |
| mouseAimSmoothing | 0.18 | Сглаживание (0–1) |
| maxSmoothedDeltaPerFrame | 0.018 | Лимит изменения сглаженного ввода за кадр |
| maxRotationSpeedRadPerSec | 1.5 рад/с | Макс. угловая скорость (мышь) |
| mouseAimFollowGain | 1.2 | Gain для следования за центром |
| mouseAimBlendToTarget | 0.14 | Смещение к целевой угловой скорости за кадр |

### Клавиатура (keyboard)

| Параметр | Значение | Описание |
|----------|----------|----------|
| pitchSensitivity | 14.0 рад/с² | Q/E — тангаж |
| rollSensitivity | 16.0 рад/с² | A/D — крен |
| yawSensitivity | 10.0 рад/с² | Рыскание |
| maxRotationSpeedRadPerSec | 2.8 рад/с | Лимит при управлении с клавиатуры |
| keyboardOverridesMouseAim | true | Приоритет клавиатуры над мышь-прицелом |

### Камера (camera)

| Параметр | Значение | Описание |
|----------|----------|----------|
| chaseDistance | 25.0 м | Дистанция камеры сзади |
| chaseHeight | 8.0 м | Высота камеры над самолётом |
| smoothness | 0.3 | Сглаживание камеры (0–1) |
| lagFactor | 0.05 | Задержка при манёврах |
| worldUpAlignment | true | Выравнивание по миру (true) или по самолёту (false) |

### Автовыравнивание и ограничения

| Параметр | Значение | Описание |
|----------|----------|----------|
| enableAutoLevel | true | Автовыравнивание при отсутствии ввода |
| autoLevelStrength | 3.5 | Сила выравнивания крена/тангажа |
| cameraAlignGain | 2.0 | Разворот носом к камере при отсутствии ввода |
| noInputAngularDamping | 0.82 | Затухание угловой скорости при отпускании |
| levelAssistStrength | 0.22 | Подтяжка в уровень при активном вводе |
| stallWarningMinSpeed | 8.0 м/с | Порог предупреждения STALL |
| minAltitude | 15.0 м | Минимальная высота над землёй |

---

## Конфиг модификаторов самолёта

Файл [src/client/config/aircraftVehicleConfig.ts](../src/client/config/aircraftVehicleConfig.ts):

- **AIRCRAFT_MODIFIERS** — объект `Partial<AircraftPhysicsConfig>`; накладывается на `DEFAULT_AIRCRAFT_PHYSICS_CONFIG`.
- **getAircraftPhysicsConfig()** — возвращает итоговую конфигурацию (база + модификаторы). Её передают в `AircraftPhysics` и в `AircraftCameraSystem` (поле `camera`).
- В консоли браузера доступен **window.aircraftVehicleConfig** для отладки.

---

## Будущие типы техники

Здесь можно добавлять разделы по новым классам (вертолёт, дрон, катер и т.д.) по мере появления:

- Отдельный конфиг-файл по аналогии с `aircraftPhysicsConfig.ts`.
- Документация параметров в этом файле или в [VEHICLE_PHYSICS_PARAMETERS.md](VEHICLE_PHYSICS_PARAMETERS.md).
- При необходимости — общий слой модификаторов в `aircraftVehicleConfig.ts` (например, по типу техники: `plane`, `helicopter`, …).

Текущая реализация полёта: корпус **plane** (Warhawk) в [tankTypes.ts](../src/client/tankTypes.ts) + [AircraftPhysics](../src/client/tank/aircraftPhysics.ts) + [AircraftCameraSystem](../src/client/tank/aircraftCameraSystem.ts).
