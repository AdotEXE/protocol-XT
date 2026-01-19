const fs = require('fs');
const path = "c:/Users/dzoblin/Desktop/TX/src/client/tankController.ts";
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);

// Target range: 558 to 1551 (1-based)
const startLine = 558;
const endLine = 1551;

// Indices
const startIndex = startLine - 1;
const endIndex = endLine - 1;

// Verify start line content roughly to be safe
const startLineContent = lines[startIndex].trim();
if (!startLineContent.startsWith("// Загружаем") && !startLineContent.startsWith("// Load")) {
    console.error("Start line content mismatch! Found: " + startLineContent);
    // Be robust: check if line shifted
    // Previous edit failures shouldn't shift lines, but let's be careful.
    // If it fails, I'll abort.
    process.exit(1);
}

const newInit = [
    "        // 5. Initialize modules (before visuals to use them)",
    "        this.healthModule = new TankHealthModule(this);",
    "        this.movementModule = new TankMovementModule(this);",
    "        this.projectilesModule = new TankProjectilesModule(this);",
    "        this.visualsModule = new TankVisualsModule(this);",
    "",
    "        // 6. Build visuals and load configuration",
    "        this.rebuildTankVisuals(position);",
    "",
    "        // 7. Loop & Inputs (Run ONCE)",
    "        scene.onBeforePhysicsObservable.add(() => this.updatePhysics());",
    "        ",
    "        // 3.1 КРИТИЧНО: Обновляем кэш позиций ПОСЛЕ шага физики, чтобы камера использовала актуальные данные",
    "        scene.onAfterPhysicsObservable.add(() => this.updatePositionCache());",
    "",
    "        // 3.2 Инициализируем кэш позиций сразу",
    "        if (this.chassis) {",
    "            this._cachedChassisPosition.copyFrom(this.chassis.absolutePosition);",
    "        }",
    "",
    "        // 4. Inputs",
    "        this.setupInput();",
    "",
    "        logger.log(\"TankController: Init Success\");",
    "    }" // Closing brace
];

// Splice
lines.splice(startIndex, endIndex - startIndex + 1, ...newInit);

fs.writeFileSync(path, lines.join('\n'));
console.log("Fixed TankController.ts successfully.");
