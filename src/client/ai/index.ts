/**
 * @module ai
 * @description AI modules for enemy behavior
 * 
 * Модули:
 * - AIPathfinding - Поиск пути и навигация
 * - AICoordinator - Координация групповых тактик
 */

// Pathfinding
export { AIPathfinding, DEFAULT_PATHFINDING_CONFIG } from './AIPathfinding';
export type { PathNode, PathResult, PathfindingConfig } from './AIPathfinding';

// Coordinator
export { AICoordinator, DEFAULT_COORDINATOR_CONFIG } from './AICoordinator';
export type { BotData, TacticalRole, TacticalOrder, CoordinatorConfig } from './AICoordinator';

