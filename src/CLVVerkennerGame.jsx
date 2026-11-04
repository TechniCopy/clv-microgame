import { useState, useCallback, useEffect, useRef } from "react";
import { Building2, CheckCircle, XCircle, ArrowRight } from "lucide-react";
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
  StepBanner,
  RondeIntro,
  UitlegItem,
  useAandacht,
  DrainageTrein,
  playSound,
  VasteBalk,
  RUIMTE_VOOR_BALK,
  useDrag,
} from "./shared.jsx";
import { useSessie, maakZender, EindschermKern } from "./microgame/schil.jsx";

// De CLV-Verkenner (eindtermen 5.1 en 5.2). Score, sterren, levens en het
// eindscherm komen uit de gedeelde kern (src/microgame/). Elke ronde is voor
// de kern een missie met een ronde en twee kennisvragen. Handelingen zijn de
// momenten waarop de speler iets goed doet:
//   r1 Welk systeem is dit?        3 schuifopdrachten + 5 eigenschappen = 8
//   r2 Onderdruk of overdruk?      3 casussen + 6 kenmerken          = 9
//   r3 De onderdelen               6 labels + 5 keursituaties        = 11
//   r4 Welke toestellen mogen erop? 6 typeplaten + 4 combinaties     = 10
// Haalbaar: (8 + 9 + 11 + 10) x 100 + 8 kennisvragen x 100 = 4600.
// Elke inhoudelijke zin staat met feit-ID in clv-gauntlet\bouw\verkenner-BRONNEN.md.
const GAME_ID = "clv-verkenner";
const VRAGEN_PER_RONDE = 2;

const maakOpzet = () => ({
  id: GAME_ID,
  missies: [
    { id: "m1", rondes: [{ id: "r1", handelingen: 8 }], kennisvragen: [{ id: "k1a" }, { id: "k1b" }] },
    { id: "m2", rondes: [{ id: "r2", handelingen: 9 }], kennisvragen: [{ id: "k2a" }, { id: "k2b" }] },
    { id: "m3", rondes: [{ id: "r3", handelingen: 11 }], kennisvragen: [{ id: "k3a" }, { id: "k3b" }] },
    { id: "m4", rondes: [{ id: "r4", handelingen: 10 }], kennisvragen: [{ id: "k4a" }, { id: "k4b" }] },
  ],
});

// De game meet niets zolang hij op zijn eigen domein draait: besluit van
// Peter (28 augustus 2026), meten en testen gebeurt pas als de games in de
// lesstof-app staan. Zonder VITE_TELEMETRIE_URL geeft maakZender geen zender
// terug en meldt de kern nergens heen. Zet die variabele dus niet.
const zender = maakZender({ url: import.meta.env.VITE_TELEMETRIE_URL });

const RONDE_NAMEN = {
  r1: "Welk systeem is dit?",
  r2: "Onderdruk of overdruk?",
  r3: "De onderdelen",
  r4: "Welke toestellen mogen erop?",
};

const RONDE_SCHERMEN = ["r1", "r2", "r3", "r4"];
const VOLGENDE = { r1: "r2", r2: "r3", r3: "r4", r4: "end" };
const SCREEN_ROUND = { r1: 1, r1mc: 1, r2: 2, r2mc: 2, r3: 3, r3mc: 3, r4: 4, r4mc: 4 };

// Controlemenu: zo ver moet de kern doorgespeeld zijn om op een scherm te
// kunnen landen. Heel getal n: de eerste n rondes met kennisvragen af; met
// een half erbij is ook de ronde erna af en staat haar eerste kennisvraag open.
const SPOEL_STAPPEN = {
  intro: 0, r1: 0, r1mc: 0.5, r2: 1, r2mc: 1.5, r3: 2, r3mc: 2.5, r4: 3, r4mc: 3.5, end: 4,
};

function doorspelenTot(sessie, screen) {
  const stappen = SPOEL_STAPPEN[screen];
  if (!stappen) return;
  // React StrictMode voert initializers dubbel uit; alleen een verse sessie spoelen
  if (sessie.stand.rondes.some((r) => r.pogingen > 0)) return;
  const rondes = sessie.stand.rondes;
  const heel = Math.floor(stappen);
  const speel = (index, metVragen) => {
    sessie.startRonde();
    for (let h = 0; h < rondes[index].handelingen; h += 1) sessie.beoordeel("goed");
    sessie.verder();
    if (!metVragen) return;
    for (let v = 0; v < VRAGEN_PER_RONDE; v += 1) {
      sessie.beantwoordKennisvraag(true);
      sessie.volgendeKennisvraag();
    }
  };
  for (let i = 0; i < heel; i += 1) speel(i, true);
  if (stappen % 1) speel(heel, false);
}

// ─── HULPJES ───

const BLAUW = "#3B82F6";
const ORANJE = "#C25E11";

function schud(lijst) {
  const a = [...lijst];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const kies = (lijst) => lijst[Math.floor(Math.random() * lijst.length)];

// Welke fase een ronde als eerste toont. De QA-sprong (?fase=opdracht) slaat
// de introkaart over; ?fase=stap2 springt meteen naar de tweede stap.
function startFase(qaFase) {
  if (qaFase === "stap2") return "stap2";
  if (qaFase === "opdracht") return "stap1";
  return "intro";
}

// De kern sluit de ronde bij de derde fout en geeft verse hartjes; de game
// toont alleen de uitleg. Herkansen kan aan het eind, met de beste poging.
function RondeGefaald({ onVerder }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4">
      <div className="rounded-2xl border-2 shadow-2xl p-6 w-full max-w-sm text-center" style={{ backgroundColor: C.bgCard, borderColor: C.red }}>
        <h2 className="font-bold italic text-xl mb-2" style={{ color: C.brownText }}>Je hartjes zijn op</h2>
        <p className="text-sm mb-4" style={{ color: C.brown }}>
          Geen probleem: van fouten leer je. Deze ronde sluit; je gaat verder met verse hartjes. Aan het eind kun je de ronde herkansen. Dan telt je beste poging.
        </p>
        <GameButton onClick={onVerder} className="w-full">Verder</GameButton>
      </div>
    </div>
  );
}

// Kop boven elke opdracht: ronde, stap, de opdracht in een zin en de teller.
function OpdrachtKop({ nummer, titel, stap, stappen = 2, opdracht, gedaan, totaal }) {
  return (
    <div className="w-full max-w-2xl flex flex-col items-center text-center">
      <StepBanner step={1} />
      <h2 className="text-lg sm:text-xl font-bold italic mb-1 leading-tight" style={{ color: C.brownText }}>
        Ronde {nummer}: {titel}
      </h2>
      <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
        {stappen > 1 && (
          <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-md" style={{ color: C.oliveDark, backgroundColor: C.oliveLight }}>
            Stap {stap} van {stappen}
          </span>
        )}
        <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ color: C.brown, backgroundColor: C.beigeLight }}>
          {Math.min(gedaan, totaal)} van {totaal}
        </span>
      </div>
      <p className="text-sm font-bold max-w-lg mb-2 sm:mb-3 leading-snug" style={{ color: C.brownText }}>
        Opdracht: {opdracht}
      </p>
    </div>
  );
}

// Terugmelding na elke handeling: groen met de waarom-regel, rood met wat wel klopt.
function Melding({ melding }) {
  if (!melding) return null;
  const goed = melding.soort === "goed";
  const Icoon = goed ? CheckCircle : XCircle;
  return (
    <div
      aria-live="polite"
      className="w-full max-w-lg rounded-xl border-2 px-3 py-2 text-sm font-medium flex gap-2 items-start text-left"
      style={{ backgroundColor: goed ? C.greenLight : C.redLight, borderColor: goed ? C.green : C.red, color: C.brownText }}
    >
      <Icoon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: goed ? C.green : C.red }} />
      <span>{melding.tekst}</span>
    </div>
  );
}

// Terugmelding bij sleepschermen: op een telefoon vast bovenin (over de kop,
// onder de plek van de "x op rij"-melding), zodat kaartjes en vlakken onderin
// vrij blijven. Tikken gaan erdoorheen. Zodra de speler een volgend kaartje
// kiest of sleept, verdwijnt de melding: dan staat de tikmelding bovenin en is
// de hele tekening weer vrij. Op een groot scherm staat hij gewoon in de pagina.
function SleepMelding({ melding }) {
  const drag = useDrag();
  if (!melding) return null;
  const bezig = !!drag?.selected || !!drag?.dragging;
  return (
    <div className={`fixed top-[88px] inset-x-2 z-[85] justify-center pointer-events-none md:static md:mt-2 md:w-full md:flex ${bezig ? "hidden" : "flex"}`}>
      <Melding melding={melding} />
    </div>
  );
}

// Keuzeknop (min. 44 px hoog, ook op een telefoon goed te raken)
function KeuzeKnop({ onClick, disabled, gekozen, fout, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full min-h-[44px] text-left px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all disabled:cursor-not-allowed"
      style={{
        backgroundColor: fout ? C.redLight : gekozen ? C.greenLight : C.bgCard,
        borderColor: fout ? C.red : gekozen ? C.green : C.beigeMid,
        color: C.brownText,
        opacity: fout ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Twee-, drie- of vierstandenschuif (huisstijl van de oude luchtschuif)
function Schuif({ titel, opties, waarde, onChange, uit = false, breedte = 240 }) {
  const idx = opties.findIndex((o) => o.id === waarde);
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ opacity: uit ? 0.4 : 1 }}>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.brownText }}>
        {titel}
      </span>
      <div
        className="relative flex rounded-full border-2 p-1 select-none"
        style={{ backgroundColor: C.beigeLight, borderColor: C.brownText, width: breedte, maxWidth: "100%" }}
      >
        <div
          className="absolute top-1 bottom-1 rounded-full transition-all duration-300 shadow-md"
          style={{
            width: `calc(${100 / opties.length}% - 4px)`,
            left: `calc(${(Math.max(0, idx) * 100) / opties.length}% + 2px)`,
            backgroundColor: C.olive,
            opacity: idx < 0 || uit ? 0 : 1,
          }}
        />
        {opties.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={uit}
            aria-pressed={waarde === o.id}
            aria-label={o.label}
            onClick={() => onChange(o.id)}
            className="flex-1 min-h-[44px] flex items-center justify-center text-sm font-bold uppercase z-10 transition-colors duration-300 disabled:cursor-not-allowed"
            style={{ color: waarde === o.id && !uit ? "white" : C.brown }}
          >
            {o.inhoud}
          </button>
        ))}
      </div>
    </div>
  );
}

// Bij elke nieuwe stap of ronde bovenaan beginnen (anders erft het scherm de
// scrollpositie van het vorige)
function useBovenaan(sleutel) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [sleutel]);
}

// Eenvoudige stapel: steeds een kaart, de speler kiest een knop.
// Bij goed blijft de kaart staan met de waarom-regel en een knop "Volgende
// kaart"; zo hoort de melding altijd bij de kaart die in beeld is.
function useStapel(items, { beoordeel, noteer, zie }) {
  const [index, setIndex] = useState(0);
  const [fout, setFout] = useState([]);
  const [beantwoord, setBeantwoord] = useState(false);
  const [melding, setMelding] = useState(null);
  const item = items[index] ?? null;
  const laatste = index + 1 >= items.length;
  const kiesKnop = (keuze, e) => {
    if (!item || beantwoord || fout.includes(keuze)) return;
    zie(item.feiten);
    if (keuze === item.juist) {
      beoordeel("goed", e);
      setMelding({ soort: "goed", tekst: item.goed });
      setBeantwoord(true);
    } else {
      beoordeel("fout", e);
      noteer(item.aandacht);
      setMelding({ soort: "fout", tekst: item.fout });
      setFout((f) => [...f, keuze]);
    }
  };
  const volgende = () => {
    setIndex((i) => i + 1);
    setFout([]);
    setBeantwoord(false);
    setMelding(null);
  };
  return { item, index, fout, melding, kiesKnop, beantwoord, laatste, volgende, gedaan: index + (beantwoord ? 1 : 0) };
}

// Knop onder een beantwoorde kaart: naar de volgende kaart, of na de laatste
// kaart naar de controlevragen.
function StapelVerder({ stapel, onKlaar }) {
  if (!stapel.beantwoord) return null;
  return stapel.laatste ? (
    <GameButton onClick={onKlaar} variant="green" className="w-full">Naar de controlevragen</GameButton>
  ) : (
    <GameButton onClick={stapel.volgende} variant="green" className="w-full">
      Volgende kaart
      <ArrowRight className="w-4 h-4" />
    </GameButton>
  );
}

// ─── TEKENING-ONDERDELEN ───

// Leiding als omlijnde buis met gekleurde, bewegende stroom erin
function Pijp({ d, kleur, anim, rand = C.brownText, dik = 7 }) {
  return (
    <g>
      <path d={d} fill="none" stroke={rand} strokeWidth={dik} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke="white" strokeWidth={dik - 3} strokeLinejoin="round" strokeLinecap="round" />
      {kleur && <path d={d} fill="none" stroke={kleur} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={anim} />}
    </g>
  );
}

// Pijlpunt op het eind van een lijn, richting in graden (0 = rechts, 90 = omlaag)
function Pijlpunt({ x, y, hoek, kleur, maat = 5 }) {
  const r = (hoek * Math.PI) / 180;
  const p = (a) => `${x - maat * Math.cos(r + a)},${y - maat * Math.sin(r + a)}`;
  return <polygon points={`${x},${y} ${p(0.5)} ${p(-0.5)}`} fill={kleur} />;
}

// Bewegende stroom in en rond de kappen (zelfde looprichting als in de figuren)
const KAP_OP = { strokeDasharray: "5 3", animation: "flowDash 0.8s linear infinite" };
const KAP_NEER = { strokeDasharray: "5 3", animation: "flowDash 1.1s linear infinite" };

// Kap volgens NPR 3378-40 fig 1: flens met bouten, hals, taps deel, kap met
// aan beide kanten een gaasrooster, kapplaat, korte uitstroompijp en twee
// rookgaspijlen schuin omhoog. Lucht komt van buiten schuin door het gaas
// en buigt omlaag de ring in. cx = hart, y0 = bovenkant dak.
function KapF1({ cx, y0, w = 20, wi = 8, gaasId, stroom = true, lijnKleur = C.brownText, rookKleur = C.red }) {
  return (
    <g>
      <rect x={cx - w - 6} y={y0 - 6} width={2 * w + 12} height={5} fill="white" stroke={lijnKleur} strokeWidth="1.8" />
      <rect x={cx - w - 3} y={y0 - 10} width="5" height="4" fill={lijnKleur} />
      <rect x={cx + w - 2} y={y0 - 10} width="5" height="4" fill={lijnKleur} />
      <rect x={cx - w} y={y0 - 20} width={2 * w} height={14} fill="white" stroke={lijnKleur} strokeWidth="1.8" />
      <polygon
        points={`${cx - w},${y0 - 20} ${cx + w},${y0 - 20} ${cx + w + 6},${y0 - 36} ${cx - w - 6},${y0 - 36}`}
        fill="white"
        stroke={lijnKleur}
        strokeWidth="1.8"
      />
      <rect x={cx - w - 6} y={y0 - 54} width={2 * w + 12} height={18} fill="white" stroke={lijnKleur} strokeWidth="1.8" />
      <rect x={cx - w - 4} y={y0 - 52} width="13" height="12" fill={`url(#${gaasId})`} stroke={lijnKleur} strokeWidth="1" />
      <rect x={cx + w - 9} y={y0 - 52} width="13" height="12" fill={`url(#${gaasId})`} stroke={lijnKleur} strokeWidth="1" />
      {/* binnenbuis gestippeld door de kap */}
      <line x1={cx - wi} y1={y0 - 54} x2={cx - wi} y2={y0 - 6} stroke={lijnKleur} strokeWidth="1.2" strokeDasharray="4 3" />
      <line x1={cx + wi} y1={y0 - 54} x2={cx + wi} y2={y0 - 6} stroke={lijnKleur} strokeWidth="1.2" strokeDasharray="4 3" />
      <rect x={cx - w - 10} y={y0 - 58} width={2 * w + 20} height="4" fill={lijnKleur} />
      <rect x={cx - 7} y={y0 - 70} width="14" height="12" fill="white" stroke={lijnKleur} strokeWidth="1.8" />
      {stroom && (
        <>
          <g stroke={rookKleur} strokeWidth="2.2" fill="none" strokeLinecap="round" style={KAP_OP}>
            <path d={`M${cx - 4} ${y0 - 72} L${cx - 9} ${y0 - 86}`} />
            <path d={`M${cx + 4} ${y0 - 72} L${cx + 9} ${y0 - 86}`} />
          </g>
          <Pijlpunt x={cx - 10} y={y0 - 89} hoek={-110} kleur={rookKleur} />
          <Pijlpunt x={cx + 10} y={y0 - 89} hoek={-70} kleur={rookKleur} />
          <g stroke={BLAUW} strokeWidth="1.8" fill="none" strokeLinecap="round" style={KAP_NEER}>
            <path d={`M${cx - w - 34} ${y0 - 68} L${cx - w - 2} ${y0 - 48} Q${cx - w + 4} ${y0 - 44} ${cx - w + 6} ${y0 - 30}`} />
            <path d={`M${cx + w + 34} ${y0 - 68} L${cx + w + 2} ${y0 - 48} Q${cx + w - 4} ${y0 - 44} ${cx + w - 6} ${y0 - 30}`} />
          </g>
          <Pijlpunt x={cx - w + 6} y={y0 - 27} hoek={90} kleur={BLAUW} />
          <Pijlpunt x={cx + w - 6} y={y0 - 27} hoek={90} kleur={BLAUW} />
        </>
      )}
    </g>
  );
}

// Kap volgens C10 fig 1 (overdruk): blok met ruitjesgaas tussen twee
// platen; de binnenbuis loopt door het gaas omhoog en het rookgas buigt naar
// rechts; lucht gaat via het gaas omlaag de ring in. Onder de kap verwijdt
// de buitenbuis zich naar boven.
function KapF4({ cx, y0, w = 19, wi = 7, gaasId, stroom = true }) {
  const top = y0 - 44; // onderkant gaasblok
  return (
    <g>
      <line x1={cx - w} y1={y0} x2={cx - w - 8} y2={top} stroke={C.brownText} strokeWidth="1.8" />
      <line x1={cx + w} y1={y0} x2={cx + w + 8} y2={top} stroke={C.brownText} strokeWidth="1.8" />
      <rect x={cx - w - 14} y={top - 30} width={2 * w + 28} height="30" fill={`url(#${gaasId})`} stroke="none" />
      <line x1={cx - w - 16} y1={top} x2={cx + w + 16} y2={top} stroke={C.brownText} strokeWidth="2.2" />
      <line x1={cx - w - 16} y1={top - 30} x2={cx + w + 16} y2={top - 30} stroke={C.brownText} strokeWidth="2.2" />
      <line x1={cx - wi} y1={y0} x2={cx - wi - 2} y2={top - 36} stroke={C.brownText} strokeWidth="1.8" />
      <line x1={cx + wi} y1={y0} x2={cx + wi + 2} y2={top - 36} stroke={C.brownText} strokeWidth="1.8" />
      {stroom && (
        <>
          <path d={`M${cx} ${top - 36} Q${cx} ${top - 46} ${cx + 10} ${top - 46} H${cx + 32}`} fill="none" stroke={C.red} strokeWidth="2" style={KAP_OP} />
          <Pijlpunt x={cx + 37} y={top - 46} hoek={0} kleur={C.red} />
          <path d={`M${cx + wi + 6} ${top - 22} L${cx + wi + 7} ${y0 - 6}`} fill="none" stroke={BLAUW} strokeWidth="1.8" style={KAP_NEER} />
          <Pijlpunt x={cx + wi + 7} y={y0 - 2} hoek={90} kleur={BLAUW} />
        </>
      )}
    </g>
  );
}

