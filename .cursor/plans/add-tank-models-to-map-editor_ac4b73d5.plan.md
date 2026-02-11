---
name: add-tank-models-to-map-editor
overview: Добавление возможности размещения моделей танков (корпусов, пушек, гусениц) в редакторе карт. Это позволит создавать декоративные элементы из частей танков.
todos:
  - id: import-types
    content: Импортировать типы и функции создания танков в mapEditor.ts
    status: pending
  - id: update-interface
    content: Расширить интерфейс PlacedObject и валидацию типов
    status: pending
  - id: update-ui-html
    content: Добавить HTML-элементы селекторов моделей в createUI
    status: pending
  - id: implement-ui-logic
    content: Реализовать логику заполнения и переключения селекторов
    status: pending
  - id: implement-mesh-creation
    content: Реализовать создание мешей для новых типов в createObjectMesh
    status: pending
  - id: update-placement-logic
    content: Обновить логику размещения объектов для сохранения ID моделей
    status: pending
---

# План: Добавление моделей танков в редактор карт

Цель: Позволить пользователю выбирать и размещать модели корпусов, пушек и гусениц в редакторе карт, используя существующие ассеты игры.

## 1. Расширение типов данных [src/client/mapEditor.ts]

- Обновить интерфейс `PlacedObject`:
- Расширить поле `type` значениями: `"tank_chassis"`, `"tank_cannon"`, `"tank_track"`.
- В `properties` добавить поля: `chassisId`, `cannonId`, `trackId` (опциональные строки).

## 2. Обновление UI редактора [src/client/mapEditor.ts]

- В HTML-шаблоне метода `createUI`:
- Добавить новые `<option>` в селектор `#object-type`:
- "Корпус танка" (`tank_chassis`)
- "Пушка" (`tank_cannon`)
- "Гусеницы" (`tank_track`)
- Добавить контейнеры для выбора конкретных моделей (изначально скрытые):
- `#chassis-selector` с `<select id="chassis-model">`
- `#cannon-selector` с `<select id="cannon-model">`
- `#track-selector` с `<select id="track-model">`

## 3. Логика управления UI [src/client/mapEditor.ts]

- Реализовать метод `populateTankModelSelectors()`:
- Импортировать `CHASSIS_TYPES`, `CANNON_TYPES` из `tankTypes.ts`.
- Импортировать `TRACK_TYPES` из `trackTypes.ts`.
- Заполнить соответствующие селекторы опциями (value=id, text=name).
- В `setupUIEventListeners`:
- Обновить обработчик изменения `#object-type`:
- При выборе типа танка показывать соответствующий селектор модели.
- Скрывать остальные селекторы.

## 4. Реализация создания 3D моделей [src/client/mapEditor.ts]

- Импортировать функции создания уникальных мешей:
- `createUniqueChassis` из `src/client/tank/tankChassis.ts`.
- `createUniqueCannon` из `src/client/tank/tankCannon.ts`.
- `getChassisById`, `getCannonById`, `getTrackById`.
- Обновить метод `createObjectMesh(obj: PlacedObject)`:
- Добавить `case "tank_chassis"`:
- Получать `chassisId` из `obj.properties`.
- Вызывать `createUniqueChassis`.
- Добавлять метаданные для выделения в редакторе.
- Добавить `case "tank_cannon"`:
- Получать `cannonId` из `obj.properties`.
- Вызывать `createUniqueCannon`.
- Добавлять метаданные.
- Добавить `case "tank_track"`:
- Получать `trackId` из `obj.properties`.
- Создавать упрощенный меш гусеницы (Box) с цветом и размерами из `TrackType`.

## 5. Обработка размещения объектов [src/client/mapEditor.ts]

- В методе `handleObjectPlacement`:
- При создании `PlacedObject` считывать текущее значение из соответствующего селектора модели (`#chassis-model`, `#cannon-model`, `#track-model`).
- Записывать ID модели в `properties` нового объекта.

## 6. Валидация и безопасность

- Убедиться, что при загрузке карты с несуществующими ID моделей происходит корректный fallback (например, на стандартную модель или простой куб), чтобы редактор не падал.