
const fs = require('fs');
const path = 'src/client/menu.ts';

const newContent = `    private createSettingsUI(): void {
        this.settingsPanel = document.createElement("div");
        this.settingsPanel.className = "panel-overlay";
        this.settingsPanel.id = "settings-panel";

        // Initialize SettingsPanel component (standalone mode)
        this.settingsPanelComponent = new SettingsPanel(this.settings, false);
        this.settingsPanelComponent.renderToContainer(this.settingsPanel);
        
        // Pass game instance if available
        if ((window as any).gameInstance) {
            this.settingsPanelComponent.setGame((window as any).gameInstance);
        }

        document.body.appendChild(this.settingsPanel);

        // Listen for settings changes from the component
        this.settingsPanel.addEventListener('settingsChanged', (e) => {
            const customEvent = e;
            if (customEvent.detail) {
                this.settings = customEvent.detail;
                // Settings are already saved by the component
            }
        });

        // Setup close button (component renders the button with id="settings-close")
        this.setupCloseButton("settings-close", () => this.hideSettings());
        this.setupPanelCloseOnBackground(this.settingsPanel, () => this.hideSettings());
    }`;

try {
    const data = fs.readFileSync(path, 'utf8');
    const lines = data.split('\n');

    // 1-based start: 4898 -> 0-based: 4897
    // 1-based end: 5151 -> 0-based: 5150
    // We want to remove lines from 4897 up to and including 5150.

    const startLine = 4898;
    const endLine = 5151;
    const startIndex = startLine - 1;
    const deleteCount = endLine - startLine + 1;

    console.log(`Original content line count: ${lines.length}`);
    console.log(`Removing lines ${startLine} to ${endLine} (${deleteCount} lines)`);
    // Safety check: print what we are removing
    console.log(`Line ${startLine} content: ` + lines[startIndex]);
    console.log(`Line ${endLine} content: ` + lines[endLine - 1]);
    console.log(`Line ${endLine + 1} content (next): ` + lines[endLine]);

    lines.splice(startIndex, deleteCount, newContent);

    console.log(`New content line count: ${lines.length}`);

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully repaired menu.ts');

} catch (err) {
    console.error('Error:', err);
}
