import { useState, useEffect, useCallback } from "react";
import { Building2, Wrench, Lock, X } from "lucide-react";
import { C, GameButton } from "./shared.jsx";
import CLVVerkennerGame from "./CLVVerkennerGame.jsx";
import CLVMonteurGame from "./CLVMonteurGame.jsx";

const STORAGE_KEY = "clv_game1_voltooid";

// Alle schermen per game, voor het Ctrl-D controlemenu
const DEV_SCREENS = [
  { id: "start", label: "Startscherm" },
  { id: "intro", label: "Missie-intro" },
  { id: "r1", label: "Ronde 1 — interactie" },
  { id: "r1mc", label: "Ronde 1 — MC-controle" },
  { id: "r2", label: "Ronde 2 — interactie" },
  { id: "r2mc", label: "Ronde 2 — MC-controle" },
  { id: "r3", label: "Ronde 3 — interactie" },
  { id: "r3mc", label: "Ronde 3 — MC-controle" },
  { id: "end", label: "Eindscherm" },
];

function DevMenu({ onJump, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="rounded-2xl border-2 shadow-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { game: "verkenner", titel: "Game 1 — De CLV-Verkenner" },
            { game: "monteur", titel: "Game 2 — De CLV-Monteur" },
          ].map(({ game, titel }) => (
            <div key={game}>
              <div className="font-bold text-sm mb-2 italic" style={{ color: C.olive }}>
                {titel}
              </div>
              <div className="flex flex-col gap-1">
                {DEV_SCREENS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onJump(game, s.id)}
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
              localStorage.removeItem(STORAGE_KEY);
              window.location.reload();
            }}
            className="text-xs underline"
            style={{ color: C.red }}
          >
            Voortgang wissen (game 2 weer vergrendelen)
          </button>
          <button onClick={() => onJump(null, null)} className="text-xs underline" style={{ color: C.brown }}>
            Naar het hoofdmenu
          </button>
        </div>
      </div>
    </div>
  );
}

function GameMenu({ game1Done, onPick }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bgPage }}>
      <div className="max-w-[800px] w-full mx-auto flex flex-col min-h-screen shadow-lg" style={{ backgroundColor: C.bgPage }}>
        <div className="py-4 px-5 text-center" style={{ backgroundColor: C.bgHeader }}>
          <div className="text-white font-bold italic text-xl">CLV-Systemen in Gestapelde Bouw</div>
          <div className="text-xs mt-1" style={{ color: C.beigeMid }}>
            Leerdoel 14 — twee microgames
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <p className="max-w-md text-center text-sm font-medium" style={{ color: C.brown }}>
            In een flat delen meerdere woningen dezelfde rookgasafvoer. Leer eerst hoe zo&rsquo;n CLV-systeem werkt, en ga er
            daarna als monteur mee aan de slag.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 w-full max-w-xl">
            {/* Game 1 */}
            <button
              onClick={() => onPick("verkenner")}
              className="flex-1 rounded-2xl border-2 p-6 flex flex-col items-center gap-3 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5"
              style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}
            >
              <div className="rounded-full p-4 border-3" style={{ backgroundColor: C.beigeLight, border: `3px solid ${C.brownText}` }}>
                <Building2 className="w-12 h-12" style={{ color: C.brownText }} />
              </div>
              <div className="font-bold italic text-lg" style={{ color: C.brownText }}>
                1. De CLV-Verkenner
              </div>
              <p className="text-xs text-center" style={{ color: C.brown }}>
                Begrijp en herken het CLV-systeem: werking, onderdelen en toesteltypes.
              </p>
              <span
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white"
                style={{ backgroundColor: C.olive }}
              >
                {game1Done ? "Opnieuw spelen" : "Start hier"}
              </span>
              {game1Done && (
                <span className="text-[10px] font-bold" style={{ color: C.green }}>
                  ✓ voltooid
                </span>
              )}
            </button>

            {/* Game 2 */}
            <button
              onClick={() => game1Done && onPick("monteur")}
              disabled={!game1Done}
              className={`flex-1 rounded-2xl border-2 p-6 flex flex-col items-center gap-3 shadow-md transition-all ${
                game1Done ? "hover:shadow-xl hover:-translate-y-0.5" : "cursor-not-allowed"
              }`}
              style={{
                backgroundColor: game1Done ? C.bgCard : C.beigeLight,
                borderColor: game1Done ? C.brownText : C.beigeMid,
                opacity: game1Done ? 1 : 0.75,
              }}
            >
              <div
                className="rounded-full p-4"
                style={{
                  backgroundColor: game1Done ? C.beigeLight : C.beigeMid,
                  border: `3px solid ${game1Done ? C.brownText : C.beigeMid}`,
                }}
              >
                {game1Done ? (
                  <Wrench className="w-12 h-12" style={{ color: C.brownText }} />
                ) : (
                  <Lock className="w-12 h-12" style={{ color: "#8B7355" }} />
                )}
              </div>
              <div className="font-bold italic text-lg" style={{ color: game1Done ? C.brownText : "#8B7355" }}>
                2. De CLV-Monteur
              </div>
              <p className="text-xs text-center" style={{ color: game1Done ? C.brown : "#8B7355" }}>
                Sluit een toestel veilig aan, voorkom recirculatie en stel het systeem in bedrijf.
              </p>
              {game1Done ? (
                <span className="px-4 py-1.5 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.olive }}>
                  Start de game
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#8B7355" }}>
                  Rond eerst game 1 af
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="py-3 text-center text-[10px]" style={{ color: C.brown }}>
          Studium B.V. — Vakmanschap CO · Leerdoel 14
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState({ game: null, screen: "start", key: 0 });
  const [game1Done, setGame1Done] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
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

  const markGame1Done = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setGame1Done(true);
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

  return (
    <>
      {view.game === "verkenner" && (
        <CLVVerkennerGame key={`v-${view.key}`} initialScreen={view.screen} onExit={toMenu} onGameComplete={markGame1Done} />
      )}
      {view.game === "monteur" && <CLVMonteurGame key={`m-${view.key}`} initialScreen={view.screen} onExit={toMenu} />}
      {view.game === null && (
        <GameMenu game1Done={game1Done} onPick={(game) => setView((prev) => ({ game, screen: "start", key: prev.key + 1 }))} />
      )}
      {devOpen && <DevMenu onJump={devJump} onClose={() => setDevOpen(false)} />}
    </>
  );
}
