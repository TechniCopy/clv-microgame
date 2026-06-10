import { useState, useCallback, useEffect } from "react";
import { Building2, ArrowDown, ArrowUp, CheckCircle } from "lucide-react";
import {
  C,
  useGameJuice,
  DragProvider,
  Draggable,
  DropTarget,
  DragCard,
  ProgressBar,
  GameButton,
  IntroScreen,
  MCControle,
  EndScreen,
  StepBanner,
  playSound,
} from "./shared.jsx";

const MAX_SCORE = 105;

// ─── VRAGENPOOLS ───

const POOL_R1 = [
  {
    question: "[EXAMENVRAAG] Wat is het verschil tussen een CLV-systeem en een half-CLV-systeem?",
    options: [
      "Bij een half-CLV-systeem is alleen de rookgasafvoer gemeenschappelijk; de lucht komt individueel via de gevel.",
      "Bij een CLV-systeem is alleen de rookgasafvoer gemeenschappelijk.",
      "Een half-CLV bedient maar de helft van de verdiepingen.",
      "Er is geen verschil, het zijn twee namen voor hetzelfde.",
    ],
    correct: 0,
    feedbackCorrect: "Precies! Bij beide is de rookgasafvoer gemeenschappelijk. Het verschil zit in de lucht: CLV via het dak, half-CLV via de gevel.",
    feedbackWrong: "Kijk terug naar de animatie: bij beide systemen ging het rookgas via hetzelfde kanaal. Alleen de luchttoevoer verschilde.",
  },
  {
    question: "Bij een half-CLV-systeem: waar haalt het toestel zijn verbrandingslucht vandaan?",
    options: [
      "Individueel, bijvoorbeeld via een rooster in de buitengevel.",
      "Via het gezamenlijke luchtkanaal in de schacht.",
      "Uit de opstellingsruimte zelf.",
      "Via de rookgasafvoer, in tegengestelde richting.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt! Bij half-CLV is alleen de afvoer gemeenschappelijk; elk toestel heeft een eigen luchtinlaat, meestal via de gevel.",
    feedbackWrong: "Bij half-CLV is er géén gezamenlijk luchtkanaal. Elk toestel haalt individueel lucht, bijvoorbeeld via de gevel.",
  },
  {
    question: "Welk onderdeel is bij zowel een CLV- als een half-CLV-systeem gemeenschappelijk?",
    options: ["De rookgasafvoer.", "De luchttoevoer.", "De condensaatafvoer per woning.", "Geen enkel onderdeel."],
    correct: 0,
    feedbackCorrect: "Juist! De gemeenschappelijke rookgasafvoer is de kern van elk CLV-systeem — met of zonder gezamenlijke luchttoevoer.",
    feedbackWrong: "Denk aan de schuif-animatie: wat je ook deed met de luchttoevoer, het rookgas bleef via hetzelfde kanaal gaan.",
  },
];

const POOL_R2 = [
  {
    question: "Waarvoor dient de terugslagklep (rookgaskeerklep) in een CLV-systeem?",
    options: [
      "Om te voorkomen dat rookgas van andere toestellen terugstroomt naar jouw toestel.",
      "Om condenswater af te voeren.",
      "Om de druk in de schacht te verlagen.",
      "Om de luchttoevoer te regelen.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt! De terugslagklep voorkomt rookgas-recirculatie — daarover leer je meer in game 2.",
    feedbackWrong: "De terugslagklep houdt rookgas van andere toestellen tegen. Zonder klep kan rookgas terugstromen en dat is levensgevaarlijk.",
  },
  {
    question: "Wat is de functie van de drukvereffeningsconstructie onderaan het CLV-systeem?",
    options: [
      "Hij verbindt de luchttoevoer met de rookgasafvoer zodat het drukverschil in balans blijft.",
      "Hij vangt condenswater en regenwater op.",
      "Hij houdt rookgas van andere toestellen tegen.",
      "Hij zorgt voor de brandwerendheid van de schacht.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! De drukvereffeningsconstructie houdt de druk tussen lucht- en rookgaskanaal in balans.",
    feedbackWrong: "De drukvereffeningsconstructie zit onderaan en verbindt beide kanalen om het drukverschil in balans te houden.",
  },
  {
    question: "Waarom heeft de condensaatafvoer van een CLV-systeem een dubbele sifon nodig?",
    options: [
      "De eerste sifon houdt rookgas tegen, de tweede is een stankafsluiter tegen rioolgas.",
      "Eén sifon kan de hoeveelheid condenswater niet aan.",
      "De tweede sifon is reserve voor als de eerste verstopt raakt.",
      "Dat is alleen nodig bij half-CLV-systemen.",
    ],
    correct: 0,
    feedbackCorrect: "Precies! Twee sifons met een open verbinding ertussen: één tegen rookgas, één tegen rioolgas.",
    feedbackWrong: "Denk aan de twee gevaren: rookgas uit het systeem én rioolgas uit de riolering. Elke sifon vangt er één af.",
  },
];

const POOL_R3 = [
  {
    question: "[EXAMENVRAAG] Hoeveel toestellen mogen er per verdieping worden aangesloten op een concentrisch C(10) overdruk-CLV-systeem?",
    options: ["1 toestel", "2 toestellen", "3 toestellen", "4 toestellen"],
    correct: 0,
    feedbackCorrect: "Correct! Bij een overdruk-CLV mag maximaal 1 toestel per verdieping worden aangesloten.",
    feedbackWrong: "Bij overdruk is dat altijd maar 1 toestel per verdieping — anders kunnen de drukken elkaar verstoren.",
  },
  {
    question: "[EXAMENVRAAG] Een concentrisch CLV-systeem werkt op natuurlijke trek. Welk type toestel mag hierop worden aangesloten?",
    options: ["C43 toestel", "C53 toestel", "C33 toestel", "C83 toestel"],
    correct: 0,
    feedbackCorrect: "Juist! C42 en C43 zijn de types voor een concentrisch onderdruk-CLV.",
    feedbackWrong: "Voor onderdruk-CLV (natuurlijke trek) gelden C42 en C43. C83 hoort bij half-CLV, C33 bij een individuele dakdoorvoer.",
  },
  {
    question: "Wat betekent het laatste cijfer 3 in de codering C43?",
    options: [
      "Het toestel heeft een ventilator in de luchttoevoer.",
      "Het toestel heeft een ventilator in de rookgasafvoer.",
      "Het toestel mag op 3 verdiepingen worden aangesloten.",
      "Het toestel heeft 3 kW vermogen.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt! Een 3 = ventilator in de luchttoevoer, een 2 = ventilator in de rookgasafvoer. Alleen gesloten toestellen met ventilator mogen op een CLV.",
    feedbackWrong: "Het laatste cijfer gaat over de ventilator: 2 = in de rookgasafvoer, 3 = in de luchttoevoer.",
  },
];

// ─── SVG: FLAT-DOORSNEDE MET SCHACHT (ronde 1) ───

function FlatDoorsnede({ stand }) {
  const isDak = stand === "dak";
  const floors = [
    { yTop: 110, yBot: 210 },
    { yTop: 210, yBot: 310 },
    { yTop: 310, yBot: 410 },
  ];
  const flow = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };

  return (
    <svg viewBox="0 0 520 450" className="w-full h-auto select-none">
      {/* lucht (gebouw-omtrek) */}
      <rect x="70" y="90" width="380" height="320" fill="#FBF7EE" stroke={C.brownText} strokeWidth="3" />
      {/* dak */}
      <rect x="60" y="78" width="400" height="14" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2.5" />
      {/* verdiepingsvloeren */}
      {floors.map((f, i) => (
        <line key={i} x1="70" y1={f.yTop} x2="450" y2={f.yTop} stroke={C.brownText} strokeWidth="2" />
      ))}
      {/* maaiveld */}
      <line x1="40" y1="410" x2="480" y2="410" stroke={C.brownText} strokeWidth="3" />

      {/* schacht */}
      <rect x="235" y="40" width="50" height="370" fill="#EDE4D2" stroke={C.brownText} strokeWidth="2.5" />
      {/* binnenste rookgaskanaal */}
      <rect x="250" y="34" width="20" height="376" fill="#FBE9E5" stroke={C.brownText} strokeWidth="2" />

      {/* rookgasstroom (rood, omhoog) */}
      <path d="M260 400 L260 26" fill="none" stroke={C.red} strokeWidth="6" strokeLinecap="round" style={flow} />
      <path d="M252 22 L260 8 L268 22" fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

      {/* luchtkanaal in schacht (alleen CLV-stand actief) */}
      {isDak ? (
        <>
          <path d="M242 44 L242 395" fill="none" stroke="#3B82F6" strokeWidth="5" strokeLinecap="round" style={flow} />
          <path d="M278 44 L278 395" fill="none" stroke="#3B82F6" strokeWidth="5" strokeLinecap="round" style={flow} />
          {/* instroom op het dak */}
          <path d="M214 56 L240 56" fill="none" stroke="#3B82F6" strokeWidth="4" style={flow} />
          <path d="M306 56 L280 56" fill="none" stroke="#3B82F6" strokeWidth="4" style={flow} />
          <ArrowDownMarker x={228} y={48} />
          <ArrowDownMarker x={292} y={48} />
        </>
      ) : (
        <>
          {/* leeg buitenkanaal in gevel-stand */}
          <text x="243" y="230" fontSize="10" fill={C.brown} transform="rotate(-90 243 230)" textAnchor="middle" fontStyle="italic">
            niet in gebruik
          </text>
        </>
      )}

      {/* per woning: ketel + aansluiting + (gevel-stand) eigen luchtinlaat */}
      {floors.map((f, i) => {
        const yMid = (f.yTop + f.yBot) / 2;
        return (
          <g key={i}>
            {/* ketel */}
            <rect x="120" y={yMid - 26} width="64" height="52" rx="6" fill="white" stroke={C.brownText} strokeWidth="2.5" />
            <circle cx="152" cy={yMid - 4} r="10" fill="none" stroke={C.red} strokeWidth="2" />
            <path d={`M148 ${yMid - 1} q4 -10 8 0 q-4 6 -8 0`} fill={C.red} opacity="0.7" />
            <text x="152" y={yMid + 18} fontSize="9" fontWeight="700" fill={C.brownText} textAnchor="middle">
              KETEL
            </text>
            {/* rookgas van ketel naar schacht */}
            <path d={`M184 ${yMid - 12} L250 ${yMid - 12}`} fill="none" stroke={C.red} strokeWidth="4" style={flow} />
            {/* luchttoevoer naar ketel */}
            {isDak ? (
              <path d={`M242 ${yMid + 10} L184 ${yMid + 10}`} fill="none" stroke="#3B82F6" strokeWidth="4" style={flow} />
            ) : (
              <>
                <path d={`M70 ${yMid + 10} L120 ${yMid + 10}`} fill="none" stroke="#3B82F6" strokeWidth="4" style={flow} />
                {/* gevelrooster */}
                <rect x="62" y={yMid + 2} width="8" height="16" fill="#3B82F6" opacity="0.8" />
              </>
            )}
          </g>
        );
      })}

      {/* legenda */}
      <g transform="translate(330, 110)">
        <rect x="0" y="0" width="112" height="46" rx="8" fill="white" stroke={C.brownText} strokeWidth="1.5" opacity="0.95" />
        <line x1="10" y1="15" x2="34" y2="15" stroke={C.red} strokeWidth="4" strokeDasharray="6 4" />
        <text x="40" y="19" fontSize="10" fontWeight="600" fill={C.brownText}>rookgas</text>
        <line x1="10" y1="33" x2="34" y2="33" stroke="#3B82F6" strokeWidth="4" strokeDasharray="6 4" />
        <text x="40" y="37" fontSize="10" fontWeight="600" fill={C.brownText}>lucht</text>
      </g>
    </svg>
  );
}

function ArrowDownMarker({ x, y }) {
  return <path d={`M${x - 6} ${y} L${x} ${y + 10} L${x + 6} ${y}`} fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
}

// ─── SCHUIFKNOP LUCHTTOEVOER ───

function LuchtSchuif({ stand, onChange }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.brownText }}>
        Luchttoevoer
      </span>
      <div
        className="relative flex rounded-full border-2 p-1 cursor-pointer select-none"
        style={{ backgroundColor: C.beigeLight, borderColor: C.brownText, width: 220 }}
        onClick={() => onChange(stand === "dak" ? "gevel" : "dak")}
      >
        <div
          className="absolute top-1 bottom-1 rounded-full transition-all duration-300 shadow-md"
          style={{ width: "calc(50% - 4px)", left: stand === "dak" ? 4 : "calc(50% + 0px)", backgroundColor: C.olive }}
        />
        {["dak", "gevel"].map((s) => (
          <div
            key={s}
            className="flex-1 text-center py-2 text-sm font-bold uppercase z-10 transition-colors duration-300"
            style={{ color: stand === s ? "white" : C.brown }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RONDE 1: CLV of half-CLV? ───

const R1_KAARTJES = [
  { id: "k1", label: "Lucht en rookgas beide via gezamenlijk kanaal", col: "clv" },
  { id: "k2", label: "Alleen rookgasafvoer gemeenschappelijk", col: "half" },
  { id: "k3", label: "Luchtinlaat per woning via de gevel", col: "half" },
  { id: "k4", label: "Luchttoevoer via het dak", col: "clv" },
];

function Ronde1({ addScore, onDone }) {
  const [stand, setStand] = useState("dak");
  const [seen, setSeen] = useState({ dak: true, gevel: false });
  const [placed, setPlaced] = useState({}); // id -> kolom
  const [hint, setHint] = useState(null);

  const bothSeen = seen.dak && seen.gevel;
  const allPlaced = R1_KAARTJES.every((k) => placed[k.id]);

  const handleStand = (s) => {
    setStand(s);
    setSeen((prev) => ({ ...prev, [s]: true }));
  };

  const dropIn = (col) => (payload, point) => {
    const kaart = R1_KAARTJES.find((k) => k.id === payload);
    if (!kaart || placed[kaart.id]) return undefined;
    if (kaart.col === col) {
      setPlaced((prev) => ({ ...prev, [kaart.id]: col }));
      addScore(5, point);
      setHint(null);
      return "correct";
    }
    addScore(-5, point);
    setHint(
      col === "clv"
        ? "Hint: bij een CLV-systeem gaan lucht én rookgas via het gezamenlijke kanaal door het dak."
        : "Hint: bij een half-CLV is alléén de rookgasafvoer gemeenschappelijk; lucht komt per woning via de gevel."
    );
    return "wrong";
  };

  const kolom = (col, titel) => (
    <DropTarget id={`r1-${col}`} onDropItem={dropIn(col)} className="flex-1">
      {({ isHover, flash }) => (
        <div
          className="rounded-2xl border-2 p-3 min-h-[150px] transition-colors"
          style={{
            borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
            backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
            borderStyle: "dashed",
          }}
        >
          <div className="text-center font-bold italic text-sm mb-2" style={{ color: C.brownText }}>
            {titel}
          </div>
          <div className="flex flex-col gap-1.5">
            {R1_KAARTJES.filter((k) => placed[k.id] === col).map((k) => (
              <div
                key={k.id}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold border-2 flex items-center gap-1"
                style={{ backgroundColor: C.greenLight, borderColor: C.green, color: C.green }}
              >
                <CheckCircle className="w-3 h-3 shrink-0" />
                {k.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </DropTarget>
  );

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 1: CLV of half-CLV?
      </h2>
      <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        Zet de schuif op DAK en op GEVEL en kijk wat er met de luchtstroom gebeurt. Let ook op wat er <em>niet</em> verandert!
      </p>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-3xl items-center lg:items-start">
        <div className="w-full max-w-md">
          <div
            className="rounded-xl px-4 py-2 mb-2 text-center font-bold italic border-2"
            style={{ backgroundColor: stand === "dak" ? C.oliveLight : "#FFF0D6", borderColor: C.brownText, color: C.brownText }}
          >
            {stand === "dak" ? "Dit is een CLV-systeem" : "Dit is een half-CLV-systeem"}
          </div>
          <FlatDoorsnede stand={stand} />
        </div>
        <div className="flex flex-col gap-4 items-center lg:pt-16">
          <LuchtSchuif stand={stand} onChange={handleStand} />
          <p className="text-xs max-w-[220px] text-center italic" style={{ color: C.brown }}>
            {stand === "dak"
              ? "De lucht komt via een gezamenlijk kanaal door het dak binnen."
              : "Elke woning heeft een eigen luchtinlaat in de buitengevel."}
          </p>
          {!bothSeen && (
            <p className="text-xs font-bold" style={{ color: C.olive }}>
              Bekijk ook de andere stand →
            </p>
          )}
        </div>
      </div>

      {bothSeen && (
        <div className="w-full max-w-3xl mt-6">
          <div className="text-sm font-bold italic mb-2 text-center" style={{ color: C.brownText }}>
            Mini-opdracht: sleep elke eigenschap naar het juiste systeem
          </div>
          <div className="flex gap-4 mb-3">
            {kolom("clv", "CLV")}
            {kolom("half", "Half-CLV")}
          </div>
          {hint && (
            <p className="text-xs text-center italic mb-2 font-medium" style={{ color: C.red }}>
              {hint}
            </p>
          )}
          <div className="flex gap-2 flex-wrap justify-center">
            {R1_KAARTJES.filter((k) => !placed[k.id]).map((k) => (
              <Draggable key={k.id} payload={k.id} ghost={<DragCard label={k.label} small />}>
                <DragCard label={k.label} small />
              </Draggable>
            ))}
          </div>
          {allPlaced && (
            <div className="flex justify-center mt-4">
              <GameButton onClick={onDone} variant="green">
                Naar de controlevraag
              </GameButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RONDE 2: ONDERDELEN VAN HET CLV-SYSTEEM ───

const R2_ONDERDELEN = [
  { id: "instroming", label: "Instromingsconstructie", x: 96, y: 16, w: 150, hint: "De instromingsconstructie zit bovenaan: daar komt de lucht het dak binnen." },
  { id: "uitstroming", label: "Uitstromingsconstructie", x: 396, y: 16, w: 150, hint: "De uitstromingsconstructie zit bovenaan: daar verlaat het rookgas het dak." },
  { id: "stomp", label: "Aansluitstompen", x: 420, y: 180, w: 140, hint: "Aansluitstompen steken per verdieping door de schachtwand." },
  { id: "drukver", label: "Drukvereffeningsconstructie", x: 246, y: 332, w: 170, hint: "De drukvereffeningsconstructie zit onderaan en verbindt beide kanalen." },
  { id: "condens", label: "Condensaatafvoer + sifon", x: 420, y: 408, w: 160, hint: "De condensaatafvoer met dubbele sifon zit onderaan, richting de riolering." },
  { id: "luik", label: "Inspectieluik", x: 76, y: 408, w: 120, hint: "Het inspectieluik (min. 50x50 cm) zit onderaan in de schachtwand." },
];

function SchachtOnderdelen({ placed }) {
  const flow = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const ok = (id) => placed[id];
  const mark = (id) => (ok(id) ? C.green : C.beigeMid);

  return (
    <svg viewBox="0 0 520 470" className="w-full h-auto select-none">
      {/* dak */}
      <rect x="40" y="56" width="440" height="12" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* schacht */}
      <rect x="195" y="40" width="130" height="350" fill="#EDE4D2" stroke={C.brownText} strokeWidth="2.5" />
      <rect x="237" y="30" width="46" height="360" fill="#FBE9E5" stroke={C.brownText} strokeWidth="2" />
      {/* stromen */}
      <path d="M260 380 L260 24" fill="none" stroke={C.red} strokeWidth="5" strokeLinecap="round" style={flow} />
      <path d="M214 52 L214 380" fill="none" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" style={flow} />
      <path d="M306 52 L306 380" fill="none" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" style={flow} />

      {/* instromingsconstructie (boven, lucht) */}
      <g opacity={ok("instroming") ? 1 : 0.85}>
        <rect x="186" y="20" width="44" height="22" rx="4" fill={ok("instroming") ? C.greenLight : "white"} stroke={mark("instroming")} strokeWidth="2.5" />
        <path d="M196 26 L208 26 M196 32 L208 32" stroke={mark("instroming")} strokeWidth="2" />
      </g>
      {/* uitstromingsconstructie (boven, rookgas) */}
      <g opacity={ok("uitstroming") ? 1 : 0.85}>
        <rect x="242" y="6" width="36" height="20" rx="4" fill={ok("uitstroming") ? C.greenLight : "white"} stroke={mark("uitstroming")} strokeWidth="2.5" />
        <path d="M252 16 L260 8 L268 16" fill="none" stroke={mark("uitstroming")} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* aansluitstompen per verdieping */}
      {[140, 220, 300].map((y) => (
        <g key={y} opacity={ok("stomp") ? 1 : 0.85}>
          <rect x="325" y={y} width="40" height="22" rx="3" fill={ok("stomp") ? C.greenLight : "white"} stroke={mark("stomp")} strokeWidth="2.5" />
          <circle cx="358" cy={y + 11} r="6" fill="none" stroke={mark("stomp")} strokeWidth="2" />
        </g>
      ))}
      {/* drukvereffeningsconstructie */}
      <g opacity={ok("drukver") ? 1 : 0.85}>
        <rect x="214" y="352" width="92" height="20" rx="4" fill={ok("drukver") ? C.greenLight : "white"} stroke={mark("drukver")} strokeWidth="2.5" />
        <path d="M226 362 H294" stroke={mark("drukver")} strokeWidth="2" strokeDasharray="4 3" />
      </g>
      {/* condensaatafvoer + dubbele sifon */}
      <g opacity={ok("condens") ? 1 : 0.85}>
        <path d="M280 390 L280 412 q0 12 12 12 q12 0 12 -12 l0 -4 q0 -10 10 -10 q10 0 10 10 l0 8 q0 12 12 12 H352" fill="none" stroke={mark("condens")} strokeWidth="3.5" />
        <text x="352" y="434" fontSize="9" fontWeight="600" fill={C.brown}>riool</text>
      </g>
      {/* inspectieluik */}
      <g opacity={ok("luik") ? 1 : 0.85}>
        <rect x="160" y="340" width="36" height="36" rx="3" fill={ok("luik") ? C.greenLight : "white"} stroke={mark("luik")} strokeWidth="2.5" />
        <circle cx="190" cy="358" r="2.5" fill={mark("luik")} />
        <text x="178" y="390" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">50x50</text>
      </g>
      {/* maaiveld */}
      <line x1="30" y1="390" x2="490" y2="390" stroke={C.brownText} strokeWidth="3" />
    </svg>
  );
}

function Ronde2({ addScore, onDone }) {
  const [placed, setPlaced] = useState({});
  const [hint, setHint] = useState(null);
  const allPlaced = R2_ONDERDELEN.every((o) => placed[o.id]);

  const dropOn = (target) => (payload, point) => {
    if (placed[target.id]) return undefined;
    if (payload === target.id) {
      setPlaced((prev) => ({ ...prev, [target.id]: true }));
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    const dragged = R2_ONDERDELEN.find((o) => o.id === payload);
    addScore(-5, point);
    setHint(dragged?.hint ?? null);
    return "wrong";
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 2: De onderdelen van een CLV-systeem
      </h2>
      <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        Sleep elk label naar het juiste onderdeel in de tekening.
      </p>

      <div className="relative w-full" style={{ maxWidth: 520 }}>
        <SchachtOnderdelen placed={placed} />
        {/* dropzones als overlay (posities in % van de 520x470 viewBox) */}
        {R2_ONDERDELEN.map((o) => (
          <DropTarget
            key={o.id}
            id={`r2-${o.id}`}
            onDropItem={dropOn(o)}
            className="absolute"
            style={{
              left: `${((o.x - o.w / 2) / 520) * 100}%`,
              top: `${(o.y / 470) * 100}%`,
              width: `${(o.w / 520) * 100}%`,
              height: `${(34 / 470) * 100}%`,
            }}
          >
            {({ isHover, flash }) => (
              <div
                className="w-full h-full rounded-lg border-2 flex items-center justify-center text-[10px] font-bold text-center leading-tight px-1 transition-colors"
                style={{
                  borderStyle: placed[o.id] ? "solid" : "dashed",
                  borderColor: placed[o.id] ? C.green : flash === "wrong" ? C.red : isHover ? C.olive : C.brown,
                  backgroundColor: placed[o.id] ? C.greenLight : flash === "wrong" ? C.redLight : isHover ? C.oliveLight : "rgba(255,252,245,0.9)",
                  color: placed[o.id] ? C.green : C.brown,
                }}
              >
                {placed[o.id] ? o.label : "?"}
              </div>
            )}
          </DropTarget>
        ))}
      </div>

      {hint && (
        <p className="text-xs text-center italic mb-2 mt-1 font-medium max-w-md" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      <div className="flex gap-2 flex-wrap justify-center mt-3 max-w-2xl">
        {R2_ONDERDELEN.filter((o) => !placed[o.id]).map((o) => (
          <Draggable key={o.id} payload={o.id} ghost={<DragCard label={o.label} small />}>
            <DragCard label={o.label} small />
          </Draggable>
        ))}
      </div>

      {allPlaced && (
        <div className="flex justify-center mt-4">
          <GameButton onClick={onDone} variant="green">
            Naar de controlevraag
          </GameButton>
        </div>
      )}
    </div>
  );
}

// ─── RONDE 3: WELK TOESTEL OP WELK SYSTEEM? ───

const R3_TOESTELLEN = [
  { id: "C42", label: "C42", bak: "onderdruk" },
  { id: "C43", label: "C43", bak: "onderdruk" },
  { id: "C82", label: "C82", bak: "half" },
  { id: "C83", label: "C83", bak: "half" },
  { id: "C103", label: "C(10)3", bak: "overdruk" },
];

const R3_BAKKEN = [
  { id: "onderdruk", titel: "Onderdruk-CLV", sub: "natuurlijke trek" },
  { id: "half", titel: "Half-CLV", sub: "lucht via de gevel" },
  { id: "overdruk", titel: "Overdruk-CLV", sub: "ventilatordruk" },
];

function BakIcoon({ type }) {
  const flow = { strokeDasharray: "5 4", animation: "flowDash 0.8s linear infinite" };
  return (
    <svg viewBox="0 0 80 64" className="w-20 h-16 mx-auto">
      <rect x="30" y="8" width="20" height="48" fill="#EDE4D2" stroke={C.brownText} strokeWidth="2" />
      <path d="M40 52 L40 12" fill="none" stroke={C.red} strokeWidth="3.5" style={flow} />
      {type === "onderdruk" && <path d="M36 10 L40 2 L44 10" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" />}
      {type === "half" && (
        <>
          <path d="M8 30 L26 30" fill="none" stroke="#3B82F6" strokeWidth="3" style={flow} />
          <rect x="4" y="25" width="5" height="10" fill="#3B82F6" />
        </>
      )}
      {type === "overdruk" && (
        <>
          <circle cx="40" cy="58" r="5" fill="none" stroke={C.brownText} strokeWidth="1.5" />
          <path d="M37 58 h6 M40 55 v6" stroke={C.brownText} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

function Ronde3({ addScore, onDone }) {
  const [placed, setPlaced] = useState({}); // toestelId -> bakId
  const [hint, setHint] = useState(null);
  const allPlaced = R3_TOESTELLEN.every((t) => placed[t.id]);

  const dropIn = (bakId) => (payload, point) => {
    const toestel = R3_TOESTELLEN.find((t) => t.id === payload);
    if (!toestel || placed[toestel.id]) return undefined;
    if (toestel.bak === bakId) {
      setPlaced((prev) => ({ ...prev, [toestel.id]: bakId }));
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    addScore(-5, point);
    setHint(
      toestel.id === "C103"
        ? "Hint: C(10) is het overdruk-systeem."
        : toestel.bak === "onderdruk"
        ? "Hint: C42 en C43 horen bij het concentrische onderdruk-CLV (natuurlijke trek)."
        : "Hint: C82 en C83 halen hun lucht individueel — dat past bij half-CLV."
    );
    return "wrong";
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 3: Welk toestel op welk systeem?
      </h2>
      <p className="text-sm mb-5 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        Sleep elke toestelcodering naar het systeem waarop hij mag worden aangesloten.
      </p>

      <div className="flex gap-3 w-full max-w-3xl mb-4 flex-col sm:flex-row">
        {R3_BAKKEN.map((bak) => (
          <DropTarget key={bak.id} id={`r3-${bak.id}`} onDropItem={dropIn(bak.id)} className="flex-1">
            {({ isHover, flash }) => (
              <div
                className="rounded-2xl border-2 p-3 min-h-[190px] transition-colors"
                style={{
                  borderStyle: "dashed",
                  borderColor: flash === "wrong" ? C.red : flash === "correct" ? C.green : isHover ? C.olive : C.brownText,
                  backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
                }}
              >
                <BakIcoon type={bak.id} />
                <div className="text-center font-bold italic text-sm" style={{ color: C.brownText }}>
                  {bak.titel}
                </div>
                <div className="text-center text-[10px] mb-2" style={{ color: C.brown }}>
                  {bak.sub}
                </div>
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {R3_TOESTELLEN.filter((t) => placed[t.id] === bak.id).map((t) => (
                    <span
                      key={t.id}
                      className="rounded-lg px-2.5 py-1 text-xs font-bold border-2"
                      style={{ backgroundColor: C.greenLight, borderColor: C.green, color: C.green }}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </DropTarget>
        ))}
      </div>

      {hint && (
        <p className="text-xs text-center italic mb-2 font-medium" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      <div className="flex gap-2 flex-wrap justify-center">
        {R3_TOESTELLEN.filter((t) => !placed[t.id]).map((t) => (
          <Draggable key={t.id} payload={t.id} ghost={<DragCard label={t.label} />}>
            <DragCard label={t.label} />
          </Draggable>
        ))}
      </div>

      {allPlaced && (
        <div className="flex justify-center mt-4">
          <GameButton onClick={onDone} variant="green">
            Naar de controlevraag
          </GameButton>
        </div>
      )}
    </div>
  );
}

// ─── STARTSCHERM ───

function StartScreen({ onStart }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="py-3 px-5 text-center" style={{ backgroundColor: C.bgHeader }}>
        <span className="text-white font-bold italic text-lg">De CLV-Verkenner</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
        <div className="rounded-full p-7 border-4" style={{ backgroundColor: C.beigeLight, borderColor: C.brownText }}>
          <Building2 className="w-20 h-20" style={{ color: C.brownText }} />
        </div>
        <h1 className="text-3xl font-bold italic" style={{ color: C.brownText }}>
          De CLV-Verkenner
        </h1>
        <p className="max-w-sm text-center font-medium" style={{ color: C.brown }}>
          Ontdek hoe meerdere woningen in een flat samen één rookgasafvoer delen
        </p>
        <GameButton onClick={onStart}>Start de game</GameButton>
      </div>
    </div>
  );
}

// ─── MAIN ───

const SCREEN_ROUND = { r1: 1, r1mc: 1, r2: 2, r2mc: 2, r3: 3, r3mc: 3 };

export default function CLVVerkennerGame({ initialScreen = "start", onExit, onGameComplete }) {
  const [screen, setScreen] = useState(initialScreen);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const juice = useGameJuice();

  const addScore = useCallback(
    (pts, point) => {
      setScore((prev) => Math.max(0, Math.min(MAX_SCORE, prev + pts)));
      if (pts >= 0) juice.triggerCorrect(pts, point);
      else juice.triggerWrong(pts, point);
    },
    [juice]
  );

  const loseLife = useCallback(() => {
    setLives((prev) => Math.max(0, prev - 1));
    juice.triggerWrong();
  }, [juice]);

  const resetGame = () => {
    setScreen("start");
    setScore(0);
    setLives(5);
  };

  useEffect(() => {
    if (screen === "end") {
      juice.triggerLevelUp();
      onGameComplete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const showProgress = !["start", "intro", "end"].includes(screen);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: C.bgPage }}>
      <juice.JuiceOverlay />
      <DragProvider>
        <div
          className="max-w-[800px] w-full mx-auto flex flex-col min-h-screen shadow-lg overflow-x-hidden"
          style={{ backgroundColor: C.bgPage, animation: juice.shaking ? "shake 0.3s ease-in-out" : "none" }}
        >
          {showProgress && <ProgressBar currentRound={SCREEN_ROUND[screen] ?? 1} score={score} lives={lives} />}

          {screen === "start" && <StartScreen onStart={() => setScreen("intro")} />}

          {screen === "intro" && (
            <IntroScreen
              title="Missie: het CLV-systeem"
              text={'"In een flat delen meerdere woningen dezelfde leidingen voor rookgas en lucht: een CLV-systeem. Een fout treft niet alleen jouw woning, maar ook die van de buren. In deze missie leer je hoe het werkt."'}
              buttonText="Aan de slag"
              onNext={() => setScreen("r1")}
            />
          )}

          {screen === "r1" && <Ronde1 addScore={addScore} onDone={() => setScreen("r1mc")} />}
          {screen === "r1mc" && (
            <div className="flex-1 flex flex-col items-center p-6">
              <StepBanner step={2} />
              <MCControle pool={POOL_R1} addScore={addScore} loseLife={loseLife} onComplete={() => setScreen("r2")} />
            </div>
          )}

          {screen === "r2" && <Ronde2 addScore={addScore} onDone={() => setScreen("r2mc")} />}
          {screen === "r2mc" && (
            <div className="flex-1 flex flex-col items-center p-6">
              <StepBanner step={2} />
              <MCControle pool={POOL_R2} addScore={addScore} loseLife={loseLife} onComplete={() => setScreen("r3")} />
            </div>
          )}

          {screen === "r3" && <Ronde3 addScore={addScore} onDone={() => setScreen("r3mc")} />}
          {screen === "r3mc" && (
            <div className="flex-1 flex flex-col items-center p-6">
              <StepBanner step={2} />
              <MCControle pool={POOL_R3} addScore={addScore} loseLife={loseLife} onComplete={() => setScreen("end")} lastRound />
            </div>
          )}

          {screen === "end" && (
            <EndScreen
              score={score}
              maxScore={MAX_SCORE}
              lives={lives}
              text="Je herkent nu CLV-systemen. In De CLV-Monteur ga je er ook echt mee aan de slag!"
              onRestart={resetGame}
              onExit={onExit}
            />
          )}
        </div>
      </DragProvider>
    </div>
  );
}
