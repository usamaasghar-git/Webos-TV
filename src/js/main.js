var playlistStatus = localStorage.getItem('playlistStatus');
var code = localStorage.getItem('code');
var connected = localStorage.getItem('connected');

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
