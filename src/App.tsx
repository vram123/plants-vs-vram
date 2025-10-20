import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Vite-safe asset URLs (match your filenames)
const sunflowerImg = new URL("./assets/images/sunflower.png", import.meta.url).href;
const peashooterImg = new URL("./assets/images/peashooter_alt.jpg", import.meta.url).href;
const repeaterImg  = new URL("./assets/images/repeater.png", import.meta.url).href;
const vramZombieImg = new URL("./assets/images/vram_zombie.png", import.meta.url).href;
const loadingImg   = new URL("./assets/images/loading.png", import.meta.url).href;

const ROWS = 5;
const COLS = 9;

// Gameplay tuning
const ZOMBIE_HP = 450;
const BASE_ZOMBIE_SPEED = 18;
const EAT_DPS = 15;
const PEA_SPEED = 260;
const PEA_DAMAGE = 20;
const SUN_INTERVAL = 7;
const SUN_AMOUNT = 25;

// Prices (per your request)
const COST = {
  sunflower: 50,
  peashooter: 100,
  repeater: 200,
} as const;

type PlantType = "sunflower" | "peashooter" | "repeater";

type Plant = { id: string; type: PlantType; row: number; col: number; cooldown: number; hp: number; };
type Pea   = { id: string; row: number; x: number; speed: number; };
type Zombie= { id: string; row: number; x: number; hp: number; speed: number; eating: boolean; };
type Sun   = { id: string; x: number; y: number; ttl: number; };

function uid(p: string){ return `${p}_${Math.random().toString(36).slice(2,8)}`; }

