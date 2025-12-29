/**
 * Tank Duplication Logger
 * Собирает и анализирует логи для диагностики проблемы дублирования танка
 */

export class TankDuplicationLogger {
    private logs: string[] = [];
    private logFile: string = '';
    private startTime: number = Date.now();

    constructor() {
        this.startTime = Date.now();
        this.logFile = `tank-duplication-logs-${this.startTime}.txt`;
    }

    log(message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        this.logs.push(logEntry);
        
        // Также выводим в консоль
        if (level === 'error') {
            console.error(logEntry);
        } else if (level === 'warn') {
            console.warn(logEntry);
        } else {
            console.log(logEntry);
        }

        // Сохраняем в файл каждые 100 логов
        if (this.logs.length % 100 === 0) {
            this.saveToFile();
        }
    }

    logTankState(chassis: any, turret: any, barrel: any, scene: any): void {
        this.log('=== TANK STATE CHECK ===', 'log');
        
        // Проверка scene.meshes
        const chassisInScene = scene.meshes.filter((m: any) => m === chassis).length;
        const turretInScene = scene.meshes.filter((m: any) => m === turret).length;
        const barrelInScene = scene.meshes.filter((m: any) => m === barrel).length;
        this.log(`scene.meshes: chassis=${chassisInScene}, turret=${turretInScene}, barrel=${barrelInScene}`, 
            chassisInScene > 1 || turretInScene > 1 || barrelInScene > 1 ? 'error' : 'log');

        // Проверка _activeMeshes
        const activeMeshes = (scene as any)._activeMeshes;
        if (activeMeshes && Array.isArray(activeMeshes)) {
            const chassisInActive = activeMeshes.filter((m: any) => m === chassis).length;
            const turretInActive = activeMeshes.filter((m: any) => m === turret).length;
            const barrelInActive = activeMeshes.filter((m: any) => m === barrel).length;
            this.log(`_activeMeshes: chassis=${chassisInActive}, turret=${turretInActive}, barrel=${barrelInActive}, total=${activeMeshes.length}`, 
                chassisInActive > 1 || turretInActive > 1 || barrelInActive > 1 ? 'error' : 'log');
            
            // КРИТИЧНО: Проверяем, не рендерятся ли дочерние меши как корневые
            // Если turret или barrel в _activeMeshes, но они дочерние элементы, это может вызвать дублирование
            if (turretInActive > 0 && turret.parent !== null) {
                this.log(`WARNING: Turret is in _activeMeshes but has parent! This may cause double rendering.`, 'warn');
            }
            if (barrelInActive > 0 && barrel.parent !== null) {
                this.log(`WARNING: Barrel is in _activeMeshes but has parent! This may cause double rendering.`, 'warn');
            }
        } else {
            this.log(`_activeMeshes: not available`, 'log');
        }

        // Проверка rendering groups
        const renderingGroups = (scene as any)._renderingGroups;
        if (renderingGroups) {
            let chassisInGroups = 0;
            let turretInGroups = 0;
            let barrelInGroups = 0;
            const groupDetails: string[] = [];
            Object.keys(renderingGroups).forEach((groupId: string) => {
                const group = renderingGroups[groupId];
                if (group && group.meshes && Array.isArray(group.meshes)) {
                    const chassisCount = group.meshes.filter((m: any) => m === chassis).length;
                    const turretCount = group.meshes.filter((m: any) => m === turret).length;
                    const barrelCount = group.meshes.filter((m: any) => m === barrel).length;
                    if (chassisCount > 0 || turretCount > 0 || barrelCount > 0) {
                        groupDetails.push(`group${groupId}: chassis=${chassisCount}, turret=${turretCount}, barrel=${barrelCount}`);
                    }
                    chassisInGroups += chassisCount;
                    turretInGroups += turretCount;
                    barrelInGroups += barrelCount;
                }
            });
            this.log(`rendering groups: chassis=${chassisInGroups}, turret=${turretInGroups}, barrel=${barrelInGroups}`, 
                chassisInGroups > 1 || turretInGroups > 1 || barrelInGroups > 1 ? 'error' : 'log');
            if (groupDetails.length > 0) {
                this.log(`rendering groups details: ${groupDetails.join('; ')}`, 'log');
            }
        } else {
            this.log(`rendering groups: not available`, 'log');
        }

        // Проверка parent-child relationships
        this.log(`hierarchy: chassis.parent=${chassis.parent?.name || 'null'}, turret.parent=${turret.parent?.name || 'null'}, barrel.parent=${barrel.parent?.name || 'null'}`);
        
        // Проверка instances
        const chassisInstances = (chassis as any).instances;
        const turretInstances = (turret as any).instances;
        const barrelInstances = (barrel as any).instances;
        this.log(`instances: chassis=${chassisInstances?.length || 0}, turret=${turretInstances?.length || 0}, barrel=${barrelInstances?.length || 0}`, 
            (chassisInstances?.length > 0 || turretInstances?.length > 0 || barrelInstances?.length > 0) ? 'error' : 'log');

        // Проверка позиций
        this.log(`positions: chassis=(${chassis.position.x.toFixed(2)}, ${chassis.position.y.toFixed(2)}, ${chassis.position.z.toFixed(2)}), turret=(${turret.position.x.toFixed(2)}, ${turret.position.y.toFixed(2)}, ${turret.position.z.toFixed(2)}), barrel=(${barrel.position.x.toFixed(2)}, ${barrel.position.y.toFixed(2)}, ${barrel.position.z.toFixed(2)})`);

        // Проверка видимости
        this.log(`visibility: chassis=${chassis.isVisible}, turret=${turret.isVisible}, barrel=${barrel.isVisible}`);
        this.log(`enabled: chassis=${chassis.isEnabled()}, turret=${turret.isEnabled()}, barrel=${barrel.isEnabled()}`);
    }

    saveToFile(): void {
        const blob = new Blob([this.logs.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.logFile;
        a.click();
        URL.revokeObjectURL(url);
    }

    getLogs(): string[] {
        return this.logs;
    }

    exportLogs(): void {
        this.saveToFile();
    }
}

// Глобальный экземпляр для использования
export const tankDuplicationLogger = new TankDuplicationLogger();

// Добавляем в window для доступа из консоли
if (typeof window !== 'undefined') {
    (window as any).tankDuplicationLogger = tankDuplicationLogger;
    (window as any).exportTankLogs = () => tankDuplicationLogger.exportLogs();
}

