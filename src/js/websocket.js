var idValue = "";
var screenHeight = "";
var screenWidth = "";
var allDivs = document.querySelectorAll('div'); // Select all div elements
var playlistFlag = true; // Assuming this flag controls playback
var currentTimeout = null; // Store timeout ID
// Fetch elements
var previewDisplayCode = document.getElementById("preview_display_code");
var textView5 = document.getElementById("textView5");
    if (typeof webOS !== 'undefined') {
        // Get system ID information
        webOS.service.request('luna://com.webos.service.sm', {
            method: 'deviceid/getIDs',
            parameters: {
                idType: ['LGUDID'],
            },
            onSuccess: function(inResponse) {
                if (inResponse && inResponse.idList && inResponse.idList.length > 0) {
                    idValue = inResponse.idList[0].idValue;
                    // Now you can use the idValue for further processing
                } else {
                    console.log('idValue not found in the response object');
                }
                // console.log('Result: ' + JSON.stringify(inResponse));
                // To-Do something
            },
            onFailure: function(inError) {
                console.log('Failed to get system ID information');
                console.log('[' + inError.errorCode + ']: ' + inError.errorText);
                // To-Do something
                return;
            },
        });
    } else {
        console.error('webOS object is not defined. Make sure your app is running in a webOS TV environment.');
    }

    // Get device screen information
    webOS.deviceInfo(function(device) {
        screenHeight = device.screenHeight;
        screenWidth = device.screenWidth;
        // console.log(screenHeight);
        // console.log(screenWidth);
        
    });

    // Connect to Socket.IO server
    var socket = io('https://snsplayer.com');
    var messageContainer = document.getElementById('message-container');

    // Event handler for Socket.IO connect
    socket.on('connect', function() {
        console.log('Socket.IO connected.');
        var dataToSend = {
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
        socket.emit('join', dataToSend);
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
                        video.playsInline = true; // for autoplay on some TVs
                        video.onloadeddata = () => resolve();
                        video.onerror = () => resolve();
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
                    let duration = parseInt(item.duration || "10000");
            
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
                console.log("in else if condition for removing playlist ");
                textView2.style.display = "block";
                textView3.style.display = "block";
                textView8.style.display = "block";
                mainConstraintLayoutHome.style.display = "block";
                textView4.style.display = "block";
                previewDisplayCode.textContent = "D S P H R M"; // Set the code text

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