export default function App(){
  const [sun, setSun] = useState(100);
  const [selected, setSelected] = useState<PlantType | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [peas, setPeas] = useState<Pea[]>([]);
  const [zombs, setZombs] = useState<Zombie[]>([]);
  const [suns, setSuns] = useState<Sun[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // board metrics (dynamic!)
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(1200);
  const [boardH, setBoardH] = useState(700);
  const tileW = boardW / COLS;
  const tileH = boardH / ROWS;

  // sounds
  const sndShoot = useMemo(()=> new Audio("/src/assets/sounds/shoot.wav"),[]);
  const sndSun   = useMemo(()=> new Audio("/src/assets/sounds/sun.wav"),[]);
  const sndPlace = useMemo(()=> new Audio("/src/assets/sounds/place.wav"),[]);
  const sndChomp = useMemo(()=> new Audio("/src/assets/sounds/chomp.wav"),[]);
  const sndOver  = useMemo(()=> new Audio("/src/assets/sounds/over.wav"),[]);
  const music    = useMemo(()=> new Audio("/src/assets/sounds/PVSV.mp3"),[]);

  // volume
  useEffect(()=>{
    const v = muted ? 0 : 0.4;
    [sndShoot,sndSun,sndPlace,sndChomp,sndOver].forEach(a=>a.volume=v);
    music.loop = true; music.volume = muted?0:0.25;
    // start on first click (autoplay policy)
    const start = () => { music.play().catch(()=>{}); window.removeEventListener("click", start); };
    window.addEventListener("click", start);
    return ()=> window.removeEventListener("click", start);
  },[muted]);

  // track board size
  useLayoutEffect(()=>{
    const measure = () => {
      if(!boardRef.current) return;
      const r = boardRef.current.getBoundingClientRect();
      setBoardW(Math.max(720, Math.floor(r.width)));
      setBoardH(Math.max(400, Math.floor(r.height)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if(boardRef.current) ro.observe(boardRef.current);
    window.addEventListener("resize", measure);
    return ()=> { ro.disconnect(); window.removeEventListener("resize", measure); };
  },[]);

  // spawner
  useEffect(()=>{
    if (paused || gameOver) return;
    let alive = true;
    const spawn = () => {
      if(!alive) return;
      const r = Math.floor(Math.random()*ROWS); // 0..4 (row 1 will no longer be empty)
      setZombs(z => [...z, {
        id: uid("vram"),
        row: r,
        x: boardW + 60,                 // enter from right edge
        hp: ZOMBIE_HP,
        speed: BASE_ZOMBIE_SPEED*(0.9 + Math.random()*0.25),
        eating:false
      }]);
      setTimeout(spawn, 1500 + Math.random()*1500);
    };
    const t = setTimeout(spawn, 900);
    return ()=> { alive=false; clearTimeout(t); };
  },[paused, gameOver, boardW]);

  // main loop
  const last = useRef(performance.now());
  useEffect(()=>{
    let raf:number;
    const loop = (now:number)=>{
      if(!paused && !gameOver){
        const dt = Math.min(0.05,(now-last.current)/1000);
        last.current = now;
        tick(dt);
      }else{
        last.current = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return ()=> cancelAnimationFrame(raf);
  },[plants, peas, zombs, suns, paused, gameOver, tileW, tileH, boardW]);

  function tick(dt:number){
    // plants
    setPlants(ps => ps.map(p=>{
      let cd = p.cooldown - dt;
      if(p.type==="sunflower"){
        if(cd<=0){
          const cx = p.col*tileW + tileW*0.5 - 14;
          const cy = p.row*tileH + tileH*0.5 - 14;
          setSuns(s => [...s, {id:uid("sun"), x:cx, y:cy, ttl:6.5}]);
          sndSun.currentTime=0; sndSun.play().catch(()=>{});
          cd = SUN_INTERVAL;
        }
      }else{
        const enemyRight = zombs.some(z => z.row===p.row && z.x > p.col*tileW + 24);
        const cadence = p.type==="peashooter" ? 0.9 : 0.65;
        if(enemyRight && cd<=0){
          const startX = p.col*tileW + tileW*0.68;
          setPeas(b => [...b, {id:uid("pea"), row:p.row, x:startX, speed:PEA_SPEED}]);
          // repeater fires a 2nd shot shortly after
          if(p.type==="repeater"){
            setTimeout(()=> setPeas(b => [...b, {id:uid("pea"), row:p.row, x:startX, speed:PEA_SPEED}]), 140);
          }
          sndShoot.currentTime=0; sndShoot.play().catch(()=>{});
          cd = cadence;
        }
      }
      return {...p, cooldown:cd};
    }));

    // peas
    setPeas(prev => prev.map(b => ({...b, x: b.x + b.speed*dt})).filter(b => b.x <= boardW + 80));

    // zombies
    setZombs(prev => {
      let arr = prev.map(z=>({...z}));
      // bullet hits
      for(const z of arr){
        for(const p of peas){
          if(p.row===z.row && Math.abs(p.x - z.x) < Math.max(18, tileW*0.15)) z.hp -= PEA_DAMAGE;
        }
      }
      // move/eat
      for(const z of arr){
        const col = Math.floor((z.x)/tileW);
        const target = plants.find(p => p.row===z.row && p.col===col);
        if(target){ z.eating = true; }
        else{ z.eating=false; z.x -= z.speed*dt; }
      }
      // plant damage
      if(arr.some(z=>z.eating)){
        setPlants(ps => ps.map(p=>{
          const eater = arr.find(z => z.row===p.row && Math.floor(z.x/tileW)===p.col && z.eating);
          return eater ? {...p, hp: p.hp - EAT_DPS*dt} : p;
        }).filter(p=>p.hp>0));
        sndChomp.play().catch(()=>{});
      }
      // bounds/game over
      arr = arr.filter(z => z.hp>0 && z.x > -20);
      if(arr.some(z => z.x <= 0)){
        setGameOver(true); sndOver.play().catch(()=>{});
      }
      return arr;
    });

    // suns
    setSuns(ss => ss.map(s => ({...s, ttl:s.ttl - dt})).filter(s => s.ttl>0));
  }

  // placement helpers (DnD + Click)
  function placeAt(row:number, col:number, type:PlantType){
    if (gameOver || paused) return;
    if (type==null) return;
    if (sun < COST[type]) return;
    if (row<0 || row>=ROWS || col<0 || col>=COLS) return;
    if (plants.some(p => p.row===row && p.col===col)) return;
    setPlants(ps => [...ps, {id:uid("p"), type, row, col, cooldown:0.3, hp:300}]);
    setSun(v => v - COST[type]);
    sndPlace.currentTime=0; sndPlace.play().catch(()=>{});
  }

  function onBoardDrop(e:React.DragEvent){
    e.preventDefault();
    const t = e.dataTransfer.getData("plant") as PlantType;
    if(!boardRef.current || !t) return;
    const r = boardRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const col = Math.floor(x / tileW);
    const row = Math.floor(y / tileH);
    placeAt(row, col, t);
  }

  function collectSun(id:string){
    setSuns(ss => {
      const s = ss.find(x=>x.id===id);
      if(s) setSun(v=> v + SUN_AMOUNT);
      return ss.filter(x=>x.id!==id);
    });
    sndSun.currentTime=0; sndSun.play().catch(()=>{});
  }

  function reset(){
    setSun(100); setSelected(null); setPlants([]); setPeas([]); setZombs([]); setSuns([]);
    setGameOver(false);
  }

  return (
    <div className="app" style={{height:"100vh", overflow:"hidden"}}>
      {/* HUD */}
      <div className="hud">
        <div className="sun-box">☀️ {sun}</div>
        <div className="tray">
          {(["sunflower","peashooter","repeater"] as PlantType[]).map(t=>(
            <div
              key={t}
              className={`seed ${selected===t ? "selected":""}`}
              draggable
              onDragStart={(e)=> e.dataTransfer.setData("plant", t)}
              onClick={()=> setSelected(t)}
              title={`Cost: ${COST[t]}`}
            >
              <img src={t==="sunflower"?sunflowerImg: t==="peashooter"?peashooterImg:repeaterImg} alt={t}/>
              <div>{t} - {COST[t]}☀️</div>
            </div>
          ))}
          <div className="seed" onClick={()=>setSelected(null)}>🧹 Cancel</div>
          <div className="seed" onClick={()=>setMuted(m=>!m)}>{muted?"🔇":"🔊"}</div>
          <div className="seed" onClick={()=>setPaused(p=>!p)}>{paused?"▶️ Resume":"⏸ Pause"}</div>
          <div className="seed" onClick={reset}>↻ Restart</div>
        </div>
      </div>

      {/* BOARD (full-screen responsive) */}
      <div className="board-wrap">
        <div
          ref={boardRef}
          className="board"
          style={{
            backgroundImage: "url('/src/assets/images/background.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            width: "96vw",
            height: "82vh",
            position:"relative"
          }}
          onDragOver={(e)=> e.preventDefault()}
          onDrop={onBoardDrop}
          onClick={(e)=>{ // click-to-place fallback (snaps to tile)
            if(!selected || !boardRef.current) return;
            const r = boardRef.current.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            placeAt(Math.floor(y/tileH), Math.floor(x/tileW), selected);
          }}
        >
          {/* Plants */}
          {plants.map(p=>(
            <div key={p.id} className={`plant ${p.type}`}
                 style={{ left: p.col*tileW, top: p.row*tileH, width: tileW, height: tileH }}>
              <img
                src={p.type==="sunflower"?sunflowerImg: p.type==="peashooter"?peashooterImg:repeaterImg}
                alt={p.type}
                style={{ width: tileW*0.65, height: tileH*0.65 }}
              />
            </div>
          ))}

          {/* Peas */}
          {peas.map(b=>(
            <div key={b.id} className="pea"
                 style={{
                   left:b.x,
                   top: b.row*tileH + tileH*0.5 - 6,
                   width: Math.max(12, tileW*0.1),
                   height: Math.max(12, tileW*0.1),
                   borderRadius:"999px",
                   background:"radial-gradient(circle at 30% 30%, #ccffd2, #79ff6b 60%, #3bd13b)"
                 }}/>
          ))}

          {/* Suns (glowy, nicer than a flat circle) */}
          {suns.map(s=>(
            <div key={s.id}
                 onClick={()=>collectSun(s.id)}
                 style={{
                   position:"absolute",
                   left:s.x, top:s.y,
                   width: Math.max(30, tileW*0.28),
                   height: Math.max(30, tileW*0.28),
                   borderRadius:"50%",
                   cursor:"pointer",
                   background:"radial-gradient(circle at 35% 35%, #fff9c4, #ffd54f 55%, #ff9800 95%)",
                   boxShadow:"0 0 24px rgba(255,200,40,.9), 0 0 48px rgba(255,180,30,.5)",
                   animation:"sparkle 1.4s ease-in-out infinite"
                 }}/>
          ))}

          {/* Zombies — bigger & perfectly centered in lanes */}
          {zombs.map(z=>(
            <div key={z.id}
                 className="zombie vram"
                 style={{
                   position:"absolute",
                   left:z.x,
                   top: z.row*tileH + tileH*0.5,  // exact lane center
                   transform:"translate(-50%, -50%)",
                   width: tileW*0.9, height: tileH*1.1  // bigger zombie
                 }}>
              <img src={vramZombieImg} alt="Vram Zombie"
                   style={{ width:"100%", height:"100%", objectFit:"contain", filter:"drop-shadow(0 6px 16px rgba(0,0,0,.35))",
                            animation:"walk .6s ease-in-out infinite alternate" }}/>
            </div>
          ))}

          {gameOver && (
            <div className="gameover" style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center"}}>
              🧠 Game Over — Vram Zombies Ate Your Brains!
            </div>
          )}

          {paused && (
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.65)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <img src={loadingImg} alt="Paused" style={{ width:"60%", maxWidth:900, borderRadius:20 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// tiny keyframes (kept here for portability)
const style = document.createElement("style");
style.innerHTML = `
@keyframes walk { from{ transform: translate(-50%, -52%) rotate(-1deg) } to{ transform: translate(-50%, -48%) rotate(1deg) } }
@keyframes sparkle { 0%,100%{ transform: scale(1); opacity:1 } 50%{ transform: scale(1.15); opacity:.85 } }
`;
document.head.appendChild(style);