// Ruitjesgaas (kap) en arcering als patroon; per tekening een eigen id
function Patronen({ achtervoegsel }) {
  return (
    <defs>
      <pattern id={`arcering${achtervoegsel}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.3" />
      </pattern>
      <pattern id={`gaas${achtervoegsel}`} width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="white" />
        <path d="M0 0 H4 M0 0 V4" stroke={C.brownText} strokeWidth="0.7" />
      </pattern>
    </defs>
  );
}

// ─── RONDE 1: WELK SYSTEEM IS DIT? ───

// Spellabel in een tekening: eigen woorden in spelopmaak (cursief), geen normtekst
function SpelLabel({ x, y, anker = "start", children }) {
  return (
    <text data-spel="label" x={x} y={y} fontSize="18" fontWeight="700" fontStyle="italic" fill={C.brown} textAnchor={anker}>
      {children}
    </text>
  );
}

// Eenvoudig gesloten toestel: kast met een frontpaneel en een knopje
function Toestel({ x, y, b = 56, h = 52, grijs = false }) {
  return (
    <g>
      <rect x={x} y={y} width={b} height={h} fill={grijs ? "#EDEDED" : "white"} stroke={C.brownText} strokeWidth="2" />
      <rect x={x + 5} y={y + h - 15} width={b * 0.46} height="9" fill="white" stroke={C.brownText} strokeWidth="1.1" />
      <circle cx={x + b - 7} cy={y + h - 16} r="2" fill={C.brownText} />
    </g>
  );
}

// Flatdoorsnede in drie uitvoeringen, zelf getekend in de gamestijl; de
// details volgen de normfiguren (zie clv-gauntlet\tekenen\DETAILLIJST.md):
// - conc: concentrisch CLV (F1): schacht links, toestellen rechts, geen gevel
// - half: half-CLV (F2): schacht links, spouwgevel rechts met een rooster per verdieping
// - par:  parallel CLV (F8): eigen tekening, NIET gespiegeld: toestellen links, schacht rechts
function FlatDoorsnede({ soort }) {
  if (soort === "par") return <FlatParallel />;
  const op = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const neer = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };
  const woningen = [110, 215, 320]; // plafond van elke woning
  const cx = 75;
  const half = soort === "half";
  const gat = half ? [61, 89] : [55, 95];
  const rechts = half ? 318 : 330; // rechterkant van dak en vloeren
  const lijn = { stroke: C.brownText, strokeWidth: 2 };

  return (
    <svg viewBox="0 0 400 520" className="w-full h-auto select-none" role="img" aria-label="Doorsnede van een flat met schacht">
      <Patronen achtervoegsel="V1" />

      {/* schachtwanden (van dak tot begane-grondvloer) */}
      <rect x="40" y="110" width="10" height="386" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="100" y="110" width="10" height="386" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* half-CLV: spouwgevel (twee bladen) rechts */}
      {half && (
        <>
          <rect x="300" y="110" width="7" height="386" fill={C.beigeMid} stroke={C.brownText} strokeWidth="1.8" />
          <rect x="311" y="96" width="7" height="400" fill={C.beigeMid} stroke={C.brownText} strokeWidth="1.8" />
        </>
      )}
      {/* dak en verdiepingsvloeren lopen door de schachtwanden tot tegen het kanaal */}
      <rect x="8" y="96" width={gat[0] - 8} height="14" fill="url(#arceringV1)" stroke={C.brownText} strokeWidth="2" />
      <rect x={gat[1]} y="96" width={rechts - gat[1]} height="14" fill="url(#arceringV1)" stroke={C.brownText} strokeWidth="2" />
      {[205, 310].map((y) => (
        <g key={y}>
          <rect x="8" y={y} width={gat[0] - 8} height="11" fill="url(#arceringV1)" stroke={C.brownText} strokeWidth="1.5" />
          <rect x={gat[1]} y={y} width={(half ? 300 : rechts) - gat[1]} height="11" fill="url(#arceringV1)" stroke={C.brownText} strokeWidth="1.5" />
        </g>
      ))}
      {/* begane-grondvloer, dicht onder de schacht door */}
      <rect x="4" y="496" width="392" height="14" fill="url(#arceringV1)" stroke={C.brownText} strokeWidth="2" />

      {/* bouwkundig luik: opening in de rechterschachtwand, plaat aan de woningkant, vast boven en onder;
          daaronder de condensafvoer door de wand naar buiten: sifon, open uitloop boven een trechter, sifon, riool */}
      <g>
        <rect x="100" y="424" width="10" height="28" fill="white" stroke="none" />
        <rect x="110" y="420" width="5" height="36" fill="white" stroke={C.brownText} strokeWidth="1.6" />
        <line x1="115" y1="424" x2="121" y2="424" stroke={C.brownText} strokeWidth="1.4" />
        <line x1="115" y1="452" x2="121" y2="452" stroke={C.brownText} strokeWidth="1.4" />
        <DrainageTrein x={120} y={half ? 464 : 472} s={0.75} strokeWidth={2.2} riool={false} />
        <path d={half ? "M148 468 H182" : "M148 476 H182"} fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinecap="round" />
        <SpelLabel x={126} y={442}>luik</SpelLabel>
        <SpelLabel x={186} y={half ? 473 : 481}>riool</SpelLabel>
      </g>

      {/* ── concentrisch (F1) ── */}
      {!half && (
        <g>
          <line x1="55" y1="90" x2="55" y2="478" {...lijn} />
          <line x1="95" y1="90" x2="95" y2="478" {...lijn} />
          <line x1="67" y1="90" x2="67" y2="438" {...lijn} />
          <line x1="83" y1="90" x2="83" y2="438" {...lijn} />
          {/* einde van de binnenbuis: dwarslijn over de volle breedte */}
          <line x1="67" y1="438" x2="83" y2="438" stroke={C.brownText} strokeWidth="2.4" />
          {/* opvangtrechter over de volle breedte van de buitenbuis, uitloop in het midden, afvoer door de wand onder het luik */}
          <path d="M55 456 L71 468 H79 L95 456" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          <path d="M75 468 V472 H120" fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* voetstuk met drie openingen */}
          <rect x="55" y="478" width="40" height="18" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          {[65, 75, 85].map((x) => <circle key={x} cx={x} cy="487" r="4" fill="none" stroke={C.brownText} strokeWidth="1.4" />)}
          {/* inspectiedeksel: kort stompje rechts op de buitenbuis met een rond, geribbeld deksel, op de hoogte van het einde van de binnenbuis */}
          <rect x="95" y="433" width="4" height="12" fill="white" stroke={C.brownText} strokeWidth="1.4" />
          <rect x="99" y="428" width="5" height="22" rx="2.5" fill="white" stroke={C.brownText} strokeWidth="1.5" />
          {[432, 436, 440, 444].map((y) => <line key={y} x1="100" y1={y} x2="103" y2={y} stroke={C.brownText} strokeWidth="0.9" />)}
          <KapF1 cx={cx} y0={96} gaasId="gaasV1" />
        </g>
      )}

      {/* ── half-CLV (F2) ── */}
      {half && (
        <g>
          <line x1="61" y1="74" x2="61" y2="478" {...lijn} />
          <line x1="89" y1="74" x2="89" y2="478" {...lijn} />
          {/* opvangtrechter in de buis (verborgen, gestippeld), afvoer door de wand onder het luik */}
          <path d="M63 448 L72 458 H78 L87 448" fill="none" stroke={C.brownText} strokeWidth="1.4" strokeDasharray="3 2" />
          <path d="M75 458 V464 H120" fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* bol, rond inspectiedeksel rechts op de buis */}
          <path d="M89 424 Q100 437 89 450" fill="white" stroke={C.brownText} strokeWidth="1.6" />
          {/* voetstuk met drie openingen; de buis loopt door tot op het voetstuk */}
          <rect x="61" y="478" width="28" height="18" fill="white" stroke={C.brownText} strokeWidth="1.6" />
          {[68, 75, 82].map((x) => <circle key={x} cx={x} cy="487" r="3" fill="none" stroke={C.brownText} strokeWidth="1.2" />)}
          {/* kap: voetflens met bouten, rechte kast, deel dat naar boven smaller wordt, afdekplaat;
              de buis loopt gestippeld door tot onder de afdekplaat */}
          <rect x="50" y="90" width="50" height="6" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          <rect x="53" y="86" width="5" height="4" fill={C.brownText} />
          <rect x="92" y="86" width="5" height="4" fill={C.brownText} />
          <rect x="54" y="72" width="42" height="18" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          <polygon points="54,72 96,72 90,62 60,62" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          <line x1="63" y1="62" x2="63" y2="90" stroke={C.brownText} strokeWidth="1.1" strokeDasharray="3 2" />
          <line x1="87" y1="62" x2="87" y2="90" stroke={C.brownText} strokeWidth="1.1" strokeDasharray="3 2" />
          <rect x="46" y="52" width="58" height="5" fill={C.brownText} />
          {/* rookgas buigt onder de afdekplaat horizontaal naar links en naar rechts */}
          <g fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round" style={KAP_OP}>
            <path d="M71 74 Q71 59.5 62 59.5 H30" />
            <path d="M79 74 Q79 59.5 88 59.5 H120" />
          </g>
          <Pijlpunt x={25} y={59.5} hoek={180} kleur={C.red} />
          <Pijlpunt x={125} y={59.5} hoek={0} kleur={C.red} />
        </g>
      )}

      {/* rookgas en lucht in de schacht */}
      {!half && (
        <>
          <path d={`M${cx} 436 L${cx} 44`} fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={op} />
          <path d="M61 72 L61 436" fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" style={neer} />
          <path d="M89 72 V446 Q89 451 84 451 H79" fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" style={neer} />
          {/* doorgetrokken pijl in de rechter ring: langs het einde van de binnenbuis omlaag en eronder naar links */}
          <path d="M89 430 V446 Q89 451 84 451 H79" fill="none" stroke={BLAUW} strokeWidth="1.4" />
          <Pijlpunt x={75} y={451} hoek={180} kleur={BLAUW} maat={5} />
        </>
      )}
      {half && <path d={`M${cx} 474 L${cx} 76`} fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={op} />}

      {/* per woning: toestel met twee losse leidingen uit de bovenkant, net onder het plafond */}
      {woningen.map((top) => {
        const yB = top + 16; // bovenste leiding
        const yO = top + 28; // onderste leiding
        const kt = top + 46; // bovenkant toestel
        return (
          <g key={top}>
            <rect x="176" y={kt - 8} width="12" height="8" fill="white" stroke={C.brownText} strokeWidth="1.5" />
            <rect x="204" y={kt - 8} width="12" height="8" fill="white" stroke={C.brownText} strokeWidth="1.5" />
            {!half && (
              <>
                {/* rookgas (rechter stomp, buitenste bocht) door de ring tot in de binnenbuis, daar omhoog; lucht (linker stomp) uit de ring */}
                <Pijp d={`M210 ${kt - 6} V${yB} H${cx} V${yB - 8}`} kleur={C.red} anim={op} />
                <Pijp d={`M95 ${yO} H182 V${kt - 6}`} kleur={BLAUW} anim={neer} />
              </>
            )}
            {half && (
              <>
                {/* links de rookgasleiding naar de afvoerbuis, rechts de luchtleiding door de gevel, op dezelfde hoogte */}
                <Pijp d={`M182 ${kt - 6} V${yB} H89`} kleur={C.red} anim={op} />
                <Pijp d={`M326 ${yB} H210 V${kt - 6}`} kleur={BLAUW} anim={neer} />
                {/* kapje (rooster) over het pijpeinde aan de buitenkant van de gevel; lucht van buiten naar binnen */}
                <path d={`M318 ${yB - 12} H328 V${yB + 12} H318`} fill="white" stroke={C.brownText} strokeWidth="2" />
                {[yB - 6, yB + 6].map((ly) => (
                  <line key={ly} x1="320" y1={ly} x2="327" y2={ly} stroke={C.brownText} strokeWidth="1.2" />
                ))}
                <path d={`M366 ${yB} H338`} fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" style={KAP_NEER} />
                <Pijlpunt x={333} y={yB} hoek={180} kleur={BLAUW} maat={6} />
              </>
            )}
            <Toestel x={166} y={kt} />
          </g>
        );
      })}

      {half && (
        <g data-spel="label">
          <SpelLabel x={398} y={78} anker="end">rooster in de gevel</SpelLabel>
          <line x1="350" y1="82" x2="327" y2="112" stroke={C.brown} strokeWidth="1" />
        </g>
      )}
      <SpelLabel x={228} y={184}>toestel</SpelLabel>
    </svg>
  );
}

// Parallel CLV (F8), NIET gespiegeld: de toestellen staan links, de schacht
// rechts. In de schacht twee losse buizen: links (aan de kant van de toestellen)
// het luchtkanaal, rechts het rookgaskanaal. Per toestel gaat de bovenste
// leiding (van de stomp die het verst van de schacht zit) met een T-stuk naar
// het luchtkanaal; de onderste loopt voor het luchtkanaal langs naar het
// rookgaskanaal. Onderaan: luchtkanaal dicht, rookgaskanaal met inspectiestuk,
// steun aan de wand en een sifon; de afvoer gaat door de schachtwand naar de
// ruimte van het onderste toestel: open uitloop boven een trechter, sifon, riool.
function FlatParallel() {
  const op = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const neer = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };
  const woningen = [110, 215, 320];
  const lijn = { stroke: C.brownText, strokeWidth: 2 };
  const LK = 311; // hart luchtkanaal (304-318)
  const RK = 337; // hart rookgaskanaal (330-344)
  const onderLucht = 352; // luchtkanaal dicht onder de onderste aansluiting

  return (
    <svg viewBox="0 0 400 520" className="w-full h-auto select-none" role="img" aria-label="Doorsnede van een flat met een parallel CLV">
      <Patronen achtervoegsel="V1p" />

      {/* woningen links: dak en vloeren tot tegen de schacht; begane-grondvloer loopt door */}
      <rect x="8" y="96" width="282" height="14" fill="url(#arceringV1p)" stroke={C.brownText} strokeWidth="2" />
      {[205, 310].map((y) => (
        <rect key={y} x="8" y={y} width="282" height="11" fill="url(#arceringV1p)" stroke={C.brownText} strokeWidth="1.5" />
      ))}
      <rect x="4" y="496" width="392" height="14" fill="url(#arceringV1p)" stroke={C.brownText} strokeWidth="2" />

      {/* schacht rechts: twee wanden en een afdekking waarop de kap staat */}
      <rect x="290" y="84" width="10" height="412" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="350" y="84" width="10" height="412" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="286" y="78" width="16" height="6" fill="white" stroke={C.brownText} strokeWidth="1.8" />
      <rect x="348" y="78" width="16" height="6" fill="white" stroke={C.brownText} strokeWidth="1.8" />

      {/* kap: dichte onderkast, roosterkast met lamellen, vlakke bovenplaat, ronde rookgaspijp met kraag */}
      <rect x="298" y="56" width="54" height="22" fill="white" stroke={C.brownText} strokeWidth="1.8" />
      {[308, 325, 342].map((x) => <circle key={x} cx={x} cy="67" r="1.2" fill={C.brownText} />)}
      <rect x="295" y="32" width="60" height="24" fill="white" stroke={C.brownText} strokeWidth="1.8" />
      {[37, 42, 47, 52].map((y) => <line key={y} x1="297" y1={y} x2="353" y2={y} stroke={C.brownText} strokeWidth="0.9" />)}
      <rect x="291" y="28" width="68" height="4" fill={C.brownText} />
      <rect x="332" y="12" width="10" height="16" fill="white" stroke={C.brownText} strokeWidth="1.6" />
      <rect x="329" y="17" width="16" height="4" fill="white" stroke={C.brownText} strokeWidth="1.4" />

      {/* twee losse buizen naast elkaar; in de kap gestippeld */}
      <line x1="304" y1="56" x2="304" y2="78" stroke={C.brownText} strokeWidth="1.1" strokeDasharray="3 2" />
      <line x1="318" y1="56" x2="318" y2="78" stroke={C.brownText} strokeWidth="1.1" strokeDasharray="3 2" />
      <line x1="330" y1="28" x2="330" y2="78" stroke={C.brownText} strokeWidth="1.1" strokeDasharray="3 2" />
      <line x1="344" y1="28" x2="344" y2="78" stroke={C.brownText} strokeWidth="1.1" strokeDasharray="3 2" />
      <line x1="304" y1="78" x2="304" y2={onderLucht} {...lijn} />
      <line x1="318" y1="78" x2="318" y2={onderLucht} {...lijn} />
      <line x1="304" y1={onderLucht} x2="318" y2={onderLucht} stroke={C.brownText} strokeWidth="2.4" />
      <line x1="330" y1="78" x2="330" y2="404" {...lijn} />
      <line x1="344" y1="78" x2="344" y2="404" {...lijn} />

      {/* onderaan het rookgaskanaal: inspectiestuk met rond deksel en een steun aan de schachtwand */}
      <rect x="326" y="368" width="22" height="26" fill="white" stroke={C.brownText} strokeWidth="1.8" />
      <circle cx={RK} cy="381" r="7" fill="white" stroke={C.brownText} strokeWidth="1.6" />
      <circle cx={RK} cy="381" r="3" fill="none" stroke={C.brownText} strokeWidth="1" />
      <rect x="327" y="397" width="20" height="4" fill={C.brownText} />
      <path d="M347 396 L350 392 V406 L347 402 Z" fill={C.brownText} stroke={C.brownText} strokeWidth="1" strokeLinejoin="round" />
      {/* einde van het rookgaskanaal: verloop naar de sifon */}
      <path d="M330 404 L334 410 H340 L344 404" fill="white" stroke={C.brownText} strokeWidth="1.8" strokeLinejoin="round" />
      {/* sifon onder het einde, afvoer door de linker schachtwand naar de ruimte van het onderste toestel */}
      <path d={`M${RK} 410 V420 Q${RK} 428 330 428 Q323 428 323 420 V414 H264 Q259 414 259 419 V425`} fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* open uitloop boven een trechter, daaronder een sifon en de leiding omlaag naar het riool */}
      <path d="M252 431 L259 438 L266 431" fill="none" stroke={C.brownText} strokeWidth="2" strokeLinejoin="round" />
      <path d="M259 438 V450 Q259 457 265 457 Q271 457 271 450 V444 H278 V494" fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <SpelLabel x={274} y={490} anker="end">riool</SpelLabel>

      {/* stroom in de schacht: lucht via de lamellen aan beide kanten naar binnen en het luchtkanaal in; rookgas omhoog en recht naar buiten */}
      <path d={`M262 44 H304 Q${LK} 44 ${LK} 52 V${onderLucht - 6}`} fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" style={neer} />
      <Pijlpunt x={296} y={44} hoek={0} kleur={BLAUW} maat={6} />
      <path d="M398 44 H360" fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" style={KAP_NEER} />
      <Pijlpunt x={356} y={44} hoek={180} kleur={BLAUW} maat={6} />
      <path d={`M${RK} 360 V6`} fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={op} />
      <Pijlpunt x={RK} y={2} hoek={-90} kleur={C.red} maat={7} />

      {/* per woning: toestel met twee losse leidingen uit de bovenkant */}
      {woningen.map((top) => {
        const yB = top + 16; // bovenste leiding: naar het luchtkanaal
        const yO = top + 28; // onderste leiding: naar het rookgaskanaal
        const kt = top + 46; // bovenkant toestel
        return (
          <g key={top}>
            <rect x="158" y={kt - 8} width="12" height="8" fill="white" stroke={C.brownText} strokeWidth="1.5" />
            <rect x="186" y={kt - 8} width="12" height="8" fill="white" stroke={C.brownText} strokeWidth="1.5" />
            <Pijp d={`M304 ${yB} H164 V${kt - 6}`} kleur={BLAUW} anim={neer} />
            <Pijp d={`M192 ${kt - 6} V${yO} H${RK} V${yO - 8}`} kleur={C.red} anim={op} />
            {/* T-stukken op de kanalen */}
            <rect x="302" y={yB - 7} width="18" height="14" fill="none" stroke={C.brownText} strokeWidth="1.6" />
            <rect x="328" y={yO - 7} width="18" height="14" fill="none" stroke={C.brownText} strokeWidth="1.6" />
            <Toestel x={150} y={kt} />
          </g>
        );
      })}
      <SpelLabel x={144} y={184} anker="end">toestel</SpelLabel>
    </svg>
  );
}

// Legenda onder de tekening (als tekst, zodat hij op een telefoon leesbaar blijft)
function Legenda() {
  return (
    <div className="flex justify-center gap-4 text-xs font-semibold mt-1" style={{ color: C.brownText }}>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={C.red} strokeWidth="3" strokeDasharray="5 4" /></svg>
        rookgas
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke={BLAUW} strokeWidth="3" strokeDasharray="4 3" /></svg>
        lucht
      </span>
    </div>
  );
}

// Pictogrammen op de kanalenschuif: buis in buis of twee buizen naast elkaar
function KanaalIcoon({ soort }) {
  return (
    <svg viewBox="0 0 32 28" width="34" height="28" aria-hidden="true">
      {soort === "conc" ? (
        <g stroke="currentColor" strokeWidth="2" fill="none">
          <rect x="3" y="2" width="26" height="24" rx="3" />
          <rect x="11" y="2" width="10" height="24" rx="2" />
        </g>
      ) : (
        <g stroke="currentColor" strokeWidth="2" fill="none">
          <rect x="2" y="2" width="11" height="24" rx="2" />
          <rect x="19" y="2" width="11" height="24" rx="2" />
        </g>
      )}
    </svg>
  );
}

const R1_DOELEN = [
  {
    id: "conc",
    naam: "een concentrisch CLV",
    lucht: "dak",
    kanalen: "conc",
    goed: "Juist. Bij een concentrisch CLV stroomt de lucht in de ring omlaag en het rookgas in de binnenbuis omhoog.",
    aandacht: "Concentrisch CLV: lucht via de kap in de ring om het rookgaskanaal",
    feiten: ["5.1a-02", "5.2e-01"],
  },
  {
    id: "par",
    naam: "een parallel CLV",
    lucht: "dak",
    kanalen: "par",
    goed: "Juist. Bij een parallel CLV lopen het luchtkanaal en het rookgaskanaal als twee losse buizen naast elkaar.",
    aandacht: "Parallel CLV: luchtkanaal en rookgaskanaal los naast elkaar",
    feiten: ["5.2e-01"],
  },
  {
    id: "half",
    naam: "een half-CLV",
    lucht: "gevel",
    kanalen: null,
    goed: "Juist. Bij een half-CLV is alleen de rookgasafvoer gezamenlijk. Elk toestel haalt zijn lucht zelf, hier door een rooster in de gevel.",
    aandacht: "Half-CLV: alleen de rookgasafvoer is gezamenlijk; lucht per toestel, bijvoorbeeld uit de gevel",
    feiten: ["5.1a-04"],
  },
];

const R1_STANDEN = [
  { lucht: "dak", kanalen: "conc" },
  { lucht: "dak", kanalen: "par" },
  { lucht: "gevel", kanalen: "conc" },
  { lucht: "gevel", kanalen: "par" },
];

function r1Klopt(doel, stand) {
  if (doel.lucht === "gevel") return stand.lucht === "gevel";
  return stand.lucht === "dak" && stand.kanalen === doel.kanalen;
}

function r1FoutUitleg(doel, stand) {
  if (doel.lucht === "gevel") return "Niet goed. Bij een half-CLV is alleen de afvoer gezamenlijk. De lucht komt per toestel binnen, bijvoorbeeld uit de gevel, niet via het dak.";
  if (stand.lucht === "gevel") return "Niet goed. Bij een CLV is ook de lucht gezamenlijk: die komt binnen via de kap op het dak, niet via de gevel.";
  if (doel.kanalen === "conc") return "Niet goed. Concentrisch is een buis in een buis: het luchtkanaal zit om het rookgaskanaal. Twee buizen naast elkaar heet parallel.";
  return "Niet goed. Parallel zijn twee losse kanalen naast elkaar. Een buis in een buis heet concentrisch.";
}

// Een beginstand die nog niet bij het doel past, zodat de speler echt iets moet doen
function r1Beginstand(doel) {
  return kies(R1_STANDEN.filter((s) => !r1Klopt(doel, s)));
}

function R1Bouwen({ beoordeel, noteer, zie, onKlaar }) {
  const [doelen] = useState(() => schud(R1_DOELEN));
  const [index, setIndex] = useState(0);
  const [stand, setStand] = useState(() => r1Beginstand(doelen[0]));
  const [klaar, setKlaar] = useState(false);
  const [melding, setMelding] = useState(null);
  const doel = doelen[index];
  const soort = stand.lucht === "gevel" ? "half" : stand.kanalen;
  useBovenaan("r1-stap1");

  const zet = (veld) => (waarde) => {
    if (klaar) return;
    setStand((s) => ({ ...s, [veld]: waarde }));
  };

  const controleer = (e) => {
    if (klaar) return;
    zie(doel.feiten);
    if (r1Klopt(doel, stand)) {
      beoordeel("goed", e);
      setMelding({ soort: "goed", tekst: doel.goed });
      setKlaar(true);
    } else {
      beoordeel("fout", e);
      noteer(doel.aandacht);
      setMelding({ soort: "fout", tekst: r1FoutUitleg(doel, stand) });
    }
  };

  const volgende = () => {
    if (index + 1 >= doelen.length) {
      onKlaar();
      return;
    }
    const n = index + 1;
    setIndex(n);
    setStand(r1Beginstand(doelen[n]));
    setKlaar(false);
    setMelding(null);
  };

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        nummer={1}
        titel="Welk systeem is dit?"
        stap={1}
        opdracht={`Zet de schuiven zo dat de tekening ${doel.naam} laat zien. Druk dan op Controleer.`}
        gedaan={index + (klaar ? 1 : 0)}
        totaal={doelen.length}
      />
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 w-full max-w-3xl items-center md:items-start">
        <div className="w-full max-w-[270px] md:max-w-sm">
          <FlatDoorsnede soort={soort} />
          <Legenda />
        </div>
        <VasteBalk className="md:flex-1 md:pt-8">
          <div className="flex flex-row md:flex-col gap-2 md:gap-4 justify-center items-center">
            <Schuif
              titel="Lucht komt via"
              opties={[{ id: "dak", inhoud: "dak" }, { id: "gevel", inhoud: "gevel" }]}
              waarde={stand.lucht}
              onChange={zet("lucht")}
              breedte={160}
            />
            <Schuif
              titel="Kanalen"
              opties={[
                { id: "conc", inhoud: <KanaalIcoon soort="conc" />, label: "buis in buis" },
                { id: "par", inhoud: <KanaalIcoon soort="par" />, label: "twee buizen naast elkaar" },
              ]}
              waarde={stand.kanalen}
              onChange={zet("kanalen")}
              uit={stand.lucht === "gevel"}
              breedte={150}
            />
          </div>
          {!klaar ? (
            <GameButton onClick={controleer} className="w-full md:w-auto md:self-center">Controleer</GameButton>
          ) : (
            <GameButton onClick={volgende} variant="green" className="w-full md:w-auto md:self-center">
              {index + 1 >= doelen.length ? "Naar stap 2" : "Volgende"}
              <ArrowRight className="w-4 h-4" />
            </GameButton>
          )}
          <Melding melding={melding} />
        </VasteBalk>
      </div>
    </div>
  );
}

// Stap 2: bij welke systemen past een eigenschap? Vaak bij meer dan een,
// zodat de speler moet redeneren in plaats van een woord te herkennen.
const R1_SYSTEMEN = [
  { id: "conc", naam: "Concentrisch CLV" },
  { id: "par", naam: "Parallel CLV" },
  { id: "half", naam: "Half-CLV" },
];

const R1_EIGENSCHAPPEN = {
  clv: [
    { id: "kap", tekst: "De verbrandingslucht komt boven het dak via de kap binnen.", juist: ["conc", "par"], uitleg: "Bij concentrisch en parallel CLV is de lucht gezamenlijk en komt die via de kap binnen. Bij half-CLV haalt elk toestel zijn lucht zelf.", feiten: ["5.1a-01", "5.1a-02", "5.1a-04"] },
    { id: "luchtkanaal", tekst: "In de schacht zit een luchtkanaal.", juist: ["conc", "par"], uitleg: "Concentrisch en parallel CLV hebben allebei een gezamenlijk luchtkanaal in de schacht. Half-CLV heeft alleen de afvoer.", feiten: ["5.1a-01", "5.1a-04"] },
    { id: "luchtleiding", tekst: "De luchtleiding van het toestel loopt naar de schacht.", juist: ["conc", "par"], uitleg: "Bij concentrisch en parallel CLV haalt het toestel zijn lucht uit de schacht. Bij half-CLV niet: daar komt de lucht per toestel binnen.", feiten: ["5.1a-01", "5.1a-04"] },
  ],
  alle: [
    { id: "afvoer", tekst: "Het rookgas van alle toestellen gaat door een gezamenlijke afvoer.", juist: ["conc", "par", "half"], uitleg: "Een gezamenlijke rookgasafvoer hebben ze alle drie. Het verschil zit in de lucht.", feiten: ["5.1a-01", "5.1a-04"] },
    { id: "omhoog", tekst: "In de schacht stroomt rookgas omhoog naar het dak.", juist: ["conc", "par", "half"], uitleg: "Bij alle drie gaat het rookgas in de schacht omhoog en boven het dak naar buiten.", feiten: ["5.1a-02", "5.1a-04"] },
  ],
  conc: [
    { id: "om", tekst: "Het luchtkanaal zit om het rookgaskanaal heen.", juist: ["conc"], uitleg: "Lucht om het rookgaskanaal heen, een buis in een buis: dat is alleen bij concentrisch.", feiten: ["5.2e-01"] },
    { id: "ring", tekst: "De lucht stroomt omlaag in een ring om de binnenbuis.", juist: ["conc"], uitleg: "Een ring om de binnenbuis is er alleen bij concentrisch. Bij parallel heeft de lucht een eigen buis.", feiten: ["5.1a-02", "5.2e-01"] },
  ],
  par: [
    { id: "naast", tekst: "Lucht en rookgas hebben elk een eigen buis, naast elkaar in de schacht.", juist: ["par"], uitleg: "Twee losse buizen naast elkaar is parallel. Concentrisch is een buis in een buis; half-CLV heeft geen luchtbuis.", feiten: ["5.2e-01", "5.1a-04"] },
  ],
  half: [
    { id: "zelf", tekst: "Elk toestel haalt zijn verbrandingslucht zelf, bijvoorbeeld uit de gevel.", juist: ["half"], uitleg: "Lucht per toestel, bijvoorbeeld uit de gevel: dat is half-CLV. Bij een CLV is de lucht gezamenlijk.", feiten: ["5.1a-04"] },
    { id: "alleenafvoer", tekst: "In de schacht zit alleen de afvoer, geen luchtkanaal.", juist: ["half"], uitleg: "Alleen een afvoer in de schacht is half-CLV. Concentrisch en parallel hebben ook een luchtkanaal.", feiten: ["5.1a-04"] },
  ],
};

function maakR1Eigenschappen() {
  return schud(["clv", "alle", "conc", "par", "half"].map((g) => kies(R1_EIGENSCHAPPEN[g])));
}

function R1Eigenschappen({ beoordeel, noteer, zie, onKlaar }) {
  const [items] = useState(maakR1Eigenschappen);
  const [index, setIndex] = useState(0);
  const [keuze, setKeuze] = useState([]);
  const [beantwoord, setBeantwoord] = useState(false);
  const [melding, setMelding] = useState(null);
  const item = items[index];
  const laatste = index + 1 >= items.length;
  useBovenaan("r1-stap2");

  const wissel = (id) => {
    if (beantwoord) return;
    setKeuze((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  };

  const controleer = (e) => {
    if (beantwoord) return;
    zie(item.feiten);
    const goed = keuze.length === item.juist.length && item.juist.every((j) => keuze.includes(j));
    if (goed) {
      beoordeel("goed", e);
      setMelding({ soort: "goed", tekst: `Juist. ${item.uitleg}` });
      setBeantwoord(true);
    } else {
      beoordeel("fout", e);
      noteer(`${item.tekst.replace(/\.$/, "")}: ${item.juist.map((j) => R1_SYSTEMEN.find((s) => s.id === j).naam).join(", ")}`);
      setMelding({ soort: "fout", tekst: `Niet goed. ${item.uitleg} Pas je keuze aan.` });
    }
  };

  const volgende = () => {
    setIndex((i) => i + 1);
    setKeuze([]);
    setBeantwoord(false);
    setMelding(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <OpdrachtKop
        nummer={1}
        titel="Welk systeem is dit?"
        stap={2}
        opdracht="Bij welke systemen past deze eigenschap? Vaak is het er meer dan een. Tik ze aan en druk op Controleer."
        gedaan={index + (beantwoord ? 1 : 0)}
        totaal={items.length}
      />
      <div className="flex flex-col gap-3 w-full max-w-md">
        <div className="rounded-2xl border-2 p-4 text-center shadow-md" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: C.olive }}>Eigenschap</div>
          <div className="text-base font-bold italic" style={{ color: C.brownText }}>{item.tekst}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {R1_SYSTEMEN.map((sys) => {
            const aan = keuze.includes(sys.id);
            return (
              <button
                key={sys.id}
                type="button"
                aria-pressed={aan}
                onClick={() => wissel(sys.id)}
                disabled={beantwoord}
                className="min-h-[52px] rounded-xl border-2 px-1 text-sm font-bold leading-tight transition-colors disabled:cursor-default"
                style={{ backgroundColor: aan ? C.olive : C.bgCard, borderColor: aan ? C.oliveDark : C.beigeMid, color: aan ? "white" : C.brownText }}
              >
                {aan ? "✓ " : ""}
                {sys.naam}
              </button>
            );
          })}
        </div>
        {!beantwoord && (
          <GameButton onClick={controleer} disabled={keuze.length === 0} className="w-full">
            Controleer
          </GameButton>
        )}
        <Melding melding={melding} />
        {beantwoord &&
          (laatste ? (
            <GameButton onClick={onKlaar} variant="green" className="w-full">Naar de controlevragen</GameButton>
          ) : (
            <GameButton onClick={volgende} variant="green" className="w-full">
              Volgende eigenschap
              <ArrowRight className="w-4 h-4" />
            </GameButton>
          ))}
      </div>
    </div>
  );
}

function Ronde1({ beoordeel, noteer, zie, onDone, qaFase }) {
  const [fase, setFase] = useState(() => startFase(qaFase));
  if (fase === "intro") {
    return (
      <RondeIntro title="Ronde 1: Welk systeem is dit?" intro="In veel flats zijn de toestellen aangesloten op kanalen in een schacht. In deze ronde zie je drie uitvoeringen." onStart={() => setFase("stap1")}>
        <UitlegItem term="CLV">
          alle toestellen op de schacht delen een luchtkanaal en een rookgaskanaal. De lucht komt boven het dak via de kap binnen.
        </UitlegItem>
        <UitlegItem term="Half-CLV">
          alleen de rookgasafvoer is gezamenlijk. Elk toestel haalt zijn lucht zelf, bijvoorbeeld via een rooster in de gevel. De afvoer werkt op natuurlijke trek. Door trek en wind kunnen grote drukverschillen over het toestel ontstaan; het toestel moet daartegen bestand zijn.
        </UitlegItem>
        <UitlegItem term="Concentrisch of parallel">
          concentrisch is een buis in een buis: het luchtkanaal zit om het rookgaskanaal. Parallel zijn het twee losse kanalen naast elkaar. De norm voor het onderdruk-CLV (NPR 3378-40) gaat alleen over metalen, concentrische systemen.
        </UitlegItem>
      </RondeIntro>
    );
  }
  if (fase === "stap1") return <R1Bouwen beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={() => setFase("stap2")} />;
  return <R1Eigenschappen beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={onDone} />;
}

// ─── RONDE 2: ONDERDRUK OF OVERDRUK? ───

// Schacht volgens NPR 3378-40 fig 1 (onderdruk) of C10 fig 1 (overdruk).
// Onderdruk: schachtwanden, kap met gaasroosters, twee losse aansluitleidingen
// per toestel, binnenbuis eindigt open boven de opvangtrechter, voetstuk met
// drie openingen, inspectieluik en dubbele sifon. Overdruk: geen
// schachtwanden, kap met gaasblok, concentrische aansluitleiding, binnenbuis
// onderaan dicht met eigen sifon, twee deksels op het kanaal en een opvang
// met afvoer. De overige elementen (klepje, tekens, waarschuwingen) zijn
// spelaanwijzingen die alleen in een casus verschijnen.
const T1 = { y: 138 };
const T2 = { y: 256 };
const leidingY = (t) => ({ rook: t.y - 20, lucht: t.y - 11 });

function Badge({ x, y, tekst, kleur, breed = 20 }) {
  return (
    <g data-spel="teken">
      <rect x={x - breed / 2} y={y - 12} width={breed} height="24" rx="12" fill="white" stroke={kleur} strokeWidth="1.8" />
      <text x={x} y={y + 6} fontSize="17" fontWeight="800" fill={kleur} textAnchor="middle">{tekst}</text>
    </g>
  );
}

// Concentrische aansluitleiding (C(10)): uit de bovenkant van het toestel omhoog en
// horizontaal naar het kanaal. De buitenpijp sluit aan op de buitenbuis (lucht uit de
// ring naar het toestel, blauw); de binnenpijp loopt door de ring tot de binnenbuiswand
// en het rookgas buigt in de binnenbuis omhoog (rood). Werkt naar rechts en naar links.
function ConcLeiding({ x, y, yH, buiten, binnen, cx, stil = false, op, neer }) {
  const r = buiten > x ? 1 : -1; // richting naar het kanaal: -1 = naar links
  const off = 4.2; // blauw loopt in de buitenbocht, tussen binnenpijp en buitenpijp
  return (
    <g>
      <path d={`M${x} ${y} V${yH} H${buiten}`} fill="none" stroke={C.brownText} strokeWidth="13" strokeLinejoin="round" />
      <path d={`M${x} ${y} V${yH} H${buiten}`} fill="none" stroke="white" strokeWidth="10" strokeLinejoin="round" />
      <path d={`M${x} ${y} V${yH} H${binnen}`} fill="none" stroke={C.brownText} strokeWidth="5.5" strokeLinejoin="round" />
      <path d={`M${x} ${y} V${yH} H${binnen}`} fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round" />
      {!stil && (
        <>
          <path d={`M${buiten} ${yH - off} H${x - r * off} V${y}`} fill="none" stroke={BLAUW} strokeWidth="1.3" style={neer} />
          <path d={`M${x} ${y} V${yH} H${cx} V${yH - 12}`} fill="none" stroke={C.red} strokeWidth="2" style={op} />
        </>
      )}
    </g>
  );
}

function DrukSchacht({ modus, scene = {} }) {
  const over = modus === "overdruk";
  const zwak = scene.trek === "zwak";
  const op = { strokeDasharray: "8 6", animation: `flowDash ${zwak ? "2.6s" : over ? "0.45s" : "1s"} linear infinite` };
  const neer = { strokeDasharray: "6 5", animation: `flowDash ${zwak ? "2.6s" : "1.1s"} linear infinite` };
  const terug = { strokeDasharray: "7 5", animation: "flowDash 0.6s linear infinite" };
  const lijn = { stroke: C.brownText, strokeWidth: 2 };
  const cx = 105;
  const dak = 98; // bovenkant dak
  const toestellen = [T1, T2];
  const uit = (t) => scene.uit === t;
  const klepX = over ? 221 : 230;
  // C10 fig 1 tekent de binnenbuis breed en de ring smal; N40 fig 1 andersom
  const IL = over ? 94 : 98;
  const IR = over ? 116 : 112;
  const ringL = over ? 90 : 92;
  const ringR = over ? 120 : 118;
  const lbl = { fontSize: 17, fontWeight: 700 };

  return (
    <svg viewBox="0 0 340 432" className="w-full h-auto select-none" role="img" aria-label={over ? "Overdruk-CLV" : "Onderdruk-CLV"}>
      <Patronen achtervoegsel="V2" />

      {/* vloeren en dak: gearceerd met schachtwanden (onderdruk, fig 1), los blok zonder wanden (overdruk, fig 1 C10) */}
      {!over ? (
        <>
          <rect x="66" y={dak + 12} width="10" height={414 - dak - 12} fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
          <rect x="134" y={dak + 12} width="10" height={414 - dak - 12} fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
          {[dak, 216].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="76" height="12" fill="url(#arceringV2)" stroke={C.brownText} strokeWidth="1.8" />
              <rect x="124" y={y} width="206" height="12" fill="url(#arceringV2)" stroke={C.brownText} strokeWidth="1.8" />
            </g>
          ))}
          <rect x="4" y="414" width="330" height="12" fill="url(#arceringV2)" stroke={C.brownText} strokeWidth="1.8" />
        </>
      ) : (
        <>
          {[dak, 216].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="70" height="11" fill="white" stroke={C.brownText} strokeWidth="1.6" />
              <rect x="130" y={y} width="200" height="11" fill="white" stroke={C.brownText} strokeWidth="1.6" />
            </g>
          ))}
          <line x1="4" y1="414" x2="334" y2="414" stroke={C.brownText} strokeWidth="1.8" />
          <line x1="4" y1="426" x2="334" y2="426" stroke={C.brownText} strokeWidth="1.8" />
        </>
      )}

      {/* het concentrische kanaal */}
      <line x1="86" y1={dak} x2="86" y2={over ? 414 : 392} {...lijn} />
      <line x1="124" y1={dak} x2="124" y2={over ? 414 : 392} {...lijn} />
      <line x1={IL} y1={dak} x2={IL} y2={over ? 338 : 350} {...lijn} />
      <line x1={IR} y1={dak} x2={IR} y2={over ? 338 : 350} {...lijn} />

      {!over ? (
        <g>
          {/* onderzijde onderdruk: open einde, trechter, voetstuk met drie openingen, luik en dubbele sifon */}
          <path d="M86 372 L101 384 H109 L124 372" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          <path d="M105 384 V388 H150" fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="86" y="392" width="38" height="22" fill="white" stroke={C.brownText} strokeWidth="1.8" />
          {[96, 105, 114].map((x) => <circle key={x} cx={x} cy="403" r="3.6" fill="none" stroke={C.brownText} strokeWidth="1.3" />)}
          {/* einde van de binnenbuis: dwarslijn over de volle breedte */}
          <line x1={IL} y1="350" x2={IR} y2="350" stroke={C.brownText} strokeWidth="2.4" />
          {/* bouwkundig luik: opening in de rechterschachtwand, plaat aan de woningkant, vast boven en onder */}
          <rect x="134" y="338" width="10" height="26" fill="white" />
          <rect x="144" y="334" width="5" height="34" fill="white" stroke={C.brownText} strokeWidth="1.5" />
          <line x1="149" y1="338" x2="155" y2="338" stroke={C.brownText} strokeWidth="1.4" />
          <line x1="149" y1="364" x2="155" y2="364" stroke={C.brownText} strokeWidth="1.4" />
          {/* inspectiedeksel: kort stompje rechts op de buitenbuis met een rond, geribbeld deksel */}
          <rect x="124" y="346" width="4" height="10" fill="white" stroke={C.brownText} strokeWidth="1.3" />
          <rect x="128" y="341" width="5" height="20" rx="2.5" fill="white" stroke={C.brownText} strokeWidth="1.4" />
          {[345, 349, 353, 357].map((y) => <line key={y} x1="129" y1={y} x2="132" y2={y} stroke={C.brownText} strokeWidth="0.9" />)}
          <SpelLabel x={160} y={356}>luik</SpelLabel>
          <DrainageTrein x={150} y={388} s={0.8} strokeWidth={2.2} riool={false} />
          <path d="M180 392 H206" fill="none" stroke={C.brownText} strokeWidth="2.2" strokeLinecap="round" />
          <SpelLabel x={212} y={397}>riool</SpelLabel>
          <KapF1 cx={cx} y0={dak} w={19} wi={7} gaasId="gaasV2" />
        </g>
      ) : (
        <g>
          {/* onderzijde overdruk: binnenbuis dicht met sifon, twee deksels, opvang met afvoer */}
          <line x1={IL} y1="338" x2={IR} y2="338" stroke={C.brownText} strokeWidth="2.4" />
          {/* klein zijstuk met deksel rechts op de binnenbuis, net boven haar bodem */}
          <rect x={IR} y="328" width="4.5" height="7" fill="white" stroke={C.brownText} strokeWidth="1.1" />
          <rect x={IR + 4.5} y="326" width="2.5" height="11" fill="white" stroke={C.brownText} strokeWidth="1.1" />
          <path d="M103 338 V350 Q103 355 107 355 Q111 355 111 350 V345" fill="none" stroke={C.brownText} strokeWidth="1.6" />
          {[326, 352].map((y) => (
            <g key={y}>
              <rect x="124" y={y} width="7" height="16" fill="white" stroke={C.brownText} strokeWidth="1.4" />
              <path d={`M131 ${y + 4} Q137 ${y + 8} 131 ${y + 12}`} fill="none" stroke={C.brownText} strokeWidth="1.2" />
            </g>
          ))}
          <path d="M86 384 Q105 392 124 384" fill="none" stroke={C.brownText} strokeWidth="1.4" />
          <path d="M100 390 V396 H150 L156 391" fill="none" stroke={C.brownText} strokeWidth="1.8" strokeLinejoin="round" />
          <line x1="86" y1="414" x2="124" y2="414" stroke={C.brownText} strokeWidth="2" />
          <KapF4 cx={cx} y0={dak} w={19} wi={11} gaasId="gaasV2" />
        </g>
      )}

      {/* stroming in het kanaal */}
      <path d={`M${cx} ${over ? 334 : 346} V${dak - 40}`} fill="none" stroke={C.red} strokeWidth={zwak ? 2 : over ? 4.5 : 3.5} strokeLinecap="round" style={op} />
      <path d={`M${ringL} ${dak + 6} V${over ? 330 : 346}`} fill="none" stroke={BLAUW} strokeWidth={zwak ? 1.6 : 2.2} style={neer} />
      {over ? (
        <path d={`M${ringR} ${dak + 6} V320`} fill="none" stroke={BLAUW} strokeWidth={zwak ? 1.6 : 2.2} style={neer} />
      ) : (
        <>
          {/* rechter ring: langs het einde van de binnenbuis omlaag en eronder naar links (doorgetrokken pijl) */}
          <path d={`M${ringR} ${dak + 6} V358 Q${ringR} 362 ${ringR - 4} 362 H108`} fill="none" stroke={BLAUW} strokeWidth={zwak ? 1.6 : 2.2} style={neer} />
          <path d={`M${ringR} 344 V358 Q${ringR} 362 ${ringR - 4} 362 H108`} fill="none" stroke={BLAUW} strokeWidth="1.3" />
          <Pijlpunt x={104} y={362} hoek={180} kleur={BLAUW} maat={5} />
        </>
      )}

      {/* toestellen met aansluitleidingen */}
      {toestellen.map((t) => {
        const { rook, lucht } = leidingY(t);
        const stil = uit(t);
        return (
          <g key={t.y}>
            {!over ? (
              <>
                <Pijp d={`M230 ${t.y} V${rook} H${cx} V${rook - 10}`} kleur={stil ? null : C.red} anim={op} dik={7} />
                <Pijp d={`M124 ${lucht} H214 V${t.y}`} kleur={stil ? null : BLAUW} anim={neer} dik={7} />
              </>
            ) : (
              <ConcLeiding x={221} y={t.y} yH={rook + 4} buiten={124} binnen={IR} cx={cx} stil={stil} op={op} neer={neer} />
            )}
            <rect x="196" y={t.y} width="48" height="56" fill={stil ? "#EDEDED" : "white"} stroke={C.brownText} strokeWidth="2" />
            {!over && <rect x="200" y={t.y + 42} width="20" height="8" fill="white" stroke={C.brownText} strokeWidth="1" />}
            {scene.status && (
              <text data-spel="status" x="220" y={t.y + 34} fontSize="17" fontWeight="800" fill={stil ? C.brown : C.green} textAnchor="middle">
                {stil ? "UIT" : "AAN"}
              </text>
            )}
          </g>
        );
      })}

      {/* ── spelaanwijzingen per casus ── */}
      {scene.klep === "vraag" && (
        <g data-spel="klep">
          <circle cx={klepX} cy={T2.y - 6} r="7" fill="white" stroke={ORANJE} strokeWidth="2" strokeDasharray="3 2" />
          <text x={klepX} y={T2.y} fontSize="17" fontWeight="800" fill={ORANJE} textAnchor="middle">?</text>
        </g>
      )}
      {scene.klep === "dicht" && (
        <g data-spel="klep">
          <circle cx={klepX} cy={T2.y - 6} r="7" fill={C.greenLight} stroke={C.green} strokeWidth="2" />
          <line x1={klepX - 5} y1={T2.y - 6} x2={klepX + 5} y2={T2.y - 6} stroke={C.green} strokeWidth="2.5" />
          <text x={klepX + 12} y={T2.y - 1} {...lbl} fill={C.green}>klepje dicht</text>
        </g>
      )}
      {scene.terug && (
        <g data-spel="terug">
          {/* zonder klepje stroomt rookgas uit het kanaal terug de stilstaande ketel in (C10 bijlage D) */}
          <path d={`M${cx} ${leidingY(T2).rook - 6} V${leidingY(T2).rook + 4} H${klepX} V${T2.y + 26}`} fill="none" stroke={C.red} strokeWidth="3.5" style={terug} />
          <Pijlpunt x={klepX} y={T2.y + 33} hoek={90} kleur={C.red} maat={7} />
          <circle cx="220" cy={T2.y + 30} r="18" fill={C.red} opacity="0.18" style={{ animation: "pulseGlow 1.2s ease-in-out infinite" }} />
          <text x="250" y={T2.y + 22} {...lbl} fill={C.red}>rookgas</text>
          <text x="250" y={T2.y + 39} {...lbl} fill={C.red}>terug</text>
        </g>
      )}
      {scene.derde && (
        <g data-spel="derde">
          {/* tweede toestel op dezelfde verdieping, links van het kanaal */}
          {/* concentrische aansluitleiding, net als rechts: buitenpijp tot het kanaal, binnenleiding tot in de binnenbuis */}
          <ConcLeiding x={36} y={T2.y} yH={leidingY(T2).rook + 4} buiten={86} binnen={IL} cx={cx} op={op} neer={neer} />
          <rect x="12" y={T2.y} width="48" height="56" fill="white" stroke={C.brownText} strokeWidth="2" />
          <text x="36" y={T2.y + 33} {...lbl} fill={C.brownText} textAnchor="middle">2e</text>
          <text x="220" y={T2.y + 33} {...lbl} fill={C.brownText} textAnchor="middle">1e</text>
          <rect x="262" y={T2.y} width="48" height="56" fill="white" stroke={scene.derde === "nee" ? C.red : ORANJE} strokeWidth="2" strokeDasharray="5 4" />
          <text x="286" y={T2.y - 6} {...lbl} fill={scene.derde === "nee" ? C.red : ORANJE} textAnchor="middle">3e?</text>
          {scene.derde === "nee" && (
            <g stroke={C.red} strokeWidth="3" strokeLinecap="round">
              <line x1="266" y1={T2.y + 4} x2="306" y2={T2.y + 52} />
              <line x1="306" y1={T2.y + 4} x2="266" y2={T2.y + 52} />
            </g>
          )}
        </g>
      )}
      {scene.markeerOnder && (
        <rect data-spel="markeer" x="88" y="318" width="34" height="44" rx="6" fill="none" stroke={ORANJE} strokeWidth="2.5" strokeDasharray="5 3" />
      )}
      {scene.wind && (
        <g data-spel="wind" stroke={C.brown} strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M8 40 q10 -6 20 0 t20 0" />
          <path d="M8 54 q10 -6 20 0 t20 0" />
          <text x="8" y="28" {...lbl} fill={C.brown} stroke="none">wind</text>
        </g>
      )}
      {scene.storing &&
        toestellen.map((t) => (
          <g key={`s${t.y}`} data-spel="storing">
            <circle cx="244" cy={t.y} r="9" fill={C.red} />
            <text x="244" y={t.y + 4} fontSize="12" fontWeight="900" fill="white" textAnchor="middle">!</text>
          </g>
        ))}
      {scene.tekens === "aansluiting" &&
        toestellen.map((t) => (
          <g key={`a${t.y}`} data-spel="tekens">
            <Badge x={170} y={leidingY(t).rook} tekst="+" kleur={C.red} />
            <Badge x={cx} y={t.y + 40} tekst="−" kleur={BLAUW} />
          </g>
        ))}
      {scene.tekens === "verschil" &&
        toestellen.map((t) => (
          <g key={`v${t.y}`} data-spel="tekens">
            <Badge x={166} y={leidingY(t).rook - 6} tekst="lager" kleur={C.red} breed={56} />
            <Badge x={166} y={leidingY(t).lucht + 16} tekst="hoger" kleur={BLAUW} breed={56} />
          </g>
        ))}
      {scene.tekens === "overdruk" &&
        toestellen.map((t) => <Badge key={`o${t.y}`} x={cx} y={t.y + 40} tekst="+" kleur={C.red} />)}
    </svg>
  );
}

// Casussen voor stap 1. "klep" zit er altijd in; daarnaast een uit de
// onderdrukgroep en een uit de overdrukgroep.
const R2_CASUSSEN = {
  klep: {
    modus: "overdruk",
    vraag: "Overdruk-CLV C(10). De bovenste ketel brandt, de onderste staat uit. Wat moet de onderste ketel hebben?",
    opties: [
      { id: "met", tekst: "Een terugslagklepje", juist: true },
      { id: "tob", tekst: "Een trekonderbreker" },
      { id: "maakt", tekst: "Niets, hij staat toch uit" },
    ],
    voor: { status: true, uit: T2, klep: "vraag" },
    na: (goed) => (goed ? { status: true, uit: T2, klep: "dicht", tekens: "overdruk" } : { status: true, uit: T2, terug: true, tekens: "overdruk" }),
    goed: "Juist. Bij een overdruk-CLV C(10) moet elk toestel een terugslagklepje hebben. Zonder klepje kan rookgas terugstromen de stilstaande ketel in.",
    fout: "Niet goed. Kijk: zonder klepje stroomt rookgas terug de stilstaande ketel in. Bij overdruk moet elk toestel een terugslagklepje hebben.",
    aandacht: "Overdruk-CLV C(10): elk toestel moet een terugslagklepje hebben",
    feiten: ["5.2b-01", "5.2b-05", "5.1c-06"],
  },
  derde: {
    modus: "overdruk",
    vraag: "Overdruk-CLV C(10). Op deze verdieping hangen al 2 ketels. Mag er een derde bij?",
    opties: [
      { id: "nee", tekst: "Nee, maximaal 2 toestellen per verdieping", juist: true },
      { id: "breed", tekst: "Ja, als het kanaal breed genoeg is" },
      { id: "klep", tekst: "Ja, als elke ketel een terugslagklepje heeft" },
    ],
    voor: { derde: "vraag" },
    na: () => ({ derde: "nee" }),
    goed: "Juist. Op een overdruk-CLV C(10) mogen per verdieping maximaal 2 toestellen.",
    fout: "Niet goed. Op een overdruk-CLV C(10) mogen per verdieping niet meer dan 2 toestellen.",
    aandacht: "Overdruk-CLV C(10): maximaal 2 toestellen per verdieping",
    feiten: ["5.1f-03", "5.1a-05"],
  },
  trekonderbreker: {
    modus: "overdruk",
    vraag: "Een trekonderbreker is een onderdeel dat, als het er is, onderaan de rookgasafvoer zit. Mag dat onderin dit overdruk-CLV C(10)?",
    opties: [
      { id: "nee", tekst: "Nee, dat is niet toegestaan", juist: true },
      { id: "ja", tekst: "Ja, die hoort onderin elk CLV" },
      { id: "hoog", tekst: "Ja, maar alleen bij meer dan 2 verdiepingen" },
    ],
    voor: { markeerOnder: true },
    na: () => ({ markeerOnder: true }),
    goed: "Juist. Bij een overdruk-CLV C(10) mag onderaan geen trekonderbreker zitten. De binnenbuis is daar dicht.",
    fout: "Niet goed. Bij een overdruk-CLV C(10) is een trekonderbreker onderaan niet toegestaan.",
    aandacht: "Overdruk-CLV C(10): geen trekonderbreker onderaan",
    feiten: ["5.2c-01", "5.2c-02"],
  },
  hr: {
    modus: "onderdruk",
    vraag: "Onderdruk-CLV. Alle oude ketels worden vervangen door HR-ketels met veel koeler rookgas. Wat doet de trek?",
    opties: [
      { id: "minder", tekst: "De trek wordt minder", juist: true },
      { id: "meer", tekst: "De trek wordt sterker" },
      { id: "gelijk", tekst: "De trek blijft gelijk" },
    ],
    voor: {},
    na: () => ({ trek: "zwak", storing: true }),
    goed: "Juist. Koeler rookgas geeft minder trek. Het systeem voert dan niet altijd alles af en er komen meer storingen.",
    fout: "Niet goed. Trek ontstaat doordat heet rookgas opstijgt. Koeler rookgas geeft dus minder trek en meer storingen.",
    aandacht: "Onderdruk-CLV: koel rookgas van HR-ketels geeft minder trek",
    feiten: ["5.1c-05", "5.1c-02"],
  },
  ventilator: {
    modus: "onderdruk",
    vraag: "Onderdruk-CLV. Ook deze ketels hebben een ventilator. Waar geeft die ventilator overdruk?",
    opties: [
      { id: "aansluiting", tekst: "Alleen in de aansluitleiding naar de schacht", juist: true },
      { id: "kanaal", tekst: "In het hele rookgaskanaal" },
      { id: "lucht", tekst: "In het luchtkanaal" },
    ],
    voor: {},
    na: () => ({ tekens: "aansluiting" }),
    goed: "Juist. Bij onderdruk geeft de ventilator alleen overdruk in de aansluitleiding. In het kanaal zorgt de trek voor het transport.",
    fout: "Niet goed. Bij onderdruk telt de ventilator alleen tot aan de schacht. In het rookgaskanaal zelf is onderdruk.",
    aandacht: "Onderdruk-CLV: de toestelventilator geeft alleen overdruk in de aansluitleiding",
    feiten: ["5.1c-04", "5.1c-01", "5.1c-03"],
  },
  verschil: {
    modus: "onderdruk",
    vraag: "Onderdruk-CLV. Wat moet bij elke ketel altijd zo zijn, ook bij harde wind?",
    opties: [
      { id: "lucht", tekst: "De druk aan de luchtkant is hoger dan aan de rookgaskant", juist: true },
      { id: "rook", tekst: "De druk aan de rookgaskant is hoger dan aan de luchtkant" },
      { id: "gelijk", tekst: "De druk is aan beide kanten precies gelijk" },
    ],
    voor: { wind: true },
    na: () => ({ wind: true, tekens: "verschil" }),
    goed: "Juist. Dat is de belangrijkste eis aan een onderdruk-CLV: bij elk toestel is de luchtkant altijd hoger dan de rookgaskant.",
    fout: "Niet goed. Bij onderdruk is de druk in het rookgaskanaal juist lager. Bij elk toestel moet de luchtkant dus altijd hoger zijn.",
    aandacht: "Onderdruk-CLV: bij elk toestel altijd hogere druk aan de luchtkant dan aan de rookgaskant",
    feiten: ["5.1a-03", "5.1c-03"],
  },
};

function maakR2Casussen() {
  const ids = ["klep", kies(["hr", "ventilator", "verschil"]), kies(["derde", "trekonderbreker"])];
  return schud(ids).map((id) => ({ id, ...R2_CASUSSEN[id], opties: schud(R2_CASUSSEN[id].opties) }));
}

// Op een telefoon: schuif de pagina zo dat de hele tekening boven de vaste
// balk staat (de balk meldt zijn hoogte in --balk-hoogte). Zo ziet de speler
// het gevolg in de tekening, ook als de balk na een antwoord groeit.
function useTekeningBovenBalk(ref, sleutel) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const balk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--balk-hoogte")) || 0;
      if (balk <= 0) return;
      const r = el.getBoundingClientRect();
      const onderrand = window.innerHeight - balk - 8;
      if (r.bottom <= onderrand) return;
      // niet verder dan de bovenkant van de tekening
      const dy = Math.min(r.bottom - onderrand, Math.max(0, r.top - 8));
      if (dy > 0) window.scrollBy({ top: dy, behavior: "smooth" });
    }, 120);
    return () => clearTimeout(timer);
  }, [ref, sleutel]);
}

function SysteemLabel({ modus }) {
  return (
    <div
      className="rounded-lg px-3 py-1 mb-1 text-center text-sm font-bold italic border-2"
      style={{ borderColor: C.brownText, backgroundColor: modus === "overdruk" ? "#FDEBDD" : C.oliveLight, color: C.brownText }}
    >
      {modus === "overdruk" ? "Overdruk-CLV C(10)" : "Onderdruk-CLV"}
    </div>
  );
}

function R2Casussen({ beoordeel, noteer, zie, onKlaar }) {
  const [casussen] = useState(maakR2Casussen);
  const [index, setIndex] = useState(0);
  const [fout, setFout] = useState([]);
  const [goedGekozen, setGoedGekozen] = useState(false);
  // na een fout eerst de tekening bekijken: de keuzes komen terug met "Kies opnieuw"
  const [kijken, setKijken] = useState(false);
  const [melding, setMelding] = useState(null);
  const tekeningRef = useRef(null);
  const casus = casussen[index];
  const scene = goedGekozen ? casus.na(true) : fout.length > 0 ? casus.na(false) : casus.voor;
  useBovenaan(`r2-casus-${index}`);
  useTekeningBovenBalk(tekeningRef, `${index}-${fout.length}-${goedGekozen}-${kijken}`);

  const kiesOptie = (optie, e) => {
    if (goedGekozen || fout.includes(optie.id)) return;
    zie(casus.feiten);
    if (optie.juist) {
      beoordeel("goed", e);
      setGoedGekozen(true);
      setMelding({ soort: "goed", tekst: casus.goed });
    } else {
      beoordeel("fout", e);
      noteer(casus.aandacht);
      setFout((f) => [...f, optie.id]);
      setKijken(true);
      setMelding({ soort: "fout", tekst: casus.fout });
    }
  };

  const volgende = () => {
    if (index + 1 >= casussen.length) {
      onKlaar();
      return;
    }
    setIndex(index + 1);
    setFout([]);
    setGoedGekozen(false);
    setKijken(false);
    setMelding(null);
  };

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        nummer={2}
        titel="Onderdruk of overdruk?"
        stap={1}
        opdracht="Lees wat er aan de hand is en kies wat klopt. Kijk wat er in de tekening gebeurt."
        gedaan={index + (goedGekozen ? 1 : 0)}
        totaal={casussen.length}
      />
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-center md:items-start">
        <div ref={tekeningRef} className="w-full max-w-[250px] md:max-w-[330px]">
          <SysteemLabel modus={casus.modus} />
          <DrukSchacht modus={casus.modus} scene={scene} />
        </div>
        <VasteBalk className="md:flex-1">
          <p className="text-sm font-bold" style={{ color: C.brownText }}>{casus.vraag}</p>
          <Melding melding={melding} />
          {!goedGekozen && kijken && (
            <GameButton onClick={() => setKijken(false)} variant="secondary" className="w-full">
              Kies opnieuw
            </GameButton>
          )}
          {!goedGekozen &&
            !kijken &&
            casus.opties.map((o) => (
              <KeuzeKnop key={o.id} onClick={(e) => kiesOptie(o, e)} disabled={fout.includes(o.id)} fout={fout.includes(o.id)}>
                {o.tekst}
              </KeuzeKnop>
            ))}
          {goedGekozen && (
            <GameButton onClick={volgende} variant="green" className="w-full">
              {index + 1 >= casussen.length ? "Naar stap 2" : "Volgende situatie"}
              <ArrowRight className="w-4 h-4" />
            </GameButton>
          )}
        </VasteBalk>
      </div>
    </div>
  );
}

const R2_KENMERKEN = {
  onderdruk: [
    { id: "o1", tekst: "Lucht en rookgas bewegen alleen door natuurlijke trek", goed: "Juist: bij onderdruk doet alleen de trek het werk.", fout: "Niet goed. Dit is onderdruk: daar zorgt alleen de natuurlijke trek voor het transport.", feiten: ["5.1c-01"] },
    { id: "o2", tekst: "In het rookgaskanaal is de druk lager dan in het luchtkanaal", goed: "Juist: bij onderdruk is de druk in het rookgaskanaal lager dan in de luchttoevoer.", fout: "Niet goed. Lagere druk in het rookgaskanaal hoort bij onderdruk. Bij overdruk is die druk juist hoger.", feiten: ["5.1c-03", "5.1c-06"] },
    { id: "o3", tekst: "Werkt slecht met het koele rookgas van HR-ketels", goed: "Juist: koel rookgas geeft te weinig trek.", fout: "Niet goed. Dit is onderdruk: dat systeem werkt op trek. Koel rookgas geeft weinig trek.", feiten: ["5.1c-05"] },
    { id: "o4", tekst: "De binnenbuis eindigt onderaan open", goed: "Juist: bij het onderdruk-CLV eindigt de binnenbuis open boven de opvang.", fout: "Niet goed. Kijk in de tekening: bij onderdruk eindigt de binnenbuis open, bij overdruk is hij onderaan dicht.", feiten: ["F1"] },
    { id: "o5", tekst: "De ventilator in het toestel geeft alleen overdruk in de aansluitleiding", goed: "Juist: bij onderdruk telt de toestelventilator alleen tot de schacht.", fout: "Niet goed. Dit hoort bij onderdruk. Bij overdruk duwt de ventilator het rookgas door het hele kanaal.", feiten: ["5.1c-04"] },
  ],
  overdruk: [
    { id: "v1", tekst: "De ventilatoren in de toestellen duwen het rookgas door het kanaal", goed: "Juist: bij overdruk zorgen de toestelventilatoren voor het transport.", fout: "Niet goed. Dit is overdruk: daar duwen de ventilatoren het rookgas door het kanaal.", feiten: ["5.1c-06"] },
    { id: "v2", tekst: "Elk toestel moet een terugslagklepje hebben", goed: "Juist: bij een overdruk-CLV C(10) is het klepje verplicht.", fout: "Niet goed. Het verplichte terugslagklepje hoort bij het overdruk-CLV C(10).", feiten: ["5.2b-01"] },
    { id: "v3", tekst: "Een trekonderbreker onderaan is niet toegestaan", goed: "Juist: onderaan een overdruk-CLV C(10) mag geen trekonderbreker.", fout: "Niet goed. Dit is een regel voor het overdruk-CLV C(10): daar mag onderaan geen trekonderbreker.", feiten: ["5.2c-02"] },
    { id: "v4", tekst: "Maximaal 2 toestellen per verdieping", goed: "Juist: dat is de regel voor het overdruk-CLV C(10).", fout: "Niet goed. Maximaal 2 per verdieping is de regel voor het overdruk-CLV C(10).", feiten: ["5.1f-03"] },
    { id: "v5", tekst: "Ook de aansluitstompen en aansluitleidingen zijn altijd concentrisch", goed: "Juist: bij C(10) zijn kanalen, stompen en aansluitleidingen allemaal concentrisch.", fout: "Niet goed. Bij C(10) zijn ook stompen en aansluitleidingen concentrisch. Bij het onderdruk-CLV in de tekening zie je twee losse leidingen.", feiten: ["5.2e-03", "F1"] },
    { id: "v6", tekst: "De binnenbuis is onderaan dicht, met een eigen sifon", goed: "Juist: bij het overdruk-CLV is de binnenbuis onderaan dicht en heeft hij een eigen sifon.", fout: "Niet goed. Kijk in de tekening: bij overdruk is de binnenbuis onderaan dicht, met een eigen sifon.", feiten: ["F4", "5.2d-02"] },
    { id: "v7", tekst: "Geschikt voor de gesloten HR-toestellen die nu op de markt zijn", goed: "Juist: sinds 2015 komen alleen nog gesloten HR-toestellen op de markt. Een onderdruk-CLV werkt daar niet meer voor.", fout: "Niet goed. Dit is overdruk. Voor de HR-toestellen van nu werkt een onderdruk-CLV niet meer.", feiten: ["5.1c-07"] },
    { id: "v8", tekst: "Onderaan twee deksels boven elkaar: een op het luchtkanaal en een op het rookgaskanaal", goed: "Juist: bij het C(10)-systeem zitten onderaan op het kanaal aparte luikjes, een op het luchtkanaal en een op het rookgaskanaal.", fout: "Niet goed. Kijk onderaan in de tekening: het C(10)-systeem heeft aparte luikjes op het luchtkanaal en op het rookgaskanaal.", feiten: ["5.2a-04", "F4"] },
  ],
};

function maakR2Kenmerken() {
  const maak = (modus) =>
    schud(R2_KENMERKEN[modus])
      .slice(0, 3)
      .map((k) => ({
        ...k,
        juist: modus,
        aandacht: modus === "onderdruk" ? `Onderdruk-CLV: ${k.tekst.toLowerCase()}` : `Overdruk-CLV C(10): ${k.tekst.toLowerCase()}`,
      }));
  return schud([...maak("onderdruk"), ...maak("overdruk")]);
}

function R2Kenmerken({ beoordeel, noteer, zie, onKlaar }) {
  const [kaarten] = useState(maakR2Kenmerken);
  const [modus, setModus] = useState(() => kies(["onderdruk", "overdruk"]));
  const stapel = useStapel(kaarten, { beoordeel, noteer, zie });
  useBovenaan("r2-stap2");

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        nummer={2}
        titel="Onderdruk of overdruk?"
        stap={2}
        opdracht="Hoort dit kenmerk bij onderdruk of bij overdruk? Met de schuif kun je beide tekeningen bekijken."
        gedaan={stapel.gedaan}
        totaal={kaarten.length}
      />
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-center md:items-start">
        <div className="w-full max-w-[250px] md:max-w-[320px] flex flex-col items-center gap-2">
          <Schuif
            titel="Bekijk het systeem"
            opties={[{ id: "onderdruk", inhoud: "onderdruk" }, { id: "overdruk", inhoud: "overdruk" }]}
            waarde={modus}
            onChange={setModus}
            breedte={250}
          />
          <DrukSchacht modus={modus} />
        </div>
        <VasteBalk className="md:flex-1">
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.olive }}>Kenmerk</div>
            <div className="text-base font-bold italic leading-snug" style={{ color: C.brownText }}>{stapel.item.tekst}</div>
          </div>
          {!stapel.beantwoord && (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["onderdruk", "Onderdruk-CLV"],
                ["overdruk", "Overdruk-CLV C(10)"],
              ].map(([id, label]) => (
                <KeuzeKnop key={id} onClick={(e) => stapel.kiesKnop(id, e)} disabled={stapel.fout.includes(id)} fout={stapel.fout.includes(id)}>
                  <span className="block text-center">{label}</span>
                </KeuzeKnop>
              ))}
            </div>
          )}
          <Melding melding={stapel.melding} />
          <StapelVerder stapel={stapel} onKlaar={onKlaar} />
        </VasteBalk>
      </div>
    </div>
  );
}

function Ronde2({ beoordeel, noteer, zie, onDone, qaFase }) {
  const [fase, setFase] = useState(() => startFase(qaFase));
  if (fase === "intro") {
    return (
      <RondeIntro title="Ronde 2: Onderdruk of overdruk?" intro="Een CLV kan op twee manieren werken. Zeg dus altijd welk systeem je bedoelt." onStart={() => setFase("stap1")}>
        <UitlegItem term="Onderdruk-CLV">
          het hete rookgas stijgt op en zuigt zo de lucht aan: natuurlijke trek. In het rookgaskanaal is de druk lager dan in het luchtkanaal. De ventilator in het toestel geeft alleen in de aansluitleiding overdruk.
        </UitlegItem>
        <UitlegItem term="Overdruk-CLV C(10)">
          de ventilatoren in de toestellen duwen het rookgas door het kanaal: in het rookgaskanaal is overdruk. Elk toestel heeft een terugslagklepje en per verdieping mogen maximaal 2 toestellen. Onderaan mag geen trekonderbreker.
        </UitlegItem>
        <UitlegItem term="Waarom overdruk?">
          HR-ketels maken koeler rookgas, dus minder trek. Sinds 2015 mogen alleen nog gesloten HR-toestellen op de markt. Daar werkt een onderdruk-CLV niet meer voor.
        </UitlegItem>
      </RondeIntro>
    );
  }
  if (fase === "stap1") return <R2Casussen beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={() => setFase("stap2")} />;
  return <R2Kenmerken beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={onDone} />;
}

// ─── RONDE 3: DE ONDERDELEN ───

// Tekening van een onderdruk-CLV: kap volgens NPR 3378-40 fig 1, per
// verdieping twee losse aansluitleidingen door de schachtwand (fig 1), en de
// onderzijde die Peter heeft goedgekeurd (luikje op het kanaal, opvangbak,
// vereffening tussen de buitenwanden, dubbele sifon, open uitmonding boven
// het riool). De onderzijde NIET wijzigen.
const R3_W = 560;
const R3_H = 560;
// Dropvlakken: minstens 44 px hoog op een telefoon, met ruimte ertussen
const R3_ZONE = { w: 170, h: 60 };
const ZS = "­"; // zacht afbreekstreepje voor lange woorden op een smal scherm

const R3_ONDERDELEN = [
  {
    id: "instroming",
    label: `Instromings${ZS}constructie`,
    side: "left",
    zone: { x: 0, y: 50 },
    anchor: { x: 263, y: 92 },
    goed: "Juist. Via de instromingsconstructie in de kap stroomt de buitenlucht het luchtkanaal in.",
    fout: "Niet goed. De instromingsconstructie zit in de kap boven het dak: daar stroomt de lucht het systeem in.",
    aandacht: "Instromingsconstructie: in de kap, daar komt de lucht binnen",
    feiten: ["5.2a-01", "5.2a-07"],
  },
  {
    id: "uitstroming",
    label: `Uitstromings${ZS}constructie`,
    side: "right",
    zone: { x: 390, y: 20 },
    anchor: { x: 287, y: 70 },
    goed: "Juist. Via de uitstromingsconstructie verlaat het rookgas uit de binnenbuis het systeem, boven het dak.",
    fout: "Niet goed. De uitstromingsconstructie zit boven op de kap: daar gaat het rookgas naar buiten.",
    aandacht: "Uitstromingsconstructie: boven op de kap, daar gaat het rookgas naar buiten",
    feiten: ["5.2a-01", "5.2a-07"],
  },
  {
    id: "stomp",
    label: `Aansluit${ZS}stompen`,
    side: "right",
    zone: { x: 390, y: 236 },
    anchor: { x: 356, y: 266 },
    goed: "Juist. Elk toestel heeft een eigen aansluiting. Bij de stomp in de schachtwand begint het CLV; die valt nog onder de CLV-fabrikant. Daar sluit jij op aan.",
    fout: "Niet goed. De aansluitstompen steken op elke verdieping door de schachtwand.",
    aandacht: "Aansluitstompen: per verdieping door de schachtwand, begin van het CLV",
    feiten: ["5.1a-05", "5.2a-06"],
  },
  {
    id: "luik",
    label: `Inspectie${ZS}luik`,
    side: "right",
    zone: { x: 390, y: 360 },
    anchor: { x: 334, y: 390 },
    goed: "Juist. Het luik is minimaal 50 x 50 cm en het hart van het kanaal ligt hooguit 50 cm van de voorkant van het luik. Via dit luik wordt het systeem op het riool aangesloten; ook inspectie en onderhoud gaan erdoor.",
    fout: "Niet goed. Het inspectieluik zit onderaan in de schachtwand.",
    aandacht: "Inspectieluik: onderaan in de schachtwand, minimaal 50 x 50 cm, voor aansluiten op het riool en onderhoud",
    feiten: ["5.2a-02", "5.2a-03", "5.1a-06"],
  },
  {
    id: "condens",
    label: `Condens${ZS}afvoer met sifons`,
    side: "left",
    zone: { x: 0, y: 375 },
    anchor: { x: 357, y: 450 },
    goed: "Juist. Onderaan gaat het condens- en regenwater via twee sifons met een open verbinding naar het riool. Beide sifons moeten bereikbaar zijn.",
    fout: "Niet goed. De condensafvoer zit onderaan en loopt via de sifons naar het riool.",
    aandacht: "Condensafvoer: onderaan, via twee sifons met een open verbinding naar het riool; beide bereikbaar",
    feiten: ["5.1a-06", "5.2a-05", "5.2d-01"],
  },
  {
    id: "drukver",
    label: `Drukver${ZS}effenings${ZS}constructie`,
    side: "left",
    zone: { x: 0, y: 490 },
    anchor: { x: 271, y: 463 },
    goed: "Juist. De norm noemt de drukvereffeningsconstructie als vast onderdeel van een onderdruk-CLV, maar beschrijft niet wat hij doet.",
    fout: "Niet goed. De drukvereffeningsconstructie zit in deze tekening helemaal onderaan in het kanaal.",
    aandacht: "Drukvereffeningsconstructie: vast onderdeel van een onderdruk-CLV, onderaan in deze tekening",
    feiten: ["5.2a-01"],
  },
];

function SchachtOnderdelen({ placed, keur = null }) {
  const flowUp = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };
  const ok = (id) => placed[id];
  const mark = (id) => (ok(id) ? C.green : C.brownText);
  const fillOk = (id) => (ok(id) ? C.greenLight : "white");
  const zones = placed !== null && keur === null;

  return (
    <svg viewBox={zones ? `0 0 ${R3_W} ${R3_H}` : "196 30 330 485"} className="w-full h-auto select-none" role="img" aria-label="Doorsnede van een onderdruk-CLV">
      <defs>
        <pattern id="hatchV3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
        <pattern id="gaasV3" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="white" />
          <path d="M0 0 H4 M0 0 V4" stroke={C.brownText} strokeWidth="0.7" />
        </pattern>
        {/* verticale houtnerf voor de schachtwanden */}
        <pattern id="grainV3" width="6" height="12" patternUnits="userSpaceOnUse">
          <rect width="6" height="12" fill={C.beigeMid} />
          <line x1="1.5" y1="0" x2="1.5" y2="12" stroke={C.brown} strokeWidth="0.7" opacity="0.45" />
          <line x1="4" y1="0" x2="4" y2="12" stroke={C.brown} strokeWidth="0.5" opacity="0.3" />
        </pattern>
      </defs>

      {/* verwijslijnen van dropvlak naar onderdeel (alleen tijdens het slepen) */}
      {zones &&
        R3_ONDERDELEN.map((o) => {
          const x1 = o.side === "left" ? o.zone.x + R3_ZONE.w : o.zone.x;
          const y1 = o.zone.y + R3_ZONE.h / 2;
          return (
            <g key={`lijn-${o.id}`} data-spel="verwijslijn">
              <line x1={x1} y1={y1} x2={o.anchor.x} y2={o.anchor.y} stroke={ok(o.id) ? C.green : C.brown} strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={o.anchor.x} cy={o.anchor.y} r="3.5" fill={ok(o.id) ? C.green : C.brown} />
            </g>
          );
        })}

      {/* dakvlak (gearceerd, doorbroken door de schacht) */}
      <rect x="50" y="150" width="184" height="18" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />
      <rect x="326" y="150" width="184" height="18" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />
      {/* verdiepingsvloeren: elk stompenpaar hangt net onder een vloer (NPR 3378-40 fig 1) */}
      {[178, 238, 298].map((y) => (
        <g key={`v${y}`}>
          <rect x="120" y={y} width="114" height="8" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="1.4" />
          <rect x="326" y={y} width="70" height="8" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="1.4" />
        </g>
      ))}

      {/* vloer onderaan (gearceerd, met sparing voor de rioolaansluiting) */}
      <rect x="50" y="470" width="398" height="14" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />
      <rect x="478" y="470" width="32" height="14" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />

      {/* schachtwanden met houtnerf (van het dak tot op de vloer) */}
      <rect x="234" y="150" width="16" height="320" fill="url(#grainV3)" stroke={C.brownText} strokeWidth="2" />
      <rect x="310" y="150" width="16" height="320" fill="url(#grainV3)" stroke={C.brownText} strokeWidth="2" />
      {/* dak dicht rond de pijp: deksegmenten tussen schachtwand en doorvoer */}
      <rect x="250" y="150" width="14" height="18" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />
      <rect x="296" y="150" width="14" height="18" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />
      {/* verdiepingsvloeren lopen door de schachtwanden tot tegen het kanaal (F1) */}
      {[178, 238, 298].map((y) => (
        <g key={`vs${y}`}>
          <rect x="234" y={y} width="30" height="8" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="1.4" />
          <rect x="296" y={y} width="30" height="8" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="1.4" />
        </g>
      ))}

      {/* concentrische pijp: buitenwand (264/296) loopt door tot aan de drukvereffening onderin */}
      <line x1="264" y1="120" x2="264" y2="456" stroke={C.brownText} strokeWidth="2" />
      <line x1="296" y1="120" x2="296" y2="456" stroke={C.brownText} strokeWidth="2" />
      <line x1="272" y1="106" x2="272" y2="414" stroke={C.brownText} strokeWidth="2" />
      <line x1="288" y1="106" x2="288" y2="414" stroke={C.brownText} strokeWidth="2" />
      {/* klein toegangsluikje op het kanaal zelf, subtiel, op dezelfde hoogte als het inspectieluik in de wand */}
      <rect x="290" y="381" width="12" height="18" rx="5" fill="white" stroke={C.brownText} strokeWidth="1.8" />
      {/* opvangbak in het kanaal, met conische bodem; hierop is de condensafvoer aangesloten */}
      <path d="M264 408 L277 424 H283 L296 408" fill="white" stroke={C.brownText} strokeWidth="2" strokeLinejoin="round" />

      {/* KAP (NPR 3378-40 fig 1): flens met bouten, hals, taps deel, kap met
          gaasroosters links en rechts (instroming), kapplaat met korte
          uitstroompijp (uitstroming) en twee rookgaspijlen schuin omhoog */}
      <g>
        <rect x="254" y="144" width="52" height="6" fill="white" stroke={C.brownText} strokeWidth="2" />
        <rect x="257" y="140" width="5" height="4" fill={C.brownText} />
        <rect x="298" y="140" width="5" height="4" fill={C.brownText} />
        <rect x="264" y="122" width="32" height="22" fill="white" stroke={C.brownText} strokeWidth="2" />
        <polygon points="264,122 296,122 304,104 256,104" fill="white" stroke={C.brownText} strokeWidth="2" />
        <rect x="256" y="84" width="48" height="20" fill="white" stroke={C.brownText} strokeWidth="2" />
        {[258, 290].map((x) => (
          <rect
            key={x}
            x={x}
            y="86"
            width="12"
            height="14"
            fill="url(#gaasV3)"
            stroke={mark("instroming")}
            strokeWidth={ok("instroming") ? 2.5 : 1}
          />
        ))}
        {ok("instroming") && [258, 290].map((x) => <rect key={`g${x}`} x={x} y="86" width="12" height="14" fill={C.green} opacity="0.2" />)}
        <line x1="272" y1="84" x2="272" y2="144" stroke={C.brownText} strokeWidth="1.2" strokeDasharray="4 3" />
        <line x1="288" y1="84" x2="288" y2="144" stroke={C.brownText} strokeWidth="1.2" strokeDasharray="4 3" />
        <rect x="250" y="80" width="60" height="4" fill={mark("uitstroming")} />
        <rect x="273" y="68" width="14" height="12" fill={fillOk("uitstroming")} stroke={mark("uitstroming")} strokeWidth="2" />
        <g stroke={C.red} strokeWidth="2.4" fill="none" strokeLinecap="round" style={KAP_OP}>
          <path d="M276 66 L270 50" />
          <path d="M284 66 L290 50" />
        </g>
        <Pijlpunt x={269} y={46} hoek={-110} kleur={C.red} />
        <Pijlpunt x={291} y={46} hoek={-70} kleur={C.red} />
        <g stroke={BLAUW} strokeWidth="2" fill="none" strokeLinecap="round" style={KAP_NEER}>
          <path d="M222 72 L258 92 Q264 96 266 112" />
          <path d="M338 72 L302 92 Q296 96 294 112" />
        </g>
        <Pijlpunt x={266} y={116} hoek={90} kleur={BLAUW} />
        <Pijlpunt x={294} y={116} hoek={90} kleur={BLAUW} />
      </g>

      {/* concentrische stroom: rookgas (rood) in het hart, lucht (blauw) in de ringspleet */}
      <path d="M268 124 L268 370" fill="none" stroke={BLAUW} strokeWidth="3" strokeLinecap="round" style={flowDown} />
      <path d="M263 364 L268 373 L273 364" fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M292 124 L292 370" fill="none" stroke={BLAUW} strokeWidth="3" strokeLinecap="round" style={flowDown} />
      <path d="M287 364 L292 373 L297 364" fill="none" stroke={BLAUW} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M280 402 L280 80" fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={flowUp} />
      {/* einde van de binnenbuis (F1): dwarslijn, en een doorgetrokken pijl in de rechter
          ring die langs het einde omlaag gaat en eronder naar links buigt. Verder is de
          goedgekeurde onderzijde ongewijzigd. */}
      <line x1="272" y1="406" x2="288" y2="406" stroke={C.brownText} strokeWidth="2.4" />
      <path d="M292 400 V407 Q292 412 287 412 H283" fill="none" stroke={BLAUW} strokeWidth="2" strokeLinecap="round" />
      <Pijlpunt x={279} y={412} hoek={180} kleur={BLAUW} maat={5} />

      {/* AANSLUITSTOMPEN per verdieping (NPR 3378-40 fig 1): twee losse
          leidingen door de rechterschachtwand; de bovenste gaat door tot in de
          binnenbuis en buigt omhoog, de onderste eindigt in de ring */}
      {[200, 260, 320].map((y) => (
        <g key={y}>
          <Pijp d={`M372 ${y - 6} H280 V${y - 16}`} kleur={C.red} anim={flowUp} rand={mark("stomp")} />
          <Pijp d={`M296 ${y + 6} H372`} kleur={BLAUW} anim={flowDown} rand={mark("stomp")} />
        </g>
      ))}

      {/* INSPECTIELUIK (bouwkundig, in de rechterwand onderaan) */}
      <g>
        <rect x="310" y="375" width="18" height="30" fill={fillOk("luik")} stroke={mark("luik")} strokeWidth={ok("luik") ? 3 : 2} />
        <line x1="314" y1="380" x2="324" y2="380" stroke={mark("luik")} strokeWidth="1.5" />
        <line x1="314" y1="400" x2="324" y2="400" stroke={mark("luik")} strokeWidth="1.5" />
      </g>

      {/* CONDENSAFVOER (NPR 3378-40/41): trechter -> laag door de wand -> sifon 1 -> open verbinding -> sifon 2 -> riool */}
      <path d="M280 424 V434 H350" fill="none" stroke={mark("condens")} strokeWidth={ok("condens") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <DrainageTrein x={350} y={434} s={1.2} stroke={mark("condens")} strokeWidth={ok("condens") ? 2.4 : 2} riool={false} />
      {/* na sifon 2: omhoog, over de vloer en met een OPEN uiteinde in de vloersparing (NEN 3287) */}
      <path d="M394 440 V426 H466 V474" fill="none" stroke={mark("condens")} strokeWidth={ok("condens") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text data-spel="label" x="452" y="496" fontSize="20" fontWeight="600" fill={C.brown} textAnchor="middle">riool</text>

      {/* DRUKVEREFFENINGSCONSTRUCTIE: geperforeerde strook onderin het kanaal, tussen de buitenwanden */}
      <g>
        <rect x="264" y="456" width="32" height="14" fill={fillOk("drukver")} stroke={mark("drukver")} strokeWidth={ok("drukver") ? 3 : 2} />
        {[271, 280, 289].map((cx) => (
          <circle key={cx} cx={cx} cy="463" r="3.5" fill="none" stroke={mark("drukver")} strokeWidth="1.8" />
        ))}
      </g>

      {/* ── keurkaarten (stap 2): de situatie wordt in de tekening getoond ── */}
      {keur?.toon === "luikmaat" && (
        <g data-spel="keur">
          <rect x="304" y="369" width="30" height="42" rx="4" fill="none" stroke={ORANJE} strokeWidth="2.5" strokeDasharray="5 3" />
          <rect x="338" y="376" width="92" height="28" rx="6" fill="white" stroke={ORANJE} strokeWidth="2" />
          <text x="384" y="396" fontSize="16" fontWeight="800" fill={ORANJE} textAnchor="middle">{keur.waarde}</text>
        </g>
      )}
      {keur?.toon === "afstand" && (
        <g data-spel="keur">
          {/* hartlijn van het kanaal en de maat tot de voorkant van het luik (zoals fig 1, maat 2) */}
          <line x1="280" y1="380" x2="280" y2="506" stroke={ORANJE} strokeWidth="1.5" strokeDasharray="10 3 2 3" />
          <line x1="328" y1="405" x2="328" y2="506" stroke={ORANJE} strokeWidth="1.2" />
          <line x1="280" y1="500" x2="328" y2="500" stroke={ORANJE} strokeWidth="1.8" />
          <Pijlpunt x={281} y={500} hoek={180} kleur={ORANJE} />
          <Pijlpunt x={327} y={500} hoek={0} kleur={ORANJE} />
          <rect x="334" y="487" width="66" height="26" rx="6" fill="white" stroke={ORANJE} strokeWidth="2" />
          <text x="367" y="506" fontSize="16" fontWeight="800" fill={ORANJE} textAnchor="middle">{keur.waarde}</text>
        </g>
      )}
      {keur?.toon === "sifons" && (
        <g data-spel="keur">
          <ellipse cx="374" cy="450" rx="34" ry="26" fill="none" stroke={ORANJE} strokeWidth="2.5" strokeDasharray="5 3" />
        </g>
      )}
      {keur?.toon === "sifondicht" && (
        <g data-spel="keur">
          <rect x="374" y="430" width="30" height="40" fill="url(#hatchV3)" stroke={C.brownText} strokeWidth="2" />
          <rect x="374" y="430" width="30" height="40" fill={C.beigeMid} opacity="0.55" />
          <text x="389" y="422" fontSize="17" fontWeight="700" fill={C.brownText} textAnchor="middle">dichte wand</text>
        </g>
      )}
      {keur?.toon === "kast" && (
        <g data-spel="keur">
          <rect x="330" y="356" width="64" height="114" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
          <line x1="362" y1="356" x2="362" y2="470" stroke={C.brownText} strokeWidth="1.2" />
          <circle cx="356" cy="412" r="2" fill={C.brownText} />
          <circle cx="368" cy="412" r="2" fill={C.brownText} />
          <text x="362" y="348" fontSize="17" fontWeight="700" fill={C.brownText} textAnchor="middle">vaste kast</text>
        </g>
      )}
      {keur?.toon === "luikvrij" && (
        <rect data-spel="keur" x="304" y="369" width="30" height="42" rx="4" fill="none" stroke={ORANJE} strokeWidth="2.5" strokeDasharray="5 3" />
      )}
      {keur?.toon === "verbindingdicht" && (
        <g data-spel="keur">
          {/* de open verbinding tussen de sifons is dichtgemaakt */}
          <rect x="374" y="432" width="12" height="22" fill={C.brownText} />
          <text x="380" y="424" fontSize="17" fontWeight="700" fill={C.brownText} textAnchor="middle">dicht</text>
        </g>
      )}
    </svg>
  );
}

function R3Labels({ beoordeel, noteer, zie, onKlaar }) {
  const [labels] = useState(() => schud(R3_ONDERDELEN));
  const [placed, setPlaced] = useState({});
  const [melding, setMelding] = useState(null);
  const aantal = Object.keys(placed).length;
  const klaar = aantal === R3_ONDERDELEN.length;
  useBovenaan("r3-stap1");

  const dropOn = (target) => (payload, point) => {
    if (placed[target.id]) return undefined;
    const dragged = R3_ONDERDELEN.find((o) => o.id === payload);
    if (!dragged) return undefined;
    zie(dragged.feiten);
    if (payload === target.id) {
      setPlaced((prev) => ({ ...prev, [target.id]: true }));
      beoordeel("goed", point);
      playSound("drop");
      setMelding({ soort: "goed", tekst: target.goed });
      return "correct";
    }
    noteer(dragged.aandacht);
    beoordeel("fout", point, { slepen: true });
    setMelding({ soort: "fout", tekst: dragged.fout });
    return "wrong";
  };

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        nummer={3}
        titel="De onderdelen"
        stap={1}
        opdracht="Sleep elk label naar het vraagteken bij het juiste onderdeel van dit onderdruk-CLV."
        gedaan={aantal}
        totaal={R3_ONDERDELEN.length}
      />
      <div className="relative w-full" style={{ maxWidth: R3_W }}>
        <SchachtOnderdelen placed={placed} />
        {R3_ONDERDELEN.map((o, i) => (
          <DropTarget
            key={o.id}
            id={`r3-vlak-${i}`}
            actief={!placed[o.id]}
            onDropItem={dropOn(o)}
            className="absolute -translate-y-1/2"
            style={{
              // Verticaal gecentreerd op de verwijslijn; op een telefoon nooit
              // lager dan 44 px, zodat een vinger het vlak goed raakt.
              left: `${(o.zone.x / R3_W) * 100}%`,
              top: `${((o.zone.y + R3_ZONE.h / 2) / R3_H) * 100}%`,
              width: `${(R3_ZONE.w / R3_W) * 100}%`,
              height: `max(${(R3_ZONE.h / R3_H) * 100}%, 44px)`,
            }}
          >
            {({ isHover, flash }) => (
              <div
                className="w-full h-full rounded-lg border-2 flex items-center justify-center text-xs font-bold text-center leading-tight px-1 transition-colors"
                style={{
                  borderStyle: placed[o.id] ? "solid" : "dashed",
                  borderColor: placed[o.id] ? C.green : flash === "wrong" ? C.red : isHover ? C.olive : C.brown,
                  backgroundColor: placed[o.id] ? C.greenLight : flash === "wrong" ? C.redLight : isHover ? C.oliveLight : "rgba(255,252,245,0.95)",
                  color: placed[o.id] ? C.green : C.brown,
                  hyphens: "manual",
                }}
              >
                {placed[o.id] ? o.label : "?"}
              </div>
            )}
          </DropTarget>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap justify-center mt-2 max-w-2xl">
        {labels
          .filter((o) => !placed[o.id])
          .map((o) => (
            <Draggable key={o.id} payload={o.id} ghost={<DragCard label={o.label} small />} className="max-w-[47%] sm:max-w-none">
              <DragCard label={o.label} small />
            </Draggable>
          ))}
      </div>
      <SleepMelding melding={melding} />
      {klaar && (
        <VasteBalk className="md:mt-3 md:w-full md:max-w-lg">
          <GameButton onClick={onKlaar} variant="green" className="w-full">
            Naar stap 2
            <ArrowRight className="w-4 h-4" />
          </GameButton>
        </VasteBalk>
      )}
    </div>
  );
}

// Keurkaarten: de situatie staat op de kaart en waar mogelijk in de tekening.
// Alleen echte keursituaties van dit onderdruk-CLV: goedkeuren of afkeuren.
const R3_KEUR = {
  luikmaat: [
    { id: "luik50", tekst: "Het bouwkundige inspectieluik is 50 x 50 cm.", toon: "luikmaat", waarde: "50 x 50 cm", juist: "goed", goed: "Juist, goedkeuren: het luik moet minimaal 50 x 50 cm zijn.", fout: "Niet goed. Dit mag: minimaal 50 x 50 cm is de eis.", aandacht: "Inspectieluik: minimaal 50 x 50 cm", feiten: ["5.2a-02"] },
    { id: "luik40", tekst: "Het bouwkundige inspectieluik is 40 x 40 cm.", toon: "luikmaat", waarde: "40 x 40 cm", juist: "af", goed: "Juist, afkeuren: te klein. Het luik moet minimaal 50 x 50 cm zijn.", fout: "Niet goed. Te klein: het luik moet minimaal 50 x 50 cm zijn.", aandacht: "Inspectieluik: minimaal 50 x 50 cm", feiten: ["5.2a-02"] },
  ],
  afstand: [
    { id: "af45", tekst: "Van het hart van het kanaal tot de voorkant van het luik is 45 cm.", toon: "afstand", waarde: "45 cm", juist: "goed", goed: "Juist, goedkeuren: hart kanaal tot voorkant luik mag maximaal 50 cm zijn.", fout: "Niet goed. Dit mag: maximaal 50 cm van hart kanaal tot voorkant luik.", aandacht: "Hart kanaal tot voorkant inspectieluik: maximaal 50 cm", feiten: ["5.2a-02"] },
    { id: "af70", tekst: "Van het hart van het kanaal tot de voorkant van het luik is 70 cm.", toon: "afstand", waarde: "70 cm", juist: "af", goed: "Juist, afkeuren: te ver. Hart kanaal tot voorkant luik mag maximaal 50 cm zijn.", fout: "Niet goed. Te ver: van hart kanaal tot voorkant luik mag maximaal 50 cm zijn.", aandacht: "Hart kanaal tot voorkant inspectieluik: maximaal 50 cm", feiten: ["5.2a-02"] },
  ],
  sifon: [
    { id: "open", tekst: "Tussen de eerste en de tweede sifon zit een open verbinding. Beide sifons zijn te bereiken.", toon: "sifons", juist: "goed", goed: "Juist, goedkeuren: dubbele sifon met een open verbinding ertussen, allebei bereikbaar.", fout: "Niet goed. Dit mag: tussen de twee sifons hoort een open verbinding.", aandacht: "Condensafvoer: dubbele sifon met open verbinding, beide bereikbaar", feiten: ["5.2d-01"] },
    { id: "dicht", tekst: "De tweede sifon zit achter een dichte wand en is niet te bereiken.", toon: "sifondicht", juist: "af", goed: "Juist, afkeuren: beide sifons moeten bereikbaar zijn voor onderhoud en inspectie.", fout: "Niet goed. Beide sifons moeten bereikbaar zijn voor onderhoud en inspectie.", aandacht: "Condensafvoer: dubbele sifon met open verbinding, beide bereikbaar", feiten: ["5.2d-01"] },
    { id: "verbinding", tekst: "De twee sifons zijn met een dichte buis aan elkaar vastgemaakt.", toon: "verbindingdicht", juist: "af", goed: "Juist, afkeuren: tussen de uitlaat van de eerste en de inlaat van de tweede sifon hoort een open verbinding.", fout: "Niet goed. Tussen de twee sifons hoort een open verbinding, geen dichte buis.", aandacht: "Condensafvoer: dubbele sifon met open verbinding, beide bereikbaar", feiten: ["5.2d-01"] },
  ],
  overig: [
    { id: "kast", tekst: "Voor het inspectieluik staat een vaste kast.", toon: "kast", juist: "af", goed: "Juist, afkeuren: het luik moet altijd bereikbaar blijven.", fout: "Niet goed. Het inspectieluik moet bereikbaar blijven.", aandacht: "Het inspectieluik moet bereikbaar blijven", feiten: ["5.2a-02"] },
    { id: "vrij", tekst: "Het inspectieluik is vrij bereikbaar: er staat niets voor.", toon: "luikvrij", juist: "goed", goed: "Juist, goedkeuren: het luik moet bereikbaar blijven. Dat is hier zo.", fout: "Niet goed. Een vrij bereikbaar luik is precies wat er moet.", aandacht: "Het inspectieluik moet bereikbaar blijven", feiten: ["5.2a-02"] },
  ],
};

function maakR3Keur() {
  const sifons = schud(R3_KEUR.sifon).slice(0, 2);
  return schud([kies(R3_KEUR.luikmaat), kies(R3_KEUR.afstand), ...sifons, kies(R3_KEUR.overig)]);
}

function R3Keuren({ beoordeel, noteer, zie, onKlaar }) {
  const [kaarten] = useState(maakR3Keur);
  const stapel = useStapel(kaarten, { beoordeel, noteer, zie });
  useBovenaan("r3-stap2");

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        nummer={3}
        titel="De onderdelen"
        stap={2}
        opdracht="Je keurt dit onderdruk-CLV. Bekijk de situatie: goedkeuren of afkeuren?"
        gedaan={stapel.gedaan}
        totaal={kaarten.length}
      />
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-center md:items-start">
        <div className="w-full max-w-[250px] md:max-w-[400px]">
          <SchachtOnderdelen placed={{}} keur={stapel.item ? { toon: stapel.item.toon, waarde: stapel.item.waarde } : { toon: null }} />
        </div>
        <VasteBalk className="md:flex-1">
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.olive }}>Situatie</div>
            <div className="text-base font-bold italic leading-snug" style={{ color: C.brownText }}>{stapel.item.tekst}</div>
          </div>
          {!stapel.beantwoord && (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["goed", "Goedkeuren"],
                ["af", "Afkeuren"],
              ].map(([id, label]) => (
                <KeuzeKnop key={id} onClick={(e) => stapel.kiesKnop(id, e)} disabled={stapel.fout.includes(id)} fout={stapel.fout.includes(id)}>
                  <span className="block text-center">{label}</span>
                </KeuzeKnop>
              ))}
            </div>
          )}
          <Melding melding={stapel.melding} />
          <StapelVerder stapel={stapel} onKlaar={onKlaar} />
        </VasteBalk>
      </div>
    </div>
  );
}

function Ronde3({ beoordeel, noteer, zie, onDone, qaFase }) {
  const [fase, setFase] = useState(() => startFase(qaFase));
  if (fase === "intro") {
    return (
      <RondeIntro title="Ronde 3: De onderdelen" intro="Je bekijkt een onderdruk-CLV van de kap tot de vloer." onStart={() => setFase("stap1")}>
        <UitlegItem term="Wie ontwerpt het?">
          de CLV-fabrikant ontwerpt het CLV. Het wordt al tijdens de bouw van de flat geplaatst. Voor jou als installateur is het een gegeven.
        </UitlegItem>
        <UitlegItem term="De maat van het kanaal">
          eerst bepaal je de belasting per strang. Een strang zijn alle toestellen boven elkaar op dezelfde afvoer; de belasting is wat die toestellen samen aan vermogen vragen. De maat volgt in overleg met de toestelfabrikant. Hoe meer toestellen en hoe hoger de belasting, hoe groter het kanaal.
        </UitlegItem>
      </RondeIntro>
    );
  }
  if (fase === "stap1") return <R3Labels beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={() => setFase("stap2")} />;
  return <R3Keuren beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={onDone} />;
}

// ─── RONDE 4: WELKE TOESTELLEN MOGEN EROP? ───

function Typeplaat({ type, sub }) {
  return (
    <div className="rounded-md border-2 px-3 py-1.5 bg-white text-center shadow-sm min-h-[52px]" style={{ borderColor: "#6E7F8F", minWidth: 100 }}>
      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#6E7F8F" }}>Typeplaat</div>
      <div className="font-extrabold text-lg leading-tight" style={{ color: C.brownText }}>{type}</div>
      {sub && <div className="text-xs leading-tight" style={{ color: C.brown }}>{sub}</div>}
    </div>
  );
}

// Toestel zonder typeplaatcode: een gesloten toestel zonder ventilator
function ToestelKaart() {
  return (
    <div className="rounded-md border-2 px-3 py-1.5 bg-white text-center shadow-sm min-h-[52px] flex flex-col items-center justify-center" style={{ borderColor: "#6E7F8F", minWidth: 100 }}>
      <div className="text-sm font-extrabold leading-tight" style={{ color: C.brownText }}>Gesloten toestel</div>
      <div className="text-xs leading-tight" style={{ color: C.brown }}>zonder ventilator</div>
    </div>
  );
}

// Typeplaat bij een C(10)-aansluiting, naar het voorbeeld in C10 bijlage B fig B1:
// een tabel met de omschrijving links en de waarde rechts
function AansluitPlaat() {
  const rijen = [
    ["Alleen geschikt voor:", "C(10)3 toestellen"],
    ["Temperatuurklasse:", "T120"],
  ];
  return (
    <table className="w-full text-xs leading-tight border-collapse" style={{ backgroundColor: "#C9D9EC", color: C.brownText }}>
      <tbody>
        {rijen.map(([a, b]) => (
          <tr key={a}>
            <td className="border px-1.5 py-1" style={{ borderColor: "#4F6D8F" }}>{a}</td>
            <td className="border px-1.5 py-1 font-bold" style={{ borderColor: "#4F6D8F" }}>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const R4_BAKKEN = [
  { id: "onder", titel: "Onderdruk-CLV" },
  { id: "half", titel: "Half-CLV" },
  { id: "over", titel: "Overdruk-CLV C(10)" },
  { id: "geen", titel: "Mag op geen CLV" },
];

const R4_GROEPEN = {
  c4: {
    kaarten: [{ id: "C42", type: "C42" }, { id: "C43", type: "C43" }],
    bak: "onder",
    goed: "Juist. Type C4 (C42 of C43) hoort bij het onderdruk-CLV.",
    fout: "Niet goed. C42 en C43 zijn type C4: die horen bij het onderdruk-CLV.",
    aandacht: "Onderdruk-CLV: type C4 (C42, C43) of C6 (C62, C63)",
    feiten: ["5.1b-02"],
  },
  c6: {
    kaarten: [{ id: "C62", type: "C62" }, { id: "C63", type: "C63" }],
    bak: "onder",
    goed: "Juist. Type C6 (C62 of C63) hoort ook bij het onderdruk-CLV.",
    fout: "Niet goed. C62 en C63 zijn type C6: die horen bij het onderdruk-CLV.",
    aandacht: "Onderdruk-CLV: type C4 (C42, C43) of C6 (C62, C63)",
    feiten: ["5.1b-02"],
  },
  c8: {
    kaarten: [{ id: "C82", type: "C82" }, { id: "C83", type: "C83" }],
    bak: "half",
    goed: "Juist. Bij een half-CLV hoort alleen type C8 (C82 of C83).",
    fout: "Niet goed. C82 en C83 zijn type C8: die horen bij het half-CLV.",
    aandacht: "Half-CLV: alleen type C8 (C82, C83)",
    feiten: ["5.1b-03"],
  },
  c10: {
    kaarten: [{ id: "C103", type: "C(10)3" }],
    bak: "over",
    goed: "Juist. Op een overdruk-CLV mag alleen type C(10). De 3 betekent: ventilator in de luchttoevoer.",
    fout: "Niet goed. C(10)3 hoort bij het overdruk-CLV.",
    aandacht: "Overdruk-CLV: alleen C(10)-toestellen",
    feiten: ["5.1b-04"],
  },
  open: {
    kaarten: [{ id: "B1", type: "B1" }],
    bak: "geen",
    goed: "Juist. Een open toestel mag nooit op een CLV.",
    fout: "Niet goed. Een open toestel mag op geen enkel CLV.",
    aandacht: "Op een CLV alleen gesloten toestellen met ventilator",
    feiten: ["5.1b-01"],
  },
  novent: {
    kaarten: [{ id: "novent", toestel: true }],
    bak: "geen",
    goed: "Juist. Zonder ventilator mag een toestel niet op een CLV.",
    fout: "Niet goed. Op een CLV mogen alleen gesloten toestellen met een ventilator.",
    aandacht: "Op een CLV alleen gesloten toestellen met ventilator",
    feiten: ["5.1b-01"],
  },
};

function maakR4Kaarten() {
  const lijst = Object.entries(R4_GROEPEN).map(([groep, g]) => ({ ...kies(g.kaarten), groep }));
  return schud(lijst);
}

function R4Kaart({ kaart }) {
  return kaart.toestel ? <ToestelKaart /> : <Typeplaat type={kaart.type} sub={kaart.sub} />;
}

function R4Slepen({ beoordeel, noteer, zie, onKlaar }) {
  const [kaarten] = useState(maakR4Kaarten);
  const [geplaatst, setGeplaatst] = useState({});
  const [melding, setMelding] = useState(null);
  const aantal = Object.keys(geplaatst).length;
  const klaar = aantal === kaarten.length;
  useBovenaan("r4-stap1");

  const dropIn = (bakId) => (payload, point) => {
    const kaart = kaarten.find((k) => k.id === payload);
    if (!kaart || geplaatst[kaart.id]) return undefined;
    const g = R4_GROEPEN[kaart.groep];
    zie(g.feiten);
    if (g.bak === bakId) {
      setGeplaatst((p) => ({ ...p, [kaart.id]: bakId }));
      beoordeel("goed", point);
      playSound("drop");
      setMelding({ soort: "goed", tekst: g.goed });
      return "correct";
    }
    noteer(g.aandacht);
    beoordeel("fout", point, { slepen: true });
    setMelding({ soort: "fout", tekst: g.fout });
    return "wrong";
  };

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        nummer={4}
        titel="Welke toestellen mogen erop?"
        stap={1}
        opdracht="Lees de typeplaat en sleep elk toestel naar het systeem waar dat type bij hoort."
        gedaan={aantal}
        totaal={kaarten.length}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full max-w-3xl mb-3">
        {R4_BAKKEN.map((bak) => (
          <DropTarget key={bak.id} id={`r4-${bak.id}`} onDropItem={dropIn(bak.id)} className="min-w-0">
            {({ isHover, flash }) => (
              <div
                className="rounded-2xl border-2 p-2 min-h-[96px] h-full flex flex-col items-center transition-colors"
                style={{
                  borderStyle: "dashed",
                  borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
                  backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
                }}
              >
                <div className="text-center font-bold italic text-sm leading-tight mb-1" style={{ color: C.brownText }}>{bak.titel}</div>
                <div className="flex gap-1 flex-wrap justify-center mt-1">
                  {kaarten
                    .filter((k) => geplaatst[k.id] === bak.id)
                    .map((k) => (
                      <span key={k.id} className="rounded-md px-1.5 py-0.5 text-xs font-bold border-2" style={{ backgroundColor: C.greenLight, borderColor: C.green, color: C.green }}>
                        {k.toestel ? "zonder ventilator" : k.type}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </DropTarget>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap justify-center mt-1 max-w-2xl">
        {kaarten
          .filter((k) => !geplaatst[k.id])
          .map((k) => (
            <Draggable key={k.id} payload={k.id} ghost={<R4Kaart kaart={k} />}>
              <R4Kaart kaart={k} />
            </Draggable>
          ))}
      </div>
      <SleepMelding melding={melding} />
      {klaar && (
        <VasteBalk className="md:mt-3 md:w-full md:max-w-lg">
          <GameButton onClick={onKlaar} variant="green" className="w-full">
            Naar stap 2
            <ArrowRight className="w-4 h-4" />
          </GameButton>
        </VasteBalk>
      )}
    </div>
  );
}

const SCHACHT_NAAM = {
  onder: "Onderdruk-CLV",
  half: "Half-CLV",
  over: "Overdruk-CLV C(10)",
};

const R4_COMBI = {
  c10goed: { schacht: "over", ketel: { type: "C(10)3" }, juist: "mag", goed: "Juist. De plaat zegt: alleen C(10)3-toestellen. Deze ketel is C(10)3.", fout: "Niet goed. Lees de plaat bij de aansluiting: alleen C(10)3-toestellen. Deze ketel is C(10)3, dus hij mag.", aandacht: "Lees bij een C(10)-aansluiting de plaat: alleen geschikt voor C(10) toestellen", feiten: ["5.1b-07", "5.1b-04"] },
  c10fout: { schacht: "over", ketel: { type: "C43" }, juist: "niet", goed: "Juist. Op deze aansluiting mogen alleen C(10)-toestellen. Een C43 hoort bij onderdruk.", fout: "Niet goed. De plaat zegt: alleen C(10)3-toestellen. Een C43 mag hier dus niet.", aandacht: "Lees bij een C(10)-aansluiting de plaat: alleen geschikt voor C(10) toestellen", feiten: ["5.1b-07", "5.1b-02"] },
  hrOud: { schacht: "onder", ketel: { type: "C(10)3", naam: "Moderne HR-ketel" }, juist: "niet", goed: "Juist. C(10)3 hoort bij het overdruk-CLV. En een moderne HR-ketel mag niet op een oud C4-onderdruksysteem.", fout: "Niet goed. C(10)3 is geen C4 of C6. En een moderne HR-ketel mag niet op een oud C4-onderdruksysteem.", aandacht: "Moderne HR-ketel nooit op een oude C4-onderdrukschacht", feiten: ["5.1b-05", "5.1b-04"] },
  halfGoed: { schacht: "half", ketel: { type: "C83" }, juist: "mag", goed: "Juist. Bij een half-CLV hoort type C8, dus een C83 past.", fout: "Niet goed. C83 is type C8 en dat hoort bij het half-CLV.", aandacht: "Half-CLV: alleen type C8 (C82, C83)", feiten: ["5.1b-03"] },
  halfFout: { schacht: "half", ketel: { type: "C43" }, juist: "niet", goed: "Juist. Bij een half-CLV hoort alleen type C8. Een C43 hoort bij onderdruk.", fout: "Niet goed. Bij een half-CLV hoort alleen type C8.", aandacht: "Half-CLV: alleen type C8 (C82, C83)", feiten: ["5.1b-03"] },
  onderGoed: { schacht: "onder", ketel: { type: "C62" }, juist: "mag", goed: "Juist. Type C6 hoort bij het onderdruk-CLV.", fout: "Niet goed. C62 is type C6 en dat hoort bij het onderdruk-CLV.", aandacht: "Onderdruk-CLV: type C4 (C42, C43) of C6 (C62, C63)", feiten: ["5.1b-02"] },
  onderOpen: { schacht: "onder", ketel: { type: "B1" }, juist: "niet", goed: "Juist. Een open toestel mag nooit op een CLV.", fout: "Niet goed. Op een CLV alleen gesloten toestellen met ventilator.", aandacht: "Op een CLV alleen gesloten toestellen met ventilator", feiten: ["5.1b-01"] },
  overHalf: { schacht: "over", ketel: { type: "C83" }, juist: "niet", goed: "Juist. Op deze aansluiting mogen alleen C(10)-toestellen. Een C83 hoort bij het half-CLV.", fout: "Niet goed. De plaat zegt alleen C(10)3-toestellen.", aandacht: "Lees bij een C(10)-aansluiting de plaat: alleen geschikt voor C(10) toestellen", feiten: ["5.1b-07", "5.1b-03"] },
};

function maakR4Combi() {
  const rest = schud(["halfGoed", "halfFout", "onderGoed", "onderOpen", "overHalf"]).slice(0, 2);
  const ids = ["hrOud", kies(["c10goed", "c10fout"]), ...rest];
  return schud(ids).map((id) => ({ id, ...R4_COMBI[id] }));
}

function R4Combi({ beoordeel, noteer, zie, onKlaar }) {
  const [kaarten] = useState(maakR4Combi);
  const stapel = useStapel(kaarten, { beoordeel, noteer, zie });
  const item = stapel.item;
  useBovenaan("r4-stap2");

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <OpdrachtKop
        nummer={4}
        titel="Welke toestellen mogen erop?"
        stap={2}
        opdracht="Bekijk het systeem en de typeplaat. Hoort dit toesteltype bij dit systeem?"
        gedaan={stapel.gedaan}
        totaal={kaarten.length}
      />
      <div className="flex flex-col gap-3 w-full max-w-md items-center">
        <div className="grid grid-cols-2 gap-2 w-full">
          <div className="rounded-2xl border-2 p-2 flex flex-col items-center text-center gap-1" style={{ borderColor: C.brownText, backgroundColor: C.bgCard }}>
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: C.olive }}>Het systeem</div>
            <div className="text-sm font-bold italic leading-tight" style={{ color: C.brownText }}>{SCHACHT_NAAM[item.schacht]}</div>
          </div>
          <div className="rounded-2xl border-2 p-2 flex flex-col items-center justify-center text-center" style={{ borderColor: C.brownText, backgroundColor: C.bgCard }}>
            <div className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: C.olive }}>{item.ketel.naam ?? "Het toestel"}</div>
            <Typeplaat type={item.ketel.type} sub={item.ketel.sub} />
          </div>
          {item.schacht === "over" && (
            // over de volle breedte, zodat de plaat op een telefoon niet wordt afgesneden
            <div className="col-span-2 rounded-2xl border-2 p-2" style={{ borderColor: C.brownText, backgroundColor: C.bgCard }}>
              <div className="text-xs font-bold mb-1" style={{ color: C.brown }}>Plaat bij de aansluiting van het systeem:</div>
              <AansluitPlaat />
            </div>
          )}
        </div>
        {!stapel.beantwoord && (
          <div className="grid grid-cols-2 gap-2 w-full">
            {[
              ["mag", "Hoort erbij"],
              ["niet", "Hoort er niet bij"],
            ].map(([id, label]) => (
              <KeuzeKnop key={id} onClick={(e) => stapel.kiesKnop(id, e)} disabled={stapel.fout.includes(id)} fout={stapel.fout.includes(id)}>
                <span className="block text-center">{label}</span>
              </KeuzeKnop>
            ))}
          </div>
        )}
        <Melding melding={stapel.melding} />
        <StapelVerder stapel={stapel} onKlaar={onKlaar} />
      </div>
    </div>
  );
}

function Ronde4({ beoordeel, noteer, zie, onDone, qaFase }) {
  const [fase, setFase] = useState(() => startFase(qaFase));
  if (fase === "intro") {
    return (
      <RondeIntro title="Ronde 4: Welke toestellen mogen erop?" intro="Het toesteltype staat op de typeplaat van het toestel en in het installatievoorschrift van de toestelfabrikant." onStart={() => setFase("stap1")}>
        <UitlegItem term="Alleen gesloten toestellen met ventilator">
          een open toestel (zoals type B1) of een toestel zonder ventilator mag nooit op een CLV.
        </UitlegItem>
        <p className="text-sm font-bold mt-2" style={{ color: C.brownText }}>Welk toesteltype hoort bij welk systeem?</p>
        <table className="w-full text-sm my-2 border-collapse" style={{ color: C.brownText }}>
          <thead>
            <tr className="text-xs uppercase tracking-wide" style={{ color: C.brown }}>
              <th className="text-left font-bold pb-1">Systeem</th>
              <th className="text-left font-bold pb-1">Toesteltype</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Onderdruk-CLV", "C4 (C42, C43) of C6 (C62, C63), rendement tot 104 % (HR104)"],
              ["Half-CLV", "alleen C8 (C82, C83), rendement tot 107 % (HR107)"],
              ["Overdruk-CLV C(10)", "alleen C(10)"],
            ].map(([sys, typ]) => (
              <tr key={sys} className="border-t" style={{ borderColor: C.beigeMid }}>
                <td className="py-1 pr-2 font-bold align-top">{sys}</td>
                <td className="py-1">{typ}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <UitlegItem term="C(10)3">de 3 betekent: ventilator in de luchttoevoer.</UitlegItem>
        <UitlegItem term="Plaat bij de aansluiting">bij elke C(10)-aansluiting hangt een plaat die zegt welke toestellen erop mogen.</UitlegItem>
        <UitlegItem term="Moderne HR-ketels">
          mogen niet op de oude C4-onderdruksystemen. Vervang je een toestel op een bestaand CLV, dan gelden extra eisen.
        </UitlegItem>
      </RondeIntro>
    );
  }
  if (fase === "stap1") return <R4Slepen beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={() => setFase("stap2")} />;
  return <R4Combi beoordeel={beoordeel} noteer={noteer} zie={zie} onKlaar={onDone} />;
}

// ─── CONTROLEVRAGEN ───
// Elke vraag noemt de feit-ID's die hij toetst. Er worden twee verschillende
// vragen getrokken uit de vragen waarvan de stof in deze speelbeurt in de
// introkaart, de opdracht of een terugmelding aan bod kwam.

const RONDE_INTRO_FEITEN = {
  r1: ["5.1a-01", "5.1a-02", "5.1a-04", "5.2e-01", "5.1c-08", "5.2e-02"],
  r2: ["5.1c-01", "5.1c-02", "5.1c-03", "5.1c-04", "5.1c-05", "5.1c-06", "5.1c-07", "5.2b-01", "5.2c-02", "5.1f-03"],
  r3: ["5.1a-07", "5.1f-01", "5.1f-02", "5.1f-04"],
  r4: ["5.1b-01", "5.1b-02", "5.1b-03", "5.1b-04", "5.1b-05", "5.1b-06", "5.1b-07"],
};

const POOLS = {
  r1: [
    {
      feiten: ["5.1a-01"],
      question: "Wat is bij een CLV gezamenlijk voor alle toestellen op de schacht?",
      options: ["Het luchtkanaal en het rookgaskanaal", "Alleen het rookgaskanaal", "Alleen het luchtkanaal", "Alleen de condensafvoer"],
      correct: 0,
      feedbackCorrect: "Juist. Bij een CLV delen alle toestellen een luchtkanaal en een rookgaskanaal.",
      feedbackWrong: "Bij een CLV zijn zowel het luchtkanaal als het rookgaskanaal gezamenlijk. Alleen het rookgaskanaal gezamenlijk is een half-CLV.",
      aandacht: "CLV: luchtkanaal en rookgaskanaal allebei gezamenlijk",
    },
    {
      feiten: ["5.1a-04"],
      question: "Waar haalt een toestel op een half-CLV zijn verbrandingslucht vandaan?",
      options: ["Zelf, bijvoorbeeld via een rooster in de gevel", "Uit het gezamenlijke luchtkanaal in de schacht", "Uit de ring om de rookgasbuis", "Via de kap op het dak"],
      correct: 0,
      feedbackCorrect: "Juist. Bij een half-CLV heeft elk toestel een eigen luchttoevoer, bijvoorbeeld uit de gevel.",
      feedbackWrong: "Bij een half-CLV is alleen de afvoer gezamenlijk. De lucht haalt elk toestel zelf, bijvoorbeeld via een rooster in de gevel.",
      aandacht: "Half-CLV: lucht per toestel, bijvoorbeeld uit de gevel",
    },
    {
      feiten: ["5.2e-01"],
      question: "In de schacht zie je een buis in een buis. Hoe heet deze uitvoering?",
      options: ["Concentrisch", "Parallel", "Half-CLV", "Individueel"],
      correct: 0,
      feedbackCorrect: "Juist. Een buis in een buis, met de lucht om het rookgaskanaal, heet concentrisch.",
      feedbackWrong: "Een buis in een buis heet concentrisch. Parallel zijn twee losse buizen naast elkaar.",
      aandacht: "Concentrisch: buis in buis. Parallel: twee buizen naast elkaar",
    },
    {
      feiten: ["5.1a-02"],
      question: "Concentrisch CLV: welke kant op stroomt de lucht in de ring?",
      options: ["Omlaag, van de kap naar de toestellen", "Omhoog, naar de kap", "Er stroomt geen lucht in de ring", "Omlaag in de binnenbuis, net als het rookgas"],
      correct: 0,
      feedbackCorrect: "Juist. De lucht komt via de kap binnen en stroomt in de ring omlaag. Het rookgas gaat in de binnenbuis omhoog.",
      feedbackWrong: "De lucht komt boven via de kap binnen en stroomt in de ring omlaag naar de toestellen.",
      aandacht: "Concentrisch CLV: lucht in de ring omlaag, rookgas in de binnenbuis omhoog",
    },
    {
      feiten: ["5.1a-02"],
      question: "Welk kanaal zit bij een concentrisch CLV in het midden?",
      options: ["Het rookgaskanaal", "Het luchtkanaal", "De condensafvoer", "Er zit niets in het midden"],
      correct: 0,
      feedbackCorrect: "Juist. Het rookgas gaat in de binnenbuis omhoog; de lucht stroomt in de ring eromheen.",
      feedbackWrong: "In het midden zit het rookgaskanaal. De lucht stroomt in de ring eromheen.",
      aandacht: "Concentrisch CLV: rookgaskanaal in het midden",
    },
    {
      feiten: ["5.2e-01"],
      question: "Wat is een parallel CLV?",
      options: [
        "Een luchtkanaal en een rookgaskanaal als twee losse buizen naast elkaar",
        "Een luchtkanaal om het rookgaskanaal heen",
        "Een systeem waarbij alleen de afvoer gezamenlijk is",
        "Twee schachten aan beide kanten van de flat",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Parallel: twee losse kanalen naast elkaar.",
      feedbackWrong: "Parallel betekent twee losse kanalen naast elkaar: een voor lucht en een voor rookgas.",
      aandacht: "Parallel CLV: twee losse kanalen naast elkaar",
    },
    {
      feiten: ["5.1a-04"],
      question: "Wat zie je in de schacht van een half-CLV?",
      options: ["Alleen een rookgasafvoer", "Een buis in een buis", "Een luchtkanaal en een rookgaskanaal naast elkaar", "Alleen een luchtkanaal"],
      correct: 0,
      feedbackCorrect: "Juist. Bij half-CLV zit er alleen de gezamenlijke afvoer in de schacht.",
      feedbackWrong: "Bij een half-CLV is alleen de rookgasafvoer gezamenlijk. Er zit dus alleen een afvoerbuis in de schacht.",
      aandacht: "Half-CLV: in de schacht alleen de rookgasafvoer",
    },
    {
      feiten: ["5.1c-08"],
      question: "Half-CLV: waar moet het toestel tegen bestand zijn?",
      options: [
        "Grote drukverschillen over het toestel door trek en wind",
        "Lucht uit een gezamenlijk luchtkanaal",
        "Overdruk in de afvoer door de ventilatoren van de buren",
        "Regenwater dat via het gevelrooster binnenkomt",
      ],
      correct: 0,
      feedbackCorrect: "Juist. De afvoer werkt op trek; door trek en wind kunnen grote drukverschillen over het toestel ontstaan.",
      feedbackWrong: "Bij een half-CLV werkt de afvoer op natuurlijke trek. Door trek en wind kunnen grote drukverschillen over het toestel ontstaan; daar moet het toestel tegen bestand zijn.",
      aandacht: "Half-CLV: het toestel moet bestand zijn tegen drukverschillen door trek en wind",
    },
    {
      feiten: ["5.2e-02"],
      question: "Over welke systemen gaat de norm voor het onderdruk-CLV (NPR 3378-40)?",
      options: ["Alleen metalen, concentrische systemen", "Alleen kunststof, parallelle systemen", "Over alle systemen, ook half-CLV", "Alleen over het overdruk-CLV C(10)"],
      correct: 0,
      feedbackCorrect: "Juist. Die norm gaat alleen over metalen, concentrische systemen.",
      feedbackWrong: "NPR 3378-40 gaat alleen over metalen, concentrische systemen.",
      aandacht: "NPR 3378-40: alleen metalen, concentrische systemen",
    },
  ],
  r2: [
    {
      feiten: ["5.1c-01", "5.1c-02"],
      question: "Wat zorgt bij een onderdruk-CLV voor het transport van lucht en rookgas?",
      options: ["Natuurlijke trek: het hete rookgas stijgt op", "De ventilatoren in de toestellen", "Een ventilator op het dak", "De wind over het dak"],
      correct: 0,
      feedbackCorrect: "Juist. Bij onderdruk gebeurt het transport alleen door natuurlijke trek.",
      feedbackWrong: "Bij een onderdruk-CLV zorgt alleen de natuurlijke trek voor het transport: heet rookgas stijgt op en zuigt lucht aan.",
      aandacht: "Onderdruk-CLV: transport alleen door natuurlijke trek",
    },
    {
      feiten: ["5.1c-06"],
      question: "Hoe is de druk in het rookgaskanaal van een overdruk-CLV C(10)?",
      options: ["Hoger: de toestelventilatoren duwen het rookgas erdoor", "Lager dan in het luchtkanaal, door de trek", "Gelijk aan de buitenlucht", "Lager, omdat het kanaal smaller is"],
      correct: 0,
      feedbackCorrect: "Juist. De ventilatoren in de toestellen zorgen voor overdruk in het afvoerkanaal.",
      feedbackWrong: "Bij een overdruk-CLV C(10) duwen de ventilatoren van de toestellen het rookgas. Daardoor is er overdruk in het rookgaskanaal.",
      aandacht: "Overdruk-CLV C(10): overdruk in het rookgaskanaal door de toestelventilatoren",
    },
    {
      feiten: ["5.2b-01"],
      question: "Waarom moet een toestel op een overdruk-CLV C(10) een terugslagklepje hebben?",
      options: [
        "Anders kan rookgas uit het kanaal terug het stilstaande toestel in",
        "Anders wordt de trek in het kanaal te sterk",
        "Om condenswater uit het toestel te houden",
        "Dat hoeft niet, alleen bij onderdruk",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Door de overdruk kan rookgas terugstromen; het klepje in het toestel is daarom verplicht.",
      feedbackWrong: "Bij overdruk is een terugslagklepje in elk toestel verplicht. Zonder klepje kan rookgas terug een stilstaand toestel in.",
      aandacht: "Overdruk-CLV C(10): elk toestel moet een terugslagklepje hebben",
    },
    {
      feiten: ["5.1c-05"],
      question: "Waarom werkt een onderdruk-CLV slecht met moderne HR-ketels?",
      options: ["Hun rookgas is koeler, dus er is minder trek", "Hun rookgas is te heet voor het kanaal", "Ze hebben geen ventilator", "Ze maken te weinig condens"],
      correct: 0,
      feedbackCorrect: "Juist. Koeler rookgas geeft minder trek, met meer storingen als gevolg.",
      feedbackWrong: "HR-ketels maken koeler rookgas. Koeler rookgas geeft minder trek. Een onderdruk-CLV draait juist op trek.",
      aandacht: "Onderdruk-CLV: koel rookgas van HR-ketels geeft minder trek",
    },
    {
      feiten: ["5.1f-03"],
      question: "Hoeveel toestellen mogen er per verdieping op een overdruk-CLV C(10)?",
      options: ["Maximaal 2", "Maximaal 1", "Maximaal 3", "Daar is geen grens voor"],
      correct: 0,
      feedbackCorrect: "Juist. Op een overdruk-CLV C(10) maximaal 2 toestellen per verdieping.",
      feedbackWrong: "Op een overdruk-CLV C(10) mogen per verdieping maximaal 2 toestellen.",
      aandacht: "Overdruk-CLV C(10): maximaal 2 toestellen per verdieping",
    },
    {
      feiten: ["5.2c-02"],
      question: "Mag er onderaan een overdruk-CLV C(10) een trekonderbreker zitten?",
      options: ["Nee, dat is niet toegestaan", "Ja, die is daar verplicht", "Alleen bij meer dan 2 toestellen per verdieping", "Alleen in het luchtkanaal"],
      correct: 0,
      feedbackCorrect: "Juist. Een trekonderbreker onderaan is bij C(10) niet toegestaan.",
      feedbackWrong: "Bij een overdruk-CLV C(10) is een trekonderbreker aan de onderkant niet toegestaan.",
      aandacht: "Overdruk-CLV C(10): geen trekonderbreker onderaan",
    },
    {
      feiten: ["5.1c-07"],
      question: "Sinds 2015 mogen alleen nog HR-toestellen op de markt. Wat betekent dat voor het CLV?",
      options: [
        "Een onderdruk-CLV kan daarvoor niet meer worden gebruikt",
        "Alle CLV's moeten een trekonderbreker krijgen",
        "Er mag nog maar 1 toestel per strang op",
        "Er verandert niets",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Met alleen nog HR-toestellen werkt een onderdruk-CLV niet meer.",
      feedbackWrong: "De HR-toestellen van nu hebben zo'n hoog rendement dat een onderdruk-CLV niet meer kan worden toegepast.",
      aandacht: "Sinds 2015 alleen HR-toestellen: onderdruk-CLV niet meer toe te passen",
    },
    {
      feiten: ["5.1c-04"],
      question: "Onderdruk-CLV: waar geeft de ventilator van het toestel overdruk?",
      options: ["Alleen in de aansluitleiding naar de schacht", "In het hele rookgaskanaal", "In het luchtkanaal", "Nergens, het toestel heeft geen ventilator"],
      correct: 0,
      feedbackCorrect: "Juist. Bij onderdruk telt de toestelventilator alleen in de aansluitleiding.",
      feedbackWrong: "Bij een onderdruk-CLV is de toestelventilator alleen van belang in de aansluitleiding tussen toestel en schacht.",
      aandacht: "Onderdruk-CLV: de toestelventilator geeft alleen overdruk in de aansluitleiding",
    },
    {
      feiten: ["5.1a-03"],
      question: "Wat is de belangrijkste eis aan een onderdruk-CLV?",
      options: [
        "Bij elk toestel is de druk aan de luchtkant altijd hoger dan aan de rookgaskant",
        "Bij elk toestel is de druk aan de rookgaskant altijd hoger",
        "De druk is overal in het kanaal gelijk",
        "Er hangen maximaal 2 toestellen per verdieping",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Altijd, ook bij harde wind: luchtkant hoger dan rookgaskant.",
      feedbackWrong: "De eis is: bij elk toestel altijd hogere druk aan de luchtkant dan aan de rookgaskant, onder alle omstandigheden.",
      aandacht: "Onderdruk-CLV: bij elk toestel altijd hogere druk aan de luchtkant",
    },
    {
      feiten: ["5.2e-03"],
      question: "Hoe zijn de kanalen, stompen en aansluitleidingen van een C(10)-systeem uitgevoerd?",
      options: ["Allemaal concentrisch", "Allemaal parallel", "Kanalen concentrisch, leidingen parallel", "Dat mag de installateur kiezen"],
      correct: 0,
      feedbackCorrect: "Juist. Bij C(10) is alles concentrisch.",
      feedbackWrong: "Bij een C(10)-systeem zijn de kanalen, de stompen en de aansluitleidingen allemaal concentrisch.",
      aandacht: "C(10): kanalen, stompen en aansluitleidingen allemaal concentrisch",
    },
    {
      feiten: ["5.2a-04"],
      question: "Overdruk-CLV C(10): welke inspectieluikjes zitten onderaan op het kanaal?",
      options: [
        "Aparte luikjes op het luchtkanaal en op het rookgaskanaal",
        "Alleen een luikje op het luchtkanaal",
        "Een trekonderbreker",
        "De terugslagklepjes van alle toestellen",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Bij het C(10)-systeem heeft elk kanaal onderaan een eigen inspectieluikje.",
      feedbackWrong: "Bij het C(10)-systeem zitten onderaan op het kanaal aparte luikjes op het luchtkanaal en op het rookgaskanaal.",
      aandacht: "Overdruk-CLV C(10): onderaan aparte luikjes op luchtkanaal en rookgaskanaal",
    },
  ],
  r3: [
    {
      feiten: ["5.2a-02"],
      question: "Hoe groot moet het bouwkundige inspectieluik onderaan minimaal zijn?",
      options: ["50 x 50 cm", "30 x 30 cm", "40 x 60 cm", "100 x 100 cm"],
      correct: 0,
      feedbackCorrect: "Juist. Minimaal 50 x 50 cm.",
      feedbackWrong: "Het inspectieluik moet minimaal 50 x 50 cm zijn.",
      aandacht: "Inspectieluik: minimaal 50 x 50 cm",
    },
    {
      feiten: ["5.2a-02"],
      question: "Hoe ver mag het hart van het kanaal maximaal van de voorkant van het inspectieluik liggen?",
      options: ["50 cm", "25 cm", "100 cm", "Dat maakt niet uit"],
      correct: 0,
      feedbackCorrect: "Juist. Van hart kanaal tot voorkant luik maximaal 50 cm.",
      feedbackWrong: "Van het hart van het kanaal tot de voorkant van het luik mag maximaal 50 cm zijn.",
      aandacht: "Hart kanaal tot voorkant inspectieluik: maximaal 50 cm",
    },
    {
      feiten: ["5.2a-03"],
      question: "Waarvoor is het inspectieluik onderaan nodig?",
      options: [
        "Om het systeem op het riool aan te sluiten en voor inspectie en onderhoud",
        "Om extra lucht in de schacht te laten",
        "Om rookgas af te voeren als de kap dicht zit",
        "Alleen om de schacht te kunnen bouwen",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Via het luik wordt het systeem op het riool aangesloten. Later gaan inspectie en onderhoud er ook door.",
      feedbackWrong: "Het inspectieluik is nodig om het systeem op het riool aan te sluiten en voor later onderhoud en inspectie.",
      aandacht: "Inspectieluik: voor aansluiten op het riool en voor inspectie en onderhoud",
    },
    {
      feiten: ["5.2d-01"],
      question: "Hoe ziet de condensafvoer onderaan een onderdruk-CLV eruit?",
      options: [
        "Twee sifons met een open verbinding ertussen, allebei bereikbaar",
        "Een sifon, weggewerkt in de vloer",
        "Twee sifons direct aan elkaar vast",
        "Een open buis zonder sifon naar het riool",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Dubbele sifon met open verbinding; beide sifons bereikbaar voor onderhoud en inspectie.",
      feedbackWrong: "Onderaan zit een dubbele sifon met een open verbinding tussen de twee. Beide sifons moeten bereikbaar zijn.",
      aandacht: "Condensafvoer: dubbele sifon met open verbinding, beide bereikbaar",
    },
    {
      feiten: ["5.1a-07"],
      question: "Wie ontwerpt het CLV-systeem?",
      options: ["De fabrikant van het CLV", "De installateur van de ketel", "De bewoner", "De gebouweigenaar"],
      correct: 0,
      feedbackCorrect: "Juist. De CLV-fabrikant ontwerpt het. Voor de installateur is het systeem een gegeven.",
      feedbackWrong: "Het CLV wordt ontworpen door de CLV-fabrikant en al tijdens de bouw van de flat geplaatst. Voor de installateur is het een gegeven.",
      aandacht: "Het CLV wordt ontworpen door de CLV-fabrikant; voor de installateur een gegeven",
    },
    {
      feiten: ["5.2a-06"],
      question: "Waar begint het CLV-systeem, gezien vanaf het toestel?",
      options: ["Bij de aansluitstomp in de schachtwand", "Bij de kap op het dak", "Bij het inspectieluik", "Bij de ketel zelf"],
      correct: 0,
      feedbackCorrect: "Juist. De stomp door de schachtwand is het begin van het CLV en valt onder de CLV-fabrikant.",
      feedbackWrong: "Het CLV begint bij de aansluitstomp in de schachtwand. Vanaf daar sluit de installateur het toestel aan.",
      aandacht: "Aansluitstomp: begin van het CLV, valt onder de CLV-fabrikant",
    },
    {
      feiten: ["5.1f-01", "5.1f-02"],
      question: "Hoe wordt de maat van het afvoerkanaal bepaald?",
      options: [
        "Eerst de belasting per strang bepalen, dan de maat in overleg met de toestelfabrikant",
        "Altijd even groot als de aansluiting op de ketel",
        "De installateur kiest een maat op gevoel",
        "Altijd de maat van het oude kanaal aanhouden",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Eerst de belasting per strang, dan de maat in overleg met de toestelfabrikant.",
      feedbackWrong: "Voor de maat bepaal je eerst de belasting per strang. De maat volgt in overleg met de toestelfabrikant.",
      aandacht: "Kanaalmaat: eerst belasting per strang, dan in overleg met de toestelfabrikant",
    },
    {
      feiten: ["5.1f-04"],
      question: "Op een strang komen meer toestellen met een hogere belasting. Wat betekent dat voor het kanaal?",
      options: ["Het kanaal moet groter zijn", "Het kanaal mag kleiner zijn", "Het kanaal blijft even groot", "Alleen de kap wordt groter"],
      correct: 0,
      feedbackCorrect: "Juist. Hoe meer toestellen en hoe hoger de belasting, hoe groter het kanaal.",
      feedbackWrong: "Hoe meer toestellen en hoe hoger de belasting, hoe groter het kanaal moet zijn.",
      aandacht: "Meer toestellen en hogere belasting: groter kanaal",
    },
    {
      feiten: ["5.2a-01", "5.2a-07"],
      question: "Waar stroomt bij dit onderdruk-CLV de buitenlucht het systeem in?",
      options: ["Bij de instromingsconstructie in de kap", "Bij de drukvereffeningsconstructie onderaan", "Bij het inspectieluik", "Bij de aansluitstompen"],
      correct: 0,
      feedbackCorrect: "Juist. De lucht komt in de kap binnen, via de instromingsconstructie.",
      feedbackWrong: "De buitenlucht komt boven het dak via de kap binnen: dat is de instromingsconstructie.",
      aandacht: "Instromingsconstructie: in de kap, daar komt de lucht binnen",
    },
  ],
  r4: [
    {
      feiten: ["5.1b-01"],
      question: "Welke toestellen mogen op een CLV?",
      options: ["Alleen geschikte gesloten toestellen met ventilator", "Ook open toestellen", "Alle gesloten toestellen, met of zonder ventilator", "Alleen toestellen zonder ventilator"],
      correct: 0,
      feedbackCorrect: "Juist. Alleen geschikte gesloten toestellen met ventilator.",
      feedbackWrong: "Op een CLV mogen alleen geschikte gesloten toestellen met een ventilator.",
      aandacht: "Op een CLV alleen gesloten toestellen met ventilator",
    },
    {
      feiten: ["5.1b-03"],
      question: "Welk toesteltype hoort bij een half-CLV?",
      options: ["C82 of C83", "C42 of C43", "C(10)3", "B1"],
      correct: 0,
      feedbackCorrect: "Juist. Op een half-CLV mag alleen type C8.",
      feedbackWrong: "Op een half-CLV mag alleen type C8, dus C82 of C83.",
      aandacht: "Half-CLV: alleen type C8 (C82, C83)",
    },
    {
      feiten: ["5.1b-02"],
      question: "Welk toesteltype hoort bij een onderdruk-CLV?",
      options: ["C43", "C83", "C(10)3", "B1"],
      correct: 0,
      feedbackCorrect: "Juist. Bij een onderdruk-CLV hoort type C4 (C42, C43) of C6 (C62, C63).",
      feedbackWrong: "Bij een onderdruk-CLV hoort type C4 (C42, C43) of C6 (C62, C63). C83 hoort bij half-CLV, C(10)3 bij overdruk.",
      aandacht: "Onderdruk-CLV: type C4 (C42, C43) of C6 (C62, C63)",
    },
    {
      feiten: ["5.1b-04"],
      question: "Wat betekent de 3 in C(10)3?",
      options: ["De ventilator zit in de luchttoevoer", "Er mogen 3 toestellen per verdieping op", "Het toestel is 3 kW", "Het is de derde uitvoering"],
      correct: 0,
      feedbackCorrect: "Juist. Bij C(10)3 zit de ventilator in de luchttoevoer.",
      feedbackWrong: "De 3 in C(10)3 betekent: de ventilator zit in de luchttoevoer.",
      aandacht: "C(10)3: de 3 betekent ventilator in de luchttoevoer",
    },
    {
      feiten: ["5.1b-07"],
      question: "Bij elke aansluiting van een overdruk-CLV C(10) hangt een plaat. Wat staat daar onder meer op?",
      options: ["Alleen geschikt voor C(10) toestellen", "Alleen geschikt voor open toestellen", "Geschikt voor alle HR-ketels", "Geschikt voor elk gesloten toestel"],
      correct: 0,
      feedbackCorrect: "Juist. Op die plaat staat: alleen geschikt voor C(10) toestellen.",
      feedbackWrong: "Op de plaat bij elke C(10)-aansluiting staat onder meer: alleen geschikt voor C(10) toestellen.",
      aandacht: "Lees bij een C(10)-aansluiting de plaat: alleen geschikt voor C(10) toestellen",
    },
    {
      feiten: ["5.1b-05"],
      question: "Mag een moderne HR-ketel op een oud C4-onderdruksysteem?",
      options: ["Nee", "Ja, als hij een ventilator heeft", "Ja, als het kanaal van metaal is", "Alleen op de bovenste verdieping"],
      correct: 0,
      feedbackCorrect: "Juist. Moderne HR-ketels mogen niet op de oude C4-systemen.",
      feedbackWrong: "Moderne HR-ketels mogen niet op de oude C4-onderdruksystemen.",
      aandacht: "Moderne HR-ketel nooit op een oude C4-onderdrukschacht",
    },
    {
      feiten: ["5.1b-06"],
      question: "Waar zie je of een toestel geschikt is voor een bepaald CLV?",
      options: [
        "In het installatievoorschrift van de toestelfabrikant; het type staat ook op de typeplaat",
        "Op de kap van het CLV",
        "Op de plaat onderaan het CLV",
        "Aan de diameter van de aansluitstomp",
      ],
      correct: 0,
      feedbackCorrect: "Juist. Installatievoorschrift van de toestelfabrikant en de typeplaat van het toestel.",
      feedbackWrong: "Of een toestel geschikt is, staat in het installatievoorschrift van de toestelfabrikant. Het type staat ook op de typeplaat.",
      aandacht: "Geschiktheid toestel: installatievoorschrift van de toestelfabrikant en de typeplaat",
    },
    {
      feiten: ["5.1b-02", "5.1b-03"],
      question: "Tot welk rendement mag een toestel op een half-CLV?",
      options: ["HR107", "HR104", "HR100", "Daar is geen grens voor"],
      correct: 0,
      feedbackCorrect: "Juist. Half-CLV tot HR107; onderdruk-CLV tot HR104.",
      feedbackWrong: "Op een half-CLV mag het toestel tot HR107. Op een onderdruk-CLV tot HR104.",
      aandacht: "Rendement: onderdruk-CLV tot HR104, half-CLV tot HR107",
    },
  ],
};

function kiesVragen(ronde, gezien) {
  const bekend = new Set([...RONDE_INTRO_FEITEN[ronde], ...gezien]);
  const pool = POOLS[ronde];
  const geschikt = pool.filter((q) => q.feiten.some((f) => bekend.has(f)));
  const lijst = schud(geschikt.length >= VRAGEN_PER_RONDE ? geschikt : pool);
  // twee vragen over verschillende stof als dat kan
  const eerste = lijst[0];
  const tweede = lijst.slice(1).find((q) => !q.feiten.some((f) => eerste.feiten.includes(f))) ?? lijst[1];
  return [eerste, tweede];
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

// Kernpunten van deze game: staan altijd op het eindscherm, ook bij een foutloos spel.
const LEERMOMENTEN = [
  "CLV: luchtkanaal en rookgaskanaal zijn gezamenlijk. Half-CLV: alleen de rookgasafvoer; de lucht komt per toestel binnen, bijvoorbeeld uit de gevel",
  "Concentrisch is een buis in een buis met de lucht in de ring. Parallel zijn twee losse kanalen naast elkaar",
  "Onderdruk-CLV werkt op natuurlijke trek. Bij een overdruk-CLV C(10) duwen de toestelventilatoren het rookgas: terugslagklepje verplicht, maximaal 2 toestellen per verdieping",
  "Inspectieluik minimaal 50 x 50 cm, hart kanaal tot voorkant luik maximaal 50 cm. Twee sifons met een open verbinding, allebei bereikbaar",
  "Onderdruk-CLV: type C4 of C6. Half-CLV: type C8. Overdruk-CLV: alleen C(10). Altijd een gesloten toestel met ventilator",
];

const leegGezien = () => ({ r1: new Set(), r2: new Set(), r3: new Set(), r4: new Set() });

export default function CLVVerkennerGame({ initialScreen = "start", onExit, onGameComplete, qaFase = null }) {
  const [screen, setScreen] = useState(initialScreen);
  const { aandacht, noteer, reset: resetAandacht } = useAandacht();
  const juice = useGameJuice();
  const { sessie, stand, herstart } = useSessie(maakOpzet, { zender });
  // Welke stof de speler per ronde zag; een vaste verzameling die alleen in
  // handlers wordt bijgewerkt (geen render nodig)
  const [gezien] = useState(leegGezien);

  // controlemenu-sprong: speel de kern door tot het gevraagde scherm
  useState(() => doorspelenTot(sessie, initialScreen));

  // Bij een sprong rechtstreeks naar de controlevragen: trek ze uit de introstof
  const [mc, setMc] = useState(() => {
    const m = /^(r\d)mc$/.exec(initialScreen);
    return m ? { ronde: m[1], vragen: kiesVragen(m[1], []), index: 0 } : null;
  });

  // De ronde begint zodra het rondescherm in beeld komt
  // (startRonde is idempotent zolang de ronde al bezig is).
  useEffect(() => {
    if (RONDE_SCHERMEN.includes(screen)) sessie.startRonde();
  }, [screen, sessie]);

  // Een ronde meldt alleen wat de speler deed; de kern bepaalt de punten en
  // de levens, en sluit de ronde als hij vol of gefaald is.
  const beoordeel = useCallback(
    (uitkomst, point, opties) => {
      const gevolg = sessie.beoordeel(uitkomst, opties);
      if (uitkomst === "fout") juice.triggerWrong(gevolg.punten, point);
      else juice.triggerCorrect(gevolg.punten, point);
    },
    [sessie, juice]
  );

  const beantwoord = useCallback(
    (goed) => {
      if (sessie.stand.fase !== "kennisvraag" || sessie.stand.kennisvraag?.beantwoord) return;
      sessie.beantwoordKennisvraag(goed);
      if (goed) juice.triggerCorrect(100);
      else juice.triggerWrong();
    },
    [sessie, juice]
  );

  // Welke stof de speler in deze ronde zag (voor de keuze van de controlevragen)
  const zieIn = useCallback(
    (ronde) => (feiten) => {
      for (const f of feiten ?? []) gezien[ronde].add(f);
    },
    [gezien]
  );

  // Staat de kern op het eind (ook direct na een herkansing), dan wint dat
  // van het eigen schermpje; zo is er nooit een los eind-effect nodig.
  const scherm = stand.fase === "eind" ? "end" : screen;
  useBovenaan(`${scherm}-${mc?.index ?? 0}`);

  const resetGame = () => {
    herstart();
    for (const set of Object.values(gezien)) set.clear();
    setMc(null);
    setScreen("start");
    resetAandacht();
  };

  // derde fout: de kern sloot de ronde als gefaald en gaf verse levens
  const gefaald = stand.fase === "rondeklaar" && stand.ronde?.status === "gefaald";

  // Een ronde is af: door naar de controlevragen. Sluit de kernronde ook als
  // er handelingen open bleven.
  const rondeAf = (ronde) => {
    sessie.rondeKlaar();
    if (sessie.stand.fase === "rondeklaar") sessie.verder();
    if (sessie.stand.fase === "kennisvraag") {
      setMc({ ronde, vragen: kiesVragen(ronde, gezien[ronde]), index: 0 });
      setScreen(`${ronde}mc`);
    }
  };

  // na een controlevraag: de tweede vraag van dezelfde ronde, of door
  const vraagKlaar = () => {
    sessie.volgendeKennisvraag();
    if (mc.index + 1 < VRAGEN_PER_RONDE) {
      setMc((m) => ({ ...m, index: m.index + 1 }));
      return;
    }
    const volgende = VOLGENDE[mc.ronde];
    if (volgende !== "end") setScreen(volgende);
  };

  const showProgress = !["start", "intro", "end"].includes(scherm);

  // het menu markeert deze game als gespeeld zodra de kern klaar is
  useEffect(() => {
    if (scherm === "end") onGameComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scherm]);

  const rondeProps = (ronde) => ({
    beoordeel,
    noteer,
    zie: zieIn(ronde),
    onDone: () => rondeAf(ronde),
    // de QA-sprong geldt alleen voor het scherm waarop de game opent
    qaFase: screen === initialScreen ? qaFase : null,
  });

  const mcActief = mc && scherm === `${mc.ronde}mc`;

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: C.bgPage }}>
      <juice.JuiceOverlay />
      <DragProvider>
        <div
          className="max-w-[800px] w-full mx-auto flex flex-col min-h-screen shadow-lg overflow-x-hidden"
          style={{ backgroundColor: C.bgPage, animation: juice.shaking ? "shake 0.3s ease-in-out" : "none" }}
        >
          {showProgress && (
            <ProgressBar currentRound={SCREEN_ROUND[scherm] ?? 1} score={Math.max(0, stand.punten)} lives={stand.levens} totalRounds={4} />
          )}

          {scherm === "start" && <StartScreen onStart={() => setScreen("intro")} />}

          {scherm === "intro" && (
            <IntroScreen title="Missie: het CLV-systeem" buttonText="Aan de slag" onNext={() => setScreen("r1")}>
              <div className="leading-relaxed" style={{ color: C.brownText }}>
                <p className="mb-2">
                  <strong>CLV</strong> = <strong>C</strong>ombinatie <strong>L</strong>uchttoevoer en <strong>V</strong>erbrandingsgasafvoer.
                </p>
                <p className="mb-2">
                  In veel flats zijn de toestellen van alle woningen aangesloten op een gezamenlijke rookgasafvoer in een schacht. Bij een CLV is ook de luchttoevoer gezamenlijk.
                </p>
                <p>In vier rondes leer je welk systeem je ziet, hoe het werkt, uit welke onderdelen het bestaat en welke toestellen erop mogen.</p>
              </div>
            </IntroScreen>
          )}

          {scherm === "r1" && <Ronde1 {...rondeProps("r1")} />}
          {scherm === "r2" && <Ronde2 {...rondeProps("r2")} />}
          {scherm === "r3" && <Ronde3 {...rondeProps("r3")} />}
          {scherm === "r4" && <Ronde4 {...rondeProps("r4")} />}

          {mcActief && (
            <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
              <StepBanner step={2} />
              <div className="text-xs font-bold mb-2" style={{ color: C.brown }}>
                Ronde {SCREEN_ROUND[scherm]}: Controlevraag {mc.index + 1} van {VRAGEN_PER_RONDE}
              </div>
              <MCControle
                key={`${mc.ronde}-${mc.index}`}
                pool={[mc.vragen[mc.index]]}
                beantwoord={beantwoord}
                onFout={noteer}
                onComplete={vraagKlaar}
                lastRound={mc.ronde === "r4" && mc.index + 1 === VRAGEN_PER_RONDE}
                volgendeTekst={mc.index + 1 < VRAGEN_PER_RONDE ? "Volgende vraag" : "Volgende ronde"}
              />
            </div>
          )}

          {scherm === "end" && (
            <EindschermKern
              sessie={sessie}
              stand={stand}
              tekst="Sterk werk! Je herkent nu een CLV en een half-CLV, je weet hoe onderdruk en overdruk werken, je kent de onderdelen en je weet welke toestellen erop mogen."
              rondeNamen={RONDE_NAMEN}
              leermomenten={LEERMOMENTEN}
              aandacht={aandacht}
              onHerkans={(rondeId) => setScreen(rondeId)}
              onOpnieuw={resetGame}
            />
          )}
          {scherm === "end" && onExit && (
            <div className="flex justify-center pb-6">
              <GameButton variant="secondary" onClick={onExit}>Terug naar het menu</GameButton>
            </div>
          )}
          {gefaald && <RondeGefaald onVerder={() => rondeAf(stand.ronde.id)} />}
        </div>
      </DragProvider>
    </div>
  );
}
