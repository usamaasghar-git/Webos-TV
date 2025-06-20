window.webSocketLoaded = true;
var idValue = "";
var screenHeight = "";
var screenWidth = "";
var allDivs = document.querySelectorAll('div'); // Select all div elements
var playlistFlag = true; // Assuming this flag controls playback
var currentTimeout = null; // Store timeout ID
let socketConnected = false;
let deviceIdFetched = false;
let joinEmitted = false;
    setTimeout(function() {
        if (typeof idValue === "undefined" || !document.getElementById("alert-indicator")) {
            console.warn("❌ JavaScript likely failed to load. Forcing reload.");
            location.reload();
        }
    }, 8000); // Wait 8s for JS to load

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

        // Get system ID information
        webOS.service.request('luna://com.webos.service.sm', {
            method: 'deviceid/getIDs',
            parameters: {
                idType: ['LGUDID']
            },
            onSuccess: function (inResponse) {
                if (inResponse && inResponse.idList && inResponse.idList.length > 0) {
                    idValue = inResponse.idList[0].idValue;
                    console.log('Device ID fetched:', idValue);
                    // proceed to use idValue (emit socket, etc.)
                    deviceIdFetched = true;
                    tryEmitJoinEvent();
                } else {
                    console.warn('idValue not found in the response object (retry #' + retryCount + ')');
                    if (retryCount < 3) {
                        setTimeout(function () {
                            fetchDeviceIdWithRetry(retryCount + 1);
                        }, 2000); // retry after 2s
                    }
                }
            },
            onFailure: function (inError) {
                console.error('Failed to get system ID information');
                console.error('[' + inError.errorCode + ']: ' + inError.errorText);

                if (retryCount < 3) {
                    setTimeout(function () {
                        fetchDeviceIdWithRetry(retryCount + 1);
                    }, 2000); // retry after 2s
                }
            }
        });
    }

