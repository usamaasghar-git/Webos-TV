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
socket.io.on('reconnect', (attempt) => {
    console.log('🔄 Socket reconnected (attempt:', attempt, '). Requesting updated playlist...');
    joinEmitted = false; // Reset so join can re-emit
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

        function displayNextItem() {
            const s = response.schedule;
        const tz = s.timezone === 'UTC' ? 'Asia/Karachi' : s.timezone;

        const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        const startDate = new Date(new Date(s.startDate).toLocaleString('en-US', { timeZone: tz }));
        const endDate   = new Date(new Date(s.endDate).toLocaleString('en-US', { timeZone: tz }));
            const inDateRange = now >= startDate && now <= endDate;

            // --- DAY OF WEEK ---
            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const inDayList = Array.isArray(s.daysOfWeek) && s.daysOfWeek
                .map(d => d.toLowerCase())
                .includes(currentDay);

            // --- TIME RANGE ---
            const parseHM = (hm) => {
                const [h, m] = hm.split(':').map(Number);
                return h * 60 + m;
            };
            const nowMinutes = parseHM(now.toTimeString().slice(0,5)); // "HH:MM" → total minutes
            const startMinutes = parseHM(s.startTime);
            const endMinutes = parseHM(s.endTime);
            const inTimeRange = nowMinutes >= startMinutes && nowMinutes <= endMinutes;
                        // --- FINAL VALIDATION ---
            if(!s.isActive || !inDateRange || !inDayList || !inTimeRange) {
                stopPlaylist();
                console.log("❌ Schedule found but NOT within valid window → not starting playlist");

                // Clear previous content
                messageContainer.innerHTML = '';
                messageContainer.style.display = 'flex';
                messageContainer.style.flexDirection = 'column';
                messageContainer.style.justifyContent = 'center';
                messageContainer.style.alignItems = 'center';
                messageContainer.style.height = '100vh';
                messageContainer.style.width = '100vw';
                messageContainer.style.backgroundColor = '#2F4C65'; // optional: keep screen dark

                // Create the text element
                const noPlaylistMsg = document.createElement('div');
                noPlaylistMsg.textContent = 'No Playlist Scheduled';
                noPlaylistMsg.style.color = 'white';
                noPlaylistMsg.style.fontSize = '5rem';
                noPlaylistMsg.style.fontWeight = 'bold';
                noPlaylistMsg.style.textAlign = 'center';

                // Append to container
                messageContainer.appendChild(noPlaylistMsg);
            } else
            {
                var item = response.playlist[0].content[currentItemIndex];
                console.log("Displaying item:", item);
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

                let loadPromise;

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
                }

                loadPromise.then(() => {
                    messageContainer.innerHTML = '';
                    messageContainer.appendChild(contentElement);

                    currentItemIndex = (currentItemIndex + 1) % response.playlist[0].content.length;
                    var videoEl = contentElement.querySelector('video');
                    var duration = 10000;

                    if (item.duration && !isNaN(parseInt(item.duration))) {
                        duration = parseInt(item.duration * 1000);
                    } else if (item.type === 'video' && videoEl && videoEl.duration && !isNaN(videoEl.duration)) {
                        duration = videoEl.duration * 1000;
                    }
                //  console.log("duration", duration);

                    clearTimeout(currentTimeout);
                    currentTimeout = setTimeout(displayNextItem, duration);
                });
            }
        }
        // 🕒 Get schedule-aware playback
        if (!response.schedule || Object.keys(response.schedule).length === 0) {
            // No schedule at all → always start playlist
            console.log("No schedule found, starting playlist");
            displayNextItem();
        } 
        else if (response.schedule) {
        const s = response.schedule;
        const tz = s.timezone === 'UTC' ? 'Asia/Karachi' : s.timezone;

        const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        const startDate = new Date(new Date(s.startDate).toLocaleString('en-US', { timeZone: tz }));
        const endDate   = new Date(new Date(s.endDate).toLocaleString('en-US', { timeZone: tz }));
            const inDateRange = now >= startDate && now <= endDate;

            // --- DAY OF WEEK ---
            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const inDayList = Array.isArray(s.daysOfWeek) && s.daysOfWeek
                .map(d => d.toLowerCase())
                .includes(currentDay);

            // --- TIME RANGE ---
            const parseHM = (hm) => {
                const [h, m] = hm.split(':').map(Number);
                return h * 60 + m;
            };
            const nowMinutes = parseHM(now.toTimeString().slice(0,5)); // "HH:MM" → total minutes
            const startMinutes = parseHM(s.startTime);
            const endMinutes = parseHM(s.endTime);
            const inTimeRange = nowMinutes >= startMinutes && nowMinutes <= endMinutes;

            // --- FINAL VALIDATION ---
            if (s.isActive && inDateRange && inDayList && inTimeRange) {
                console.log("✅ Schedule active and within time/day/date → starting playlist");
                displayNextItem();
            }else {
                stopPlaylist();
                console.log("❌ Schedule found but NOT within valid window → not starting playlist");

                // Clear previous content
                messageContainer.innerHTML = '';
                messageContainer.style.display = 'flex';
                messageContainer.style.flexDirection = 'column';
                messageContainer.style.justifyContent = 'center';
                messageContainer.style.alignItems = 'center';
                messageContainer.style.height = '100vh';
                messageContainer.style.width = '100vw';
                messageContainer.style.backgroundColor = '#2F4C65'; // optional: keep screen dark

                // Create the text element
                const noPlaylistMsg = document.createElement('div');
                noPlaylistMsg.textContent = 'No Playlist Scheduled';
                noPlaylistMsg.style.color = 'white';
                noPlaylistMsg.style.fontSize = '5rem';
                noPlaylistMsg.style.fontWeight = 'bold';
                noPlaylistMsg.style.textAlign = 'center';

                // Append to container
                messageContainer.appendChild(noPlaylistMsg);
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

window.addEventListener('online', () => showStatusDot('green'));
window.addEventListener('offline', () => showStatusDot('red'));

if (navigator.onLine) {
    showStatusDot('green');
} else {
    showStatusDot('red');
}
