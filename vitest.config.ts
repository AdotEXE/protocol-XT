import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/shared/**/*.spec.ts", "src/client/game/**/*.spec.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        globals: false,
    },
    resolve: {
        alias: {
            "@babylonjs/core": path.resolve(__dirname, "src/__mocks__/babylonjs.ts"),
        },
    },
});
