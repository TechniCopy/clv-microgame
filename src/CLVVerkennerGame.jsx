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
  useEersteFoutVrij,
  useAandacht,
  DrainageTrein,
  playSound,
} from "./shared.jsx";

const MAX_SCORE = 105;

// ─── VRAGENPOOLS ───

const POOL_R1 = [
  {
    question: "Wat is het verschil tussen een CLV-systeem en een half-CLV-systeem?",
    options: [
      "Bij een half-CLV-systeem is alleen de rookgasafvoer gemeenschappelijk; de lucht komt individueel via de gevel.",
      "Bij een CLV-systeem is alleen de rookgasafvoer gemeenschappelijk.",
      "Een half-CLV bedient maar de helft van de verdiepingen.",
      "Er is geen verschil, het zijn twee namen voor hetzelfde.",
    ],
    correct: 0,
    feedbackCorrect: "Precies! Bij beide is de rookgasafvoer gemeenschappelijk. Het verschil zit in de lucht: CLV via het dak, half-CLV individueel, bijvoorbeeld via de gevel (NPR 3378-40 en NPR 3378-41).",
    feedbackWrong: "Kijk terug naar de animatie: bij beide systemen ging het rookgas via hetzelfde kanaal. Alleen de luchttoevoer verschilde.",
    aandacht: "CLV en half-CLV verschillen alleen in de luchttoevoer, niet in de rookgasafvoer",
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
    feedbackWrong: "Bij half-CLV is er geen gezamenlijk luchtkanaal. Elk toestel haalt zelf lucht, via de gevel.",
    aandacht: "Bij half-CLV haalt elk toestel zelf lucht via de gevel",
  },
  {
    question: "Welk onderdeel is bij zowel een CLV- als een half-CLV-systeem gemeenschappelijk?",
    options: ["De rookgasafvoer.", "De luchttoevoer.", "De condensaatafvoer per woning.", "Geen enkel onderdeel."],
    correct: 0,
    feedbackCorrect: "Juist! De gemeenschappelijke rookgasafvoer is de kern van elk CLV-systeem — met of zonder gezamenlijke luchttoevoer.",
    feedbackWrong: "Denk aan de schuif-animatie: wat je ook deed met de luchttoevoer, het rookgas bleef via hetzelfde kanaal gaan.",
    aandacht: "De rookgasafvoer is bij elk CLV-systeem gemeenschappelijk",
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
    feedbackCorrect: "Klopt! De terugslagklep voorkomt rookgas-recirculatie (verplicht bij overdruk volgens de voorschriften CLV C(10)-toepassingen, bijlage D) — daarover leer je meer in game 2.",
    feedbackWrong: "De terugslagklep houdt rookgas van andere toestellen tegen. Zonder klep kan rookgas terugstromen en dat is levensgevaarlijk.",
    aandacht: "De terugslagklep voorkomt dat rookgas van andere toestellen terugstroomt",
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
    aandacht: "De drukvereffeningsconstructie houdt de druk tussen lucht- en rookgaskanaal in balans",
  },
  {
    question: "Waarom heeft de condensaatafvoer van een CLV-systeem een dubbele sifon nodig?",
    options: [
      "De eerste sifon houdt rookgas tegen, de tweede is een stankafsluiter tegen rioolgas.",
      "1 sifon kan al het condenswater niet aan.",
      "De tweede sifon is reserve voor als de eerste verstopt raakt.",
      "Dat is alleen nodig bij half-CLV-systemen.",
    ],
    correct: 0,
    feedbackCorrect: "Precies! Twee sifons met een open verbinding ertussen: een tegen rookgas, een tegen rioolgas (aansluiting op de riolering volgens NEN 3287).",
    feedbackWrong: "Twee gevaren: rookgas uit het systeem en rioolgas uit de riolering. Elke sifon houdt er een tegen.",
    aandacht: "Twee sifons: de eerste houdt rookgas tegen, de tweede rioolgas",
  },
];

