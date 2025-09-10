const CACHE_DB_NAME = "playlistCacheDB";
const CACHE_STORE_NAME = "files";

// Initialize IndexedDB
function openCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                db.createObjectStore(CACHE_STORE_NAME);
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Save file in cache
async function saveToCache(url, blob) {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
        tx.objectStore(CACHE_STORE_NAME).put({ blob, timestamp: Date.now() }, url);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

// Get file from cache
async function getFromCache(url) {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readonly");
        const request = tx.objectStore(CACHE_STORE_NAME).get(url);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e);
    });
}

// Clear cache (for playlist change)
async function clearCache() {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
        tx.objectStore(CACHE_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

// Download + Cache + Return URL
async function fetchWithCache(url) {
    // 1. Check cache
    const cached = await getFromCache(url);
    if (cached) {
        console.log("✅ Loaded from cache:", url);
        return URL.createObjectURL(cached.blob);
    }

    // 2. Fetch from network
    console.log("🌐 Fetching from network:", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network fetch failed: " + url);

    const blob = await response.blob();
    await saveToCache(url, blob);

    return URL.createObjectURL(blob);
}
