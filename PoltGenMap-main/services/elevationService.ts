export const fetchElevationGrid = async (
  lats: number[], 
  lngs: number[]
): Promise<number[]> => {
  // Open-Meteo accepts up to ~1000 points per request in some tiers, 
  // but let's use 500 to be safe and reduce HTTP overhead.
  const CHUNK_SIZE = 500;
  let allElevations: number[] = [];

  for (let i = 0; i < lats.length; i += CHUNK_SIZE) {
    const chunkLats = lats.slice(i, i + CHUNK_SIZE);
    const chunkLngs = lngs.slice(i, i + CHUNK_SIZE);

    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunkLats.join(',')}&longitude=${chunkLngs.join(',')}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Elevation API Error");
      const data = await response.json();
      if (data.elevation) {
        allElevations = [...allElevations, ...data.elevation];
      }
    } catch (e) {
      console.warn("Elevation fetch failed, falling back to flat terrain", e);
      // Fallback: return zeros for this chunk
      allElevations = [...allElevations, ...new Array(chunkLats.length).fill(0)];
    }
  }

  return allElevations;
};