const POOL_R3 = [
  {
    question: "Hoeveel toestellen mogen er per verdieping worden aangesloten op een concentrisch C(10) overdruk-CLV-systeem?",
    options: ["2 toestellen", "1 toestel", "3 toestellen", "4 toestellen"],
    correct: 0,
    feedbackCorrect: "Correct! Bij een C(10) overdruk-CLV mogen maximaal 2 toestellen per verdieping worden aangesloten (voorschriften CLV C(10)-toepassingen, hoofdstuk 8).",
    feedbackWrong: "Volgens de voorschriften voor C(10)-toepassingen (hoofdstuk 8, Dimensionering) mogen er maximaal 2 toestellen per verdieping op een overdruk-CLV worden aangesloten.",
    aandacht: "Bij een C(10) overdruk-CLV: maximaal 2 toestellen per verdieping",
  },
  {
    question: "Een concentrisch CLV-systeem werkt op natuurlijke trek. Welk type toestel mag hierop worden aangesloten?",
    options: ["C43 toestel", "C53 toestel", "C33 toestel", "C83 toestel"],
    correct: 0,
    feedbackCorrect: "Juist! C42 en C43 zijn de types voor een concentrisch onderdruk-CLV (NPR 3378-40).",
    feedbackWrong: "Voor onderdruk-CLV (natuurlijke trek) gelden C42 en C43 (NPR 3378-40). C83 hoort bij half-CLV (NPR 3378-41), C33 bij een individuele dakdoorvoer.",
    aandacht: "C42 en C43 horen bij het concentrische onderdruk-CLV",
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
    feedbackCorrect: "Klopt! Een 3 = ventilator in de luchttoevoer, een 2 = ventilator in de rookgasafvoer (toestelaanduidingen volgens NPR 3378-80). Alleen gesloten toestellen met ventilator mogen op een CLV.",
    feedbackWrong: "Het laatste cijfer gaat over de ventilator: 2 = in de rookgasafvoer, 3 = in de luchttoevoer.",
    aandacht: "Laatste cijfer van de toestelcode: 2 = ventilator in de rookgasafvoer, 3 = in de luchttoevoer",
  },
];

// ─── SVG: FLAT-DOORSNEDE MET SCHACHT (ronde 1) ───

