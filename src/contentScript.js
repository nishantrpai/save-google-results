// Google Search Results Collector Chrome Extension
// Automatically collects search results as you browse Google and allows CSV export

// @ts-ignore - Chrome extension APIs
const chromeAPI = typeof chrome !== 'undefined' ? chrome : null;

let isProcessing = false;
let currentUrl = window.location.href;
let isCollectionActive = false;
let buttonsVisible = false;

// Storage keys
const STORAGE_KEY_CONTENT = 'google_search_results';
const ACTIVE_KEY_CONTENT = 'google_collector_active';

// Utility function to clean text
function clean(text) {
    return (text || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
}

// Check if collection is active
async function checkCollectionStatus() {
    try {
        if (chromeAPI && chromeAPI.storage) {
            const result = await chromeAPI.storage.local.get([ACTIVE_KEY_CONTENT]);
            isCollectionActive = result[ACTIVE_KEY_CONTENT] || false;
        } else {
            const stored = localStorage.getItem(ACTIVE_KEY_CONTENT);
            isCollectionActive = stored === 'true';
        }
        return isCollectionActive;
    } catch (error) {
        console.error('Error checking collection status:', error);
        return false;
    }
}

// Get stored results from Chrome storage
async function getStoredResults() {
    try {
        if (chromeAPI && chromeAPI.storage) {
            const result = await chromeAPI.storage.local.get([STORAGE_KEY_CONTENT]);
            return result[STORAGE_KEY_CONTENT] || {
                metadata: { queries: [], totalPages: 0, collectionStarted: null },
                results: [['title', 'link', 'description', 'page', 'timestamp']]
            };
        }
        // Fallback to localStorage if Chrome storage not available
        const stored = localStorage.getItem(STORAGE_KEY_CONTENT);
        return stored ? JSON.parse(stored) : {
            metadata: { queries: [], totalPages: 0, collectionStarted: null },
            results: [['title', 'link', 'description', 'page', 'timestamp']]
        };
    } catch (error) {
        console.error('Error getting stored results:', error);
        return {
            metadata: { queries: [], totalPages: 0, collectionStarted: null },
            results: [['title', 'link', 'description', 'page', 'timestamp']]
        };
    }
}

// Save results to Chrome storage
async function saveResults(data) {
    try {
        if (chromeAPI && chromeAPI.storage) {
            await chromeAPI.storage.local.set({ [STORAGE_KEY_CONTENT]: data });
        } else {
            // Fallback to localStorage
            localStorage.setItem(STORAGE_KEY_CONTENT, JSON.stringify(data));
        }
    } catch (error) {
        console.error('Error saving results:', error);
    }
}

// Extract search query from URL
function getSearchQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    return clean(urlParams.get('q') || 'unknown query');
}

// Extract page number from URL
function getPageNumber() {
    const urlParams = new URLSearchParams(window.location.search);
    const start = urlParams.get('start');
    return start ? Math.floor(parseInt(start) / 10) + 1 : 1;
}

// Process search results on current page
async function processResults() {
    if (isProcessing || !isCollectionActive) return 0;
    isProcessing = true;

    try {
        const data = await getStoredResults();
        const results = [...document.querySelectorAll('div.tF2Cxc')];
        let newCount = 0;
        
        const query = getSearchQuery();
        const page = getPageNumber();
        const timestamp = new Date().toISOString();

        // Add query to metadata if not already present
        if (!data.metadata.queries.includes(query)) {
            data.metadata.queries.push(query);
        }

        // Update metadata
        data.metadata.totalPages = Math.max(data.metadata.totalPages, page);
        if (!data.metadata.collectionStarted) {
            data.metadata.collectionStarted = timestamp;
        }

        results.forEach(r => {
            const titleElement = r.querySelector('h3');
            const linkElement = r.querySelector('a');
            const descElement = r.querySelector('.VwiC3b');

            const title = clean(titleElement?.textContent || 'no title');
            const link = clean(linkElement?.href || 'no link');
            const description = clean(descElement?.textContent || 'no description');
            
            // Check if this result already exists to avoid duplicates
            const exists = data.results.some(row => row[1] === link);
            if (!exists && link !== 'no link') {
                data.results.push([title, link, description, page, timestamp]);
                newCount++;
            }
        });
        
        await saveResults(data);
        await updateButtonText();
        console.log(`Google Results Collector: Added ${newCount} new results. Total: ${data.results.length - 1}`);
        return newCount;
    } catch (error) {
        console.error('Error processing results:', error);
        return 0;
    } finally {
        isProcessing = false;
    }
}

