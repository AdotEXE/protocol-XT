# Аудит: все места с геометрией не-Box

Полный список использований примитивов **не Box** в проекте (Cylinder, Sphere, Torus, Disc, Ground, Plane, Lines, Ribbon).

---

## CreateCylinder

| Файл | Строка | Описание |
|------|--------|----------|
| **chunkSystem.ts** | 2158 | workbenchGear |
| chunkSystem.ts | 2184 | workbenchBolt |
| chunkSystem.ts | 2198 | workbenchRoadWheel |
| chunkSystem.ts | 2211 | workbenchSpring |
| chunkSystem.ts | 2237 | workbenchHose |
| chunkSystem.ts | 2297 | latheChuck |
| chunkSystem.ts | 2349 | latheSpindle |
| chunkSystem.ts | 2362 | latheCenter |
| chunkSystem.ts | 2388 | latheHandle1 |
| chunkSystem.ts | 2399 | latheHandle2 |
| chunkSystem.ts | 2449 | latheWheel |
| chunkSystem.ts | 2502 | garageCannonBarrel |
| chunkSystem.ts | 2560 | garageShell |
| chunkSystem.ts | 5022 | fountainPool |
| chunkSystem.ts | 5029 | fountainWater |
| chunkSystem.ts | 5036 | fountainColumn |
| chunkSystem.ts | 5094 | flowerBed |
| chunkSystem.ts | 6566 | fuelTank |
| chunkSystem.ts | 7188 | smoke |
| chunkSystem.ts | 7313 | waterCrater |
| chunkSystem.ts | 8996 | waterfallPool |
| chunkSystem.ts | 9162 | lake |
| chunkSystem.ts | 9439 | industrialBarrel |
| chunkSystem.ts | 9592 | storage_tank |
| chunkSystem.ts | 9617 | pipe |
| chunkSystem.ts | 9800 | urn |
| chunkSystem.ts | 10261 | underground_lake |
| chunkSystem.ts | 10535 | buoy |
| chunkSystem.ts | 10681 | harbor |
| **enemyTank.ts** | 992-993 | pipe1, pipe2 (модуль cylinder_pair) |
| **GameMultiplayerCallbacks.ts** | 3712 | netProjectile mesh |
| **networkPlayerTank.ts** | 694-695 | pipe1, pipe2 (модуль cylinder_pair) |
| **tankController.ts** | 801 | module9_piston |
| **BaseMapGenerator.ts** | 300 | createCylinder (общий метод) |
| **PolygonGenerator.ts** | 940 | fuelTank |
| **FrontlineGenerator.ts** | 389 | smoke |
| FrontlineGenerator.ts | 654 | waterCrater |
| **controlPointVisualizer.ts** | 34 | cp_platform |
| controlPointVisualizer.ts | 48 | cp_pole |
| **ctfVisualizer.ts** | 75 | ctfPole |
| **mapEditor/GizmoSystem.ts** | 234 | arrow |
| GizmoSystem.ts | 255 | arrowCone |
| **ChunkHelpers.ts** | 147 | mountain |
| ChunkHelpers.ts | 229 | lake |
| ChunkHelpers.ts | 460 | treeTrunk |
| ChunkHelpers.ts | 478 | treeCrown (cylinder) |
| **tank/tankEquipment.ts** | 240-241 | pipe1, pipe2 (cylinder_pair) |
| **garage/trajectoryVisualization.ts** | 57 | target cylinder |

---

## CreateSphere

| Файл | Строка | Описание |
|------|--------|----------|
| **tankController.ts** | 8296 | energyShield |
| **BaseMapGenerator.ts** | 328 | createSphere (общий метод) |
| **escortVisualizer.ts** | 93 | escort_progress marker |
| **controlPointVisualizer.ts** | 61 | cp_indicator |
| **workshop/AttachmentPointEditor.ts** | 111 | pivotMarker |
| AttachmentPointEditor.ts | 123 | barrelMarker |
| **mapEditor/GizmoSystem.ts** | 344 | scaleCenter handle |
| **mapEditor/AttachmentMarkers.ts** | 54 | pivotMarker |
| AttachmentMarkers.ts | 67 | barrelMarker |
| **ctfVisualizer.ts** | 91 | ctfBeacon |
| **physicsVisualizer.ts** | 134 | collision sphere |
| physicsVisualizer.ts | 212 | com (center of mass) |
| **physicsSimulator.ts** | 73, 80 | obj1, obj2 (тестовые сферы) |
| **garage/preview.ts** | 250 | previewProjectile |
| **ChunkHelpers.ts** | 491 | treeCrown (sphere variant) |