function FlatDoorsnede({ stand }) {
  const isDak = stand === "dak";
  const flowUp = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };

  // Indeling volgens de NEN-figuur: schacht links, cv-ketels in het midden,
  // gevel met luchttoevoerroosters rechts. Per woning lopen twee leidingen
  // van de ketel omhoog naar het plafond: rookgas naar links de schacht in,
  // lucht naar rechts vanaf het gevelrooster (half-CLV).
  const woningen = [110, 216, 321]; // bovenkant (plafond) van elke woning

  // leiding als omlijnde buis met gekleurde, bewegende stroom erin
  const Pipe = ({ d, color, anim }) => (
    <g>
      <path d={d} fill="none" stroke={C.brownText} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="white" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={anim} />
    </g>
  );

  return (
    <svg viewBox="0 0 520 470" className="w-full h-auto select-none">
      <defs>
        <pattern id="hatchA" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
        <pattern id="dotsA" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill={C.brownText} />
        </pattern>
      </defs>

      {/* maaiveld */}
      <rect x="20" y="424" width="440" height="14" fill="url(#hatchA)" stroke={C.brownText} strokeWidth="2" />
      {/* dak (doorbroken door de schacht) */}
      <rect x="36" y="96" width="49" height="14" fill="url(#hatchA)" stroke={C.brownText} strokeWidth="2" />
      <rect x="155" y="96" width="239" height="14" fill="url(#hatchA)" stroke={C.brownText} strokeWidth="2" />
      {/* gevel rechts */}
      <rect x="380" y="110" width="14" height="314" fill="url(#hatchA)" stroke={C.brownText} strokeWidth="2" />
      {/* verdiepingsvloeren (tussen schacht en gevel) */}
      {[205, 310].map((y) => (
        <rect key={y} x="155" y={y} width="225" height="11" fill="url(#hatchA)" stroke={C.brownText} strokeWidth="1.5" />
      ))}

      {/* schachtwanden links */}
      <rect x="85" y="96" width="10" height="328" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="145" y="96" width="10" height="328" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* binnenste rookgaskanaal */}
      <line x1="110" y1="54" x2="110" y2="412" stroke={C.brownText} strokeWidth="2" />
      <line x1="130" y1="54" x2="130" y2="412" stroke={C.brownText} strokeWidth="2" />
      {/* drukvereffeningsopeningen onderin (zoals in de normfiguur) */}
      {[104, 120, 136].map((cx) => (
        <circle key={cx} cx={cx} cy="417" r="3.5" fill="none" stroke={C.brownText} strokeWidth="1.5" />
      ))}

      {/* dakdoorvoer (NEN): flens, taps lichaam, rooster, kap met uitstroomstomp */}
      <rect x="90" y="90" width="60" height="6" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="93" y="85" width="7" height="5" fill={C.brownText} />
      <rect x="140" y="85" width="7" height="5" fill={C.brownText} />
      <polygon points="100,90 140,90 136,66 104,66" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="98" y="48" width="44" height="18" fill="url(#dotsA)" stroke={C.brownText} strokeWidth="2" />
      <rect x="92" y="40" width="56" height="8" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="112" y="26" width="16" height="14" fill="white" stroke={C.brownText} strokeWidth="2" />
      {/* rookgas naar buiten */}
      <g stroke={C.red} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M120 24 V8 M115 13 L120 7 L125 13" />
        <path d="M113 24 L104 12 M104 19 L103 10 L111 13" />
        <path d="M127 24 L136 12 M129 13 L137 10 L136 19" />
      </g>

      {/* rookgasstroom omhoog in het binnenkanaal */}
      <path d="M120 408 L120 56" fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={flowUp} />

      {/* luchttoevoer in de schacht: alleen bij CLV (dak-stand) */}
      {isDak ? (
        <>
          <g stroke="#3B82F6" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 3">
            <path d="M76 46 L96 55" />
            <path d="M164 46 L144 55" />
          </g>
          <path d="M101 64 L101 408" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
          <path d="M139 64 L139 408" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
        </>
      ) : (
        <text x="101" y="250" fontSize="8" fill={C.brown} transform="rotate(-90 101 250)" textAnchor="middle" fontStyle="italic">
          niet in gebruik
        </text>
      )}

      {/* per woning: cv-ketel met leidingen langs het plafond */}
      {woningen.map((top, i) => {
        const yC = top + 16; // hoogte van de leidingen onder het plafond
        const kt = top + 46; // bovenkant ketel
        return (
          <g key={i}>
            {/* leidingstubs op de ketel */}
            <rect x="262" y={kt - 8} width="12" height="8" fill="white" stroke={C.brownText} strokeWidth="1.5" />
            <rect x="290" y={kt - 8} width="12" height="8" fill="white" stroke={C.brownText} strokeWidth="1.5" />
            {/* rookgasleiding: van ketel omhoog en langs het plafond naar de schacht */}
            <Pipe d={`M268 ${kt - 6} L268 ${yC} L130 ${yC}`} color={C.red} anim={flowUp} />
            {/* luchttoevoerleiding */}
            {isDak ? (
              /* CLV: lucht uit de ringspleet van de schacht */
              <Pipe d={`M145 ${yC + 16} L296 ${yC + 16} L296 ${kt - 6}`} color="#3B82F6" anim={flowDown} />
            ) : (
              <>
                {/* half-CLV: lucht via het rooster hoog in de gevel */}
                <Pipe d={`M382 ${yC} L296 ${yC} L296 ${kt - 6}`} color="#3B82F6" anim={flowDown} />
                {/* luchttoevoerrooster in de gevel */}
                <rect x="376" y={yC - 11} width="20" height="22" fill="white" stroke={C.brownText} strokeWidth="2" />
                {[yC - 5, yC, yC + 5].map((ly) => (
                  <line key={ly} x1="379" y1={ly} x2="393" y2={ly} stroke={C.brownText} strokeWidth="1.2" />
                ))}
                {/* buitenlucht naar binnen */}
                <path d={`M418 ${yC} L400 ${yC} M406 ${yC - 5} L399 ${yC} L406 ${yC + 5}`} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
            {/* cv-ketel */}
            <rect x="250" y={kt} width="64" height="56" fill="white" stroke={C.brownText} strokeWidth="2" />
            <rect x="258" y={kt + 6} width="26" height="10" fill="white" stroke={C.brownText} strokeWidth="1.2" />
            <text x="271" y={kt + 14} fontSize="6.5" fontWeight="600" fill={C.brownText} textAnchor="middle">type C..</text>
            <circle cx="282" cy={kt + 32} r="9" fill="none" stroke={C.red} strokeWidth="1.8" />
            <path d={`M278 ${kt + 35} q4 -10 8 0 q-4 6 -8 0`} fill={C.red} opacity="0.7" />
            <text x="282" y={kt + 52} fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">CV-KETEL</text>
          </g>
        );
      })}

      {/* label bij het bovenste gevelrooster (half-CLV) */}
      {!isDak && (
        <>
          <text x="445" y="92" fontSize="8" fontWeight="600" fill={C.brownText} textAnchor="middle">luchttoevoer-</text>
          <text x="445" y="102" fontSize="8" fontWeight="600" fill={C.brownText} textAnchor="middle">rooster</text>
          <line x1="436" y1="106" x2="400" y2="119" stroke={C.brownText} strokeWidth="1" />
        </>
      )}

      {/* legenda (rechts naast het gebouw) */}
      <g transform="translate(424, 250)">
        <rect x="0" y="0" width="84" height="40" fill="white" stroke={C.brownText} strokeWidth="1.5" opacity="0.95" />
        <line x1="8" y1="13" x2="26" y2="13" stroke={C.red} strokeWidth="3" strokeDasharray="5 4" />
        <text x="31" y="17" fontSize="9" fontWeight="600" fill={C.brownText}>rookgas</text>
        <line x1="8" y1="28" x2="26" y2="28" stroke="#3B82F6" strokeWidth="2.5" strokeDasharray="4 3" />
        <text x="31" y="32" fontSize="9" fontWeight="600" fill={C.brownText}>lucht</text>
      </g>
    </svg>
  );
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
  { id: "k1", label: "Lucht en rookgas beide via gezamenlijk kanaal", col: "clv", aandacht: "Bij CLV gaan lucht en rookgas allebei via het gezamenlijke kanaal" },
  { id: "k2", label: "Alleen rookgasafvoer gemeenschappelijk", col: "half", aandacht: "Bij half-CLV is alleen de rookgasafvoer gemeenschappelijk" },
  { id: "k3", label: "Luchtinlaat per woning via de gevel", col: "half", aandacht: "Bij half-CLV komt de lucht per woning via de gevel" },
  { id: "k4", label: "Luchttoevoer via het dak", col: "clv", aandacht: "Bij CLV komt de luchttoevoer via het dak" },
];

