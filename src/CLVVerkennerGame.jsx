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

// Tekening volgens de NEN-normfiguren (dakdoorvoer + onderzijde CLV) die ook
// op het examen worden gebruikt. Elk dropvlak heeft een verwijslijn (leader)
// naar het bijbehorende onderdeel in de tekening.
const R2_W = 560;
const R2_H = 500;
const R2_ZONE = { w: 165, h: 34 };

const R2_ONDERDELEN = [
  { id: "instroming", label: "Instromingsconstructie", side: "left", zone: { x: 5, y: 63 }, anchor: { x: 254, y: 103 }, hint: "De instromingsconstructie zit bovenaan: via het rooster onder de kap komt de lucht binnen." },
  { id: "uitstroming", label: "Uitstromingsconstructie", side: "right", zone: { x: 390, y: 30 }, anchor: { x: 298, y: 60 }, hint: "De uitstromingsconstructie zit bovenaan: daar verlaat het rookgas het dak." },
  { id: "stomp", label: "Aansluitstompen", side: "right", zone: { x: 390, y: 253 }, anchor: { x: 356, y: 269 }, hint: "Aansluitstompen steken per verdieping door de schachtwand." },
  { id: "luik", label: "Inspectieluik", side: "right", zone: { x: 390, y: 373 }, anchor: { x: 334, y: 390 }, hint: "Het (bouwkundig) inspectieluik, min. 50x50 cm en brandwerend, zit onderaan in de schachtwand." },
  { id: "condens", label: "Condensaatafvoer + sifon", side: "left", zone: { x: 5, y: 405 }, anchor: { x: 276, y: 426 }, hint: "De condensaatafvoer met sifon zit onderaan, en voert via een tweede sifon met open verbinding af naar de riolering." },
  { id: "drukver", label: "Drukvereffeningsconstructie", side: "left", zone: { x: 5, y: 443 }, anchor: { x: 252, y: 456 }, hint: "De drukvereffeningsconstructie zit helemaal onderaan en verbindt het lucht- en rookgaskanaal." },
];

