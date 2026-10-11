import { useState, useCallback, useEffect, useRef } from "react";
import { ClipboardCheck, CheckCircle, XCircle, Fan, Gauge, Users, Power } from "lucide-react";
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
  playSound,
  VasteBalk,
  RUIMTE_VOOR_BALK,
} from "./shared.jsx";
import { useSessie, maakZender, EindschermKern } from "./microgame/schil.jsx";

// Game 3: De CLV-Servicemonteur (eindtermen 6.1, 6.4 en 8.3).
// Elke ronde is voor de kern een missie met een ronde en twee kennisvragen.
// Handelingen = het echte aantal beoordeel("goed")-momenten:
//   r1: 9 plekken (7 controles + 2 die niet meetellen) + 1 eindoordeel = 10
//   r2: 4 klussen (ketelkeuze 1, zinnen tijdelijk doorgebruik 3, twee keuzeklussen 2) = 6
//       + VMC/MVS: 2 tekeningen typeren, 3 kenmerken, 2 oplossingen, 1 ontvanger = 8; samen 14
//   r3: CO 3 meetplekken + woningen 1 + bevinding 1 = 5, terugslagklep 2,
//       onderzijde 5 plekken + 2 sifonoordelen = 7, onderhoudspunten benoemen 4; samen 18
// Haalbaar: (10 + 14 + 18) x 100 + 6 kennisvragen x 100 = 4800.
// Elke inhoudelijke zin is terug te voeren op een feit-ID uit BRONBASIS
// (zie clv-gauntlet\bouw\service-BRONNEN.md); de ID's staan als commentaar.
const GAME_ID = "clv-service";

const maakOpzet = () => ({
  id: GAME_ID,
  missies: [
    { id: "m1", rondes: [{ id: "r1", handelingen: 10 }], kennisvragen: [{ id: "k1a" }, { id: "k1b" }] },
    { id: "m2", rondes: [{ id: "r2", handelingen: 14 }], kennisvragen: [{ id: "k2a" }, { id: "k2b" }] },
    { id: "m3", rondes: [{ id: "r3", handelingen: 18 }], kennisvragen: [{ id: "k3a" }, { id: "k3b" }] },
  ],
});

// Meten staat uit zolang de game op zijn eigen domein draait (besluit Peter).
const zender = maakZender({ url: import.meta.env.VITE_TELEMETRIE_URL });

const RONDE_NAMEN = {
  r1: "Is dit CLV nog goed?",
  r2: "Wat doe je bij vervanging?",
  r3: "Onderhoud van het CLV",
};

const RONDE_SCHERMEN = ["r1", "r2", "r3"];
const SCREEN_ROUND = { r1: 1, r1mc: 1, r2: 2, r2mc: 2, r3: 3, r3mc: 3 };

// Controlemenu: heel getal n = de eerste n rondes met beide kennisvragen af;
// met een half erbij is ook de ronde erna af en staat haar eerste vraag open.
const SPOEL_STAPPEN = { intro: 0, r1: 0, r1mc: 0.5, r2: 1, r2mc: 1.5, r3: 2, r3mc: 2.5, end: 3 };

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
    while (sessie.stand.fase === "kennisvraag") {
      sessie.beantwoordKennisvraag(true);
      sessie.volgendeKennisvraag();
    }
  };
  for (let i = 0; i < heel; i += 1) speel(i, true);
  if (stappen % 1) speel(heel, false);
}

// ─── QA-HULPEN (alleen met ?qa=1) ───

const QA_AAN = (() => {
  try {
    return new URLSearchParams(window.location.search).get("qa") === "1";
  } catch {
    return false;
  }
})();
// goede keuzes krijgen alleen in QA een onzichtbaar kenmerk; zonder qa=1 staat er niets in de DOM
const qaGoed = (goed) => (QA_AAN && goed ? "1" : undefined);
const qaWaarde = (waarde) => (QA_AAN ? waarde : undefined);
// &kaal=1 verbergt de tikvlakken, om een tekening naast de normfiguur te leggen
const QA_KAAL = (() => {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get("qa") === "1" && p.get("kaal") === "1";
  } catch {
    return false;
  }
})();
// &stap=n opent een ronde meteen in stap n
function leesQaStap() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("qa") !== "1") return 0;
    return Number(p.get("stap")) || 0;
  } catch {
    return 0;
  }
}

// ─── HULPJES ───

// Fisher-Yates op een kopie; alleen aanroepen in initializers en handlers.
function schud(lijst) {
  const a = [...lijst];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function kies(lijst) {
  return lijst[Math.floor(Math.random() * lijst.length)];
}

function punt(e) {
  return e && typeof e.clientX === "number" ? { clientX: e.clientX, clientY: e.clientY } : undefined;
}

const isSmal = () => typeof window !== "undefined" && window.innerWidth < 768;

// Bij een nieuwe stap of nieuw scherm begint de speler bovenaan.
function naarBoven() {
  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
}

// Op een telefoon: schuif een aangetikte plek naar boven, zodat de balk onderin hem niet bedekt.
function plekInBeeld(el, marge = 110) {
  if (!el || !isSmal()) return;
  const r = el.getBoundingClientRect();
  window.scrollBy({ top: r.top - marge, behavior: "smooth" });
}

function RondeGefaald({ onVerder }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4">
      <div className="rounded-2xl border-2 shadow-2xl p-6 w-full max-w-sm text-center" style={{ backgroundColor: C.bgCard, borderColor: C.red }}>
        <h2 className="font-bold italic text-xl mb-2" style={{ color: C.brownText }}>Je hartjes zijn op</h2>
        <p className="text-sm mb-4" style={{ color: C.brown }}>
          Geen probleem: van fouten leer je. Deze ronde sluit en je gaat verder met verse hartjes. Aan het eind kun je de ronde herkansen; dan telt je beste poging.
        </p>
        <GameButton onClick={onVerder} className="w-full">Verder</GameButton>
      </div>
    </div>
  );
}

// Vaste kop van elke opdracht: banner, titel, stap, opdrachtregel en teller.
function OpdrachtKop({ titel, stap, stappen, opdracht, teller }) {
  return (
    <>
      <StepBanner step={1} />
      <h2 className="text-lg sm:text-xl font-bold italic mb-1 text-center" style={{ color: C.brownText }}>{titel}</h2>
      {stappen > 1 && (
        <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.oliveDark }}>
          Stap {stap} van {stappen}
        </div>
      )}
      <div
        className="w-full max-w-2xl rounded-xl border-2 px-3 py-2 mb-3 flex items-start justify-between gap-3"
        style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}
      >
        <p className="text-sm font-bold" style={{ color: C.brownText }}>Opdracht: {opdracht}</p>
        {teller && (
          <span className="shrink-0 text-xs font-bold rounded-lg px-2 py-1 whitespace-nowrap" style={{ backgroundColor: C.oliveLight, color: C.oliveDark }}>
            {teller}
          </span>
        )}
      </div>
    </>
  );
}

function Situatie({ wie, children }) {
  return (
    <div className="w-full max-w-2xl rounded-xl border px-3 py-2 mb-3 flex gap-2 items-start" style={{ backgroundColor: "#FDF4E9", borderColor: C.beigeMid }}>
      <Users className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.brown }} />
      <p className="text-sm leading-snug" style={{ color: C.brownText }}>
        {wie && <span className="font-bold">{wie} </span>}
        {children}
      </p>
    </div>
  );
}

// Groen bij goed (met de waarom-regel), rood bij fout (met wat wel klopt).
function Terugkoppeling({ fb }) {
  const ref = useRef(null);
  // de uitleg altijd in beeld schuiven, ook binnen de balk onderin
  useEffect(() => {
    if (fb && ref.current) ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [fb]);
  if (!fb) return null;
  return (
    <div
      ref={ref}
      aria-live="polite"
      className="w-full rounded-xl border-2 px-3 py-2 text-sm leading-snug flex gap-2 items-start"
      style={{ backgroundColor: fb.goed ? C.greenLight : C.redLight, borderColor: fb.goed ? C.green : C.red, color: C.brownText }}
    >
      {fb.goed ? (
        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.green }} />
      ) : (
        <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.red }} />
      )}
      <p>
        <span className="font-bold">{fb.goed ? "Goed. " : "Niet goed. "}</span>
        {fb.tekst}
      </p>
    </div>
  );
}

// Tikvlak over een tekening: 44 x 44 px. Na een goede tik toont hij het nummer uit de figuur (als dat er is).
function Stip({ x, y, w, h, status, actief, label, onClick, goed, nr }) {
  if (QA_KAAL) return null;
  const kleur = status === "ok" ? C.green : status === "niet" ? C.amber : actief ? C.olive : C.red;
  const teken = status === "ok" ? nr ?? "✓" : status === "niet" ? "!" : "?";
  return (
    <button
      onClick={onClick}
      data-goed={qaGoed(goed && !status)}
      data-spel="tikvlak"
      className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11"
      style={{ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }}
      aria-label={label}
    >
      {!status && <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: kleur, opacity: 0.25 }} />}
      <span
        className="absolute inset-1 rounded-full border-2 flex items-center justify-center text-[15px] font-bold text-white shadow"
        style={{ backgroundColor: kleur, borderColor: "white" }}
      >
        {teken}
      </span>
    </button>
  );
}

// Keuzeknoppen met fout-geheugen: een foute optie blijft rood en uit.
function Keuzes({ opties, fout, goedId, goedIds = [], klaar = false, juist = [], onKies }) {
  const dicht = klaar || !!goedId;
  return (
    <div className="flex flex-col gap-2 w-full">
      {opties.map((o) => {
        const isFout = fout.includes(o.id);
        const isGoed = goedId === o.id || goedIds.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={(e) => !isFout && !isGoed && !dicht && onKies(o, e)}
            disabled={isFout || isGoed || dicht}
            data-goed={qaGoed(juist.includes(o.id) && !isGoed && !dicht)}
            className="text-left px-3 py-2.5 min-h-[44px] rounded-xl border-2 text-sm font-medium transition-all"
            style={{
              backgroundColor: isGoed ? C.greenLight : isFout ? C.redLight : "white",
              borderColor: isGoed ? C.green : isFout ? C.red : C.beigeMid,
              color: C.brownText,
              opacity: dicht && !isGoed ? 0.55 : 1,
            }}
          >
            {o.tekst}
          </button>
        );
      })}
    </div>
  );
}

// ─── TEKENING: concentrisch CLV-systeem (N40 figuur 1, PDF-pagina 8) ───
// Getekend in de punt-coordinaten van de PDF-figuur (opgemeten uit de
// vectoren), zodat opbouw en verhoudingen gelijk zijn. De groep schaalt
// x1,4 vanaf het punt (140, 65) van de PDF-pagina.
const R1_W = 420;
const R1_H = 920;
const r1x = (x) => (x - 140) * 1.4;
const r1y = (y) => (y - 65) * 1.4;
// verdiepingsvloeren met een gesloten toestel eronder: [bovenkant, onderkant]
const R1_VLOEREN = [
  [215.8, 224.3],
  [312.2, 320.7],
  [419.9, 428.5],
  [527.7, 536.2],
];

function Leiding({ d, dik = 3.5, lijn = 0.7 }) {
  return (
    <>
      <path d={d} fill="none" stroke={C.brownText} strokeWidth={dik} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="white" strokeWidth={dik - 2 * lijn} strokeLinejoin="round" />
    </>
  );
}

function Pijl({ x, y1, y2, kleur = C.brownText, w = 0.6, k = 3.2 }) {
  const d = y2 > y1 ? -k : k;
  return (
    <g stroke={kleur} strokeWidth={w} fill={kleur} strokeLinejoin="round">
      <line x1={x} y1={y1} x2={x} y2={y2 + d * 0.6} />
      <path d={`M${x - k * 0.42} ${y2 + d} L${x} ${y2} L${x + k * 0.42} ${y2 + d} Z`} />
    </g>
  );
}

// Sifon zoals in N40 figuur 1: twee poten met moeren, een U met waterstand, moer onderaan.
// x = linkerkant van de linkerpoot, y = bovenkant van de poten.
function SifonF1({ x, y }) {
  const L = C.brownText;
  return (
    <g stroke={L} fill="none" strokeWidth="0.55">
      <rect x={x} y={y} width="3.1" height="2.6" fill="white" strokeWidth="0.4" />
      <rect x={x + 7.5} y={y} width="3.1" height="2.6" fill="white" strokeWidth="0.4" />
      <path d={`M${x} ${y + 2.6} V${y + 4.9} Q${x} ${y + 10} ${x + 5.3} ${y + 10} Q${x + 10.5} ${y + 10} ${x + 10.5} ${y + 4.9} V${y + 2.6}`} fill="white" />
      <path d={`M${x + 2.9} ${y + 2.6} V${y + 4.9} Q${x + 2.9} ${y + 7.2} ${x + 5.3} ${y + 7.2} Q${x + 7.6} ${y + 7.2} ${x + 7.6} ${y + 4.9} V${y + 2.6}`} />
      {/* waterstand */}
      <path d={`M${x + 0.4} ${y + 5.2} H${x + 2.6} M${x + 7.9} ${y + 5.2} H${x + 10.1} M${x + 1.2} ${y + 7.4} H${x + 9.3} M${x + 2.4} ${y + 9} H${x + 8.2}`} strokeWidth="0.35" />
      <rect x={x + 3} y={y + 11.5} width="4.5" height="1.4" fill="white" strokeWidth="0.35" />
    </g>
  );
}

function StrangSVG({ stempel }) {
  const wand = "#808080";
  const L = C.brownText;
  // wanddelen tussen de vloeren; de rechterwand is open waar de twee leidingen doorgaan
  const links = [[168.5, 214.7], [225.3, 284], [295, 311.2], [321.7, 419.0], [429.4, 526.7], [537.2, 666.7]];
  const rechts = [[168.5, 214.7], [295, 311.2], [628.4, 666.7]];
  R1_VLOEREN.forEach(([, o], i) => {
    const tot = i === 0 ? 284 : i < 3 ? R1_VLOEREN[i + 1][0] - 0.9 : 604.3;
    rechts.push([o + 1, o + 4.5], [o + 8, o + 12.3], [o + 15.8, tot]);
  });
  // stroompijlen in de ring, omlaag
  const omlaag = [
    [259.4, 160, 174], [245.2, 179, 198.5], [259.4, 250, 268], [259.4, 359, 378.8],
    [245.2, 383.1, 402.9], [259.4, 466.7, 486.6], [245.2, 490.9, 510.7], [245.2, 584.4, 604.3],
  ];
  const stempels = {
    geen: { tekst: "GEEN MAATREGELEN", kleur: C.green },
    door: { tekst: "TIJDELIJK DOORGEBRUIK", kleur: C.amber },
    niet: { tekst: "NIET HERBRUIKBAAR", kleur: C.red },
  };
  const st = stempel ? stempels[stempel] : null;
  return (
    <svg viewBox={`0 0 ${R1_W} ${R1_H}`} className="w-full h-auto select-none" aria-label="Doorsnede van een concentrisch CLV-systeem">
      <defs>
        <pattern id="svcArc1" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3.4" stroke={L} strokeWidth="0.45" />
        </pattern>
        <pattern id="svcArc1b" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="3.4" stroke={L} strokeWidth="0.45" />
        </pattern>
        <pattern id="svcGaas1" width="1.35" height="1.35" patternUnits="userSpaceOnUse">
          <path d="M0 0 H1.35 M0 0 V1.35" stroke={L} strokeWidth="0.3" />
        </pattern>
      </defs>
      <g transform="scale(1.4) translate(-140 -65)">
        {/* dak en verdiepingsvloeren (gearceerd), onderbroken door het kanaal */}
        {[[159.0, 167.5], ...R1_VLOEREN].map(([b, o]) => (
          <g key={b}>
            <rect x="148.8" y={b} width="92.2" height={o - b} fill="url(#svcArc1)" stroke={L} strokeWidth="0.7" />
            <rect x="263.6" y={b} width="92.1" height={o - b} fill="url(#svcArc1)" stroke={L} strokeWidth="0.7" />
          </g>
        ))}
        {/* begane grondvloer, doorlopend, arcering de andere kant op */}
        <rect x="141" y="666.7" width="296" height="11.3" fill="url(#svcArc1b)" stroke={L} strokeWidth="0.7" />

        {/* schachtwanden (donkergrijs) */}
        {links.map(([a, b]) => (
          <rect key={`l${a}`} x="231" y={a} width="5.7" height={b - a} fill={wand} stroke={L} strokeWidth="0.6" />
        ))}
        {rechts.map(([a, b]) => (
          <rect key={`r${a}`} x="267.8" y={a} width="5.7" height={b - a} fill={wand} stroke={L} strokeWidth="0.6" />
        ))}

        {/* KAP: flensplaat met bouten, voet, cilinder, taps deel, gaas in de hoeken, kapplaat, uitstroompijp */}
        <rect x="214" y="157.6" width="76.6" height="1.4" fill="white" stroke={L} strokeWidth="0.5" />
        <rect x="219.5" y="155.2" width="5.5" height="2.4" fill="white" stroke={L} strokeWidth="0.4" />
        <rect x="279.5" y="155.2" width="5.5" height="2.4" fill="white" stroke={L} strokeWidth="0.4" />
        <polygon points="233.3,157.6 271.3,157.6 269.5,151.1 235,151.1" fill="white" stroke={L} strokeWidth="0.8" />
        <rect x="237.1" y="137.4" width="30.3" height="13.7" fill="white" stroke={L} strokeWidth="0.8" />
        <polygon points="237.1,137.4 267.4,137.4 269.5,118 235.1,118" fill="white" stroke={L} strokeWidth="0.8" />
        <rect x="235.1" y="102.4" width="34.4" height="15.6" fill="white" stroke={L} strokeWidth="0.8" />
        <polygon points="235.1,102.4 244.4,102.4 244.2,105.5 243.4,110.2 242.6,111.6 238.3,112.9 237.2,115 235.1,116.2" fill="url(#svcGaas1)" />
        <polygon points="259.3,102.4 269.5,102.4 269.5,117.6 268,116.8 266.3,114.2 264.8,111.6 259.9,110.3 259,104.8" fill="url(#svcGaas1)" />
        <rect x="230.8" y="101.5" width="42.9" height="1.2" fill={L} />
        <polygon points="245.9,101.5 258.7,101.5 258.2,96.4 246.3,96.4" fill="white" stroke={L} strokeWidth="0.8" />
        {/* gestippeld in de kap: binnenbuis, luchtgeleiding en twee dwarslijnen */}
        <g stroke={L} strokeWidth="0.5" strokeDasharray="2.6 1.6" fill="none">
          <path d="M246.4 102.4 L248 121.2 V159 M258.2 102.4 L256.6 121.2 V159" />
          <path d="M248 121.2 H256.6" />
          <path d="M235.1 118 L242.3 129.4 V159 M269.5 118 L262.2 129.4 V159" />
          <path d="M242.3 129.4 H262.2" />
        </g>
        {/* rookgas eruit: twee pijlen schuin omhoog */}
        <g stroke={L} strokeWidth="0.7" fill={L}>
          <line x1="249.1" y1="93.6" x2="244" y2="75" />
          <path d="M243.2 71.7 L242.3 76.4 L245.4 75.6 Z" />
          <line x1="255.4" y1="93.6" x2="260.5" y2="75" />
          <path d="M261.3 71.7 L262.2 76.4 L259.1 75.6 Z" />
        </g>
        {/* lucht erin door het gaas, buigt omlaag de ring in */}
        <g stroke={L} strokeWidth="0.7" fill="none">
          <path d="M209.6 102.7 L235.6 112.1 Q242.1 116 243.6 125" />
          <path d="M295 102.7 L269 112.1 Q262.5 116 261 125" />
        </g>
        <path d="M241.9 124 L243.9 129.4 L245.6 123.6 Z" fill={L} />
        <path d="M262.7 124 L260.7 129.4 L259 123.6 Z" fill={L} />

        {/* CONCENTRISCH KANAAL: ring (lucht) om de binnenbuis (rookgas) */}
        <g stroke={L} strokeWidth="0.85">
          <line x1="242.3" y1="167.5" x2="242.3" y2="284" />
          <line x1="242.3" y1="295" x2="242.3" y2="665.7" />
          <line x1="262.2" y1="167.5" x2="262.2" y2="284" />
          <line x1="262.2" y1="295" x2="262.2" y2="611.6" />
          <line x1="262.2" y1="621.1" x2="262.2" y2="639.7" />
          <line x1="262.2" y1="642.5" x2="262.2" y2="665.7" />
          <line x1="248" y1="167.5" x2="248" y2="284" />
          <line x1="248" y1="295" x2="248" y2="616.3" />
          <line x1="256.6" y1="167.5" x2="256.6" y2="284" />
          <line x1="256.6" y1="295" x2="256.6" y2="616.3" />
          {/* dwarslijn aan het einde van de binnenbuis */}
          <line x1="248" y1="616.3" x2="256.6" y2="616.3" />
        </g>
        {omlaag.map(([x, a, b]) => (
          <Pijl key={`${x}-${a}`} x={x} y1={a} y2={b} />
        ))}
        <Pijl x={252.3} y1={578.8} y2={564.6} />
        {/* pijl uit de ring die onder het einde van de binnenbuis naar links buigt (lucht en afvoer staan hier in verbinding) */}
        <path d="M258.7 607.8 V617.8 Q258.7 619.9 256.6 619.9" fill="none" stroke={L} strokeWidth="0.55" />
        <path d="M256.6 618.9 L253 619.9 L256.6 620.8 Z" fill={L} />
        {/* breeklijn: schacht en kanaal onderbroken getekend */}
        <g stroke={L} strokeWidth="0.5" fill="none">
          <path d="M229 284 q3 -2 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" />
          <path d="M229 295 q3 -2 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" />
        </g>

        {/* GESLOTEN TOESTELLEN, elk met twee leidingen met ronde bochten door de rechterschachtwand */}
        {R1_VLOEREN.map(([b, o]) => (
          <g key={b}>
            {/* onderste leiding: eindigt in de ring (lucht) */}
            <Leiding d={`M262.2 ${o + 14.05} H292.9 Q295.9 ${o + 14.05} 295.9 ${o + 17.05} V${o + 20.8}`} />
            {/* bovenste leiding: tot in de binnenbuis (rookgas), pijl buigt omhoog */}
            <Leiding d={`M256.6 ${o + 6.25} H303.8 Q307.8 ${o + 6.25} 307.8 ${o + 10.25} V${o + 20.8}`} />
            <path d={`M256.6 ${o + 6.25} Q252.3 ${o + 6.25} 252.3 ${o + 2}`} fill="none" stroke={L} strokeWidth="0.6" />
            <Pijl x={252.3} y1={o + 2} y2={b - 2.2} />
            <rect x="294.1" y={o + 20.8} width="22.6" height="35.5" fill="white" stroke={L} strokeWidth="0.85" />
            <line x1="297.7" y1={o + 20.8} x2="297.7" y2={o + 56.3} stroke={L} strokeWidth="0.6" />
            <line x1="297.7" y1={o + 52} x2="316.7" y2={o + 52} stroke={L} strokeWidth="0.6" />
            <circle cx="316.7" cy={o + 47} r="1" fill="white" stroke={L} strokeWidth="0.5" />
          </g>
        ))}
        <g fontSize="10.6" fill={L}>
          <circle cx="311.3" cy="256.3" r="0.9" fill={L} />
          <line x1="311.3" y1="256.3" x2="336.8" y2="245.4" stroke={L} strokeWidth="0.45" />
          <text x="338" y="240">gesloten</text>
          <text x="338" y="252">toestel</text>
          <circle cx="245.2" cy="415.1" r="0.9" fill={L} />
          <line x1="245.2" y1="415.1" x2="284.9" y2="392.2" stroke={L} strokeWidth="0.45" />
          <text x="287" y="389">toevoerkanaal</text>
          <text x="287" y="401">lucht</text>
          <circle cx="252.3" cy="518.8" r="0.9" fill={L} />
          <line x1="252.3" y1="518.8" x2="284.9" y2="500" stroke={L} strokeWidth="0.45" />
          <text x="287" y="497">afvoerkanaal</text>
          <text x="287" y="509">verbrandingsgassen</text>
        </g>

        {/* ONDERZIJDE: T-stomp met geribbelde schroefdop op het kanaal, inspectieluik in de wand */}
        <path d="M262.2 611.6 H267.8 M262.2 621.1 H267.8" stroke={L} strokeWidth="0.55" />
        <path d="M262.2 610.1 L263.6 611.6 M262.2 622.5 L263.6 621.1" stroke={L} strokeWidth="0.7" />
        <rect x="267.8" y="610.1" width="2.2" height="12.4" rx="0.5" fill="white" stroke={L} strokeWidth="0.55" />
        {[612.3, 613.9, 615.5, 617.1, 618.8, 620.3].map((y) => (
          <line key={y} x1="267.8" y1={y} x2="270" y2={y} stroke={L} strokeWidth="0.35" />
        ))}
        <rect x="273.5" y="598.6" width="1.5" height="35.5" fill="white" stroke={L} strokeWidth="0.6" />
        {/* ankers boven en onder het luik */}
        <path d="M269.5 601.4 L271.3 600.7 L272.8 602.1 L274.1 600.7 L276.4 601.4 M276.4 600 V602.9 M269.5 631.3 L271.3 632 L272.8 630.5 L274.1 632 L276.4 631.3 M276.4 629.8 V632.6" fill="none" stroke={L} strokeWidth="0.4" />
        {/* opvangtrechter: rand over de volle breedte, ronde kom, tuit met koppeling */}
        <line x1="242.3" y1="628.4" x2="262.2" y2="628.4" stroke={L} strokeWidth="0.55" />
        <path d="M242.3 630.2 Q242.6 632.4 244.6 632.4 L248.6 632.5 Q250.9 632.6 250.9 634.8 V635.4 M262.2 630.2 Q262 632.4 260 632.4 L255.9 632.5 Q253.7 632.6 253.7 634.8 V635.4" fill="none" stroke={L} strokeWidth="0.55" />
        <rect x="250.7" y="635.4" width="3.2" height="1.8" fill="white" stroke={L} strokeWidth="0.4" />
        {/* tuit buigt naar rechts, door het kanaal en de wand naar de eerste sifon */}
        <path d="M250.9 637.9 Q251 642.5 255.5 642.5 M253.7 637.9 Q253.7 639.7 255.5 639.7" fill="none" stroke={L} strokeWidth="0.55" />
        <rect x="256.2" y="639.5" width="1.8" height="3.3" fill="white" stroke={L} strokeWidth="0.4" />
        <path d="M258 639.7 H267.8 M258 642.5 H267.8 M273.5 639.7 H284.9 M273.5 642.5 H284.9" stroke={L} strokeWidth="0.55" />
        <path d="M267.8 639.7 H273.5 M267.8 642.5 H273.5" stroke={L} strokeWidth="0.35" strokeDasharray="0.9 0.9" />
        <rect x="284.9" y="639.5" width="1.8" height="3.3" fill="white" stroke={L} strokeWidth="0.4" />
        <path d="M286.7 639.7 Q292 640 292 644.3 M286.7 642.5 Q289.1 642.7 289.1 644.3" fill="none" stroke={L} strokeWidth="0.55" />
        <SifonF1 x={289.1} y={644.3} />
        <path d="M296.7 644.3 Q296.8 640 301.3 639.7 M299.6 644.3 Q299.6 642.6 301.3 642.5" fill="none" stroke={L} strokeWidth="0.55" />
        <rect x="302" y="639.5" width="1.8" height="3.3" fill="white" stroke={L} strokeWidth="0.4" />
        {/* leiding naar de open verbinding: eindigt vrij boven een trechter */}
        <path d="M303.8 639.7 H328.6 Q333.4 639.7 333.4 644.4 V645.6 M303.8 642.5 H328.6 Q330.6 642.5 330.6 644.4 V645.6" fill="none" stroke={L} strokeWidth="0.55" />
        <path d="M329.2 647.4 L331.4 650.2 H333.6 L335.8 647.4" fill="none" stroke={L} strokeWidth="0.55" />
        <path d="M331.4 650.2 V653.1 M333.6 650.2 V653.1" stroke={L} strokeWidth="0.55" />
        <SifonF1 x={330.5} y={653.1} />
        <path d="M338 653.1 Q338.1 648.6 342.5 648.5 M341.1 653.1 Q341.1 651.4 342.5 651.4" fill="none" stroke={L} strokeWidth="0.55" />
        <path d="M342.5 648.5 H373.6 M342.5 651.4 H373.6 M376.7 648.5 H405.8 M376.7 651.4 H405.8 M405.8 648.5 V651.4" stroke={L} strokeWidth="0.55" />
        <rect x="373.6" y="648.3" width="3.1" height="3.3" fill="white" stroke={L} strokeWidth="0.4" />
        {/* blok met drie staande ovalen op de vloer */}
        <rect x="242.3" y="652.9" width="19.9" height="12.8" fill="white" stroke={L} strokeWidth="0.75" />
        {[245.6, 252.3, 259].map((cx) => (
          <ellipse key={cx} cx={cx} cy="659.3" rx="2.1" ry="3.6" fill="none" stroke={L} strokeWidth="0.6" />
        ))}
        <g fontSize="10.6" fill={L}>
          <line x1="279.7" y1="613.6" x2="290.5" y2="607.4" stroke={L} strokeWidth="0.45" />
          <line x1="290.5" y1="607.4" x2="296.1" y2="607.4" stroke={L} strokeWidth="0.45" />
          <path d="M275 616.3 L278.9 612.3 L280.4 614.8 Z" fill={L} />
          <text x="298" y="611">inspectieluik</text>
          <line x1="339.2" y1="643" x2="362.3" y2="619.9" stroke={L} strokeWidth="0.45" />
          <path d="M338.8 643.4 L339.8 639.6 L342.4 641.8 Z" fill={L} />
          <text x="366" y="620">open verbinding</text>
          <line x1="406.5" y1="649.5" x2="418" y2="636" stroke={L} strokeWidth="0.45" />
          <path d="M406.2 650 L407.2 646.3 L409.6 648.3 Z" fill={L} />
          <text x="428" y="636">1</text>
        </g>
        {/* hartlijn en maat 2 (hart kanaal tot voorkant inspectieluik) */}
        <line x1="252.3" y1="596" x2="252.3" y2="706" stroke={L} strokeWidth="0.45" strokeDasharray="6 1.6 1 1.6" />
        <path d="M252.3 690 q-2.6 -3.6 -1.3 -4.6 q1 -0.7 1.3 0.8 q0.3 -1.5 1.3 -0.8 q1.3 1 -1.3 4.6 Z" fill="none" stroke={L} strokeWidth="0.45" />
        <line x1="273.5" y1="666.7" x2="273.5" y2="702.1" stroke={L} strokeWidth="0.45" />
        <g stroke={L} strokeWidth="0.45" fill={L}>
          <line x1="241" y1="697.9" x2="284.9" y2="697.9" />
          <path d="M252.3 697.9 l-3.6 -1.2 v2.4 z" />
          <path d="M273.5 697.9 l3.6 -1.2 v2.4 z" />
          <circle cx="262.9" cy="697.9" r="0.8" />
          <line x1="262.9" y1="697.9" x2="270" y2="709" />
        </g>
        <text x="274" y="719" fontSize="10.6" fill={L}>2</text>
      </g>

      {/* oordeel als stempel over de tekening */}
      {st && (
        <g data-spel="stempel" transform="rotate(-14 210 470)">
          <rect x="40" y="440" width="340" height="58" rx="8" fill="white" opacity="0.92" stroke={st.kleur} strokeWidth="5" />
          <text x="210" y="479" textAnchor="middle" fontSize="27" fontWeight="800" fill={st.kleur}>
            {st.tekst}
          </text>
        </g>
      )}
    </svg>
  );
}

// ─── RONDE 1: IS DIT CLV NOG GOED? ───
// N48 §6.1: de zeven controles bepalen of een CLV van circa 15 jaar of ouder
// tijdelijk door mag (6.1-1-01, 6.1-2-04). Jonger en in orde: geen maatregelen
// op basis van leeftijd (6.1-1-05). Een punt niet in orde: niet herbruikbaar (6.1-1-02).