function Ronde1({ addScore, onDone, noteer }) {
  const [stand, setStand] = useState("dak");
  const [seen, setSeen] = useState({ dak: true, gevel: false });
  const [placed, setPlaced] = useState({}); // id -> kolom
  const [hint, setHint] = useState(null);
  const gratisFout = useEersteFoutVrij();

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
    noteer(kaart.aandacht);
    const uitleg =
      col === "clv"
        ? "Bij CLV gaan lucht en rookgas samen door het dak."
        : "Bij half-CLV is alleen het rookgas gedeeld; de lucht komt apart via de gevel.";
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee — probeer opnieuw)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
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
  { id: "instroming", label: "Instromingsconstructie", side: "left", zone: { x: 5, y: 63 }, anchor: { x: 254, y: 103 }, hint: "De instromingsconstructie zit bovenaan: via het rooster onder de kap komt de lucht binnen.", aandacht: "De instromingsconstructie zit bovenaan: daar komt de lucht binnen" },
  { id: "uitstroming", label: "Uitstromingsconstructie", side: "right", zone: { x: 390, y: 30 }, anchor: { x: 298, y: 60 }, hint: "De uitstromingsconstructie zit bovenaan: daar verlaat het rookgas het dak.", aandacht: "De uitstromingsconstructie zit bovenaan: daar gaat het rookgas naar buiten" },
  { id: "stomp", label: "Aansluitstompen", side: "right", zone: { x: 390, y: 253 }, anchor: { x: 356, y: 269 }, hint: "Aansluitstompen steken per verdieping door de schachtwand.", aandacht: "De aansluitstompen steken per verdieping door de schachtwand" },
  { id: "luik", label: "Inspectieluik", side: "right", zone: { x: 390, y: 373 }, anchor: { x: 334, y: 390 }, hint: "Het (bouwkundig) inspectieluik, min. 50x50 cm en brandwerend, zit onderaan in de schachtwand.", aandacht: "Het inspectieluik zit onderin de schachtwand, minimaal 50x50 cm" },
  { id: "condens", label: "Condensaatafvoer + sifon", side: "left", zone: { x: 5, y: 405 }, anchor: { x: 357, y: 450 }, hint: "De condensaatafvoer met sifon zit onderaan, en voert via een tweede sifon met open verbinding af naar de riolering.", aandacht: "De condensaatafvoer met sifons zit onderaan en voert af naar het riool" },
  { id: "drukver", label: "Drukvereffeningsconstructie", side: "left", zone: { x: 5, y: 443 }, anchor: { x: 271, y: 463 }, hint: "De drukvereffeningsconstructie zit helemaal onderaan en verbindt het lucht- en rookgaskanaal.", aandacht: "De drukvereffeningsconstructie zit onderaan en verbindt beide kanalen" },
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
        {/* verticale houtnerf voor de schachtwanden */}
        <pattern id="grain" width="6" height="12" patternUnits="userSpaceOnUse">
          <rect width="6" height="12" fill={C.beigeMid} />
          <line x1="1.5" y1="0" x2="1.5" y2="12" stroke={C.brown} strokeWidth="0.7" opacity="0.45" />
          <line x1="4" y1="0" x2="4" y2="12" stroke={C.brown} strokeWidth="0.5" opacity="0.3" />
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
      <rect x="50" y="150" width="184" height="18" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />
      <rect x="326" y="150" width="184" height="18" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />

      {/* vloer onderaan (gearceerd, met sparing voor de rioolaansluiting) */}
      <rect x="50" y="470" width="398" height="14" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />
      <rect x="478" y="470" width="32" height="14" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />

      {/* schachtwanden met houtnerf (van het dak tot op de vloer) */}
      <rect x="234" y="150" width="16" height="320" fill="url(#grain)" stroke={C.brownText} strokeWidth="2" />
      <rect x="310" y="150" width="16" height="320" fill="url(#grain)" stroke={C.brownText} strokeWidth="2" />
      {/* dak dicht rond de pijp: deksegmenten tussen schachtwand en doorvoer */}
      <rect x="250" y="150" width="14" height="18" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />
      <rect x="296" y="150" width="14" height="18" fill="url(#hatch)" stroke={C.brownText} strokeWidth="2" />

      {/* concentrische pijp: buitenwand (264/296) loopt door tot aan de drukvereffening onderin */}
      <line x1="264" y1="120" x2="264" y2="456" stroke={C.brownText} strokeWidth="2" />
      <line x1="296" y1="120" x2="296" y2="456" stroke={C.brownText} strokeWidth="2" />
      <line x1="272" y1="106" x2="272" y2="414" stroke={C.brownText} strokeWidth="2" />
      <line x1="288" y1="106" x2="288" y2="414" stroke={C.brownText} strokeWidth="2" />
      {/* klein toegangsluikje op het kanaal zelf, op dezelfde hoogte als het inspectieluik in de wand */}
      <rect x="290" y="378" width="18" height="24" rx="6" fill="white" stroke={C.brownText} strokeWidth="2" />
      <line x1="295" y1="385" x2="303" y2="385" stroke={C.brownText} strokeWidth="1.5" />
      <line x1="295" y1="395" x2="303" y2="395" stroke={C.brownText} strokeWidth="1.5" />
      {/* opvangbak in het kanaal, met conische bodem; hierop is de condensafvoer aangesloten */}
      <path d="M264 408 L277 424 H283 L296 408" fill="white" stroke={C.brownText} strokeWidth="2" strokeLinejoin="round" />

      {/* DAKDOORVOER: de concentrische pijp steekt door het dak en eindigt in de kap */}
      <g>
        {/* loodslab/kraag op het dak, rond de pijp */}
        <rect x="254" y="144" width="52" height="8" fill="white" stroke={C.brownText} strokeWidth="2" />
        <rect x="257" y="140" width="5" height="4" fill={C.brownText} />
        <rect x="298" y="140" width="5" height="4" fill={C.brownText} />
        {/* taps lichaam: van de pijp naar de bredere kap */}
        <polygon points="264,120 296,120 306,104 254,104" fill="white" stroke={C.brownText} strokeWidth="2" />
        {/* geperforeerd rooster = instroming (luchtinlaat onder de kap) */}
        <rect x="256" y="92" width="48" height="12" fill="url(#dots)" stroke={mark("instroming")} strokeWidth={ok("instroming") ? 3 : 2} />
        {ok("instroming") && <rect x="256" y="92" width="48" height="12" fill={C.green} opacity="0.18" />}
        {/* kapplaat + uitstroomstomp = uitstroming */}
        <rect x="248" y="82" width="64" height="10" fill={fillOk("uitstroming")} stroke={mark("uitstroming")} strokeWidth="2" />
        <rect x="272" y="68" width="16" height="14" fill={fillOk("uitstroming")} stroke={mark("uitstroming")} strokeWidth="2" />
        {/* rookgas naar buiten (drie pijlen) */}
        <g stroke={C.red} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M280 66 V48 M275 53 L280 47 L285 53" />
          <path d="M273 66 L264 54 M264 61 L263 52 L271 55" />
          <path d="M287 66 L296 54 M289 55 L297 52 L296 61" />
        </g>
        {/* lucht naar binnen via het rooster (gestippelde pijlen) */}
        <g stroke="#3B82F6" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 3">
          <path d="M242 86 L256 98" />
          <path d="M318 86 L304 98" />
        </g>
      </g>

      {/* concentrische stroom: rookgas (rood) in het hart, lucht (blauw) in de ringspleet */}
      <path d="M268 124 L268 370" fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" style={flowDown} />
      <path d="M263 364 L268 373 L273 364" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M292 124 L292 370" fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" style={flowDown} />
      <path d="M287 364 L292 373 L297 364" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M280 402 L280 80" fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={flowUp} />

      {/* AANSLUITSTOMPEN per verdieping: concentrische aansluiting (rood rookgas + blauw lucht) */}
      {[200, 260, 320].map((y) => (
        <g key={y}>
          {/* flens/connector door de schachtwand */}
          <rect x="306" y={y - 10} width="22" height="20" fill={fillOk("stomp")} stroke={mark("stomp")} strokeWidth={ok("stomp") ? 3 : 2} />
          {/* concentrische stomp naar het toestel toe */}
          <rect x="326" y={y - 9} width="48" height="18" rx="3" fill="white" stroke={mark("stomp")} strokeWidth={ok("stomp") ? 2.5 : 1.5} />
          {/* lucht (blauw) buitenom, rookgas (rood) in het hart */}
          <line x1="330" y1={y - 4.5} x2="372" y2={y - 4.5} stroke="#3B82F6" strokeWidth="1.6" strokeDasharray="5 4" />
          <line x1="330" y1={y + 4.5} x2="372" y2={y + 4.5} stroke="#3B82F6" strokeWidth="1.6" strokeDasharray="5 4" />
          <line x1="312" y1={y} x2="372" y2={y} stroke={C.red} strokeWidth="2.2" strokeDasharray="6 4" />
        </g>
      ))}

      {/* INSPECTIELUIK (bouwkundig, in de rechterwand onderaan) */}
      <g>
        <rect x="310" y="375" width="18" height="30" fill={fillOk("luik")} stroke={mark("luik")} strokeWidth={ok("luik") ? 3 : 2} />
        <line x1="314" y1="380" x2="324" y2="380" stroke={mark("luik")} strokeWidth="1.5" />
        <line x1="314" y1="400" x2="324" y2="400" stroke={mark("luik")} strokeWidth="1.5" />
      </g>

      {/* CONDENSAFVOER (NPR 3378-40/41): trechter -> laag door de wand -> sifon 1 -> open verbinding -> sifon 2 -> riool */}
      {/* afvoer uit de trechter: kort omlaag, bocht en laag door de schachtwand naar de sifons */}
      <path d="M280 424 V434 H350" fill="none" stroke={mark("condens")} strokeWidth={ok("condens") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <DrainageTrein x={350} y={434} s={1.2} stroke={mark("condens")} strokeWidth={ok("condens") ? 2.4 : 2} riool={false} />
      {/* na sifon 2: omhoog, over de vloer en met een OPEN uiteinde in de vloersparing (NEN 3287) */}
      <path
        d="M394 440 V426 H466 V474"
        fill="none"
        stroke={mark("condens")}
        strokeWidth={ok("condens") ? 3 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="452" y="492" fontSize="10" fontWeight="600" fill={C.brown} textAnchor="middle">riool</text>

      {/* DRUKVEREFFENINGSCONSTRUCTIE: geperforeerde strook onderin het kanaal, tussen de buitenwanden */}
      <g>
        <rect x="264" y="456" width="32" height="14" fill={fillOk("drukver")} stroke={mark("drukver")} strokeWidth={ok("drukver") ? 3 : 2} />
        {[271, 280, 289].map((cx) => (
          <circle key={cx} cx={cx} cy="463" r="3.5" fill="none" stroke={mark("drukver")} strokeWidth="1.8" />
        ))}
      </g>
    </svg>
  );
}

