var playlistStatus = localStorage.getItem('playlistStatus');
var code = localStorage.getItem('code');
var connected = localStorage.getItem('connected');
var socket = io('https://www.snsplayer.com'); // Connect to Socket.IO server
if (playlistStatus == "false" && connected == "true") {
    console.log("in if condition ")
    document.getElementById("preview_display_code").style.display = "none";
    document.getElementById("textView3").style.display = "none";
    document.getElementById("textView4").style.display = "block";    
} else{
    console.log("in else if condition ")
    document.getElementById("preview_display_code").textContent = code;
    document.getElementById("preview_display_code").style.display = "block";
    document.getElementById("textView3").style.display = "block";
    document.getElementById("textView4").style.display = "none";
}
socket.on('connect', function() {
    console.log('Socket.IO connected.');
});
socket.on('screen', function(response) {
    console.log('Received screen response:', response);
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
socket.on('disconnect', function() {
    console.log('Socket.IO disconnected.');
});