document.addEventListener('DOMContentLoaded', function () {
    console.log("🌐 DOM fully loaded. Starting device ID fetch...");
    fetchDeviceIdWithRetry();
});




    // Get device screen information
    webOS.deviceInfo(function(device) {
        screenHeight = device.screenHeight;
        screenWidth = device.screenWidth;
        // console.log(screenHeight);
        // console.log(screenWidth);
        
    });

    // Connect to Socket.IO server
    var socket = io('https://groupe.snsplayer.com');
    var messageContainer = document.getElementById('message-container');

    // Event handler for Socket.IO connect
    socket.on('connect', function() {
        socketConnected = true;
        tryEmitJoinEvent();
        console.log('Socket.IO connected.');
    });

    // Event handler for Socket.IO screen event
    socket.on('screen', function(response) {
        console.log('Received screen response:', response);
        if (response.playlistStatus && response.playlist.length > 0) {
            // Hide all divs except for the message-container
            var messageContainer = document.getElementById('message-container'); // Get the message-container div
            messageContainer.style.display = 'block';   
            allDivs.forEach(function(div) {
                // Hide all divs except the one with id="message-container"
                if (div.id !== 'message-container') {
                    div.style.display = 'none'; // Hide other divs
                }
            });
            console.log('Received screen playlist status', response.playlistStatus);
            var currentItemIndex = 0;
            var orientation = response.orientation;
            // Function to display the next item in the playlist
            function displayNextItem() {
                var item = response.playlist[currentItemIndex];
                var contentElement = document.createElement('div');
                contentElement.classList.add('content-item');
            
                if (orientation === "90") contentElement.style.transform = "rotate(90deg)";
                else if (orientation === "180") contentElement.style.transform = "rotate(180deg)";
                else if (orientation === "270") contentElement.style.transform = "rotate(270deg)";
                else contentElement.style.transform = "rotate(0deg)";
            
                let loadPromise;
            
                if (item.type === 'application') {
                    loadPromise = pdfjsLib.getDocument(item.url).promise
                        .then(pdfDoc => pdfDoc.getPage(1))
                        .then(page => {
                            return new Promise(resolve => {
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                const viewport = page.getViewport({ scale: 1.5 });
                                canvas.width = viewport.width;
                                canvas.height = viewport.height;
                                page.render({ canvasContext: context, viewport }).promise
                                    .then(() => {
                                        contentElement.appendChild(canvas);
                                        resolve();
                                    });
                            });
                        });
            
                } else if (item.type === 'image') {
                    loadPromise = new Promise(resolve => {
                        const img = new Image();
                        img.src = item.url;
                        img.alt = item.name;
                        img.width = screenWidth;
                        img.height = screenHeight;
                        img.onload = () => resolve();
                        img.onerror = () => resolve();
                        contentElement.appendChild(img);
                    });
            
                } else if (item.type === 'video') {
                    loadPromise = new Promise(resolve => {
                        const video = document.createElement('video');
                        video.src = item.url;
                        video.width = screenWidth;
                        video.height = screenHeight;
                        video.autoplay = true;
                        video.playsInline = true;
                        video.muted = true; // Mute to allow autoplay
                        video.onloadeddata = () => resolve();
                        video.onerror = (e) => {
                            console.error("Video failed to load:", e);
                            resolve(); // Proceed to next
                        };
                        contentElement.appendChild(video);
                    });
                } else if (item.type === 'url') {
                    const webView = new WebView();
                    webView.load(item.url);
                    webView.style.width = screenWidth + 'px';
                    webView.style.height = screenHeight + 'px';
                    contentElement.appendChild(webView);
                    loadPromise = Promise.resolve();
                }
            
                // only when the new content is ready, update the screen
                loadPromise.then(() => {
                    messageContainer.innerHTML = '';
                    messageContainer.appendChild(contentElement);
            
                    // Proceed to next item
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
                });
            }
            
            // Start displaying the playlist
            displayNextItem();
        } else {
            stopPlaylist();
            localStorage.setItem('playlistStatus', response.playlistStatus);
            localStorage.setItem('code', response.code);
            localStorage.setItem('connected', response.connected);
            
            // Retrieve the values from localStorage
            var playlistStatus = localStorage.getItem('playlistStatus') === 'true'; // Convert to boolean
            var code = localStorage.getItem('code');
            var connected = localStorage.getItem('connected') === 'true'; // Convert to boolean
            
            console.log("inside else in screen event", connected, playlistStatus, code);
            
            // Fetch elements
            var previewDisplayCode = document.getElementById("preview_display_code");
             var mainConstraintLayoutHome = document.getElementById("mainConstraintLayoutHome");
            var textView5 = document.getElementById("textView5");
            var textView2 = document.getElementById("textView2");
            var textView3 = document.getElementById("textView3");
            var textView4 = document.getElementById("textView4");
            var textView8 = document.getElementById("textView8");
            var messageContainer= document.getElementById("message-container");            
            // Check the conditions using boolean logic
            if (!playlistStatus && !connected) {
                console.log("in if condition ");
                allDivs.forEach(function(div) {
                    div.style.display = 'block'; // Hide other divs
                });
                previewDisplayCode.textContent = code; // Set the code text
                previewDisplayCode.style.display = "block"; // Hide preview_display_code
                messageContainer.style.display = "none";
                textView5.style.display = "block"; // Show textView5
            } else if (!playlistStatus && connected) {
                console.log("in else if condition ");
                previewDisplayCode.textContent = code; // Set the code text
                previewDisplayCode.style.display = "none"; // Show preview_display_code
                messageContainer.style.display = "none";
                textView5.style.display = "none"; // Hide textView5
            } else if (playlistStatus && connected && response.playlist.length == 0) {
                // Clear localStorage to re-fetch fresh state on next screen load
                localStorage.removeItem('playlistStatus');
                localStorage.removeItem('connected');
                localStorage.removeItem('code');
                console.log("in else if condition for removing playlist ");
                textView2.style.display = "block";
                textView3.style.display = "block";
                textView8.style.display = "block";
                mainConstraintLayoutHome.style.display = "block";
                textView4.style.display = "block";
                previewDisplayCode.textContent = code || "D S P H R M";
                

                previewDisplayCode.style.display = "block"; // Hide preview_display_code
                messageContainer.style.display = "none";
                textView5.style.display = "none"; // Show textView5
            } else {
                console.log("in else condition");
                // In case of any other condition, you can reset or hide both if needed.
                previewDisplayCode.style.display = "none"; 
                textView5.style.display = "none"; 
            }            
        }
    });
    
    // **Function to stop playback**
    function stopPlaylist() {
        playlistFlag = false;
        clearTimeout(currentTimeout); // Stop scheduled updates
        messageContainer.innerHTML = ''; // Clear content
        console.log("Playback stopped.");
    }
    // Event handler for Socket.IO disconnect
    socket.on('disconnect', function() {
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

    // If green, hide after 10 seconds
    if (color === 'green') {
        clearTimeout(window.greenTimeout); // prevent overlapping timeouts
        window.greenTimeout = setTimeout(() => {
            dot.style.backgroundColor = 'transparent'; // hide
        }, 10000);
    }
}

// Event listeners for network changes
window.addEventListener('online', () => showStatusDot('green'));
window.addEventListener('offline', () => showStatusDot('red'));

// Initial check
if (navigator.onLine) {
    showStatusDot('green');
} else {
    showStatusDot('red');
}