function Ronde2({ addScore, onDone, noteer }) {
  const [placed, setPlaced] = useState({});
  const [hint, setHint] = useState(null);
  const gratisFout = useEersteFoutVrij();
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
    noteer(dragged?.aandacht);
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${dragged?.hint ?? "Kijk nog eens naar de tekening."} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
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
      <p className="text-sm mb-3 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        Sleep (of tik) elk label naar het juiste onderdeel in de tekening.
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

// Aandachtspunt per systeemgroep: C42 en C43 leveren zo 1 regel op, geen twee.
const R3_AANDACHT = {
  onderdruk: "C42 en C43 horen bij het concentrische onderdruk-CLV (natuurlijke trek)",
  half: "C82 en C83 horen bij half-CLV: de lucht komt via de gevel",
  overdruk: "C(10)3 hoort bij het overdruk-CLV met ventilatordruk",
};

function BakIcoon({ type }) {
  const flow = { strokeDasharray: "5 4", animation: "flowDash 0.8s linear infinite" };
  const flowDown = { strokeDasharray: "4 3", animation: "flowDash 1.1s linear infinite" };
  const half = type === "half";
  const sx = half ? 55 : 40; // hart van de gemeenschappelijke rookgasafvoer
  return (
    <svg viewBox="0 0 80 70" className="w-20 h-16 mx-auto">
      {/* gearceerde vloer */}
      <line x1="6" y1="58" x2="74" y2="58" stroke={C.brownText} strokeWidth="1.5" />
      {[12, 20, 28, 36, 44, 52, 60, 68].map((x) => (
        <line key={x} x1={x} y1="58" x2={x - 4} y2="63" stroke={C.brownText} strokeWidth="0.9" />
      ))}

      {/* schachtwanden (gemeenschappelijke rookgasafvoer) */}
      <rect x={sx - 7} y="12" width="3.5" height="46" fill={C.beigeMid} stroke={C.brownText} strokeWidth="1.3" />
      <rect x={sx + 3.5} y="12" width="3.5" height="46" fill={C.beigeMid} stroke={C.brownText} strokeWidth="1.3" />
      {/* rookgas omhoog in de schacht */}
      <path d={`M${sx} 54 L${sx} 10`} fill="none" stroke={C.red} strokeWidth="2.5" style={flow} />
      <path d={`M${sx - 4} 14 L${sx} 6 L${sx + 4} 14`} fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {type === "onderdruk" && (
        <>
          {/* lucht omlaag in de schacht (concentrisch, via het dak) */}
          <path d={`M${sx - 3} 16 L${sx - 3} 54`} fill="none" stroke="#3B82F6" strokeWidth="1.7" style={flowDown} />
          <path d={`M${sx - 5.5} 50 L${sx - 3} 55 L${sx - 0.5} 50`} fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* natuurlijke trek: golfjes warme lucht boven de uitmonding */}
          <path d={`M${sx - 6} 8 q3 -3 6 0 M${sx} 8 q3 -3 6 0`} fill="none" stroke={C.brown} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}

      {type === "overdruk" && (
        <>
          {/* lucht omlaag in de schacht (concentrisch) */}
          <path d={`M${sx - 3} 16 L${sx - 3} 48`} fill="none" stroke="#3B82F6" strokeWidth="1.7" style={flowDown} />
          {/* ventilator onderin het kanaal (de overdrukbron) */}
          <circle cx={sx} cy="50" r="5" fill="white" stroke={C.brownText} strokeWidth="1.3" />
          <path d={`M${sx} 50 L${sx} 46 M${sx} 50 L${sx + 3.5} 52.5 M${sx} 50 L${sx - 3.5} 52.5`} stroke={C.brownText} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}

      {half && (
        <>
          {/* los toestel (links van de schacht) */}
          <rect x="22" y="34" width="18" height="20" fill="white" stroke={C.brownText} strokeWidth="1.3" />
          <circle cx="31" cy="46" r="3.2" fill="none" stroke={C.red} strokeWidth="1.2" />
          {/* gevelrooster met eigen luchtinlaat */}
          <rect x="4" y="38" width="6" height="12" fill="white" stroke={C.brownText} strokeWidth="1.2" />
          {[41, 44, 47].map((y) => (
            <line key={y} x1="5" y1={y} x2="9" y2={y} stroke={C.brownText} strokeWidth="0.9" />
          ))}
          {/* lucht van de gevel NAAR het toestel (niet via de schacht!) */}
          <path d="M10 44 L20 44" fill="none" stroke="#3B82F6" strokeWidth="1.7" strokeDasharray="4 3" style={flow} />
          <path d="M17 41.5 L21 44 L17 46.5" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* rookgas van het toestel naar de gemeenschappelijke schacht */}
          <path d={`M34 34 L34 28 L${sx} 28`} fill="none" stroke={C.red} strokeWidth="1.7" style={flow} />
        </>
      )}
    </svg>
  );
}

function Ronde3({ addScore, onDone, noteer }) {
  const [placed, setPlaced] = useState({}); // toestelId -> bakId
  const [hint, setHint] = useState(null);
  const gratisFout = useEersteFoutVrij();
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
    noteer(R3_AANDACHT[toestel.bak]);
    const uitleg =
      toestel.id === "C103"
        ? "C(10) is het overdruk-systeem (ventilatordruk)."
        : toestel.bak === "onderdruk"
        ? "C4. (C42/C43) hoort bij het concentrische onderdruk-CLV (natuurlijke trek)."
        : "C8. (C82/C83) haalt de lucht individueel via de gevel — dat past bij half-CLV.";
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
    return "wrong";
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 3: Welk toestel op welk systeem?
      </h2>
      <p className="text-sm mb-3 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        Sleep (of tik) elke toestelcodering naar het systeem waarop hij mag worden aangesloten.
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
          Ontdek hoe woningen in een flat samen een rookgasafvoer delen
        </p>
        <GameButton onClick={onStart}>Start de game</GameButton>
      </div>
    </div>
  );
}