function SchachtOnderdelen({ placed }) {
  const flowUp = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };
  const ok = (id) => placed[id];
  const mark = (id) => (ok(id) ? C.green : C.brownText);
  const fillOk = (id) => (ok(id) ? C.greenLight : "white");

  return (
    <svg viewBox={`0 0 ${R2_W} ${R2_H}`} className="w-full h-auto select-none">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
        <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill={C.brownText} />
        </pattern>
      </defs>

      {/* verwijslijnen van dropvlak naar onderdeel */}
      {R2_ONDERDELEN.map((o) => {
        const x1 = o.side === "left" ? o.zone.x + R2_ZONE.w : o.zone.x;
        const y1 = o.zone.y + R2_ZONE.h / 2;
        return (
          <g key={`lijn-${o.id}`}>
            <line x1={x1} y1={y1} x2={o.anchor.x} y2={o.anchor.y} stroke={ok(o.id) ? C.green : C.brown} strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx={o.anchor.x} cy={o.anchor.y} r="3.5" fill={ok(o.id) ? C.green : C.brown} />
          </g>
        );
      })}

      {/* dakvlak (gearceerd, doorbroken door de schacht) */}
      <rect x="50" y="150" width="190" height="18" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />
      <rect x="320" y="150" width="190" height="18" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />

      {/* vloer onderaan (gearceerd, met sparing voor de rioolaansluiting) */}
      <rect x="50" y="470" width="398" height="14" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />
      <rect x="478" y="470" width="32" height="14" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />

      {/* schachtwanden */}
      <rect x="240" y="168" width="10" height="294" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="310" y="168" width="10" height="294" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />

      {/* binnenste rookgaskanaal (RGAB) */}
      <line x1="270" y1="88" x2="270" y2="395" stroke={C.brownText} strokeWidth="2" />
      <line x1="290" y1="88" x2="290" y2="395" stroke={C.brownText} strokeWidth="2" />
      {/* opvangbak onderaan het rookgaskanaal */}
      <path d="M268 395 H292 V404 Q292 412 280 412 Q268 412 268 404 Z" fill="white" stroke={C.brownText} strokeWidth="2" />

      {/* DAKDOORVOER (NEN-figuur): flens, taps lichaam, rooster, kap */}
      <g>
        {/* flens op het dak met bouten */}
        <rect x="250" y="143" width="60" height="7" fill="white" stroke={C.brownText} strokeWidth="2" />
        <rect x="253" y="138" width="7" height="5" fill={C.brownText} />
        <rect x="300" y="138" width="7" height="5" fill={C.brownText} />
        {/* taps toelopend lichaam */}
        <polygon points="260,143 300,143 296,116 264,116" fill="white" stroke={C.brownText} strokeWidth="2" />
        {/* geperforeerd rooster = instroming */}
        <rect x="258" y="94" width="44" height="22" fill="url(#dots)" stroke={mark("instroming")} strokeWidth={ok("instroming") ? 3 : 2} />
        {ok("instroming") && <rect x="258" y="94" width="44" height="22" fill={C.green} opacity="0.18" />}
        {/* kapplaat + uitstroomstomp = uitstroming */}
        <rect x="252" y="86" width="56" height="8" fill={fillOk("uitstroming")} stroke={mark("uitstroming")} strokeWidth="2" />
        <rect x="272" y="72" width="16" height="14" fill={fillOk("uitstroming")} stroke={mark("uitstroming")} strokeWidth="2" />
        {/* rookgas naar buiten (drie pijlen) */}
        <g stroke={C.red} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M280 70 V52 M275 57 L280 51 L285 57" />
          <path d="M273 70 L264 58 M264 65 L263 56 L271 59" />
          <path d="M287 70 L296 58 M289 59 L297 56 L296 65" />
        </g>
        {/* lucht naar binnen via het rooster (gestippelde pijlen) */}
        <g stroke="#3B82F6" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 3">
          <path d="M238 92 L256 102" />
          <path d="M322 92 L304 102" />
        </g>
      </g>

      {/* luchtstroom omlaag in de ringspleet */}
      <path d="M259 180 L259 415" fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" style={flowDown} />
      <path d="M254 408 L259 418 L264 408" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M301 180 L301 415" fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" style={flowDown} />
      <path d="M296 408 L301 418 L306 408" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* rookgasstroom omhoog in het binnenkanaal */}
      <path d="M280 388 L280 100" fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={flowUp} />

      {/* AANSLUITSTOMPEN per verdieping (rechts door de schachtwand) */}
      {[200, 260, 320].map((y) => (
        <g key={y}>
          <rect x="316" y={y} width="38" height="18" fill={fillOk("stomp")} stroke={mark("stomp")} strokeWidth={ok("stomp") ? 3 : 2} />
          <ellipse cx="354" cy={y + 9} rx="4" ry="9" fill="white" stroke={mark("stomp")} strokeWidth="2" />
        </g>
      ))}

      {/* INSPECTIELUIK (bouwkundig, in de rechterwand onderaan) */}
      <g>
        <rect x="312" y="375" width="18" height="30" fill={fillOk("luik")} stroke={mark("luik")} strokeWidth={ok("luik") ? 3 : 2} />
        <line x1="316" y1="380" x2="326" y2="380" stroke={mark("luik")} strokeWidth="1.5" />
        <line x1="316" y1="400" x2="326" y2="400" stroke={mark("luik")} strokeWidth="1.5" />
      </g>

      {/* CONDENSAATAFVOER: sifon binnen, open verbinding, tweede sifon, naar riool */}
      <g fill="none" stroke={mark("condens")} strokeWidth={ok("condens") ? 3 : 2.5}>
        {/* afvoer uit de opvangbak + eerste sifon */}
        <path d="M280 412 V418 C280 432 296 432 296 418 V440 H346" />
        {/* open verbinding: trechter met onderbreking */}
        <path d="M352 433 H364 M354 436 L358 441 L362 436" strokeDasharray="none" />
        <path d="M358 441 V443 H378" />
        {/* tweede sifon (regen- en condenswater) */}
        <path d="M378 443 C378 458 398 458 398 443 H462 V470" />
      </g>
      <text x="462" y="495" fontSize="10" fontWeight="600" fill={C.brown} textAnchor="middle">riool</text>

      {/* DRUKVEREFFENINGSCONSTRUCTIE: geperforeerde bodemplaat */}
      <g>
        <rect x="250" y="448" width="60" height="14" fill={fillOk("drukver")} stroke={mark("drukver")} strokeWidth={ok("drukver") ? 3 : 2} />
        {[262, 280, 298].map((cx) => (
          <circle key={cx} cx={cx} cy="455" r="4" fill="none" stroke={mark("drukver")} strokeWidth="1.8" />
        ))}
      </g>
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

      <div className="relative w-full" style={{ maxWidth: R2_W }}>
        <SchachtOnderdelen placed={placed} />
        {/* dropvlakken als overlay, elk met een verwijslijn (in de SVG) naar het onderdeel */}
        {R2_ONDERDELEN.map((o) => (
          <DropTarget
            key={o.id}
            id={`r2-${o.id}`}
            onDropItem={dropOn(o)}
            className="absolute"
            style={{
              left: `${(o.zone.x / R2_W) * 100}%`,
              top: `${(o.zone.y / R2_H) * 100}%`,
              width: `${(R2_ZONE.w / R2_W) * 100}%`,
              height: `${(R2_ZONE.h / R2_H) * 100}%`,
            }}
          >
            {({ isHover, flash }) => (
              <div
                className="w-full h-full rounded-lg border-2 flex items-center justify-center text-[10px] font-bold text-center leading-tight px-1 transition-colors"
                style={{
                  borderStyle: placed[o.id] ? "solid" : "dashed",
                  borderColor: placed[o.id] ? C.green : flash === "wrong" ? C.red : isHover ? C.olive : C.brown,
                  backgroundColor: placed[o.id] ? C.greenLight : flash === "wrong" ? C.redLight : isHover ? C.oliveLight : "rgba(255,252,245,0.95)",
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
