import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Building2, Wrench, ClipboardCheck, Lock, X } from "lucide-react";
import { C } from "./shared.jsx";

// Elke game laadt pas als hij geopend wordt; zo blijft de eerste download klein.
const CLVVerkennerGame = lazy(() => import("./CLVVerkennerGame.jsx"));
const CLVMonteurGame = lazy(() => import("./CLVMonteurGame.jsx"));
const CLVServiceGame = lazy(() => import("./CLVServiceGame.jsx"));

function Laden() {
  return <div className="min-h-screen" style={{ backgroundColor: C.bgPage }} />;
}

// Elke game ontgrendelt de volgende. De sleutel van game 1 bestond al;
// spelers die game 1 eerder voltooiden, houden game 2 dus open.
const VOLTOOID_SLEUTEL = {
  verkenner: "clv_game1_voltooid",
  monteur: "clv_game2_voltooid",
  service: "clv_game3_voltooid",
};

const GAMES = [
  {
    id: "verkenner",
    nummer: 1,
    titel: "De CLV-Verkenner",
    tekst: "Hoe werkt een CLV, uit welke onderdelen bestaat het en welke toestellen mogen erop?",
    Icoon: Building2,
    rondes: 4,
    vereist: null,
  },
  {
    id: "monteur",
    nummer: 2,
    titel: "De CLV-Monteur",
    tekst: "Haal een oude ketel weg, sluit een nieuwe veilig aan en lever het werk netjes op.",
    Icoon: Wrench,
    rondes: 3,
    vereist: "verkenner",
  },
  {
    id: "service",
    nummer: 3,
    titel: "De CLV-Servicemonteur",
    tekst: "Beoordeel een bestaand CLV, adviseer bij vervanging en voer het onderhoud uit.",
    Icoon: ClipboardCheck,
    rondes: 3,
    vereist: "monteur",
  },
];

// Alle schermen per game, voor het Ctrl-D controlemenu
function devSchermen(rondes) {
  const lijst = [
    { id: "start", label: "Startscherm" },
    { id: "intro", label: "Missie-intro" },
  ];
  for (let r = 1; r <= rondes; r += 1) {
    lijst.push({ id: `r${r}`, label: `Ronde ${r}: opdracht` });
    lijst.push({ id: `r${r}mc`, label: `Ronde ${r}: controlevragen` });
  }
  lijst.push({ id: "end", label: "Eindscherm" });
  return lijst;
}

function leesVoltooid() {
  const stand = {};
  for (const g of GAMES) {
    try {
      stand[g.id] = localStorage.getItem(VOLTOOID_SLEUTEL[g.id]) === "1";
    } catch {
      stand[g.id] = false;
    }
  }
  return stand;
}

