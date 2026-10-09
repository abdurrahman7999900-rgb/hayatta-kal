const WebSocket=require('ws'),http=require('http'),fs=require('fs');
const W=3000,CELL=40,TICK=50;
const server=http.createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});s.end(fs.readFileSync(__dirname+'/index.html'));});
const wss=new WebSocket.Server({server});
const KEYS=['wood','stone','metal','iron'];
const RHP=[3,6,10,16],RCOUNT=[220,110,55,28],BHP=[100,250,500,1000];
const WEAPONS=[10,20,35,60];
const RECIPES={1:{wood:10,stone:5},2:{wood:5,metal:8},3:{metal:5,iron:10}};
let nid=1,time=0,tick=0,dirty=true;
const rnd=(a,b)=>a+Math.random()*(b-a),clamp=v=>Math.max(10,Math.min(W-10,v));
const players=new Map(),wolves=[],res=[],crates=[],builds=new Map();
const inv0=()=>({wood:0,stone:0,metal:0,iron:0});
const ck=(cx,cy)=>cx+','+cy;
function spawnRes(t){res.push({id:nid++,t,x:rnd(100,W-100),y:rnd(100,W-100),hp:RHP[t]});dirty=true;}
function spawnCrate(){crates.push({id:nid++,x:rnd(100,W-100),y:rnd(100,W-100),hp:2});dirty=true;}
RCOUNT.forEach((n,t)=>{for(let i=0;i<n;i++)spawnRes(t)});
for(let i=0;i<40;i++)spawnCrate();

function blocked(x,y,r,owner){
  for(let cx=Math.floor((x-r)/CELL);cx<=Math.floor((x+r)/CELL);cx++)
    for(let cy=Math.floor((y-r)/CELL);cy<=Math.floor((y+r)/CELL);cy++){
      const b=builds.get(ck(cx,cy));
      if(b&&b.owner!==owner)return b;
    }
  return null;
}
function respawn(p){p.hp=100;p.dead=0;p.x=rnd(200,W-200);p.y=rnd(200,W-200);p.w=0;}
function damage(o,d,killer){
  o.hp-=d;
  if(o.hp<=0){
    o.hp=0;o.dead=3;
    if(killer)for(const k of KEYS)killer.inv[k]+=o.inv[k];
    o.inv=inv0();
  }
}
function hit(p){
  if(p.dead>0||p.cd>0)return;
  p.cd=0.4;
  const fx=p.x+Math.cos(p.a)*40,fy=p.y+Math.sin(p.a)*40,dmg=WEAPONS[p.w];
  const near=(o,r=45)=>Math.hypot(o.x-fx,o.y-fy)<r;
  for(const o of players.values())if(o!==p&&o.dead<=0&&near(o)){damage(o,dmg,p);return;}
  for(let i=0;i<wolves.length;i++){const o=wolves[i];if(near(o)){o.hp-=dmg;if(o.hp<=0)wolves.splice(i,1);return;}}
  for(let i=0;i<res.length;i++){
    const o=res[i];
    if(near(o,55)){
      p.inv[KEYS[o.t]]+=1;
      if(--o.hp<=0){p.inv[KEYS[o.t]]+=2;res.splice(i,1);setTimeout(()=>spawnRes(o.t),30000);}
      dirty=true;return;
    }
  }
  for(let i=0;i<crates.length;i++){
    const o=crates[i];
    if(near(o,45)){
      if(--o.hp<=0){
        p.inv.wood+=Math.floor(rnd(3,9));p.inv.stone+=Math.floor(rnd(1,6));
        p.inv.metal+=Math.floor(rnd(0,4));p.inv.iron+=Math.floor(rnd(0,2));
        crates.splice(i,1);setTimeout(spawnCrate,45000);
      }
      dirty=true;return;
    }
  }
  const bk=ck(Math.floor(fx/CELL),Math.floor(fy/CELL)),b=builds.get(bk);
  if(b&&b.owner!==p.id){b.hp-=dmg/2;if(b.hp<=0)builds.delete(bk);dirty=true;}
}
function build(p,tier){
  if(p.dead>0||tier<0||tier>3)return;
  const fx=p.x+Math.cos(p.a)*60,fy=p.y+Math.sin(p.a)*60;
  const cx=Math.floor(fx/CELL),cy=Math.floor(fy/CELL);
  if(cx<0||cy<0||cx>=W/CELL||cy>=W/CELL||builds.has(ck(cx,cy)))return;
  if(p.inv[KEYS[tier]]<2)return;
  p.inv[KEYS[tier]]-=2;
  builds.set(ck(cx,cy),{owner:p.id,cx,cy,x:cx*CELL+CELL/2,y:cy*CELL+CELL/2,tier,hp:BHP[tier]});
  dirty=true;
}
function repair(p){
  const fx=p.x+Math.cos(p.a)*60,fy=p.y+Math.sin(p.a)*60;
  const b=builds.get(ck(Math.floor(fx/CELL),Math.floor(fy/CELL)));
  if(!b||b.hp>=BHP[b.tier]||p.inv[KEYS[b.tier]]<1)return;
  p.inv[KEYS[b.tier]]-=1;b.hp=Math.min(BHP[b.tier],b.hp+50);dirty=true;
}
function craft(p,w){
  const rec=RECIPES[w];
  if(!rec||p.w>=w)return;
  for(const k in rec)if(p.inv[k]<rec[k])return;
  for(const k in rec)p.inv[k]-=rec[k];
  p.w=w;
}

