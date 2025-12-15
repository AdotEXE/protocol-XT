// Currency Manager - управление игровой валютой
export class CurrencyManager {
    private currency: number = 0;
    private readonly STORAGE_KEY = "tx_currency";
    
    constructor() {
        this.loadCurrency();
    }
    
    // Загрузить валюту из localStorage
    private loadCurrency(): void {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                this.currency = parseInt(saved, 10) || 0;
            }
        } catch (e) {
            console.warn("[Currency] Failed to load currency:", e);
            this.currency = 0;
        }
    }
    
    // Сохранить валюту в localStorage
    private saveCurrency(): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, this.currency.toString());
        } catch (e) {
            console.warn("[Currency] Failed to save currency:", e);
        }
    }
    
    // Публичный метод для принудительного сохранения
    public forceSave(): void {
        this.saveCurrency();
    }
    
    // Получить текущее количество валюты
    getCurrency(): number {
        return this.currency;
    }
    
    // Добавить валюту (за убийство врага)
    addCurrency(amount: number): void {
        if (amount > 0) {
            this.currency += amount;
            this.saveCurrency();
            console.log(`[Currency] Added ${amount}, total: ${this.currency}`);
        }
    }
    
    // Потратить валюту (на покупку/улучшение)
    spendCurrency(amount: number): boolean {
        if (amount > 0 && this.currency >= amount) {
            this.currency -= amount;
            this.saveCurrency();
            console.log(`[Currency] Spent ${amount}, remaining: ${this.currency}`);
            return true;
        }
        return false;
    }
    
    // Проверить, достаточно ли валюты
    canAfford(amount: number): boolean {
        return this.currency >= amount;
    }
    
    // Сбросить валюту (для тестирования)
    resetCurrency(): void {
        this.currency = 0;
        this.saveCurrency();
    }
}

