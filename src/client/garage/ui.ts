/**
 * Garage UI Module
 * HTML/CSS UI логика гаража из garage.ts
 */

export interface GarageUIState {
    currentCategory: "chassis" | "cannons" | "tracks" | "modules" | "supplies" | "shop";
    selectedItemIndex: number;
    searchText: string;
    sortBy: "name" | "stats" | "custom" | "unique";
    filterMode: "all" | "owned" | "locked";
}

/**
 * Создает HTML overlay для гаража
 */
export function createGarageOverlay(): HTMLDivElement {
    // TODO: Переместить логику создания HTML из garage.ts::createOverlay()
    const overlay = document.createElement("div");
    overlay.className = "garage-overlay";
    overlay.innerHTML = `
        <div class="garage-container">
            <div class="garage-header">
                <h2>GARAGE</h2>
                <button class="garage-close">×</button>
            </div>
            <!-- TODO: Перенести остальную структуру -->
        </div>
    `;
    return overlay;
}

/**
 * Обновляет отображение элементов гаража
 */
export function updateGarageItemsDisplay(
    items: any[],
    selectedIndex: number,
    currentCategory: string
): void {
    // TODO: Переместить логику обновления UI из garage.ts::renderItems()
}

/**
 * Обрабатывает выбор элемента
 */
export function handleGarageItemSelect(
    itemId: string,
    category: string,
    onSelect: (itemId: string, category: string) => void
): void {
    onSelect(itemId, category);
}

/**
 * Обрабатывает навигацию по клавиатуре
 */
export function setupGarageKeyboardNavigation(
    overlay: HTMLElement,
    onNavigate: (direction: "up" | "down" | "left" | "right" | "select") => void
): void {
    // TODO: Переместить логику навигации из garage.ts::setupKeyboardNavigation()
    overlay.addEventListener("keydown", (e) => {
        switch (e.key) {
            case "ArrowUp":
                onNavigate("up");
                break;
            case "ArrowDown":
                onNavigate("down");
                break;
            case "ArrowLeft":
                onNavigate("left");
                break;
            case "ArrowRight":
                onNavigate("right");
                break;
            case "Enter":
                onNavigate("select");
                break;
        }
    });
}

