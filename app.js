const API = "https://script.google.com/macros/s/AKfycbzsQybRdKpvftDfdASyhKEldTa_SKuteYeE7sNv3QOHaoKBoYBc4ek5RhMR1BqNwpBJ/exec";

async function loadNextMatch(){

const res = await fetch(API + "?action=nextmatch");

const data = await res.json();

document.getElementById("match").innerHTML =

`<div class="card">

${data.SUQADRA_CASA} vs ${data.SUQADRA_TRASFERTA}

<br>

${data.DATA} - ${data.ORA}

</div>`;

}

loadNextMatch();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
