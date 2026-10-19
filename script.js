(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas = $("canvas"), ctx = canvas.getContext("2d");
const N = 24, CELL = 25, SIZE = 600;
const DIR = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
const KEY = {ArrowUp:"up",w:"up",W:"up",ArrowDown:"down",s:"down",S:"down",ArrowLeft:"left",a:"left",A:"left",ArrowRight:"right",d:"right",D:"right"};
const DIFF = {easy:{speed:190,obstacles:0},normal:{speed:140,obstacles:10},hard:{speed:105,obstacles:20},extreme:{speed:78,obstacles:30}};
const POWER = {
 speed:{name:"Speed Boost",icon:"⚡",color:"#ffe66d",ms:5000},
 slow:{name:"Slow Motion",icon:"❄",color:"#55cfff",ms:6000},
 shield:{name:"Shield",icon:"⬡",color:"#a5ff62",ms:10000},
 ghost:{name:"Ghost Mode",icon:"👻",color:"#bd83ff",ms:5000},
 double:{name:"Double Score",icon:"×2",color:"#ff75cf",ms:8000},
 bonus:{name:"Bonus Food",icon:"★",color:"#ffb86b",ms:0},
 magnet:{name:"Food Magnet",icon:"✧",color:"#44f0e5",ms:7000}
};
const KEYS = {records:"neonArenaRecordsFixed",settings:"neonArenaSettingsFixed",player:"neonArenaPlayerFixed"};
function read(key,fallback){try{const x=localStorage.getItem(key);return x===null?fallback:JSON.parse(x)}catch{return fallback}}
function write(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch{notify("Browser storage is unavailable.")}}
let records=read(KEYS.records,[]);if(!Array.isArray(records))records=[];
let settings={effects:true,music:false,grid:true,reduced:false,volume:35,...read(KEYS.settings,{})};
let game=null,state="menu",dir="right",nextDir="right",raf=0,last=0,acc=0,elapsed=0,survival=0,particles=[],toastTimer=0,audioCtx=null,musicOsc=null,musicGain=null,swipe=null;

function notify(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2200)}
function show(id){document.querySelectorAll(".screen").forEach(el=>el.classList.toggle("active",el.id===id))}
function modeName(m){return ({classic:"Classic",obstacle:"Obstacle Run",survival:"Survival",time:"Time Attack"})[m]||"Classic"}
function sound(name){
 if(!settings.effects)return;
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  audioCtx ||= new AC();if(audioCtx.state==="suspended")audioCtx.resume();
  const notes={click:[420,.04],start:[520,.14],eat:[680,.08],power:[850,.16],over:[150,.3],pause:[250,.07],record:[1000,.22],level:[780,.12]};
  const [freq,dur]=notes[name]||notes.click,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.type=name==="over"?"sawtooth":"sine";osc.frequency.setValueAtTime(freq,audioCtx.currentTime);
  gain.gain.setValueAtTime((settings.volume/100)*.12,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
  osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+dur);
 }catch{}
}
function music(){try{if(!settings.music){if(musicOsc){musicOsc.stop();musicOsc=null}return}if(musicOsc)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioCtx ||= new AC();musicOsc=audioCtx.createOscillator();musicGain=audioCtx.createGain();musicOsc.frequency.value=110;musicGain.gain.value=settings.volume/100*.025;musicOsc.connect(musicGain);musicGain.connect(audioCtx.destination);musicOsc.start()}catch{}}
function stopMusic(){try{if(musicOsc){musicOsc.stop();musicOsc.disconnect();musicOsc=null}if(musicGain){musicGain.disconnect();musicGain=null}}catch{musicOsc=null;musicGain=null}}
function syncSound(){const text="♫ Sound: "+(settings.effects?"On":"Off");$("soundBtn").textContent=text;$("gameSound").textContent=text}
function bestScore(){return records.reduce((n,r)=>Math.max(n,Number(r.score)||0),0)}
function updateHome(){ $("homeBest").textContent=bestScore();$("homeGames").textContent=records.length;$("homeFood").textContent=records.reduce((n,r)=>n+(Number(r.food)||0),0)}
function occupied(p){return game.snake.some(s=>same(s,p))||game.obstacles.some(o=>same(o,p))||same(game.food,p)||same(game.power,p)}
function same(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y}
function spawn(){
 for(let i=0;i<1000;i++){const p={x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)};if(!occupied(p))return p}
 return null;
}
function newGame(){
 cancelAnimationFrame(raf);stopMusic();
 const mode=$("mode").value,difficulty=$("difficulty").value,conf=DIFF[difficulty];
 game={name:$("player").value.trim().slice(0,18)||"Player",mode,difficulty,score:0,foodCount:0,powerCount:0,avoided:0,level:1,speed:conf.speed,
 snake:[{x:8,y:12},{x:7,y:12},{x:6,y:12}],food:null,power:null,obstacles:[],powers:{},shield:0,started:false,saved:false,bestAtStart:bestScore(),startedAt:0};
 $("player").value=game.name;write(KEYS.player,game.name);
 dir=nextDir="right";acc=0;last=0;elapsed=0;survival=0;particles=[];
 for(let i=0;i<conf.obstacles;i++){const p=spawn();if(p)game.obstacles.push(p)}
 game.food=spawn();
 state="ready";show("game");
 $("sessionInfo").textContent=`${game.name} · ${modeName(mode)} · ${difficulty}`;
 $("modeLabel").textContent=modeName(mode).toUpperCase()+" MODE";
 $("score").textContent="0";$("best").textContent=game.bestAtStart;$("time").textContent=mode==="time"?"60":"∞";$("level").textContent="1";$("foodCount").textContent="FOOD: 0";$("status").textContent="READY";
 $("abilities").textContent="Collect a power-up to unlock an ability.";
 $("overlaySymbol").textContent="◈";$("overlayTitle").textContent="READY?";$("overlayText").textContent="Eat food and avoid collisions.";$("overlayAction").textContent="START ROUND";$("overlay").classList.remove("hidden");
 $("pause").innerHTML='Ⅱ Pause <kbd>SPACE</kbd>';syncSound();draw();raf=requestAnimationFrame(loop);
}
function begin(){if(state!=="ready")return;state="running";game.started=true;game.startedAt=Date.now();last=0;acc=0;$("overlay").classList.add("hidden");$("status").textContent="PLAYING";sound("start");music()}
function interval(){let ms=game.speed;if(game.powers.speed)ms*=.65;if(game.powers.slow)ms*=1.5;return Math.max(42,ms)}
function loop(t){raf=requestAnimationFrame(loop);if(!game)return;if(!last)last=t;const dt=Math.min(100,t-last);last=t;
 if(state==="running"){elapsed+=dt;acc+=dt;updatePowers();if(game.mode==="time"){const left=Math.max(0,60-elapsed/1000);$("time").textContent=Math.ceil(left);if(left<=0){finish("TIME UP")}}
 if(state==="running"&&acc>=interval()){acc%=interval();step()}}
 updateParticles(dt);draw();
}
function updatePowers(){const now=performance.now();for(const k of Object.keys(game.powers))if(now>=game.powers[k])delete game.powers[k];
 if(game.mode==="survival"){survival+=16;if(survival>12000){survival=0;addObstacle()}}
 if(game.powers.magnet&&game.food&&Math.random()<.04){const h=game.snake[0],p={x:h.x+Math.sign(game.food.x-h.x),y:h.y+Math.sign(game.food.y-h.y)};if(p.x>=0&&p.x<N&&p.y>=0&&p.y<N&&!game.snake.some(s=>same(s,p))&&!game.obstacles.some(o=>same(o,p)))game.food=p}
 renderAbilities();
}
function step(){
 dir=nextDir;const d=DIR[dir],head={x:game.snake[0].x+d.x,y:game.snake[0].y+d.y};
 const ghost=!!game.powers.ghost,wrap=ghost&&game.mode!=="obstacle"&&game.mode!=="survival";
 if(wrap){head.x=(head.x+N)%N;head.y=(head.y+N)%N}
 const wall=head.x<0||head.x>=N||head.y<0||head.y>=N;
 const eating=same(head,game.food);
 const body=game.snake.slice(0,eating?game.snake.length:game.snake.length-1);
 const bodyHit=body.some(p=>same(p,head)),obstacle=game.obstacles.some(p=>same(p,head));
 if(wall||bodyHit||(obstacle&&!ghost)){
   if(game.shield>0||game.powers.shield){if(game.shield>0)game.shield--;else delete game.powers.shield;sound("power");notify("Shield absorbed the collision!");if(wall){head.x=Math.max(0,Math.min(N-1,head.x));head.y=Math.max(0,Math.min(N-1,head.y))}else{game.snake=[{x:8,y:12},{x:7,y:12},{x:6,y:12}];dir=nextDir="right";return}}
   else{finish("GAME OVER");return}
 }
 if(wall){finish("GAME OVER");return}
 if(obstacle&&ghost)game.avoided++;
 game.snake.unshift(head);
 if(eating)eat();else game.snake.pop();
 if(same(head,game.power))collectPower();
 if(game.mode==="obstacle"&&game.foodCount>0&&game.foodCount%4===0&&game.lastObstacleAt!==game.foodCount){game.lastObstacleAt=game.foodCount;addObstacle()}
}
function eat(){game.foodCount++;game.score+=game.powers.double?20:10;sound("eat");burst(game.snake[0],"#a5ff62",12);if(game.foodCount%5===0){game.level++;game.speed=Math.max(43,game.speed-5);sound("level");notify("LEVEL "+game.level+"!")}
 game.food=spawn();if(game.foodCount%4===0&&!game.power)game.power=spawn();updateHUD()}
