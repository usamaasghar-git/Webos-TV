window.webSocketLoaded = true;
var idValue = "";
var screenHeight = "";
var screenWidth = "";
var allDivs = document.querySelectorAll('div');
var playlistFlag = true;
var currentTimeout = null;
let socketConnected = false;
let deviceIdFetched = false;
let joinEmitted = false;

// Track current playlist state for change detection
let currentPlaylistItemCount = 0;
let currentPlaylistContent = [];
let lastResponse = null;
let currentPlayingItem = null; // Track currently playing item for smooth transitions
let preloadedItems = new Map(); // Cache for preloaded content

setTimeout(function () {
    if (typeof idValue === "undefined" || !document.getElementById("alert-indicator")) {
        console.warn("❌ JavaScript likely failed to load. Forcing reload.");
        location.reload();
    }
}, 8000);

// Fallback mechanism to prevent stuck states - check every 30 seconds
setInterval(function() {
    console.log("🔄 Fallback check - Current state:", {
        socketConnected: socketConnected,
        deviceIdFetched: deviceIdFetched,
        playlistFlag: playlistFlag,
        currentPlaylistItemCount: currentPlaylistItemCount,
        previewVisible: document.getElementById("preview_display_code") ? document.getElementById("preview_display_code").style.display : 'unknown'
    });

    // If we're stuck showing pairing code but should be playing, request update
    if (socketConnected && deviceIdFetched && !playlistFlag) {
        var previewCode = document.getElementById("preview_display_code");
        if (previewCode && previewCode.style.display === 'block' && lastResponse && lastResponse.playlistStatus && lastResponse.playlist.length > 0) {
            console.warn("⚠️  Detected potential stuck state - requesting screen update");
            socket.emit('requestScreenUpdate', { mac: idValue });
        }
    }
}, 30000);

// Fetch elements
var previewDisplayCode = document.getElementById("preview_display_code");
var textView5 = document.getElementById("textView5");

function tryEmitJoinEvent() {
    if (joinEmitted) return;

    if (socketConnected && deviceIdFetched && idValue) {
        const dataToSend = {
            detail: {
                mac: idValue,
                ram: { total: "1992 MB", free: "1159 MB" },
                storage: { total: "5951 MB", free: "5512 MB" },
                device_details: {
                    ip: "10.0.2.16",
                    height: screenHeight,
                    width: screenWidth,
                    software: "1.0.6",
                    os_version: 29,
                    manufacture: "Google",
                    root_level: false
                }
            }
        };
        console.log("✅ Emitting join with MAC:", idValue);
        socket.emit('join', dataToSend);
        joinEmitted = true;
    } else {
        console.warn("⏳ Waiting: connected =", socketConnected, ", idValue =", idValue);
    }
}

