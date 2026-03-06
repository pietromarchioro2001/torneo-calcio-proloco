const API = "https://script.google.com/macros/s/AKfycbzW0P6NsswIahKqlw-h0d7p41ETqTkaaysoJ_nH-9_9hJCmYLUtSM6tqLA-z368_dpL/exec";

let teams = {};

async function loadTeams(){

const res = await fetch(API + "?action=teams");
const data = await res.json();

data.forEach(t=>{
teams[t.TEAM_ID] = t.NOME_SQUADRA;
});

}

async function loadNextMatch(){

const res = await fetch(API + "?action=nextmatch");
const data = await res.json();

const home = teams[data.SUQADRA_CASA] || data.SUQADRA_CASA;
const away = teams[data.SUQADRA_TRASFERTA] || data.SUQADRA_TRASFERTA;

document.getElementById("match").innerHTML = `

<div class="match">

${home} vs ${away}

</div>

<div class="time">

${data.DATA} - ${data.ORA}

</div>

`;

}

async function init(){

await loadTeams();
await loadNextMatch();

}

init();
