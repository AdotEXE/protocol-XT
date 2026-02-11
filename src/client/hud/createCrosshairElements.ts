/**
 * Создание элементов тактического прицела (кольца, точка, линии, углы).
 * Вынесено из HUD для уменьшения размера hud.ts.
 */

import { Rectangle } from "@babylonjs/gui";
import type { AdvancedDynamicTexture } from "@babylonjs/gui";
import { scalePixels } from "../utils/uiScale";

export interface CreateCrosshairElementsResult {
    elements: Rectangle[];
    dot: Rectangle;
}

const CROSSHAIR_OFFSET_PX = 15;

/**
 * Создаёт элементы прицела (внешнее/среднее кольцо, точка, тактические линии с тенью, угловые маркеры),
 * добавляет их в guiTexture и возвращает массив elements и центральную точку dot.
 */
export function createCrosshairElements(guiTexture: AdvancedDynamicTexture): CreateCrosshairElementsResult {
    const elements: Rectangle[] = [];

    const outerRing = new Rectangle("crosshairOuter");
    const outerSize = scalePixels(60);
    outerRing.width = `${outerSize}px`;
    outerRing.height = `${outerSize}px`;
    outerRing.cornerRadius = outerSize / 2;
    outerRing.thickness = 1;
    outerRing.color = "transparent";
    outerRing.background = "transparent";
    outerRing.isVisible = false;
    guiTexture.addControl(outerRing);
    elements.push(outerRing);

    const middleRing = new Rectangle("crosshairMiddle");
    const middleSize = scalePixels(30);
    middleRing.width = `${middleSize}px`;
    middleRing.height = `${middleSize}px`;
    middleRing.cornerRadius = middleSize / 2;
    middleRing.thickness = 1;
    middleRing.color = "#ff8800aa";
    middleRing.background = "transparent";
    middleRing.isVisible = false;
    guiTexture.addControl(middleRing);
    elements.push(middleRing);

    const CROSSHAIR_OFFSET = scalePixels(CROSSHAIR_OFFSET_PX);
    const dot = new Rectangle("crosshairDot");
    const dotSize = scalePixels(4);
    dot.width = `${dotSize}px`;
    dot.height = `${dotSize}px`;
    dot.cornerRadius = dotSize / 2;
    dot.thickness = 0;
    dot.background = "#ff3300";
    dot.isVisible = false;
    dot.top = `${CROSSHAIR_OFFSET}px`;
    guiTexture.addControl(dot);

    const gap = scalePixels(8);
    const length = scalePixels(15);
    const thickness = scalePixels(2);

    const createLine = (name: string, w: string, h: string, t: string, l: string) => {
        const line = new Rectangle(name);
        line.width = w;
        line.height = h;
        line.background = "#ff8800";
        line.thickness = 0;
        const topVal = parseFloat(t);
        line.top = `${topVal + CROSSHAIR_OFFSET}px`;
        line.left = l;
        line.isVisible = false;
        guiTexture.addControl(line);
        elements.push(line);

        const shadow = new Rectangle(name + "Shadow");
        shadow.width = w;
        shadow.height = h;
        shadow.background = "#000000";
        shadow.thickness = 0;
        shadow.top = `${topVal + CROSSHAIR_OFFSET + 1}px`;
        shadow.left = `${parseFloat(l) + 1}px`;
        shadow.alpha = 0.5;
        shadow.isVisible = false;
        shadow.zIndex = -1;
        guiTexture.addControl(shadow);
        elements.push(shadow);
    };

    createLine("crossTop", `${thickness}px`, `${length}px`, `${-gap - length}px`, "0");
    createLine("crossBottom", `${thickness}px`, `${length}px`, `${gap}px`, "0");
    createLine("crossLeft", `${length}px`, `${thickness}px`, "0", `${-gap - length}px`);
    createLine("crossRight", `${length}px`, `${thickness}px`, "0", `${gap}px`);

    const cornerSize = scalePixels(8);
    const cornerDist = scalePixels(20);

    const createCorner = (name: string, top: number, left: number) => {
        const corner = new Rectangle(name);
        corner.width = `${cornerSize}px`;
        corner.height = "1px";
        corner.background = "#ff440088";
        corner.thickness = 0;
        corner.top = `${top + CROSSHAIR_OFFSET}px`;
        corner.left = `${left}px`;
        corner.isVisible = false;
        guiTexture.addControl(corner);
        elements.push(corner);
    };

    createCorner("cornerTL", -cornerDist, -cornerDist);
    createCorner("cornerTR", -cornerDist, cornerDist - cornerSize);
    createCorner("cornerBL", cornerDist, -cornerDist);
    createCorner("cornerBR", cornerDist, cornerDist - cornerSize);

    return { elements, dot };
}
