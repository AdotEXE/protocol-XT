/**
 * Web Dashboard Client
 * Handles WebSocket connection, charts, and UI updates
 */

// State
let ws = null;
let logs = [];
let services = [];
let metricsHistory = { cpu: [], memory: [] };
const MAX_CHART_POINTS = 60;

// Charts
let cpuChart, memoryChart;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    connectWebSocket();
    setupFilters();
});

// WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        updateConnectionStatus(true);
    };

    ws.onclose = () => {
        updateConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
        updateConnectionStatus(false);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('connectionStatus');
    const text = document.getElementById('connectionText');

    if (connected) {
        dot.style.background = 'var(--accent-green)';
        text.textContent = 'Connected';
    } else {
        dot.style.background = 'var(--accent-red)';
        text.textContent = 'Reconnecting...';
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'init':
            logs = msg.logs || [];
            services = msg.services || [];
            if (msg.metrics) updateMetrics(msg.metrics);
            renderServices();
            renderLogs();
            break;

        case 'log':
            logs.push(msg.data);
            if (logs.length > 500) logs.shift();
            renderLogs();
            break;

        case 'metrics':
            updateMetrics(msg.data);
            break;

        case 'service':
            const idx = services.findIndex(s => s.name === msg.data.name);
            if (idx >= 0) {
                services[idx] = msg.data;
            } else {
                services.push(msg.data);
            }
            renderServices();
            break;
    }
}

// Metrics
function updateMetrics(metrics) {
    // Update values
    document.getElementById('cpuValue').textContent = `${metrics.cpu}%`;
    document.getElementById('memoryValue').textContent = `${metrics.memory.percent}%`;
    document.getElementById('serverFps').textContent = metrics.fps?.server || 60;
    document.getElementById('clientFps').textContent = metrics.fps?.client || 60;

    // Update history
    metricsHistory.cpu.push(metrics.cpu);
    metricsHistory.memory.push(metrics.memory.percent);

    if (metricsHistory.cpu.length > MAX_CHART_POINTS) {
        metricsHistory.cpu.shift();
        metricsHistory.memory.shift();
    }

    // Update charts
    updateCharts();
}

// Charts
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
            x: { display: false },
            y: {
                min: 0,
                max: 100,
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#8888a0' }
            }
        },
        plugins: {
            legend: { display: false }
        },
        elements: {
            point: { radius: 0 },
            line: { tension: 0.3, borderWidth: 2 }
        }
    };

    cpuChart = new Chart(document.getElementById('cpuChart'), {
        type: 'line',
        data: {
            labels: Array(MAX_CHART_POINTS).fill(''),
            datasets: [{
                label: 'CPU %',
                data: [],
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                fill: true
            }]
        },
        options: { ...chartOptions }
    });

    memoryChart = new Chart(document.getElementById('memoryChart'), {
        type: 'line',
        data: {
            labels: Array(MAX_CHART_POINTS).fill(''),
            datasets: [{
                label: 'Memory %',
                data: [],
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                fill: true
            }]
        },
        options: { ...chartOptions }
    });
}

function updateCharts() {
    cpuChart.data.datasets[0].data = metricsHistory.cpu;
    cpuChart.update('none');

    memoryChart.data.datasets[0].data = metricsHistory.memory;
    memoryChart.update('none');
}

// Services
function renderServices() {
    const grid = document.getElementById('servicesGrid');
    grid.innerHTML = services.map(s => `
        <div class="service-card ${s.status}">
            <div class="service-name">
                <span>${getServiceIcon(s.name)}</span>
                <span>${s.name}</span>
            </div>
            <div class="service-status">
                Status: <strong>${s.status}</strong>
                ${s.pid ? `<br>PID: ${s.pid}` : ''}
                ${s.restarts > 0 ? `<br>Restarts: ${s.restarts}` : ''}
            </div>
            <div class="service-actions">
                <button class="btn btn-restart" onclick="restartService('${s.name}')">
                    🔄 Restart
                </button>
            </div>
        </div>
    `).join('');
}

function getServiceIcon(name) {
    switch (name.toLowerCase()) {
        case 'server': return '🟢';
        case 'client': return '🔵';
        case 'editor': return '🟣';
        default: return '⚙️';
    }
}

function restartService(name) {
    fetch(`/api/services/${name}/restart`, { method: 'POST' })
        .then(r => r.json())
        .then(() => console.log(`Restarting ${name}...`))
        .catch(console.error);
}

// Logs
function renderLogs() {
    const container = document.getElementById('logsContainer');
    const filterService = document.getElementById('filterService').value;
    const filterLevel = document.getElementById('filterLevel').value;
    const search = document.getElementById('searchInput').value.toLowerCase();

    let filtered = logs;

    if (filterService !== 'all') {
        filtered = filtered.filter(l => l.service.toLowerCase() === filterService);
    }

    if (filterLevel !== 'all') {
        filtered = filtered.filter(l => l.level === filterLevel);
    }

    if (search) {
        filtered = filtered.filter(l => l.message.toLowerCase().includes(search));
    }

    container.innerHTML = filtered.slice(-200).map(log => `
        <div class="log-entry">
            <span class="log-time">${formatTime(log.timestamp)}</span>
            <span class="log-service ${log.service.toLowerCase()}">${log.service}</span>
            <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
    `).join('');

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupFilters() {
    document.getElementById('filterService').addEventListener('change', renderLogs);
    document.getElementById('filterLevel').addEventListener('change', renderLogs);
    document.getElementById('searchInput').addEventListener('input', debounce(renderLogs, 300));
}

function debounce(fn, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Export
function exportLogs(format) {
    const filterService = document.getElementById('filterService').value;
    const filterLevel = document.getElementById('filterLevel').value;

    const url = `/api/export?format=${format}&service=${filterService}&level=${filterLevel}`;
    window.open(url, '_blank');
}