function fetchDeviceIdWithRetry(retryCount) {
    console.log('Fetching device ID...');
    retryCount = retryCount || 0;

    if (typeof webOS === 'undefined') {
        console.error('webOS object is not defined. Make sure your app is running in a webOS TV environment.');
        return;
    }

    webOS.service.request('luna://com.webos.service.sm', {
        method: 'deviceid/getIDs',
        parameters: { idType: ['LGUDID'] },
        onSuccess: function (inResponse) {
            if (inResponse && inResponse.idList && inResponse.idList.length > 0) {
                idValue = inResponse.idList[0].idValue;
                console.log('Device ID fetched:', idValue);
                deviceIdFetched = true;
                tryEmitJoinEvent();
            } else {
                console.warn('idValue not found in the response object (retry #' + retryCount + ')');
                if (retryCount < 3) {
                    setTimeout(() => fetchDeviceIdWithRetry(retryCount + 1), 2000);
                }
            }
        },
        onFailure: function (inError) {
            console.error('Failed to get system ID information');
            console.error('[' + inError.errorCode + ']: ' + inError.errorText);
            if (retryCount < 3) {
                setTimeout(() => fetchDeviceIdWithRetry(retryCount + 1), 2000);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    console.log("🌐 DOM fully loaded. Starting device ID fetch...");
    fetchDeviceIdWithRetry();
});

webOS.deviceInfo(function (device) {
    screenHeight = device.screenHeight;
    screenWidth = device.screenWidth;
});

var socket = io('https://groupe.snsplayer.com');
var messageContainer = document.getElementById('message-container');

socket.on('connect', function () {
    socketConnected = true;
    tryEmitJoinEvent();
    console.log('Socket.IO connected.');
});

// 🔄 Handle reconnect to refresh playlist
socket.io.on('reconnect', (attempt) => {
    console.log('🔄 Socket reconnected (attempt:', attempt, '). Requesting updated playlist...');
    joinEmitted = false; // Reset so join can re-emit
    tryEmitJoinEvent();
    socket.emit('requestScreenUpdate', { mac: idValue }); // Ask server for fresh playlist
    showStatusDot('green');

    // Reset playlist state on reconnect to force refresh
    currentPlaylistItemCount = 0;
    currentPlaylistContent = [];
    lastResponse = null;
});

socket.on('screen', function (response) {
    console.log('Received screen response:', response);

    // Check for playlist changes
    var playlistContentChanged = false;
    if (response.playlist && response.playlist.length > 0) {
        var newContent = response.playlist;
        var oldCount = currentPlaylistItemCount;
        var newCount = newContent.length;

        // Check if count changed
        if (newCount !== oldCount) {
            playlistContentChanged = true;
            console.log('Playlist item count changed from', oldCount, 'to', newCount);
        } else {
            // Check if content actually changed (compare by _id)
            for (var i = 0; i < newCount; i++) {
                if (currentPlaylistContent[i] && newContent[i] &&
                    currentPlaylistContent[i]._id !== newContent[i]._id) {
                    playlistContentChanged = true;
                    console.log('Playlist content changed at index', i);
                    break;
                }
            }
        }

        // Update tracking variables
        currentPlaylistItemCount = newCount;
        currentPlaylistContent = newContent.slice(); // Clone the array
    }

    // Store response for comparison
    lastResponse = response;

    if (response.playlistStatus && response.playlist.length > 0) {
        var messageContainer = document.getElementById('message-container');
        messageContainer.style.display = 'block';
        allDivs.forEach(div => {
            if (div.id !== 'message-container') div.style.display = 'none';
        });
        console.log('Received screen playlist status', response.playlistStatus);
        var currentItemIndex = 0;
        var orientation = response.orientation;

        // If playlist content changed and we're currently playing, restart
        if (playlistContentChanged && playlistFlag) {
            console.log('Playlist content changed - restarting playlist...');
            // Don't stop playlist immediately - show current content until new content is ready
            playlistFlag = true; // Keep playing current content
            // Preload new content in background
            preloadPlaylistContent(response.playlist);
        }

        function displayNextItem() {
            var item = response.playlist[currentItemIndex];
            var contentElement = document.createElement('div');
            contentElement.classList.add('content-item');

            if (orientation === "90") {
                contentElement.style.transform = `rotate(90deg) scale(${screenHeight / screenWidth}, ${screenWidth / screenHeight})`;
            } else if (orientation === "180") {
                contentElement.style.transform = "rotate(180deg) scale(1,1)";
            } else if (orientation === "270") {
                contentElement.style.transform = `rotate(270deg) scale(${screenWidth / screenHeight}, ${screenHeight / screenWidth})`;
            } else {
                contentElement.style.transform = "rotate(0deg) scale(1,1)";
            }
            contentElement.style.transformOrigin = "center center";

            // Add loading overlay to existing content while new content loads
            var existingContent = messageContainer.querySelector('.content-item');
            if (existingContent) {
                // Show loading overlay on current content
                showLoadingOverlay(existingContent);
            } else {
                // No existing content, show placeholder in new element
                showLoadingPlaceholder(contentElement);
            }

            let loadPromise;

            // Check if item is preloaded
            const preloaded = preloadedItems.get(item._id);
            currentPlayingItem = item;

            if (preloaded) {
                // Use preloaded content
                loadPromise = preloaded.then((cached) => {
                    if (cached && cached.element) {
                        if (cached.type === 'image') {
                            cached.element.width = screenWidth;
                            cached.element.height = screenHeight;
                            contentElement.appendChild(cached.element.cloneNode(true));
                        } else if (cached.type === 'video') {
                            const video = cached.element.cloneNode(true);
                            video.width = screenWidth;
                            video.height = screenHeight;
                            video.autoplay = true;
                            video.playsInline = true;
                            video.muted = true;
                            contentElement.appendChild(video);
                        }
                    }
                });
            } else {
                // Load content normally
                if (item.type === 'application') {
                    loadPromise = fetchWithCache(item.url)
                        .then(cachedUrl => pdfjsLib.getDocument(cachedUrl).promise)
                        .then(pdfDoc => pdfDoc.getPage(1))
                        .then(page => new Promise(resolve => {
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            const viewport = page.getViewport({ scale: 1.5 });
                            canvas.width = viewport.width;
                            canvas.height = viewport.height;
                            page.render({ canvasContext: context, viewport }).promise
                                .then(() => { contentElement.appendChild(canvas); resolve(); })
                                .catch(() => resolve());
                        }))
                        .catch(() => Promise.resolve());
                } else if (item.type === 'image') {
                    loadPromise = new Promise(async (resolve) => {
                        try {
                            const img = new Image();
                            img.src = await fetchWithCache(item.url);
                            img.alt = item.name;
                            img.width = screenWidth;
                            img.height = screenHeight;
                            img.onload = () => resolve();
                            img.onerror = () => resolve();
                            contentElement.appendChild(img);
                        } catch (e) {
                            console.error("Image load error:", e);
                            resolve();
                        }
                    });
                } else if (item.type === 'video') {
                    loadPromise = new Promise(async (resolve) => {
                        try {
                            const video = document.createElement('video');
                            video.src = await fetchWithCache(item.url);
                            video.width = screenWidth;
                            video.height = screenHeight;
                            video.autoplay = true;
                            video.playsInline = true;
                            video.muted = true;
                            video.onloadeddata = () => resolve();
                            video.onerror = () => resolve();
                            contentElement.appendChild(video);
                        } catch (e) {
                            console.error("Video load error:", e);
                            resolve();
                        }
                    });
                } else if (item.type === 'url') {
                    const webView = new WebView();
                    webView.load(item.url);
                    webView.style.width = screenWidth + 'px';
                    webView.style.height = screenHeight + 'px';
                    contentElement.appendChild(webView);
                    loadPromise = Promise.resolve();
                } else {
                    loadPromise = Promise.resolve();
                }
            }

            loadPromise.then(() => {
                // Clear loading overlays/placeholders
                var loadingElements = contentElement.querySelectorAll('div');
                loadingElements.forEach(el => {
                    if (el.innerHTML.includes('Loading') || el.innerHTML.includes('Preparing')) {
                        el.remove();
                    }
                });

                // Clear any existing overlays from current content
                var existingContent = messageContainer.querySelector('.content-item');
                if (existingContent) {
                    var existingOverlays = existingContent.querySelectorAll('div');
                    existingOverlays.forEach(el => {
                        if (el.innerHTML.includes('Preparing next content')) {
                            el.remove();
                        }
                    });
                }

                // Smooth transition: fade out old content, fade in new content
                if (existingContent) {
                    existingContent.style.transition = 'opacity 0.5s ease-out';
                    existingContent.style.opacity = '0';

                    contentElement.style.opacity = '0';
                    messageContainer.appendChild(contentElement);
                    contentElement.style.transition = 'opacity 0.5s ease-in';
                    contentElement.style.opacity = '1';

                    // Remove old content after fade
                    setTimeout(() => {
                        if (existingContent.parentNode) {
                            existingContent.parentNode.removeChild(existingContent);
                        }
                    }, 500);
                } else {
                    // No existing content, show immediately
                    messageContainer.innerHTML = '';
                    messageContainer.appendChild(contentElement);
                }

                currentItemIndex = (currentItemIndex + 1) % response.playlist.length;
                var videoEl = contentElement.querySelector('video');
                var duration = 10000;

                if (item.duration && !isNaN(parseInt(item.duration))) {
                    duration = parseInt(item.duration);
                } else if (item.type === 'video' && videoEl && videoEl.duration && !isNaN(videoEl.duration)) {
                    duration = videoEl.duration * 1000;
                }
                console.log("duration", duration);

                clearTimeout(currentTimeout);
                currentTimeout = setTimeout(displayNextItem, duration);
            }).catch((error) => {
                console.error('Content loading failed:', error);
                // On load failure, advance to next item quickly without clearing screen
                clearTimeout(currentTimeout);
                currentTimeout = setTimeout(displayNextItem, 2000);
            });
        }
        displayNextItem();
    } else {
        stopPlaylist();
        localStorage.setItem('playlistStatus', response.playlistStatus);
        localStorage.setItem('code', response.code);
        localStorage.setItem('connected', response.connected);

        var playlistStatus = localStorage.getItem('playlistStatus') === 'true';
        var code = localStorage.getItem('code');
        var connected = localStorage.getItem('connected') === 'true';

        console.log("Screen state transition - connected:", connected, ", playlistStatus:", playlistStatus, ", code:", code);

        var previewDisplayCode = document.getElementById("preview_display_code");
        var mainConstraintLayoutHome = document.getElementById("mainConstraintLayoutHome");
        var textView5 = document.getElementById("textView5");
        var textView2 = document.getElementById("textView2");
        var textView3 = document.getElementById("textView3");
        var textView4 = document.getElementById("textView4");
        var textView8 = document.getElementById("textView8");
        var messageContainer = document.getElementById("message-container");

        // Enhanced state transition logic with better handling of edge cases
        if (!playlistStatus && !connected) {
            // Screen not added to CMS - show pairing code
            console.log("State: Screen not added - showing pairing screen");
            allDivs.forEach(div => div.style.display = 'block');
            previewDisplayCode.textContent = code || "D S P H R M";
            previewDisplayCode.style.display = "block";
            messageContainer.style.display = "none";
            textView5.style.display = "block";
        } else if (!playlistStatus && connected) {
            // Screen added but no playlist - hide pairing code, show waiting
            console.log("State: Screen added, waiting for playlist");
            previewDisplayCode.textContent = code || "D S P H R M";
            previewDisplayCode.style.display = "none";
            messageContainer.style.display = "none";
            textView5.style.display = "none";
            textView2.style.display = "block";
            textView3.style.display = "block";
            textView8.style.display = "block";
            textView4.style.display = "block";
            mainConstraintLayoutHome.style.display = "block";
        } else if (playlistStatus && connected && response.playlist.length == 0) {
            // Connected with playlist status but empty playlist - show assign content message
            console.log("State: Connected but empty playlist - showing assign content message");
            localStorage.removeItem('playlistStatus');
            localStorage.removeItem('connected');
            localStorage.removeItem('code');
            textView2.style.display = "block";
            textView3.style.display = "block";
            textView8.style.display = "block";
            mainConstraintLayoutHome.style.display = "block";
            textView4.style.display = "block";
            previewDisplayCode.textContent = code || "D S P H R M";
            previewDisplayCode.style.display = "block";
            messageContainer.style.display = "none";
            textView5.style.display = "none";
        } else {
            // Default state - hide pairing elements
            console.log("State: Default - hiding pairing elements");
            previewDisplayCode.style.display = "none";
            textView5.style.display = "none";
            textView2.style.display = "none";
            textView3.style.display = "none";
            textView8.style.display = "none";
            textView4.style.display = "none";
            mainConstraintLayoutHome.style.display = "none";
        }
    }
});

function showLoadingPlaceholder(contentElement) {
    // Create a subtle loading indicator that overlays existing content
    var loadingDiv = document.createElement('div');
    loadingDiv.style.position = 'absolute';
    loadingDiv.style.top = '0';
    loadingDiv.style.left = '0';
    loadingDiv.style.width = '100%';
    loadingDiv.style.height = '100%';
    loadingDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
    loadingDiv.style.display = 'flex';
    loadingDiv.style.alignItems = 'center';
    loadingDiv.style.justifyContent = 'center';
    loadingDiv.style.color = 'white';
    loadingDiv.style.fontSize = '2rem';
    loadingDiv.style.fontWeight = 'bold';
    loadingDiv.style.zIndex = '20';
    loadingDiv.innerHTML = '<div>Loading...<br><small>Preparing content</small></div>';
    contentElement.appendChild(loadingDiv);

    // Remove loading indicator after 3 seconds to avoid it staying forever
    setTimeout(() => {
        if (loadingDiv.parentNode) {
            loadingDiv.parentNode.removeChild(loadingDiv);
        }
    }, 3000);
}

function showLoadingOverlay(existingContent) {
    // Add loading overlay to existing content to keep it visible
    var overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; // Lighter overlay
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = 'white';
    overlay.style.fontSize = '1.5rem';
    overlay.style.fontWeight = 'bold';
    overlay.style.zIndex = '15';
    overlay.innerHTML = '<div>Preparing next content...<br><small>Please wait</small></div>';

    // Make sure existing content has relative positioning for overlay
    existingContent.style.position = 'relative';
    existingContent.appendChild(overlay);

    // Remove overlay after content loads or timeout
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }, 3000);
}

function preloadPlaylistContent(playlist) {
    console.log('Preloading playlist content...');
    playlist.forEach((item, index) => {
        if (!preloadedItems.has(item._id)) {
            // Start preloading in background
            const preloadPromise = preloadItem(item);
            preloadedItems.set(item._id, preloadPromise);
        }
    });
}

async function preloadItem(item) {
    try {
        if (item.type === 'image') {
            const img = new Image();
            img.src = await fetchWithCache(item.url);
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            return { type: 'image', element: img };
        } else if (item.type === 'video') {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = await fetchWithCache(item.url);
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => resolve(video);
                video.onerror = reject;
                // Timeout after 10 seconds
                setTimeout(() => reject(new Error('Video preload timeout')), 10000);
            });
            return { type: 'video', element: video };
        } else if (item.type === 'application') {
            // For PDFs, we can preload the URL
            await fetchWithCache(item.url);
            return { type: 'application', url: item.url };
        }
        return { type: 'unknown' };
    } catch (e) {
        console.warn('Failed to preload item:', item._id, e);
        return null;
    }
}

