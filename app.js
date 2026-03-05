const API = "https://script.google.com/macros/s/AKfycbzjY_WQLzAXOugLpyLJbdWWltAQkc4oPhRboPEvnd0xL1XBBL3bB80WjvROTyoPHhh6/exec";

async function loadNextMatch(){

const res = await fetch(API + "?action=nextmatch");

const data = await res.json();

document.getElementById("match").innerHTML = `

<div class="match">

${data.SUQADRA_CASA} vs ${data.SUQADRA_TRASFERTA}

</div>

<div class="time">

${data.DATA} - ${data.ORA}

</div>

`;

}

loadNextMatch();
