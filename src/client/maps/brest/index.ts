import { MAP_SIZES } from '../MapConstants';

export const BREST_MAP_INFO = {
    id: "brest" as const,
    name: "Брест",
    description: "Симметричная арена с крепостью в центре и базами по углам",
    arenaSize: MAP_SIZES.brest?.size ?? 180,
    wallHeight: MAP_SIZES.brest?.wallHeight ?? 6
};

export { BrestGenerator } from './BrestGenerator';
export { DEFAULT_BREST_CONFIG } from './BrestGenerator';