function DevMenu({ onJump, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl border-2 shadow-2xl p-5 w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold italic text-lg" style={{ color: C.brownText }}>
            Controlemenu <span className="text-xs font-normal not-italic" style={{ color: C.brown }}>(Ctrl-D)</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/10">
            <X className="w-5 h-5" style={{ color: C.brownText }} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {GAMES.map((g) => (
            <div key={g.id}>
              <div className="font-bold text-sm mb-2 italic" style={{ color: C.olive }}>
                Game {g.nummer}: {g.titel}
              </div>
              <div className="flex flex-col gap-1">
                {devSchermen(g.rondes).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onJump(g.id, s.id)}
                    className="text-left px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:shadow"
                    style={{ borderColor: C.beigeMid, color: C.brownText, backgroundColor: "white" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.oliveLight)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={() => {
              try {
                for (const sleutel of Object.values(VOLTOOID_SLEUTEL)) localStorage.removeItem(sleutel);
              } catch {
                /* geen opslag beschikbaar */
              }
              window.location.reload();
            }}
            className="text-xs underline"
            style={{ color: C.red }}
          >
            Voortgang wissen (game 2 en 3 weer op slot)
          </button>
          <button onClick={() => onJump(null, null)} className="text-xs underline" style={{ color: C.brown }}>
            Naar het hoofdmenu
          </button>
        </div>
      </div>
    </div>
  );
}

function GameKaart({ game, open, voltooid, vorige, onPick }) {
  const { Icoon } = game;
  const grijs = "#8C857C";
  return (
    <button
      onClick={() => open && onPick(game.id)}
      disabled={!open}
      className={`flex-1 rounded-2xl border-2 p-5 flex flex-col items-center gap-3 shadow-md transition-all ${
        open ? "hover:shadow-xl hover:-translate-y-0.5" : "cursor-not-allowed"
      }`}
      style={{
        backgroundColor: open ? C.bgCard : C.beigeLight,
        borderColor: open ? C.brownText : C.beigeMid,
        opacity: open ? 1 : 0.75,
      }}
    >
      <div
        className="rounded-full p-4"
        style={{ backgroundColor: open ? C.beigeLight : C.beigeMid, border: `3px solid ${open ? C.brownText : C.beigeMid}` }}
      >
        {open ? <Icoon className="w-10 h-10" style={{ color: C.brownText }} /> : <Lock className="w-10 h-10" style={{ color: grijs }} />}
      </div>
      <div className="font-bold italic text-lg text-center" style={{ color: open ? C.brownText : grijs }}>
        {game.nummer}. {game.titel}
      </div>
      <p className="text-xs text-center" style={{ color: open ? C.brown : grijs }}>
        {game.tekst}
      </p>
      {open ? (
        <span className="px-4 py-1.5 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.olive }}>
          {voltooid ? "Opnieuw spelen" : game.nummer === 1 ? "Start hier" : "Start de game"}
        </span>
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: grijs }}>
          Rond eerst game {vorige} af
        </span>
      )}
      {voltooid && (
        <span className="text-[10px] font-bold" style={{ color: C.green }}>
          ✓ voltooid
        </span>
      )}
    </button>
  );
}

function GameMenu({ voltooid, onPick }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bgPage }}>
      <div className="max-w-[900px] w-full mx-auto flex flex-col min-h-screen shadow-lg" style={{ backgroundColor: C.bgPage }}>
        <div className="py-4 px-5 text-center" style={{ backgroundColor: C.bgHeader }}>
          <img src="/brand/logo-light.png" alt="PractiQ" className="mx-auto mb-2" style={{ height: 30 }} />
          <div className="text-white font-bold italic text-xl">CLV-Systemen in Gestapelde Bouw</div>
          <div className="text-xs mt-1" style={{ color: C.beigeMid }}>
            Leerdoel 14: drie microgames
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-5 sm:p-8">
          <p className="max-w-md text-center text-sm font-medium" style={{ color: C.brown }}>
            In een flat delen meerdere woningen dezelfde rookgasafvoer. Leer eerst hoe zo&rsquo;n CLV-systeem werkt. Daarna sluit
            je als monteur een ketel aan en tot slot beoordeel en onderhoud je een bestaand systeem.
          </p>

          <div className="flex flex-col md:flex-row gap-4 w-full">
            {GAMES.map((g) => (
              <GameKaart
                key={g.id}
                game={g}
                open={!g.vereist || voltooid[g.vereist]}
                voltooid={voltooid[g.id]}
                vorige={g.nummer - 1}
                onPick={onPick}
              />
            ))}
          </div>
        </div>

        <div className="py-3 text-center text-[10px]" style={{ color: C.brown }}>
          PractiQ · Vakmanschap CO · Leerdoel 14
        </div>
      </div>
    </div>
  );
}

// QA-sprong voor screenshots zonder klikken: ?qa=1&spring=verkenner-r3 opent
// game 1 in ronde 3; &fase=opdracht slaat daar de introkaart over.
function leesQaSprong() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("qa") !== "1") return null;
    const [game, screen] = (p.get("spring") ?? "").split("-");
    if (!GAMES.some((g) => g.id === game)) return null;
    return { game, screen: screen || "start", fase: p.get("fase") };
  } catch {
    return null;
  }
}

export default function App() {
  const [qa] = useState(leesQaSprong);
  const [view, setView] = useState(() => (qa ? { game: qa.game, screen: qa.screen, key: 0 } : { game: null, screen: "start", key: 0 }));
  const [voltooid, setVoltooid] = useState(leesVoltooid);
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDevOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const markeerVoltooid = useCallback((id) => {
    try {
      localStorage.setItem(VOLTOOID_SLEUTEL[id], "1");
    } catch {
      /* geen opslag beschikbaar: alleen deze sessie */
    }
    setVoltooid((prev) => ({ ...prev, [id]: true }));
  }, []);

  const toMenu = useCallback(() => setView((prev) => ({ game: null, screen: "start", key: prev.key + 1 })), []);

  const devJump = (game, screen) => {
    setDevOpen(false);
    if (!game) {
      toMenu();
      return;
    }
    setView((prev) => ({ game, screen, key: prev.key + 1 }));
  };

  const gameProps = (id) => ({
    initialScreen: view.screen,
    onExit: toMenu,
    onGameComplete: () => markeerVoltooid(id),
    // alleen bij de allereerste weergave na een QA-sprong
    qaFase: qa && view.key === 0 ? qa.fase : null,
  });

  return (
    <>
      <Suspense fallback={<Laden />}>
        {view.game === "verkenner" && <CLVVerkennerGame key={`verkenner-${view.key}`} {...gameProps("verkenner")} />}
        {view.game === "monteur" && <CLVMonteurGame key={`monteur-${view.key}`} {...gameProps("monteur")} />}
        {view.game === "service" && <CLVServiceGame key={`service-${view.key}`} {...gameProps("service")} />}
      </Suspense>
      {view.game === null && (
        <GameMenu voltooid={voltooid} onPick={(game) => setView((prev) => ({ game, screen: "start", key: prev.key + 1 }))} />
      )}
      {devOpen && <DevMenu onJump={devJump} onClose={() => setDevOpen(false)} />}
    </>
  );
}
