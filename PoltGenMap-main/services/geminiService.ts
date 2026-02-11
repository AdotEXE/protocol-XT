import { GoogleGenAI, Type } from "@google/genai";
import { GeoLocationData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getArchitecturalInsights = async (
  query: string, 
  context: string
): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Context: The user is designing a Low-Poly geospatial game engine using Babylon.js and Havok.
      Technical Context: ${context}
      
      User Query: ${query}
      
      Provide a technical, concise answer focusing on architectural patterns (Floating Origin, Thin Instances, PBF Parsing).`,
      config: {
        tools: [{ googleSearch: {} }] // Enable search for latest docs/patterns
      }
    });
    return response.text || "No insights generated.";
  } catch (error) {
    console.error("AI Insight Error:", error);
    return "Failed to retrieve architectural insights. Please check API configuration.";
  }
};

export const parseLocationSeed = async (locationName: string): Promise<GeoLocationData> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Find geographical details for: ${locationName}. 
      
      CRITICAL INSTRUCTION:
      If the user provides a specific STREET ADDRESS (e.g., "10 Downing Street" or "Nevsky Prospect 25"), return the EXACT coordinates of that specific building/location. DO NOT default to the city center.
      
      Also, provide an ESTIMATE of the total number of buildings in this city/town. If exact data is unknown, provide a realistic estimate based on population (approx 1 building per 3-4 people). THIS FIELD MUST BE A NUMBER > 0.
      
      Return:
      1. Latitude/Longitude (Exact precision).
      2. Terrain classification (mountain, plain, urban, coast).
      3. Estimated Building Count (Official or Calculated).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            latitude: { type: Type.NUMBER },
            longitude: { type: Type.NUMBER },
            terrainType: { type: Type.STRING },
            estimatedBuildingCount: { type: Type.INTEGER, description: "Total estimated buildings in the real city" }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No data returned");
    
    // Fallback parsing if JSON is wrapped in markdown
    const cleanJson = text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleanJson);
    
    // Adapt to flexible schema return
    return {
      name: locationName,
      lat: data.latitude || 0,
      lng: data.longitude || 0,
      terrainType: data.terrainType || 'plain',
      estimatedBuildingCount: data.estimatedBuildingCount || 1000 // Fallback to 1000 if 0
    };
  } catch (error) {
    console.warn("Location parsing failed, using random seed", error);
    return {
      name: locationName,
      lat: 0,
      lng: 0,
      terrainType: 'plain',
      estimatedBuildingCount: 0
    };
  }
};