const R1_PUNTEN = [
  {
    id: "kap", x: 252.3, y: 110, telt: true, naam: "Kap op het dak",
    vraag: "Is de kap op het dak heel?", // 6.1-1-01 e
    goed: ["De kap zit vast. De kleur is wat verbleekt door de zon."],
    fout: ["Er zit een deuk in de kap. De luchtinlaat is half dichtgedrukt.", "Een rooster van de luchtinlaat is gescheurd."],
    waaromOk: "De kap met luchtinlaat moet heel zijn. Een verbleekte kleur is geen beschadiging.",
    waaromNiet: "De kap met luchtinlaat moet heel zijn. Een beschadiging maakt het CLV niet herbruikbaar.", // 6.1-1-02
    aandacht: "De kap met luchtinlaat moet heel zijn (een van de zeven controles)",
  },
  {
    id: "bevestiging", x: 252.3, y: 460, telt: true, naam: "Kanaal in de schacht",
    vraag: "Zit de afvoer goed vast aan het gebouw?", // 6.1-1-01 d
    goed: ["Je trekt stevig aan het kanaal. Het geeft niet mee."],
    fout: ["Je trekt aan het kanaal. Het beweegt een paar centimeter heen en weer."],
    waaromOk: "De afvoer moet goed aan het gebouw vastzitten. Dat is in orde.",
    waaromNiet: "De afvoer moet goed aan het gebouw vastzitten. Een kanaal dat beweegt, is niet in orde.",
    aandacht: "De afvoer moet goed aan het gebouw vastzitten (een van de zeven controles)",
  },
  {
    id: "storing", x: 305.4, y: 359.2, telt: true, naam: "Storingsoverzicht van de ketels",
    vraag: "Zijn er storingen die wijzen op rookgaslekkage?", // 6.1-1-01 b
    goed: ["In het overzicht staat twee keer: waterdruk te laag. Verder niets."],
    fout: ["De vorige monteur schreef twee keer: rookgaslucht bij de ketel, lek in het kanaal vermoed."],
    waaromOk: "Alleen storingen die wijzen op rookgaslekkage tellen. Een te lage waterdruk hoort daar niet bij.",
    waaromNiet: "Storingen die wijzen op rookgaslekkage betekenen: dit punt is niet in orde.",
    aandacht: "Storingen die wijzen op rookgaslekkage: dan is het CLV niet in orde",
  },
  {
    id: "ruimte", x: 305.4, y: 467, telt: true, naam: "Opstellingsruimte",
    vraag: "Komt er rookgas in de ruimte waar de ketel hangt?", // 6.1-1-01 c
    goed: ["Je meter geeft in de opstellingsruimte nergens rookgas aan."],
    fout: ["Bij de verbinding van de leiding naar de schacht geeft je meter rookgas aan."],
    waaromOk: "In de opstellingsruimte mag geen rookgas komen. Dat is hier zo.",
    waaromNiet: "Rookgas in de opstellingsruimte betekent: dit punt is niet in orde.",
    aandacht: "Rookgas in de opstellingsruimte: dan is het CLV niet in orde",
  },
  {
    id: "binnen", x: 252.3, y: 560, telt: true, naam: "Binnenkant rookgas- en luchtkanaal",
    vraag: "Zie je bij de inwendige inspectie gebreken?", // 6.1-1-01 a, 5.1g-02
    goed: ["Door de luikjes zie je een gesloten wand zonder gaten. De afdichtingsringen veren terug als je erop drukt."],
    fout: [
      "Door de luikjes zie je bruine plekken. Op een plek kun je met een schroevendraaier door de wand prikken.",
      "De afdichtingsringen voelen hard aan en hebben haarscheurtjes.",
    ],
    waaromOk: "Bij de inwendige inspectie van rookgas- en luchtkanaal zie je geen gebreken.",
    waaromNiet: "Corrosie en harde afdichtingsringen kunnen gevolgen zijn van veroudering. Hier is het een zichtbaar gebrek.", // 5.2f-05
    aandacht: "Inwendige inspectie van rookgas- en luchtkanaal: let op gaten, roest en harde afdichtingsringen",
  },
  {
    id: "luik", x: 276, y: 616, telt: true, naam: "Inspectieluik onderin",
    vraag: "Kun je in beide kanalen kijken zonder leidingen in de woning los te halen?", // 6.1-1-01 g
    goed: ["Je schroeft het luik los. Erachter zitten de luikjes van het rookgas- en het luchtkanaal; die gaan open."],
    fout: ["Het luik is dichtgekit. Om in het kanaal te kijken moet je de leiding bij een ketel losmaken."],
    waaromOk: "Je kunt rookgas- en luchtkanaal van binnen bekijken zonder leidingen in de woning te demonteren.",
    waaromNiet: "Je moet in beide kanalen kunnen kijken zonder leidingen in de woning te demonteren. Hier kan dat niet.",
    aandacht: "Beide kanalen moeten van binnen te bekijken zijn zonder leidingen in de woning te demonteren",
  },
  {
    id: "condens", x: 337, y: 656, telt: true, naam: "Condensafvoer",
    vraag: "Werkt de condensafvoer nog voldoende?", // 6.1-1-01 f
    goed: ["Je giet een emmer water in de opvang. Na een minuut is alles weggelopen."],
    fout: ["Je giet een emmer water in de opvang. Na twee minuten staat het nog in de eerste sifon."],
    waaromOk: "De condensafvoer moet nog voldoende werken. Dat doet hij.",
    waaromNiet: "De condensafvoer moet nog voldoende werken. Blijft het water staan, dan is dit punt niet in orde.",
    aandacht: "De condensafvoer moet nog voldoende werken (een van de zeven controles)",
  },
];

// Twee plekken die niet bij de zeven controles horen (kaartjes boven de tekening).
const R1_LOS = [
  {
    id: "ketelleeftijd", telt: false, naam: "Leeftijd ketel meneer De Vries",
    vraag: "Hoe oud is de ketel die vervangen wordt?",
    goed: ["De ketel is 3 jaar oud. Hij is kapot door een lek in de warmtewisselaar."],
    waarom: "Telt niet mee: lopen ketel en afvoer niet gelijk, dan bepaalt de leeftijd van de afvoer de aanpak.", // 6.1-2-01
    aandacht: "De leeftijd van de afvoer bepaalt de aanpak, niet die van de ketel",
  },
  {
    id: "trap", telt: false, naam: "Schachtwand in het trappenhuis",
    vraag: "Hoe ziet de buitenkant van de schacht eruit?",
    goed: ["De verf op de buitenkant van de schachtwand bladdert af."],
    waarom: "Telt niet mee: de controle gaat over het rookgas- en luchtkanaal zelf, niet over het verfwerk van de schacht.", // 6.1-1-01
    aandacht: "De zeven controles gaan over het CLV zelf, niet over verfwerk",
  },
];

// Elke speelbeurt een andere uitkomst: jong en in orde, oud en in orde, of een gebrek.
function maakR1() {
  const r = Math.random();
  const soort = r < 0.3 ? "geen" : r < 0.65 ? "door" : "niet";
  // jonger dan 15 jaar is hier minstens 11 jaar: dit is een onderdruk-CLV en
  // dat werd sinds 2015 niet meer toegepast (5.1c-07)
  const leeftijd =
    soort === "geen" ? 11 + Math.floor(Math.random() * 4) : 16 + Math.floor(Math.random() * 5);
  // tijdelijk doorgebruik is alleen een begrip boven circa 15 jaar: "niet" en "door" zijn altijd 16 tot 20 jaar
  const leeftijdNiet = leeftijd;
  const aantalFout = soort === "niet" ? 1 + Math.floor(Math.random() * 2) : 0;
  const fout = new Set(schud(R1_PUNTEN.map((p) => p.id)).slice(0, aantalFout));
  const bevinding = {};
  for (const p of R1_PUNTEN) {
    bevinding[p.id] = fout.has(p.id) ? { oordeel: "niet", tekst: kies(p.fout) } : { oordeel: "ok", tekst: kies(p.goed) };
  }
  for (const p of R1_LOS) bevinding[p.id] = { oordeel: "telt", tekst: p.goed[0] };
  return { leeftijd: leeftijdNiet, bevinding, uitkomst: soort };
}

const R1_OORDEEL = [
  { id: "geen", tekst: "Geen maatregelen op basis van leeftijd." },
  { id: "door", tekst: "Tijdelijk doorgebruik, onder strikte voorwaarden en met een plan met de eigenaar (VvE)." },
  { id: "niet", tekst: "Geen doorgebruik: niet herbruikbaar, de eigenaar (VvE) moet renoveren." },
  { id: "meteen", tekst: "Vandaag nog helemaal vervangen, omdat het ouder is dan 15 jaar." },
];

const R1_UITLEG = {
  // 6.1-1-05
  geen: "Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd. Of een nieuwe ketel op dit CLV past, is een aparte vraag. Die komt in ronde 2.",
  // 6.1-2-04, 6.1-3-01, 6.1-1-01
  door: "Ouder dan circa 15 jaar, maar alle zeven controles in orde: dan kan tijdelijk doorgebruik, onder strikte voorwaarden. Met de eigenaar komt er een plan voor de strang.",
  // 6.1-1-01, 6.1-1-02, 6.1-3-01
  niet: "Ouder dan circa 15 jaar en een van de zeven controles niet in orde: dan kan tijdelijk doorgebruik niet en is het CLV niet herbruikbaar. De eigenaar moet aan de slag met renovatie.",
};

