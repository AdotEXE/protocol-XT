/**
 * AI Service for interacting with Google Gemini API.
 * Ported from ai_model_editor.
 */
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

// In a real integration, we should fetch this from game config or server.
// For now, we look for Vite env var or global config.
function getApiKey(): string | undefined {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        return (import.meta as any).env.VITE_GEMINI_API_KEY;
    }
    return undefined;
}

function createClient(): GoogleGenAI | null {
    const apiKey = getApiKey();

    if (!apiKey) {
        console.warn('[AiService] VITE_GEMINI_API_KEY is not set; Gemini features are disabled.');
        return null;
    }

    return new GoogleGenAI({ apiKey });
}

// Keeping the original prompts for reference/usage
export const TANK_GAME_INSTRUCTION = `You are a Lead Game Engine Architect.
Your task: Build a **PROFESSIONAL 3D TANK SIMULATION** in Babylon.js with **REAL-WORLD DATA**.

### 1. WORLD GENERATION ALGORITHM (PRIORITY: CRITICAL)
You must generate a script that fetches REAL building footprints from OpenStreetMap (Overpass API) and extrudes them into 3D meshes.

**STEP A: Coordinate System (Fixing Precision)**
- Define \`ORIGIN_LAT\` and \`ORIGIN_LON\` based on the user's target location.
- Implement a helper: \`latLonToVector3(lat, lon)\`.
- Formula: 
  \`x = (lon - ORIGIN_LON) * 111139 * cos(ORIGIN_LAT * PI/180)\`
  \`z = (lat - ORIGIN_LAT) * 111139\`
- **Crucial**: Do not use global coordinates. All meshes must be relative to the scene origin (0,0,0) to avoid floating-point jitter.

**STEP B: Data Fetching (CORS Safe)**
- Use \`fetch\` to: \`https://overpass-api.de/api/interpreter\`
- Body (POST): \`[out:json];(way["building"](around:600, \${ORIGIN_LAT}, \${ORIGIN_LON}););out body;>;out skel qt;\`
- Handle the Promise cleanly. **DO NOT** block the rendering loop while fetching. Show a HTML Loading Overlay until data is processed.

**STEP C: Mesh Generation (Earcut)**
- Parse the JSON. Match \`ways\` (buildings) to \`nodes\` (coordinates).
- Use \`BABYLON.MeshBuilder.ExtrudePolygon\` with the \`earcut\` library.
- **Error Handling**: Wrap the extrusion in a \`try-catch\`. If a building fails (bad geometry), skip it. Do not crash the app.
- **Fallback**: If the API fails (Network Error), generate a procedural grid city immediately so the user is not left in a void.

### 2. CONTROL SCHEME (KINEMATIC PHYSICS)
Implement the following controls using simple Vector3 math (No complex physics engine required):
- **W / S**: Accelerate/Decelerate (Velocity += Forward * Speed).
- **A / D**: Rotate Hull.
- **Mouse**: Rotate Turret.
- **LMB**: Fire (Raycast + Visuals).
- **Collision**: Simple distance check against building centers. If distance < (radius + 2), stop movement.

### 3. CODE STRUCTURE (NO ERRORS)
- **NO \`eval()\`**.
- **NO Unreachable Code**: Ensure \`return scene;\` is the LAST line of \`createScene\`.
- **NO External Workers**: Keep logic in the main thread for simplicity in this single-file output.
- **Daylight**: Set \`scene.clearColor\` to Hex \`#87CEEB\`. Add a bright HemisphericLight.

### DEPENDENCIES
- Babylon.js
- Earcut (REQUIRED for buildings): \`<script src="https://cdn.babylonjs.com/earcut.min.js"></script>\`

### BOILERPLATE
Return a SINGLE HTML file starting with \`<!DOCTYPE html>\`.
Include:
1. \`<div id="loading">Loading Real World Data...</div>\`
2. CSS to overlay the loading screen.
3. JS logic to hide the loading screen once \`createScene\` fully loads the buildings.
`;