function collectPower(){const names=Object.keys(POWER),key=names[Math.floor(Math.random()*names.length)],p=POWER[key];game.power=null;game.powerCount++;sound("power");burst(game.snake[0],p.color,18);
 if(key==="bonus"){game.score+=game.powers.double?60:30;game.foodCount++;game.food=spawn();sound("record")}else if(key==="shield"){game.shield++;game.powers.shield=performance.now()+p.ms}else game.powers[key]=performance.now()+p.ms;
 notify(p.icon+" "+p.name+"!");updateHUD();renderAbilities()}
function addObstacle(){if(game.obstacles.length>65)return;const p=spawn();if(!p)return;if(game.snake.some(s=>Math.abs(s.x-p.x)+Math.abs(s.y-p.y)<3))return;game.obstacles.push(p)}
function updateHUD(){$("score").textContent=game.score;$("level").textContent=game.level;$("foodCount").textContent="FOOD: "+game.foodCount}
function finish(reason){if(state==="over")return;state="over";$("status").textContent="SESSION ENDED";$("overlay").classList.remove("hidden");$("overlaySymbol").textContent=reason==="TIME UP"?"◷":"✕";$("overlayTitle").textContent=reason;$("overlayText").textContent=`${game.name}, you scored ${game.score} points and collected ${game.foodCount} food.`;$("overlayAction").textContent="PLAY AGAIN";stopMusic();sound("over");saveRecord()}
function saveRecord(){if(!game||game.saved)return;game.saved=true;const r={name:game.name,score:game.score,mode:game.mode,difficulty:game.difficulty,level:game.level,food:game.foodCount,powers:game.powerCount,avoided:game.avoided,date:new Date().toISOString()};records.push(r);records.sort((a,b)=>b.score-a.score);records=records.slice(0,100);write(KEYS.records,records);updateHome();if(r.score>game.bestAtStart){sound("record");notify("NEW BEST SCORE!")}}
function goHome(){if(game&&game.started&&!game.saved&&(state==="running"||state==="paused"||state==="ready"))saveRecord();state="menu";cancelAnimationFrame(raf);stopMusic();show("home");updateHome()}
function renderAbilities(){if(!game)return;const now=performance.now(),keys=Object.keys(game.powers).filter(k=>game.powers[k]>now);if(game.shield>0&&!keys.includes("shield"))keys.push("shield");const box=$("abilities");box.replaceChildren();if(!keys.length){box.textContent="Collect a power-up to unlock an ability.";box.className="muted";return}box.className="";
 keys.forEach(k=>{const p=POWER[k],left=game.powers[k]?Math.max(0,game.powers[k]-now):0;const el=document.createElement("div");el.className="ability";const title=document.createElement("b");title.textContent=p.icon+" "+p.name;const detail=document.createElement("small");detail.textContent=k==="shield"&&game.shield?`Charges: ${game.shield}`:`${(left/1000).toFixed(1)}s remaining`;const track=document.createElement("div");track.className="track";const bar=document.createElement("i");bar.style.width=(k==="shield"&&game.shield?100:Math.min(100,left/(p.ms||1)*100))+"%";bar.style.background=p.color;track.append(bar);el.append(title,detail,track);box.append(el)})
}
function burst(pos,color,count){if(settings.reduced)return;for(let i=0;i<count;i++)particles.push({x:pos.x*CELL+CELL/2,y:pos.y*CELL+CELL/2,vx:(Math.random()-.5)*140,vy:(Math.random()-.5)*140,life:.6,color})}
function updateParticles(dt){particles.forEach(p=>{p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.life-=dt/1000});particles=particles.filter(p=>p.life>0)}
function rect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function draw(){ctx.clearRect(0,0,SIZE,SIZE);ctx.fillStyle="#090f1b";ctx.fillRect(0,0,SIZE,SIZE);
 if(settings.grid){ctx.strokeStyle="#6987b918";ctx.lineWidth=1;for(let i=0;i<=N;i++){ctx.beginPath();ctx.moveTo(i*CELL,0);ctx.lineTo(i*CELL,SIZE);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*CELL);ctx.lineTo(SIZE,i*CELL);ctx.stroke()}}
 if(!game)return;
 game.obstacles.forEach(o=>{ctx.save();ctx.shadowColor="#ff547c";ctx.shadowBlur=8;ctx.fillStyle="#401b35";rect(o.x*CELL+3,o.y*CELL+3,CELL-6,CELL-6,5);ctx.fill();ctx.strokeStyle="#ff547c";ctx.stroke();ctx.restore()});
 if(game.food){const x=game.food.x*CELL+12.5,y=game.food.y*CELL+12.5,pulse=settings.reduced?1:1+Math.sin(performance.now()/150)*.1;ctx.save();ctx.translate(x,y);ctx.scale(pulse,pulse);ctx.shadowColor="#a5ff62";ctx.shadowBlur=18;ctx.fillStyle="#a5ff62";ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();ctx.restore()}
 if(game.power){const names=Object.keys(POWER),k=names[Math.floor(performance.now()/400)%names.length],p=POWER[k];ctx.save();ctx.shadowColor=p.color;ctx.shadowBlur=16;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(game.power.x*CELL+12.5,game.power.y*CELL+12.5,7,0,Math.PI*2);ctx.fill();ctx.restore()}
 game.snake.forEach((s,i)=>{const x=s.x*CELL,y=s.y*CELL,head=i===0;ctx.save();ctx.globalAlpha=game.powers.ghost&&!head?.55:1;ctx.shadowColor=head?"#a5ff62":"#44f0e5";ctx.shadowBlur=head?16:7;const g=ctx.createLinearGradient(x,y,x+CELL,y+CELL);g.addColorStop(0,head?"#d6ff9c":"#44f0e5");g.addColorStop(1,head?"#a5ff62":"#1cbbad");ctx.fillStyle=g;rect(x+2,y+2,CELL-4,CELL-4,head?7:5);ctx.fill();if(head){ctx.shadowBlur=0;ctx.fillStyle="#081018";let eyes=dir==="right"?[[17,7],[17,16]]:dir==="left"?[[7,7],[7,16]]:dir==="up"?[[7,7],[16,7]]:[[7,17],[16,17]];eyes.forEach(([a,b])=>{ctx.beginPath();ctx.arc(x+a,y+b,2,0,Math.PI*2);ctx.fill()})}ctx.restore()});
 particles.forEach(p=>{ctx.save();ctx.globalAlpha=Math.max(0,p.life/.6);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();ctx.restore()})
}
function change(d){if(!DIR[d])return;const a=DIR[dir],b=DIR[d];if(a.x+b.x===0&&a.y+b.y===0)return;nextDir=d}
function pause(){if(state==="ready"){begin();return}if(state==="running"){state="paused";$("status").textContent="PAUSED";$("overlay").classList.remove("hidden");$("overlaySymbol").textContent="Ⅱ";$("overlayTitle").textContent="PAUSED";$("overlayText").textContent="Take a breath. The arena awaits.";$("overlayAction").textContent="RESUME GAME";$("pause").innerHTML='▶ Resume <kbd>SPACE</kbd>';stopMusic();sound("pause")}else if(state==="paused"){state="running";last=0;acc=0;$("status").textContent="PLAYING";$("overlay").classList.add("hidden");$("pause").innerHTML='Ⅱ Pause <kbd>SPACE</kbd>';music()}}
document.addEventListener("keydown",e=>{if(KEY[e.key]&&(state==="running"||state==="ready")){e.preventDefault();if(state==="ready")begin();change(KEY[e.key]);return}if(e.code==="Space"&&state!=="menu"){e.preventDefault();pause()}if(e.key.toLowerCase()==="r"&&state!=="menu")newGame();if(e.key==="Escape"&&state!=="menu")goHome()});
document.querySelectorAll("[data-dir]").forEach(b=>b.addEventListener("pointerdown",e=>{e.preventDefault();if(state==="ready")begin();if(state==="running")change(b.dataset.dir)}));
canvas.addEventListener("pointerdown",e=>{swipe={x:e.clientX,y:e.clientY}});
canvas.addEventListener("pointerup",e=>{if(!swipe)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;if(state==="ready")begin();if(state!=="running")return;change(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up"))});
canvas.addEventListener("pointercancel",()=>swipe=null);
document.addEventListener("visibilitychange",()=>{if(document.hidden&&state==="running")pause()});
$("start").onclick=()=>{sound("click");newGame()};
$("homeLink").onclick=e=>{e.preventDefault();goHome()};
$("menu").onclick=goHome;$("restart").onclick=newGame;$("pause").onclick=pause;
$("overlayAction").onclick=()=>{if(state==="ready")begin();else if(state==="paused")pause();else if(state==="over")newGame()};
$("recordsOpen").onclick=()=>{renderRecords();show("records")};
$("settingsOpen").onclick=()=>{loadSettings();show("settings")};
$("helpOpen").onclick=()=>show("help");
$("recordsBack").onclick=()=>{show("home");updateHome()};
$("settingsBack").onclick=()=>show("home");$("helpBack").onclick=()=>show("home");$("helpStart").onclick=()=>newGame();
function renderRecords(){const best=bestScore(),total=records.reduce((n,r)=>n+r.score,0);$("rGames").textContent=records.length;$("rBest").textContent=best;$("rAvg").textContent=records.length?Math.round(total/records.length):0;const body=$("recordRows");body.replaceChildren();if(!records.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.textContent="No games yet. Start your first run!";tr.append(td);body.append(tr);return}records.slice(0,30).forEach(r=>{const tr=document.createElement("tr");[r.name,r.score,modeName(r.mode),r.difficulty,new Date(r.date).toLocaleDateString()].forEach(v=>{const td=document.createElement("td");td.textContent=String(v);tr.append(td)});body.append(tr)})}
$("clearRecords").onclick=()=>{if(confirm("Permanently clear all saved records?")){records=[];write(KEYS.records,records);renderRecords();updateHome();notify("Records cleared.")}};
function loadSettings(){$("effects").checked=settings.effects;$("music").checked=settings.music;$("grid").checked=settings.grid;$("reduced").checked=settings.reduced;$("volume").value=settings.volume}
$("saveSettings").onclick=()=>{settings={effects:$("effects").checked,music:$("music").checked,grid:$("grid").checked,reduced:$("reduced").checked,volume:Number($("volume").value)};write(KEYS.settings,settings);syncSound();if(settings.music)music();else stopMusic();draw();notify("Settings saved!")};
function toggleSound(){settings.effects=!settings.effects;write(KEYS.settings,settings);syncSound();if(settings.effects)sound("click")}
$("soundBtn").onclick=toggleSound;$("gameSound").onclick=toggleSound;
function init(){const name=read(KEYS.player,"");if(typeof name==="string")$("player").value=name;loadSettings();syncSound();updateHome();game={snake:[{x:8,y:12},{x:7,y:12},{x:6,y:12}],food:{x:15,y:12},power:null,obstacles:[],powers:{}};draw()}
init();
})();