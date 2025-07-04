// Google Search Results Collector Chrome Extension
// Automatically collects search results as you browse Google and allows CSV export

// @ts-ignore - Chrome extension APIs
const chromeAPI = typeof chrome !== 'undefined' ? chrome : null;

let isProcessing = false;
let currentUrl = window.location.href;
let isCollectionActive = false;

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
            return; // No data to download
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
        
    } catch (error) {
        console.error('Error downloading CSV:', error);
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
        console.log('Google Results Collector: Cleared all stored results');
    } catch (error) {
        console.error('Error clearing results:', error);
    }
}

// Update button text with current count - removed (managed by popup)
async function updateButtonText() {
    // Function removed - UI now managed by popup
}

// Show notification to user - removed (managed by popup)
function showNotification(message, color = 'hsl(0 0% 15%)') {
    // Function removed - notifications now managed by popup
}

// Create control buttons - removed (managed by popup)
async function createButtons() {
    // Function removed - UI now managed by popup
}

// Remove control buttons - removed (managed by popup)
function removeButtons() {
    // Function removed - UI now managed by popup
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
    await main();
}

// Stop collection
async function stopCollection() {
    isCollectionActive = false;
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

    // Only process results if collection is active
    if (!isCollectionActive) {
        return;
    }

    const newResults = await processResults();
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