# Ghost HUD Mobile Control System - Technical Prompt

## Overview
Реализована система "Ghost HUD" для мобильного управления танковым симулятором Protocol TX. Система минимизирует перекрытие экрана (90% чистого обзора) при предоставлении полного контроля уровня ПК через интеллектуальную абстракцию UI.

## Реализованные компоненты

### 1. DynamicOpacityManager
**Файл**: `src/client/mobile/DynamicOpacityManager.ts`

Централизованное управление прозрачностью UI элементов на основе контекста игры.

**Состояния**:
- `idle`: 25% прозрачность в покое
- `active`: 90% при активном касании
- `sniper`: 10% в режиме снайпера (4x zoom)

**API**:
```typescript
registerElement(id, control, category, baseOpacity)
setState(state: 'idle' | 'active' | 'sniper')
setZoom(zoom: number) // Автоматически переключает в sniper при zoom >= 3.5
setAiming(aiming: boolean)
setElementTouched(id, touched: boolean)
update(deltaTime) // Вызывать каждый кадр
```

### 2. VirtualScrollWheel
**Файл**: `src/client/mobile/VirtualScrollWheel.ts`

Плавное аналоговое управление зумом (1x-4x) с инерционной прокруткой.

**Особенности**:
- Невидимая зона касания (появляется при касании)
- Инерционная прокрутка с затуханием
- Тактильная обратная связь при изменении уровня зума
- FOV интерполяция (не кроп)

**API**:
```typescript
setOnZoomChange(callback: (zoom: number) => void)
getCurrentZoom(): number
setZoom(zoom: number)
```

### 3. GunElevationSlider
**Файл**: `src/client/mobile/GunElevationSlider.ts`

Вертикальный слайдер для независимого управления углом возвышения орудия.

**Параметры**:
- Диапазон: -15° до +30°
- Визуальные маркеры каждые 5°
- Отдельно от камеры

**API**:
```typescript
setOnAngleChange(callback: (angle: number) => void)
getCurrentAngle(): number
setAngle(angle: number)
```

### 4. FreeLookZone
**Файл**: `src/client/mobile/FreeLookZone.ts`

Зона свободного обзора камеры без поворота башни.

**Механика**:
- Верхняя центральная зона экрана (30% от верха, 30-70% по ширине)
- Блокирует поворот башни при активном free-look
- Визуальный индикатор при активации

**API**:
```typescript
setOnFreeLookChange(callback: (deltaX, deltaY) => void)
isActive(): boolean
setEnabled(enabled: boolean)
```

### 5. RadialMenu
**Файл**: `src/client/mobile/RadialMenu.ts`

Радиальное меню для доступа к модулям 0-9 (решает проблему 10 кнопок).

**Структура**:
- До 8 секторов
- Вложенные меню (Main → Category → Item)
- Автозакрытие через 1 секунду

**API**:
```typescript
show(items: RadialMenuItem[], position: {x, y})
hide()
isVisible(): boolean
```

### 6. ContextualRepair
**Файл**: `src/client/mobile/ContextualRepair.ts`

Контекстные кнопки ремонта, появляющиеся только при повреждении модулей.

**Поведение**:
- Одно повреждение → одна кнопка
- Несколько повреждений → кнопка с количеством, открывает радиальное меню
- Пульсация для критических повреждений

**API**:
```typescript
onModuleDamaged(module: DamagedModule)
onModuleRepaired(moduleId: string)
```

### 7. Auto-Run для FloatingJoystick
**Файл**: `src/client/mobile/FloatingJoystick.ts` (модифицирован)

**Механика**:
- Вытянуть джойстик на максимальный радиус (95%)
- Удерживать 2 секунды
- Активация auto-run (throttle = 1.0)
- Визуальная обратная связь (пульсация, изменение цвета)

**API**:
```typescript
setOnAutoRunChange(callback: (active: boolean) => void)
```

### 8. Sniper Sensitivity Manager
**Файл**: `src/client/mobile/MobileControlsManager.ts` (интегрирован)

Автоматическое снижение чувствительности при зуме >= 3.5x.

**Механика**:
- Базовая чувствительность: 0.0004
- Снайперская: 0.0001 (25% от базовой)
- Плавный переход между режимами

## Интеграция

Все компоненты интегрированы в `MobileControlsManager.ts`:

```typescript
// События для связи с игровыми системами
'mobileZoomChange' // { zoom: number }
'gunElevationChange' // { angle: number }
'freeLookChange' // { deltaX, deltaY }
'sniperSensitivityChange' // { sensitivity, zoom }
'moduleDamaged' // { moduleId, severity }
'moduleRepaired' // { moduleId }
```

## Использование

Система автоматически инициализируется при обнаружении мобильного устройства через `isMobileDevice()`. Все компоненты создаются в `MobileControlsManager.initializeGhostHUD()`.

## Следующие шаги для полной интеграции

1. **GameCamera.ts**: Обработать события `freeLookChange` и `gunElevationChange`
2. **TankController.ts**: Обработать `gunElevationChange` и эмитировать `moduleDamaged` события
3. **HUDCustomizer** (опционально): Drag-and-drop кастомизация layout