// Download CSV file
async function downloadCSV() {
    try {
        const data = await getStoredResults();
        
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
        const a = document.createElement('a');
        a.href = url;
        a.download = `google_results_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('CSV downloaded successfully!', 'hsl(142 76% 36%)');
    } catch (error) {
        console.error('Error downloading CSV:', error);
        showNotification('Error downloading CSV', 'hsl(0 62.8% 30.6%)');
    }
}

// Clear all stored results
async function clearResults() {
    try {
        if (chromeAPI && chromeAPI.storage) {
            await chromeAPI.storage.local.remove([STORAGE_KEY_CONTENT]);
        } else {
            localStorage.removeItem(STORAGE_KEY_CONTENT);
        }
        await updateButtonText();
        showNotification('All results cleared', 'hsl(45 93% 47%)');
        console.log('Google Results Collector: Cleared all stored results');
    } catch (error) {
        console.error('Error clearing results:', error);
    }
}

// Update button text with current count
async function updateButtonText() {
    const data = await getStoredResults();
    const count = data.results.length - 1; // Subtract header row
    const downloadBtn = document.getElementById('google-csv-download');
    if (downloadBtn) {
        downloadBtn.textContent = `Download CSV (${count})`;
    }
}

// Show notification to user
function showNotification(message, color = 'hsl(0 0% 15%)') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${color};
        color: hsl(0 0% 100%);
        padding: 12px 16px;
        border-radius: 6px;
        border: 1px solid hsl(0 0% 25%);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        max-width: 300px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Create control buttons
async function createButtons() {
    if (!isCollectionActive) {
        removeButtons();
        return;
    }

    // Remove existing buttons
    const existingButtons = document.querySelectorAll('[id^="google-csv-"]');
    existingButtons.forEach(btn => btn.remove());

    // Button container
    const container = document.createElement('div');
    container.id = 'google-csv-container';
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        gap: 8px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    `;

    // Download button (icon only) - Feather download icon
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'google-csv-download';
    downloadBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
    `;
    downloadBtn.style.cssText = `
        background: hsl(142 76% 36%);
        color: hsl(0 0% 100%);
        padding: 0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: all 0.2s ease;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    downloadBtn.onmouseover = () => {
        downloadBtn.style.background = 'hsl(142 76% 32%)';
        downloadBtn.style.transform = 'translateY(-1px)';
    };
    downloadBtn.onmouseout = () => {
        downloadBtn.style.background = 'hsl(142 76% 36%)';
        downloadBtn.style.transform = 'translateY(0)';
    };
    downloadBtn.onclick = downloadCSV;

    // Stop button (icon only) - Feather square icon  
    const stopBtn = document.createElement('button');
    stopBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        </svg>
    `;
    stopBtn.style.cssText = `
        background: hsl(0 62.8% 30.6%);
        color: hsl(0 0% 100%);
        padding: 0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: all 0.2s ease;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    stopBtn.onmouseover = () => {
        stopBtn.style.background = 'hsl(0 62.8% 25%)';
        stopBtn.style.transform = 'translateY(-1px)';
    };
    stopBtn.onmouseout = () => {
        stopBtn.style.background = 'hsl(0 62.8% 30.6%)';
        stopBtn.style.transform = 'translateY(0)';
    };
    stopBtn.onclick = stopCollection;

    container.appendChild(downloadBtn);
    container.appendChild(stopBtn);
    document.body.appendChild(container);

    buttonsVisible = true;
    await updateButtonText();
}

// Remove control buttons
function removeButtons() {
    const container = document.getElementById('google-csv-container');
    if (container) {
        container.remove();
    }
    const styles = document.getElementById('google-csv-styles');
    if (styles) {
        styles.remove();
    }
    buttonsVisible = false;
}

// Listen for messages from popup
if (chromeAPI && chromeAPI.runtime) {
    chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'start') {
            startCollection();
        } else if (message.action === 'stop') {
            stopCollection();
        }
        return true;
    });
}

// Start collection
async function startCollection() {
    isCollectionActive = true;
    await createButtons();
    await main();
    showNotification('Collection started! Results will be collected as you browse.', 'hsl(142 76% 36%)');
}

// Stop collection
async function stopCollection() {
    isCollectionActive = false;
    removeButtons();
    showNotification('Collection stopped.', 'hsl(45 93% 47%)');
}

// Main processing function
async function main() {
    console.log('Google Results Collector: Processing page');
    
    // Only process if we're on a Google search results page
    if (!window.location.href.includes('/search')) {
        return;
    }

    // Check collection status
    await checkCollectionStatus();
    
    // Update buttons based on collection status
    if (isCollectionActive && !buttonsVisible) {
        await createButtons();
    } else if (!isCollectionActive && buttonsVisible) {
        removeButtons();
    }

    // Only process results if collection is active
    if (!isCollectionActive) {
        return;
    }

    const newResults = await processResults();
    
    if (newResults > 0) {
        showNotification(`Collected ${newResults} new results from this page`);
    }
}

// Set up mutation observer for dynamic content
function observeChanges() {
    const observer = new MutationObserver((mutations) => {
        const hasNewResults = mutations.some(mutation => 
            Array.from(mutation.addedNodes).some(node => 
                node.nodeType === 1 && 
                ((node instanceof Element && node.querySelector && node.querySelector('.tF2Cxc')) || 
                 (node instanceof Element && node.classList && node.classList.contains('tF2Cxc')))
            )
        );
        
        if (hasNewResults) {
            setTimeout(main, 500); // Small delay to ensure DOM is stable
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}

// Set up change detection
observeChanges();

// Handle navigation changes
let lastUrl = window.location.href;
new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(main, 1000); // Delay to allow page to load
    }
}).observe(document, { subtree: true, childList: true });

console.log('Google Results Collector: Extension loaded and ready');