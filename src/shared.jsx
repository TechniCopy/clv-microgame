/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { CheckCircle, XCircle, Star, ArrowRight, RotateCcw, Heart } from "lucide-react";

// ─── THEME COLORS (huisstijl Studium CLV-microgames) ───

export const C = {
  bgPage: "#F5EFE4",      // zandbeige
  bgCard: "#FFFCF5",
  bgHeader: "#3B1E0A",    // donkerbruin
  brownText: "#3B1E0A",   // tekst / rand
  brown: "#6B4F2A",       // secundaire tekst
  olive: "#5C6B2E",       // knoppen / interactie-accent
  oliveDark: "#4A5725",
  oliveLight: "#EDF0E0",
  green: "#4A7C3F",       // succes
  greenLight: "#E8F5E3",
  red: "#C0392B",         // fout
  redLight: "#FDEAEA",
  beigeMid: "#D9CDB8",
  beigeLight: "#EFE7D6",
};

// ─── SOUND EFFECTS (Web Audio API) ───

const audioCtxRef = { current: null };
function getAudioCtx() {
  if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtxRef.current;
}

export function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;

    if (type === "correct") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523, t);
      osc.frequency.setValueAtTime(659, t + 0.08);
      osc.frequency.setValueAtTime(784, t + 0.16);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } else if (type === "wrong") {
      osc.type = "square";
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.setValueAtTime(150, t + 0.1);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
    } else if (type === "levelup") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523, t);
      osc.frequency.setValueAtTime(659, t + 0.1);
      osc.frequency.setValueAtTime(784, t + 0.2);
      osc.frequency.setValueAtTime(1047, t + 0.3);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.5);
    } else if (type === "drop") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  } catch {
    /* audio not available */
  }
}

// ─── FLOATING POINTS ───

function FloatingPoints({ points, x, y, onDone }) {
  const [opacity, setOpacity] = useState(1);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / 800);
      setOffsetY(-60 * progress);
      setOpacity(1 - progress);
      if (progress < 1) frame = requestAnimationFrame(animate);
      else onDone();
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const negative = points < 0;
  return (
    <div
      className="fixed pointer-events-none z-[100] font-bold text-xl italic"
      style={{
        left: x - 30,
        top: y + offsetY,
        opacity,
        color: negative ? C.red : C.green,
        textShadow: "0 2px 4px rgba(0,0,0,0.2)",
      }}
    >
      {negative ? points : `+${points}`}
    </div>
  );
}

// ─── CONFETTI BURST ───