function Ronde1({ beoordeel, onDone, noteer, zonderIntro, startStap }) {
  const [gestart, setGestart] = useState(zonderIntro);
  const [opzet] = useState(maakR1);
  const [stap, setStap] = useState(startStap === 2 ? 2 : 1);
  const [klaar, setKlaar] = useState({}); // id -> "ok" | "niet" | "telt"
  const [actief, setActief] = useState(null);
  const [foutKnop, setFoutKnop] = useState([]);
  const [fb, setFb] = useState(null);
  const [oordeelFout, setOordeelFout] = useState([]);
  const [oordeel, setOordeel] = useState(null);
  const [oordeelOpties] = useState(() => schud(R1_OORDEEL));
  const tekeningRef = useRef(null);

  const allePunten = [...R1_PUNTEN, ...R1_LOS];
  const aantalKlaar = Object.keys(klaar).length;
  const plek = actief ? allePunten.find((p) => p.id === actief) : null;
  const bev = actief ? opzet.bevinding[actief] : null;

  useEffect(() => {
    naarBoven();
  }, [stap, gestart]);

  const open = (id, e) => {
    if (klaar[id]) return;
    setActief(id);
    setFoutKnop([]);
    setFb(null);
    plekInBeeld(e?.currentTarget);
  };

  const uitlegVoor = (p, oordeelId) => (!p.telt ? p.waarom : oordeelId === "ok" ? p.waaromOk : p.waaromNiet);

  const antwoord = (keuze, e) => {
    if (!plek || klaar[plek.id]) return;
    const juist = bev.oordeel;
    if (keuze === juist) {
      beoordeel("goed", punt(e));
      setKlaar((k) => ({ ...k, [plek.id]: juist }));
      setFb({ goed: true, tekst: uitlegVoor(plek, juist) });
    } else {
      beoordeel("fout", punt(e));
      noteer(plek.aandacht);
      setFoutKnop((f) => [...f, keuze]);
      const extra = keuze === "telt" ? "Dit is wel een van de zeven controles. " : "";
      setFb({ goed: false, tekst: `${extra}${uitlegVoor(plek, juist)}` });
    }
  };

  const kiesOordeel = (o, e) => {
    const juist = opzet.uitkomst;
    if (o.id === juist) {
      beoordeel("goed", punt(e));
      setOordeel(o.id);
      playSound("levelup");
      setFb({ goed: true, tekst: R1_UITLEG[juist] });
      // de stempel staat midden op de tekening: in beeld schuiven, boven de balk
      setTimeout(() => {
        const el = tekeningRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        window.scrollBy({ top: r.top + r.height * 0.5 - 170, behavior: "smooth" });
      }, 80);
      return;
    }
    beoordeel("fout", punt(e));
    setOordeelFout((f) => [...f, o.id]);
    if (o.id === "meteen") {
      noteer("Ouder dan circa 15 jaar betekent niet meteen vervangen: met alle controles in orde kan tijdelijk doorgebruik");
      setFb({ goed: false, tekst: "Na circa 15 jaar is meteen vervangen te stellig. Zijn alle zeven controles in orde, dan kan tijdelijk doorgebruik onder voorwaarden. Is een punt niet in orde, dan is het CLV niet herbruikbaar en volgt renovatie." }); // T12
    } else if (juist === "niet") {
      noteer("Ouder dan circa 15 jaar en een van de zeven controles niet in orde: geen tijdelijk doorgebruik");
      setFb({ goed: false, tekst: `Het CLV is ${opzet.leeftijd} jaar oud en je vond een punt dat niet in orde is. Dan kan tijdelijk doorgebruik niet en is het CLV niet herbruikbaar.` }); // 6.1-1-01, 6.1-1-02
    } else if (juist === "door") {
      noteer("Ouder dan circa 15 jaar en alles in orde: tijdelijk doorgebruik onder voorwaarden, met een plan met de eigenaar");
      setFb({ goed: false, tekst: `Het CLV is ${opzet.leeftijd} jaar oud: ouder dan circa 15 jaar. Alle zeven controles zijn in orde. Dan kan tijdelijk doorgebruik onder voorwaarden.` });
    } else {
      noteer("Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd");
      setFb({ goed: false, tekst: `Het CLV is ${opzet.leeftijd} jaar oud: jonger dan circa 15 jaar. Alles is in orde. Dan zijn er geen maatregelen nodig op basis van leeftijd.` });
    }
  };

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 1: Is dit CLV nog goed?" intro="Flat Zonnehof. Meneer De Vries wil een nieuwe ketel." onStart={() => setGestart(true)}>
        <UitlegItem term="Zeven controles">
          {/* 6.1-1-01, 5.1g-02 */}
          binnenkant van rookgas- en luchtkanaal, storingen door rookgaslekkage, rookgas in de opstellingsruimte, bevestiging, kap, condensafvoer en of je erin kunt kijken zonder leidingen in de woning los te halen.
        </UitlegItem>
        <UitlegItem term="Circa 15 jaar of ouder">
          {/* 6.1-2-04, 6.1-1-02, 6.1-1-05, 6.1-3-01 */}
          tijdelijk doorgebruik kan alleen als alle zeven in orde zijn, met een plan met de eigenaar. Is er een punt niet in orde, dan kan doorgebruik niet. Jonger en alles in orde: geen maatregelen op basis van leeftijd.
        </UitlegItem>
        <UitlegItem term="Leeftijd">
          {/* 6.1-2-01, 6.1-1-03, 5.2f-05 */}
          de leeftijd van de afvoer telt, niet die van de ketel. Na circa 15 jaar kan metaal roesten, kunststof bros en afdichtingsringen hard worden.
        </UitlegItem>
      </RondeIntro>
    );
  }

  const keuzeKnoppen = [
    { id: "ok", tekst: "In orde", rand: C.green },
    { id: "niet", tekst: "Niet in orde", rand: C.amber },
    { id: "telt", tekst: "Telt niet mee", rand: C.brown },
  ];

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        titel="Ronde 1: Is dit CLV nog goed?"
        stap={stap}
        stappen={2}
        opdracht={
          stap === 1
            ? "Tik op elke plek en elk kaartje. Kies: in orde, niet in orde, of telt niet mee voor de controle."
            : "Kies wat er met het CLV van flat Zonnehof kan."
        }
        teller={stap === 1 ? `${aantalKlaar} van ${allePunten.length}` : null}
      />
      {stap === 1 && (
        <Situatie wie="Flat Zonnehof.">
          Meneer De Vries wil een nieuwe ketel. Volgens de VvE is het CLV <span className="font-bold">{opzet.leeftijd} jaar</span> oud. Beoordeel eerst het CLV.
        </Situatie>
      )}
      {stap === 1 && (
        <div className="w-full max-w-2xl grid grid-cols-2 gap-2 mb-3">
          {R1_LOS.map((p) => (
            <button
              key={p.id}
              onClick={(e) => open(p.id, e)}
              data-goed={qaGoed(!klaar[p.id] && !actief)}
              className="rounded-xl border-2 px-2 py-2 min-h-[48px] text-sm font-bold text-left"
              style={{
                backgroundColor: klaar[p.id] ? "#EFEAE4" : "white",
                borderColor: klaar[p.id] ? C.brown : actief === p.id ? C.olive : C.red,
                color: C.brownText,
              }}
            >
              {klaar[p.id] ? "✓ " : "? "}
              {p.naam}
            </button>
          ))}
        </div>
      )}

      {stap === 2 && (
        <div className="w-full max-w-2xl rounded-xl border-2 px-3 py-2 mb-3" style={{ backgroundColor: C.bgCard, borderColor: C.beigeMid }}>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
            <span className="text-sm font-bold" style={{ color: C.brownText }}>Jouw controle: CLV van {opzet.leeftijd} jaar</span>
          </div>
          <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5" style={{ color: C.brownText }}>
            {R1_PUNTEN.map((p) => {
              const st = klaar[p.id] ?? opzet.bevinding[p.id].oordeel;
              return (
                <li key={p.id} className="flex gap-1.5 items-start">
                  <span className="font-bold" style={{ color: st === "ok" ? C.green : C.amber }}>{st === "ok" ? "✓" : "!"}</span>
                  <span>
                    {p.naam}: {st === "ok" ? "in orde" : "niet in orde"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        <div ref={tekeningRef} className="w-full max-w-[340px] mx-auto md:w-[340px] shrink-0 relative">
          <StrangSVG stempel={oordeel && oordeel !== "meteen" ? oordeel : null} />
          {stap === 1 &&
            R1_PUNTEN.map((p) => (
              <Stip
                key={p.id}
                x={r1x(p.x)}
                y={r1y(p.y)}
                w={R1_W}
                h={R1_H}
                status={klaar[p.id]}
                actief={actief === p.id}
                label={p.naam}
                onClick={(e) => open(p.id, e)}
                goed={!actief}
              />
            ))}
        </div>

        <div className="flex-1 w-full flex flex-col gap-3">
          {stap === 1 && !plek && (
            <p className="text-sm italic" style={{ color: C.brown }}>
              Tik op een rode stip in de tekening of op een kaartje bovenaan.
            </p>
          )}
          {stap === 1 && aantalKlaar === allePunten.length && !plek && (
            <GameButton onClick={() => { setStap(2); setFb(null); }} className="w-full">
              Naar je oordeel
            </GameButton>
          )}
        </div>
      </div>

      {stap === 1 && plek && (
        <VasteBalk>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.oliveDark }}>{plek.naam}</p>
            <button className="text-sm underline px-3 min-h-[44px] min-w-[64px]" style={{ color: C.brown }} onClick={() => setActief(null)}>
              sluiten
            </button>
          </div>
          <p className="text-sm font-bold" style={{ color: C.brownText }}>{plek.vraag}</p>
          <div className="rounded-lg px-3 py-2 text-sm italic" style={{ backgroundColor: "#FDF4E9", color: C.brownText }}>
            Wat je ziet: {bev.tekst}
          </div>
          {!klaar[plek.id] && (
            <div className="grid grid-cols-3 gap-2">
              {keuzeKnoppen.map((k) => (
                <button
                  key={k.id}
                  disabled={foutKnop.includes(k.id)}
                  onClick={(e) => antwoord(k.id, e)}
                  data-goed={qaGoed(k.id === bev.oordeel)}
                  className="min-h-[48px] rounded-xl border-2 text-sm font-bold px-1"
                  style={{
                    backgroundColor: foutKnop.includes(k.id) ? C.redLight : "white",
                    borderColor: foutKnop.includes(k.id) ? C.red : k.rand,
                    color: C.brownText,
                  }}
                >
                  {k.tekst}
                </button>
              ))}
            </div>
          )}
          <Terugkoppeling fb={fb} />
          {klaar[plek.id] && (
            <GameButton onClick={() => { setActief(null); setFb(null); }} className="w-full">
              {aantalKlaar === allePunten.length ? "Klaar met de controle" : "Volgende plek"}
            </GameButton>
          )}
        </VasteBalk>
      )}

      {stap === 2 && (
        <VasteBalk>
          {!oordeel && <p className="text-sm font-bold" style={{ color: C.brownText }}>Wat kan er met dit CLV van {opzet.leeftijd} jaar?</p>}
          {!oordeel && <Keuzes opties={oordeelOpties} fout={oordeelFout} goedId={oordeel} juist={[opzet.uitkomst]} onKies={kiesOordeel} />}
          <Terugkoppeling fb={fb} />
          {oordeel && (
            <GameButton onClick={onDone} variant="green" className="w-full">
              Naar de controlevragen
            </GameButton>
          )}
        </VasteBalk>
      )}
    </div>
  );
}

// ─── TEKENING: combinatie RGAV en ventilatieafvoer, VMC/MVS (N48 figuur 10, PDF-pagina 25) ───
// De figuur is een rasterbeeld. Maten opgemeten in een uitsnede op 260 dpi
// (linkerwand x 80, verdiepingshoogte 502 px) en omgerekend met vx/vy.
const VMC_W = 300;
const VMC_H = 610;
const VS = 0.2273;
const vx = (x) => 64.3 + x * VS;
const vy = (y) => 120 + (y - 558) * VS;
const VMC_VERD = 502; // hoogte van een verdieping in uitsnede-pixels
const VMC_ONDER = 558 + 3 * VMC_VERD + 592; // bovenkant onderste vloer

// rechthoek in uitsnede-pixels
function VR({ x1, y1, x2, y2, ...rest }) {
  return <rect x={vx(x1)} y={vy(y1)} width={(x2 - x1) * VS} height={(y2 - y1) * VS} {...rest} />;
}

function VmcSVG({ ventilatorAan = true }) {
  const L = C.brownText;
  const grijs = "#DADADA";
  const arc = "url(#svcArc2)";
  const lijn = { stroke: L, strokeWidth: 0.9 };
  const pijlLinks = (x1, x2, y) => (
    <g stroke={L} strokeWidth="1.1" fill={L}>
      <line x1={vx(x1)} y1={vy(y)} x2={vx(x2) + 5} y2={vy(y)} />
      <path d={`M${vx(x2)} ${vy(y)} l6 -2.4 v4.8 z`} />
    </g>
  );
  const pijlRechts = (x1, x2, y) => (
    <g stroke={L} strokeWidth="1.1" fill={L}>
      <line x1={vx(x1)} y1={vy(y)} x2={vx(x2) - 5} y2={vy(y)} />
      <path d={`M${vx(x2)} ${vy(y)} l-6 -2.4 v4.8 z`} />
    </g>
  );
  const pijlOmlaag = (x, y1, y2) => (
    <g stroke={L} strokeWidth="1.1" fill={L}>
      <line x1={vx(x)} y1={vy(y1)} x2={vx(x)} y2={vy(y2) - 5} />
      <path d={`M${vx(x)} ${vy(y2)} l-2.4 -6 h4.8 z`} />
    </g>
  );
  // vloer met sparing voor de lucht (links van de afvoerbuis); de onderste vloer is dicht
  const vloer = (y, dikte, metSparing) => (
    <g key={`v${y}`}>
      {metSparing ? (
        <>
          <VR x1={25} y1={y} x2={150} y2={y + dikte} fill={arc} {...lijn} />
          <VR x1={150} y1={y} x2={215} y2={y + dikte} fill="white" {...lijn} />
          <VR x1={215} y1={y} x2={255} y2={y + dikte} fill={arc} {...lijn} />
        </>
      ) : (
        <VR x1={25} y1={y} x2={255} y2={y + dikte} fill={arc} {...lijn} />
      )}
      <VR x1={322} y1={y} x2={690} y2={y + dikte} fill={arc} {...lijn} />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${VMC_W} ${VMC_H}`} className="w-full h-auto select-none" aria-label="Doorsnede van een schacht met ventilator op het dak">
      <defs>
        <pattern id="svcArc2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={L} strokeWidth="0.8" />
        </pattern>
      </defs>

      {/* centrale afvoerbuis van onder tot de ventilator */}
      <VR x1={255} y1={330} x2={322} y2={2258} fill="white" stroke={L} strokeWidth="1.2" />

      {/* dakopbouw: dichte bovenkant, verticale verbindingen en dubbele kragen (gearceerd plus wit) */}
      <line x1={vx(100)} y1={vy(327)} x2={vx(480)} y2={vy(327)} stroke={L} strokeWidth="1.8" />
      <line x1={vx(100)} y1={vy(327)} x2={vx(100)} y2={vy(555)} stroke={L} strokeWidth="1" />
      <line x1={vx(480)} y1={vy(327)} x2={vx(480)} y2={vy(555)} stroke={L} strokeWidth="1" />
      <VR x1={80} y1={355} x2={100} y2={552} fill={arc} {...lijn} />
      <VR x1={100} y1={355} x2={122} y2={552} fill="white" {...lijn} />
      <VR x1={458} y1={355} x2={478} y2={552} fill="white" {...lijn} />
      <VR x1={478} y1={355} x2={500} y2={552} fill={arc} {...lijn} />
      {pijlRechts(0, 55, 455)}
      {pijlLinks(660, 525, 455)}
      <circle cx={vx(615)} cy={vy(455)} r="1.3" fill={L} />
      <path d={`M${vx(615)} ${vy(455)} L${vx(720)} ${vy(350)} H${vx(745)}`} fill="none" stroke={L} strokeWidth="0.8" />
      <text x={vx(752)} y={vy(366)} fontSize="13" fill={L}>2</text>

      {/* ventilator (1) op de afvoerbuis, met liggende propeller en pijl omhoog */}
      <polygon
        points={[[250, 232], [330, 232], [345, 250], [345, 318], [330, 330], [250, 330], [235, 318], [235, 250]].map(([x, y]) => `${vx(x)},${vy(y)}`).join(" ")}
        fill="white"
        stroke={L}
        strokeWidth="1.2"
      />
      <line x1={vx(235)} y1={vy(250)} x2={vx(345)} y2={vy(250)} stroke={L} strokeWidth="0.7" />
      <g
        style={{
          transformBox: "view-box",
          transformOrigin: `${vx(290)}px ${vy(282)}px`,
          animation: ventilatorAan ? "spinFan 0.9s linear infinite" : "none",
        }}
      >
        <ellipse cx={vx(267)} cy={vy(282)} rx="5" ry="1.4" fill="none" stroke={L} strokeWidth="0.8" />
        <ellipse cx={vx(313)} cy={vy(282)} rx="5" ry="1.4" fill="none" stroke={L} strokeWidth="0.8" />
      </g>
      {ventilatorAan && (
        <g stroke={L} strokeWidth="1.2" fill={L}>
          <line x1={vx(290)} y1={vy(195)} x2={vx(290)} y2={vy(70)} />
          <path d={`M${vx(290)} ${vy(55)} l-2.6 6.5 h5.2 z`} />
        </g>
      )}
      <path d={`M${vx(345)} ${vy(270)} L${vx(480)} ${vy(165)} H${vx(495)}`} fill="none" stroke={L} strokeWidth="0.8" />
      <path d={`M${vx(345)} ${vy(270)} l1.2 -5.4 l3.4 4 z`} fill={L} />
      <text x={vx(503)} y={vy(182)} fontSize="13" fill={L}>1</text>

      {/* vloeren: dak, drie verdiepingsvloeren met sparing, onderste vloer dicht */}
      {[0, 1, 2, 3].map((k) => vloer(558 + k * VMC_VERD, 27, true))}
      {vloer(VMC_ONDER, 30, false)}

      {/* linkerwand (gearceerd) */}
      {[0, 1, 2, 3].map((k) => {
        const s = 558 + k * VMC_VERD + 27;
        const e = k < 3 ? 558 + (k + 1) * VMC_VERD : VMC_ONDER;
        return <VR key={`lw${k}`} x1={80} y1={s} x2={108} y2={e} fill={arc} {...lijn} />;
      })}

      {/* per verdieping: lucht omlaag door de sparing, ventilatieleiding (3), afvoer van het B1-toestel */}
      {[0, 1, 2, 3].map((k) => {
        const S = 558 + k * VMC_VERD;
        const hoog = k < 3 ? VMC_VERD : 592;
        const opening = S + hoog - 80; // pijl van de schacht naar de woning
        return (
          <g key={`vd${k}`}>
            {pijlOmlaag(180, S - 38, S + 97)}
            {/* middenwand (gearceerd), open voor ventilatieleiding, afvoer en de luchtopening */}
            <VR x1={378} y1={S + 27} x2={405} y2={S + 57} fill={arc} {...lijn} />
            <VR x1={378} y1={S + 80} x2={405} y2={S + 97} fill={arc} {...lijn} />
            <VR x1={378} y1={S + 122} x2={405} y2={opening - 22} fill={arc} {...lijn} />
            <VR x1={378} y1={opening + 22} x2={405} y2={S + hoog} fill={arc} {...lijn} />
            {/* rechterwand: lichtgrijs, gearceerd waar de ventilatieleiding doorgaat */}
            <VR x1={608} y1={S + 27} x2={634} y2={S + 57} fill={arc} {...lijn} />
            <VR x1={608} y1={S + 80} x2={634} y2={S + 122} fill={arc} {...lijn} />
            <VR x1={608} y1={S + 122} x2={634} y2={S + hoog} fill={grijs} {...lijn} />
            {/* ventilatieleiding uit de woning naar de afvoerbuis */}
            <VR x1={322} y1={S + 57} x2={745} y2={S + 80} fill="white" stroke={L} strokeWidth="1" />
            {pijlLinks(890, 755, S + 68)}
            {/* afvoer van het B1-toestel (dubbele lijn) */}
            <path
              d={`M${vx(322)} ${vy(S + 97)} H${vx(518)} V${vy(S + 150)} H${vx(493)} V${vy(S + 122)} H${vx(322)}`}
              fill="white"
              stroke={L}
              strokeWidth="1"
            />
            {/* B1-toestel */}
            <VR x1={458} y1={S + 150} x2={553} y2={S + 352} fill="white" stroke={ventilatorAan ? L : C.red} strokeWidth="1.2" />
            <text x={vx(470)} y={vy(S + 262)} fontSize="14" fontStyle="italic" fill={L}>B</text>
            <text x={vx(512)} y={vy(S + 275)} fontSize="13" fill={L}>1</text>
            {!ventilatorAan && (
              <text data-spel="uit" x={vx(505)} y={vy(S + 335)} fontSize="13" fontWeight="800" textAnchor="middle" fill={C.red}>UIT</text>
            )}
            {pijlRechts(335, 475, opening)}
          </g>
        );
      })}
      {/* leider van 3 met een stip op de pijl van de ventilatielucht */}
      <circle cx={vx(845)} cy={vy(626)} r="1.3" fill={L} />
      <path d={`M${vx(845)} ${vy(626)} L${vx(950)} ${vy(520)} H${vx(975)}`} fill="none" stroke={L} strokeWidth="0.8" />
      <text x={vx(982)} y={vy(535)} fontSize="13" fill={L}>3</text>
    </svg>
  );
}

// ─── RONDE 2: WAT DOE JE BIJ VERVANGING? ───

// Klus ketelkeuze: vier ketels; een voldoet aan alle vier voorwaarden (5.2g-01).
// Context: tijdelijk doorgebruik van een oud onderdruk-CLV (5.1b-05, 6.1-2-04).
// Per kaart wisselen de goede en foute waarden, zodat je de grens moet kennen
// en niet de kaart kunt kiezen die nergens afwijkt.
const KETEL_EISEN = [
  {
    id: "klep", label: "Terugslagklep",
    goed: ["samen met deze ketel gekeurd", "met de ketel gekeurd, zit in de leiding"],
    fout: ["los meegeleverd door de groothandel", "universele klep, past op elk merk"],
    uitleg: "De terugslagklep moet samen met de ketel gekeurd zijn. Een losse of universele klep voldoet niet.", // 5.2g-01, 5.2b-02, T20
  },
  {
    id: "belasting", label: "Maximale belasting",
    goed: ["24 kW", "22 kW", "23 kW"],
    fout: ["26 kW", "25 kW"],
    uitleg: "De maximale belasting mag niet hoger zijn dan die van de oude ketel (24 kW).", // 5.2g-01
  },
  {
    id: "toekomst", label: "Belasting getoetst aan het nieuwe kanaal",
    goed: ["ja, past", "ja, nagerekend"],
    fout: ["nog niet nagegaan", "volgt na plaatsing"],
    uitleg: "De belasting moet passen bij het nieuwe kanaal dat er straks komt. Dat moet je eerst weten.", // 5.2g-01
  },
  {
    id: "druk", label: "Bestand tegen overdruk (met aansluitleiding, bij minimale belasting)",
    goed: ["25 Pa", "28 Pa", "30 Pa"],
    fout: ["20 Pa", "22 Pa", "15 Pa"],
    uitleg: "De ketel met aansluitleiding moet bestand zijn tegen minimaal 25 Pa overdruk.", // 5.2g-01, T19
  },
];

function maakKetels() {
  const volgorde = schud(KETEL_EISEN.map((e) => e.id));
  // drie foute kaarten: elk valt op een of twee eisen af
  const fouteSets = volgorde.slice(0, 3).map((id, i) => (Math.random() < 0.35 ? [id, volgorde[(i + 1) % 4]] : [id]));
  const kaarten = [{ id: "goed", faalt: [] }, ...fouteSets.map((f, i) => ({ id: `k-${i}`, faalt: f }))];
  return schud(kaarten).map((k, i) => ({
    ...k,
    naam: `Ketel ${"ABCD"[i]}`,
    waarden: Object.fromEntries(KETEL_EISEN.map((e) => [e.id, kies(k.faalt.includes(e.id) ? e.fout : e.goed)])),
  }));
}

// Klus tijdelijk doorgebruik: zinnen met een gat (6.1-2-04, 6.1-2-05; zonder de 3 jaar, T11).
const GATEN = [
  {
    id: "gat-a", voor: "Na de eerste ketelwissel in de strang heeft de VvE", na: "om beheersmaatregelen op te stellen en uit te voeren.", juist: "c1",
    waarom: "Binnen maximaal een jaar na de eerste ketelwissel moeten de beheersmaatregelen opgesteld en uitgevoerd zijn.",
  },
  {
    id: "gat-b", voor: "Met die maatregelen kan het oude CLV maximaal", na: "langer mee.", juist: "c5",
    waarom: "Met beheersmaatregelen kan de levensduur van het oude CLV maximaal vijf jaar worden verlengd.",
  },
  {
    id: "gat-c", voor: "Een van die maatregelen: CO-melders in", na: ".", juist: "celk",
    waarom: "Tijdens doorgebruik hangen er CO-melders in de opstellingsruimte van elke woning.",
  },
];
const GAT_CHIPS = [
  { id: "c1", label: "1 jaar" },
  { id: "c5", label: "5 jaar" },
  { id: "c10", label: "10 jaar" },
  { id: "c15", label: "15 jaar" },
  { id: "celk", label: "de opstellingsruimte van elke woning" },
  { id: "ctrap", label: "het trappenhuis van de flat" },
];

const KEUZE_KLUSSEN = [
  {
    id: "plan", soort: "keuze",
    wie: "Meneer Bakker (flat De Linde)",
    situatie: "krijgt als eerste in zijn strang een nieuwe ketel. De ketel werkt prima op het oude kanaal.",
    opdracht: "Kies wat je nog regelt.",
    opties: [
      { id: "goed", tekst: "Met de eigenaar (VvE) een vervangings- of renovatieplan voor de hele strang opstellen." },
      { id: "niets", tekst: "Niets meer: de ketel werkt zonder storing, dus het kanaal is in orde." },
      { id: "buren", tekst: "Meneer Bakker vragen om met zijn bovenburen samen een plan te maken." },
    ],
    // 5.2g-02, 6.1-3-01, 6.4-06
    waarom: "De eerste ketelwissel in een strang geeft niet meteen storing, maar is wel de start van een plan voor de hele strang. Dat plan maak je met de gebouweigenaar.",
    fout: {
      niets: "Geen storing betekent niet dat je klaar bent. De eerste ketelwissel is de start van een plan voor de hele strang.",
      buren: "Het plan maak je niet met de bewoners maar met de gebouweigenaar, bijvoorbeeld de VvE.",
    },
    aandacht: "De eerste ketelwissel in een strang is de start van een renovatieplan met de eigenaar (VvE)",
  },
  {
    id: "c11", soort: "keuze",
    wie: "Flat Het Anker",
    situatie: "wordt gerenoveerd. De VvE kiest voor een toestelgebonden CLV (C(11)).",
    opdracht: "Kies wat dit betekent voor de ketels in de strang.",
    opties: [
      { id: "goed", tekst: "Alle ketels worden vervangen door een type (C(11)) en een fabricaat." },
      { id: "c10", tekst: "Elke bewoner kiest zelf een merk, als het maar een C(10)-ketel is." },
      { id: "jong", tekst: "Bewoners met een ketel jonger dan 5 jaar houden hun eigen ketel." },
    ],
    // 6.1-3-02, 5.1b-08
    waarom: "Bij een toestelgebonden CLV worden na renovatie alle ketels een type (C(11)) en een fabricaat. Een losse ketelwissel met een ander merk kan hier niet.",
    fout: {
      c10: "Merken door elkaar mag alleen bij een CLV met overdrukdimensionering en C(10)-ketels. Bij een toestelgebonden CLV: alle ketels een type (C(11)) en een fabricaat.",
      jong: "Bij een toestelgebonden CLV gaan alle ketels in de strang over op een type (C(11)) en een fabricaat, ook de jonge.",
    },
    aandacht: "Toestelgebonden CLV (C(11)): alle ketels een type en een fabricaat",
  },
  {
    id: "voering", soort: "keuze",
    wie: "Flat De Linde",
    situatie: "krijgt na het doorgebruik een overdruksysteem in plaats van het oude onderdruk-CLV. Het plan is een voering in het oude kanaal. Jij meet: het kanaal is te smal voor de voering die nodig is.",
    opdracht: "Kies de oplossing.",
    opties: [
      { id: "goed", tekst: "Het hele systeem vervangen." },
      { id: "dun", tekst: "Een dunnere voering nemen dan eigenlijk nodig is." },
      { id: "laten", tekst: "Het onderdruk-CLV houden en voortaan gewoon moderne HR-ketels aansluiten." },
    ],
    // 6.1-4-03, 6.1-4-04, 5.1b-05
    waarom: "Een onderdruk-CLV dat niet meer bruikbaar is, wordt een overdruksysteem: met een voering of door alles te vervangen. Past de voering niet, dan vervang je het hele systeem.",
    fout: {
      dun: "De maat van het kanaal moet genoeg zijn voor de voering. Is hij te klein, dan vervang je het hele systeem.",
      laten: "Moderne HR-ketels horen niet op een oud onderdruk-CLV; tijdelijk doorgebruik is maar tijdelijk. Past de voering niet, dan vervang je het hele systeem.",
    },
    aandacht: "Te smal voor een voering: dan vervang je het hele systeem",
  },
  {
    id: "dossier", soort: "keuze",
    wie: "Meneer Bakker:",
    situatie: "\"Zet hem nou aan, ik wil vanavond douchen!\" De nieuwe ketel hangt. Van het CLV is geen technisch dossier, dus je kunt niet controleren of de afvoer geschikt is.",
    opdracht: "Kies wat je doet.",
    opties: [
      { id: "goed", tekst: "De ketel niet in bedrijf nemen tot je kunt controleren of de afvoer geschikt is." },
      { id: "later", tekst: "De ketel aanzetten en het dossier morgen opvragen." },
      { id: "teken", tekst: "De ketel aanzetten als meneer Bakker tekent dat het voor zijn eigen risico is." },
    ],
    // 6.1-2-03
    waarom: "Ontbreekt het technisch dossier en kun je de afvoer niet controleren, dan neem je de ketel niet in bedrijf.",
    fout: {
      later: "Zonder dossier kun je niet nagaan of de afvoer geschikt is. Dan neem je de ketel niet in bedrijf.",
      teken: "Een handtekening verandert niets: zonder dossier en controle neem je de ketel niet in bedrijf.",
    },
    aandacht: "Geen technisch dossier en geen controle mogelijk: ketel niet in bedrijf nemen",
  },
];

// Per speelbeurt: ketelkeuze en zinnen altijd, plus twee van de vier keuzeklussen.
function kiesKlussen() {
  const twee = schud(KEUZE_KLUSSEN.map((k) => k.id)).slice(0, 2);
  return schud(["ketel", "gaten", ...twee]);
}

// Stap 2: welke tekening is een VMC (MVS)? Daarna kenmerken, test en advies (6.4).
const SCHACHT_TYPES = [
  { id: "clv", tekst: "Concentrisch CLV" },
  { id: "half", tekst: "Half-CLV" },
  { id: "vmc", tekst: "VMC (MVS)" },
];
const TYPE_UITLEG = {
  // 5.1a-02
  clv: "Een concentrisch CLV: lucht komt via de kap binnen en gaat omlaag in de ring, rookgas gaat omhoog in de binnenbuis. Geen ventilator op het dak.",
  // 6.4-01, 6.4-02, 6.4-07
  vmc: "Een VMC (MVS): een ventilator op het dak zuigt rookgas en ventilatielucht samen af, uit open toestellen (B1). De kanalen zijn vaak gespiraliseerde, verzinkte buis.",
};
const TYPE_FOUT = {
  // 5.1a-04
  half: "Bij een half-CLV is alleen de rookgasafvoer gezamenlijk en haalt elk toestel zijn lucht zelf, bijvoorbeeld uit de gevel. Dat zie je hier niet.",
  clvVoorVmc: "Kijk naar het dak en naar de leidingen uit de woningen: een ventilator en ventilatielucht in het afvoerkanaal. Dat is geen CLV.",
  vmcVoorClv: "Hier staat geen ventilator op het dak en er komt geen ventilatielucht in het kanaal. Het rookgas gaat in de binnenbuis omhoog, de lucht in de ring omlaag.",
};

const VMC_PLEKKEN = [
  {
    id: "ventilator", x: vx(290), y: vy(282), echt: true, naam: "Ventilator op het dak",
    tekst: "Een centrale ventilator op het dak zuigt rookgas en ventilatielucht samen af.", // 6.4-02
  },
  {
    id: "ventilatie", x: vx(700), y: vy(626 + VMC_VERD), echt: true, naam: "Leiding uit de woning",
    tekst: "Ventilatielucht uit de woning gaat door hetzelfde afvoerkanaal als het rookgas.", // 6.4-01
  },
  {
    id: "b1", x: vx(505), y: vy(558 + VMC_VERD + 250), echt: true, naam: "Toestel B1",
    tekst: "Een open toestel zonder eigen ventilator. Het systeem is gemaakt voor ketels met hete rookgassen die zelf geen ventilator hebben.", // 6.4-03, 6.4-07
  },
  {
    id: "lucht", x: vx(22), y: vy(455), echt: false, naam: "Luchttoevoer bovenin",
    tekst: "Hier komt lucht binnen. Dat is geen kenmerk: bij een VMC (MVS) gaan rookgas en ventilatielucht samen de afvoer in.", // 6.4-01
  },
  {
    id: "opening", x: vx(420), y: vy(558 + 2 * VMC_VERD + 422), echt: false, naam: "Opening naar de woning",
    tekst: "Hier stroomt lucht naar de woning. Het kenmerk van een VMC (MVS) zit in de afvoer: rookgas en ventilatielucht samen.", // 6.4-01
  },
];

const VMC_OPLOSSINGEN = [
  { id: "vervang", goed: true, tekst: "De rookgasafvoer helemaal vervangen." },
  { id: "scheid", goed: true, tekst: "Rookgasafvoer en ventilatie scheiden." },
  {
    id: "hr", goed: false, tekst: "De nieuwe HR-ketel van Ahmed op het bestaande kanaal aansluiten.",
    uitleg: "Dit systeem is gemaakt voor ketels met hete rookgassen zonder eigen ventilator. Een VMC (MVS) is niet herbruikbaar als rookgasafvoer.", // 6.4-03, 6.4-05
  },
  {
    id: "klep", goed: false, tekst: "In elke ketel een terugslagklep zetten en het kanaal blijven gebruiken.",
    uitleg: "Ook met een klep blijft het een VMC (MVS). Die is niet herbruikbaar als rookgasafvoer.", // 6.4-05
  },
];

const VMC_ONTVANGERS = [
  { id: "goed", tekst: "De eigenaar van de flat (de VvE)." },
  { id: "ahmed", tekst: "Ahmed, de bewoner die de ketel wil." },
  { id: "leverancier", tekst: "De leverancier van de nieuwe ketel." },
];

// Feedback en "Volgende" staan in de vaste balk onderin, zodat ze op een telefoon altijd in beeld zijn.
function FbBalk({ fb, knop, onKnop }) {
  if (!fb) return null;
  return (
    <VasteBalk>
      <Terugkoppeling fb={fb} />
      {knop && (
        <GameButton onClick={onKnop} className="w-full">
          {knop}
        </GameButton>
      )}
    </VasteBalk>
  );
}

function KlusKeuze({ klus, beoordeel, noteer, onKlaar }) {
  const [opties] = useState(() => schud(klus.opties));
  const [fout, setFout] = useState([]);
  const [goedId, setGoedId] = useState(null);
  const [fb, setFb] = useState(null);
  const kiesOptie = (o, e) => {
    if (o.id === "goed") {
      beoordeel("goed", punt(e));
      setGoedId(o.id);
      setFb({ goed: true, tekst: klus.waarom });
    } else {
      beoordeel("fout", punt(e));
      noteer(klus.aandacht);
      setFout((f) => [...f, o.id]);
      setFb({ goed: false, tekst: klus.fout[o.id] });
    }
  };
  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      <Situatie wie={klus.wie}>{klus.situatie}</Situatie>
      <p className="text-sm font-bold" style={{ color: C.brownText }}>{klus.opdracht}</p>
      <Keuzes opties={opties} fout={fout} goedId={goedId} juist={["goed"]} onKies={kiesOptie} />
      <FbBalk fb={fb} knop={goedId ? "Volgende" : null} onKnop={onKlaar} />
    </div>
  );
}

function KlusKetels({ beoordeel, noteer, onKlaar }) {
  const [ketels] = useState(maakKetels);
  const [fout, setFout] = useState([]);
  const [goedId, setGoedId] = useState(null);
  const [fb, setFb] = useState(null);
  const kiesKetel = (k, e) => {
    if (goedId || fout.includes(k.id)) return;
    if (k.faalt.length === 0) {
      beoordeel("goed", punt(e));
      setGoedId(k.id);
      // 5.2g-01: de vier voorwaarden; een C(10)-ketel voldoet
      setFb({
        goed: true,
        tekst: "Deze ketel voldoet aan alle vier: klep samen gekeurd, niet zwaarder dan de oude, getoetst aan het nieuwe kanaal en bestand tegen minimaal 25 Pa. Een C(10)-ketel voldoet aan deze vier.",
      });
    } else {
      beoordeel("fout", punt(e));
      noteer("Nieuwe ketel tijdens doorgebruik: klep samen gekeurd, niet zwaarder, past bij het nieuwe kanaal, minimaal 25 Pa");
      setFout((f) => [...f, k.id]);
      setFb({ goed: false, tekst: `${k.naam}: ${KETEL_EISEN.filter((x) => k.faalt.includes(x.id)).map((x) => x.uitleg).join(" ")}` });
    }
  };
  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      {/* 5.1b-05, 6.1-2-04, 5.2g-01 */}
      <Situatie wie="Flat De Linde.">
        Het oude onderdruk-CLV is 17 jaar. Alle zeven controles waren in orde, dus de VvE gebruikt het tijdelijk door tot het nieuwe kanaal er is. De ketel van mevrouw Jansen (24 kW) is kapot. Een moderne HR-ketel hoort niet op een oud onderdruk-CLV. Tijdens doorgebruik mag het alleen als hij aan vier voorwaarden voldoet.
      </Situatie>
      <p className="text-sm font-bold" style={{ color: C.brownText }}>Kies de ketel die je mag ophangen.</p>
      {fb && !fb.goed && <Terugkoppeling fb={fb} />}
      <div className="grid grid-cols-2 gap-2">
        {ketels.map((k) => {
          const isFout = fout.includes(k.id);
          const isGoed = goedId === k.id;
          return (
            <button
              key={k.id}
              onClick={(e) => kiesKetel(k, e)}
              disabled={isFout || !!goedId}
              data-goed={qaGoed(k.faalt.length === 0 && !goedId)}
              className="text-left rounded-xl border-2 p-2 flex flex-col gap-1"
              style={{
                backgroundColor: isGoed ? C.greenLight : isFout ? C.redLight : "white",
                borderColor: isGoed ? C.green : isFout ? C.red : C.brownText,
                opacity: goedId && !isGoed ? 0.55 : 1,
              }}
            >
              <span className="text-sm font-bold italic" style={{ color: C.brownText }}>{k.naam}</span>
              {KETEL_EISEN.map((eis) => (
                <span key={eis.id} className="text-xs leading-tight" style={{ color: C.brownText }}>
                  <span style={{ color: C.brown }}>{eis.label}: </span>
                  <span className="font-bold">{k.waarden[eis.id]}</span>
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <FbBalk fb={fb && fb.goed ? fb : null} knop={goedId ? "Volgende" : null} onKnop={onKlaar} />
    </div>
  );
}

function KlusGaten({ beoordeel, noteer, onKlaar }) {
  const [chips] = useState(() => schud(GAT_CHIPS));
  const [gevuld, setGevuld] = useState({}); // gat -> chip
  const [fb, setFb] = useState(null);
  const alles = Object.keys(gevuld).length === GATEN.length;
  const drop = (gat) => (payload, pt) => {
    if (gevuld[gat.id]) return undefined;
    const chip = GAT_CHIPS.find((c) => c.id === payload);
    if (!chip || Object.values(gevuld).includes(payload)) return undefined;
    if (chip.id === gat.juist) {
      setGevuld((g) => ({ ...g, [gat.id]: payload }));
      beoordeel("goed", pt);
      setFb({ goed: true, tekst: gat.waarom });
      playSound("drop");
      return "correct";
    }
    beoordeel("fout", pt, { slepen: true });
    noteer("Tijdelijk doorgebruik: binnen een jaar maatregelen, zoals CO-melders in elke woning; maximaal vijf jaar langer");
    setFb({ goed: false, tekst: `"${chip.label}" past hier niet. ${gat.waarom}` });
    return "wrong";
  };
  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      <Situatie wie="De VvE van flat De Linde">
        gebruikt het oude CLV tijdelijk door. Dat mag alleen onder strikte voorwaarden.
      </Situatie>
      <p className="text-sm font-bold" style={{ color: C.brownText }}>Sleep (of tik) het juiste stukje in elke zin.</p>
      <div className="flex flex-col gap-3">
        {GATEN.map((g) => {
          const chip = GAT_CHIPS.find((c) => c.id === gevuld[g.id]);
          return (
            <div key={g.id} className="rounded-xl border-2 px-3 py-2 text-sm leading-relaxed" style={{ borderColor: C.beigeMid, backgroundColor: "white", color: C.brownText }}>
              {g.voor}{" "}
              <DropTarget id={g.id} onDropItem={drop(g)} actief={!chip} className="inline-block align-middle my-1">
                {({ isHover, flash }) => (
                  <span
                    data-vak={qaWaarde(g.juist)}
                    className="inline-flex items-center justify-center rounded-lg border-2 border-dashed px-2 min-h-[44px] min-w-[120px] font-bold"
                    style={{
                      borderColor: flash === "wrong" ? C.red : chip ? C.green : isHover ? C.olive : C.brownText,
                      backgroundColor: flash === "wrong" ? C.redLight : chip ? C.greenLight : isHover ? C.oliveLight : "#FDF4E9",
                      color: chip ? C.green : C.brown,
                    }}
                  >
                    {chip ? chip.label : "..."}
                  </span>
                )}
              </DropTarget>{" "}
              {g.na}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {chips
          .filter((c) => !Object.values(gevuld).includes(c.id))
          .map((c) => (
            <Draggable key={c.id} payload={c.id} ghost={<DragCard label={c.label} small />}>
              <div
                data-kaart={qaWaarde(c.id)}
                className="rounded-xl px-2 py-2 min-h-[48px] text-sm font-bold border-2 text-white text-center flex items-center justify-center"
                style={{ backgroundColor: C.olive, borderColor: C.oliveDark }}
              >
                {c.label}
              </div>
            </Draggable>
          ))}
      </div>
      <FbBalk fb={fb} knop={alles ? "Volgende" : null} onKnop={onKlaar} />
    </div>
  );
}

function VmcStap({ beoordeel, noteer, onDone, zoekMeteen = false }) {
  const [tekeningen] = useState(() => schud(["clv", "vmc"]));
  const [typeNr, setTypeNr] = useState(zoekMeteen ? 2 : 0);
  const [typeFout, setTypeFout] = useState([]);
  const [typeGoed, setTypeGoed] = useState(null);
  const [gevonden, setGevonden] = useState([]);
  const [foutPlek, setFoutPlek] = useState([]);
  const [fb, setFb] = useState(null);
  const [ventilatorAan, setVentilatorAan] = useState(true);
  const [getest, setGetest] = useState(false);
  const [opties] = useState(() => schud(VMC_OPLOSSINGEN));
  const [gekozen, setGekozen] = useState([]);
  const [foutOpl, setFoutOpl] = useState([]);
  const [ontvangers] = useState(() => schud(VMC_ONTVANGERS));
  const [ontvFout, setOntvFout] = useState([]);
  const [ontvGoed, setOntvGoed] = useState(null);
  const tekeningRef = useRef(null);
  const echt = VMC_PLEKKEN.filter((p) => p.echt);

  const fase =
    typeNr < 2 ? "type" : gevonden.length < echt.length ? "zoek" : !getest ? "test" : gekozen.length < 2 ? "advies" : !ontvGoed ? "ontvanger" : "klaar";
  const huidig = typeNr < 2 ? tekeningen[typeNr] : "vmc";

  useEffect(() => {
    naarBoven();
  }, [typeNr]);

  const kiesType = (o, e) => {
    if (o.id === huidig) {
      beoordeel("goed", punt(e));
      setTypeGoed(o.id);
      setFb({ goed: true, tekst: TYPE_UITLEG[huidig] });
      return;
    }
    beoordeel("fout", punt(e));
    noteer("Een VMC (MVS) herken je aan de dakventilator die rookgas en ventilatielucht samen afzuigt");
    setTypeFout((f) => [...f, o.id]);
    setFb({ goed: false, tekst: o.id === "half" ? TYPE_FOUT.half : huidig === "vmc" ? TYPE_FOUT.clvVoorVmc : TYPE_FOUT.vmcVoorClv });
  };

  const volgendeTekening = () => {
    setTypeNr((n) => n + 1);
    setTypeFout([]);
    setTypeGoed(null);
    setFb(null);
  };

  const tik = (p, e) => {
    if (fase !== "zoek" || gevonden.includes(p.id) || foutPlek.includes(p.id)) return;
    if (p.echt) {
      beoordeel("goed", punt(e));
      setGevonden((g) => [...g, p.id]);
      setFb({ goed: true, tekst: p.tekst });
    } else {
      beoordeel("fout", punt(e));
      noteer("Een VMC (MVS) herken je aan de dakventilator die rookgas en ventilatielucht samen afzuigt");
      setFoutPlek((f) => [...f, p.id]);
      setFb({ goed: false, tekst: p.tekst });
    }
  };

  const test = () => {
    setVentilatorAan(false);
    setGetest(true);
    playSound("wrong");
    // 6.4-04
    setFb({ goed: true, tekst: "Valt de dakventilator uit, dan zet een beveiliging alle ketels in de strang uit. Kijk: alle B1-toestellen staan uit." });
    if (tekeningRef.current) tekeningRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const kiesOpl = (o, e) => {
    if (gekozen.includes(o.id) || foutOpl.includes(o.id)) return;
    if (o.goed) {
      beoordeel("goed", punt(e));
      const nieuw = [...gekozen, o.id];
      setGekozen(nieuw);
      setFb({
        goed: true,
        tekst: nieuw.length < 2 ? "Dat is een van de twee oplossingen. Er is er nog een." : "Een VMC (MVS) is niet herbruikbaar als rookgasafvoer: helemaal vervangen of rookgas en ventilatie scheiden.", // 6.4-05
      });
    } else {
      beoordeel("fout", punt(e));
      noteer("VMC (MVS): niet herbruikbaar; rookgasafvoer vervangen of rookgas en ventilatie scheiden");
      setFoutOpl((f) => [...f, o.id]);
      setFb({ goed: false, tekst: o.uitleg });
    }
  };

  const kiesOntvanger = (o, e) => {
    if (o.id === "goed") {
      beoordeel("goed", punt(e));
      setOntvGoed(o.id);
      playSound("levelup");
      setFb({ goed: true, tekst: "Het advies en het plan gaan naar de gebouweigenaar, bijvoorbeeld de VvE. Met de eigenaar komt het plan voor de hele strang." }); // 6.4-06, 6.1-3-01
    } else {
      beoordeel("fout", punt(e));
      noteer("Advies over een VMC (MVS) geef je aan de eigenaar (VvE)");
      setOntvFout((f) => [...f, o.id]);
      setFb({ goed: false, tekst: "Het kanaal is van het hele gebouw. Je advies gaat naar de gebouweigenaar, bijvoorbeeld de VvE." });
    }
  };

  const opdracht = {
    type: "Bekijk de tekening en kies wat voor systeem het is.",
    zoek: "Tik de 3 plekken aan waaraan je ziet dat dit een VMC (MVS) is.",
    test: "Test wat er gebeurt: zet de ventilator op het dak uit.",
    advies: "Kies de 2 oplossingen die je adviseert.",
    ontvanger: "Kies aan wie je het advies geeft.",
    klaar: "Klaar. Ga naar de controlevragen.",
  }[fase];
  const teller =
    fase === "type" ? `Tekening ${typeNr + 1} van 2` : fase === "zoek" ? `${gevonden.length} van 3` : fase === "advies" ? `${gekozen.length} van 2` : null;

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop titel="Ronde 2: Wat doe je bij vervanging?" stap={2} stappen={2} opdracht={opdracht} teller={teller} />
      {fase === "type" ? (
        <Situatie wie="Ahmed (flat De Wilg)">
          wil een nieuwe HR-ketel. Je collega stuurt twee schachttekeningen: een van De Wilg en een van Zonnehof. Stel per tekening vast wat voor systeem het is.
        </Situatie>
      ) : (
        <Situatie wie="Flat De Wilg">heeft deze afvoer. Ahmed wil hier een nieuwe HR-ketel op.</Situatie>
      )}
      <div ref={tekeningRef} className="w-full flex justify-center">
        {huidig === "clv" ? (
          <div className="w-full max-w-[340px]">
            <StrangSVG />
          </div>
        ) : (
          <div className="w-full max-w-[300px] relative">
            <VmcSVG ventilatorAan={ventilatorAan} />
            {fase === "zoek" &&
              VMC_PLEKKEN.map((p) => (
                <Stip
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  w={VMC_W}
                  h={VMC_H}
                  status={gevonden.includes(p.id) ? "ok" : foutPlek.includes(p.id) ? "niet" : null}
                  label={p.naam}
                  onClick={(e) => tik(p, e)}
                  goed={p.echt}
                />
              ))}
          </div>
        )}
      </div>

      {fase === "type" && (
        <VasteBalk>
          <p className="text-sm font-bold" style={{ color: C.brownText }}>Tekening {typeNr + 1}: wat voor systeem is dit?</p>
          <Keuzes opties={SCHACHT_TYPES} fout={typeFout} goedId={typeGoed} juist={[huidig]} onKies={kiesType} />
          <Terugkoppeling fb={fb} />
          {typeGoed && (
            <GameButton onClick={volgendeTekening} className="w-full">
              {typeNr === 0 ? "Volgende tekening" : "Verder met De Wilg"}
            </GameButton>
          )}
        </VasteBalk>
      )}
      {fase === "zoek" && fb && <FbBalk fb={fb} />}
      {fase === "test" && (
        <VasteBalk>
          <Terugkoppeling fb={fb} />
          <GameButton onClick={test} variant="danger" className="w-full">
            <Fan className="w-4 h-4" />
            Zet de ventilator op het dak uit
          </GameButton>
        </VasteBalk>
      )}
      {(fase === "advies" || fase === "ontvanger" || fase === "klaar") && (
        <VasteBalk>
          {fase === "advies" && (
            <>
              <p className="text-sm font-bold" style={{ color: C.brownText }}>Wat adviseer je voor De Wilg? Kies er 2.</p>
              <Keuzes opties={opties} fout={foutOpl} goedIds={gekozen} juist={VMC_OPLOSSINGEN.filter((o) => o.goed).map((o) => o.id)} onKies={kiesOpl} />
            </>
          )}
          {(fase === "ontvanger" || fase === "klaar") && (
            <>
              <p className="text-sm font-bold" style={{ color: C.brownText }}>Aan wie geef je dit advies?</p>
              <Keuzes opties={ontvangers} fout={ontvFout} goedId={ontvGoed} juist={["goed"]} onKies={kiesOntvanger} />
            </>
          )}
          <Terugkoppeling fb={fb} />
          {fase === "klaar" && (
            <GameButton onClick={onDone} variant="green" className="w-full">
              Naar de controlevragen
            </GameButton>
          )}
        </VasteBalk>
      )}
    </div>
  );
}

function Ronde2({ beoordeel, onDone, noteer, zonderIntro, startStap, onKlussen }) {
  const [gestart, setGestart] = useState(zonderIntro);
  const [volgorde] = useState(kiesKlussen);
  const [nr, setNr] = useState(startStap >= 2 ? 4 : 0);

  useEffect(() => {
    onKlussen?.(volgorde);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    naarBoven();
  }, [nr, gestart]);

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 2: Wat doe je bij vervanging?" intro="Eerst vier klussen. Daarna stel je vast wat voor afvoer flat De Wilg heeft." onStart={() => setGestart(true)}>
        <UitlegItem term="Nieuwe ketel tijdens doorgebruik">
          {/* 5.2g-01, 5.1b-05 */}
          terugslagklep samen met de ketel gekeurd, niet zwaarder dan de oude ketel, getoetst aan het toekomstige kanaal en bestand tegen minimaal 25 Pa overdruk.
        </UitlegItem>
        <UitlegItem term="Tijdelijk doorgebruik">
          {/* 6.1-3-01, 6.1-2-04, 6.1-2-05 */}
          de eerste ketelwissel is de start van een plan met de eigenaar (VvE). Binnen een jaar maatregelen, zoals CO-melders in elke woning. Zo kan het oude CLV maximaal vijf jaar langer mee.
        </UitlegItem>
        <UitlegItem term="VMC (MVS)">
          {/* 6.4-01, 6.4-02, 6.4-05 */}
          een ventilator op het dak zuigt rookgas en ventilatielucht samen af. Zo&apos;n systeem is niet herbruikbaar als rookgasafvoer.
        </UitlegItem>
      </RondeIntro>
    );
  }

  if (nr >= volgorde.length) {
    return <VmcStap beoordeel={beoordeel} noteer={noteer} onDone={onDone} zoekMeteen={startStap === 3} />;
  }

  const id = volgorde[nr];
  const klus = KEUZE_KLUSSEN.find((k) => k.id === id);
  const volgende = () => setNr((n) => n + 1);
  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop
        titel="Ronde 2: Wat doe je bij vervanging?"
        stap={1}
        stappen={2}
        opdracht="Lees de klus en maak de juiste keuze."
        teller={`Klus ${nr + 1} van ${volgorde.length}`}
      />
      {id === "ketel" && <KlusKetels key={id} beoordeel={beoordeel} noteer={noteer} onKlaar={volgende} />}
      {id === "gaten" && <KlusGaten key={id} beoordeel={beoordeel} noteer={noteer} onKlaar={volgende} />}
      {klus && <KlusKeuze key={id} klus={klus} beoordeel={beoordeel} noteer={noteer} onKlaar={volgende} />}
    </div>
  );
}

// ─── TEKENING: inspectieluik onderzijde CLV (N48 figuur 2, PDF-pagina 9) ───
// De normfiguur is een rasterbeeld. De lijnen hieronder zijn de omtrekken van
// de lijnen in de uitsnede tekenen/F3.png (1939 x 1254 px, 6,238 px per pt),
// overgetrokken en vereenvoudigd; de schachtwanden zijn grijze vlakken.
// Gemeten met tekenen/meet.py: dekking en zuiverheid 0,99 op het werkblad.
const OZ_W = 1939;
const OZ_H = 1254;
const OZ_WANDEN = [[413, 204, 462, 1233], [759, 40, 806, 505], [759, 788, 806, 1233]];
const OZ_LIJNEN =
  "M622 1180 L622 1182.5 L624 1183.5 L649.5 1183.5 L649.5 1178 L623 1178Z M545 1178 L545 1182.5 L546 1183.5 L570.5 1183.5 L572.5 1182.5 L571.5 1178Z M1115.5 1090 L1093 1090 L1093 1096.5 L1106 1096.5 L1107 1098.5 L1110.5 1095.5 L1112 1096.5 L1112 1101 L1107 1105 L1107 1109 L1104 1111 L1102 1114 L1101 1124 L1099 1125 L1098 1127 L1098 1135.5 L1099 1137.5 L1101.5 1136.5 L1098.5 1134 L1098.5 1130.5 L1101.5 1129.5 L1101.5 1125.5 L1103.5 1123.5 L1104.5 1113.5 L1107.5 1112.5 L1109.5 1105.5 L1112.5 1103.5 L1115.5 1096.5 L1117.5 1094.5 L1117.5 1091Z M927 1045 L926 1050.5 L935.5 1050.5 L933.5 1045Z M951 1037 L952 1041.5 L959.5 1041.5 L960.5 1039.5 L963.5 1039.5 L963.5 1037 L959.5 1035 L954.5 1035 L953 1034Z M1276 1026 L1276 1039.5 L1277 1042.5 L1279 1043.5 L1279 1064.5 L1280 1067.5 L1282 1068.5 L1282 1070.5 L1284 1070.5 L1285 1072.5 L1287 1072.5 L1288 1074.5 L1290 1075.5 L1297 1076.5 L1304 1081.5 L1315 1081.5 L1316 1084.5 L1317 1084.5 L1319 1087.5 L1322 1088.5 L1322 1090.5 L1324 1090.5 L1326 1092.5 L1329 1092.5 L1331 1093.5 L1332 1095.5 L1338 1095.5 L1339 1096.5 L1340.5 1095.5 L1377 1095.5 L1378 1096.5 L1387 1096.5 L1390 1098.5 L1398.5 1095.5 L1639 1095.5 L1640 1098.5 L1642 1098.5 L1644 1101.5 L1656.5 1101.5 L1661.5 1097.5 L1662.5 1094.5 L1662.5 1063 L1657.5 1057 L1646 1057 L1644 1059 L1640 1060 L1639 1062 L1397.5 1062 L1392.5 1060 L1389 1061 L1378 1061 L1377 1062 L1347.5 1062 L1346.5 1060 L1343.5 1059 L1343.5 1045.5 L1346.5 1041.5 L1346.5 1025 L1342.5 1023 L1340.5 1020 L1282 1020 L1282 1021Z M1648.5 1083.5 L1649.5 1082.5 L1653 1082.5 L1654 1086 L1653 1087 L1649.5 1087Z M1650.5 1071.5 L1653 1070.5 L1654 1072 L1651.5 1073Z M1384.5 1070.5 L1386 1071.5 L1386 1087 L1385 1088 L1383.5 1087 L1383.5 1071.5Z M1397.5 1071.5 L1399.5 1070.5 L1400.5 1067.5 L1637 1067.5 L1638 1069.5 L1640 1070.5 L1640 1088 L1633 1091 L1401.5 1091 L1399.5 1088 L1397.5 1087Z M1343.5 1071.5 L1346.5 1070.5 L1347.5 1067.5 L1372 1067.5 L1375 1071.5 L1375 1087 L1372 1090 L1369 1091 L1350.5 1091 L1349.5 1090 L1346.5 1090 L1345.5 1088 L1343.5 1087Z M1284.5 1048.5 L1286.5 1047.5 L1288.5 1044.5 L1335 1044.5 L1336 1047.5 L1338 1048.5 L1338 1061 L1336 1065 L1338 1071.5 L1338 1084 L1336 1085 L1336 1087 L1334 1089 L1328.5 1087 L1324.5 1082 L1322.5 1082 L1320.5 1079 L1315.5 1076 L1310.5 1076 L1308.5 1074 L1302.5 1073 L1300.5 1071 L1293.5 1071 L1291.5 1070 L1290.5 1068 L1287.5 1066 L1284.5 1061Z M1281.5 1029.5 L1287.5 1027.5 L1288.5 1025.5 L1296 1025.5 L1297 1026.5 L1329.5 1026.5 L1332 1025.5 L1335 1027.5 L1338 1027.5 L1341 1030.5 L1341 1035 L1339 1037 L1282.5 1037 L1281.5 1036Z M1515.5 823 L1512.5 822 L1508 823 L1504 828 L1502 828 L1502 830 L1488 843 L1488 845 L1485 847 L1485 849 L1474 859 L1473 862 L1471 862 L1470 865 L1468 865 L1467 868 L1465 868 L1465 870 L1452 882 L1448 887 L1448 889 L1426 910 L1425 913 L1423 913 L1423 915 L1415 922 L1414 925 L1412 926 L1410 929 L1407.5 929 L1401.5 924 L1399.5 921 L1395 919 L1395 925 L1392 929 L1392 935 L1391 937 L1389 938 L1389 945 L1387 947 L1386 954 L1384 956 L1384 960.5 L1388.5 960.5 L1392.5 957.5 L1397.5 957.5 L1400.5 954.5 L1405.5 954.5 L1406.5 952.5 L1420.5 948.5 L1425.5 945.5 L1425.5 944 L1422.5 943 L1422.5 941 L1420.5 941 L1419.5 939 L1414.5 935 L1414.5 932.5 L1416.5 931.5 L1422.5 923.5 L1425.5 921.5 L1425.5 919.5 L1436.5 909.5 L1436.5 907.5 L1439.5 906.5 L1439.5 904.5 L1442.5 903.5 L1445.5 898.5 L1458.5 886.5 L1459.5 882.5 L1462.5 881.5 L1462.5 879.5 L1464.5 878.5 L1468.5 873.5 L1470.5 873.5 L1470.5 871.5 L1481.5 861.5 L1482.5 858.5 L1484.5 858.5 L1484.5 856.5 L1495.5 846.5 L1496.5 843.5 L1501.5 839.5 L1501.5 837.5 L1504.5 836.5 L1505.5 833.5 L1507.5 833.5 L1507.5 831.5 L1515.5 824.5Z M1400.5 808 L1394 808 L1303 906 L1301.5 906 L1291.5 897 L1290 897 L1279 935.5 L1317.5 921.5 L1306.5 911 L1306.5 909.5Z M281 721 L281 725.5 L309 725.5 L310 726.5 L314 726.5 L315 728.5 L319 729.5 L320 731.5 L325 731.5 L327 734.5 L334 736.5 L340 740.5 L344 740.5 L350 745.5 L357 746.5 L363 751.5 L367 751.5 L374 756.5 L380 757.5 L383 760.5 L387 760.5 L388 762.5 L390 762.5 L393 765.5 L399 766.5 L404 770.5 L410 771.5 L411.5 773.5 L411.5 766 L407.5 766 L401.5 761 L397.5 761 L392.5 757 L390.5 757 L383.5 754 L381.5 752 L374.5 750 L368.5 746 L365.5 746 L360.5 743 L359.5 741 L354.5 741 L351.5 740 L350.5 738 L345.5 735 L340.5 735 L339.5 733 L335.5 730 L331.5 730 L329.5 729 L328.5 727 L321.5 726 L318.5 724 L316.5 721 L312.5 721 L308.5 719 L304 719 L303 720 L282 720Z M1508 715 L1505 716 L1504 718 L1502 718 L1499 721 L1499 724 L1498 725 L1499 732.5 L1504 737 L1499 741 L1497 747 L1497 752.5 L1499 754.5 L1499 757.5 L1501 757.5 L1502 760.5 L1504 760.5 L1505 762.5 L1520.5 762.5 L1522.5 760.5 L1526.5 759.5 L1527.5 755.5 L1529.5 754.5 L1529.5 743 L1528.5 743 L1526.5 739 L1523.5 737 L1523.5 735.5 L1525.5 734.5 L1529.5 729.5 L1529.5 721 L1528.5 721 L1526.5 718 L1524.5 718 L1523.5 716Z M1511.5 737.5 L1515 737.5 L1520 740.5 L1522 743.5 L1522 756 L1519 757 L1516 760 L1511.5 760 L1504.5 754 L1504.5 742.5Z M1504.5 722.5 L1510.5 718.5 L1517 718.5 L1522 722.5 L1522 731 L1519 733 L1518 735 L1510.5 735 L1508.5 734 L1507.5 732 L1504.5 731Z M1394 708 L1390 710 L1386 714 L1385 717 L1385 722.5 L1387 726.5 L1391 729.5 L1391 731 L1389 732 L1385 737 L1385 746.5 L1389 751.5 L1393 753.5 L1397 753.5 L1398 754.5 L1406.5 753.5 L1410.5 751.5 L1414.5 745.5 L1414.5 736 L1412.5 733 L1408.5 730 L1414.5 722.5 L1414.5 715 L1409.5 709 L1406.5 708Z M1396.5 731.5 L1403 731.5 L1405 732.5 L1409 738.5 L1408 747 L1404 751 L1401 752 L1394.5 750 L1392.5 748 L1390.5 743 L1390.5 738.5 L1392.5 734.5Z M1396.5 710.5 L1404 710.5 L1408 714.5 L1408 717.5 L1409 718.5 L1408 724 L1402 729 L1395.5 728 L1391.5 723 L1391.5 715.5 L1392.5 713.5Z M236 698 L230 700 L230 703 L227 706 L227 709.5 L229.5 709.5 L229.5 706.5 L231.5 704.5 L235 705.5 L240 704.5 L247 706.5 L249 711 L246 715 L242 715 L241 716 L241 720 L238 721 L238 722.5 L246 723.5 L247 724.5 L247 726.5 L250 728.5 L249 732 L250 735 L246 740 L242 740 L241 741 L233 740 L231.5 741 L229.5 739 L229.5 734 L225 733 L225 734.5 L227 735.5 L227 739.5 L230 741.5 L230 743.5 L231 743.5 L233 746.5 L243.5 746.5 L244.5 745.5 L247.5 745.5 L246.5 742.5 L249.5 740.5 L250.5 734.5 L252.5 733.5 L252.5 728 L249.5 726 L249.5 723 L246.5 720 L246.5 716.5 L249.5 715.5 L249.5 705 L246.5 703 L246.5 700 L240.5 698Z M986 693 L985 695 L981 695 L980 701 L977 703 L977 705 L975 706 L975 714.5 L977 715.5 L977 719 L975 720 L975 728.5 L977 729.5 L977 732.5 L981 737.5 L983 738.5 L982 740.5 L991.5 741.5 L992.5 740.5 L996.5 740.5 L996.5 738.5 L1000.5 734.5 L1002.5 730.5 L1002.5 721 L999.5 715 L996.5 714 L996.5 710 L982.5 710 L981 709 L980 712 L978.5 713 L977.5 712 L977.5 706.5 L979.5 705.5 L980.5 702.5 L984.5 699.5 L986 700.5 L989.5 699.5 L991 700.5 L997 700.5 L999 702.5 L999 704.5 L1001.5 704.5 L1001.5 701 L999.5 700 L999.5 698 L998.5 698 L994.5 693Z M979.5 716.5 L980.5 715.5 L984 715.5 L985 716.5 L986.5 715.5 L995 715.5 L996 717.5 L998 717.5 L1000 720.5 L1000 731 L995 735 L983.5 735 L977.5 728 L977.5 720.5 L979.5 718.5Z M281 619 L281 623.5 L284 624.5 L286.5 623.5 L315 624.5 L318 627.5 L320 627.5 L323 629.5 L331 630.5 L332 632.5 L334 633.5 L339 633.5 L340 635.5 L344 635.5 L347 638.5 L356 639.5 L361 643.5 L364 644.5 L370 644.5 L377 649.5 L386 650.5 L389 653.5 L401 656.5 L402 658.5 L406 658.5 L411 661.5 L411.5 658.5 L413.5 657.5 L411.5 656 L411.5 654 L404.5 653 L403.5 651 L401.5 650 L396.5 650 L389.5 647 L387.5 645 L379.5 644 L371.5 639 L365.5 639 L358.5 634 L348.5 633 L347.5 631 L343.5 630 L340.5 628 L335.5 628 L332.5 625 L329.5 625 L320.5 622 L319.5 620 L316.5 619 L309.5 619 L308.5 617 L305 617 L302 619Z M233 597 L230 599 L230 602 L227 604 L227 608 L225 609.5 L226 610.5 L229.5 609.5 L229.5 604.5 L231.5 602.5 L233 602.5 L234 604.5 L235.5 604.5 L236.5 602.5 L241 602.5 L242 603.5 L246 602.5 L249 606.5 L249 614 L246 618 L244 619 L243 622 L241 622 L237 627 L233 628 L231 632 L228 634 L227 639 L225 641 L225 644.5 L252.5 644.5 L250.5 643 L250.5 640.5 L252.5 639.5 L251.5 638 L236.5 638 L235.5 637 L233 639 L230.5 638 L230.5 636.5 L232.5 635.5 L234.5 631.5 L238.5 629.5 L238.5 628.5 L249.5 618.5 L249.5 612.5 L250.5 611.5 L250.5 607 L248.5 601 L249.5 599 L247.5 599 L246.5 597 L241.5 597 L240.5 596Z M281 517 L282 522.5 L313 522.5 L315 523.5 L316 525.5 L320 526.5 L322 528.5 L325 528.5 L328 531.5 L331 531.5 L334 533.5 L336 533.5 L341 537.5 L345 537.5 L350 540.5 L351 542.5 L356 542.5 L362 547.5 L370 549.5 L371 551.5 L373 551.5 L376 553.5 L379 553.5 L381 554.5 L382 556.5 L392 559.5 L394 562.5 L401 563.5 L404 565.5 L405 567.5 L411.5 569.5 L411.5 563 L408.5 563 L405.5 561 L403.5 558 L396.5 557 L395.5 555 L391.5 554 L390.5 552 L385.5 552 L384.5 550 L378.5 547 L376.5 547 L370.5 543 L365.5 543 L364.5 541 L359.5 538 L352.5 537 L351.5 535 L347.5 532 L342.5 532 L339.5 529 L337.5 529 L336.5 527 L329.5 526 L327.5 523 L324.5 523 L322.5 521 L318.5 520 L317.5 518 L314.5 518 L308.5 515 L304 515 L303 516 L283 516Z M981 501 L981 507 L979 513 L979 517.5 L980 519 L977 521 L977 525.5 L979.5 526.5 L981.5 525.5 L983.5 522.5 L985 523.5 L986.5 522.5 L998 523.5 L1000 526.5 L1000 539 L995 541 L994 543 L982.5 543 L979.5 539 L979.5 536 L978.5 535 L975 537.5 L977 539.5 L977 541.5 L981 544.5 L981 547.5 L983 548.5 L995.5 548.5 L996.5 547.5 L996.5 544.5 L998.5 542.5 L1000.5 542.5 L1002.5 536.5 L1001.5 525 L1000.5 523 L995.5 519 L996.5 517 L983.5 517 L980.5 512.5 L983.5 506.5 L985 506.5 L986 508.5 L987.5 508.5 L989.5 506.5 L1000.5 506.5 L999.5 503.5 L1001.5 501Z M241 496 L239 497 L240 499 L234 505 L230 506 L230 511.5 L232.5 511.5 L233.5 509.5 L237 508.5 L240 509.5 L242 512.5 L241 515 L241 542.5 L243.5 542.5 L243.5 496Z M994 410 L992 412 L991 418 L990 419 L986 419 L985 424 L984 425 L981 425 L980 430 L977 431 L977 433 L975 434 L975 443 L974 444.5 L978 446.5 L991.5 446.5 L993 444.5 L995 449.5 L994 455.5 L996.5 455.5 L996.5 446.5 L999.5 443.5 L999.5 440 L996.5 437 L996.5 420 L994.5 417 L996.5 413.5 L996.5 411Z M980.5 435.5 L981 437 L978.5 440 L977.5 436.5Z M993 421.5 L995 424.5 L995 434 L994 437 L991.5 438 L989 436 L987 438 L984.5 438 L982.5 436 L981 436 L980.5 431.5 L982.5 430.5 L983.5 427.5 L985.5 427.5 L986.5 423.5 L988 422.5 L989 425.5 L991.5 427.5 L991.5 422.5Z M536.5 405 L533 409 L534 410.5 L533 412 L533 456.5 L534 457.5 L534 463 L532 464 L530 467 L526 468 L526 472.5 L529 478.5 L529 495.5 L530 495.5 L535 501.5 L539.5 499.5 L539.5 492.5 L540.5 490.5 L542.5 489.5 L542.5 486.5 L543.5 485.5 L543.5 475.5 L545.5 472.5 L545.5 468 L544.5 467 L541.5 467 L539.5 465 L539.5 408 L538.5 408Z M595 253 L593 260 L591 261 L588 279 L585 282 L585 289.5 L586 291.5 L590 292.5 L591 294.5 L594 295.5 L594 378.5 L595 379.5 L598.5 379.5 L599.5 378.5 L599.5 295.5 L602.5 294.5 L603.5 292.5 L608.5 291.5 L609.5 289.5 L609.5 283 L604.5 275 L604.5 264 L602.5 263 L601.5 258 L599.5 257 L599.5 254 L598.5 253Z M494.5 183 L492.5 182 L484 182 L483 185 L480 185 L475 188 L472 188 L470 191 L466 191 L464 193 L462 193 L460 196 L455 196 L447 202 L441 202.5 L454 202.5 L455 203.5 L462.5 202.5 L464.5 198.5 L466.5 198.5 L468.5 196.5 L474.5 195.5 L476.5 192.5 L480.5 192.5 L485.5 189.5 L486.5 187.5 L491.5 187.5 L492.5 185.5 L494.5 184.5Z M656 137 L656 195 L651 197 L650 199 L650 215.5 L656 225.5 L656 232.5 L660.5 232.5 L661.5 228.5 L663.5 227.5 L666.5 223.5 L666.5 205.5 L669.5 201.5 L669.5 199 L667.5 199 L666.5 197 L662.5 196 L660.5 192 L661.5 190.5 L661.5 140 L660.5 137Z M15 1178 L16 1194.5 L18 1195.5 L19 1199.5 L21 1200.5 L21 1205 L19 1208 L19 1211 L16 1212 L16 1236.5 L18 1236.5 L19 1238.5 L21 1239.5 L1919.5 1239.5 L1921.5 1238.5 L1921.5 1235.5 L1924.5 1234.5 L1924.5 1232.5 L1926.5 1231.5 L1926.5 1223 L1924.5 1222 L1924.5 1220 L1921.5 1219 L1921.5 1209 L1918.5 1208 L1918.5 1203.5 L1919.5 1201.5 L1921.5 1200.5 L1921.5 1195.5 L1926.5 1191.5 L1926.5 1187 L1924.5 1186 L1924.5 1177 L1923.5 1175 L1921.5 1174 L1921.5 1169 L1919.5 1169 L1918.5 1167 L1915.5 1166 L1902.5 1166 L1899.5 1164 L1898 1164 L1896 1166 L1880 1166 L1879 1167 L1877.5 1166 L1869.5 1166 L1868.5 1165 L1865 1166 L1840.5 1166 L1839.5 1164 L1836 1164 L1834 1166 L1809.5 1166 L1808.5 1164 L1804 1164 L1803 1166 L1793 1166 L1792 1167 L1790.5 1166 L1778.5 1166 L1777.5 1164 L1774 1164 L1772 1166 L1759 1166 L1758 1167 L1756.5 1166 L1748.5 1166 L1746.5 1164 L1744 1164 L1743 1166 L1718.5 1166 L1717.5 1164 L1714 1164 L1712 1166 L1688.5 1166 L1686.5 1164 L1682 1164 L1681 1166 L1666 1166 L1665 1167 L1657.5 1166 L1656.5 1164 L1652 1164 L1651 1166 L1626.5 1166 L1625.5 1164 L1622 1164 L1620 1166 L1606 1166 L1605 1167 L1603.5 1166 L1595.5 1166 L1594.5 1164 L1591 1164 L1589 1166 L1575 1166 L1574 1167 L1572.5 1166 L1566.5 1166 L1564.5 1164 L1561 1164 L1558 1166 L1535.5 1166 L1534.5 1164 L1530 1164 L1529 1166 L1505.5 1166 L1503.5 1164 L1499 1164 L1498 1166 L1483 1166 L1482 1167 L1480.5 1166 L1474.5 1166 L1473.5 1164 L1469 1164 L1467 1166 L1443.5 1166 L1442.5 1164 L1438 1164 L1436 1166 L1414.5 1166 L1411.5 1164 L1409 1164 L1408 1166 L1389 1166 L1388 1167 L1383.5 1166 L1381.5 1164 L1378 1164 L1377 1166 L1360 1166 L1359 1167 L1352.5 1166 L1351.5 1164 L1347 1164 L1346 1166 L1321.5 1166 L1319.5 1164 L1317 1164 L1315 1166 L1298 1166 L1297 1167 L1291.5 1166 L1289.5 1164 L1287 1164 L1284 1166 L1268 1166 L1267 1167 L1260.5 1166 L1258.5 1164 L1256 1164 L1253 1166 L1230.5 1166 L1226 1164 L1225 1166 L1207 1166 L1206 1167 L1199.5 1166 L1198.5 1165 L1195 1165 L1194 1166 L1168.5 1166 L1165.5 1164 L1163 1166 L1153 1166 L1152 1167 L1150.5 1166 L1137.5 1166 L1136.5 1165 L1134 1166 L1132.5 1165 L1129 1166 L1106.5 1166 L1105.5 1165 L1102 1165 L1101 1166 L1099.5 1165 L1098 1166 L1075.5 1166 L1074 1165 L1072.5 1166 L1071 1165 L1070 1166 L1054 1166 L1053 1167 L1050.5 1166 L1044.5 1166 L1043.5 1165 L1040 1165 L1039 1166 L1011.5 1166 L1009 1165 L1008 1166 L991 1166 L989.5 1167 L988.5 1166 L982.5 1166 L979.5 1164 L978 1164 L977 1166 L960 1166 L959 1167 L957.5 1166 L952.5 1166 L951.5 1165 L948 1165 L947 1166 L930 1166 L927.5 1167 L926.5 1166 L920.5 1166 L918.5 1164 L916 1164 L915 1166 L890.5 1166 L888.5 1164 L886 1164 L884 1166 L869 1166 L868 1167 L866.5 1166 L859.5 1166 L857 1164 L853 1166 L839 1166 L836.5 1167 L835.5 1166 L828.5 1166 L827.5 1164 L825 1164 L823 1166 L814 1166 L812.5 1167 L809 1164 L809 1166 L806.5 1167 L804 1164 L803 1165 L803 1180.5 L805 1183.5 L808 1183.5 L809 1184.5 L809 1187.5 L810 1188.5 L813 1188.5 L814 1191.5 L816 1191.5 L817 1194.5 L819 1194.5 L820 1197.5 L822 1197.5 L825 1202.5 L827 1202.5 L828 1205.5 L830 1205.5 L831 1208.5 L833 1208.5 L834 1211.5 L836 1211.5 L837 1213.5 L842 1217.5 L842 1219.5 L844 1219.5 L845 1222.5 L847 1222.5 L848 1225.5 L850 1225.5 L851 1227.5 L854 1229.5 L854 1233 L853 1234 L834.5 1234 L832.5 1230 L828.5 1228 L826.5 1224 L823.5 1223 L822.5 1220 L820.5 1220 L818.5 1216 L813.5 1213 L812.5 1209 L807.5 1209 L806.5 1208 L806.5 1206 L804.5 1203 L803 1203 L803 1209.5 L806 1214.5 L808 1213.5 L809 1214.5 L809 1217.5 L812 1217.5 L814 1220.5 L814 1222.5 L816 1222.5 L817 1224.5 L823 1229.5 L823 1233 L822 1234 L805.5 1234 L804.5 1232 L803 1232 L802 1234 L766.5 1234 L765.5 1232 L764 1232 L763 1234 L760 1234 L759 1235 L757.5 1234 L682.5 1234 L681.5 1233 L681.5 966.5 L682.5 965.5 L739 965.5 L740 966.5 L748 966.5 L749 967.5 L757.5 968.5 L757.5 961 L730.5 961 L729.5 960 L703.5 960 L702.5 959 L685.5 959 L684.5 958 L681 959 L679.5 958 L657.5 958 L655.5 956 L655.5 939.5 L658.5 935.5 L671 936.5 L672 937.5 L696 937.5 L697 938.5 L720 938.5 L721 939.5 L754 939.5 L755 940.5 L757.5 940.5 L757.5 938.5 L760 937.5 L764 941.5 L764 943.5 L765.5 941.5 L767 942.5 L767 959 L764 960 L763 963 L761 964 L764 970.5 L765.5 969.5 L767 970.5 L767 1231.5 L768.5 1231.5 L767.5 1230 L768.5 1226.5 L768.5 1011 L767.5 1010 L767.5 973.5 L768.5 971.5 L772.5 968.5 L776 968.5 L780 970.5 L796 969.5 L797 971.5 L800 972.5 L800 1193.5 L800.5 970.5 L801.5 969.5 L803 971.5 L804.5 971.5 L804.5 970.5 L807.5 968.5 L809 970.5 L811.5 969.5 L829 969.5 L830 970.5 L835 969.5 L836 971.5 L839 971.5 L840 973.5 L843 974.5 L875 974.5 L876 975.5 L876 977.5 L877 977.5 L879 980.5 L879 1016.5 L881 1018.5 L882 1025.5 L884 1026.5 L885 1033.5 L887 1034.5 L887 1036.5 L889 1037.5 L890 1041.5 L893 1043.5 L896 1049.5 L900 1050.5 L904 1055.5 L911 1056.5 L916 1063.5 L916 1069 L914 1071 L910 1071 L909 1074 L910 1076.5 L910 1086.5 L912 1087.5 L913 1089.5 L919 1091.5 L921.5 1090.5 L935 1090.5 L936 1091.5 L942 1090.5 L943 1091.5 L947.5 1091.5 L953.5 1089.5 L956.5 1084.5 L956.5 1074 L954.5 1071 L952.5 1071 L950.5 1069 L949.5 1063.5 L952.5 1061.5 L956.5 1056.5 L959.5 1056.5 L961.5 1053.5 L965.5 1053.5 L967 1052.5 L970 1054.5 L972 1060.5 L975 1062.5 L975 1064.5 L977 1065.5 L977 1067.5 L979 1070.5 L990 1070.5 L991 1072.5 L1016 1096.5 L1018 1100.5 L1021 1101.5 L1023 1105.5 L1027 1107.5 L1030 1112.5 L1031 1112.5 L1033 1115.5 L1036 1115.5 L1037 1117.5 L1061.5 1117.5 L1063.5 1115.5 L1066.5 1115.5 L1066.5 1113 L1060.5 1111 L1039.5 1111 L1037.5 1110 L1036.5 1108 L1033.5 1107 L1032.5 1105 L1030.5 1104 L1030.5 1102 L1028.5 1102 L1027.5 1100 L1024.5 1098 L1024.5 1096 L1022.5 1096 L1021.5 1094 L1016.5 1090 L1016.5 1088 L1013.5 1087 L1012.5 1085 L1010.5 1084 L1010.5 1082 L1008.5 1082 L1005.5 1077 L1002.5 1076 L999.5 1071 L996.5 1070 L996.5 1068 L995.5 1068 L992.5 1064 L995.5 1061.5 L996.5 1057 L992.5 1056 L991.5 1054 L989.5 1054 L987.5 1051 L983.5 1051 L979.5 1046 L976.5 1044 L977.5 1037.5 L979.5 1036.5 L982.5 1029.5 L982.5 1026.5 L985.5 1022.5 L985.5 1003.5 L986.5 1002.5 L986.5 997.5 L988.5 994.5 L988.5 986 L986.5 984 L986.5 981.5 L992.5 974.5 L1027.5 974.5 L1028.5 973.5 L1253 973.5 L1254 974.5 L1279.5 974.5 L1281 973.5 L1282 974.5 L1289 974.5 L1291 977.5 L1291 979.5 L1295 982.5 L1295 988 L1293 989 L1293 991 L1291 992 L1291 995 L1290 996 L1290 1002.5 L1292 1005.5 L1329.5 1005.5 L1331.5 1004.5 L1332.5 1002.5 L1332.5 995 L1331.5 992 L1329.5 991 L1329.5 989 L1326.5 987 L1326.5 971 L1321.5 965 L1321.5 961 L1318.5 959 L1315.5 954 L1314.5 954 L1311.5 950 L1307.5 949 L1303.5 944 L1297.5 944 L1295.5 941 L1291.5 941 L1288.5 939 L1277.5 939 L1272.5 937 L1259 938 L1258 939 L1020.5 939 L1019.5 938 L1014.5 938 L1009 936 L1008 938 L992 939 L986 941 L983 944 L977 944 L973 949 L969 950 L963 958 L961 958 L960 964 L957 968 L955 969 L955 979 L954 982 L952 983 L950 986 L950 994.5 L951 995.5 L951 1000 L950 1001.5 L952 1006.5 L952 1015 L949 1020 L949 1022 L946 1025 L941 1026 L937 1031 L931.5 1031 L930.5 1030 L927.5 1030 L924.5 1028 L923.5 1026 L921.5 1026 L914.5 1018 L914.5 994.5 L915.5 993.5 L915.5 989 L914.5 988 L914.5 982 L912.5 980 L912.5 977 L909.5 971 L909.5 966 L908.5 964 L906.5 963 L906.5 961 L904.5 960 L904.5 958 L897.5 950 L893.5 949 L889.5 944 L883.5 944 L881.5 943 L880.5 941 L877.5 941 L874.5 939 L860.5 938 L859.5 936 L857.5 935 L853 936 L852 938 L811.5 938 L809.5 936 L807.5 938 L804.5 933 L803 933 L802 935 L800.5 934 L800.5 921 L800 932 L795 938 L792.5 938 L790.5 935 L782.5 935 L781.5 934 L774.5 935 L768.5 932 L768.5 925 L767.5 924 L767.5 912.5 L768.5 911.5 L768.5 820 L767.5 819 L767.5 812.5 L769.5 810.5 L773 811.5 L774 813.5 L777 813.5 L779 814.5 L780 816.5 L783 816.5 L784 817.5 L790.5 815.5 L791.5 813.5 L797 813.5 L799 815.5 L799 827.5 L800 828.5 L800 897.5 L800.5 825.5 L802 824.5 L803 827.5 L816.5 827.5 L816.5 826.5 L818.5 825.5 L818.5 819.5 L820.5 816.5 L825 821.5 L827.5 821.5 L829.5 818.5 L829.5 798 L826.5 794 L821 798 L818.5 795 L818.5 696.5 L820.5 694.5 L835 695.5 L843 700.5 L853 700.5 L857 703.5 L860 703.5 L863 705.5 L874 706.5 L878 709.5 L884 709.5 L887 711.5 L895 712.5 L896 714.5 L909 715.5 L918 720.5 L949.5 720.5 L950.5 719.5 L950.5 716 L948.5 715 L919.5 715 L911.5 710 L901.5 710 L894.5 706 L879.5 704 L878.5 702 L875.5 701 L870.5 701 L866.5 699 L861.5 699 L859.5 698 L858.5 696 L843.5 695 L836.5 690 L826.5 690 L823.5 689 L819.5 686 L818.5 683 L818.5 589.5 L821.5 587.5 L823.5 584.5 L829.5 582.5 L831.5 579.5 L833.5 579.5 L839.5 576.5 L839.5 575.5 L842.5 573.5 L845.5 573.5 L849.5 570.5 L850.5 568.5 L853.5 568.5 L859.5 563.5 L864.5 562.5 L865.5 560.5 L870.5 557.5 L874.5 556.5 L875.5 554.5 L880.5 553.5 L880.5 552.5 L885.5 548.5 L888.5 548.5 L891.5 546.5 L893.5 543.5 L899.5 542.5 L901.5 539.5 L903.5 539.5 L904.5 537.5 L909.5 536.5 L910.5 534.5 L915.5 531.5 L917.5 531.5 L920.5 528.5 L948.5 528.5 L948.5 527.5 L951.5 525.5 L951.5 524 L948.5 522 L923 522 L922 523 L918 523 L915 526 L910 527 L906 532 L902 532 L899 534 L897 537 L892 538 L886 543 L882 544 L881 546 L879 546 L877 548 L873 549 L872 551 L868 552 L865 554 L863 557 L857 558 L852 563 L848 563 L847 565 L843 568 L838 569 L832 574 L828 575 L827 577 L825 577 L820.5 580 L818.5 576 L818.5 524.5 L821 521.5 L826 525.5 L827.5 525.5 L827.5 523.5 L829.5 520.5 L829.5 515 L828.5 514 L829.5 501 L828.5 498.5 L830.5 493.5 L835.5 491.5 L843.5 491.5 L844.5 482.5 L847.5 480.5 L848.5 478.5 L853.5 477.5 L853.5 476.5 L857.5 474.5 L858.5 472.5 L863.5 471.5 L863.5 470.5 L868.5 466.5 L872.5 466.5 L876.5 461.5 L881.5 460.5 L884.5 457.5 L890.5 455.5 L893.5 452.5 L897.5 451.5 L900.5 449.5 L901.5 447.5 L906.5 446.5 L911.5 441.5 L914.5 441.5 L923.5 435.5 L950.5 435.5 L950.5 432 L948.5 430 L921 430 L918 431 L914 436 L909 436 L909 437 L904 441 L899 442 L897 445 L895 445 L894 447 L891 447 L889 450 L886 450 L882 452 L880 455 L875 456 L871 459 L870 461 L867 461 L859 467 L856 467 L853 470 L846 473 L844 476 L840.5 476 L838.5 473 L834 472 L832 475 L828 476 L825 481 L823 481 L821 484 L817 487 L815 487 L812 492 L803 492 L803 505 L798 508 L789.5 507 L787.5 505 L789.5 503 L786.5 501 L783 501 L780 503 L783 505 L779 507 L775 507 L774 508 L761 508 L761 526 L760 527.5 L762 531.5 L765 531.5 L766 532.5 L768.5 531.5 L796 531.5 L802 534.5 L802 588 L798 593 L795 594 L792 597 L786 599 L784 602 L778 603 L774 608 L771 608 L766 611 L765 613 L762 614 L747 614 L740 622 L737.5 622 L734.5 618 L734.5 614.5 L735.5 613.5 L734.5 603.5 L736.5 599.5 L736.5 596 L731.5 590 L728.5 588 L720 589 L720 590 L718 591 L718 593 L711 599 L685.5 599 L681.5 596 L681.5 98 L680.5 95 L676 95 L676 602.5 L679 604.5 L714 604.5 L716 606.5 L716 655 L714 659 L710.5 659 L700.5 654 L694.5 654 L691.5 652 L691.5 646 L688.5 644 L667.5 644 L665.5 640 L666.5 620 L663.5 610 L661.5 609 L653 609 L649 614 L646 615 L642.5 614 L640.5 610 L640.5 118.5 L650.5 111.5 L656.5 110.5 L659.5 108.5 L661.5 105.5 L668.5 105.5 L669.5 99 L667 98 L666 100 L658 101 L654 106 L647 106 L646 109 L642 109 L640 111 L637 111 L635 112 L634 114 L625 117 L623 120 L617 120 L615 123 L613 123 L613 124 L610 126 L604 126 L600 129 L599 131 L594 131 L592 132 L591 134 L588 135 L587 137 L582 137 L580 138 L579 140 L574 140 L573 142 L569 143 L567 146 L562 146 L557 149 L556 151 L552 151 L551 152 L551 156.5 L554 158.5 L554 627 L553 628 L548.5 628 L547.5 626 L538.5 623 L533.5 619 L528.5 619 L524.5 616 L523.5 614 L521.5 614 L517.5 610 L518.5 607.5 L518.5 476 L517.5 475 L517.5 466.5 L518.5 465.5 L518.5 175.5 L523.5 170.5 L527.5 170.5 L529.5 167.5 L532.5 167.5 L533.5 162 L528 162 L526 163 L525 165 L518 166 L517 168 L515 168 L514 170 L512 171 L511 174 L513 180.5 L513 481 L512 482 L512 489.5 L513 490.5 L512 493 L513 494.5 L513 597 L512 598.5 L513 599.5 L513 605 L511 608 L505.5 608 L499.5 603 L495.5 603 L489.5 599 L482.5 597 L480.5 594 L473.5 593 L470.5 591 L469.5 589 L466.5 588 L461.5 589 L460.5 588 L460.5 585 L456.5 582 L456.5 211 L454 211 L454 576 L452 579 L448.5 579 L446.5 577 L441.5 577 L440.5 575 L435.5 572 L431.5 572 L426.5 568 L424.5 568 L421.5 564 L421.5 548.5 L422.5 547.5 L421.5 544 L421.5 222.5 L424.5 218.5 L429.5 218.5 L429.5 216.5 L432.5 215.5 L433.5 213.5 L441.5 212.5 L441.5 211 L439.5 211 L438.5 209 L434 209 L432 211 L428 211 L427 213 L421 213 L421 215 L416 219 L412.5 219 L411.5 217 L410 217 L409 219 L406 219 L404 222 L399 222 L394 225 L393 227 L388 227 L383 230 L381 233 L376 233 L377 238.5 L381.5 238.5 L384.5 237.5 L385.5 235.5 L387.5 235.5 L389.5 232.5 L395.5 232.5 L396.5 230.5 L399.5 229.5 L400.5 227.5 L404.5 227.5 L407.5 226.5 L408.5 224.5 L411.5 224.5 L411.5 221.5 L412.5 220.5 L414 221.5 L420 221.5 L421 222.5 L421 565 L420 566 L417.5 565 L416 566 L417 572.5 L421 575.5 L421 656 L420 657 L418.5 656 L416 657 L417 663.5 L418 663.5 L421 667.5 L421 768 L416 770 L416 774.5 L421 780.5 L421 1169 L419.5 1170 L418.5 1167 L416 1167 L416 1171.5 L419.5 1170.5 L421 1171.5 L421 1183 L420 1184 L418.5 1183 L414 1183 L414 1186.5 L415 1186.5 L416 1188.5 L420 1188.5 L421 1189.5 L421 1214 L419.5 1215 L417.5 1212 L416 1214 L414 1214 L414 1216.5 L416 1219.5 L420 1219.5 L421 1220.5 L421 1231.5 L419 1232 L418 1234 L406.5 1234 L404.5 1231 L402.5 1231 L401.5 1229 L396.5 1225 L396.5 1223 L394.5 1223 L393.5 1220 L391.5 1220 L390.5 1217 L388.5 1217 L387.5 1214 L383.5 1212 L382.5 1209 L380.5 1209 L379.5 1206 L377.5 1206 L376.5 1203 L374.5 1203 L371.5 1198 L368.5 1197 L367.5 1195 L365.5 1194 L365.5 1192 L363.5 1192 L362.5 1189 L360.5 1189 L359.5 1187 L356.5 1185 L356.5 1183 L354.5 1183 L353.5 1181 L351.5 1180 L351.5 1178 L348.5 1177 L348.5 1173.5 L350.5 1171.5 L364 1171.5 L367 1172.5 L368 1174.5 L371 1175.5 L371 1177.5 L373 1177.5 L374 1179.5 L382 1186.5 L382 1188.5 L385 1189.5 L385 1191.5 L388 1192.5 L388 1194.5 L391 1195.5 L391 1197.5 L393 1197.5 L394 1199.5 L396 1200.5 L396 1202.5 L398 1202.5 L399 1204.5 L402 1206.5 L402 1208.5 L404 1208.5 L411.5 1216.5 L411.5 1206 L408.5 1206 L407.5 1204 L396.5 1194 L396.5 1192 L394.5 1192 L393.5 1190 L378.5 1176 L380.5 1171.5 L395 1171.5 L398 1172.5 L399 1174.5 L401 1174.5 L402 1177.5 L404 1177.5 L407 1182.5 L410 1183.5 L411.5 1185.5 L411.5 1177 L410.5 1176 L411.5 1174.5 L411.5 1164 L409 1167 L402.5 1166 L401.5 1164 L397 1164 L395 1166 L371.5 1166 L370.5 1164 L367 1164 L365 1166 L340.5 1166 L339.5 1164 L336 1164 L334 1166 L310.5 1166 L308.5 1164 L306 1164 L305 1166 L279.5 1166 L278.5 1164 L275 1164 L274 1166 L248.5 1166 L246.5 1164 L245 1164 L243 1166 L218.5 1166 L217.5 1165 L213 1165 L212 1166 L188.5 1166 L186.5 1164 L182 1166 L157.5 1166 L154 1164 L153 1166 L126.5 1166 L125.5 1165 L121 1165 L114 1167 L111.5 1166 L102 1166 L100.5 1167 L94.5 1165 L91 1166 L64.5 1166 L63.5 1165 L58 1165 L57 1166 L41 1166 L39.5 1167 L33.5 1165 L28.5 1166 L27.5 1164 L22 1164 L20 1167 L16 1169 L16 1177Z M22.5 1225.5 L27 1229.5 L26 1233 L21.5 1231 L21.5 1226.5Z M28.5 1202.5 L30 1204.5 L34 1205.5 L35 1208.5 L37 1208.5 L38 1210.5 L41 1212.5 L41 1214.5 L43 1214.5 L44 1217.5 L46 1217.5 L47 1219.5 L49 1220.5 L49 1222.5 L51 1222.5 L52 1225.5 L54 1225.5 L55 1228.5 L58 1229.5 L58 1233 L57 1234 L38.5 1234 L37.5 1232 L35.5 1231 L35.5 1229 L33.5 1229 L31.5 1226 L29.5 1225 L29.5 1223 L26.5 1222 L26.5 1204.5Z M1910.5 1173.5 L1913 1172.5 L1914 1174.5 L1916 1175.5 L1916 1177 L1915 1178 L1911.5 1178 L1910.5 1177Z M1879.5 1173.5 L1882.5 1171.5 L1896 1171.5 L1901 1174.5 L1905 1179.5 L1907 1179.5 L1908 1182.5 L1910 1182.5 L1911 1185.5 L1916 1189.5 L1916 1194 L1915 1196 L1911 1199 L1911 1202 L1910 1203 L1905.5 1203 L1904.5 1202 L1904.5 1198 L1902.5 1198 L1901.5 1195 L1899.5 1195 L1898.5 1193 L1895.5 1191 L1895.5 1189 L1891.5 1189 L1890.5 1188 L1890.5 1184 L1886.5 1183 L1884.5 1180 L1884.5 1178 L1880.5 1178 L1879.5 1177Z M1850.5 1172.5 L1851.5 1171.5 L1867 1171.5 L1869 1174.5 L1871 1174.5 L1872 1176.5 L1886 1189.5 L1886 1191.5 L1888 1191.5 L1889 1193.5 L1891 1194.5 L1891 1196.5 L1893 1196.5 L1897 1200.5 L1897 1202.5 L1899 1202.5 L1903 1207.5 L1907 1209.5 L1908 1212.5 L1911 1214.5 L1911 1216.5 L1916 1220.5 L1916 1225.5 L1917 1226.5 L1916 1233 L1915 1234 L1908.5 1234 L1907.5 1232 L1905.5 1232 L1904.5 1229 L1902.5 1229 L1901.5 1226 L1899.5 1226 L1898.5 1223 L1896.5 1223 L1895.5 1220 L1893.5 1220 L1892.5 1218 L1890.5 1217 L1890.5 1215 L1888.5 1215 L1885.5 1213 L1884.5 1209 L1882.5 1209 L1879.5 1207 L1879.5 1205 L1873.5 1200 L1873.5 1198 L1870.5 1197 L1870.5 1195 L1867.5 1194 L1867.5 1192 L1865.5 1192 L1863.5 1189 L1859.5 1187 L1859.5 1184 L1857.5 1184 L1854.5 1182 L1853.5 1178 L1851.5 1178 L1848.5 1176 L1850.5 1174.5Z M1819.5 1173.5 L1821.5 1171.5 L1836 1171.5 L1838 1174.5 L1841 1175.5 L1841 1177.5 L1844 1177.5 L1846 1180.5 L1846 1182.5 L1850 1183.5 L1852 1187.5 L1860 1194.5 L1860 1196.5 L1864 1197.5 L1866 1200.5 L1866 1202.5 L1870 1203.5 L1872 1207.5 L1876 1209.5 L1877 1213.5 L1879 1213.5 L1880 1216.5 L1882 1216.5 L1885 1218.5 L1886 1222.5 L1890 1222.5 L1891 1223.5 L1891 1227.5 L1893 1227.5 L1896 1229.5 L1896 1233 L1895 1234 L1877.5 1234 L1873.5 1229 L1870.5 1228 L1870.5 1226 L1869.5 1226 L1862.5 1218 L1859.5 1217 L1859.5 1215 L1858.5 1215 L1853.5 1209 L1850.5 1208 L1850.5 1206 L1849.5 1206 L1845.5 1201 L1842.5 1200 L1842.5 1198 L1839.5 1197 L1839.5 1195 L1838.5 1195 L1833.5 1189 L1828.5 1186 L1828.5 1184 L1825.5 1183 L1825.5 1181 L1822.5 1180 L1822.5 1178 L1819.5 1177Z M1788.5 1173.5 L1790.5 1171.5 L1805 1171.5 L1811 1175.5 L1812 1177.5 L1814 1177.5 L1815 1180.5 L1819 1183.5 L1823 1188.5 L1825 1188.5 L1826 1191.5 L1829 1192.5 L1829 1195.5 L1833 1197.5 L1834 1199.5 L1840 1204.5 L1841 1207.5 L1845 1208.5 L1846 1211.5 L1847 1211.5 L1857 1222.5 L1860 1223.5 L1860 1226.5 L1866 1229.5 L1865 1233 L1864 1234 L1846.5 1234 L1845.5 1231 L1843.5 1231 L1842.5 1229 L1840.5 1229 L1839.5 1226 L1828.5 1216 L1828.5 1214 L1826.5 1214 L1825.5 1212 L1814.5 1202 L1814.5 1200 L1812.5 1200 L1811.5 1198 L1803.5 1191 L1803.5 1189 L1801.5 1189 L1791.5 1178 L1788.5 1177Z M1758.5 1172.5 L1759.5 1171.5 L1774 1171.5 L1777 1172.5 L1778 1174.5 L1780 1174.5 L1781 1177.5 L1783 1177.5 L1784 1180.5 L1785 1180.5 L1792 1188.5 L1794 1188.5 L1795 1191.5 L1797 1191.5 L1798 1194.5 L1800 1194.5 L1801 1197.5 L1803 1197.5 L1804 1200.5 L1805 1200.5 L1806 1202.5 L1808 1202.5 L1809 1205.5 L1811 1205.5 L1812 1208.5 L1814 1208.5 L1815 1211.5 L1816 1211.5 L1823 1219.5 L1825 1219.5 L1826 1222.5 L1829 1223.5 L1829 1225.5 L1832 1226.5 L1832 1228.5 L1835 1229.5 L1835 1233 L1834 1234 L1815.5 1234 L1814.5 1231 L1812.5 1231 L1811.5 1229 L1809.5 1229 L1808.5 1226 L1806.5 1225 L1806.5 1223 L1804.5 1223 L1803.5 1221 L1786.5 1205 L1786.5 1203 L1784.5 1203 L1783.5 1200 L1781.5 1200 L1780.5 1198 L1772.5 1191 L1772.5 1189 L1770.5 1189 L1769.5 1187 L1757.5 1176Z M1727.5 1172.5 L1728.5 1171.5 L1743 1171.5 L1746 1172.5 L1747 1174.5 L1749 1174.5 L1750 1177.5 L1752 1177.5 L1753 1180.5 L1754 1180.5 L1761 1188.5 L1763 1188.5 L1764 1191.5 L1766 1191.5 L1767 1194.5 L1769 1194.5 L1770 1197.5 L1772 1197.5 L1773 1200.5 L1774 1200.5 L1775 1202.5 L1777 1202.5 L1778 1205.5 L1780 1205.5 L1781 1208.5 L1783 1208.5 L1784 1211.5 L1785 1211.5 L1786 1213.5 L1788 1213.5 L1789 1216.5 L1791 1217.5 L1792 1219.5 L1795 1220.5 L1795 1222.5 L1798 1223.5 L1798 1225.5 L1801 1226.5 L1801 1228.5 L1804 1229.5 L1804 1233 L1803 1234 L1784.5 1234 L1783.5 1231 L1781.5 1231 L1780.5 1229 L1777.5 1227 L1775.5 1223 L1773.5 1223 L1772.5 1220 L1770.5 1220 L1769.5 1217 L1767.5 1217 L1766.5 1214 L1764.5 1214 L1763.5 1211 L1762.5 1211 L1761.5 1209 L1759.5 1209 L1758.5 1206 L1756.5 1206 L1755.5 1203 L1753.5 1203 L1752.5 1200 L1750.5 1200 L1749.5 1197 L1747.5 1197 L1746.5 1195 L1744.5 1194 L1744.5 1192 L1742.5 1192 L1741.5 1189 L1739.5 1189 L1738.5 1186 L1736.5 1186 L1735.5 1183 L1732.5 1182 L1732.5 1180 L1731.5 1180 L1730.5 1178 L1727.5 1177Z M1696.5 1172.5 L1697.5 1171.5 L1713 1171.5 L1715 1172.5 L1716 1174.5 L1718 1174.5 L1719 1177.5 L1721 1177.5 L1722 1180.5 L1724 1180.5 L1725 1182.5 L1730 1186.5 L1730 1188.5 L1732 1188.5 L1733 1191.5 L1735 1191.5 L1736 1194.5 L1738 1194.5 L1739 1197.5 L1741 1197.5 L1742 1199.5 L1744 1200.5 L1744 1202.5 L1746 1202.5 L1747 1205.5 L1749 1205.5 L1750 1208.5 L1752 1208.5 L1753 1211.5 L1755 1211.5 L1756 1213.5 L1761 1217.5 L1761 1219.5 L1763 1219.5 L1764 1222.5 L1766 1222.5 L1767 1225.5 L1769 1225.5 L1770 1228.5 L1773 1229.5 L1773 1233 L1772 1234 L1753.5 1234 L1752.5 1231 L1750.5 1231 L1749.5 1228 L1747.5 1228 L1746.5 1226 L1744.5 1225 L1744.5 1223 L1742.5 1223 L1741.5 1220 L1739.5 1220 L1738.5 1217 L1736.5 1217 L1735.5 1214 L1733.5 1214 L1732.5 1211 L1731.5 1211 L1730.5 1209 L1728.5 1209 L1727.5 1206 L1725.5 1206 L1724.5 1203 L1722.5 1203 L1721.5 1200 L1719.5 1200 L1718.5 1197 L1717.5 1197 L1716.5 1195 L1714.5 1195 L1713.5 1192 L1711.5 1192 L1710.5 1189 L1708.5 1189 L1707.5 1186 L1705.5 1186 L1704.5 1183 L1702.5 1183 L1699.5 1178 L1696.5 1177Z M1665.5 1173.5 L1668.5 1171.5 L1682 1171.5 L1684 1172.5 L1685 1174.5 L1687 1174.5 L1688 1177.5 L1690 1177.5 L1691 1179.5 L1699 1186.5 L1699 1188.5 L1701 1188.5 L1702 1191.5 L1704 1191.5 L1705 1194.5 L1707 1194.5 L1708 1197.5 L1710 1197.5 L1711 1199.5 L1713 1200.5 L1713 1202.5 L1715 1202.5 L1716 1204.5 L1719 1206.5 L1719 1208.5 L1721 1208.5 L1722 1211.5 L1724 1211.5 L1725 1213.5 L1733 1220.5 L1733 1222.5 L1735 1222.5 L1736 1224.5 L1739 1226.5 L1739 1228.5 L1742 1228.5 L1743 1229.5 L1742 1233 L1741 1234 L1724.5 1234 L1723.5 1232 L1717.5 1228 L1716.5 1226 L1707.5 1218 L1706.5 1215 L1701.5 1212 L1700.5 1209 L1698.5 1209 L1696.5 1207 L1695.5 1204 L1692.5 1203 L1679.5 1189 L1676.5 1188 L1675.5 1184 L1672.5 1183 L1669.5 1178 L1667.5 1178 L1665.5 1176Z M1636.5 1172.5 L1637.5 1171.5 L1651 1171.5 L1656 1174.5 L1657 1177.5 L1660 1177.5 L1663 1182.5 L1664 1182.5 L1677 1196.5 L1680 1197.5 L1683 1202.5 L1688 1205.5 L1688 1208.5 L1690 1208.5 L1691 1210.5 L1702 1220.5 L1702 1222.5 L1704 1222.5 L1708 1227.5 L1713 1229.5 L1713 1232 L1711 1234 L1693.5 1234 L1692.5 1232 L1689.5 1231 L1687.5 1228 L1676.5 1218 L1675.5 1215 L1670.5 1211 L1670.5 1209 L1666.5 1208 L1664.5 1204 L1656.5 1197 L1656.5 1195 L1654.5 1195 L1650.5 1190 L1647.5 1189 L1644.5 1184 L1635.5 1176Z M1605.5 1172.5 L1606.5 1171.5 L1620 1171.5 L1623 1172.5 L1627 1177.5 L1630 1177.5 L1632 1180.5 L1632 1182.5 L1636 1183.5 L1638 1188.5 L1640 1188.5 L1646 1196.5 L1650 1197.5 L1652 1202.5 L1654 1202.5 L1657 1204.5 L1657 1208.5 L1661 1208.5 L1663 1213.5 L1664 1213.5 L1672 1222.5 L1674 1222.5 L1677 1225.5 L1677 1227.5 L1682 1229.5 L1682 1233 L1681 1234 L1663.5 1234 L1660.5 1232 L1658.5 1229 L1656.5 1228 L1656.5 1226 L1654.5 1226 L1653.5 1223 L1651.5 1223 L1650.5 1221 L1642.5 1214 L1642.5 1212 L1640.5 1212 L1639.5 1209 L1637.5 1209 L1636.5 1206 L1634.5 1206 L1633.5 1204 L1625.5 1197 L1625.5 1195 L1623.5 1195 L1622.5 1192 L1620.5 1192 L1619.5 1190 L1608.5 1180 L1608.5 1178 L1606.5 1178 L1604.5 1176Z M1574.5 1173.5 L1576.5 1171.5 L1590 1171.5 L1594 1173.5 L1597 1177.5 L1600 1178.5 L1601 1182.5 L1603 1182.5 L1606 1184.5 L1607 1188.5 L1610 1188.5 L1612 1190.5 L1612 1193.5 L1615 1194.5 L1617 1197.5 L1619 1197.5 L1621 1201.5 L1626 1204.5 L1626 1207.5 L1631 1209.5 L1632 1213.5 L1636 1214.5 L1637 1217.5 L1639 1218.5 L1642 1222.5 L1645 1223.5 L1646 1227.5 L1648 1227.5 L1651 1229.5 L1651 1233 L1650 1234 L1632.5 1234 L1628.5 1229 L1625.5 1228 L1625.5 1226 L1622.5 1225 L1622.5 1223 L1619.5 1222 L1619.5 1220 L1616.5 1219 L1616.5 1217 L1615.5 1217 L1614.5 1215 L1611.5 1214 L1611.5 1212 L1608.5 1211 L1608.5 1209 L1605.5 1208 L1605.5 1206 L1602.5 1205 L1602.5 1203 L1601.5 1203 L1597.5 1198 L1594.5 1197 L1594.5 1195 L1591.5 1194 L1591.5 1192 L1588.5 1191 L1588.5 1189 L1585.5 1188 L1585.5 1186 L1584.5 1186 L1583.5 1184 L1580.5 1183 L1580.5 1181 L1577.5 1180 L1577.5 1178 L1574.5 1177Z M1543.5 1172.5 L1544.5 1171.5 L1560 1171.5 L1565 1174.5 L1567 1177.5 L1569 1177.5 L1570 1180.5 L1571 1180.5 L1578 1188.5 L1580 1188.5 L1581 1191.5 L1582 1191.5 L1598 1208.5 L1600 1208.5 L1601 1211.5 L1605 1214.5 L1612 1222.5 L1615 1223.5 L1615 1225.5 L1620 1229.5 L1620 1233 L1619 1234 L1601.5 1234 L1600.5 1232 L1598.5 1232 L1597.5 1229 L1595.5 1229 L1594.5 1226 L1592.5 1226 L1591.5 1223 L1589.5 1223 L1588.5 1221 L1585.5 1219 L1585.5 1217 L1584.5 1217 L1583.5 1215 L1581.5 1215 L1580.5 1212 L1578.5 1212 L1577.5 1209 L1575.5 1209 L1574.5 1206 L1572.5 1206 L1571.5 1203 L1569.5 1203 L1568.5 1201 L1566.5 1200 L1566.5 1198 L1564.5 1198 L1563.5 1195 L1561.5 1195 L1560.5 1192 L1558.5 1192 L1557.5 1189 L1555.5 1189 L1554.5 1186 L1553.5 1186 L1552.5 1184 L1550.5 1184 L1549.5 1181 L1546.5 1180 L1546.5 1178 L1543.5 1177Z M1512.5 1173.5 L1514.5 1171.5 L1529 1171.5 L1532 1172.5 L1536 1177.5 L1539 1178.5 L1539 1180.5 L1540 1180.5 L1547 1188.5 L1550 1189.5 L1550 1191.5 L1551 1191.5 L1561 1202.5 L1564 1203.5 L1564 1205.5 L1565 1205.5 L1567 1208.5 L1570 1209.5 L1570 1211.5 L1571 1211.5 L1578 1219.5 L1581 1220.5 L1581 1222.5 L1582 1222.5 L1587 1228.5 L1590 1229.5 L1589 1233 L1588 1234 L1570.5 1234 L1566.5 1229 L1563.5 1228 L1563.5 1226 L1560.5 1225 L1560.5 1223 L1559.5 1223 L1546.5 1209 L1543.5 1208 L1543.5 1206 L1542.5 1206 L1532.5 1195 L1529.5 1194 L1529.5 1192 L1526.5 1191 L1526.5 1189 L1525.5 1189 L1518.5 1181 L1515.5 1180 L1515.5 1178 L1512.5 1177Z M1481.5 1173.5 L1484.5 1171.5 L1498 1171.5 L1501 1172.5 L1502 1174.5 L1504 1174.5 L1505 1177.5 L1507 1177.5 L1508 1180.5 L1509 1180.5 L1513 1185.5 L1515 1185.5 L1516 1188.5 L1518 1188.5 L1519 1191.5 L1521 1191.5 L1522 1194.5 L1524 1194.5 L1525 1197.5 L1526 1197.5 L1527 1199.5 L1529 1199.5 L1530 1202.5 L1532 1202.5 L1533 1205.5 L1535 1205.5 L1536 1208.5 L1538 1208.5 L1539 1211.5 L1540 1211.5 L1541 1213.5 L1543 1213.5 L1544 1216.5 L1545 1216.5 L1547 1219.5 L1549 1219.5 L1550 1222.5 L1552 1222.5 L1553 1225.5 L1554 1225.5 L1556 1228.5 L1559 1229.5 L1559 1232 L1557 1234 L1539.5 1234 L1538.5 1232 L1536.5 1231 L1532.5 1226 L1530.5 1226 L1529.5 1223 L1527.5 1223 L1526.5 1220 L1481.5 1176Z M1450.5 1173.5 L1453.5 1171.5 L1467 1171.5 L1470 1172.5 L1471 1174.5 L1473 1174.5 L1474 1177.5 L1476 1177.5 L1477 1179.5 L1479 1180.5 L1479 1182.5 L1482 1183.5 L1483 1185.5 L1485 1186.5 L1485 1188.5 L1487 1188.5 L1488 1191.5 L1490 1191.5 L1491 1194.5 L1493 1194.5 L1494 1197.5 L1496 1197.5 L1497 1199.5 L1499 1200.5 L1499 1202.5 L1501 1202.5 L1502 1205.5 L1504 1205.5 L1505 1208.5 L1507 1208.5 L1510 1213.5 L1512 1213.5 L1513 1216.5 L1515 1216.5 L1516 1219.5 L1518 1219.5 L1519 1222.5 L1521 1222.5 L1522 1225.5 L1523 1225.5 L1525 1228.5 L1528 1229.5 L1528 1233 L1527 1234 L1509.5 1234 L1505.5 1231 L1504.5 1229 L1499.5 1225 L1499.5 1223 L1497.5 1223 L1496.5 1221 L1479.5 1205 L1479.5 1203 L1477.5 1203 L1476.5 1201 L1450.5 1176Z M1420.5 1173.5 L1422.5 1171.5 L1436 1171.5 L1439 1172.5 L1440 1174.5 L1442 1174.5 L1443 1177.5 L1446 1177.5 L1448 1181.5 L1453 1184.5 L1454 1188.5 L1456 1188.5 L1457 1191.5 L1459 1191.5 L1460 1194.5 L1462 1194.5 L1463 1196.5 L1468 1200.5 L1468 1202.5 L1470 1202.5 L1471 1204.5 L1474 1206.5 L1474 1208.5 L1477 1208.5 L1480 1213.5 L1485 1217.5 L1485 1219.5 L1488 1220.5 L1488 1222.5 L1490 1222.5 L1495 1228.5 L1498 1228.5 L1499 1229.5 L1498 1233 L1497 1234 L1479.5 1234 L1478.5 1232 L1475.5 1231 L1473.5 1228 L1471.5 1228 L1469.5 1223 L1466.5 1223 L1465.5 1220 L1464.5 1220 L1462.5 1217 L1459.5 1216 L1458.5 1212 L1457.5 1212 L1455.5 1209 L1453.5 1209 L1442.5 1197 L1439.5 1196 L1438.5 1192 L1436.5 1192 L1434.5 1189 L1420.5 1176Z M1390.5 1173.5 L1392.5 1171.5 L1407 1171.5 L1410 1173.5 L1413 1177.5 L1416 1177.5 L1418 1182.5 L1423 1185.5 L1423 1188.5 L1427 1189.5 L1429 1193.5 L1430 1193.5 L1438 1202.5 L1442 1204.5 L1443 1208.5 L1447 1208.5 L1449 1213.5 L1452 1214.5 L1454 1218.5 L1456 1219.5 L1463 1227.5 L1468 1229.5 L1468 1233 L1467 1234 L1448.5 1234 L1447.5 1232 L1439.5 1225 L1439.5 1223 L1436.5 1223 L1433.5 1218 L1408.5 1194 L1408.5 1192 L1406.5 1192 L1393.5 1178 L1391.5 1178 L1389.5 1176Z M1358.5 1173.5 L1361.5 1171.5 L1376 1171.5 L1381 1174.5 L1383 1177.5 L1385 1177.5 L1386 1180.5 L1387 1180.5 L1389 1183.5 L1391 1183.5 L1394 1188.5 L1397 1189.5 L1398 1193.5 L1402 1194.5 L1403 1197.5 L1412 1205.5 L1412 1207.5 L1416 1208.5 L1418 1213.5 L1422 1214.5 L1423 1217.5 L1425 1219.5 L1427 1219.5 L1428 1222.5 L1430 1222.5 L1431 1225.5 L1434 1226.5 L1434 1228.5 L1437 1229.5 L1437 1233 L1436 1234 L1417.5 1234 L1413.5 1229 L1408.5 1226 L1408.5 1223 L1405.5 1223 L1402.5 1218 L1377.5 1194 L1377.5 1192 L1375.5 1192 L1362.5 1178 L1360.5 1178 L1358.5 1176Z M1329.5 1172.5 L1330.5 1171.5 L1345 1171.5 L1347 1173.5 L1351 1174.5 L1352 1177.5 L1354 1177.5 L1358 1183.5 L1360 1183.5 L1361 1186.5 L1363 1188.5 L1365 1188.5 L1368 1193.5 L1371 1194.5 L1372 1197.5 L1374 1197.5 L1377 1202.5 L1379 1203.5 L1383 1208.5 L1385 1208.5 L1386 1211.5 L1387 1211.5 L1389 1214.5 L1391 1214.5 L1392 1217.5 L1397 1220.5 L1397 1222.5 L1400 1223.5 L1400 1225.5 L1403 1226.5 L1403 1228.5 L1406 1229.5 L1406 1233 L1405 1234 L1387.5 1234 L1384.5 1232 L1382.5 1229 L1377.5 1225 L1377.5 1223 L1375.5 1223 L1374.5 1221 L1371.5 1219 L1371.5 1217 L1369.5 1217 L1368.5 1215 L1366.5 1214 L1366.5 1212 L1364.5 1212 L1363.5 1209 L1361.5 1209 L1360.5 1207 L1357.5 1205 L1357.5 1203 L1355.5 1203 L1354.5 1201 L1352.5 1200 L1352.5 1198 L1350.5 1198 L1348.5 1195 L1346.5 1194 L1346.5 1192 L1344.5 1192 L1343.5 1189 L1341.5 1189 L1340.5 1187 L1332.5 1180 L1332.5 1178 L1330.5 1178 L1328.5 1176Z M1298.5 1172.5 L1299.5 1171.5 L1315 1171.5 L1317 1172.5 L1318 1174.5 L1320 1174.5 L1321 1177.5 L1323 1177.5 L1324 1179.5 L1338 1192.5 L1338 1194.5 L1340 1194.5 L1341 1196.5 L1352 1206.5 L1352 1208.5 L1354 1208.5 L1355 1210.5 L1375 1229.5 L1375 1233 L1374 1234 L1356.5 1234 L1353.5 1232 L1352.5 1230 L1346.5 1225 L1346.5 1223 L1344.5 1223 L1343.5 1220 L1341.5 1220 L1340.5 1218 L1337.5 1216 L1335.5 1212 L1333.5 1212 L1332.5 1209 L1330.5 1209 L1329.5 1206 L1327.5 1206 L1326.5 1203 L1324.5 1203 L1323.5 1201 L1321.5 1200 L1321.5 1198 L1319.5 1198 L1317.5 1195 L1315.5 1194 L1315.5 1192 L1313.5 1192 L1312.5 1189 L1310.5 1189 L1309.5 1187 L1301.5 1180 L1301.5 1178 L1299.5 1178 L1297.5 1176Z M1267.5 1172.5 L1268.5 1171.5 L1284 1171.5 L1286 1172.5 L1287 1174.5 L1289 1174.5 L1290 1176.5 L1321 1206.5 L1321 1208.5 L1324 1208.5 L1325 1211.5 L1326 1211.5 L1342 1228.5 L1345 1229.5 L1345 1232 L1343 1234 L1325.5 1234 L1318.5 1226 L1315.5 1225 L1315.5 1223 L1312.5 1222 L1312.5 1220 L1311.5 1220 L1304.5 1212 L1301.5 1211 L1301.5 1209 L1298.5 1208 L1298.5 1206 L1295.5 1205 L1295.5 1203 L1292.5 1202 L1287.5 1195 L1284.5 1194 L1284.5 1192 L1281.5 1191 L1281.5 1189 L1280.5 1189 L1273.5 1181 L1270.5 1180 L1270.5 1178 L1267.5 1177Z M1236.5 1173.5 L1238.5 1171.5 L1253 1171.5 L1257 1174.5 L1259 1174.5 L1260 1177.5 L1262 1177.5 L1265 1182.5 L1266 1182.5 L1271 1188.5 L1273 1188.5 L1274 1191.5 L1275 1191.5 L1282 1199.5 L1284 1199.5 L1285 1202.5 L1286 1202.5 L1291 1208.5 L1293 1208.5 L1296 1213.5 L1297 1213.5 L1302 1219.5 L1305 1220.5 L1305 1222.5 L1308 1223.5 L1308 1225.5 L1309 1225.5 L1310 1227.5 L1315 1229.5 L1315 1233 L1314 1234 L1294.5 1234 L1284.5 1223 L1281.5 1222 L1281.5 1220 L1280.5 1220 L1273.5 1212 L1270.5 1211 L1270.5 1209 L1269.5 1209 L1253.5 1192 L1250.5 1191 L1250.5 1189 L1249.5 1189 L1239.5 1178 L1236.5 1177Z M1205.5 1173.5 L1207.5 1171.5 L1222 1171.5 L1225 1172.5 L1226 1174.5 L1228 1174.5 L1229 1177.5 L1232 1177.5 L1234 1180.5 L1234 1182.5 L1238 1183.5 L1240 1186.5 L1240 1188.5 L1242 1188.5 L1244 1191.5 L1246 1192.5 L1246 1194.5 L1248 1194.5 L1251 1199.5 L1253 1199.5 L1254 1202.5 L1256 1202.5 L1257 1204.5 L1260 1206.5 L1260 1208.5 L1263 1208.5 L1264 1209.5 L1265 1213.5 L1267 1213.5 L1271 1217.5 L1271 1219.5 L1273 1219.5 L1274 1222.5 L1276 1222.5 L1277 1225.5 L1283 1229.5 L1284 1233 L1283 1234 L1263.5 1234 L1262.5 1232 L1256.5 1227 L1254.5 1223 L1251.5 1223 L1249.5 1218 L1246.5 1217 L1245.5 1215 L1236.5 1207 L1235.5 1204 L1232.5 1203 L1229.5 1198 L1225.5 1196 L1224.5 1192 L1220.5 1192 L1219.5 1189 L1215.5 1186 L1208.5 1178 L1205.5 1177Z M1174.5 1173.5 L1177.5 1171.5 L1191 1171.5 L1194 1172.5 L1195 1174.5 L1197 1174.5 L1204 1182.5 L1208 1184.5 L1209 1188.5 L1211 1188.5 L1216 1194.5 L1219 1195.5 L1221 1199.5 L1229 1206.5 L1229 1208.5 L1232 1208.5 L1234 1212.5 L1239 1215.5 L1240 1219.5 L1242 1219.5 L1247 1225.5 L1249 1225.5 L1250 1227.5 L1253 1229.5 L1253 1233 L1252 1234 L1233.5 1234 L1230.5 1231 L1230.5 1229 L1226.5 1228 L1224.5 1225 L1224.5 1223 L1221.5 1223 L1219.5 1219 L1210.5 1211 L1210.5 1209 L1208.5 1209 L1204.5 1205 L1204.5 1203 L1201.5 1203 L1200.5 1202 L1199.5 1198 L1197.5 1198 L1194.5 1196 L1193.5 1192 L1191.5 1192 L1183.5 1183 L1180.5 1182 L1179.5 1178 L1176.5 1178 L1174.5 1176Z M1143.5 1174.5 L1146.5 1171.5 L1162 1171.5 L1165 1174.5 L1167 1174.5 L1168 1176.5 L1183 1190.5 L1184 1193.5 L1187 1194.5 L1188 1196.5 L1199 1206.5 L1199 1208.5 L1202 1208.5 L1203 1209.5 L1203 1211.5 L1208 1215.5 L1210 1219.5 L1212 1219.5 L1220 1228.5 L1223 1229.5 L1223 1232 L1221 1234 L1202.5 1234 L1199.5 1229 L1195.5 1228 L1193.5 1223 L1191.5 1223 L1188.5 1218 L1185.5 1217 L1182.5 1212 L1179.5 1211 L1179.5 1209 L1175.5 1208 L1174.5 1207 L1174.5 1204 L1173.5 1203 L1170.5 1203 L1168.5 1200 L1168.5 1198 L1166.5 1198 L1162.5 1192 L1160.5 1192 L1159.5 1189 L1157.5 1189 L1156.5 1187 L1154.5 1186 L1154.5 1184 L1150.5 1183 L1148.5 1180 L1148.5 1178 L1144.5 1177Z M1114.5 1173.5 L1116.5 1171.5 L1131 1171.5 L1134 1174.5 L1136 1174.5 L1155 1194.5 L1158 1195.5 L1158 1197.5 L1159 1197.5 L1169 1208.5 L1172 1209.5 L1172 1211.5 L1173 1211.5 L1189 1228.5 L1192 1229.5 L1192 1232 L1190 1234 L1172.5 1234 L1171.5 1232 L1163.5 1225 L1163.5 1223 L1160.5 1223 L1159.5 1220 L1158.5 1220 L1142.5 1203 L1139.5 1202 L1137.5 1198 L1132.5 1194 L1132.5 1192 L1130.5 1192 L1123.5 1184 L1119.5 1182 L1117.5 1178 L1114.5 1177Z M1083.5 1173.5 L1085.5 1171.5 L1100 1171.5 L1102 1173.5 L1106 1174.5 L1107 1177.5 L1109 1177.5 L1110 1180.5 L1112 1180.5 L1113 1183.5 L1115 1183.5 L1118 1188.5 L1120 1188.5 L1121 1191.5 L1123 1191.5 L1124 1194.5 L1126 1194.5 L1127 1197.5 L1128 1197.5 L1135 1205.5 L1137 1205.5 L1138 1208.5 L1140 1208.5 L1141 1211.5 L1142 1211.5 L1144 1214.5 L1146 1214.5 L1149 1219.5 L1151 1219.5 L1152 1222.5 L1155 1223.5 L1155 1225.5 L1158 1226.5 L1158 1228.5 L1161 1229.5 L1161 1233 L1160 1234 L1141.5 1234 L1140.5 1232 L1132.5 1225 L1132.5 1223 L1130.5 1223 L1129.5 1221 L1118.5 1211 L1118.5 1209 L1116.5 1209 L1114.5 1206 L1112.5 1205 L1112.5 1203 L1110.5 1203 L1109.5 1201 L1101.5 1194 L1101.5 1192 L1099.5 1192 L1098.5 1189 L1096.5 1189 L1095.5 1187 L1087.5 1180 L1087.5 1178 L1085.5 1178 L1083.5 1176Z M1053.5 1172.5 L1054.5 1171.5 L1069 1171.5 L1072 1172.5 L1073 1174.5 L1075 1174.5 L1076 1177.5 L1078 1177.5 L1079 1179.5 L1082 1181.5 L1082 1183.5 L1084 1183.5 L1085 1185.5 L1087 1186.5 L1087 1188.5 L1089 1188.5 L1090 1190.5 L1093 1192.5 L1093 1194.5 L1095 1194.5 L1096 1197.5 L1098 1197.5 L1099 1199.5 L1104 1203.5 L1104 1205.5 L1106 1205.5 L1107 1208.5 L1109 1208.5 L1110 1210.5 L1113 1212.5 L1113 1214.5 L1115 1214.5 L1116 1216.5 L1118 1217.5 L1118 1219.5 L1120 1219.5 L1121 1222.5 L1123 1222.5 L1124 1225.5 L1126 1225.5 L1127 1227.5 L1130 1229.5 L1130 1233 L1129 1234 L1110.5 1234 L1109.5 1232 L1101.5 1225 L1101.5 1223 L1099.5 1223 L1098.5 1220 L1096.5 1220 L1095.5 1218 L1087.5 1211 L1087.5 1209 L1085.5 1209 L1084.5 1207 L1081.5 1205 L1081.5 1203 L1079.5 1203 L1076.5 1198 L1074.5 1198 L1070.5 1192 L1068.5 1192 L1067.5 1189 L1065.5 1189 L1064.5 1187 L1056.5 1180 L1056.5 1178 L1054.5 1178 L1052.5 1176Z M1022.5 1172.5 L1023.5 1171.5 L1039 1171.5 L1041 1172.5 L1042 1174.5 L1044 1174.5 L1045 1177.5 L1047 1177.5 L1048 1179.5 L1062 1192.5 L1062 1194.5 L1064 1194.5 L1065 1196.5 L1076 1206.5 L1076 1208.5 L1078 1208.5 L1079 1210.5 L1099 1229.5 L1099 1233 L1098 1234 L1080.5 1234 L1070.5 1223 L1067.5 1222 L1067.5 1220 L1063.5 1217 L1056.5 1209 L1053.5 1208 L1053.5 1206 L1050.5 1203 L1047.5 1202 L1047.5 1200 L1044.5 1198 L1039.5 1192 L1036.5 1191 L1036.5 1189 L1033.5 1188 L1033.5 1186 L1032.5 1186 L1025.5 1178 L1022.5 1177Z M991.5 1172.5 L992.5 1171.5 L1008 1171.5 L1010 1172.5 L1011 1174.5 L1014 1174.5 L1017 1179.5 L1018 1179.5 L1026 1188.5 L1028 1188.5 L1031 1193.5 L1033 1194.5 L1046 1208.5 L1048 1208.5 L1051 1213.5 L1052 1213.5 L1057 1219.5 L1060 1220.5 L1060 1222.5 L1068 1229.5 L1068 1233 L1067 1234 L1049.5 1234 L1047.5 1231 L1042.5 1227 L1040.5 1223 L1037.5 1223 L1036.5 1222 L1036.5 1220 L1026.5 1211 L1026.5 1209 L1023.5 1209 L1022.5 1208 L1021.5 1204 L1016.5 1202 L1015.5 1198 L1013.5 1198 L1008.5 1192 L1005.5 1191 L1005.5 1189 L1002.5 1188 L1001.5 1184 L998.5 1183 L995.5 1178 L992.5 1178 L991.5 1177Z M960.5 1173.5 L962.5 1171.5 L978 1171.5 L980 1174.5 L983 1174.5 L986 1179.5 L987 1179.5 L1015 1208.5 L1017 1208.5 L1020 1213.5 L1037 1229.5 L1037 1233 L1036 1234 L1019.5 1234 L1015.5 1229 L1011.5 1227 L1010.5 1223 L1007.5 1223 L1004.5 1218 L997.5 1213 L996.5 1209 L992.5 1209 L991.5 1208 L990.5 1204 L987.5 1203 L984.5 1198 L981.5 1197 L979.5 1193 L977.5 1192 L970.5 1184 L966.5 1182 L965.5 1178 L961.5 1178 L960.5 1177Z M931.5 1172.5 L932.5 1171.5 L947 1171.5 L949 1172.5 L950 1174.5 L952 1174.5 L968 1191.5 L971 1192.5 L971 1194.5 L972 1194.5 L985 1208.5 L988 1209.5 L995 1217.5 L995 1219.5 L997 1219.5 L1002 1225.5 L1004 1225.5 L1005 1227.5 L1008 1229.5 L1008 1232 L1006 1234 L988.5 1234 L984.5 1229 L980.5 1227 L979.5 1223 L977.5 1223 L970.5 1215 L967.5 1214 L965.5 1211 L965.5 1209 L963.5 1209 L959.5 1205 L959.5 1203 L957.5 1203 L956.5 1201 L954.5 1200 L954.5 1198 L952.5 1198 L950.5 1195 L948.5 1194 L948.5 1192 L946.5 1192 L945.5 1189 L943.5 1189 L942.5 1187 L934.5 1180 L934.5 1178 L932.5 1178 L929.5 1176 L931.5 1174.5Z M900.5 1172.5 L901.5 1171.5 L917 1171.5 L920 1174.5 L922 1174.5 L923 1176.5 L932 1184.5 L937 1191.5 L939 1191.5 L940 1194.5 L942 1194.5 L943 1196.5 L946 1198.5 L948 1202.5 L949 1202.5 L951 1205.5 L953 1205.5 L954 1208.5 L956 1208.5 L965 1219.5 L966 1219.5 L968 1222.5 L970 1222.5 L971 1225.5 L973 1225.5 L974 1227.5 L977 1229.5 L977 1233 L976 1234 L958.5 1234 L954.5 1229 L952.5 1229 L950.5 1227 L948.5 1223 L945.5 1222 L945.5 1220 L943.5 1220 L942.5 1218 L940.5 1217 L940.5 1215 L937.5 1214 L936.5 1212 L934.5 1211 L934.5 1209 L931.5 1208 L928.5 1203 L925.5 1202 L923.5 1198 L920.5 1197 L920.5 1195 L917.5 1194 L917.5 1192 L914.5 1191 L914.5 1189 L912.5 1189 L911.5 1187 L909.5 1186 L909.5 1184 L906.5 1183 L905.5 1181 L903.5 1180 L903.5 1178 L900.5 1177Z M869.5 1173.5 L871.5 1171.5 L886 1171.5 L889 1174.5 L891 1174.5 L892 1176.5 L904 1187.5 L906 1191.5 L908 1191.5 L909 1193.5 L923 1206.5 L923 1208.5 L925 1208.5 L926 1210.5 L935 1218.5 L937 1222.5 L939 1222.5 L940 1224.5 L946 1229.5 L946 1233 L945 1234 L927.5 1234 L923.5 1229 L920.5 1228 L920.5 1226 L919.5 1226 L917.5 1223 L914.5 1222 L914.5 1220 L913.5 1220 L903.5 1209 L900.5 1208 L900.5 1206 L899.5 1206 L892.5 1198 L889.5 1197 L889.5 1195 L888.5 1195 L872.5 1178 L869.5 1177Z M838.5 1173.5 L840.5 1171.5 L855 1171.5 L860 1174.5 L862 1177.5 L864 1177.5 L865 1180.5 L866 1180.5 L876 1191.5 L878 1191.5 L879 1194.5 L880 1194.5 L907 1222.5 L909 1222.5 L910 1225.5 L911 1225.5 L913 1228.5 L916 1229.5 L915 1233 L914 1234 L896.5 1234 L892.5 1229 L889.5 1228 L889.5 1226 L888.5 1226 L872.5 1209 L869.5 1208 L869.5 1206 L868.5 1206 L841.5 1178 L838.5 1177Z M805.5 1173.5 L807.5 1171.5 L809 1172.5 L810.5 1171.5 L824 1171.5 L829 1174.5 L831 1177.5 L833 1177.5 L834 1180.5 L835 1180.5 L845 1191.5 L847 1191.5 L848 1194.5 L849 1194.5 L856 1202.5 L858 1202.5 L859 1205.5 L860 1205.5 L862 1208.5 L864 1208.5 L865 1211.5 L866 1211.5 L876 1222.5 L878 1222.5 L879 1225.5 L880 1225.5 L882 1228.5 L885 1229.5 L884 1233 L883 1234 L865.5 1234 L864.5 1232 L858.5 1227 L856.5 1223 L854.5 1223 L853.5 1220 L851.5 1220 L850.5 1218 L844.5 1213 L842.5 1209 L840.5 1209 L838.5 1206 L833.5 1202 L831.5 1198 L828.5 1197 L825.5 1192 L823.5 1192 L822.5 1189 L820.5 1189 L817.5 1184 L813.5 1182 L811.5 1178 L807.5 1178 L805.5 1176Z M317.5 1173.5 L320.5 1171.5 L334 1171.5 L339 1174.5 L340 1177.5 L343 1177.5 L346 1182.5 L351 1186.5 L351 1188.5 L353 1188.5 L355 1191.5 L371 1206.5 L371 1208.5 L374 1208.5 L377 1213.5 L385 1220.5 L385 1222.5 L387 1222.5 L392 1228.5 L395 1228.5 L396 1229.5 L396 1233 L395 1234 L376.5 1234 L375.5 1232 L372.5 1231 L365.5 1223 L362.5 1222 L362.5 1220 L356.5 1215 L355.5 1212 L352.5 1211 L351.5 1209 L337.5 1196 L335.5 1192 L333.5 1192 L320.5 1178 L317.5 1177Z M286.5 1173.5 L289.5 1171.5 L303 1171.5 L308 1174.5 L310 1177.5 L313 1177.5 L315 1180.5 L315 1182.5 L319 1183.5 L321 1188.5 L323 1188.5 L326 1193.5 L329 1194.5 L330 1196.5 L333 1198.5 L335 1202.5 L339 1203.5 L340 1204.5 L340 1207.5 L341 1208.5 L344 1208.5 L346 1213.5 L350 1214.5 L352 1219.5 L355 1220.5 L355 1222.5 L357 1222.5 L362 1228.5 L365 1229.5 L365 1233 L364 1234 L345.5 1234 L341.5 1231 L340.5 1229 L337.5 1227 L336.5 1223 L332.5 1223 L330.5 1218 L327.5 1217 L324.5 1212 L321.5 1211 L320.5 1209 L311.5 1201 L310.5 1198 L307.5 1197 L305.5 1193 L300.5 1190 L299.5 1187 L296.5 1186 L289.5 1178 L286.5 1177Z M255.5 1173.5 L258.5 1171.5 L273 1171.5 L276 1174.5 L278 1174.5 L280 1177.5 L282 1177.5 L284 1180.5 L284 1182.5 L288 1183.5 L290 1188.5 L293 1188.5 L295 1190.5 L295 1193.5 L299 1194.5 L300 1197.5 L304 1200.5 L304 1202.5 L307 1203.5 L310 1208.5 L313 1208.5 L315 1211.5 L315 1213.5 L319 1214.5 L321 1219.5 L323 1219.5 L331 1228.5 L334 1229.5 L334 1233 L333 1234 L315.5 1234 L312.5 1232 L310.5 1229 L306.5 1227 L305.5 1223 L303.5 1223 L299.5 1218 L294.5 1214 L294.5 1212 L291.5 1211 L291.5 1209 L289.5 1209 L284.5 1203 L281.5 1202 L280.5 1198 L278.5 1198 L275.5 1196 L274.5 1192 L272.5 1192 L268.5 1187 L260.5 1180 L260.5 1178 L258.5 1178 L255.5 1176Z M224.5 1173.5 L227.5 1171.5 L243 1171.5 L248 1174.5 L249 1176.5 L258 1184.5 L259 1187.5 L263 1188.5 L265 1193.5 L268 1194.5 L269 1196.5 L283 1209.5 L285 1213.5 L288 1214.5 L292 1219.5 L295 1220.5 L295 1222.5 L303 1229.5 L303 1233 L302 1234 L283.5 1234 L282.5 1232 L280.5 1231 L280.5 1229 L276.5 1228 L274.5 1225 L274.5 1223 L271.5 1223 L268.5 1218 L263.5 1214 L263.5 1212 L261.5 1212 L260.5 1209 L258.5 1209 L257.5 1207 L254.5 1205 L254.5 1203 L251.5 1203 L250.5 1202 L249.5 1198 L247.5 1198 L243.5 1194 L243.5 1192 L241.5 1192 L240.5 1190 L229.5 1180 L229.5 1178 L226.5 1178 L224.5 1176Z M195.5 1172.5 L196.5 1171.5 L212 1171.5 L217 1174.5 L219 1177.5 L221 1177.5 L222 1180.5 L223 1180.5 L261 1219.5 L264 1220.5 L264 1222.5 L272 1229.5 L272 1233 L271 1234 L253.5 1234 L252.5 1232 L250.5 1232 L249.5 1229 L247.5 1229 L246.5 1226 L244.5 1226 L243.5 1223 L241.5 1223 L240.5 1220 L239.5 1220 L232.5 1212 L230.5 1212 L229.5 1209 L227.5 1209 L226.5 1206 L224.5 1206 L223.5 1203 L221.5 1203 L220.5 1201 L218.5 1200 L218.5 1198 L216.5 1198 L215.5 1195 L213.5 1195 L212.5 1192 L210.5 1192 L209.5 1189 L208.5 1189 L201.5 1181 L198.5 1180 L198.5 1178 L195.5 1177Z M164.5 1172.5 L165.5 1171.5 L181 1171.5 L185 1174.5 L187 1174.5 L188 1177.5 L190 1177.5 L191 1180.5 L192 1180.5 L196 1185.5 L198 1185.5 L199 1188.5 L201 1188.5 L202 1191.5 L203 1191.5 L210 1199.5 L212 1199.5 L213 1202.5 L215 1202.5 L216 1205.5 L218 1205.5 L219 1208.5 L221 1208.5 L222 1211.5 L223 1211.5 L230 1219.5 L232 1219.5 L233 1222.5 L235 1222.5 L236 1225.5 L237 1225.5 L239 1228.5 L242 1229.5 L242 1233 L241 1234 L222.5 1234 L212.5 1223 L209.5 1222 L209.5 1220 L208.5 1220 L201.5 1212 L198.5 1211 L198.5 1209 L197.5 1209 L181.5 1192 L178.5 1191 L178.5 1189 L177.5 1189 L170.5 1181 L167.5 1180 L167.5 1178 L164.5 1177Z M133.5 1173.5 L135.5 1171.5 L150 1171.5 L153 1172.5 L154 1174.5 L156 1174.5 L157 1177.5 L159 1177.5 L160 1179.5 L162 1180.5 L162 1182.5 L165 1183.5 L166 1185.5 L168 1186.5 L168 1188.5 L170 1188.5 L171 1191.5 L173 1191.5 L174 1194.5 L176 1194.5 L177 1196.5 L182 1200.5 L182 1202.5 L184 1202.5 L185 1205.5 L187 1205.5 L188 1208.5 L190 1208.5 L191 1210.5 L193 1211.5 L193 1213.5 L195 1213.5 L196 1215.5 L199 1217.5 L199 1219.5 L201 1219.5 L202 1222.5 L204 1222.5 L205 1224.5 L211 1229.5 L211 1233 L210 1234 L191.5 1234 L190.5 1232 L182.5 1225 L182.5 1223 L179.5 1223 L178.5 1220 L177.5 1220 L170.5 1212 L168.5 1212 L167.5 1209 L165.5 1209 L164.5 1206 L163.5 1206 L136.5 1178 L133.5 1177Z M102.5 1173.5 L104.5 1171.5 L119 1171.5 L122 1172.5 L123 1174.5 L125 1174.5 L126 1177.5 L128 1177.5 L129 1179.5 L137 1186.5 L137 1188.5 L139 1188.5 L140 1191.5 L142 1191.5 L143 1194.5 L145 1194.5 L146 1196.5 L148 1197.5 L148 1199.5 L150 1199.5 L151 1202.5 L153 1202.5 L154 1205.5 L156 1205.5 L157 1208.5 L159 1208.5 L160 1210.5 L168 1217.5 L168 1219.5 L170 1219.5 L171 1222.5 L173 1222.5 L174 1225.5 L176 1225.5 L177 1227.5 L180 1228.5 L182 1230.5 L182 1232 L180 1234 L160.5 1234 L159.5 1231 L153.5 1227 L152.5 1223 L149.5 1223 L147.5 1219 L143.5 1217 L142.5 1214 L140.5 1214 L139.5 1212 L134.5 1208 L134.5 1206 L132.5 1206 L131.5 1203 L129.5 1203 L127.5 1199 L123.5 1197 L122.5 1194 L120.5 1192 L118.5 1192 L117.5 1189 L115.5 1189 L114.5 1187 L111.5 1185 L111.5 1183 L108.5 1182 L106.5 1178 L103.5 1178 L102.5 1177Z M71.5 1173.5 L73.5 1171.5 L88 1171.5 L91 1172.5 L92 1174.5 L94 1174.5 L101 1182.5 L106 1184.5 L106 1188.5 L108 1188.5 L113 1194.5 L115 1194.5 L118 1199.5 L126 1206.5 L126 1208.5 L130 1208.5 L132 1213.5 L137 1215.5 L137 1219.5 L139 1219.5 L146 1227.5 L151 1229.5 L151 1233 L150 1234 L129.5 1234 L128.5 1231 L122.5 1227 L122.5 1224 L121.5 1223 L118.5 1223 L116.5 1218 L112.5 1217 L111.5 1214 L109.5 1214 L108.5 1211 L103.5 1208 L102.5 1204 L98.5 1203 L96.5 1198 L92.5 1197 L91.5 1196 L91.5 1193 L90.5 1192 L87.5 1192 L86.5 1189 L84.5 1188 L80.5 1183 L78.5 1183 L75.5 1178 L73.5 1178 L71.5 1176Z M41.5 1173.5 L43.5 1171.5 L58 1171.5 L60 1172.5 L61 1174.5 L63 1174.5 L68 1178.5 L70 1182.5 L75 1185.5 L75 1188.5 L79 1189.5 L81 1193.5 L86 1195.5 L87 1199.5 L88 1199.5 L96 1208.5 L98 1208.5 L101 1213.5 L106 1215.5 L106 1219.5 L110 1220.5 L112 1224.5 L115 1225.5 L117 1228.5 L120 1229.5 L120 1232 L118 1234 L100.5 1234 L98.5 1233 L96.5 1229 L91.5 1226 L91.5 1223 L87.5 1223 L85.5 1218 L77.5 1211 L77.5 1209 L75.5 1209 L72.5 1207 L71.5 1203 L67.5 1203 L66.5 1202 L65.5 1198 L60.5 1195 L60.5 1192 L58.5 1192 L51.5 1184 L47.5 1183 L45.5 1178 L42.5 1178 L41.5 1177Z M21.5 1175.5 L23.5 1174.5 L24.5 1172.5 L27.5 1171.5 L30 1172.5 L30 1174.5 L34 1174.5 L35 1177.5 L37 1177.5 L38 1180.5 L40 1180.5 L41 1183.5 L44 1184.5 L44 1186.5 L49 1190.5 L50 1193.5 L54 1194.5 L55 1197.5 L56 1197.5 L58 1200.5 L60 1200.5 L61 1203.5 L62 1203.5 L66 1208.5 L68 1208.5 L69 1211.5 L71 1212.5 L72 1214.5 L74 1214.5 L75 1217.5 L77 1219.5 L79 1219.5 L80 1222.5 L81 1222.5 L83 1225.5 L86 1226.5 L86 1228.5 L89 1229.5 L89 1233 L88 1234 L68.5 1234 L65.5 1229 L61.5 1227 L60.5 1223 L58.5 1223 L57.5 1221 L46.5 1211 L46.5 1209 L42.5 1208 L40.5 1205 L40.5 1203 L38.5 1203 L35.5 1199 L29.5 1194 L29.5 1192 L27.5 1192 L26.5 1189 L24.5 1189 L23.5 1187 L21.5 1186 L20.5 1183Z M521.5 1126.5 L591 1126.5 L594 1130.5 L594 1177 L593 1178 L585 1178 L584 1181.5 L585 1183.5 L593 1183.5 L594 1185.5 L599.5 1185.5 L600.5 1183.5 L608.5 1183.5 L610.5 1182.5 L610.5 1178 L601.5 1178 L599.5 1176 L599.5 1130.5 L601.5 1129.5 L603.5 1126.5 L672 1126.5 L674 1127.5 L676 1130.5 L676 1176 L674 1178 L662 1178 L661 1181 L662 1183.5 L669 1183.5 L673 1189.5 L673 1222 L670 1223 L669 1226 L526.5 1226 L524.5 1225 L521.5 1218 L522.5 1216.5 L522.5 1195 L521.5 1194 L522.5 1192.5 L522.5 1186.5 L524.5 1183.5 L531.5 1183.5 L533.5 1182.5 L532.5 1178 L520.5 1178 L517.5 1174 L518.5 1170.5 L518.5 1130.5Z M935.5 1078.5 L937.5 1076.5 L943 1076.5 L944 1078.5 L946 1079.5 L946 1082 L943 1085 L937.5 1085 L935.5 1083Z M919.5 1080.5 L921.5 1078.5 L923.5 1078.5 L924.5 1076.5 L928 1076.5 L930 1079.5 L930 1082 L928 1085 L923.5 1085 L922.5 1082 L920.5 1082Z M922.5 1065.5 L924.5 1062.5 L927.5 1061.5 L942 1061.5 L944 1063.5 L944 1069 L942 1071 L925.5 1071 L922.5 1069Z M601.5 1061.5 L604 1061.5 L605 1064.5 L608 1066.5 L610 1070.5 L610 1075.5 L611 1076.5 L610 1092 L608 1095 L606 1096 L604 1101 L602.5 1101 L599.5 1098 L599.5 1063.5Z M591.5 1061.5 L594 1062.5 L594 1100 L593 1101 L591.5 1101 L590.5 1099 L585.5 1095 L584.5 1092 L584.5 1068.5 L587.5 1066.5 L588.5 1063.5Z M656.5 1060.5 L663 1061.5 L664 1062.5 L665 1066.5 L670 1074.5 L670 1087 L668 1089 L666 1095 L660 1102 L654.5 1102 L652.5 1099 L650.5 1098 L649.5 1093 L646.5 1092 L646.5 1071.5 L647.5 1068.5 L649.5 1067.5 L650.5 1063.5 L652.5 1061.5 L655.5 1061.5Z M535.5 1060.5 L542 1061.5 L543 1062.5 L544 1067.5 L546 1068.5 L549 1074.5 L549 1087 L548 1088 L548 1091 L545 1095 L543 1096 L543 1100 L539 1102 L534.5 1102 L529.5 1098 L528.5 1093 L523.5 1086 L523.5 1076.5 L525.5 1073.5 L525.5 1071.5 L527.5 1070.5 L528.5 1064.5 L531.5 1061.5 L534.5 1061.5Z M942.5 1051.5 L943.5 1050.5 L949 1050.5 L950 1053 L947.5 1056Z M603.5 1039.5 L672 1039.5 L675 1041.5 L676 1043.5 L676 1064 L674 1068 L671.5 1067 L670.5 1062 L666.5 1057 L662.5 1056 L660.5 1054 L654 1054 L652 1056 L648 1057 L640 1073 L640 1087.5 L641 1088.5 L641 1092.5 L642 1095.5 L643 1095.5 L645 1098.5 L645 1101.5 L647 1101.5 L650 1106.5 L653 1106.5 L654 1107.5 L664.5 1106.5 L664.5 1105.5 L666.5 1104.5 L666.5 1102.5 L669.5 1101.5 L670.5 1096.5 L672.5 1095.5 L672.5 1093.5 L673.5 1092.5 L675 1093.5 L676 1096.5 L676 1120 L674 1122 L602.5 1122 L599.5 1120 L599.5 1108.5 L607.5 1104.5 L607.5 1103.5 L610.5 1101.5 L610.5 1099.5 L615.5 1095.5 L615.5 1084.5 L616.5 1083.5 L615.5 1080 L615.5 1068 L607.5 1057 L603.5 1056 L602.5 1054 L599.5 1052 L599.5 1043.5 L602.5 1041.5Z M521.5 1039.5 L591 1039.5 L594 1042.5 L594 1053 L590 1056 L586 1057 L585 1061 L580 1065 L579 1068 L579 1078 L578 1079 L580 1096.5 L589 1106.5 L591 1106.5 L594 1108.5 L594 1120 L592 1122 L521.5 1122 L518.5 1120 L517.5 1118 L518.5 1115.5 L518.5 1104 L517.5 1103 L517.5 1099.5 L521.5 1092.5 L523 1093.5 L524 1101.5 L526 1101.5 L529 1106.5 L533 1106.5 L534 1107.5 L543.5 1106.5 L543.5 1105.5 L548.5 1101.5 L548.5 1099.5 L553.5 1092.5 L553.5 1068 L550.5 1066 L548.5 1060 L546.5 1059 L545.5 1057 L541.5 1056 L539.5 1054 L534 1054 L531 1056 L529 1056 L524 1061 L522 1068 L519.5 1067 L519.5 1065 L517.5 1062 L517.5 1058.5 L518.5 1057.5 L518.5 1047 L517.5 1045.5Z M895.5 1039 L895.5 1032.5 L903.5 1025.5 L908 1025.5 L910 1028.5 L910 1030.5 L912 1031.5 L919 1031.5 L920 1032.5 L919 1034 L917 1034 L915 1037 L915 1038.5 L917 1039.5 L918 1041.5 L925.5 1041.5 L925.5 1040.5 L928.5 1039.5 L930.5 1036.5 L934 1036.5 L937 1041.5 L943.5 1041.5 L943.5 1040.5 L945.5 1039.5 L945.5 1034.5 L952.5 1030.5 L955.5 1025.5 L960 1025.5 L961 1028.5 L964 1031.5 L969.5 1030.5 L969.5 1028.5 L971.5 1025.5 L975 1026.5 L975 1032 L973 1034 L971 1034 L965 1040 L964 1044 L961 1046 L959 1050 L955.5 1050 L954.5 1048 L950.5 1045 L946 1045 L944 1046 L941 1051 L938 1051 L934 1056 L929.5 1056 L925.5 1053 L921.5 1053 L920.5 1051 L918.5 1050 L918.5 1048 L916.5 1045 L912 1045 L908 1048 L906.5 1048 L903.5 1045 L901.5 1045 L900.5 1043.5 L902.5 1041.5 L908.5 1041.5 L909.5 1036 L907.5 1034 L902 1034 L897 1040Z M907 1017.5 L905 1020 L901 1020 L901 1022 L898 1026 L893.5 1025 L891.5 1020 L889.5 1019 L890.5 1016.5 L898.5 1015.5 L902.5 1013.5Z M978 1005.5 L979 1006.5 L977 1011 L977 1016.5 L978 1018 L972 1020 L968 1025 L963.5 1025 L962.5 1023 L960.5 1022 L959.5 1017.5 L960.5 1016.5 L967.5 1016.5 L971.5 1013.5 L971.5 1012 L968.5 1009 L963.5 1009 L962.5 1006.5 L963.5 1005.5Z M889.5 1006.5 L890.5 1005.5 L903 1005.5 L904 1006.5 L904 1011 L902.5 1012 L898.5 1009 L890.5 1009Z M962.5 997.5 L964.5 994.5 L977 994.5 L979 998 L975.5 1000 L974.5 999 L963.5 999Z M887.5 995.5 L888.5 994.5 L902 994.5 L906 998 L905 999 L888.5 999Z M1262.5 958.5 L1264 957.5 L1265 959 L1263.5 960Z M600.5 955.5 L605 954.5 L606 956.5 L610 959.5 L613 960.5 L621 960.5 L623 962.5 L633 963.5 L634 964.5 L672 963.5 L675 965.5 L676 967.5 L676 1031 L674 1034 L671 1035 L669.5 1034 L612 1034 L611 1035 L603.5 1035 L599.5 1032 L599.5 956.5Z M1263.5 946.5 L1265 947.5 L1265 953 L1264 954 L1262.5 953 L1262.5 947.5Z M1276.5 947.5 L1280.5 944.5 L1286 944.5 L1287 945.5 L1290 945.5 L1294 948.5 L1301 949.5 L1305 954.5 L1309 955.5 L1311 959.5 L1315 961.5 L1316 963.5 L1316 968.5 L1321 972.5 L1321 988 L1320 989 L1302.5 989 L1301.5 988 L1300.5 980 L1298.5 979 L1295.5 973 L1293.5 972 L1292.5 970 L1287.5 969 L1283.5 966 L1279.5 966 L1278.5 964 L1276.5 963Z M1004 947.5 L1005 949.5 L1005 962 L1001 965 L995 967 L994 969 L988 970 L988 971 L986 972 L986 974 L981 978 L979 984 L963.5 984 L960.5 982 L960.5 971.5 L965.5 965.5 L966.5 961.5 L971.5 957.5 L972.5 954.5 L976.5 953.5 L976.5 952.5 L980.5 949.5 L986.5 948.5 L988.5 946.5 L995.5 944.5 L1001 945.5Z M1027.5 946.5 L1030.5 943.5 L1249 943.5 L1254 947.5 L1254 963 L1251 966 L1248 967 L1030.5 967 L1027.5 964Z M864.5 946.5 L867.5 945.5 L869 943.5 L871 945.5 L878 946.5 L879 948.5 L887 949.5 L891 954.5 L893 954.5 L899 961.5 L901 965.5 L904 967.5 L904 971.5 L907 978.5 L907 982 L903 984 L888.5 984 L884.5 982 L883.5 975 L881.5 975 L880.5 972 L879.5 972 L877.5 969 L872.5 969 L864.5 964 L863.5 962 L863.5 949.5Z M767.5 944.5 L770.5 940.5 L777 940.5 L778 942.5 L781 942.5 L782 943.5 L784.5 942.5 L791.5 942.5 L793 941.5 L799 943.5 L800 945.5 L801.5 943.5 L804 944.5 L805.5 943.5 L836 943.5 L839 946.5 L839 962 L837 964 L805.5 964 L804.5 963 L801.5 964 L800.5 963 L800 952 L800 961 L796 964 L786.5 963 L784.5 961 L781 961 L780 963 L774.5 964 L772.5 963 L771.5 961 L768.5 960 L768.5 957 L767.5 956 L768.5 954.5 L767.5 952Z M588.5 912.5 L593 912.5 L594 913.5 L594 933 L592 935 L590.5 934 L590.5 930 L587.5 926 L587.5 922 L585.5 920Z M600.5 912.5 L604 911.5 L606 913.5 L610 921.5 L611 926.5 L612 926.5 L617 932.5 L619 932.5 L620 934.5 L629 934.5 L631 936.5 L631 951 L629 955 L616.5 955 L615.5 954 L612.5 954 L607.5 950 L603.5 949 L601.5 946 L599.5 945 L599.5 913.5Z M674 853.5 L676 856.5 L676 926 L674 930 L656.5 930 L655.5 929 L643.5 929 L641.5 927 L636 927 L635 929 L622.5 929 L618.5 924 L615.5 923 L615.5 879.5 L618.5 877.5 L620.5 874.5 L625.5 872.5 L629.5 872.5 L632.5 870.5 L634.5 867.5 L643.5 867.5 L645.5 864.5 L658.5 861.5 L661.5 858.5 L667.5 858.5 L672.5 853.5Z M520.5 853.5 L522 853.5 L523 855.5 L527 858.5 L533 858.5 L536 861.5 L539 861.5 L542 863.5 L548 864.5 L549 866.5 L551 867.5 L559 867.5 L560 869.5 L562 869.5 L565 872.5 L573 873.5 L574 875.5 L576 875.5 L580 880.5 L580 890 L579 891 L580 892.5 L580 896 L579 897 L580 922.5 L585 932.5 L585 937.5 L588 939.5 L589 942.5 L594 948.5 L594 1033 L590 1035 L587.5 1034 L526 1034 L525 1035 L521.5 1035 L519.5 1033 L518.5 1030 L518.5 856.5Z M518.5 826.5 L522 823.5 L526 827.5 L531 827.5 L537 832.5 L543 833.5 L544 835.5 L549 836.5 L559 842.5 L563 842.5 L569 847.5 L574 847.5 L578 850.5 L579 852.5 L587 853.5 L589 858.5 L591 859.5 L591 861.5 L592 861.5 L594 864.5 L594 886 L592 888 L589.5 888 L585.5 886 L584.5 875 L580.5 873 L576.5 868 L566.5 867 L565.5 865 L563.5 865 L559.5 862 L552.5 862 L550.5 859 L547.5 859 L544.5 857 L540.5 857 L537.5 856 L536.5 854 L529.5 853 L528.5 851 L526.5 851 L519.5 843 L519.5 840 L518.5 839Z M806.5 816.5 L809 817.5 L809 821 L808 822 L805.5 821 L805.5 817.5Z M801.5 814.5 L803 815.5 L803 821 L802 822 L800.5 821 L800.5 815.5Z M424.5 781.5 L432 783.5 L433 785.5 L437 785.5 L442 788.5 L444 788.5 L445 790.5 L449 791.5 L450 793.5 L453 794.5 L453 798.5 L454 799.5 L454 994.5 L455 995.5 L455 1040 L454 1041 L454 1044.5 L455 1045.5 L455 1050 L454 1051 L455 1075 L454 1076 L454 1092.5 L455 1093.5 L455 1116.5 L456 1117.5 L456 1182 L455 1183 L455 1206 L454 1207 L454 1228.5 L455 1230 L453 1231.5 L456.5 1231.5 L456.5 797.5 L457.5 796.5 L464 795.5 L465 797.5 L468 798.5 L470 801.5 L477 802.5 L478 804.5 L483 807.5 L489 808.5 L490 810.5 L500 813.5 L501 815.5 L503 816.5 L507 816.5 L512 820.5 L512 825.5 L513 826.5 L512 830 L512 846.5 L513 847.5 L513 876 L512 877 L513 878.5 L513 1019 L512 1020 L513 1022.5 L513 1033 L512 1034 L512 1040.5 L513 1041.5 L512 1045 L513 1046.5 L513 1100 L512 1101 L513 1102.5 L512 1105 L513 1107.5 L512 1110 L513 1113.5 L513 1118 L512 1119 L512 1126.5 L513 1127.5 L513 1168 L512 1169 L512 1172.5 L513 1173.5 L512 1175 L513 1201 L512 1202 L512 1221.5 L513 1222.5 L513 1230 L511 1234 L465 1234 L463.5 1235 L459.5 1233 L458 1234 L421.5 1234 L420.5 1233 L421 1231.5 L423.5 1231.5 L421.5 1230 L421.5 1221.5 L422.5 1220.5 L422.5 1216 L421.5 1215 L421.5 1189.5 L422.5 1188.5 L422.5 1184 L421.5 1183 L421.5 1170.5 L422.5 1169.5 L421.5 1166 L421.5 786.5Z M724.5 711.5 L727 713.5 L727 717 L725 720 L722.5 717 L722.5 713.5Z M591.5 707.5 L593 708.5 L592 712 L590.5 711Z M721.5 702.5 L723.5 700.5 L726 700.5 L729 703 L724.5 706Z M521.5 700.5 L525 700.5 L527 703.5 L531 705.5 L539 706.5 L540 708.5 L547 709.5 L549 711.5 L553 711.5 L555 713.5 L555 715.5 L557 716.5 L557 719.5 L559 720.5 L561 723.5 L567 723.5 L569 725.5 L581 725.5 L585 727.5 L585 743.5 L586 745.5 L588 746.5 L588 748.5 L591 752.5 L591 754.5 L594 757.5 L594 847 L592 850 L588.5 848 L583.5 848 L577.5 843 L570.5 842 L566.5 839 L565.5 837 L560.5 837 L558.5 836 L557.5 834 L548.5 831 L545.5 828 L542.5 828 L535.5 825 L534.5 823 L527.5 822 L526.5 820 L524.5 820 L522.5 817 L520.5 817 L517.5 813 L518.5 810.5 L518.5 702.5Z M591.5 697.5 L593 698.5 L593 703 L592 704 L590.5 703 L590.5 698.5Z M603.5 696.5 L605 697.5 L605 711 L602.5 712 L601.5 709.5 L602.5 708.5 L602.5 697.5Z M812 692.5 L813 693.5 L813 727 L812 728 L812 790 L811 792.5 L813 798 L807.5 805 L804.5 799 L805.5 787.5 L808.5 786.5 L808.5 696 L807.5 694.5 L809.5 692.5Z M660 691.5 L661 692.5 L661 699 L656 704 L654 704 L650 707 L650 711 L646 715 L643 716 L638.5 715 L636.5 710.5 L638.5 708.5 L640.5 702.5 L644.5 696.5 L650.5 694.5 L650.5 693.5 L654.5 690.5Z M724.5 686.5 L727 689.5 L727 694 L726 695 L724.5 695 L722.5 693 L722.5 690.5Z M457.5 678.5 L459 680.5 L460.5 680.5 L461.5 678.5 L464 678.5 L465 680.5 L469 680.5 L472 683.5 L478 684.5 L481 686.5 L484 686.5 L487 689.5 L492 689.5 L499 692.5 L501 694.5 L509 695.5 L510 697.5 L512 698.5 L512 703.5 L513 704.5 L513 713 L512 714 L513 717.5 L513 794 L512 795 L513 796.5 L513 808 L511 812 L504.5 811 L499.5 808 L498.5 806 L493.5 806 L491.5 803 L485.5 802 L478.5 797 L474.5 797 L468.5 792 L461.5 792 L460.5 791 L460.5 788 L456.5 785 L456.5 679.5Z M724.5 674.5 L729 676.5 L729 678 L727 679 L726 681 L722.5 680 L722.5 676.5Z M795 685.5 L802 691.5 L802 785 L797 786.5 L802 786.5 L803 788 L802 789 L797 789 L797 790.5 L800 792.5 L800 794 L799 795 L796 795 L797 797.5 L796 800 L793 800 L789 803 L776.5 803 L775 802 L773 803 L770 807 L768.5 806 L768.5 795 L767.5 794 L768.5 789 L764 789 L764 794.5 L765.5 793.5 L767 794.5 L767 932 L766 933 L764 932 L764 933 L760 936 L757.5 935 L757.5 933 L756 934 L746.5 934 L745.5 933 L690.5 933 L689.5 932 L685.5 932 L681.5 929 L681.5 722.5 L684.5 720.5 L714 720.5 L717 724.5 L718 728.5 L722 729.5 L724 731.5 L730.5 729.5 L736.5 722.5 L736.5 719 L734.5 716 L734.5 712.5 L735.5 711.5 L735.5 705 L734.5 704 L735.5 700.5 L735.5 694 L734.5 693 L735.5 681 L734.5 680 L734.5 676.5 L738.5 670.5 L741 670.5 L746 674.5 L759 675.5 L763 678.5 L767 678.5 L768 680.5 L777 680.5 L780 681.5 L781 683.5Z M425.5 666.5 L428 669.5 L435 669.5 L438 670.5 L439 672.5 L442 674.5 L450 675.5 L453 677.5 L453 681.5 L454 682.5 L454 695 L453 696 L454 698.5 L454 781 L452 783 L447.5 782 L444.5 780 L439.5 780 L434.5 775 L428.5 774 L427.5 772 L425.5 772 L423.5 769 L421.5 768 L421.5 668.5Z M714 664.5 L716 667.5 L716 711 L714 715 L678 715 L676 716 L676 840 L675 841 L675 844 L673 845 L668 851 L666 851 L664 853 L658 854 L655 857 L650 857 L647 859 L644 859 L641 862 L635 862 L624 868 L617 868 L617 869 L611 874 L608 882 L608 885 L604 888 L600.5 887 L599.5 886 L599.5 865.5 L601.5 864.5 L601.5 862.5 L604.5 859.5 L604.5 854 L602.5 853 L601.5 850 L599.5 849 L599.5 767.5 L602.5 765.5 L605 765.5 L608 768.5 L608 770 L605 772 L605 784.5 L606 785.5 L613 787.5 L628.5 787.5 L634.5 785.5 L635.5 784.5 L635.5 773 L632.5 771 L632.5 768.5 L634.5 766.5 L638.5 765.5 L638.5 764.5 L641.5 762.5 L642.5 760.5 L644.5 760.5 L644.5 758.5 L649.5 754.5 L650.5 748.5 L652.5 746.5 L652.5 743.5 L655.5 739.5 L655.5 711.5 L657.5 709.5 L670 709.5 L671 710.5 L675.5 709.5 L675.5 682 L674.5 681 L667 681 L663 684 L652 685 L646 690 L642 691 L642 692 L637 696 L636 700 L634 702 L634 705 L631 708 L631 712 L630 713 L630 742 L625 746 L613.5 746 L612.5 744 L610.5 743 L610.5 738 L609.5 737 L609.5 730.5 L610.5 729.5 L609.5 691.5 L611.5 686.5 L610.5 679 L609.5 678 L610.5 675.5 L614.5 672.5 L633 672.5 L634 673.5 L637.5 673.5 L639.5 672.5 L640.5 670.5 L640.5 663.5 L641.5 661.5 L644.5 659.5 L649 660.5 L650 663.5 L655 666.5 L659.5 666.5 L661.5 664.5 L665.5 663.5 L666.5 661.5 L666.5 656.5 L667.5 655.5 L669 655.5 L674 659.5 L677 659.5 L680 661.5 L682 664.5 L687.5 664.5 L693.5 659.5 L702 660.5 L709 664.5Z M724.5 649.5 L729 651.5 L726 656 L722.5 655 L722.5 651.5Z M559.5 640.5 L560.5 639.5 L565 639.5 L568 643.5 L575 644.5 L579 647.5 L580 649.5 L585 649.5 L587 650.5 L591 657.5 L594 660.5 L594 670 L591.5 672 L590.5 670 L588.5 670 L587.5 668 L582.5 666 L579 667 L561.5 667 L559.5 664Z M723.5 638.5 L726 638.5 L728 640.5 L726 644 L722.5 643 L722.5 639.5Z M726 624.5 L727 628 L724.5 631 L722.5 629 L722.5 626.5 L724.5 624.5Z M644.5 619.5 L646 619.5 L650 622.5 L650 653 L649 654 L642.5 654 L640.5 651 L640.5 626.5 L641.5 625.5 L641.5 622.5Z M521.5 619.5 L527 624.5 L532 624.5 L538 629.5 L542 629.5 L547 633.5 L550 633.5 L551 635.5 L554 636.5 L554 671.5 L557 673.5 L560.5 672.5 L579 672.5 L585 676.5 L585 680 L583 681 L583 689.5 L585 690.5 L585 713 L584 714 L581.5 714 L578.5 710 L575.5 710 L573.5 707 L571.5 707 L569.5 705 L561 705 L559 707 L554.5 707 L551.5 705 L544.5 704 L540.5 701 L530.5 699 L528.5 696 L520.5 695 L517.5 691 L518.5 689.5 L518.5 623.5Z M722.5 618 L722.5 614.5 L723.5 613.5 L726 613.5 L729 615.5 L726 619Z M801 599.5 L802 600.5 L802 678 L799 680 L786.5 679 L783.5 678 L782.5 676 L771.5 675 L767.5 673 L764.5 673 L760.5 670 L751.5 670 L748.5 668 L743.5 667 L742.5 665 L738.5 665 L734.5 660 L735.5 658.5 L734.5 651.5 L736.5 647.5 L734.5 642.5 L737.5 637.5 L740.5 635.5 L742.5 635.5 L743.5 633.5 L753.5 633.5 L755.5 632.5 L756.5 630.5 L759.5 630.5 L762.5 627.5 L762.5 624 L761.5 623 L762.5 619.5 L767.5 618.5 L767.5 617.5 L772.5 613.5 L775.5 613.5 L778.5 610.5 L785.5 607.5 L786.5 605.5 L791.5 604.5 L792.5 602.5 L797.5 599.5Z M723.5 599.5 L727 600.5 L727 605 L725 608 L722.5 605 L722.5 600.5Z M809.5 594.5 L812 597.5 L812 636.5 L813 637.5 L813 681 L810 684 L808.5 683 L807.5 680 L808.5 678.5 L808.5 595.5Z M457.5 592.5 L459 593.5 L464 592.5 L472 598.5 L478 599.5 L479 601.5 L483 602.5 L484 604.5 L488 604.5 L492 607.5 L499 609.5 L504 613.5 L508 613.5 L509 615.5 L512 617.5 L512 621.5 L513 622.5 L513 627 L512 628 L513 630.5 L513 686 L511 690 L504.5 690 L497.5 685 L488.5 684 L485.5 681 L483.5 681 L481.5 679 L475.5 679 L473.5 678 L472.5 676 L469.5 676 L468.5 675 L461.5 676 L460.5 675 L460.5 671 L456.5 669 L456.5 593.5Z M424.5 577.5 L426 577.5 L428 579.5 L432 579.5 L439 584.5 L443 584.5 L445 587.5 L447 588.5 L451 588.5 L454 593.5 L454 663.5 L455 666 L451 668 L447.5 667 L446.5 665 L443.5 664 L433.5 664 L432.5 661 L429.5 659 L425.5 659 L421.5 656 L421.5 581.5Z M809.5 517.5 L813 521.5 L812 523 L812 537 L811 538 L812 540.5 L812 570 L811 571 L812 581 L810 583 L808.5 582 L808.5 518.5Z M820.5 497.5 L823 499.5 L821 502 L818.5 500Z M806.5 497.5 L809 498.5 L808 502 L804.5 500Z M632 120.5 L633 122.5 L636 123.5 L636 661 L632 668 L630.5 667 L616.5 667 L612 665 L610 667 L608 667 L604 671 L602.5 671 L599.5 669 L599.5 661.5 L604.5 655.5 L604.5 650 L603.5 650 L601.5 647 L598.5 645 L591.5 646 L590.5 645 L582.5 644 L581.5 642 L576.5 639 L571.5 639 L570.5 637 L566.5 634 L563.5 634 L559.5 632 L559.5 156.5 L563.5 151.5 L570.5 150.5 L572.5 147.5 L576.5 147.5 L577.5 145.5 L580.5 145.5 L582.5 144.5 L583.5 142.5 L587.5 142.5 L591.5 139.5 L593.5 139.5 L595.5 136.5 L601.5 136.5 L601.5 135.5 L606.5 131.5 L613.5 130.5 L613.5 129.5 L619.5 125.5 L624.5 125.5 L626.5 122.5 L629.5 122.5 L630.5 120.5Z M711.5 81 L701 81 L700 83 L696 84 L694 86 L691 86 L689 91.5 L697.5 91.5 L700.5 88.5 L703.5 88.5 L705.5 85.5 L709.5 85.5 L709.5 84.5 L711.5 83.5Z M757.5 55 L755 56 L754 58 L749 59 L748 61 L744 61 L742 64 L737 64 L736 66 L732 67 L732 68 L729 70 L727 70 L727 74.5 L734.5 74.5 L734.5 72.5 L735.5 71.5 L738.5 71.5 L739.5 69.5 L743.5 69.5 L745.5 68.5 L746.5 66.5 L751.5 65.5 L753.5 63.5 L757.5 63.5Z M790.5 47 L777 47 L776 50 L769 50 L766 56 L760 56 L760 60.5 L766 60.5 L767 61.5 L767 503.5 L768.5 503.5 L768.5 162 L767.5 161 L767.5 108.5 L768.5 107.5 L768.5 100 L767.5 99 L767.5 68.5 L768.5 67 L767.5 64.5 L768.5 63.5 L768.5 57.5 L770.5 55.5 L778.5 54.5 L779.5 52.5 L784.5 51.5 L785.5 49.5 L790.5 49.5Z M845.5 17 L842 16 L838 19 L833 19 L833 20 L829 22 L828 24 L823 24 L817 28 L816 30 L809 30 L808 33 L805 33 L802 35 L797 36 L796 38.5 L799 38.5 L803 43.5 L804.5 43.5 L804.5 41.5 L807.5 38.5 L809.5 38.5 L811.5 35.5 L818.5 34.5 L821.5 32.5 L823.5 29.5 L830.5 29.5 L834.5 24.5 L842.5 23.5Z";

// De acht nummers uit de figuur, met de naam van het onderdeel (legenda N48 figuur 2).
const OZ_PLEKKEN = [
  { id: "n1", nr: 1, naam: "de afvoer van condenswater uit de binnenbuis" },
  { id: "n2", nr: 2, naam: "de sifon voor de afvoer van condenswater" },
  { id: "n3", nr: 3, naam: "de afvoer van regenwater uit de trechter" },
  { id: "n4", nr: 4, naam: "het bouwkundige inspectieluik" },
  { id: "n5", nr: 5, naam: "het inspectieluik van het luchttoevoerkanaal" },
  { id: "n6", nr: 6, naam: "het inspectieluik van het rookgasafvoerkanaal" },
  { id: "n7", nr: 7, naam: "de sifon voor regen- en condenswater, buiten de schacht" },
  { id: "n8", nr: 8, naam: "de open verbinding naar het riool" },
];

// Spelonderdelen (data-spel): open luik, stromend of stilstaand water.
function OnderzijdeSVG({ luikOpen, sifon2, sifon7 }) {
  const L = C.brownText;
  const stroom = { strokeDasharray: "18 14", animation: "flowDash 0.9s linear infinite" };
  return (
    <svg viewBox={`0 0 ${OZ_W} ${OZ_H}`} className="w-full h-auto select-none" aria-label="Onderzijde van het CLV met inspectieluiken en sifons">
      <rect width={OZ_W} height={OZ_H} fill="white" />
      {OZ_WANDEN.map(([x0, y0, x1, y1]) => (
        <rect key={`${x0}-${y0}`} x={x0 + 3} y={y0 + 3} width={x1 - x0 - 6} height={y1 - y0 - 6} fill="#808080" stroke={L} strokeWidth="7" />
      ))}
      <path d={OZ_LIJNEN} fill={L} fillRule="evenodd" />
      {luikOpen && (
        <g data-spel="luik-open">
          <rect x="807" y="478" width="36" height="352" fill="white" />
          <rect x="762" y="507" width="42" height="279" fill="#3a3a3a" />
          <polygon points="808,492 930,560 930,740 808,812" fill="white" stroke={L} strokeWidth="6" />
        </g>
      )}
      {sifon2 === "ok" && <path data-spel="water" d="M597 660 V760 Q620 792 648 762 V700 H672" fill="none" stroke="#3B82F6" strokeWidth="9" style={stroom} />}
      {sifon2 === "niet" && <ellipse data-spel="water" cx="622" cy="742" rx="34" ry="20" fill="#3B82F6" opacity="0.55" />}
      {sifon7 === "ok" && (
        <path
          data-spel="water"
          d="M596 880 V930 Q600 948 640 948 H850 Q880 950 885 990 Q895 1050 930 1050 Q968 1050 975 990 Q980 950 1010 948 H1280 Q1305 950 1305 990 M1305 1030 V1075 H1650"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="9"
          style={stroom}
        />
      )}
      {sifon7 === "niet" && <ellipse data-spel="water" cx="930" cy="1028" rx="44" ry="22" fill="#3B82F6" opacity="0.55" />}
    </svg>
  );
}

// ─── RONDE 3: ONDERHOUD VAN HET CLV ───
// Flat De Linde wordt tijdelijk doorgebruikt; dit is de periodieke controle uit het beheerplan.

// Stap 1: CO-meetplekken (8.3-01)
const CO_PLEKKEN = [
  { id: "rga", label: "Rookgasafvoer", goed: true, waarom: "De rookgasafvoer is een van de drie vaste CO-meetplekken uit het beheerplan." }, // 8.3-01
  { id: "ltv", label: "Luchttoevoer", goed: true, waarom: "Lekt er rookgas in het kanaal, dan kan het in de luchttoevoer komen (recirculatie)." }, // 8.3-01, 5.3a-03
  { id: "ruimte", label: "Opstellingsruimte", goed: true, waarom: "Hier hangt de ketel. Rookgas hoort hier niet te komen." }, // 8.3-01, 6.1-1-01 c
  { id: "dak", label: "Bij de kap op het dak", goed: false },
  { id: "trap", label: "In het trappenhuis", goed: false },
  { id: "schacht", label: "In de schacht naast het kanaal", goed: false },
];

const WONINGEN_KEUZE = {
  opties: [
    { id: "goed", tekst: "In elke woning van de strang. Elke meting leg je vast." },
    { id: "klacht", tekst: "Alleen in de woning waar een klacht is. Die meting leg je vast." },
    { id: "boven", tekst: "Alleen in de bovenste woning. Die meting leg je vast." },
  ],
  waarom: "Het beheerplan vraagt periodieke CO-metingen in elke woning. Je legt ze allemaal vast.", // 8.3-01
  fout: {
    klacht: "Het beheerplan vraagt metingen in elke woning, ook waar geen klacht is.",
    boven: "Het beheerplan vraagt metingen in elke woning, niet alleen bovenin.",
  },
  aandacht: "CO meten doe je in elke woning; elke meting leg je vast",
};

// Bevinding uit de metingen: CO in de luchttoevoer of in de opstellingsruimte van woning 3.
function maakBevinding() {
  return Math.random() < 0.5 ? "ltv" : "ruimte";
}
const BEVINDING_OPTIES = [
  { id: "goed", tekst: "Er lekt waarschijnlijk rookgas. Dan voldoet het CLV niet meer aan de voorwaarden voor doorgebruik: vastleggen en melden aan de eigenaar (VvE)." },
  { id: "later", tekst: "Vastleggen en bij de volgende periodieke controle opnieuw meten." },
  { id: "normaal", tekst: "Vastleggen; op deze meetplek is een beetje CO normaal." },
];
const BEVINDING_UITLEG = {
  // 5.3a-03, 6.1-1-01, 6.1-3-01
  ltv: "CO in de luchttoevoer wijst op rookgaslekkage in het kanaal: rookgas komt in de lucht naar de ketels (recirculatie). Met rookgaslekkage voldoet het CLV niet meer voor tijdelijk doorgebruik.",
  // 6.1-1-01 c, 6.1-3-01
  ruimte: "Rookgas in de opstellingsruimte is een van de zeven controles voor doorgebruik. Dan voldoet het CLV niet meer aan de voorwaarden; dat leg je vast en meld je aan de eigenaar.",
};

// Stap 2: terugslagklep (8.3-02, 5.2b-02, 5.2b-03, 5.2b-04)
const KLEP_VRAGEN = [
  {
    id: "nieuw",
    wie: "Woning 2",
    situatie: "heeft de nieuwe ketel van vorig jaar, met een terugslagklep in de aansluitleiding.",
    opdracht: "Kies hoe je de klep controleert.",
    opties: [
      { id: "goed", tekst: "Kijken of de klep er zit en bij deze ketel hoort. Onderhoud volgens de instructie in de handleiding van de ketel." },
      { id: "ander", tekst: "Gaat hij stroef, dan een klep van een ander ketelmerk met dezelfde diameter erin zetten." },
      { id: "kijken", tekst: "Alleen kijken of hij er zit. Voor het onderhoud van een klep bestaat geen instructie." },
    ],
    waarom: "De klep zit in de aansluitleiding en hoort bij de ketel. Het onderhoud staat in de handleiding van de ketel.", // 8.3-02, 5.3b-01
    fout: {
      ander: "Een klep hoort bij de ketel; een klep van een ander merk is geen vervanging. Onderhoud volgens de handleiding van de ketel.",
      kijken: "De handleiding van de ketel heeft een onderhoudsinstructie voor de klep. Die volg je.",
    },
    aandacht: "Terugslagklep: aanwezig en bij de ketel horend; onderhoud volgens de handleiding van de ketel",
  },
  {
    id: "oud",
    wie: "Woning 4",
    situatie: "heeft nog een oude ketel. Je ziet geen terugslagklep.",
    opdracht: "Kies wat je doet.",
    opties: [
      { id: "goed", tekst: "Noteren en melden. Een klep plaats je alleen als de fabrikant van de ketel zegt dat hij geschikt is." },
      { id: "zelf", tekst: "Zelf een klep met dezelfde diameter plaatsen; dat is veiliger dan geen klep." },
      { id: "niets", tekst: "Niets noteren: de oude ketel werkt nog zonder storing." },
    ],
    waarom: "Oudere ketels hebben niet altijd een terugslagklep en dat kan problemen geven. Een klep komt er alleen in als de fabrikant van de ketel hem geschikt vindt.", // 5.2b-03, 5.2b-04
    fout: {
      zelf: "Eerst de fabrikant van de ketel: die moet de klep geschikt vinden. Pas dan plaats je hem.",
      niets: "Een ketel zonder klep kan op een collectief systeem problemen geven, ook als hij werkt. Noteer en meld het.",
    },
    aandacht: "Geen klep bij een oude ketel: melden; een klep alleen als de ketelfabrikant hem geschikt vindt",
  },
];

// Stap 3: onderzijde (8.3-03, 8.3-04, 8.3-05, 5.2a-02, 5.2a-04, 5.2d-01, 6.1-1-01 g)
const OZ_TAKEN_VAST = {
  id: "toegang", doel: "n4", tekst: "Open de toegang tot de kanalen.",
  waarom: "Het zit in de schachtwand en is minimaal 50 x 50 cm. Daarachter zitten de luikjes op de kanalen.",
};
const OZ_TAKEN = [
  {
    id: "lucht", doel: "n5", tekst: "Kijk in het luchttoevoerkanaal.",
    waarom: "Zo bekijk je het luchtkanaal van binnen zonder leidingen in de woning los te halen.",
  },
  {
    id: "rook", doel: "n6", tekst: "Kijk in het rookgasafvoerkanaal.",
    waarom: "Zo doe je de inwendige controle van het rookgaskanaal: je let op zichtbare gebreken.",
  },
  {
    id: "sifon2", doel: "n2", tekst: "Controleer de sifon onder het rookgaskanaal.", sifon: true,
    waarom: "Hij moet bereikbaar zijn voor onderhoud en inspectie. Je giet er water in.",
  },
  {
    id: "sifon7", doel: "n7", tekst: "Controleer de sifon buiten de schacht.", sifon: true,
    waarom: "Ook deze sifon moet bereikbaar zijn. Je giet er water in.",
  },
];
const SIFON_WAARNEMING = {
  ok: "Je giet water in. Na een minuut is het weggelopen; via de open verbinding valt het naar het riool.",
  niet: "Je giet water in. Na twee minuten staat het nog tot de rand in de sifon.",
};

// Stap 4: de vier onderhoudspunten benoemen (eindterm 8.3)
const PUNTEN_8_3 = [
  { id: "co", goed: true, tekst: "CO meten in rookgasafvoer, luchttoevoer en opstellingsruimte; alles vastleggen" },
  { id: "klep", goed: true, tekst: "Terugslagklep controleren volgens de handleiding van de ketel" },
  { id: "condens", goed: true, tekst: "Condensafvoer controleren: werkt hij en zijn beide sifons bereikbaar" },
  { id: "visueel", goed: true, tekst: "Visuele inspectie, ook van binnen via het bouwkundige luik en de luikjes op de kanalen" },
  { id: "verf", goed: false, tekst: "De ventilatoren van de ketels hoger afstellen voor meer trek" },
  { id: "univ", goed: false, tekst: "Bij elke ketel een losse terugslagklep van de groothandel bijplaatsen" },
  { id: "c10", goed: false, tekst: "De ketels een voor een vervangen door C(10)-ketels" },
];

// Stap 3: de speler kiest per taak het nummer uit de figuur (knoppen 1 t/m 8 in de balk).
function OnderzijdeStap({ beoordeel, noteer, onDone }) {
  const [taken] = useState(() => [OZ_TAKEN_VAST, ...schud(OZ_TAKEN)]);
  // per sifon: werkt hij of niet (elke beurt anders)
  const [sifonOk] = useState(() => ({ n2: Math.random() < 0.6, n7: Math.random() < 0.6 }));
  const [nr, setNr] = useState(0);
  const [klaar, setKlaar] = useState([]);
  const [fout, setFout] = useState([]);
  const [fb, setFb] = useState(null);
  const [oordeelVoor, setOordeelVoor] = useState(null); // sifon die nu beoordeeld wordt
  const [oordeelFout, setOordeelFout] = useState([]);
  const [beoordeeld, setBeoordeeld] = useState({}); // n2/n7 -> "ok" | "niet"
  const taak = taken[nr];
  const luikOpen = klaar.includes("n4");

  const kiesNummer = (p, e) => {
    if (!taak || oordeelVoor || klaar.includes(p.id) || fout.includes(p.id)) return;
    if (p.id === taak.doel) {
      beoordeel("goed", punt(e));
      setKlaar((k) => [...k, p.id]);
      setFout([]);
      setFb({ goed: true, tekst: `${p.nr} is ${p.naam}. ${taak.waarom}` });
      if (taak.sifon) {
        setOordeelVoor(p.id);
        setOordeelFout([]);
      } else {
        setNr((n) => n + 1);
      }
      return;
    }
    beoordeel("fout", punt(e));
    setFout((f) => [...f, p.id]);
    if (!luikOpen && ["n1", "n2", "n5", "n6"].includes(p.id)) {
      noteer("Je komt bij de luikjes op de kanalen via het bouwkundige inspectieluik in de schachtwand");
      setFb({ goed: false, tekst: `${p.nr} is ${p.naam}. Daar kom je pas bij als het bouwkundige inspectieluik open is.` });
    } else {
      noteer("Ken de nummers van de onderzijde: bouwkundig luik, luikjes op lucht- en rookgaskanaal, twee sifons");
      setFb({ goed: false, tekst: `${p.nr} is ${p.naam}. De opdracht was: ${taak.tekst.toLowerCase()}` });
    }
  };

  const oordeelSifon = (zegtOk, e) => {
    const werkt = sifonOk[oordeelVoor];
    if (zegtOk === werkt) {
      beoordeel("goed", punt(e));
      setBeoordeeld((b) => ({ ...b, [oordeelVoor]: werkt ? "ok" : "niet" }));
      setFb({
        goed: true,
        tekst: werkt
          ? "De condensafvoer werkt nog voldoende en de sifon is bereikbaar." // 8.3-03
          : "Deze sifon voert niet voldoende af. Dat leg je vast en meld je: de condensafvoer moet nog voldoende werken.", // 8.3-03, 6.1-1-01 f
      });
      setOordeelVoor(null);
      setNr((n) => n + 1);
      if (nr === taken.length - 1) playSound("levelup");
    } else {
      beoordeel("fout", punt(e));
      noteer("Condensafvoer: werkt hij nog voldoende en zijn beide sifons bereikbaar");
      setOordeelFout((f) => [...f, zegtOk ? "ok" : "niet"]);
      setFb({ goed: false, tekst: werkt ? "Het water loopt binnen een minuut weg: dat is voldoende." : "Blijft het water staan, dan werkt de afvoer niet voldoende." });
    }
  };

  const sifonStand = (id) => (oordeelVoor === id ? (sifonOk[id] ? "ok" : "niet") : beoordeeld[id] ?? null);

  return (
    <>
      <OpdrachtKop
        titel="Ronde 3: Onderhoud van het CLV"
        stap={3}
        stappen={4}
        opdracht={oordeelVoor ? "Beoordeel de sifon." : taak ? `${taak.tekst} Kies het nummer uit de tekening.` : "Alles gecontroleerd."}
        teller={`${Math.min(nr, taken.length)} van ${taken.length}`}
      />
      <div className="w-full max-w-2xl flex flex-col gap-3 items-center">
        <div className="w-full max-w-[640px]">
          <OnderzijdeSVG luikOpen={luikOpen} sifon2={sifonStand("n2")} sifon7={sifonStand("n7")} />
        </div>
      </div>
      <VasteBalk>
        {oordeelVoor ? (
          <>
            <div className="rounded-lg px-3 py-2 text-sm italic" style={{ backgroundColor: "#FDF4E9", color: C.brownText }}>
              Wat je ziet: {SIFON_WAARNEMING[sifonOk[oordeelVoor] ? "ok" : "niet"]}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "ok", tekst: "Werkt voldoende" },
                { id: "niet", tekst: "Werkt niet voldoende" },
              ].map((k) => (
                <button
                  key={k.id}
                  disabled={oordeelFout.includes(k.id)}
                  onClick={(e) => oordeelSifon(k.id === "ok", e)}
                  data-goed={qaGoed((k.id === "ok") === sifonOk[oordeelVoor])}
                  className="min-h-[48px] rounded-xl border-2 text-sm font-bold"
                  style={{
                    backgroundColor: oordeelFout.includes(k.id) ? C.redLight : "white",
                    borderColor: oordeelFout.includes(k.id) ? C.red : k.id === "ok" ? C.green : C.amber,
                    color: C.brownText,
                  }}
                >
                  {k.tekst}
                </button>
              ))}
            </div>
          </>
        ) : taak ? (
          <>
            <p className="text-sm font-bold" style={{ color: C.brownText }}>{taak.tekst} Welk nummer?</p>
            <div className="grid grid-cols-4 gap-2">
              {OZ_PLEKKEN.map((p) => {
                const isKlaar = klaar.includes(p.id);
                const isFout = fout.includes(p.id);
                return (
                  <button
                    key={p.id}
                    disabled={isKlaar || isFout}
                    onClick={(e) => kiesNummer(p, e)}
                    data-goed={qaGoed(p.id === taak.doel)}
                    aria-label={`nummer ${p.nr}`}
                    className="min-h-[48px] rounded-xl border-2 text-lg font-bold"
                    style={{
                      backgroundColor: isKlaar ? C.greenLight : isFout ? C.redLight : "white",
                      borderColor: isKlaar ? C.green : isFout ? C.red : C.brownText,
                      color: C.brownText,
                    }}
                  >
                    {p.nr}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        <Terugkoppeling fb={fb} />
        {!taak && (
          <GameButton onClick={onDone} className="w-full">
            Naar de laatste stap
          </GameButton>
        )}
      </VasteBalk>
    </>
  );
}

function BenoemStap({ beoordeel, noteer, onDone }) {
  const [opties] = useState(() => schud(PUNTEN_8_3));
  const [gekozen, setGekozen] = useState([]);
  const [fout, setFout] = useState([]);
  const [fb, setFb] = useState(null);
  const klaar = gekozen.length === 4;
  const kiesPunt = (o, e) => {
    if (o.goed) {
      beoordeel("goed", punt(e));
      const nieuw = [...gekozen, o.id];
      setGekozen(nieuw);
      setFb({ goed: true, tekst: nieuw.length < 4 ? `Dat hoort erbij. Nog ${4 - nieuw.length} te gaan.` : "Dit zijn de vier onderhoudspunten uit de eindterm." });
      if (nieuw.length === 4) playSound("levelup");
    } else {
      beoordeel("fout", punt(e));
      noteer("Onderhoud CLV: CO meten en vastleggen, klep volgens ketelhandleiding, condensafvoer en sifons, visuele inspectie");
      setFout((f) => [...f, o.id]);
      setFb({ goed: false, tekst: "Dit hoort niet bij het onderhoud. De vier punten: CO meten en vastleggen, klep, condensafvoer met beide sifons en visuele inspectie." });
    }
  };
  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop titel="Ronde 3: Onderhoud van het CLV" stap={4} stappen={4} opdracht="Tik de 4 punten aan die bij het onderhoud van een CLV horen." teller={`${gekozen.length} van 4`} />
      <div className="w-full max-w-2xl">
        <Keuzes opties={opties} fout={fout} goedIds={gekozen} klaar={klaar} juist={PUNTEN_8_3.filter((p) => p.goed).map((p) => p.id)} onKies={kiesPunt} />
      </div>
      {fb && (
        <VasteBalk>
          <Terugkoppeling fb={fb} />
          {klaar && (
            <GameButton onClick={onDone} variant="green" className="w-full">
              Naar de controlevragen
            </GameButton>
          )}
        </VasteBalk>
      )}
    </div>
  );
}

function Ronde3({ beoordeel, onDone, noteer, zonderIntro, startStap }) {
  const [gestart, setGestart] = useState(zonderIntro);
  const [stap, setStap] = useState(startStap >= 1 && startStap <= 4 ? startStap : 1);
  // stap 1
  const [chips] = useState(() => schud(CO_PLEKKEN));
  const [logboek, setLogboek] = useState([]);
  const [woningOpties] = useState(() => schud(WONINGEN_KEUZE.opties));
  const [woningFout, setWoningFout] = useState([]);
  const [woningGoed, setWoningGoed] = useState(null);
  const [bevinding] = useState(maakBevinding);
  const [bevOpties] = useState(() => schud(BEVINDING_OPTIES));
  const [bevFout, setBevFout] = useState([]);
  const [bevGoed, setBevGoed] = useState(null);
  const [naarBevinding, setNaarBevinding] = useState(false);
  // stap 2
  const [klepNr, setKlepNr] = useState(0);
  const [fb, setFb] = useState(null);

  useEffect(() => {
    naarBoven();
  }, [stap, gestart, klepNr]);

  const dropLog = (payload, pt) => {
    const chip = CO_PLEKKEN.find((c) => c.id === payload);
    if (!chip || logboek.includes(chip.id)) return undefined;
    if (chip.goed) {
      setLogboek((l) => [...l, chip.id]);
      beoordeel("goed", pt);
      setFb({ goed: true, tekst: chip.waarom });
      playSound("drop");
      return "correct";
    }
    beoordeel("fout", pt, { slepen: true });
    noteer("CO meten volgens het beheerplan: rookgasafvoer, luchttoevoer en opstellingsruimte");
    setFb({ goed: false, tekst: `${chip.label} staat niet in het beheerplan. De drie meetplekken zijn de rookgasafvoer, de luchttoevoer en de opstellingsruimte.` });
    return "wrong";
  };

  const kiesWoning = (o, e) => {
    if (o.id === "goed") {
      beoordeel("goed", punt(e));
      setWoningGoed(o.id);
      setFb({ goed: true, tekst: WONINGEN_KEUZE.waarom });
    } else {
      beoordeel("fout", punt(e));
      noteer(WONINGEN_KEUZE.aandacht);
      setWoningFout((f) => [...f, o.id]);
      setFb({ goed: false, tekst: WONINGEN_KEUZE.fout[o.id] });
    }
  };

  const kiesBevinding = (o, e) => {
    if (o.id === "goed") {
      beoordeel("goed", punt(e));
      setBevGoed(o.id);
      setFb({ goed: true, tekst: BEVINDING_UITLEG[bevinding] });
    } else {
      beoordeel("fout", punt(e));
      noteer("CO in de luchttoevoer of rookgas in de opstellingsruimte: dan voldoet het CLV niet meer voor doorgebruik; melden aan de eigenaar");
      setBevFout((f) => [...f, o.id]);
      setFb({ goed: false, tekst: `${BEVINDING_UITLEG[bevinding]} De eigenaar moet dat weten.` });
    }
  };

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 3: Onderhoud van het CLV" intro="Flat De Linde, een jaar later. Het oude CLV wordt nog tijdelijk doorgebruikt." onStart={() => setGestart(true)}>
        <UitlegItem term="Onderkant aangepast">
          {/* 5.2c-03 */}
          bij tijdelijk doorgebruik wordt een bestaande trekonderbreker onderaan (als die er is) vakkundig afgesloten en krijgt hij een condensafvoer, zoals in de tekening van deze ronde.
        </UitlegItem>
        <UitlegItem term="CO meten">
          {/* 8.3-01 */}
          volgens het beheerplan in de rookgasafvoer, de luchttoevoer en de opstellingsruimte, in elke woning. Elke meting leg je vast.
        </UitlegItem>
        <UitlegItem term="Klep en onderkant">
          {/* 8.3-02, 5.3b-01, 8.3-03, 8.3-05, 5.2a-04 */}
          de terugslagklep onderhoud je volgens de handleiding van de ketel. Via het bouwkundige luik kom je bij de luikjes op de kanalen en bij de condensafvoer met twee sifons.
        </UitlegItem>
      </RondeIntro>
    );
  }

  if (stap === 4) return <BenoemStap beoordeel={beoordeel} noteer={noteer} onDone={onDone} />;

  if (stap === 3) {
    return (
      <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
        <OnderzijdeStap beoordeel={beoordeel} noteer={noteer} onDone={() => setStap(4)} />
      </div>
    );
  }

  if (stap === 2) {
    const v = KLEP_VRAGEN[klepNr];
    return (
      <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
        <OpdrachtKop titel="Ronde 3: Onderhoud van het CLV" stap={2} stappen={4} opdracht={v.opdracht} teller={`${klepNr + 1} van ${KLEP_VRAGEN.length}`} />
        <KlusKeuze
          key={v.id}
          klus={v}
          beoordeel={beoordeel}
          noteer={noteer}
          onKlaar={() => {
            if (klepNr + 1 < KLEP_VRAGEN.length) setKlepNr((n) => n + 1);
            else setStap(3);
          }}
        />
      </div>
    );
  }

  const logVol = logboek.length === 3;
  const opdracht = !logVol
    ? "Sleep (of tik) de 3 CO-meetplekken uit het beheerplan naar het logboek."
    : !naarBevinding
      ? "Kies in welke woningen je meet."
      : "Beoordeel wat je in woning 3 meet.";
  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <OpdrachtKop titel="Ronde 3: Onderhoud van het CLV" stap={1} stappen={4} opdracht={opdracht} teller={!logVol ? `${logboek.length} van 3` : null} />
      <div className="w-full max-w-2xl flex flex-col gap-3">
        <DropTarget id="logboek" onDropItem={dropLog} actief={!logVol}>
          {({ isHover, flash }) => (
            <div
              data-vak={qaWaarde("logboek")}
              className="rounded-2xl border-2 border-dashed p-3 flex flex-col gap-2"
              style={{
                borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
                backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
              }}
            >
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4" style={{ color: C.olive }} />
                <span className="text-sm font-bold" style={{ color: C.brownText }}>
                  Logboek CO-metingen{woningGoed ? ", woning 3" : ""}
                </span>
              </div>
              {[0, 1, 2].map((i) => {
                const id = logboek[i];
                const chip = CO_PLEKKEN.find((c) => c.id === id);
                const meting = woningGoed && chip ? (chip.id === bevinding ? "CO aangetroffen" : "geen CO") : "meetplek ...";
                const alarm = woningGoed && chip && chip.id === bevinding;
                return (
                  <div
                    key={i}
                    className="rounded-lg border-2 px-3 py-2 text-sm flex items-center gap-2 min-h-[44px]"
                    style={{
                      borderColor: alarm ? C.red : chip ? C.green : C.beigeMid,
                      backgroundColor: alarm ? C.redLight : chip ? C.greenLight : "white",
                      color: alarm ? C.red : chip ? C.green : C.brown,
                    }}
                  >
                    <span className="font-bold">{i + 1}.</span>
                    {chip ? (
                      <span className="font-bold">
                        {chip.label}
                        {woningGoed ? `: ${meting}` : ""}
                      </span>
                    ) : (
                      <span className="italic">{meting}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DropTarget>
        {!logVol && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {chips
              .filter((c) => !logboek.includes(c.id))
              .map((c) => (
                <Draggable key={c.id} payload={c.id} ghost={<DragCard label={c.label} small />}>
                  <div
                    data-kaart={qaWaarde(c.goed ? "logboek" : "nee")}
                    className="rounded-xl px-2 py-2.5 min-h-[48px] text-sm font-bold border-2 text-white text-center flex items-center justify-center"
                    style={{ backgroundColor: C.olive, borderColor: C.oliveDark }}
                  >
                    {c.label}
                  </div>
                </Draggable>
              ))}
          </div>
        )}
        {logVol && !woningGoed && (
          <div className="flex flex-col gap-2">
            <Situatie wie="De strang">heeft vier woningen.</Situatie>
            <Keuzes opties={woningOpties} fout={woningFout} goedId={woningGoed} juist={["goed"]} onKies={kiesWoning} />
          </div>
        )}
        {naarBevinding && (
          <div className="flex flex-col gap-2">
            <Situatie wie="Woning 3:">
              {bevinding === "ltv" ? "je meter vindt CO in de luchttoevoer." : "je meter vindt CO in de opstellingsruimte."} Wat betekent dit?
            </Situatie>
            <Keuzes opties={bevOpties} fout={bevFout} goedId={bevGoed} juist={["goed"]} onKies={kiesBevinding} />
          </div>
        )}
      </div>
      {fb && (
        <VasteBalk>
          <Terugkoppeling fb={fb} />
          {woningGoed && !naarBevinding && (
            <GameButton onClick={() => { setNaarBevinding(true); setFb(null); }} className="w-full">
              Verder: de metingen in woning 3
            </GameButton>
          )}
          {bevGoed && (
            <GameButton onClick={() => { setStap(2); setFb(null); }} className="w-full">
              Naar de terugslagklep
            </GameButton>
          )}
        </VasteBalk>
      )}
    </div>
  );
}

// ─── CONTROLEVRAGEN (pools van minstens 6; per ronde twee verschillende) ───
// R2: vragen met `klus` komen alleen als die klus gespeeld is.

const POOL_R1 = [
  {
    question: "Wat is de verwachte levensduur van een rookgasafvoer (RGAV)?", // 6.1-1-03
    options: ["Circa 15 jaar", "Circa 5 jaar", "Circa 30 jaar", "Onbeperkt, zolang er geen storing is"],
    correct: 0,
    feedbackCorrect: "Klopt. Een rookgasafvoer gaat circa 15 jaar mee.",
    feedbackWrong: "De verwachte levensduur van een rookgasafvoer is circa 15 jaar.",
    aandacht: "Een rookgasafvoer gaat circa 15 jaar mee",
  },
  {
    question: "Een CLV is 18 jaar oud en alle zeven controles zijn in orde. Wat kan er?", // 6.1-2-04, 6.1-3-01
    options: [
      "Tijdelijk doorgebruik onder strikte voorwaarden, met een plan met de eigenaar",
      "Niets: na circa 15 jaar moet het CLV dezelfde dag uit bedrijf",
      "Het CLV mag zonder voorwaarden blijven tot er klachten komen",
      "Alleen de ketels vervangen; het kanaal hoeft nooit te worden aangepakt",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Ouder dan circa 15 jaar en alles in orde: tijdelijk doorgebruik onder voorwaarden.",
    feedbackWrong: "Ouder dan circa 15 jaar maar alle zeven controles in orde: tijdelijk doorgebruik kan, onder strikte voorwaarden en met een plan met de eigenaar.",
    aandacht: "Ouder dan circa 15 jaar en alles in orde: tijdelijk doorgebruik onder voorwaarden",
  },
  {
    question: "Een CLV is 18 jaar oud. Er komt rookgas in een opstellingsruimte. Kan het tijdelijk door?", // 6.1-1-01 c, 6.1-1-02
    options: [
      "Nee, een controle is niet in orde; het CLV is niet herbruikbaar",
      "Ja, als er CO-melders in elke woning komen",
      "Ja, als de ketel in die woning wordt vervangen",
      "Ja, tijdelijk doorgebruik hangt alleen af van de leeftijd",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Tijdelijk doorgebruik kan alleen als alle zeven controles in orde zijn.",
    feedbackWrong: "Rookgas in de opstellingsruimte is een van de zeven controles. Is die niet in orde, dan kan tijdelijk doorgebruik niet.",
    aandacht: "Is een van de zeven controles niet in orde, dan kan tijdelijk doorgebruik niet",
  },
  {
    question: "De ketel is 3 jaar oud, het CLV 18 jaar. Wat bepaalt de aanpak?", // 6.1-2-01
    options: ["De leeftijd van de rookgasafvoer", "De leeftijd van de ketel", "De gemiddelde leeftijd van beide", "Wat de bewoner het liefst wil"],
    correct: 0,
    feedbackCorrect: "Klopt. Lopen ketel en afvoer niet gelijk, dan gaat de leeftijd van de afvoer voor.",
    feedbackWrong: "Lopen ketel en afvoer niet gelijk, dan bepaalt de leeftijd van de rookgasafvoer de aanpak.",
    aandacht: "De leeftijd van de rookgasafvoer gaat voor die van de ketel",
  },
  {
    question: "Je wilt het rookgas- en luchtkanaal van binnen bekijken. Hoe moet dat kunnen?", // 6.1-1-01 g
    options: [
      "Via het inspectieluik, zonder leidingen in de woning te demonteren",
      "Door de aansluitleiding bij een ketel los te halen",
      "Door een gat in de schachtwand te boren",
      "Via de kap op het dak, met een camera aan een kabel",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De kanalen moeten van binnen te bekijken zijn zonder leidingen in de woning te demonteren.",
    feedbackWrong: "Je moet in beide kanalen kunnen kijken zonder leidingen in de opstellingsruimte te demonteren: via het inspectieluik.",
    aandacht: "Beide kanalen moeten van binnen te bekijken zijn zonder leidingen in de woning te demonteren",
  },
  {
    question: "In het storingsoverzicht staat twee keer 'waterdruk te laag'. Telt dat voor de controle van het CLV?", // 6.1-1-01 b
    options: [
      "Nee, alleen storingen die wijzen op rookgaslekkage tellen",
      "Ja, elke storing maakt het CLV ongeschikt",
      "Ja, een lage waterdruk kan op een lek in het kanaal wijzen",
      "Alleen als de storing vaker dan drie keer voorkwam",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Het controlepunt gaat over storingen die wijzen op rookgaslekkage.",
    feedbackWrong: "Bij de controle tellen alleen storingen die wijzen op rookgaslekkage.",
    aandacht: "Alleen storingen die wijzen op rookgaslekkage tellen voor de controle",
  },
  {
    question: "Een CLV is 12 jaar oud en alle controles zijn in orde. Moet het om zijn leeftijd worden aangepakt?", // 6.1-1-05
    options: [
      "Nee, onder circa 15 jaar zijn er geen maatregelen nodig op basis van leeftijd.",
      "Ja, een CLV moet na 10 jaar altijd worden aangepakt.",
      "Ja, bij elke ketelwissel gaat het CLV eruit.",
      "Ja, maar alleen als de ketel ouder is dan het CLV.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd.",
    feedbackWrong: "Jonger dan circa 15 jaar en alle punten in orde: dan zijn er geen maatregelen nodig op basis van leeftijd.",
    aandacht: "Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd",
  },
];

const POOL_R2 = [
  {
    question: "Je vervangt tijdens doorgebruik een ketel op een bestaand collectief CLV. Welke terugslagklep moet de nieuwe ketel hebben?", // 5.2b-02
    options: [
      "Een klep die samen met de ketel is gekeurd",
      "Een losse klep van de groothandel met de juiste diameter",
      "Geen klep; die hoort alleen bij nieuwbouw",
      "Een klep onderin de schacht, voor alle ketels samen",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De klep is samen met de ketel gekeurd.",
    feedbackWrong: "De nieuwe ketel heeft een terugslagklep die samen met de ketel is gekeurd.",
    aandacht: "Nieuwe ketel op een bestaand CLV: klep samen met de ketel gekeurd",
  },
  {
    question: "De oude ketel had 24 kW. Welke maximale belasting mag de nieuwe ketel hebben?", // 5.2g-01
    options: ["Maximaal 24 kW", "Maximaal 26 kW", "Maximaal 30 kW", "Maakt niet uit, als hij een klep heeft"],
    correct: 0,
    feedbackCorrect: "Klopt. Niet hoger dan de oude ketel.",
    feedbackWrong: "De maximale belasting van de nieuwe ketel mag niet hoger zijn dan die van de oude.",
    aandacht: "Nieuwe ketel: maximale belasting niet hoger dan de oude",
  },
  {
    question: "Tegen hoeveel overdruk moet de nieuwe ketel met aansluitleiding minimaal bestand zijn?", // 5.2g-01
    options: ["25 Pa", "15 Pa", "20 Pa", "5 Pa"],
    correct: 0,
    feedbackCorrect: "Klopt. Minimaal 25 Pa, bij minimale belasting.",
    feedbackWrong: "De ketel met aansluitleiding moet bestand zijn tegen minimaal 25 Pa overdruk.",
    aandacht: "Nieuwe ketel met aansluitleiding: bestand tegen minimaal 25 Pa overdruk",
  },
  {
    question: "Het oude CLV wordt tijdelijk doorgebruikt. Wat moet er binnen maximaal een jaar na de eerste ketelwissel klaar zijn?", // 6.1-2-04, 6.1-2-05
    options: [
      "Beheersmaatregelen, zoals CO-melders in elke woning",
      "Een volledig nieuw CLV",
      "Een CO-melder in het trappenhuis",
      "Een nieuwe ketel in elke woning",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Binnen een jaar maatregelen, zoals CO-melders in de opstellingsruimte van elke woning.",
    feedbackWrong: "Binnen maximaal een jaar moeten beheersmaatregelen opgesteld en uitgevoerd zijn, zoals CO-melders in elke woning.",
    aandacht: "Tijdelijk doorgebruik: binnen een jaar maatregelen, zoals CO-melders in elke woning",
  },
  {
    question: "Met hoeveel jaar kan de levensduur van een oud CLV bij tijdelijk doorgebruik maximaal worden verlengd?", // 6.1-2-04
    options: ["Vijf jaar", "Een jaar", "Tien jaar", "Vijftien jaar"],
    correct: 0,
    feedbackCorrect: "Klopt. Met beheersmaatregelen maximaal vijf jaar.",
    feedbackWrong: "Met beheersmaatregelen kan de levensduur maximaal vijf jaar worden verlengd.",
    aandacht: "Tijdelijk doorgebruik: maximaal vijf jaar langer",
  },
  {
    klus: "dossier",
    question: "Er is geen technisch dossier en je kunt niet controleren of de afvoer geschikt is. Wat doe je met de nieuwe ketel?", // 6.1-2-03
    options: ["Niet in bedrijf nemen", "In bedrijf nemen en het dossier later opvragen", "In bedrijf nemen als de bewoner tekent", "In bedrijf nemen met een CO-melder erbij"],
    correct: 0,
    feedbackCorrect: "Klopt. Zonder dossier en zonder controle neem je de ketel niet in bedrijf.",
    feedbackWrong: "Ontbreekt het dossier en kun je de afvoer niet controleren, dan neem je de ketel niet in bedrijf.",
    aandacht: "Geen technisch dossier en geen controle mogelijk: ketel niet in bedrijf nemen",
  },
  {
    question: "Waaraan herken je een VMC (MVS)?", // 6.4-01, 6.4-02
    options: [
      "Een ventilator op het dak zuigt rookgas en ventilatielucht samen af.",
      "Alleen de rookgasafvoer is gezamenlijk; de lucht komt per woning uit de gevel.",
      "Lucht gaat omlaag in de ring en rookgas omhoog in de binnenbuis.",
      "Elke ketel heeft een terugslagklep in de aansluitleiding.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Rookgas en ventilatielucht gaan samen door de afvoer, met een ventilator op het dak.",
    feedbackWrong: "Bij een VMC (MVS) zuigt een centrale ventilator op het dak rookgas en ventilatielucht samen af. De andere zijn een half-CLV, een concentrisch CLV en een klep.",
    aandacht: "Een VMC (MVS) herken je aan de dakventilator die rookgas en ventilatielucht samen afzuigt",
  },
  {
    question: "Wat gebeurt er als de dakventilator van een VMC (MVS) uitvalt?", // 6.4-04
    options: [
      "Een beveiliging zet alle ketels in de strang uit.",
      "De ketels draaien door op natuurlijke trek.",
      "Alleen de bovenste ketel gaat uit.",
      "De ventilatie stopt, maar de ketels blijven aan.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij storing van de dakventilator gaan alle ketels uit.",
    feedbackWrong: "Valt de dakventilator uit, dan schakelt een beveiliging alle ketels uit.",
    aandacht: "VMC (MVS): valt de dakventilator uit, dan gaan alle ketels uit",
  },
  {
    question: "Wat is een oplossing voor een VMC (MVS) bij renovatie?", // 6.4-05
    options: [
      "Rookgasafvoer en ventilatie scheiden",
      "Een HR-ketel met ventilator aansluiten op het bestaande kanaal",
      "In elke ketel een terugslagklep zetten",
      "De dakventilator vervangen door een sterkere",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Scheiden, of de rookgasafvoer helemaal vervangen.",
    feedbackWrong: "Een VMC (MVS) is niet herbruikbaar als rookgasafvoer: helemaal vervangen of rookgas en ventilatie scheiden.",
    aandacht: "VMC (MVS): niet herbruikbaar; rookgasafvoer vervangen of rookgas en ventilatie scheiden",
  },
  {
    question: "Met wie maak je het vervangings- of renovatieplan voor de strang?", // 6.1-3-01, 6.4-06
    options: ["Met de gebouweigenaar, bijvoorbeeld de VvE", "Met de bewoner van de woning met de nieuwe ketel", "Met de bovenburen", "Met de leverancier van de ketel"],
    correct: 0,
    feedbackCorrect: "Klopt. Het plan maak je met de gebouweigenaar.",
    feedbackWrong: "Het plan maak je in overleg met de gebouweigenaar, bijvoorbeeld de VvE.",
    aandacht: "Het renovatieplan maak je met de gebouweigenaar (VvE)",
  },
  {
    klus: "c11",
    question: "Een toestelgebonden CLV (C(11)) wordt gerenoveerd. Wat geldt voor de ketels?", // 6.1-3-02
    options: [
      "Alle ketels worden een type (C(11)) en een fabricaat.",
      "Elke bewoner kiest zelf een merk C(10)-ketel.",
      "Bewoners met een ketel jonger dan 5 jaar houden hun ketel.",
      "De oude ketels blijven, met een klep erbij.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Na renovatie: alle ketels een type (C(11)) en een fabricaat.",
    feedbackWrong: "Bij een toestelgebonden CLV worden na renovatie alle ketels een type (C(11)) en een fabricaat.",
    aandacht: "Toestelgebonden CLV (C(11)): alle ketels een type en een fabricaat",
  },
  {
    klus: "voering",
    question: "Het kanaal is te smal voor de voering die nodig is. Wat nu?", // 6.1-4-04
    options: ["Het hele systeem vervangen", "Een dunnere voering nemen", "Het oude kanaal zo laten", "De ketels op een lagere stand zetten"],
    correct: 0,
    feedbackCorrect: "Klopt. Is de maat te klein voor een voering, dan vervang je het hele systeem.",
    feedbackWrong: "Past de voering niet in het bestaande kanaal, dan wordt het hele systeem vervangen.",
    aandacht: "Te smal voor een voering: dan vervang je het hele systeem",
  },
];

const POOL_R3 = [
  {
    question: "Waar meet je CO bij de periodieke controle volgens het beheerplan?", // 8.3-01
    options: [
      "In de rookgasafvoer, de luchttoevoer en de opstellingsruimte",
      "In de opstellingsruimte, het trappenhuis en bij de kap",
      "In de rookgasafvoer en bij de kap op het dak",
      "In de schacht naast het kanaal en in de opstellingsruimte",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Drie meetplekken, in elke woning.",
    feedbackWrong: "Je meet CO in de rookgasafvoer, de luchttoevoer en de opstellingsruimte, in elke woning.",
    aandacht: "CO meten volgens het beheerplan: rookgasafvoer, luchttoevoer en opstellingsruimte",
  },
  {
    question: "Wat doe je met de periodieke CO-metingen?", // 8.3-01
    options: ["Allemaal vastleggen", "Alleen de afwijkende vastleggen", "Alleen doorgeven aan de bewoner", "Alleen vastleggen als er een klacht is"],
    correct: 0,
    feedbackCorrect: "Klopt. Elke meting leg je vast.",
    feedbackWrong: "De periodieke CO-metingen leg je allemaal vast.",
    aandacht: "CO meten doe je in elke woning; elke meting leg je vast",
  },
  {
    question: "Je meet CO in de luchttoevoer. Wat kan de oorzaak zijn?", // 5.3a-03
    options: [
      "Rookgas lekt in het kanaal en komt in de luchttoevoer (recirculatie).",
      "De ketel krijgt te veel verse lucht.",
      "De sifon onder het rookgaskanaal staat vol water.",
      "Het bouwkundige luik staat open.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Rookgaslekkage in het kanaal kan leiden tot recirculatie.",
    feedbackWrong: "Rookgaslekkage in het gemeenschappelijke kanaal kan leiden tot recirculatie: rookgas in de luchttoevoer.",
    aandacht: "CO in de luchttoevoer kan wijzen op rookgaslekkage in het kanaal (recirculatie)",
  },
  {
    question: "Hoe onderhoud je de terugslagklep?", // 8.3-02
    options: [
      "Volgens de onderhoudsinstructie in de handleiding van de ketel",
      "Volgens de algemene instructie van de groothandel",
      "Volgens de instructie op de typeplaat bij het inspectieluik",
      "Door hem bij elke beurt te vervangen door een klep met dezelfde diameter",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De klep hoort bij de ketel; het onderhoud staat in de handleiding van de ketel.",
    feedbackWrong: "Het onderhoud van de terugslagklep doe je volgens de handleiding van de ketel.",
    aandacht: "Terugslagklep: aanwezig en bij de ketel horend; onderhoud volgens de handleiding van de ketel",
  },
  {
    question: "Een oude ketel heeft geen terugslagklep. Wanneer mag er een klep in?", // 5.2b-04
    options: [
      "Als de fabrikant van de ketel de klep geschikt vindt",
      "Als de klep dezelfde diameter heeft als de leiding",
      "Als de VvE er toestemming voor geeft",
      "Als de bewoner er zelf om vraagt",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Eerst de fabrikant van de ketel; is de klep geschikt, dan plaats je hem.",
    feedbackWrong: "Een klep plaats je alleen als de fabrikant van de ketel zegt dat hij geschikt is.",
    aandacht: "Geen klep bij een oude ketel: melden; een klep alleen als de ketelfabrikant hem geschikt vindt",
  },
  {
    question: "Hoe kom je bij de inspectieluikjes op de kanalen?", // 5.2a-04, 8.3-05
    options: [
      "Eerst het bouwkundige inspectieluik in de schachtwand openen",
      "Via de kap op het dak",
      "Door de aansluitleiding bij een ketel los te halen",
      "Via de condensafvoer onderin",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Achter het bouwkundige luik zitten de luikjes op het lucht- en het rookgaskanaal.",
    feedbackWrong: "Achter het bouwkundige inspectieluik in de schachtwand zitten aparte luikjes op het lucht- en rookgaskanaal.",
    aandacht: "Je komt bij de luikjes op de kanalen via het bouwkundige inspectieluik in de schachtwand",
  },
  {
    question: "Waar let je op bij de condensafvoer?", // 8.3-03
    options: [
      "Of hij nog voldoende werkt en of beide sifons bereikbaar zijn",
      "Of hij nog voldoende werkt; de sifons hoeven niet bereikbaar te zijn",
      "Of beide sifons droog staan en bereikbaar zijn",
      "Of de sifons van hetzelfde merk zijn als het kanaal",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Werkt hij nog voldoende en kun je bij beide sifons.",
    feedbackWrong: "Bij de condensafvoer controleer je of hij nog voldoende werkt en of beide sifons bereikbaar zijn.",
    aandacht: "Condensafvoer: werkt hij nog voldoende en zijn beide sifons bereikbaar",
  },
  {
    question: "Onderaan het CLV zit een bestaande trekonderbreker en het CLV wordt tijdelijk doorgebruikt. Wat moet ermee?", // 5.2c-03
    options: [
      "Vakkundig afsluiten en een condensafvoer maken",
      "Open laten: hij is nodig voor de trek",
      "Weghalen en het kanaal onderaan open laten",
      "Er een terugslagklep in zetten",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij doorgebruik wordt een bestaande trekonderbreker vakkundig afgesloten (onder meer vanwege mogelijke recirculatie) en krijgt hij een condensafvoer.",
    feedbackWrong: "Bij tijdelijk doorgebruik wordt een bestaande trekonderbreker onderaan vakkundig afgesloten en voorzien van een condensafvoer.",
    aandacht: "Tijdelijk doorgebruik: bestaande trekonderbreker afsluiten en een condensafvoer maken",
  },
];

// Twee verschillende vragen uit de pool; per vraag een eigen MCControle.
function ControleVragen({ pool, sessie, beantwoord, noteer, onKlaar, laatste }) {
  const [vragen] = useState(() => schud(pool).slice(0, 2));
  const [nr, setNr] = useState(0);
  useEffect(() => {
    naarBoven();
  }, [nr]);
  const volgende = () => {
    sessie.volgendeKennisvraag();
    if (nr === 0 && sessie.stand.fase === "kennisvraag") setNr(1);
    else onKlaar();
  };
  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <StepBanner step={2} />
      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.brown }}>
        Controlevraag {nr + 1} van 2
      </p>
      <MCControle
        key={nr}
        pool={[vragen[nr]]}
        beantwoord={beantwoord}
        onFout={noteer}
        onComplete={volgende}
        lastRound={laatste && nr === 1}
        volgendeTekst={nr === 0 ? "Volgende vraag" : "Volgende ronde"}
      />
    </div>
  );
}

// ─── START ───

function StartScreen({ onStart }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="py-3 px-5 text-center" style={{ backgroundColor: C.bgHeader }}>
        <span className="text-white font-bold italic text-lg">De CLV-Servicemonteur</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
        <div className="rounded-full p-7 border-4" style={{ backgroundColor: C.beigeLight, borderColor: C.brownText }}>
          <ClipboardCheck className="w-20 h-20" style={{ color: C.brownText }} />
        </div>
        <h1 className="text-3xl font-bold italic text-center" style={{ color: C.brownText }}>
          De CLV-Servicemonteur
        </h1>
        <p className="max-w-sm text-center font-medium" style={{ color: C.brown }}>
          Beoordeel een bestaand CLV, adviseer bij vervanging en voer het onderhoud uit.
        </p>
        <GameButton onClick={onStart}>
          <Power className="w-4 h-4" />
          Start de game
        </GameButton>
      </div>
    </div>
  );
}

// Staan altijd op het eindscherm, ook bij een foutloos spel.
const LEERMOMENTEN = [
  "De zeven controles: binnenkant rookgas- en luchtkanaal, storingen door rookgaslekkage, rookgas in de opstellingsruimte, bevestiging, kap, condensafvoer en van binnen te bekijken",
  "Ouder dan circa 15 jaar: alle zeven controles in orde, dan tijdelijk doorgebruik onder voorwaarden; een controle niet in orde, dan geen doorgebruik",
  "De leeftijd van de afvoer gaat voor die van de ketel",
  "Nieuwe ketel tijdens doorgebruik: klep samen gekeurd, niet zwaarder, past bij het nieuwe kanaal, minimaal 25 Pa",
  "Tijdelijk doorgebruik: binnen een jaar maatregelen zoals CO-melders in elke woning, maximaal vijf jaar langer, plan met de eigenaar",
  "VMC (MVS): dakventilator zuigt rookgas en ventilatielucht af; niet herbruikbaar, dus vervangen of scheiden; advies aan de eigenaar",
  "Onderhoud: CO meten op drie plekken in elke woning en vastleggen, klep volgens de ketelhandleiding, condensafvoer en beide sifons, visuele inspectie",
];

export default function CLVServiceGame({ initialScreen = "start", onExit, onGameComplete, qaFase }) {
  const [screen, setScreen] = useState(initialScreen);
  const [qaZonderIntro] = useState(() => (qaFase === "opdracht" ? initialScreen : null));
  const [qaStap] = useState(leesQaStap);
  const [klussen, setKlussen] = useState(null);
  const { aandacht, noteer, reset: resetAandacht } = useAandacht();
  const juice = useGameJuice();
  const { sessie, stand, herstart } = useSessie(maakOpzet, { zender });

  // controlemenu-sprong: speel de kern door tot het gevraagde scherm
  useState(() => doorspelenTot(sessie, initialScreen));

  useEffect(() => {
    if (RONDE_SCHERMEN.includes(screen)) sessie.startRonde();
  }, [screen, sessie]);

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

  const scherm = stand.fase === "eind" ? "end" : screen;

  useEffect(() => {
    naarBoven();
  }, [scherm]);

  const resetGame = () => {
    herstart();
    setScreen("start");
    resetAandacht();
    setKlussen(null);
  };

  const gefaald = stand.fase === "rondeklaar" && stand.ronde?.status === "gefaald";

  const rondeAf = (mcScreen) => {
    sessie.rondeKlaar();
    if (sessie.stand.fase === "rondeklaar") sessie.verder();
    if (sessie.stand.fase === "kennisvraag") setScreen(mcScreen);
  };

  const naar = (next) => () => {
    if (next !== "end") setScreen(next);
  };

  // het menu markeert deze game als gespeeld zodra het eindscherm verschijnt
  useEffect(() => {
    if (scherm === "end") onGameComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scherm]);

  const showProgress = !["start", "intro", "end"].includes(scherm);
  const rondeProps = (id) => ({
    beoordeel,
    noteer,
    onDone: () => rondeAf(`${id}mc`),
    zonderIntro: qaZonderIntro === id,
    startStap: qaZonderIntro === id ? qaStap : 0,
  });
  // R2-vragen over een klus die niet gespeeld is, vallen weg
  const poolR2 = POOL_R2.filter((v) => !v.klus || !klussen || klussen.includes(v.klus));

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: C.bgPage }}>
      <juice.JuiceOverlay />
      <DragProvider>
        <div
          className="max-w-[800px] w-full mx-auto flex flex-col min-h-screen shadow-lg overflow-x-hidden"
          style={{ backgroundColor: C.bgPage, animation: juice.shaking ? "shake 0.3s ease-in-out" : "none" }}
        >
          {showProgress && (
            <ProgressBar currentRound={SCREEN_ROUND[scherm] ?? 1} score={Math.max(0, stand.punten)} lives={stand.levens} totalRounds={3} />
          )}

          {scherm === "start" && <StartScreen onStart={() => setScreen("intro")} />}

          {scherm === "intro" && (
            <IntroScreen title="Missie: de servicemonteur" buttonText="Aan de slag" onNext={() => setScreen("r1")}>
              <div className="leading-relaxed text-sm" style={{ color: C.brownText }}>
                {/* 5.1a-01 */}
                <p className="mb-2">
                  Jij bent servicemonteur. In een flat met een CLV hangen de ketels aan een gezamenlijk kanaal voor lucht en een gezamenlijk kanaal voor rookgas.
                </p>
                <p>Je beoordeelt een bestaand CLV, kiest wat er moet gebeuren als een ketel vervangen wordt en doet het onderhoud.</p>
              </div>
            </IntroScreen>
          )}

          {scherm === "r1" && <Ronde1 {...rondeProps("r1")} />}
          {scherm === "r1mc" && (
            <ControleVragen key="r1mc" pool={POOL_R1} sessie={sessie} beantwoord={beantwoord} noteer={noteer} onKlaar={naar("r2")} />
          )}

          {scherm === "r2" && <Ronde2 {...rondeProps("r2")} onKlussen={setKlussen} />}
          {scherm === "r2mc" && (
            <ControleVragen key="r2mc" pool={poolR2} sessie={sessie} beantwoord={beantwoord} noteer={noteer} onKlaar={naar("r3")} />
          )}

          {scherm === "r3" && <Ronde3 {...rondeProps("r3")} />}
          {scherm === "r3mc" && (
            <ControleVragen key="r3mc" pool={POOL_R3} sessie={sessie} beantwoord={beantwoord} noteer={noteer} onKlaar={naar("end")} laatste />
          )}

          {scherm === "end" && (
            <EindschermKern
              sessie={sessie}
              stand={stand}
              tekst="Sterk werk! Je hebt een bestaand CLV beoordeeld, de juiste keuzes gemaakt bij vervanging en het onderhoud uitgevoerd."
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
          {gefaald && <RondeGefaald onVerder={() => rondeAf(`${stand.ronde.id}mc`)} />}
        </div>
      </DragProvider>
    </div>
  );
}
