var idValue = "";
var screenHeight = "";
var screenWidth = "";
window.onload = function() {
  // Ensure the webOS object is available
  if (typeof webOS !== 'undefined') {
        // Get system ID information
        webOS.service.request('luna://com.webos.service.sm', {
            method: 'deviceid/getIDs',
            parameters: {
                idType: ['LGUDID'],
            },
            onSuccess: function (inResponse) {
                if (inResponse && inResponse.idList && inResponse.idList.length > 0) {
                    idValue = inResponse.idList[0].idValue;
                    // Now you can use the idValue for further processing
                } else {
                    console.log('idValue not found in the response object');
                }
                console.log('Result: ' + JSON.stringify(inResponse));
                // To-Do something
            },
            onFailure: function (inError) {
                console.log('Failed to get system ID information');
                console.log('[' + inError.errorCode + ']: ' + inError.errorText);
                // To-Do something
                return;
            },
        });
    } else {
      console.error('webOS object is not defined. Make sure your app is running in a webOS TV environment.');
    }
    webOS.deviceInfo(function (device) {
        // console.log(device)
        screenHeight = device.screenHeight;
        screenWidth = device.screenWidth;
        // console.log(screenHeight)
        // console.log(screenWidth)
      });
      
};
var socket = io('https://www.snsplayer.com'); // Connect to Socket.IO server
var messageContainer = document.getElementById('message-container');

socket.on('connect', function() {
    console.log('Socket.IO connected.');
    var dataToSend = {
        detail: {
            mac: "idValue",
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

socket.on('join', function(data) {
    console.log('Received data:', data); // Log the received data to the console
    // Display the received data in the UI
    var messageElement = document.createElement('p');
    messageElement.textContent = JSON.stringify(data);
    messageContainer.appendChild(messageElement);
});

socket.on('disconnect', function() {
    console.log('Socket.IO disconnected.');
});
socket.on('screen', function(response) {
    console.log('Received screen response:', response); // Log the received response to the console
    if(response.playlistStatus){
        console.log('Received screen playlist status', response.playlistStatus);
        var currentItemIndex = 0;
    var orientation = response.orientation;
    // Function to display the next item in the playlist
    function displayNextItem() {
        var item = response.playlist[currentItemIndex];
        // Clear existing content in the message container
        messageContainer.innerHTML = '';
        
        var contentElement = document.createElement('div');
        contentElement.classList.add('content-item');
        // Apply orientation styles based on the orientation value
        if (orientation === "0") {
            contentElement.style.transform = "rotate(0deg)";
        } else if (orientation === "90") {
            contentElement.style.transform = "rotate(90deg)";
        } else if (orientation === "180") {
            contentElement.style.transform = "rotate(180deg)";
        } else if (orientation === "270") {
            contentElement.style.transform = "rotate(270deg)";
        }
        if (item.type === 'application') {
            // Initialize PDF.js
            var url = "https://www.snsplayer.com/" + item.url;
            console.log(url)
            pdfjsLib.getDocument(url).promise.then(function(pdfDoc) {
                // Render the first page of the PDF
                pdfDoc.getPage(1).then(function(page) {
                    var canvas = document.createElement('canvas');
                    var context = canvas.getContext('2d');
                    // Set the canvas dimensions
                    var viewport = page.getViewport({ scale: 1.5 });
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    // Render the PDF page on the canvas
                    var renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    page.render(renderContext);
                    // Append the canvas to the content element
                    contentElement.appendChild(canvas);
                });
            });
        } else if (item.type === 'image') {
            var imageElement = document.createElement('img');
            var url = "https://www.snsplayer.com/" + item.url;
            imageElement.setAttribute('src', url);
            imageElement.setAttribute('alt', item.name);
            imageElement.setAttribute('width', screenWidth + 'px');
            imageElement.setAttribute('height', screenHeight + 'px');
            contentElement.appendChild(imageElement);
        } else if (item.type === 'video') {
        var videoElement = document.createElement('video');
        var url = "https://www.snsplayer.com/" + item.url;
        videoElement.setAttribute('src', url);
        videoElement.setAttribute('width', screenWidth + 'px');
        videoElement.setAttribute('height', screenHeight + 'px');
        videoElement.setAttribute('controls', 'controls');
        contentElement.appendChild(videoElement);
    } else if (item.type === 'url') {
        var iframeElement = document.createElement('iframe');
        var url = "https://www.snsplayer.com/" + item.url;
        iframeElement.setAttribute('src', url);
        iframeElement.setAttribute('width', screenWidth + 'px');
        iframeElement.setAttribute('height', screenHeight + 'px');
        contentElement.appendChild(iframeElement);
    }
    messageContainer.appendChild(contentElement);

        messageContainer.appendChild(contentElement);
        // Increment currentItemIndex and check if it exceeds the playlist length
        currentItemIndex++;
        if (currentItemIndex >= response.playlist.length) {
            // If currentItemIndex exceeds the playlist length, reset it to zero
            currentItemIndex = 0;
        }
        // Schedule display of the next item after a specific time period (in milliseconds)
        setTimeout(displayNextItem, 10000);
    }
    // Start displaying the playlist
    displayNextItem();
    }
    else{
        localStorage.setItem('playlistStatus', response.playlistStatus);
        localStorage.setItem('code', response.code);
        localStorage.setItem('connected', response.connected);
        window.location.href = "dashboard.html";
    }
});



