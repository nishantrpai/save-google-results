// Popup script for Google Results Collector
const STORAGE_KEY = 'google_search_results';
const ACTIVE_KEY = 'google_collector_active';

// DOM elements
const statusCard = document.getElementById('statusCard');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const toggleBtn = document.getElementById('toggleBtn');
const resultCountEl = document.getElementById('resultCount');
const pageCountEl = document.getElementById('pageCount');
const queriesSection = document.getElementById('queriesSection');
const queriesList = document.getElementById('queriesList');

// State
let isActive = false;
let totalResults = 0;

// Initialize popup
async function init() {
    await updateStatus();
    await updateStats();
    setupEventListeners();
}

// Setup event listeners
function setupEventListeners() {
    toggleBtn?.addEventListener('click', toggleCollection);
}

// Update collection status
async function updateStatus() {
    try {
        const result = await chrome.storage.local.get([ACTIVE_KEY]);
        isActive = result[ACTIVE_KEY] || false;
        
        if (isActive) {
            statusText.textContent = 'Collection active';
            statusCard.className = 'status-card active';
            statusIndicator.className = 'status-indicator active';
            toggleBtn.innerHTML = `
                <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                Stop Collecting
            `;
            toggleBtn.className = 'button danger';
        } else {
            statusText.textContent = 'Collection inactive';
            statusCard.className = 'status-card inactive';
            statusIndicator.className = 'status-indicator inactive';
            toggleBtn.innerHTML = `
                <svg class="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="5,3 19,12 5,21"/>
                </svg>
                Start Collecting
            `;
            toggleBtn.className = 'button primary';
        }
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

// Update statistics
async function updateStats() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const data = result[STORAGE_KEY] || {
            metadata: { queries: [], totalPages: 0, collectionStarted: null },
            results: [['title', 'link', 'description', 'page', 'timestamp']]
        };
        totalResults = data.results.length - 1; // Subtract header row
        
        // Update result count
        if (resultCountEl) {
            resultCountEl.textContent = totalResults.toString();
        }
        
        // Update page count
        if (pageCountEl) {
            pageCountEl.textContent = data.metadata.totalPages.toString();
        }
        
        // Update queries section
        if (data.metadata.queries.length > 0 && queriesSection && queriesList) {
            queriesSection.style.display = 'block';
            queriesList.textContent = data.metadata.queries.join('\n');
        } else if (queriesSection) {
            queriesSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Toggle collection state
async function toggleCollection() {
    try {
        const wasActive = isActive;
        isActive = !isActive;
        await chrome.storage.local.set({ [ACTIVE_KEY]: isActive });
        
        // Send message to content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('google.com/search')) {
            chrome.tabs.sendMessage(tab.id, { 
                action: isActive ? 'start' : 'stop' 
            }).catch(() => {
                // Content script might not be loaded yet, that's okay
            });
        }
        
        await updateStatus();
        
        if (isActive) {
            // Show notification that collection started
            showNotification('Collection started! Navigate Google search pages to collect results.');
        } else {
            // Auto-download CSV when stopping collection
            if (wasActive && totalResults > 0) {
                await downloadCSV();
                showNotification('Collection stopped. CSV downloaded automatically.');
            } else {
                showNotification('Collection stopped.');
            }
        }
    } catch (error) {
        console.error('Error toggling collection:', error);
    }
}

// Download CSV
async function downloadCSV() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const data = result[STORAGE_KEY] || {
            metadata: { queries: [], totalPages: 0, collectionStarted: null },
            results: [['title', 'link', 'description', 'page', 'timestamp']]
        };
        
        if (data.results.length <= 1) {
            showNotification('No data to download');
            return;
        }
        
        // Create CSV with metadata rows at the top
        const csvRows = [];
        
        // Add metadata as visible rows in the CSV
        csvRows.push(['Collection Info', '', '', '', '']);
        csvRows.push(['Generated', new Date().toISOString(), '', '', '']);
        csvRows.push(['Collection Started', data.metadata.collectionStarted || 'Unknown', '', '', '']);
        csvRows.push(['Total Results', (data.results.length - 1).toString(), '', '', '']);
        csvRows.push(['Total Pages', data.metadata.totalPages.toString(), '', '', '']);
        csvRows.push(['Queries', data.metadata.queries.join(' | '), '', '', '']);
        csvRows.push(['', '', '', '', '']); // Empty separator row
        
        // Add the header row and data
        csvRows.push(...data.results);
        
        // Convert to CSV string
        const csvContent = csvRows.map(row => 
            row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        // Use Chrome downloads API
        chrome.downloads.download({
            url: url,
            filename: `google_results_${new Date().toISOString().split('T')[0]}.csv`,
            saveAs: true
        });
        
        // Clear data after successful download
        await chrome.storage.local.remove([STORAGE_KEY]);
        await updateStats();
        
        showNotification('CSV download started! Data cleared for next collection.');
    } catch (error) {
        console.error('Error downloading CSV:', error);
        showNotification('Error downloading CSV');
    }
}

// Show notification
function showNotification(message) {
    // Create temporary notification in popup
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 2000);
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', init);

// Update stats when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes[STORAGE_KEY] || changes[ACTIVE_KEY])) {
        updateStatus();
        updateStats();
    }
});