wss.on('connection',ws=>{
  const p={id:nid++,name:'Oyuncu',x:0,y:0,hp:100,inv:inv0(),w:0,dx:0,dy:0,a:0,cd:0,dead:0,col:Math.floor(rnd(0,360)),ws};
  players.set(p.id,p);respawn(p);
  ws.on('message',m=>{
    let d;try{d=JSON.parse(m)}catch{return}
    if(d.t==='join')p.name=String(d.name||'Oyuncu').slice(0,12);
    else if(d.t==='in'){p.dx=Math.max(-1,Math.min(1,+d.dx||0));p.dy=Math.max(-1,Math.min(1,+d.dy||0));p.a=+d.a||0;}
    else if(d.t==='hit')hit(p);
    else if(d.t==='build')build(p,d.tier|0);
    else if(d.t==='craft')craft(p,d.w|0);
    else if(d.t==='repair')repair(p);
  });
  ws.on('close',()=>players.delete(p.id));
});

setInterval(()=>{
  const dt=TICK/1000;time+=dt;tick++;
  const night=(time%180)>=110;
  for(const p of players.values()){
    if(p.dead>0){p.dead-=dt;if(p.dead<=0)respawn(p);continue;}
    if(p.cd>0)p.cd-=dt;
    const l=Math.max(1,Math.hypot(p.dx,p.dy)),s=180*dt;
    let nx=p.x+p.dx/l*s;
    if(!blocked(nx,p.y,14,p.id))p.x=clamp(nx);
    let ny=p.y+p.dy/l*s;
    if(!blocked(p.x,ny,14,p.id))p.y=clamp(ny);
    if(tick%20===0&&p.hp<100)p.hp=Math.min(100,p.hp+1);
  }
  const alive=[...players.values()].filter(q=>q.dead<=0);
  const want=night?Math.min(60,3+players.size*4):0;
  if(wolves.length<want&&tick%10===0&&alive.length){
    const t=alive[Math.floor(Math.random()*alive.length)],a=rnd(0,6.28),d=rnd(600,900);
    wolves.push({id:nid++,x:clamp(t.x+Math.cos(a)*d),y:clamp(t.y+Math.sin(a)*d),hp:40,cd:0});
  }
  if(!night&&wolves.length&&tick%20===0)wolves.pop();
  for(const o of wolves){
    let best=null,bd=500;
    for(const q of alive){const d=Math.hypot(q.x-o.x,q.y-o.y);if(d<bd){bd=d;best=q;}}
    if(o.cd>0)o.cd-=dt;
    if(!best)continue;
    if(bd>28){
      const a=Math.atan2(best.y-o.y,best.x-o.x),s=150*dt;
      const bx=blocked(o.x+Math.cos(a)*s,o.y,12,-1);
      if(bx){bx.hp-=6*dt;if(bx.hp<=0)builds.delete(ck(bx.cx,bx.cy));dirty=true;}else o.x+=Math.cos(a)*s;
      const by=blocked(o.x,o.y+Math.sin(a)*s,12,-1);
      if(by){by.hp-=6*dt;if(by.hp<=0)builds.delete(ck(by.cx,by.cy));dirty=true;}else o.y+=Math.sin(a)*s;
    }else if(o.cd<=0){damage(best,8,null);o.cd=1;}
  }
  if(tick%20===0){
    for(const [k,b] of builds){b.hp-=0.4;if(b.hp<=0)builds.delete(k);}
    dirty=true;
  }
  const base={t:'s',ph:+(time%180).toFixed(1),
    p:[...players.values()].map(q=>[q.id,q.x|0,q.y|0,q.hp|0,q.name,q.w,q.col,+q.a.toFixed(2),q.dead>0?1:0]),
    wo:wolves.map(o=>[o.id,o.x|0,o.y|0,o.hp|0])};
  if(dirty||tick%40===0){
    base.st={r:res.map(o=>[o.t,o.x|0,o.y|0]),c:crates.map(o=>[o.x|0,o.y|0]),
      b:[...builds.values()].map(b=>[b.x,b.y,b.tier,b.hp|0,b.owner])};
    dirty=false;
  }
  const s=JSON.stringify(base).slice(0,-1);
  for(const p of players.values())if(p.ws.readyState===1)
    p.ws.send(s+',"me":'+JSON.stringify({id:p.id,inv:p.inv,hp:p.hp|0,w:p.w})+'}');
},TICK);

server.listen(process.env.PORT||3000,()=>console.log('Oyun hazır: http://localhost:3000'));
