export const generateId = () => Math.random().toString(36).substr(2, 9);

const UNIQUE_PREFIXES = ["Cyber", "Apex", "Nova", "Neo", "Primal", "Void", "Quantum", "Hyper", "Aura", "Zen"];
const UNIQUE_NOUNS = ["Entity", "Nexus", "Module", "Core", "Spire", "Drifter", "Titan", "Unit", "Beacon", "Sliver"];

export const getUniqueFileName = () => {
    const p = UNIQUE_PREFIXES[Math.floor(Math.random() * UNIQUE_PREFIXES.length)];
    const n = UNIQUE_NOUNS[Math.floor(Math.random() * UNIQUE_NOUNS.length)];
    return `${p}_${n}_${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`;
};