---

## CreateTorus

| Файл | Строка | Описание |
|------|--------|----------|
| **controlPointVisualizer.ts** | 73 | cp_progress ring |
| **mapEditor/GizmoSystem.ts** | 303 | ring (gizmo) |
| **garage/trajectoryVisualization.ts** | 76 | ring |
| **ChunkHelpers.ts** | 51 | craterRim |

---

## CreateDisc

| Файл | Строка | Описание |
|------|--------|----------|
| **supplyDropSystem.ts** | 238 | drop_chute (парашют) |
| **mapEditor.ts** | 5593 | brushIndicator |
| **ChunkHelpers.ts** | 63 | craterBottom |

---

## CreateGround

| Файл | Строка | Описание |
|------|--------|----------|
| **chunkSystem.ts** | 3876 | ground (террейн чанка) |
| **RealWorldGeneratorV3.ts** | 411 | rwg_ground |
| **maps/sand/SandGenerator.ts** | 136 | sand_ground |
| **game/createSafetyPlane.ts** | 29 | safetyPlane |
| **CustomMapRunner.ts** | 212 | customMapFloor |
| **SimpleMapLoader.ts** | 101 | simpleMapFloor |
| **CustomMapLoader.ts** | 364 | customMapFloor |
| **garage/preview.ts** | 134 | previewGround |

---

## CreatePlane

| Файл | Строка | Описание |
|------|--------|----------|
| **enemyTank.ts** | 1360 | healthBarBackground |
| enemyTank.ts | 1373 | healthBar |
| enemyTank.ts | 1386 | distanceTextPlane |
| **networkPlayerTank.ts** | 1774 | healthBarBackground |
| networkPlayerTank.ts | 1792 | healthBar |
| networkPlayerTank.ts | 1811 | distanceTextPlane |
| **mapEditor.ts** | 5037 | garageLabel |
| mapEditor.ts | 5196 | moduleIcon |
| **CustomMapRunner.ts** | 586 | garageLabel |
| **GameGarage.ts** | 1162 | respawnTimer billboard |
| **enemy.ts** | 158 | turretHp |
| enemy.ts | 190 | distanceTextPlane |
| **ctfVisualizer.ts** | 42 | ctfFlag |

---

## CreateLines / CreateDashedLines / CreateLineSystem

| Файл | Строка | Описание |
|------|--------|----------|
| **chunkSystem.ts** | 657 | chunkGridLines |
| **GameMultiplayerCallbacks.ts** | 1958 | reconciliation_line |
| **tankController.ts** | 5070 | trajectoryLine |
| **escortVisualizer.ts** | 74 | escort_route |
| **debugDashboard.ts** | 1301, 1307, 1313 | xAxis, yAxis, zAxis |
| **tank/tankTrajectoryVisualization.ts** | 63, 137 | trajectoryLine |
| **garage/trajectoryVisualization.ts** | 140 | trajectoryLine |
| **debug/SyncDebugVisualizer.ts** | 79, 85 | syncLine |
| **physicsVisualizer.ts** | 142, 186, 201 | normal, vector, arrow lines |
| **battleRoyale.ts** | 107, 146, 176 | safeZoneBorder, nextZoneBorder |

---

## CreateRibbon

| Файл | Строка | Описание |
|------|--------|----------|
| **RealWorldGeneratorV3.ts** | 867 | rwg_river |

---

## Сводка по типам

| Примитив | Количество вхождений (прибл.) |
|----------|------------------------------|
| CreateCylinder | ~55 |
| CreateSphere | ~18 |
| CreateTorus | 4 |
| CreateDisc | 3 |
| CreateGround | 8 |
| CreatePlane | ~14 |
| CreateLines / CreateLineSystem | ~15 |
| CreateRibbon | 1 |

**Итого:** более 118 мест с не-Box геометрией. Для перехода на «только Box» каждое нужно заменить на бокс(ы) или явно исключить (например, Lines для отладочной визуализации, Ground для единственного террейна — по решению проекта).
