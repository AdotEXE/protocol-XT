import { logger } from "../utils/logger";

/**
 * Service to handle AI/Natural Language processing for map generation
 * Primary function: Geocoding (Text -> Coordinates)
 */
export class AiService {
    private static readonly NOMINATIM_API_URL = "https://nominatim.openstreetmap.org/search";

    /**
     * Parse a user prompt to find a location
     * @param prompt User input (e.g. "Create a map of Central Park, NY")
     * @returns Coordinates {lat, lon} or null if not found
     */
    public async parseLocationPrompt(prompt: string): Promise<{ lat: number, lon: number, displayName: string } | null> {
        logger.log(`[AiService] Parsing prompt: "${prompt}"`);

        // Simple heuristic: treat the whole prompt as a location for now
        // In the future, we could use a local LLM or regex to extract "Map of [Location]"
        const query = prompt.replace(/map of/i, "").replace(/create/i, "").trim();

        try {
            const url = `${AiService.NOMINATIM_API_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Geocoding failed");
            }

            const data = await response.json();

            if (data && data.length > 0) {
                const result = data[0];
                logger.log(`[AiService] Found location: ${result.display_name} (${result.lat}, ${result.lon})`);
                return {
                    lat: parseFloat(result.lat),
                    lon: parseFloat(result.lon),
                    displayName: result.display_name
                };
            }
        } catch (error) {
            logger.error("[AiService] Error parsing location:", error);
        }

        return null;
    }
}
