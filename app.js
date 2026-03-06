const API = "https://script.google.com/macros/s/AKfycbzW0P6NsswIahKqlw-h0d7p41ETqTkaaysoJ_nH-9_9hJCmYLUtSM6tqLA-z368_dpL/exec";

async function loadNextMatch(){

const res = await fetch(API + "?action=nextmatch");
const data = await res.json();

document.getElementById("match").innerHTML = `

<div class="match">
${data.SUQADRA_CASA} vs ${data.SUQADRA_TRASFERTA}
</div>

<div class="time">
${formatDate(data.DATA)} - ${data.ORA}
</div>

`;

}

function formatDate(date){

const d = new Date(date);

return d.toLocaleDateString("it-IT", {
day:"numeric",
month:"long"
});

}

loadNextMatch();
