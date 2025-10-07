window.webSocketLoaded = true;
var idValue = "";
var screenHeight = "";
var screenWidth = "";
var allDivs = document.querySelectorAll('div');
var playlistFlag = true;
var currentTimeout = null;
var socketConnected = false;
var deviceIdFetched = false;
var joinEmitted = false;
var scheduleTimer = null;
var lastSchedule = null;
var endTimeTimer = null;

setTimeout(function () {
    if (typeof idValue === "undefined" || !document.getElementById("alert-indicator")) {
        console.warn("❌ JavaScript likely failed to load. Forcing reload.");
        location.reload();
    }
}, 8000);

// Fetch elements
var previewDisplayCode = document.getElementById("preview_display_code");

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
                //console.log('Device ID fetched:', idValue);
                deviceIdFetched = true;
                tryEmitJoinEvent();
            } else {
                //console.warn('idValue not found in the response object (retry #' + retryCount + ')');
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

var socket = io('https://app.theplayerai.com');
var messageContainer = document.getElementById('message-container');

socket.on('connect', function () {
    socketConnected = true;
    tryEmitJoinEvent();
    console.log('Socket.IO connected.');
});

// 🔄 Handle reconnect to refresh playlist
socket.io.on('reconnect', function(attempt) {
    console.log('Socket reconnected (attempt:', attempt, '). Requesting updated playlist...');
    joinEmitted = false; // Reset so join can re-emit
    clearInterval(scheduleTimer); // Clear any existing schedule timer
    clearInterval(endTimeTimer); // Clear any existing end time timer
    lastSchedule = null; // Clear stored schedule
    tryEmitJoinEvent();
    socket.emit('requestScreenUpdate', { mac: idValue }); // Ask server for fresh playlist
    showStatusDot('green');
});

socket.on('screen', function (response) {
    console.log('Received screen response:', response);
    if (response.playlistStatus && response.playlist.length > 0) {
        var messageContainer = document.getElementById('message-container');
        messageContainer.style.display = 'block';
        allDivs.forEach(div => {
            if (div.id !== 'message-container') div.style.display = 'none';
        });
        console.log('Received screen playlist status', response.playlistStatus);
        var currentItemIndex = 0;
        var orientation = response.orientation;

        // central nextItem so index increments only in one place
        function nextItem() {
            currentItemIndex = (currentItemIndex + 1) % response.playlist[0].content.length;
            displayNextItem();
        }

        function displayNextItem() {
            // guard
            if (!playlistFlag) {
                console.log('Playlist flag false - not continuing');
                return;
            }

            var s = response.schedule;

            // CASE 1: No schedule - play immediately
            if (!s || s.length === 0 || Object.keys(s).length === 0) {
                console.log("No schedule - playing playlist immediately");
                clearInterval(scheduleTimer);
                lastSchedule = null;
                playPlaylistItem();
                return;
            }

            // CASE 2: Check if current time is within schedule
            if (isWithinSchedule(s)) {
                console.log("Within schedule time - starting playlist");
                clearInterval(scheduleTimer);
                lastSchedule = null;
                playPlaylistItem();
            } else {
                // CASE 3: Outside schedule time - wait and check again
                console.log("Outside schedule time - waiting...");
                lastSchedule = s;
                showWaitingMessage(s);
                startScheduleTimer(s);
            }
        }

        function isWithinSchedule(schedule) {
            if (!schedule.isActive) return false;

            // Get current time in schedule timezone
            var tz = schedule.timezone === 'UTC' ? 'Asia/Karachi' : schedule.timezone;
            var now = new Date();

            // Check date range
            var startDate = new Date(schedule.startDate);
            var endDate = new Date(schedule.endDate);
            if (now < startDate || now > endDate) return false;

            // Check day of week
            var dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            var currentDay = dayNames[now.getDay()];
            var scheduleDays = schedule.daysOfWeek || [];
            var dayMatch = false;
            for (var i = 0; i < scheduleDays.length; i++) {
                if (scheduleDays[i].toLowerCase() === currentDay) {
                    dayMatch = true;
                    break;
                }
            }
            if (!dayMatch) return false;

            // Check time range
            var currentTime = now.getHours() * 60 + now.getMinutes();
            var startTime = timeToMinutes(schedule.startTime);
            var endTime = timeToMinutes(schedule.endTime);

            return currentTime >= startTime && currentTime <= endTime;
        }

        function timeToMinutes(timeStr) {
            var parts = timeStr.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }

        function showWaitingMessage(schedule) {
            messageContainer.innerHTML = '';
            messageContainer.style.display = 'flex';
            messageContainer.style.flexDirection = 'column';
            messageContainer.style.justifyContent = 'center';
            messageContainer.style.alignItems = 'center';
            messageContainer.style.height = '100vh';
            messageContainer.style.width = '100vw';
            messageContainer.style.backgroundColor = '#2F4C65';

            var waitingMsg = document.createElement('div');
            waitingMsg.textContent = 'Playlist Scheduled - Waiting for Time';
            waitingMsg.style.color = 'white';
            waitingMsg.style.fontSize = '3rem';
            waitingMsg.style.fontWeight = 'bold';
            waitingMsg.style.textAlign = 'center';

            var timeInfo = document.createElement('div');
            timeInfo.textContent = 'Scheduled: ' + schedule.startTime + ' - ' + schedule.endTime;
            timeInfo.style.color = '#cccccc';
            timeInfo.style.fontSize = '2rem';
            timeInfo.style.marginTop = '20px';

            messageContainer.appendChild(waitingMsg);
            messageContainer.appendChild(timeInfo);
        }

        function startScheduleTimer(schedule) {
            if (scheduleTimer) {
                clearInterval(scheduleTimer);
            }
            console.log("Starting schedule timer - checking every 10 seconds");
            scheduleTimer = setInterval(function() {
                if (isWithinSchedule(schedule)) {
                    console.log("Schedule time reached - starting playlist");
                    clearInterval(scheduleTimer);
                    lastSchedule = null;
                    playlistFlag = true;
                    messageContainer.innerHTML = '';
                    messageContainer.style.display = 'block';
                    startPlaylistWithEndTimer(schedule);
                    displayNextItem();
                }
            }, 10000); // Check every 10 seconds
        }

        function startPlaylistWithEndTimer(schedule) {
            // Clear any existing end time timer
            if (endTimeTimer) {
                clearInterval(endTimeTimer);
            }

            // Start checking if we've passed the end time (every 30 seconds)
            console.log("Starting end time checker for schedule:", schedule.endTime);
            endTimeTimer = setInterval(function() {
                if (!isWithinSchedule(schedule)) {
                    console.log("Schedule end time reached - stopping playlist");
                    clearInterval(endTimeTimer);
                    stopPlaylist();
                    lastSchedule = schedule;
                    showWaitingMessage(schedule);
                    startScheduleTimer(schedule); // Start waiting for next schedule window
                }
            }, 30000); // Check every 30 seconds
        }

        // --- Helper to render and rotate items ---
        function playPlaylistItem() {
            // get the current item (do NOT increment here)
            var item = response.playlist[0].content[currentItemIndex];
            console.log("Displaying item (index " + currentItemIndex + "):", item);
            var contentElement = document.createElement('div');
            contentElement.classList.add('content-item');

            if (orientation === "90") {
                contentElement.style.transform = "rotate(90deg) scale(" + (screenHeight / screenWidth) + ", " + (screenWidth / screenHeight) + ")";
            } else if (orientation === "180") {
                contentElement.style.transform = "rotate(180deg) scale(1,1)";
            } else if (orientation === "270") {
                contentElement.style.transform = "rotate(270deg) scale(" + (screenWidth / screenHeight) + ", " + (screenHeight / screenWidth) + ")";
            } else {
                contentElement.style.transform = "rotate(0deg) scale(1,1)";
            }
            contentElement.style.transformOrigin = "center center";

            var loadPromise;

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
                            .then(() => { contentElement.appendChild(canvas); resolve({ type: 'application' }); })
                            .catch(() => resolve({ type: 'application' }));
                    }))
                    .catch(() => Promise.resolve({ type: 'application' }));
            } else if (item.type === 'image') {
                loadPromise = new Promise(async (resolve) => {
                    try {
                        const img = new Image();
                        const src = await fetchWithCache(item.url);
                        img.src = src;
                        img.alt = item.name || '';
                        img.width = screenWidth;
                        img.height = screenHeight;
                        img.onload = () => resolve({ type: 'image' });
                        img.onerror = () => resolve({ type: 'image', error: true });
                        contentElement.appendChild(img);
                    } catch (e) {
                        console.error("Image load error:", e);
                        resolve({ type: 'image', error: true });
                    }
                });
            } else if (item.type === 'video') {
                // NEW robust video handling:
                loadPromise = (async () => {
                    try {
                        const blobUrl = await fetchWithCache(item.url); // returns URL string (likely blob:)
                        const video = document.createElement('video');
                        video.preload = 'metadata';
                        video.muted = true; // allow autoplay
                        video.playsInline = true;
                        video.width = screenWidth;
                        video.height = screenHeight;
                        video.src = blobUrl;

                        return await new Promise((resolve) => {
                            let settled = false;

                            // metadata available -> resolve with video
                            const onLoadedMetadata = () => {
                                if (settled) return;
                                settled = true;
                                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                                video.removeEventListener('error', onError);
                                resolve({ type: 'video', video, blobUrl });
                            };

                            const onError = (e) => {
                                if (settled) return;
                                settled = true;
                                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                                video.removeEventListener('error', onError);
                                console.warn('Video load error or metadata unavailable', e);
                                // still resolve with video so UI can show something and fallback timer will advance
                                resolve({ type: 'video', video, blobUrl, error: true });
                            };

                            video.addEventListener('loadedmetadata', onLoadedMetadata);
                            video.addEventListener('error', onError);

                            // As a safety: if neither fires within a timeout (e.g., corrupted source), resolve after 8s
                            setTimeout(() => {
                                if (!settled) {
                                    settled = true;
                                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                                    video.removeEventListener('error', onError);
                                    console.warn('Timeout waiting for video metadata; continuing with fallback.');
                                    resolve({ type: 'video', video, blobUrl, error: true });
                                }
                            }, 8000);
                        });
                    } catch (e) {
                        console.error('fetchWithCache for video failed', e);
                        return { type: 'video', error: true };
                    }
                })();
            } else if (item.type === 'url' || item.type === 'website' || item.type === 'app') {
                loadPromise = new Promise((resolve) => {
                    try {
                        let embedUrl = item.url;
                        contentElement.innerHTML = ''; // Clear previous content

                        // 🎥 YouTube embed
                        var ytMatch = embedUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&]+)/);
                        if (ytMatch) {
                            var videoId = ytMatch[1];
                            embedUrl = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&mute=1&loop=1&playlist=' + videoId + '&controls=0&modestbranding=1&rel=0';
                        }

                        // 🎥 Vimeo embed
                        var vimeoMatch = embedUrl.match(/vimeo\.com\/(\d+)/);
                        if (vimeoMatch) {
                            var videoId = vimeoMatch[1];
                            embedUrl = 'https://player.vimeo.com/video/' + videoId + '?autoplay=1&muted=1&loop=1&background=1&controls=0';
                        }

                        // 🖼 Canva / Other protected sites fallback
                        const isCanva = embedUrl.includes('canva.com');

                        // 🔹 Video / iframe element
                        let element;
                        if (!isCanva) {
                            // Normal iframe for YouTube/Vimeo/other allowed URLs
                            element = document.createElement('iframe');
                            element.src = embedUrl;
                            element.allow = 'autoplay; encrypted-media; picture-in-picture';
                        } else {
                            // Canva fallback: show preview image or external browser
                            console.warn('Canva content detected, fallback applied.');
                            
                            // Option 1: Preview image (replace with your exported image URL if available)
                            element = document.createElement('img');
                            element.src = 'https://via.placeholder.com/' + screenWidth + 'x' + screenHeight + '?text=Canva+Preview';
                            element.style.objectFit = 'cover';

                            // Option 2: Automatically launch webOS browser as last resort
                            setTimeout(() => {
                                if (window.webOS) {
                                    webOS.service.request("luna://com.webos.applicationManager", {
                                        method: "launch",
                                        parameters: {
                                            id: "com.webos.app.browser",
                                            params: { target: embedUrl }
                                        },
                                        onSuccess: () => console.log("Canva opened in external browser:", embedUrl),
                                        onFailure: (err) => console.error("Browser launch failed:", err)
                                    });
                                } else {
                                    window.open(embedUrl, "_blank");
                                }
                                resolve({ type: item.type, externalLaunch: true });
                            }, 100);
                        }

                        // Common element styling
                        element.style.position = 'absolute';
                        element.style.top = '0';
                        element.style.left = '0';
                        element.style.width = screenWidth + 'px';
                        element.style.height = screenHeight + 'px';
                        element.style.border = 'none';
                        element.style.zIndex = '9999';
                        element.setAttribute('frameborder', '0');
                        element.style.pointerEvents = 'none'; // disable interaction
                        if (item.settings && item.settings.fullscreen || true) element.allowFullscreen = true;

                        // Append to DOM
                        contentElement.appendChild(element);
                        console.log('webOS element created for:', embedUrl);

                        // Timeout fallback
                        const timeout = setTimeout(() => {
                            console.warn('Iframe/video load timeout, launching external browser for:', embedUrl);
                            if (window.webOS) {
                                webOS.service.request("luna://com.webos.applicationManager", {
                                    method: "launch",
                                    parameters: {
                                        id: "com.webos.app.browser",
                                        params: { target: embedUrl }
                                    },
                                    onSuccess: () => console.log("Opened in external browser:", embedUrl),
                                    onFailure: (err) => console.error("Browser launch failed:", err)
                                });
                            } else {
                                window.open(embedUrl, "_blank");
                            }
                            resolve({ type: item.type, externalLaunch: true });
                        }, 5000);

                        // Load & error handling
                        element.onload = () => {
                            clearTimeout(timeout);
                            console.log('Element loaded on webOS:', embedUrl);
                            resolve({ type: item.type, loaded: true });
                        };
                        element.onerror = (e) => {
                            clearTimeout(timeout);
                            console.error('Element load error on webOS:', e);
                            if (window.webOS) {
                                webOS.service.request("luna://com.webos.applicationManager", {
                                    method: "launch",
                                    parameters: {
                                        id: "com.webos.app.browser",
                                        params: { target: embedUrl }
                                    },
                                    onSuccess: () => console.log("Opened in external browser:", embedUrl),
                                    onFailure: (err) => console.error("Browser launch failed:", err)
                                });
                            } else {
                                window.open(embedUrl, "_blank");
                            }
                            resolve({ type: item.type, error: true, externalLaunch: true });
                        };

                    } catch (e) {
                        console.error('App/Website load exception on webOS:', e);
                        resolve({ type: item.type, error: true });
                    }
                });
            }
            else {
                // Unknown type -> immediate resolve and fallback
                loadPromise = Promise.resolve({ type: 'unknown', error: true });
            }

            // After loadPromise resolves we append content and set timers / ended handlers.
            Promise.resolve(loadPromise).then((res) => {
                // Clear previous content and show current
                messageContainer.innerHTML = '';
                // If video case: res may include .video already, but we haven't appended it yet
                if (res && res.type === 'video' && res.video) {
                    // Append video element inside content and then attach handlers
                    contentElement.appendChild(res.video);
                    messageContainer.appendChild(contentElement);

                    const videoEl = res.video;
                    const blobUrl = res.blobUrl;

                    // cleanup function used by ended or fallback
                    const cleanupAndAdvance = (reason) => {
                        try {
                            // remove element and clear listeners
                            videoEl.pause();
                        } catch (e) {}
                        try { videoEl.currentTime = 0; } catch (e) {}
                        // revoke blob URL if it is a blob:
                        try {
                            if (blobUrl && typeof blobUrl === 'string' && blobUrl.startsWith('blob:')) {
                                try { URL.revokeObjectURL(blobUrl); } catch (e) {}
                            }
                        } catch (e) {}
                        // remove content
                        try { messageContainer.innerHTML = ''; } catch (e) {}
                        clearTimeout(currentTimeout);
                        nextItem();
                    };

                    const onEnded = () => {
                        console.log('Video ended -> advancing immediately');
                        cleanupAndAdvance('ended');
                    };

                    const onError = (e) => {
                        console.warn('Video playback error', e);
                        cleanupAndAdvance('error');
                    };

                    videoEl.removeEventListener('ended', onEnded);
                    videoEl.removeEventListener('error', onError);
                    videoEl.addEventListener('ended', onEnded);
                    videoEl.addEventListener('error', onError);

                    // Start playback if possible
                    const tryPlay = () => {
                        const p = videoEl.play();
                        if (p && typeof p.then === 'function') {
                            p.then(() => {
                                // playing started
                            }).catch((err) => {
                                console.warn('Autoplay prevented or play() rejected:', err);
                            });
                        }
                    };

                    // Determine duration (prefer server-provided item.duration)
                    var durationMs = 10000; // fallback
                    if (item.duration && !isNaN(parseInt(item.duration)) && item.type != 'video') {
                        durationMs = parseInt(item.duration) * 1000;
                        console.log('Using item.duration (ms):', durationMs);
                    } else if (!isNaN(videoEl.duration) && isFinite(videoEl.duration) && videoEl.duration > 0) {
                        durationMs = Math.round(videoEl.duration * 1000);
                        console.log('Using video metadata duration (ms):', durationMs);
                    } else {
                        // If video metadata was not present, give a slightly longer fallback
                        durationMs = 10000;
                        console.warn('Video duration not available; using fallback', durationMs);
                    }

                    // Setup backup timer only AFTER we've appended and determined duration
                    clearTimeout(currentTimeout);
                    currentTimeout = setTimeout(() => {
                        console.warn('Backup timer triggered for video -> advancing');
                        cleanupAndAdvance('fallback');
                    }, durationMs + 2000); // give a 2s buffer

                    // finally attempt play
                    tryPlay();
                } else {
                    // Non-video logic (images, pdf, url, unknown)
                    // Append the rendered content already placed in contentElement
                    messageContainer.appendChild(contentElement);

                    // compute duration for image/pdf/url
                    var duration = 10000; // default fallback
                    if (item.duration && !isNaN(parseInt(item.duration))) {
                        duration = parseInt(item.duration) * 1000;
                    } else {
                        // images and pdfs fallback to 10s if server didn't specify
                        duration = 10000;
                    }

                    clearTimeout(currentTimeout);
                    currentTimeout = setTimeout(() => {
                        console.log('Non-video timer finished -> advancing');
                        nextItem();
                    }, duration);
                }
            }).catch((e) => {
                console.error('Error in loadPromise handling', e);
                // fail-safe: advance to next item
                clearTimeout(currentTimeout);
                currentTimeout = setTimeout(() => nextItem(), 10000);
            });
        }

        // Start playback respecting schedule - use simple logic
        var schedule = response.schedule;
        if (!schedule || schedule.length === 0 || Object.keys(schedule).length === 0) {
            console.log("No schedule found, starting playlist");
            displayNextItem();
        } else {
            if (isWithinSchedule(schedule)) {
                console.log("Schedule active and within time - starting playlist");
                startPlaylistWithEndTimer(schedule);
                displayNextItem();
            } else {
                console.log("Schedule found but NOT within valid window - waiting for time");
                stopPlaylist();
                lastSchedule = schedule;
                showWaitingMessage(schedule);
                startScheduleTimer(schedule);
            }
        }
    } else {
        stopPlaylist();
        localStorage.setItem('playlistStatus', response.playlistStatus);
        localStorage.setItem('code', response.code);
        localStorage.setItem('connected', response.connected);

        var playlistStatus = localStorage.getItem('playlistStatus') === 'true';
        var code = localStorage.getItem('code');
        var connected = localStorage.getItem('connected') === 'true';

       // console.log("inside else in screen event", connected, playlistStatus, code);

        var previewDisplayCode = document.getElementById("preview_display_code");
        var mainConstraintLayoutHome = document.getElementById("mainConstraintLayoutHome");
        var textView2 = document.getElementById("textView2");
        var textView3 = document.getElementById("textView3");
        var textView4 = document.getElementById("textView4");
        var textView8 = document.getElementById("textView8");
        var messageContainer = document.getElementById("message-container");
        if (!playlistStatus && !connected) {
            allDivs.forEach(div => div.style.display = 'block');
            previewDisplayCode.textContent = code;
            previewDisplayCode.style.display = "block";
            messageContainer.style.display = "none";
        } else if (!playlistStatus && connected) {
            previewDisplayCode.textContent = code;
            previewDisplayCode.style.display = "none";
            messageContainer.style.display = "none";
        } else if (playlistStatus && connected && response.playlist.length == 0) {
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
        } else {
            previewDisplayCode.style.display = "none";
        }
    }
});

function stopPlaylist() {
    playlistFlag = false;
    clearTimeout(currentTimeout);
    clearInterval(scheduleTimer);
    clearInterval(endTimeTimer);
    messageContainer.innerHTML = '';
    //console.log("Playback stopped.");
}

socket.on('disconnect', function () {
    //console.log('Socket.IO disconnected.');
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

window.addEventListener('online', function() { showStatusDot('green'); });
window.addEventListener('offline', function() { showStatusDot('red'); });

if (navigator.onLine) {
    showStatusDot('green');
} else {
    showStatusDot('red');
}
