const API = "https://script.google.com/macros/s/AKfycbzW0P6NsswIahKqlw-h0d7p41ETqTkaaysoJ_nH-9_9hJCmYLUtSM6tqLA-z368_dpL/exec";

async function loadNextMatch(){

const res = await fetch(API + "?action=nextmatch");

const data = await res.json();

if(data.message){

document.getElementById("match").innerHTML = `
<div class="card">
Nessuna partita programmata
</div>
`;

return;
}

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
