// Gemini AI service for location parsing and terrain detection
import { GoogleGenAI, Type } from "@google/genai";

export interface GeoLocationData {
    name: string;
    lat: number;
    lng: number;
    terrainType: 'mountain' | 'plain' | 'urban' | 'coast';
    estimatedBuildingCount?: number;
}

// Use environment variable or fallback to empty (will fail gracefully)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const parseLocationSeed = async (locationName: string): Promise<GeoLocationData> => {
    if (!ai) {
        console.warn("[Gemini] No API key configured, using fallback");
        return {
            name: locationName,
            lat: 0,
            lng: 0,
            terrainType: 'plain',
            estimatedBuildingCount: 0
        };
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: `Find geographical details for: ${locationName}. 
      
      CRITICAL INSTRUCTION:
      If the user provides a specific STREET ADDRESS, return the EXACT coordinates of that specific location.
      
      Return:
      1. Latitude/Longitude (Exact precision).
      2. Terrain classification (mountain, plain, urban, coast).
      3. Estimated Building Count.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        latitude: { type: Type.NUMBER },
                        longitude: { type: Type.NUMBER },
                        terrainType: { type: Type.STRING },
                        estimatedBuildingCount: { type: Type.INTEGER }
                    }
                }
            }
        });

        let text = response.text || "{}";

        // Cleanup markdown
        text = text.replace(/```json|```/g, '').trim();

        // Locate JSON object if surrounded by text
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            text = text.substring(firstBrace, lastBrace + 1);
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.warn("[Gemini] JSON parse failed, attempting loose repair...", e);
            // Fallback: try to extract fields via regex if JSON is broken
            const latMatch = text.match(/"latitude"\s*:\s*([\d.-]+)/);
            const lngMatch = text.match(/"longitude"\s*:\s*([\d.-]+)/);
            data = {
                latitude: latMatch ? parseFloat(latMatch[1]) : 0,
                longitude: lngMatch ? parseFloat(lngMatch[1]) : 0,
                terrainType: 'plain',
                estimatedBuildingCount: 1000
            };
        }

        console.log(`[Gemini] Parsed location: ${locationName} -> ${data.latitude}, ${data.longitude}`);

        return {
            name: locationName,
            lat: data.latitude || 0,
            lng: data.longitude || 0,
            terrainType: data.terrainType || 'plain',
            estimatedBuildingCount: data.estimatedBuildingCount || 1000
        };
    } catch (error) {
        console.warn("[Gemini] Location parsing failed, using fallback", error);
        return {
            name: locationName,
            lat: 0,
            lng: 0,
            terrainType: 'plain',
            estimatedBuildingCount: 0
        };
    }
};