// ─── MAIN ───

const SCREEN_ROUND = { r1: 1, r1mc: 1, r2: 2, r2mc: 2, r3: 3, r3mc: 3 };

// Kernpunten van deze game: staan altijd op het eindscherm, ook bij een foutloos spel.
const LEERMOMENTEN = [
  "Bij elk CLV-systeem is de rookgasafvoer gemeenschappelijk",
  "Het verschil zit in de lucht: CLV via het dak, half-CLV via de gevel",
  "Twee sifons onderin: de eerste tegen rookgas, de tweede tegen rioolgas",
  "De toestelcode moet passen bij het systeem: C42/C43 onderdruk, C82/C83 half-CLV",
];

export default function CLVVerkennerGame({ initialScreen = "start", onExit, onGameComplete }) {
  const [screen, setScreen] = useState(initialScreen);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const { aandacht, noteer, reset: resetAandacht } = useAandacht();
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
    resetAandacht();
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
            <IntroScreen title="Missie: het CLV-systeem" buttonText="Aan de slag" onNext={() => setScreen("r1")}>
              <div className="leading-relaxed" style={{ color: C.brownText }}>
                <p className="mb-2">
                  <strong>CLV</strong> = <strong>C</strong>ombinatie <strong>L</strong>uchttoevoer en{" "}
                  <strong>V</strong>erbrandingsgasafvoer.
                </p>
                <p className="mb-2">
                  In een flat delen meerdere woningen dezelfde leidingen voor rookgas en lucht. 1 schacht, meerdere ketels.
                </p>
                <p>Een fout raakt dus niet alleen jou, maar ook de buren. In deze missie leer je hoe het werkt.</p>
              </div>
            </IntroScreen>
          )}

          {screen === "r1" && <Ronde1 addScore={addScore} onDone={() => setScreen("r1mc")} noteer={noteer} />}
          {screen === "r1mc" && (
            <div className="flex-1 flex flex-col items-center p-6">
              <StepBanner step={2} />
              <MCControle pool={POOL_R1} addScore={addScore} loseLife={loseLife} onFout={noteer} onComplete={() => setScreen("r2")} />
            </div>
          )}

          {screen === "r2" && <Ronde2 addScore={addScore} onDone={() => setScreen("r2mc")} noteer={noteer} />}
          {screen === "r2mc" && (
            <div className="flex-1 flex flex-col items-center p-6">
              <StepBanner step={2} />
              <MCControle pool={POOL_R2} addScore={addScore} loseLife={loseLife} onFout={noteer} onComplete={() => setScreen("r3")} />
            </div>
          )}

          {screen === "r3" && <Ronde3 addScore={addScore} onDone={() => setScreen("r3mc")} noteer={noteer} />}
          {screen === "r3mc" && (
            <div className="flex-1 flex flex-col items-center p-6">
              <StepBanner step={2} />
              <MCControle pool={POOL_R3} addScore={addScore} loseLife={loseLife} onFout={noteer} onComplete={() => setScreen("end")} lastRound />
            </div>
          )}

          {screen === "end" && (
            <EndScreen
              score={score}
              maxScore={MAX_SCORE}
              lives={lives}
              text="Je herkent nu CLV-systemen. In De CLV-Monteur ga je er ook echt mee aan de slag!"
              leermomenten={LEERMOMENTEN}
              aandacht={aandacht}
              onRestart={resetGame}
              onExit={onExit}
            />
          )}
        </div>
      </DragProvider>
    </div>
  );
}
