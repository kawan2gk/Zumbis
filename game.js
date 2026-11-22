(() => {
  const canvas = document.getElementById("game"), ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const healthEl = $("health"), ammoEl = $("ammo"), killsEl = $("kills"), coordsEl = $("coords");
  const messageEl = $("message"), startScreen = $("start-screen"), gameOverScreen = $("game-over");
  const moveBase = $("move-base"), aimBase = $("aim-base");
  let W=0,H=0,dpr=1,running=false,lastTime=0,camera={x:0,y:0};
  let player,zombies=[],bullets=[],pickups=[],obstacles=[],trees=[],keys={};
  let kills=0,spawnTimer=0,moveTouch=null,aimTouch=null,moveVec={x:0,y:0},aimVec={x:0,y:0};
  let aimAngle=-Math.PI/2, fireTimer=0, mouseDown=false, mousePos={x:0,y:0,valid:false};
  const WORLD=3200, STICK_RANGE=39, SHOT_INTERVAL=1;
  const rand=(a,b)=>Math.random()*(b-a)+a, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

  function resize(){ dpr=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight; canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  addEventListener("resize",resize); resize();

  function resetGame(){
    player={x:WORLD/2,y:WORLD/2,r:14,speed:145,health:100,angle:-Math.PI/2,invuln:0};
    zombies=[]; bullets=[]; pickups=[]; obstacles=[]; trees=[]; kills=0; spawnTimer=1; fireTimer=0;
    for(let i=0;i<75;i++){
      const x=rand(100,WORLD-100),y=rand(100,WORLD-100);
      if(dist({x,y},player)<300) continue;
      obstacles.push({x,y,w:rand(65,125),h:rand(55,115),type:"building"});
    }
    for(let i=0;i<105;i++){
      const x=rand(35,WORLD-35),y=rand(35,WORLD-35);
      if(dist({x,y},player)>230) trees.push({x,y,r:rand(15,24)});
    }
    for(let i=0;i<10;i++) spawnZombie(true);
    for(let i=0;i<25;i++) spawnPickup();
    updateHud();
  }
  function spawnZombie(initial=false){
    const a=rand(0,Math.PI*2),r=initial?rand(280,650):rand(480,720);
    zombies.push({x:clamp(player.x+Math.cos(a)*r,25,WORLD-25),y:clamp(player.y+Math.sin(a)*r,25,WORLD-25),r:13,speed:rand(27,39)+Math.min(kills*.25,8),hp:1,attack:0});
  }
  function spawnPickup(){pickups.push({x:rand(70,WORLD-70),y:rand(70,WORLD-70),type:Math.random()<.65?"ammo":"med",r:10});}
  function updateHud(){healthEl.textContent=Math.max(0,Math.ceil(player.health));ammoEl.textContent="∞";killsEl.textContent=kills;coordsEl.textContent=`${Math.round(player.x/10)}, ${Math.round(player.y/10)}`;}
  function say(t){messageEl.textContent=t;}

  function blocked(x,y,r){
    for(const o of obstacles){
      const nx=clamp(x,o.x-o.w/2,o.x+o.w/2),ny=clamp(y,o.y-o.h/2,o.y+o.h/2);
      if(Math.hypot(x-nx,y-ny)<r+2)return true;
    }
    for(const t of trees) if(Math.hypot(x-t.x,y-t.y)<r+t.r*.65)return true;
    return false;
  }
  function moveEntity(entity,dx,dy){
    const nx=clamp(entity.x+dx,18,WORLD-18),ny=clamp(entity.y+dy,18,WORLD-18);
    if(!blocked(nx,entity.y,entity.r))entity.x=nx;
    if(!blocked(entity.x,ny,entity.r))entity.y=ny;
  }
  function shoot(){
    bullets.push({x:player.x+Math.cos(player.angle)*23,y:player.y+Math.sin(player.angle)*23,vx:Math.cos(player.angle)*560,vy:Math.sin(player.angle)*560,life:1.05,r:4});
  }
  function update(dt){
    if(!running)return;
    const kx=(keys.d||keys.ArrowRight?1:0)-(keys.a||keys.ArrowLeft?1:0);
    const ky=(keys.s||keys.ArrowDown?1:0)-(keys.w||keys.ArrowUp?1:0);
    let dx=kx+moveVec.x,dy=ky+moveVec.y,len=Math.hypot(dx,dy);
    if(len>1){dx/=len;dy/=len;}
    moveEntity(player,dx*player.speed*dt,dy*player.speed*dt);

    camera.x=clamp(player.x-W/2,0,Math.max(0,WORLD-W));
    camera.y=clamp(player.y-H/2,0,Math.max(0,WORLD-H));

    if(aimTouch && Math.hypot(aimVec.x,aimVec.y)>.18) player.angle=Math.atan2(aimVec.y,aimVec.x);
    else if(mousePos.valid && !("ontouchstart" in window)) player.angle=Math.atan2(mousePos.y+camera.y-player.y,mousePos.x+camera.x-player.x);
    else if(zombies.length && !aimTouch){const z=zombies.reduce((a,b)=>dist(a,player)<dist(b,player)?a:b);player.angle=Math.atan2(z.y-player.y,z.x-player.x);}
    player.invuln=Math.max(0,player.invuln-dt);

    // No celular, manter o dedo na metade direita faz um disparo por segundo.
    // No computador, clique/segurar também respeita o mesmo intervalo.
    fireTimer-=dt;
    const wantsShoot=!!aimTouch||mouseDown||keys[" "];
    if(wantsShoot && fireTimer<=0){shoot();fireTimer=SHOT_INTERVAL;}

    spawnTimer-=dt;
    if(spawnTimer<=0&&zombies.length<32){spawnZombie();spawnTimer=Math.max(.9,2.8-kills*.018);}
    for(const z of zombies){
      const a=Math.atan2(player.y-z.y,player.x-z.x);
      const old={x:z.x,y:z.y}; moveEntity(z,Math.cos(a)*z.speed*dt,Math.sin(a)*z.speed*dt);
      z.attack-=dt;
      if(dist(z,player)<z.r+player.r && z.attack<=0 && player.invuln<=0){
        player.health-=7;player.invuln=.65;z.attack=.9;say("Cuidado! Um zumbi está muito perto.");
        if(player.health<=0)endGame();
      }
    }
    for(const b of bullets){
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      if(blocked(b.x,b.y,2))b.life=0;
      for(const z of zombies)if(z.hp>0&&Math.hypot(b.x-z.x,b.y-z.y)<z.r+b.r){z.hp=0;b.life=0;kills++;say("Zumbi eliminado com um tiro!");break;}
    }
    bullets=bullets.filter(b=>b.life>0&&b.x>0&&b.y>0&&b.x<WORLD&&b.y<WORLD);
    zombies=zombies.filter(z=>z.hp>0);
    for(const p of pickups)if(!p.taken&&dist(p,player)<p.r+player.r+3){
      p.taken=true;
      if(p.type==="ammo")say("Suprimento encontrado! (Munição infinita nesta versão)");
      else{player.health=Math.min(100,player.health+20);say("+20 de vida coletada.");}
    }
    pickups=pickups.filter(p=>!p.taken);
    if(pickups.length<15&&Math.random()<dt*.10)spawnPickup();
    updateHud();
  }

  function draw(){
    ctx.fillStyle="#344b35";ctx.fillRect(0,0,W,H);
    const grid=100;ctx.strokeStyle="#ffffff0b";ctx.lineWidth=1;
    for(let x=-camera.x%grid;x<W;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=-camera.y%grid;y<H;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    for(let i=0;i<160;i++){const x=(i*197+73)%WORLD-camera.x,y=(i*311+41)%WORLD-camera.y;if(x>-20&&y>-20&&x<W+20&&y<H+20){ctx.fillStyle=i%2?"#78915a33":"#172b1b55";ctx.beginPath();ctx.arc(x,y,7+i%10,0,Math.PI*2);ctx.fill();}}
    // Estradas cruzando a pequena cidade
    ctx.fillStyle="#56594b";ctx.fillRect(WORLD/2-camera.x-65,-camera.y,130,WORLD);ctx.fillRect(-camera.x,WORLD/2-camera.y-55,WORLD,110);
    ctx.strokeStyle="#d8c99a66";ctx.setLineDash([24,22]);ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(WORLD/2-camera.x,-camera.y);ctx.lineTo(WORLD/2-camera.x,WORLD-camera.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-camera.x,WORLD/2-camera.y);ctx.lineTo(WORLD-camera.x,WORLD/2-camera.y);ctx.stroke();ctx.setLineDash([]);
    // Árvores com copa e sombra
    for(const t of trees){const x=t.x-camera.x,y=t.y-camera.y;if(x<-50||y<-50||x>W+50||y>H+50)continue;
      ctx.fillStyle="#0005";ctx.beginPath();ctx.ellipse(x+3,y+8,t.r*.85,t.r*.55,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#5b4932";ctx.fillRect(x-4,y-2,8,15);
      ctx.fillStyle="#244d2c";ctx.beginPath();ctx.arc(x,y-5,t.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#477342";ctx.beginPath();ctx.arc(x-5,y-10,t.r*.62,0,Math.PI*2);ctx.fill();
    }
    // Construções
    for(const o of obstacles){const x=o.x-camera.x-o.w/2,y=o.y-camera.y-o.h/2;if(x<-150||y<-150||x>W+150||y>H+150)continue;
      ctx.fillStyle="#171f1b";ctx.fillRect(x+6,y+8,o.w,o.h);
      ctx.fillStyle="#74786c";ctx.fillRect(x,y,o.w,o.h);
      ctx.fillStyle="#4c5b50";ctx.fillRect(x+8,y+8,o.w-16,o.h-16);
      ctx.fillStyle="#a9a58b";ctx.fillRect(x+14,y+14,18,11);
      ctx.fillStyle="#303b34";ctx.fillRect(x+o.w*.55,y+o.h-20,18,12);
    }
    for(const p of pickups){const x=p.x-camera.x,y=p.y-camera.y;ctx.fillStyle=p.type==="ammo"?"#e6c64e":"#65c97a";ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fill();ctx.fillStyle="#172019";ctx.font="bold 12px Arial";ctx.textAlign="center";ctx.fillText(p.type==="ammo"?"A":"+ ",x,y+4);}
    for(const z of zombies){const x=z.x-camera.x,y=z.y-camera.y;ctx.fillStyle="#0005";ctx.beginPath();ctx.ellipse(x,y+10,12,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#6e9b62";ctx.beginPath();ctx.arc(x,y,z.r,0,Math.PI*2);ctx.fill();ctx.fillStyle="#30472f";ctx.fillRect(x-9,y+5,18,8);ctx.fillStyle="#f1e9d0";ctx.fillRect(x-6,y-4,4,4);ctx.fillRect(x+3,y-4,4,4);ctx.fillStyle="#b43f36";ctx.fillRect(x-4,y+5,8,3);}
    for(const b of bullets){ctx.fillStyle="#ffe18a";ctx.beginPath();ctx.arc(b.x-camera.x,b.y-camera.y,b.r,0,Math.PI*2);ctx.fill();}
    // Personagem e arma apontando na direção da mira
    const x=player.x-camera.x,y=player.y-camera.y;ctx.save();ctx.translate(x,y);ctx.rotate(player.angle);
    ctx.fillStyle="#0006";ctx.beginPath();ctx.ellipse(0,10,16,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=player.invuln>0?"#f1d28a":"#4b8fc2";ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#d8b18b";ctx.beginPath();ctx.arc(4,-3,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#252b2c";ctx.fillRect(7,-4,21,7);ctx.restore();
    const vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.72);vg.addColorStop(0,"transparent");vg.addColorStop(1,"#07100b55");ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
  }
  function loop(t){const dt=Math.min((t-lastTime)/1000||0,.035);lastTime=t;update(dt);draw();requestAnimationFrame(loop);}
  function endGame(){running=false;$("final-kills").textContent=kills;gameOverScreen.classList.remove("hidden");}
  function startGame(){resetGame();running=true;lastTime=performance.now();startScreen.classList.add("hidden");gameOverScreen.classList.add("hidden");say("Explore o mapa. Um disparo elimina cada zumbi.");}

  // Teclado e mouse
  addEventListener("keydown",e=>{keys[e.key]=true;if([" ","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))e.preventDefault();});
  addEventListener("keyup",e=>keys[e.key]=false);
  canvas.addEventListener("pointermove",e=>{if(e.pointerType==="mouse"){const r=canvas.getBoundingClientRect();mousePos={x:e.clientX-r.left,y:e.clientY-r.top,valid:true};}});
  canvas.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"){mouseDown=true;const r=canvas.getBoundingClientRect();mousePos={x:e.clientX-r.left,y:e.clientY-r.top,valid:true};}});
  addEventListener("pointerup",e=>{if(e.pointerType==="mouse")mouseDown=false;});

  // Joysticks dinâmicos: cada um nasce exatamente no ponto do toque.
  function setStick(base,e,vec){
    const rect=base.getBoundingClientRect(),dx=e.clientX-parseFloat(base.dataset.cx),dy=e.clientY-parseFloat(base.dataset.cy);
    const len=Math.hypot(dx,dy),scale=len>STICK_RANGE?STICK_RANGE/len:1;
    const sx=dx*scale,sy=dy*scale;
    base.querySelector(".stick-knob").style.transform=`translate(${sx}px,${sy}px)`;
    vec.x=sx/STICK_RANGE;vec.y=sy/STICK_RANGE;
  }
  function showStick(base,x,y){base.style.left=x+"px";base.style.top=y+"px";base.dataset.cx=x;base.dataset.cy=y;base.classList.remove("hidden");base.querySelector(".stick-knob").style.transform="translate(0,0)";}
  function hideStick(base,vec){base.classList.add("hidden");base.querySelector(".stick-knob").style.transform="translate(0,0)";vec.x=0;vec.y=0;}
  const touchLayer=$("touch-layer");
  touchLayer.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"||!running)return;
    e.preventDefault();
    if(e.clientX<W/2&&!moveTouch){moveTouch=e.pointerId;showStick(moveBase,e.clientX,e.clientY);touchLayer.setPointerCapture(e.pointerId);setStick(moveBase,e,moveVec);}
    else if(e.clientX>=W/2&&!aimTouch){aimTouch=e.pointerId;showStick(aimBase,e.clientX,e.clientY);touchLayer.setPointerCapture(e.pointerId);setStick(aimBase,e,aimVec);if(Math.hypot(aimVec.x,aimVec.y)>.12)player.angle=Math.atan2(aimVec.y,aimVec.x);}
  });
  touchLayer.addEventListener("pointermove",e=>{
    if(e.pointerId===moveTouch)setStick(moveBase,e,moveVec);
    if(e.pointerId===aimTouch){setStick(aimBase,e,aimVec);if(Math.hypot(aimVec.x,aimVec.y)>.12)player.angle=Math.atan2(aimVec.y,aimVec.x);}
  });
  function releaseTouch(e){
    if(e.pointerId===moveTouch){moveTouch=null;hideStick(moveBase,moveVec);}
    if(e.pointerId===aimTouch){aimTouch=null;hideStick(aimBase,aimVec);}
  }
  touchLayer.addEventListener("pointerup",releaseTouch);touchLayer.addEventListener("pointercancel",releaseTouch);
  $("start").addEventListener("click",startGame);$("restart").addEventListener("click",startGame);
  resetGame();draw();requestAnimationFrame(loop);
})();