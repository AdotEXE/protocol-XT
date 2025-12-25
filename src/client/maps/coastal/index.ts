/**
 * @module maps/coastal
 * @description Генератор карты "Побережье" - прибрежная зона
 */

export { CoastalGenerator, DEFAULT_COASTAL_CONFIG } from './CoastalGenerator';
export type { CoastalConfig } from './CoastalGenerator';

export const COASTAL_MAP_INFO = {
    id: "coastal" as const,
    name: "Побережье",
    description: "Береговая линия с портом, маяками, пляжами и утёсами"
};
