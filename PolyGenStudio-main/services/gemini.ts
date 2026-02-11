
import { GoogleGenAI, Type } from "@google/genai";
import { CubeElement, GenerationOptions } from "../types";

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);

const CUBE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Name of the element" },
      position: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Center [x, y, z]" },
      size: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Dimensions [w, h, d]" },
      rotation: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Rotation degrees [x, y, z]" },
      color: { type: Type.STRING, description: "Hex color" },
      material: {
        type: Type.OBJECT,
        properties: {
          roughness: { type: Type.NUMBER },
          metalness: { type: Type.NUMBER },
          emissive: { type: Type.NUMBER },
          opacity: { type: Type.NUMBER }
        },
        nullable: true
      }
    },
    required: ["name", "position", "size", "rotation", "color"]
  }
};

export const generateModel = async (options: GenerationOptions): Promise<{ cubes: CubeElement[], time: number }> => {
  const startTime = performance.now();
  // Use VITE_GEMINI_API_KEY (Vercel standard) with fallback to others for local dev
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';
  if (!apiKey) console.warn("Gemini API Key is missing! Generation will fail. Set VITE_GEMINI_API_KEY in Vercel.");
  const ai = new GoogleGenAI({ apiKey });
  const {
    prompt, useThinking, complexity, style, palette, creativity, seed, scale,
    avoidZFighting, symmetry, organicness, detailDensity, optimizationLevel,
    internalStructure, forceGround, voxelSize, hollow, lightingMode
  } = options;

  const modelName = useThinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

  const systemInstruction = `
    You are a professional 3D Voxel/Low-Poly architect. 
    Output JSON for a block-based model.
    
    SPECIAL CONSTRAINTS:
    ${avoidZFighting ? "- PREVENT Z-FIGHTING: Offset faces by 0.001 to prevent flickering." : ""}
    - SYMMETRY: ${symmetry === 'none' ? "No forced symmetry." : `Strictly apply mirror symmetry on the ${symmetry.toUpperCase()} axis.`}
    - VOXEL SIZE: Attempt to base geometry on a ${voxelSize} unit grid.
    - HOLLOW: ${hollow ? "Generate only the exterior shell." : "Fill volume."}
    - GROUND: ${forceGround ? "The model base MUST be at Y=0." : "Free placement."}
  `;

  try {
    const config: any = {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: CUBE_SCHEMA,
      temperature: creativity,
    };

    if (seed && seed !== 0) config.seed = seed;
    if (useThinking) config.thinkingConfig = { thinkingBudget: 32768 };

    let promptText = `Create a ${complexity} ${style} model of: "${prompt}".
      Organicness ${organicness}/1, Density ${detailDensity}/10. 
      Optimization: ${optimizationLevel}. Material: ${palette}. Lighting: ${lightingMode}.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: promptText }] },
      config
    });

    const rawData = JSON.parse(response.text || "[]");
    return {
      cubes: rawData.map((item: any) => ({
        id: generateId(),
        name: item.name,
        type: 'cube',
        parentId: null,
        position: { x: item.position[0], y: item.position[1], z: item.position[2] },
        size: { x: item.size[0], y: item.size[1], z: item.size[2] },
        rotation: { x: item.rotation[0], y: item.rotation[1], z: item.rotation[2] },
        color: item.color,
        material: {
          roughness: item.material?.roughness ?? 0.7,
          metalness: item.material?.metalness ?? 0.1,
          emissive: item.material?.emissive ?? 0,
          opacity: item.material?.opacity ?? 1,
          transparent: (item.material?.opacity ?? 1) < 1
        },
        visible: true,
        isLocked: false
      })),
      time: performance.now() - startTime
    };
  } catch (error) { throw error; }
};

export const repairModelWithAI = async (currentModel: CubeElement[]): Promise<{ cubes: CubeElement[], time: number }> => {
  const startTime = performance.now();
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const simplified = currentModel.map(c => ({
    name: c.name,
    position: [c.position.x, c.position.y, c.position.z],
    size: [c.size.x, c.size.y, c.size.z],
    rotation: [c.rotation.x, c.rotation.y, c.rotation.z],
    color: c.color
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Fix overlapping faces and Z-fighting glitch in this model: ${JSON.stringify(simplified)}`,
      config: {
        systemInstruction: "You are a geometry repair tool. Adjust positions/sizes by exactly 0.001 units where they touch perfectly. Return the full corrected JSON.",
        responseMimeType: "application/json",
        responseSchema: CUBE_SCHEMA
      }
    });

    const rawData = JSON.parse(response.text || "[]");
    return {
      cubes: rawData.map((item: any) => ({
        ...item,
        id: generateId(),
        type: 'cube',
        position: { x: item.position[0], y: item.position[1], z: item.position[2] },
        size: { x: item.size[0], y: item.size[1], z: item.size[2] },
        rotation: { x: item.rotation[0], y: item.rotation[1], z: item.rotation[2] },
        visible: true,
        isLocked: false
      })),
      time: performance.now() - startTime
    };
  } catch (error) { throw error; }
};

export const refineSelectionWithAI = async (selectedCubes: CubeElement[], instruction: string): Promise<{ cubes: CubeElement[], time: number }> => {
  const startTime = performance.now();
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const simplified = selectedCubes.map(c => ({
    name: c.name,
    position: [c.position.x, c.position.y, c.position.z],
    size: [c.size.x, c.size.y, c.size.z],
    rotation: [c.rotation.x, c.rotation.y, c.rotation.z],
    color: c.color
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Refine and improve these specific cubes following this instruction: "${instruction}". Existing cubes: ${JSON.stringify(simplified)}`,
      config: {
        systemInstruction: "You are an AI 3D editor. Reconstruct and replace the provided cubes with a more detailed or modified version according to user instructions. Maintain the general spatial context. Return new cubes in JSON.",
        responseMimeType: "application/json",
        responseSchema: CUBE_SCHEMA
      }
    });

    const rawData = JSON.parse(response.text || "[]");
    return {
      cubes: rawData.map((item: any) => ({
        id: generateId(),
        name: item.name,
        type: 'cube',
        parentId: null,
        position: { x: item.position[0], y: item.position[1], z: item.position[2] },
        size: { x: item.size[0], y: item.size[1], z: item.size[2] },
        rotation: { x: item.rotation[0], y: item.rotation[1], z: item.rotation[2] },
        color: item.color,
        material: item.material || { roughness: 0.7, metalness: 0.1, emissive: 0, opacity: 1, transparent: false },
        visible: true,
        isLocked: false
      })),
      time: performance.now() - startTime
    };
  } catch (error) { throw error; }
};