const GENERAL_APP_INSTRUCTION = `You are an expert Senior Frontend Engineer and Creative Coder.
Your task: Analyze the user's request (text or image) and generate a **SINGLE, COMPLETE HTML FILE** that brings the idea to life.

### OBJECTIVE
Create a fully functional, interactive, and visually stunning web application in a single HTML file.

### RULES
1.  **SINGLE FILE**: All HTML, CSS, and JavaScript must be in one file. No external local files.
2.  **LIBRARIES**: Use reliable CDNs (e.g., Tailwind CSS, React via CDN, P5.js, Three.js, Babylon.js, GSAP).
3.  **DESIGN**: Modern, clean, "Linear-style" aesthetics. Dark mode by default unless specified.
4.  **INTERACTIVITY**: The app must be interactive. It should not just be a static mockup.
5.  **ROBUSTNESS**: Handle errors gracefully. Ensure the code works within an iframe.

### RESPONSE FORMAT
Return ONLY valid HTML starting with \`<!DOCTYPE html>\`.
`;

// Helper to wrap promise with timeout
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Operation timed out after ${ms}ms`));
        }, ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((reason) => {
                clearTimeout(timer);
                reject(reason);
            });
    });
};

export class AiService {
    static async bringToLife(prompt: string, fileBase64?: string, mimeType?: string, location?: string, mapSize?: string): Promise<string> {
        const parts: any[] = [];

        let userPrompt = "";
        // Default to Flash for speed and general tasks
        let modelName = 'gemini-2.5-flash';
        let systemInstruction = GENERAL_APP_INSTRUCTION;

        if (location) {
            // MODE: 3D Map/Game Generation
            // In the game integration, we might intercept this to return JSON data instead of HTML in future.
            modelName = 'gemini-2.5-flash';
            systemInstruction = TANK_GAME_INSTRUCTION;

            userPrompt = `Generate a REAL-WORLD 3D TANK SIMULATION using OPENSTREETMAP.
        
        **Target**: "${location}"
        
        **TASK**:
        1. **Coordinates**: Find LAT/LON for "${location}". REPLACE C_LAT/C_LON in the code.
        2. **World**: FETCH REAL DATA via Overpass API. NO FAKE BOXES.
        3. **Physics**: Robust Hover Physics & Collisions.
        `;
        } else if (fileBase64 && mimeType) {
            // MODE: Image/Wireframe to App
            modelName = 'gemini-3-pro-preview'; // Or flash if easier
            systemInstruction = GENERAL_APP_INSTRUCTION;

            userPrompt = `Analyze this image. It is a wireframe, sketch, or screenshot.
        Turn it into a fully functional, interactive HTML/JS web application.
        
        - Match the layout, colors, and typography.
        - Make all buttons and inputs interactive.
        - If it looks like a game, make it playable.
        - If it looks like a dashboard, populate it with mock data.
        `;
        } else {
            // MODE: Text to App
            modelName = 'gemini-2.5-flash';
            systemInstruction = GENERAL_APP_INSTRUCTION;
            userPrompt = prompt || "Create a robust, interactive web application.";
        }

        parts.push({ text: userPrompt });

        if (fileBase64 && mimeType) {
            parts.push({
                inlineData: {
                    data: fileBase64,
                    mimeType: mimeType,
                },
            });
        }

        try {
            const client = createClient();
            if (!client) {
                return "<!-- AI Service Unavailable: Missing API Key -->";
            }

            const response: GenerateContentResponse = await withTimeout(
                client.models.generateContent({
                    model: modelName,
                    contents: {
                        parts: parts
                        // Note: role property usually handled by library
                    } as any, // Cast to avoid type strictness if SDK mismatch
                    config: {
                        systemInstruction: systemInstruction,
                        temperature: 0.4,
                    },
                }),
                300000
            );

            let text = response.text || "<!-- Failed to generate content -->";
            text = text.replace(/^```html\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');

            return text;
        } catch (error) {
            console.error("Gemini Generation Error:", error);
            throw error;
        }
    }
}