function stopPlaylist() {
    playlistFlag = false;
    clearTimeout(currentTimeout);
    if (messageContainer) {
        messageContainer.innerHTML = '';
    }
    console.log("Playback stopped.");

    // Reset playlist tracking when stopped
    currentPlaylistItemCount = 0;
    currentPlaylistContent = [];
    currentPlayingItem = null;

    // Clear preloaded items cache to free memory
    preloadedItems.clear();
}

socket.on('disconnect', function () {
    console.log('Socket.IO disconnected.');
});

function showStatusDot(color) {
    let dot = document.getElementById("net-status-dot");
    if (!dot) {
        dot = document.createElement("div");
        dot.id = "net-status-dot";
        dot.style.position = "fixed";
        dot.style.top = "5px";
        dot.style.right = "5px";
        dot.style.width = "15px";
        dot.style.height = "15px";
        dot.style.borderRadius = "50%";
        dot.style.zIndex = "10000";
        document.body.appendChild(dot);
    }
    dot.style.backgroundColor = color;

    if (color === 'green') {
        clearTimeout(window.greenTimeout);
        window.greenTimeout = setTimeout(() => {
            dot.style.backgroundColor = 'transparent';
        }, 10000);
    }
}

window.addEventListener('online', () => showStatusDot('green'));
window.addEventListener('offline', () => showStatusDot('red'));

if (navigator.onLine) {
    showStatusDot('green');
} else {
    showStatusDot('red');
}
