/**
 * GameStatsOverlay - overlay по Tab (K/D, убийства, кредиты, мультиплеер скорборд).
 */

const OVERLAY_ID = "game-stats-overlay";

export interface GameStatsOverlayDeps {
    enemyTanks?: unknown[];
    enemyManager?: unknown;
    playerProgression?: unknown;
    currencyManager?: unknown;
    experienceSystem?: unknown;
    realtimeStatsTracker?: unknown;
    multiplayerManager?: unknown;
    getIsMultiplayer?: () => boolean;
    currentMapType?: string;
}

interface StatsLike {
    getPlayers?(): { id: string; name: string; kills?: number; deaths?: number; score?: number; team?: number }[];
    getLocalPlayerId?(): string | undefined;
}

export class GameStatsOverlay {
    private visible = false;
    private deps: GameStatsOverlayDeps = {};
    private container: HTMLDivElement | null = null;

    updateDependencies(deps: Partial<GameStatsOverlayDeps>): void {
        this.deps = { ...this.deps, ...deps };
    }

    isVisible(): boolean {
        return this.visible;
    }

    show(): void {
        this.visible = true;
        this.ensureContainer();
        this.renderContent();
        if (this.container) {
            this.container.style.display = "flex";
        }
    }

    hide(): void {
        this.visible = false;
        if (this.container) {
            this.container.style.display = "none";
        }
    }

    private ensureContainer(): void {
        if (typeof document === "undefined") return;
        let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
        if (!el) {
            el = document.createElement("div");
            el.id = OVERLAY_ID;
            el.style.cssText = "position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);font-family:'Press Start 2P',monospace;color:#fff;";
            document.body.appendChild(el);
        }
        this.container = el;
    }

    private renderContent(): void {
        if (!this.container) return;
        const tracker = this.deps.realtimeStatsTracker as StatsLike | undefined;
        const isMultiplayer = this.deps.getIsMultiplayer?.() ?? false;
        let html = '<div style="background:#111;border:2px solid #0f0;padding:20px;border-radius:8px;min-width:280px;max-width:90vw;">';
        html += '<div style="margin-bottom:12px;color:#0f0;font-size:12px;">STATS</div>';
        if (isMultiplayer && tracker?.getPlayers) {
            const players = tracker.getPlayers();
            const localId = tracker.getLocalPlayerId?.();
            const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            html += '<table style="font-size:10px;border-collapse:collapse;width:100%;">';
            html += '<tr style="color:#8f8;"><th style="text-align:left;padding:4px;">Name</th><th>K</th><th>D</th><th>Score</th></tr>';
            for (const p of sorted) {
                const rowStyle = p.id === localId ? "background:rgba(0,255,0,0.15);" : "";
                html += `<tr style="${rowStyle}"><td style="padding:4px;">${escapeHtml(p.name || p.id)}</td><td>${p.kills ?? 0}</td><td>${p.deaths ?? 0}</td><td>${p.score ?? 0}</td></tr>`;
            }
            html += "</table>";
        } else {
            const prog = this.deps.playerProgression as { getStats?: () => { level?: number; experience?: number } } | undefined;
            const stats = prog?.getStats?.() ?? {};
            html += `<div style="font-size:10px;">Level: ${stats.level ?? 1}</div>`;
            html += `<div style="font-size:10px;">XP: ${stats.experience ?? 0}</div>`;
        }
        html += '<div style="margin-top:12px;font-size:9px;color:#666;">Tab to close</div></div>';
        this.container.innerHTML = html;
    }
}

function escapeHtml(s: string): string {
    const div = typeof document !== "undefined" ? document.createElement("div") : null;
    if (div) {
        div.textContent = s;
        return div.innerHTML;
    }
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