function ConfettiBurst({ x, y, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const particles = Array.from({ length: 30 }, () => ({
      x: 0, y: 0,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12 - 4,
      size: 4 + Math.random() * 4,
      color: ["#FBBF24", "#4A7C3F", "#C0392B", "#3B82F6", "#FDBA74", "#67E8F9"][Math.floor(Math.random() * 6)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 20,
    }));

    const start = performance.now();
    let frame;
    const animate = (now) => {
      const elapsed = (now - start) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach((p) => {
        p.x += p.vx;
        p.vy += 0.3;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        const alpha = Math.max(0, 1 - elapsed / 0.8);
        if (alpha <= 0) return;
        alive = true;
        ctx.save();
        ctx.translate(canvas.width / 2 + p.x, canvas.height / 2 + p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      if (alive) frame = requestAnimationFrame(animate);
      else onDone();
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      className="fixed pointer-events-none z-[99]"
      style={{ left: x - 100, top: y - 100 }}
    />
  );
}

// ─── STREAK INDICATOR ───

function StreakIndicator({ streak }) {
  if (streak < 2) return null;
  return (
    <div className="fixed top-20 right-4 z-[90] animate-bounce">
      <div
        className="rounded-xl px-4 py-2 shadow-lg border-2 font-bold italic text-sm"
        style={{ backgroundColor: "#FBBF24", borderColor: C.brownText, color: C.brownText }}
      >
        {streak}x op rij! {streak >= 5 ? "ONSTOPBAAR!" : streak >= 3 ? "COMBO!" : ""}
      </div>
    </div>
  );
}

// ─── GAME JUICE HOOK ───

export function useGameJuice() {
  const [floatingPoints, setFloatingPoints] = useState([]);
  const [confettis, setConfettis] = useState([]);
  const [streak, setStreak] = useState(0);
  const [shaking, setShaking] = useState(false);
  const idRef = useRef(0);

  const triggerCorrect = useCallback((pts, point) => {
    const id = ++idRef.current;
    const x = point?.clientX ?? window.innerWidth / 2;
    const y = point?.clientY ?? 200;
    playSound("correct");
    setStreak((s) => s + 1);
    setFloatingPoints((prev) => [...prev, { id, pts, x, y }]);
    setConfettis((prev) => [...prev, { id, x, y }]);
  }, []);

  const triggerWrong = useCallback((pts, point) => {
    playSound("wrong");
    setStreak(0);
    setShaking(true);
    setTimeout(() => setShaking(false), 300);
    if (pts) {
      const id = ++idRef.current;
      const x = point?.clientX ?? window.innerWidth / 2;
      const y = point?.clientY ?? 200;
      setFloatingPoints((prev) => [...prev, { id, pts, x, y }]);
    }
  }, []);

  const triggerLevelUp = useCallback(() => {
    playSound("levelup");
  }, []);

  const removeFloat = useCallback((id) => {
    setFloatingPoints((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const removeConfetti = useCallback((id) => {
    setConfettis((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const JuiceOverlay = useCallback(
    () => (
      <>
        {floatingPoints.map((f) => (
          <FloatingPoints key={f.id} points={f.pts} x={f.x} y={f.y} onDone={() => removeFloat(f.id)} />
        ))}
        {confettis.map((c) => (
          <ConfettiBurst key={c.id} x={c.x} y={c.y} onDone={() => removeConfetti(c.id)} />
        ))}
        <StreakIndicator streak={streak} />
      </>
    ),
    [floatingPoints, confettis, streak, removeFloat, removeConfetti]
  );

  return { triggerCorrect, triggerWrong, triggerLevelUp, shaking, streak, JuiceOverlay };
}

// ─── POINTER-BASED DRAG & DROP + TIK-OM-TE-PLAATSEN (desktop, tablet, mobiel) ───
//
// HTML5 drag events werken niet op touch devices; daarom een eigen systeem
// op pointer events. Slepen: een ghost volgt de vinger/cursor en bij loslaten
// wordt op dropzone-rects getest. Tikken (mobielvriendelijk): tik op een
// kaartje om het te selecteren, tik daarna op een dropvlak om het te plaatsen.

const DragCtx = createContext(null);

const TAP_DREMPEL = 8; // px beweging voordat een aanraking als slepen telt

export function DragProvider({ children }) {
  const zonesRef = useRef(new Map());
  const ghostRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);
  const [selected, setSelected] = useState(null); // { payload } bij tik-selectie

  const findZone = useCallback((x, y) => {
    let found = null;
    zonesRef.current.forEach((zone, id) => {
      const r = zone.getRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = id;
    });
    return found;
  }, []);

  const api = {
    hoverZone,
    dragging: !!ghost,
    selected,
    registerZone(id, getRect, onDrop) {
      zonesRef.current.set(id, { getRect, onDrop });
      return () => zonesRef.current.delete(id);
    },
    begin(payload, render, x, y) {
      setSelected(null);
      ghostRef.current = { payload, render, x, y };
      setGhost(ghostRef.current);
    },
    move(x, y) {
      if (!ghostRef.current) return;
      ghostRef.current = { ...ghostRef.current, x, y };
      setGhost(ghostRef.current);
      setHoverZone(findZone(x, y));
    },
    end(x, y) {
      const g = ghostRef.current;
      ghostRef.current = null;
      setGhost(null);
      setHoverZone(null);
      if (g) {
        const id = findZone(x, y);
        if (id) zonesRef.current.get(id)?.onDrop(g.payload, { clientX: x, clientY: y });
      }
    },
    cancel() {
      ghostRef.current = null;
      setGhost(null);
      setHoverZone(null);
    },
    toggleSelect(payload) {
      setSelected((s) => (s && s.payload === payload ? null : { payload }));
    },
    clearSelect() {
      setSelected(null);
    },
  };

  return (
    <DragCtx.Provider value={api}>
      {children}
      {ghost && (
        <div
          className="fixed pointer-events-none z-[95]"
          style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%, -50%) scale(1.05)", opacity: 0.9 }}
        >
          {ghost.render}
        </div>
      )}
      {selected && !ghost && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[96] px-4 py-2 rounded-xl shadow-lg border-2 text-xs font-bold text-center"
          style={{ backgroundColor: C.olive, color: "white", borderColor: C.oliveDark, maxWidth: "90vw" }}
        >
          Tik op de plek waar dit hoort — of tik nogmaals op het kaartje om te annuleren
        </div>
      )}
    </DragCtx.Provider>
  );
}

export function useDrag() {
  return useContext(DragCtx);
}

export function Draggable({ payload, disabled = false, ghost, children, className = "", style }) {
  const api = useContext(DragCtx);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const pressedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const renderRef = useRef(null);
  useEffect(() => {
    renderRef.current = ghost ?? children;
  }, [ghost, children]);

  const isSelected = api.selected?.payload === payload;

  return (
    <div
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic events hebben geen actieve pointer */
        }
        pressedRef.current = true;
        startRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!pressedRef.current) return;
        if (!draggingRef.current) {
          const dx = e.clientX - startRef.current.x;
          const dy = e.clientY - startRef.current.y;
          if (Math.hypot(dx, dy) < TAP_DREMPEL) return;
          // genoeg beweging: dit is slepen, geen tik
          draggingRef.current = true;
          setDragging(true);
          api.begin(payload, renderRef.current, e.clientX, e.clientY);
        }
        api.move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (!pressedRef.current) return;
        pressedRef.current = false;
        if (draggingRef.current) {
          draggingRef.current = false;
          setDragging(false);
          api.end(e.clientX, e.clientY);
        } else {
          // tik: (de)selecteer dit kaartje voor tik-om-te-plaatsen
          api.toggleSelect(payload);
        }
      }}
      onPointerCancel={() => {
        pressedRef.current = false;
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setDragging(false);
        api.cancel();
      }}
      className={className}
      style={{
        touchAction: "none",
        userSelect: "none",
        opacity: dragging ? 0.3 : 1,
        cursor: disabled ? "default" : "grab",
        outline: isSelected ? `3px solid ${C.olive}` : "none",
        outlineOffset: 2,
        borderRadius: 12,
        boxShadow: isSelected ? "0 0 0 6px rgba(92,107,46,0.2)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// DropTarget: onDropItem(payload, point) => "correct" | "wrong" | undefined.
// "wrong" geeft een korte rode flash (terugveer-effect: de ghost verdwijnt en
// het origineel staat nog op zijn plek). Werkt voor slepen én voor tikken:
// is er een kaartje geselecteerd, dan plaatst een tik op het vlak het kaartje.
export function DropTarget({ id, onDropItem, children, className = "", style, render }) {
  const api = useContext(DragCtx);
  const ref = useRef(null);
  const cbRef = useRef(onDropItem);
  useEffect(() => {
    cbRef.current = onDropItem;
  }, [onDropItem]);
  const [flash, setFlash] = useState(null);

  const handleResult = useCallback((result) => {
    if (result === "wrong" || result === "correct") {
      setFlash(result);
      setTimeout(() => setFlash(null), 450);
    }
  }, []);

  useEffect(() => {
    return api.registerZone(
      id,
      () => ref.current?.getBoundingClientRect(),
      (payload, point) => handleResult(cbRef.current?.(payload, point))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleTap = (e) => {
    if (!api.selected) return;
    const result = cbRef.current?.(api.selected.payload, { clientX: e.clientX, clientY: e.clientY });
    handleResult(result);
    if (result === "correct") api.clearSelect();
  };

  const isHover = api.hoverZone === id && api.dragging;
  const armedStyle = api.selected
    ? { outline: `2px dashed ${C.olive}`, outlineOffset: 3, borderRadius: 14, cursor: "pointer" }
    : {};

  if (render)
    return (
      <div ref={ref} className={className} style={{ ...armedStyle, ...style }} onClick={handleTap}>
        {render({ isHover, flash })}
      </div>
    );
  return (
    <div
      ref={ref}
      className={className}
      style={{ ...armedStyle, ...style }}
      onClick={handleTap}
      data-hover={isHover || undefined}
      data-flash={flash || undefined}
    >
      {typeof children === "function" ? children({ isHover, flash }) : children}
    </div>
  );
}

// ─── SLEEPKAARTJE (standaard uiterlijk) ───

export function DragCard({ label, disabled, small = false }) {
  return (
    <div
      className={`${small ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} rounded-xl font-bold select-none shadow-md border-2 italic text-center`}
      style={{
        backgroundColor: disabled ? C.beigeMid : C.olive,
        color: disabled ? "#8B7355" : "white",
        borderColor: disabled ? "#B8A990" : C.oliveDark,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </div>
  );
}

// ─── PROGRESS BAR (3 bolletjes + 5 hartjes) ───

export function ProgressBar({ currentRound, score, lives }) {
  const rounds = [1, 2, 3];
  const [displayScore, setDisplayScore] = useState(score);
  const [scorePop, setScorePop] = useState(false);

  useEffect(() => {
    if (score === displayScore) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- score-animatie, patroon uit de bron-app
    setScorePop(true);
    const step = score > displayScore ? 1 : -1;
    const timer = setInterval(() => {
      setDisplayScore((prev) => {
        if (prev === score) {
          clearInterval(timer);
          return prev;
        }
        return prev + step;
      });
    }, 30);
    const popTimer = setTimeout(() => setScorePop(false), 400);
    return () => {
      clearInterval(timer);
      clearTimeout(popTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  return (
    <div className="flex items-center justify-between py-3 px-5" style={{ backgroundColor: C.bgHeader }}>
      <div className="flex items-center gap-4">
        <span className="text-white font-bold text-sm">Ronde:</span>
        <div className="flex gap-1.5">
          {rounds.map((r) => {
            const isComplete = r < currentRound;
            const isCurrent = r === currentRound;
            return (
              <div
                key={r}
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all duration-300"
                style={{
                  backgroundColor: isComplete || isCurrent ? "#F5EFE4" : "transparent",
                  borderColor: isComplete || isCurrent ? "#F5EFE4" : C.beigeMid,
                }}
              >
                {isComplete && <span style={{ color: C.brownText }} className="text-[8px]">&#10003;</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((h) => (
            <Heart
              key={h}
              className="w-4 h-4 transition-all duration-300"
              fill={h <= lives ? "#E74C3C" : "transparent"}
              stroke={h <= lives ? "#E74C3C" : "#8B7355"}
              style={{ opacity: h <= lives ? 1 : 0.3 }}
            />
          ))}
        </div>
        <span className="text-white font-bold text-sm">
          Score:{" "}
          <span
            className="text-lg inline-block transition-transform duration-200"
            style={{ transform: scorePop ? "scale(1.5)" : "scale(1)", color: scorePop ? "#FBBF24" : "white" }}
          >
            {displayScore}
          </span>
        </span>
      </div>
    </div>
  );
}

// ─── BUTTON ───

export function GameButton({ onClick, children, variant = "primary", disabled = false, className = "" }) {
  const styles = {
    primary: { backgroundColor: C.olive, hoverBg: C.oliveDark, color: "white" },
    green: { backgroundColor: C.green, hoverBg: "#3A6B30", color: "white" },
    secondary: { backgroundColor: C.beigeMid, hoverBg: "#C9BBA2", color: C.brownText },
    danger: { backgroundColor: C.red, hoverBg: "#A93226", color: "white" },
  };
  const s = styles[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-8 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md border-2 ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:shadow-lg active:scale-[0.98]"
      } ${className}`}
      style={{
        backgroundColor: disabled ? C.beigeMid : s.backgroundColor,
        borderColor: disabled ? "#B8A990" : s.backgroundColor,
        color: disabled ? "#8B7355" : s.color,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = s.hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = s.backgroundColor;
      }}
    >
      {children}
    </button>
  );
}

// ─── FEEDBACK POPUP ───

export function FeedbackPopup({ type, text, onClose, buttonText = "Volgende" }) {
  const isCorrect = type === "correct";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div
        className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-6"
        style={{
          backgroundColor: isCorrect ? C.green : C.red,
          borderTop: `4px solid ${isCorrect ? "#3A6B30" : "#A93226"}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          {isCorrect ? <CheckCircle className="w-8 h-8 text-white" /> : <XCircle className="w-8 h-8 text-white" />}
          <span className="font-bold text-lg text-white">{isCorrect ? "CORRECT!" : "Niet helemaal..."}</span>
        </div>
        <p className="text-sm leading-relaxed mb-4 text-white/90 italic">{text}</p>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-bold text-sm transition-colors"
          style={{ backgroundColor: isCorrect ? "#3A6B30" : "#A93226", color: "white" }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}

// ─── INTRO SCREEN ───

export function IntroScreen({ title, text, children, buttonText, onNext }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <h2 className="text-2xl font-bold italic" style={{ color: C.brownText }}>{title}</h2>
      <div className="border-2 rounded-2xl p-6 max-w-lg" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
        {children || <p className="leading-relaxed text-center" style={{ color: C.brownText }}>{text}</p>}
      </div>
      <GameButton onClick={onNext}>
        {buttonText}
        <ArrowRight className="w-4 h-4" />
      </GameButton>
    </div>
  );
}

// ─── MC-CONTROLE (vragenpool van 3, 1 willekeurig + Fisher-Yates shuffle) ───

function pickAndShuffle(pool) {
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  // Fisher-Yates over de indices, daarna nieuwe correct-index berekenen
  const order = chosen.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...chosen,
    options: order.map((i) => chosen.options[i]),
    correct: order.indexOf(chosen.correct),
  };
}

export function MCControle({ pool, addScore, loseLife, onComplete, lastRound = false }) {
  const [q] = useState(() => pickAndShuffle(pool));
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const isCorrect = selected === q.correct;
  const letters = ["A", "B", "C", "D"];

  const handleCheck = () => {
    setChecked(true);
    setAttempts((prev) => prev + 1);
    if (isCorrect) {
      addScore(attempts === 0 ? 10 : 5);
    } else {
      loseLife();
    }
  };

  const handleNext = () => {
    if (!isCorrect && attempts < 2) {
      setSelected(null);
      setChecked(false);
      return;
    }
    onComplete();
  };

  return (
    <div className="border-2 rounded-2xl p-6 max-w-xl w-full shadow-md mx-auto" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
      <div className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: C.olive }}>
        Controlevraag
      </div>
      <h3 className="font-bold mb-4 text-sm italic" style={{ color: C.brownText }}>{q.question}</h3>
      <div className="flex flex-col gap-2 mb-4">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => !checked && setSelected(i)}
            className="text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all"
            style={{
              backgroundColor:
                checked && i === q.correct
                  ? C.greenLight
                  : checked && selected === i && i !== q.correct
                  ? C.redLight
                  : selected === i
                  ? "#FFF0D6"
                  : C.bgCard,
              borderColor:
                checked && i === q.correct
                  ? C.green
                  : checked && selected === i && i !== q.correct
                  ? C.red
                  : selected === i
                  ? C.olive
                  : C.beigeMid,
              color: C.brownText,
            }}
          >
            <span className="font-bold mr-2">{letters[i]}.</span>
            {opt}
          </button>
        ))}
      </div>

      {!checked && (
        <GameButton onClick={handleCheck} disabled={selected === null} className="w-full">
          Controleer
        </GameButton>
      )}

      {checked && (
        <div className="mt-2">
          <p className="text-sm mb-3 italic font-medium" style={{ color: isCorrect ? C.green : C.red }}>
            {isCorrect ? q.feedbackCorrect : q.feedbackWrong}
          </p>
          <GameButton onClick={handleNext} variant={isCorrect || attempts >= 2 ? "green" : "danger"} className="w-full">
            {isCorrect || attempts >= 2 ? (lastRound ? "Bekijk je resultaat" : "Volgende ronde") : "Probeer opnieuw"}
          </GameButton>
        </div>
      )}
    </div>
  );
}

// ─── END SCREEN ───

export function EndScreen({ score, maxScore, lives, text, onRestart, onExit, exitLabel = "Terug naar het menu" }) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  let stars = pct >= 80 ? 3 : pct >= 60 ? 2 : 1;
  if (lives <= 1 && stars > 1) stars -= 1;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <Star
            key={s}
            className={`w-14 h-14 transition-all duration-500 ${s <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
          />
        ))}
      </div>
      <div className="text-5xl font-bold italic" style={{ color: C.brownText }}>
        {score}/{maxScore}
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((h) => (
          <Heart key={h} className="w-5 h-5" fill={h <= lives ? "#E74C3C" : "transparent"} stroke={h <= lives ? "#E74C3C" : "#B8A990"} />
        ))}
      </div>
      <div className="border-2 rounded-2xl p-6 max-w-lg" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
        <p className="text-sm text-center leading-relaxed" style={{ color: C.brownText }}>{text}</p>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <GameButton onClick={onRestart} variant="secondary">
          <RotateCcw className="w-4 h-4" />
          Opnieuw spelen
        </GameButton>
        {onExit && <GameButton onClick={onExit}>{exitLabel}</GameButton>}
      </div>
    </div>
  );
}

// ─── STAP-BANNER (INTERACTIE / MC-CONTROLE) ───

export function StepBanner({ step }) {
  const isInteract = step === 1;
  return (
    <div
      className="rounded-lg px-3 py-1 mb-3 text-[11px] font-bold uppercase tracking-widest border"
      style={{
        backgroundColor: isInteract ? C.oliveLight : "#FFF0D6",
        borderColor: isInteract ? C.olive : C.brown,
        color: isInteract ? C.oliveDark : C.brown,
      }}
    >
      {isInteract ? "Stap 1 — Interactie" : "Stap 2 — Controle"}
    </div>
  );
}
