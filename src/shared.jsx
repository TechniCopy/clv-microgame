/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { LEVENS_PER_MISSIE } from "./microgame/schil.jsx";
import { CheckCircle, XCircle, Star, ArrowRight, RotateCcw, Heart, Lightbulb, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

// ─── THEME COLORS (huisstijl PractiQ microgames) ───

export const C = {
  bgPage: "#F7E3CF",      // peach
  bgCard: "#FFFFFF",
  bgHeader: "#242424",    // ink / zwartgrijs
  brownText: "#242424",   // tekst / rand
  brown: "#6B6B6B",       // secundaire tekst
  olive: "#52B59C",       // knoppen / interactie-accent (mint)
  oliveDark: "#3D9480",
  oliveLight: "#E5F4EF",
  green: "#2E9E5B",       // succes
  greenLight: "#E2F5E9",
  red: "#D9483B",         // fout
  redLight: "#FDEAE8",
  beigeMid: "#E6CBAA",
  beigeLight: "#F3DCC3",
  amber: "#C25E11",       // aandachtspunt op het eindscherm
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
  // Combo-melding kort tonen en daarna vanzelf laten verdwijnen
  const [zichtbaar, setZichtbaar] = useState(false);
  useEffect(() => {
    if (streak < 2) {
      setZichtbaar(false);
      return undefined;
    }
    setZichtbaar(true);
    const timer = setTimeout(() => setZichtbaar(false), 1500);
    return () => clearTimeout(timer);
  }, [streak]);
  if (!zichtbaar || streak < 2) return null;
  return (
    <div className="fixed top-20 right-4 z-[90] animate-bounce">
      <div
        className="rounded-xl px-4 py-2 shadow-lg border-2 font-bold italic text-sm"
        style={{ backgroundColor: "#F9762E", borderColor: C.brownText, color: "white" }}
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

// ─── SLEEPFIX MOBIEL ───
//
// Op een telefoon scrolde de pagina mee zodra je een kaartje versleepte: je
// was dan eigenlijk aan het scrollen in plaats van aan het slepen. "touch-action:
// none" op het element is daar niet genoeg voor (iOS negeert het zodra de
// pagina zelf kan scrollen), en React registreert zijn touchmove-listener
// passive, dus een preventDefault in een React-handler doet niets.
//
// Daarom: zodra een vinger op een sleepbaar element landt zetten we zelf een
// non-passive touchmove-listener op document die de paginascroll blokkeert, en
// bij het loslaten halen we hem weer weg. Elke sleepmechaniek roept deze twee
// functies aan bij pointerdown en pointerup/cancel.
let sleepBlokkade = null;

export function blokkeerPaginaScroll() {
  if (sleepBlokkade) return;
  const blokkeer = (e) => {
    if (e.cancelable) e.preventDefault();
  };
  document.addEventListener("touchmove", blokkeer, { passive: false });
  sleepBlokkade = () => {
    document.removeEventListener("touchmove", blokkeer);
    sleepBlokkade = null;
  };
}

export function herstelPaginaScroll() {
  if (sleepBlokkade) sleepBlokkade();
}

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
        blokkeerPaginaScroll();
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
        herstelPaginaScroll();
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
        herstelPaginaScroll();
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
        boxShadow: isSelected ? "0 0 0 6px rgba(82,181,156,0.25)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// DropTarget: onDropItem(payload, point) => "correct" | "wrong" | undefined.
// "wrong" geeft een korte rode flash (terugveer-effect: de ghost verdwijnt en
// het origineel staat nog op zijn plek). Werkt voor slepen en voor tikken:
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
        color: disabled ? "#8C857C" : "white",
        borderColor: disabled ? "#D8C6B0" : C.oliveDark,
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
    <div className="flex items-center justify-between py-3 px-3 sm:px-5" style={{ backgroundColor: C.bgHeader }}>
      <div className="flex items-center gap-4">
        <span className="hidden sm:inline text-white font-bold text-sm">Ronde:</span>
        <div className="flex gap-1.5">
          {rounds.map((r) => {
            const isComplete = r < currentRound;
            const isCurrent = r === currentRound;
            return (
              <div
                key={r}
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all duration-300"
                style={{
                  backgroundColor: isComplete || isCurrent ? "#F7E3CF" : "transparent",
                  borderColor: isComplete || isCurrent ? "#F7E3CF" : C.beigeMid,
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
          {Array.from({ length: LEVENS_PER_MISSIE }, (_, i) => i + 1).map((h) => (
            <Heart
              key={h}
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-300"
              fill={h <= lives ? "#E74C3C" : "transparent"}
              stroke={h <= lives ? "#E74C3C" : "#8C857C"}
              style={{ opacity: h <= lives ? 1 : 0.3 }}
            />
          ))}
        </div>
        <span className="text-white font-bold text-sm">
          <span className="hidden sm:inline">Score:{" "}</span>
          <span
            className="text-lg inline-block transition-transform duration-200"
            style={{ transform: scorePop ? "scale(1.5)" : "scale(1)", color: scorePop ? "#F9762E" : "white" }}
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
    green: { backgroundColor: C.green, hoverBg: "#24824A", color: "white" },
    secondary: { backgroundColor: C.beigeMid, hoverBg: "#EACFAF", color: C.brownText },
    danger: { backgroundColor: C.red, hoverBg: "#B93A2F", color: "white" },
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
        borderColor: disabled ? "#D8C6B0" : s.backgroundColor,
        color: disabled ? "#8C857C" : s.color,
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
          borderTop: `4px solid ${isCorrect ? "#24824A" : "#B93A2F"}`,
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
          style={{ backgroundColor: isCorrect ? "#24824A" : "#B93A2F", color: "white" }}
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

export function MCControle({ pool, beantwoord, onComplete, onFout, lastRound = false }) {
  const [q] = useState(() => pickAndShuffle(pool));
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const isCorrect = selected === q.correct;
  const letters = ["A", "B", "C", "D"];

  const handleCheck = () => {
    setChecked(true);
    setAttempts((prev) => prev + 1);
    // alleen de eerste controle telt voor de kern; een tweede poging na de
    // hint blijft leerzaam maar levert geen punten meer op
    if (attempts === 0) beantwoord?.(isCorrect);
    if (!isCorrect) onFout?.(q.aandacht);
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
                  ? "#FDEBDD"
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

export function EndScreen({
  score,
  maxScore,
  lives,
  text,
  leermomenten = [],
  aandacht = [],
  onRestart,
  onExit,
  exitLabel = "Terug naar het menu",
}) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  let stars = pct >= 80 ? 3 : pct >= 60 ? 2 : 1;
  if (lives <= 1 && stars > 1) stars -= 1;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
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
        {Array.from({ length: LEVENS_PER_MISSIE }, (_, i) => i + 1).map((h) => (
          <Heart key={h} className="w-5 h-5" fill={h <= lives ? "#E74C3C" : "transparent"} stroke={h <= lives ? "#E74C3C" : "#D8C6B0"} />
        ))}
      </div>
      <p className="text-sm text-center leading-relaxed max-w-md font-medium" style={{ color: C.brown }}>
        {text}
      </p>

      {(leermomenten.length > 0 || aandacht.length > 0) && (
        <div className="border-2 rounded-2xl p-5 max-w-lg w-full" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
          {leermomenten.length > 0 && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.olive }}>
                Belangrijkste leermomenten
              </div>
              <ul className="flex flex-col gap-1.5">
                {leermomenten.map((l) => (
                  <li key={l} className="flex items-start gap-2 text-sm leading-snug" style={{ color: C.brownText }}>
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.green }} />
                    {l}
                  </li>
                ))}
              </ul>
            </>
          )}
          {aandacht.length > 0 && (
            <>
              <div
                className={`text-xs font-bold uppercase tracking-wide mb-2 ${leermomenten.length > 0 ? "mt-4" : ""}`}
                style={{ color: C.amber }}
              >
                Jouw aandachtspunten
              </div>
              <ul className="flex flex-col gap-1.5">
                {aandacht.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm leading-snug" style={{ color: C.brownText }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.amber }} />
                    {a}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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

// ─── STAP-BANNER (TRAINEN / DOEN / CONTROLE) ───

export function StepBanner({ step }) {
  const map = {
    intro: { txt: "Vooraf", bg: C.beigeLight, border: C.beigeMid, color: C.brown },
    0: { txt: "Trainen", bg: C.beigeLight, border: C.brown, color: C.brown },
    1: { txt: "Doen", bg: C.oliveLight, border: C.olive, color: C.oliveDark },
    2: { txt: "Controle", bg: "#FDEBDD", border: C.brown, color: C.brown },
  };
  const s = map[step] ?? map[1];
  return (
    <div
      className="rounded-lg px-3 py-1 mb-3 text-[11px] font-bold uppercase tracking-widest border"
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.color }}
    >
      {s.txt}
    </div>
  );
}

// ─── UITLEG-KAART VOORAF ("Voordat je begint") ───
//
// Toont eerst een korte uitleg met de kern van wat de cursist zo gaat
// ontdekken, zodat de interactie begeleid ontdekken wordt i.p.v. gokken.

export function RondeIntro({ title, intro, children, onStart, buttonText = "Aan de slag" }) {
  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step="intro" />
      <h2 className="text-xl font-bold italic mb-1 text-center" style={{ color: C.brownText }}>{title}</h2>
      {intro && (
        <p className="text-sm mb-3 max-w-lg text-center font-medium" style={{ color: C.brown }}>
          {intro}
        </p>
      )}
      <div
        className="border-2 rounded-2xl p-5 max-w-lg w-full mb-5"
        style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}
      >
        {children}
      </div>
      <GameButton onClick={onStart}>
        {buttonText}
        <ArrowRight className="w-4 h-4" />
      </GameButton>
    </div>
  );
}

// Rij in een uitleg-kaart: term (vet) + korte functie-omschrijving.
export function UitlegItem({ term, children }) {
  return (
    <div className="flex gap-2 mb-2 last:mb-0">
      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C.olive }} />
      <p className="text-sm leading-snug" style={{ color: C.brownText }}>
        <span className="font-bold">{term}</span>
        {term && children ? " — " : ""}
        {children}
      </p>
    </div>
  );
}

// ─── TRAINOEFENING (actief leren vooraf) ───
//
// Korte, veilige oefening voor de echte opdracht: geen punten, geen levens.
// De speler krijgt per item een omschrijving of vraag en kiest het antwoord.
// Een fout item komt later in de reeks terug tot het goed beantwoord is.
// items: [{ vraag, opties: [..], correct: index, uitleg }]

function schud(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function TrainOefening({ titel, intro, items, onKlaar, buttonText = "Naar de opdracht" }) {
  const [queue, setQueue] = useState(() => schud(items.length));
  const [goed, setGoed] = useState([]); // item-indices die goed beantwoord zijn
  const [mix, setMix] = useState(() => schud(items[0] ? items[0].opties.length : 0));
  const [selected, setSelected] = useState(null);

  const klaar = queue.length === 0;
  const item = klaar ? null : items[queue[0]];
  const checked = selected !== null;
  const correctPos = item ? mix.indexOf(item.correct) : -1;
  const isCorrect = selected === correctPos;

  const kies = (i) => {
    if (checked) return;
    setSelected(i);
    playSound(i === correctPos ? "correct" : "wrong");
  };

  const volgende = () => {
    const [huidig, ...rest] = queue;
    // goed: item is klaar; fout: item komt achteraan terug
    const nieuw = isCorrect ? rest : [...rest, huidig];
    if (isCorrect && !goed.includes(huidig)) setGoed((prev) => [...prev, huidig]);
    setQueue(nieuw);
    setSelected(null);
    if (nieuw.length > 0) setMix(schud(items[nieuw[0]].opties.length));
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={0} />
      {titel && (
        <h2 className="text-xl font-bold italic mb-1 text-center" style={{ color: C.brownText }}>{titel}</h2>
      )}
      {intro && (
        <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>{intro}</p>
      )}

      {!klaar ? (
        <div className="border-2 rounded-2xl p-6 max-w-xl w-full shadow-md" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.olive }}>
              Oefenen — geen punten, geen levens
            </span>
            <span className="text-xs font-bold" style={{ color: C.brown }}>
              {goed.length}/{items.length} goed
            </span>
          </div>
          <h3 className="font-bold mb-4 text-sm italic" style={{ color: C.brownText }}>{item.vraag}</h3>
          <div className="flex flex-col gap-2 mb-2">
            {mix.map((optIdx, pos) => (
              <button
                key={pos}
                onClick={() => kies(pos)}
                className="text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all"
                style={{
                  backgroundColor:
                    checked && pos === correctPos
                      ? C.greenLight
                      : checked && selected === pos
                      ? C.redLight
                      : C.bgCard,
                  borderColor:
                    checked && pos === correctPos
                      ? C.green
                      : checked && selected === pos
                      ? C.red
                      : C.beigeMid,
                  color: C.brownText,
                }}
              >
                {item.opties[optIdx]}
              </button>
            ))}
          </div>
          {checked && (
            <div className="mt-2">
              <p className="text-sm mb-3 italic font-medium" style={{ color: isCorrect ? C.green : C.red }}>
                {isCorrect ? `Klopt! ${item.uitleg ?? ""}` : `${item.uitleg ?? ""} Deze komt zo nog een keer terug.`}
              </p>
              <GameButton onClick={volgende} variant={isCorrect ? "green" : "danger"} className="w-full">
                Volgende
              </GameButton>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="border-2 rounded-2xl p-6 max-w-md w-full text-center" style={{ backgroundColor: C.greenLight, borderColor: C.green }}>
            <CheckCircle className="w-10 h-10 mx-auto mb-2" style={{ color: C.green }} />
            <p className="text-sm font-bold" style={{ color: C.green }}>
              Training klaar — nu ga je het toepassen. Vanaf hier tellen de punten!
            </p>
          </div>
          <GameButton onClick={onKlaar} variant="green">
            {buttonText}
            <ArrowRight className="w-4 h-4" />
          </GameButton>
        </div>
      )}
    </div>
  );
}

// ─── MEELOPEND SPIEKBRIEFJE (begeleiding tijdens de interactie) ───
//
// Compacte, inklapbare uitleg die in beeld blijft terwijl de cursist sleept,
// zodat hij de net geleerde feiten kan toepassen met de uitleg bij de hand.

export function UitlegStrook({ title = "Spiekbriefje", children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="w-full max-w-lg mb-3 rounded-xl border-2 overflow-hidden" style={{ borderColor: C.brown, backgroundColor: "#FDF4E9" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold"
        style={{ color: C.brown }}
      >
        <span className="flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" />
          {title}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 text-[11px] leading-snug" style={{ color: C.brownText }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── "EERSTE MISSER IS GRATIS" ───
//
// Geeft elke ronde 1 foutloze poging: de eerste verkeerde sleepactie kost
// geen punt (alleen een uitleg-hint), daarna pas -5. Maakt ontdekken minder
// straffend voor een cursist die de stof nog niet kent.

export function useEersteFoutVrij() {
  const ref = useRef(true);
  return useCallback(() => {
    if (ref.current) {
      ref.current = false;
      return true;
    }
    return false;
  }, []);
}

// ─── AANDACHTSPUNTEN VERZAMELEN ───
//
// Elke misser noteert 1 kort lesfeit. Op het eindscherm krijgt de cursist ze
// terug als "Jouw aandachtspunten": persoonlijk, en precies de stof die hij
// nog niet beheerste. Dubbele meldingen worden samengevoegd.

export function useAandacht() {
  const [aandacht, setAandacht] = useState([]);
  const noteer = useCallback((tekst) => {
    if (!tekst) return;
    setAandacht((prev) => (prev.includes(tekst) ? prev : [...prev, tekst]));
  }, []);
  const reset = useCallback(() => setAandacht([]), []);
  return { aandacht, noteer, reset };
}

// ─── ONDERKANT-DRAINAGE volgens NPR 3378-40/41 ───
//
// Canonieke onderzijde van een (half-)CLV-systeem: het condenswater uit het
// rookgaskanaal gaat via SIFON 1 (eerste waterslot) -> OPEN VERBINDING
// (zichtbare luchtspleet) -> SIFON 2 (tweede waterslot) -> binnenriolering
// (NEN 3287). Eén gedeelde tekening zodat alle doorsneden identiek en
// normconform zijn. Lokale maat: ~54 breed x ~30 hoog; plaats met x/y/s.
//
// (0,0) lokaal = condensaat-inlaat boven sifon 1.
export function DrainageTrein({ x, y, s = 1, stroke = C.brownText, strokeWidth = 2, riool = true }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* SIFON 1 (eerste waterslot) */}
      <path d="M0 0 V13 Q0 19 6 19 Q12 19 12 13 V3" />
      {/* pijp omhoog en naar de open verbinding */}
      <path d="M12 3 V0 H25" />
      {/* OPEN VERBINDING: pijp eindigt open boven een trechter (luchtspleet) */}
      <path d="M25 0 V4" />
      <path d="M19 8 L25 15 L31 8" />
      {/* SIFON 2 (tweede waterslot) */}
      <path d="M25 15 V23 Q25 29 31 29 Q37 29 37 23 V5" />
      {/* naar de binnenriolering (NEN 3287) */}
      {riool && <path d="M37 5 H52" />}
    </g>
  );
}
