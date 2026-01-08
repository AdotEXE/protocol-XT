import { MAP_SIZES } from '../MapConstants';

export const ARENA_MAP_INFO = {
    id: "arena" as const,
    name: "Арена",
    description: "Киберспортивная арена с симметричной структурой и множеством тактических позиций",
    arenaSize: MAP_SIZES.arena?.size ?? 160,
    wallHeight: MAP_SIZES.arena?.wallHeight ?? 6
};

export { ArenaGenerator } from './ArenaGenerator';
export { DEFAULT_ARENA_CONFIG } from './ArenaGenerator';


