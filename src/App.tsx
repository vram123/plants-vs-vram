import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Vite-safe asset URLs
const sunflowerImg = new URL("./assets/images/sunflower.png", import.meta.url).href;
const peashooterImg = new URL("./assets/images/peashooter.png", import.meta.url).href;
const repeaterImg = new URL("./assets/images/repeater.png", import.meta.url).href;
const vramZombieImg = new URL("./assets/images/vram_zombie.png", import.meta.url).href;
const loadingImg = new URL("./assets/images/loading.png", import.meta.url).href;

// Game constants
const ROWS = 5;
const COLS = 9;
const ZOMBIE_HP = 450;
const BASE_ZOMBIE_SPEED = 18;
const EAT_DPS = 15;
const PEA_SPEED = 260;
const PEA_DAMAGE = 20;
const SUN_INTERVAL = 7;
const SUN_AMOUNT = 25;

const COST = { sunflower: 50, peashooter: 100, repeater: 200 } as const;

type PlantType = keyof typeof COST;
type Plant = { id: string; type: PlantType; row: number; col: number; cooldown: number; hp: number };
type Pea = { id: string; row: number; x: number; speed: number };
type Zombie = { id: string; row: number; x: number; hp: number; speed: number; eating: boolean };
type Sun = { id: string; x: number; y: number; ttl: number };

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [sun, setSun] = useState(100);
  const [selected, setSelected] = useState<PlantType | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [peas, setPeas] = useState<Pea[]>([]);
  const [zombs, setZombs] = useState<Zombie[]>([]);
  const [suns, setSuns] = useState<Sun[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // new round system states
  const [round, setRound] = useState(1);
  const [roundActive, setRoundActive] = useState(false);
  const [showRoundMsg, setShowRoundMsg] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(1200);
  const [boardH, setBoardH] = useState(700);
  const tileW = boardW / COLS;
  const tileH = boardH / ROWS;

  // --- Sound setup ---
  const sndShoot = useMemo(() => new Audio("/src/assets/sounds/shoot.wav"), []);
  const sndSun = useMemo(() => new Audio("/src/assets/sounds/sun.wav"), []);
  const sndPlace = useMemo(() => new Audio("/src/assets/sounds/place.wav"), []);
  const sndChomp = useMemo(() => new Audio("/src/assets/sounds/chomp.wav"), []);
  const sndOver = useMemo(() => new Audio("/src/assets/sounds/over.wav"), []);
  const music = useMemo(() => new Audio("/src/assets/sounds/PVSV.mp3"), []);

  useEffect(() => {
    const v = muted ? 0 : 0.4;
    [sndShoot, sndSun, sndPlace, sndChomp, sndOver].forEach(a => (a.volume = v));
    music.loop = true;
    music.volume = muted ? 0 : 0.25;
    const start = () => {
      music.play().catch(() => {});
      window.removeEventListener("click", start);
    };
    window.addEventListener("click", start);
    return () => window.removeEventListener("click", start);
  }, [muted]);

  // --- Resize handling ---
  useLayoutEffect(() => {
    const measure = () => {
      if (!boardRef.current) return;
      const r = boardRef.current.getBoundingClientRect();
      setBoardW(Math.max(720, Math.floor(r.width)));
      setBoardH(Math.max(400, Math.floor(r.height)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boardRef.current) ro.observe(boardRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // --- Round Config ---
  function getRoundConfig(r: number) {
    return {
      count: 5 + r * 2,
      hp: ZOMBIE_HP * (1 + (r - 1) * 0.25),
      speed: BASE_ZOMBIE_SPEED * (1 + (r - 1) * 0.1)
    };
  }

  // --- Start a round ---
  function startRound(r: number) {
    if (paused || gameOver) return;
    const config = getRoundConfig(r);
    setRoundActive(true);
    setShowRoundMsg(true);

    // Flash "Round Start" message
    setTimeout(() => setShowRoundMsg(false), 2000);

    // Spawn zombies with small delays
    for (let i = 0; i < config.count; i++) {
      setTimeout(() => {
        const row = Math.floor(Math.random() * ROWS);
        setZombs(z => [
          ...z,
          {
            id: uid("z"),
            row,
            x: boardW + 60,
            hp: config.hp,
            speed: config.speed * (0.9 + Math.random() * 0.25),
            eating: false,
          },
        ]);
      }, i * 1200);
    }
  }

  // --- Main loop ---
  const last = useRef(performance.now());
  useEffect(() => {
    let raf: number;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      if (!paused && !gameOver) tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [plants, peas, zombs, suns, paused, gameOver]);

  function tick(dt: number) {
    // Plants
    setPlants(ps =>
      ps.map(p => {
        let cd = p.cooldown - dt;
        if (p.type === "sunflower") {
          if (cd <= 0) {
            const cx = p.col * tileW + tileW * 0.5 - 15;
            const cy = p.row * tileH + tileH * 0.5 - 15;
            setSuns(s => [...s, { id: uid("sun"), x: cx, y: cy, ttl: 6.5 }]);
            sndSun.play().catch(() => {});
            cd = SUN_INTERVAL;
          }
        } else {
          const enemyRight = zombs.some(z => z.row === p.row && z.x > p.col * tileW + 24);
          const cadence = p.type === "peashooter" ? 0.9 : 0.65;
          if (enemyRight && cd <= 0) {
            const startX = p.col * tileW + tileW * 0.7;
            setPeas(b => [...b, { id: uid("pea"), row: p.row, x: startX, speed: PEA_SPEED }]);
            if (p.type === "repeater") {
              setTimeout(() => setPeas(b => [...b, { id: uid("pea"), row: p.row, x: startX, speed: PEA_SPEED }]), 140);
            }
            sndShoot.play().catch(() => {});
            cd = cadence;
          }
        }
        return { ...p, cooldown: cd };
      })
    );

    // Peas
    setPeas(prev => prev.map(b => ({ ...b, x: b.x + b.speed * dt })).filter(b => b.x <= boardW + 80));

    // Zombies
    setZombs(prev => {
      let arr = prev.map(z => ({ ...z }));
      for (const z of arr) {
        for (const p of peas) {
          if (p.row === z.row && Math.abs(p.x - z.x) < tileW * 0.15) z.hp -= PEA_DAMAGE;
        }
      }
      for (const z of arr) {
        const col = Math.floor(z.x / tileW);
        const target = plants.find(p => p.row === z.row && p.col === col);
        if (target) z.eating = true;
        else {
          z.eating = false;
          z.x -= z.speed * dt;
        }
      }
      if (arr.some(z => z.eating)) {
        setPlants(ps =>
          ps
            .map(p => {
              const eater = arr.find(z => z.row === p.row && Math.floor(z.x / tileW) === p.col && z.eating);
              return eater ? { ...p, hp: p.hp - EAT_DPS * dt } : p;
            })
            .filter(p => p.hp > 0)
        );
        sndChomp.play().catch(() => {});
      }
      arr = arr.filter(z => z.hp > 0 && z.x > -20);
      if (arr.some(z => z.x <= 0)) {
        setGameOver(true);
        sndOver.play().catch(() => {});
      }

      // If no zombies left and round is active, start next
      if (arr.length === 0 && roundActive && !gameOver) {
        setRoundActive(false);
        setTimeout(() => {
          setRound(r => r + 1);
          startRound(round + 1);
        }, 2500);
      }

      return arr;
    });

    setSuns(ss => ss.map(s => ({ ...s, ttl: s.ttl - dt })).filter(s => s.ttl > 0));
  }

  // --- Auto start round ---
  useEffect(() => {
    if (!paused && !gameOver && !roundActive && zombs.length === 0) {
      startRound(round);
    }
  }, [paused, gameOver, roundActive, zombs]);

  // --- Placement helpers ---
  function placeAt(row: number, col: number, type: PlantType) {
    if (gameOver || paused) return;
    if (!type || sun < COST[type]) return;
    if (plants.some(p => p.row === row && p.col === col)) return;
    setPlants(ps => [...ps, { id: uid("p"), type, row, col, cooldown: 0.3, hp: 300 }]);
    setSun(v => v - COST[type]);
    sndPlace.play().catch(() => {});
  }

  function onBoardDrop(e: React.DragEvent) {
    e.preventDefault();
    const t = e.dataTransfer.getData("plant") as PlantType;
    if (!boardRef.current || !t) return;
    const r = boardRef.current.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / tileW);
    const row = Math.floor((e.clientY - r.top) / tileH);
    placeAt(row, col, t);
  }

  function collectSun(id: string) {
    setSuns(ss => {
      const s = ss.find(x => x.id === id);
      if (s) setSun(v => v + SUN_AMOUNT);
      return ss.filter(x => x.id !== id);
    });
    sndSun.play().catch(() => {});
  }

  function reset() {
    setSun(100);
    setSelected(null);
    setPlants([]);
    setPeas([]);
    setZombs([]);
    setSuns([]);
    setRound(1);
    setRoundActive(false);
    setGameOver(false);
  }

  // --- Render ---
  return (
    <div className="app" style={{ height: "100vh", overflow: "hidden" }}>
      <div className="hud">
        <div className="sun-box">☀️ {sun}</div>
        <div className="tray">
          {(["sunflower", "peashooter", "repeater"] as PlantType[]).map(t => (
            <div
              key={t}
              className={`seed ${selected === t ? "selected" : ""}`}
              draggable
              onDragStart={e => e.dataTransfer.setData("plant", t)}
              onClick={() => setSelected(t)}
              title={`Cost: ${COST[t]}`}
            >
              <img src={t === "sunflower" ? sunflowerImg : t === "peashooter" ? peashooterImg : repeaterImg} alt={t} />
              <div>{t} - {COST[t]}☀️</div>
            </div>
          ))}
          <div className="seed" onClick={() => setSelected(null)}>🧹 Cancel</div>
          <div className="seed" onClick={() => setMuted(m => !m)}>{muted ? "🔇" : "🔊"}</div>
          <div className="seed" onClick={() => setPaused(p => !p)}>{paused ? "▶️ Resume" : "⏸ Pause"}</div>
          <div className="seed" onClick={reset}>↻ Restart</div>
        </div>
      </div>

      <div className="board-wrap">
        <div
          ref={boardRef}
          className="board"
          style={{
            backgroundImage: "url('/src/assets/images/background.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            width: "96vw",
            height: "82vh",
            position: "relative",
          }}
          onDragOver={e => e.preventDefault()}
          onDrop={onBoardDrop}
          onClick={e => {
            if (!selected || !boardRef.current) return;
            const r = boardRef.current.getBoundingClientRect();
            placeAt(
              Math.floor((e.clientY - r.top) / tileH),
              Math.floor((e.clientX - r.left) / tileW),
              selected
            );
          }}
        >
          {/* ROUND DISPLAY */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 20,
              fontSize: "1.5rem",
              color: "#fff",
              fontWeight: "bold",
              textShadow: "2px 2px 4px #000",
            }}
          >
            🌿 Round {round}
          </div>

          {showRoundMsg && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "3rem",
                color: "gold",
                fontWeight: "bold",
                textShadow: "3px 3px 6px #000",
              }}
            >
              🌻 Round {round} Start! 🌻
            </div>
          )}

          {/* PLANTS */}
          {plants.map(p => (
            <img
              key={p.id}
              src={p.type === "sunflower" ? sunflowerImg : p.type === "peashooter" ? peashooterImg : repeaterImg}
              alt={p.type}
              style={{
                position: "absolute",
                left: p.col * tileW + tileW * 0.5,
                top: p.row * tileH + tileH * 0.5,
                transform: "translate(-50%, -50%)",
                width: tileW * 0.7,
                height: tileH * 0.7,
              }}
            />
          ))}

          {/* PEAS */}
          {peas.map(b => (
            <div
              key={b.id}
              style={{
                position: "absolute",
                left: b.x,
                top: b.row * tileH + tileH * 0.5,
                transform: "translate(-50%, -50%)",
                width: tileW * 0.1,
                height: tileW * 0.1,
                borderRadius: "50%",
                background: "radial-gradient(circle at 30% 30%, #ccffd2, #79ff6b 60%, #3bd13b)",
              }}
            />
          ))}

          {/* ZOMBIES */}
          {zombs.map(z => (
            <img
              key={z.id}
              src={vramZombieImg}
              alt="Zombie"
              style={{
                position: "absolute",
                left: z.x,
                top: z.row * tileH + tileH * 0.5,
                transform: "translate(-50%, -50%)",
                width: tileW * 0.9,
                height: tileH * 0.9,
                objectFit: "contain",
              }}
            />
          ))}

          {/* SUNS */}
          {suns.map(s => (
            <div
              key={s.id}
              onClick={() => collectSun(s.id)}
              style={{
                position: "absolute",
                left: s.x,
                top: s.y,
                transform: "translate(-50%, -50%)",
                width: tileW * 0.25,
                height: tileW * 0.25,
                borderRadius: "50%",
                background: "radial-gradient(circle, #fff9c4, #ffd54f 55%, #ff9800 95%)",
                boxShadow: "0 0 30px rgba(255, 200, 40, 0.9)",
                cursor: "pointer",
              }}
            />
          ))}

          {gameOver && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", color: "#fff", background: "rgba(0,0,0,0.6)" }}>
              🧠 Game Over — Zombies Ate Your Brains!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Keyframes
const style = document.createElement
