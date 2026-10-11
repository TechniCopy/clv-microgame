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
          <line x1="339.2" y1="643" x2="350" y2="630.5" stroke={L} strokeWidth="0.45" />
          <path d="M338.8 643.4 L339.8 639.6 L342.4 641.8 Z" fill={L} />
          <text x="351" y="630">open verbinding</text>
          <line x1="406.5" y1="649.5" x2="418" y2="636" stroke={L} strokeWidth="0.45" />
          <path d="M406.2 650 L407.2 646.3 L409.6 648.3 Z" fill={L} />
          <text x="420" y="636">1</text>
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
        <text x="271" y="717" fontSize="10.6" fill={L}>2</text>
      </g>

      {/* oordeel als stempel over de tekening */}
      {st && (
        <g transform="rotate(-14 210 470)">
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
    goed: ["De kap zit vast. De kleur is wat verbleekt door de zon; je ziet geen deuk en geen scheur."],
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
    goed: ["Je schroeft het luik los en kijkt via de luikjes op de kanalen naar binnen."],
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
    soort === "geen" ? 11 + Math.floor(Math.random() * 4) : soort === "door" ? 16 + Math.floor(Math.random() * 5) : 11 + Math.floor(Math.random() * 10);
  const leeftijdNiet = leeftijd === 15 ? 16 : leeftijd;
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
  { id: "geen", tekst: "Geen maatregelen op basis van leeftijd: het CLV is jonger dan circa 15 jaar en alles is in orde." },
  { id: "door", tekst: "Tijdelijk doorgebruik kan, onder strikte voorwaarden. Met de eigenaar (VvE) komt er een vervangings- of renovatieplan." },
  { id: "niet", tekst: "Niet herbruikbaar: tijdelijk doorgebruik kan niet. De eigenaar (VvE) moet aan de slag met renovatie." },
  { id: "meteen", tekst: "Het CLV is ouder dan circa 15 jaar of heeft een gebrek, dus het moet vandaag nog helemaal vervangen worden." },
];

const R1_UITLEG = {
  // 6.1-1-05
  geen: "Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd. Of een nieuwe ketel op dit CLV past, is een aparte vraag. Die komt in ronde 2.",
  // 6.1-2-04, 6.1-3-01, 6.1-1-01
  door: "Ouder dan circa 15 jaar, maar alle zeven controles in orde: dan kan tijdelijk doorgebruik, onder strikte voorwaarden. Met de eigenaar komt er een plan voor de strang.",
  // 6.1-1-01, 6.1-1-02, 6.1-3-01
  niet: "Een van de zeven controles is niet in orde. Dan kan tijdelijk doorgebruik niet en is het CLV niet herbruikbaar. De eigenaar moet aan de slag met renovatie.",
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
      return;
    }
    beoordeel("fout", punt(e));
    setOordeelFout((f) => [...f, o.id]);
    if (o.id === "meteen") {
      noteer("Ouder dan circa 15 jaar betekent niet meteen vervangen: met alle controles in orde kan tijdelijk doorgebruik");
      setFb({ goed: false, tekst: "Na circa 15 jaar is meteen vervangen te stellig. Zijn alle zeven controles in orde, dan kan tijdelijk doorgebruik onder voorwaarden. Is een punt niet in orde, dan is het CLV niet herbruikbaar en volgt renovatie." }); // T12
    } else if (juist === "niet") {
      noteer("Is een van de zeven controles niet in orde, dan kan tijdelijk doorgebruik niet");
      setFb({ goed: false, tekst: "Je vond een punt dat niet in orde is. Dan kan tijdelijk doorgebruik niet en is het CLV niet herbruikbaar, ook als het jong is." }); // 6.1-1-02
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
          tijdelijk doorgebruik kan alleen als alle zeven in orde zijn, met een plan met de eigenaar. Is er een punt niet in orde, dan is het CLV niet herbruikbaar. Jonger en alles in orde: geen maatregelen op basis van leeftijd.
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

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        <div className="w-full max-w-[340px] mx-auto md:w-[340px] shrink-0 relative">
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
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
            <span className="text-sm font-bold" style={{ color: C.brownText }}>
              Jouw controle: CLV van {opzet.leeftijd} jaar
            </span>
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
          <Keuzes opties={oordeelOpties} fout={oordeelFout} goedId={oordeel} juist={[opzet.uitkomst]} onKies={kiesOordeel} />
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
              <text x={vx(505)} y={vy(S + 335)} fontSize="13" fontWeight="800" textAnchor="middle" fill={C.red}>UIT</text>
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
const KETEL_EISEN = [
  {
    id: "klep", label: "Terugslagklep", goed: "samen met deze ketel gekeurd", fout: "los meegeleverd door de groothandel",
    uitleg: "De terugslagklep moet samen met de ketel gekeurd zijn. Een los meegeleverde klep voldoet niet.", // 5.2g-01, 5.2b-02
  },
  {
    id: "belasting", label: "Maximale belasting", goed: "24 kW", fout: "26 kW",
    uitleg: "De maximale belasting mag niet hoger zijn dan die van de oude ketel (24 kW). Ook 26 kW is te hoog.", // 5.2g-01
  },
  {
    id: "toekomst", label: "Belasting getoetst aan het nieuwe kanaal", goed: "ja, past", fout: "nog niet nagegaan",
    uitleg: "De belasting moet passen bij het nieuwe kanaal dat er straks komt. Dat moet je eerst weten.", // 5.2g-01
  },
  {
    id: "druk", label: "Bestand tegen overdruk (met aansluitleiding, bij minimale belasting)", goed: "30 Pa", fout: "20 Pa",
    uitleg: "De ketel met aansluitleiding moet bestand zijn tegen minimaal 25 Pa overdruk. 20 Pa is te weinig.", // 5.2g-01, T19
  },
];

function maakKetels() {
  const faalt = schud(KETEL_EISEN.map((e) => e.id)).slice(0, 3);
  const kaarten = [{ id: "goed", faalt: null }, ...faalt.map((f) => ({ id: `k-${f}`, faalt: f }))];
  return schud(kaarten).map((k, i) => ({ ...k, naam: `Ketel ${"ABCD"[i]}` }));
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
    if (!k.faalt) {
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
      setFb({ goed: false, tekst: KETEL_EISEN.find((x) => x.id === k.faalt).uitleg });
    }
  };
  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      {/* 5.1b-05, 6.1-2-04, 5.2g-01 */}
      <Situatie wie="Flat De Linde.">
        Het oude onderdruk-CLV is 17 jaar. Alle zeven controles waren in orde, dus de VvE gebruikt het tijdelijk door tot het nieuwe kanaal er is. De ketel van mevrouw Jansen (24 kW) is kapot. Een moderne HR-ketel hoort niet op een oud onderdruk-CLV. Tijdens doorgebruik mag het alleen als hij aan vier voorwaarden voldoet.
      </Situatie>
      <p className="text-sm font-bold" style={{ color: C.brownText }}>Kies de ketel die je mag ophangen.</p>
      <div className="grid grid-cols-2 gap-2">
        {ketels.map((k) => {
          const isFout = fout.includes(k.id);
          const isGoed = goedId === k.id;
          return (
            <button
              key={k.id}
              onClick={(e) => kiesKetel(k, e)}
              disabled={isFout || !!goedId}
              data-goed={qaGoed(!k.faalt && !goedId)}
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
                  <span className="font-bold">{k.faalt === eis.id ? eis.fout : eis.goed}</span>
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <FbBalk fb={fb} knop={goedId ? "Volgende" : null} onKnop={onKlaar} />
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
      setFb({ goed: true, tekst: "Het advies en het plan gaan naar de gebouweigenaar, bijvoorbeeld de VvE. Die beslist over de hele strang." }); // 6.4-06, 6.1-3-01
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
          wil een nieuwe HR-ketel. Je collega stuurt twee schachttekeningen: een van De Wilg en een van De Linde. Stel per tekening vast wat voor systeem het is.
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
// Rasterfiguur; maten opgemeten: wand tot wand 78 eenheden, vloer op 265.

const OZ_W = 400;
const OZ_H = 295;

// Tikvlakken op de plek van de nummers uit de figuur (verder uit elkaar gezet
// voor tikvlakken van 44 px), met een wijslijn naar het onderdeel.
const OZ_PLEKKEN = [
  { id: "n1", nr: 1, x: 30, y: 92, naar: [132.5, 153], naam: "de afvoer van condenswater uit de binnenbuis" },
  { id: "n2", nr: 2, x: 30, y: 152, naar: [129.5, 167], naam: "de sifon voor de afvoer van condenswater" },
  { id: "n3", nr: 3, x: 30, y: 212, naar: [130, 197], naam: "de afvoer van regenwater uit de trechter" },
  { id: "n4", nr: 4, x: 244, y: 58, naar: [182.7, 121], naam: "het bouwkundige inspectieluik" },
  { id: "n5", nr: 5, x: 244, y: 118, naar: [162.5, 145.7], naam: "het inspectieluik van het luchttoevoerkanaal" },
  { id: "n6", nr: 6, x: 244, y: 178, naar: [146.5, 145.5], naam: "het inspectieluik van het rookgasafvoerkanaal" },
  { id: "n7", nr: 7, x: 252, y: 272, naar: [212, 245], naam: "de sifon voor regen- en condenswater, buiten de schacht" },
  { id: "n8", nr: 8, x: 312, y: 168, naar: [291.5, 224.5], naam: "de open verbinding naar het riool" },
];

function OnderzijdeSVG({ luikOpen, water2, water7 }) {
  const wand = "#8a8a8a";
  const L = C.brownText;
  const stroom = { strokeDasharray: "5 5", animation: "flowDash 0.9s linear infinite" };
  const afvoer3 = "M132 201 V206 Q132 214.5 140 214.5 H193 V232 Q193 244 209 244 Q225 244 225 232 V216.8 H283 Q290 216.8 290 222 V225";
  const naarRiool = "M292 238 V243 Q292 248 298 248 H372";
  return (
    <svg viewBox={`0 0 ${OZ_W} ${OZ_H}`} className="w-full h-auto select-none" aria-label="Onderzijde van het CLV met inspectieluiken en sifons">
      <defs>
        <pattern id="svcArc3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={L} strokeWidth="1" />
        </pattern>
      </defs>
      {/* vloer (gearceerd) links en rechts van de schacht; de wanden lopen door tot onder de vloer */}
      <rect x="0" y="265" width="92" height="16" fill="url(#svcArc3)" stroke={L} strokeWidth="1.2" />
      <rect x="179.2" y="265" width="214.8" height="16" fill="url(#svcArc3)" stroke={L} strokeWidth="1.2" />
      <polygon points="92,51.8 101.2,47.6 101.2,281 92,281" fill={wand} stroke={L} strokeWidth="1.2" />
      <polygon points="170,16.1 179.2,11.9 179.2,118 170,118" fill={wand} stroke={L} strokeWidth="1.2" />
      <rect x="170" y="184.7" width="9.2" height="96.3" fill={wand} stroke={L} strokeWidth="1.2" />
      <line x1="82.8" y1="56" x2="188.4" y2="7.8" stroke={L} strokeWidth="1" strokeDasharray="12 3 2 3" />

      {/* buitenbuis (luchtkanaal): loopt door tot op het voetstuk */}
      <g stroke={L} strokeWidth="1.5" fill="none">
        <line x1="114" y1="41.8" x2="114" y2="237.5" />
        <line x1="149.4" y1="25.6" x2="149.4" y2="134" />
        <line x1="149.4" y1="168.6" x2="149.4" y2="237.5" />
        {/* T-stuk naar het inspectieluik van het luchtkanaal (5) */}
        <path d="M149.4 134 H160.5 M149.4 168.6 H160.5" />
      </g>
      <rect x="160.5" y="131" width="3.5" height="40.6" fill="url(#svcArc3)" stroke={L} strokeWidth="1.2" />
      {/* binnenbuis (rookgas), onderaan dicht */}
      <g stroke={L} strokeWidth="1.5">
        <line x1="123.2" y1="37.6" x2="123.2" y2="150.3" />
        <line x1="140.2" y1="29.8" x2="140.2" y2="150.3" />
        <line x1="123.2" y1="150.3" x2="140.2" y2="150.3" />
      </g>
      {/* inspectieluik rookgasafvoer (6): stompje met losse dop */}
      <rect x="140.2" y="142" width="3.2" height="7" fill="white" stroke={L} strokeWidth="1" />
      <rect x="144.2" y="140" width="2.2" height="11" fill={L} />
      {/* pijlen: rookgas omhoog in de binnenbuis, lucht omlaag in de ring */}
      <g stroke={L} strokeWidth="1.3" fill={L}>
        <line x1="131.7" y1="90" x2="131.7" y2="66" />
        <path d="M131.7 60 l-3 7 h6 z" />
        <line x1="118.6" y1="94" x2="118.6" y2="110" />
        <path d="M118.6 116 l-2.5 -7 h5 z" />
        <line x1="145" y1="33" x2="145" y2="48" />
        <path d="M145 54 l-2.5 -7 h5 z" />
      </g>

      {/* afvoer condenswater (1) met sifon (2), die in het luchtkanaal hangt */}
      <g fill="none" stroke={L} strokeWidth="4" strokeLinejoin="round">
        <path d="M131 150.3 V158 M129.5 158 V169 Q129.5 175 134.75 175 Q140 175 140 169 V160.5 H146 V157" />
      </g>
      <g fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M131 151 V158 M129.5 159 V169 Q129.5 174 134.75 174 Q140 174 140 169 V160.5 H145.5 V157.5" />
      </g>
      <path d="M127 158 H134 M144 157 H148 M130.5 170 H139 M131.5 172.3 H138" stroke={L} strokeWidth="1" />
      <rect x="133.3" y="175" width="3" height="2.4" fill="white" stroke={L} strokeWidth="0.8" />
      {water2 && <path d="M131 151 V169 Q131 174 134.75 174 Q138.5 174 138.5 169 V161 H145.5" fill="none" stroke="#3B82F6" strokeWidth="1.6" style={stroom} />}

      {/* opvangtrechter (3): rand over de volle breedte, ronde kom die lager zit dan sifon 2, tuit met koppeling */}
      <line x1="114" y1="182" x2="149.4" y2="182" stroke={L} strokeWidth="1.3" />
      <path d="M114 184 Q115 190 121 190 L127 190.5 Q130 191 130 196 V199 M149.4 184 Q148.4 190 142.4 190 L136.4 190.5 Q134 191 134 196 V199" fill="none" stroke={L} strokeWidth="1.3" />
      <rect x="129.6" y="199" width="4.8" height="2.4" fill="white" stroke={L} strokeWidth="0.9" />

      {/* afvoer regenwater uit de trechter, door de wand naar sifon (7), open verbinding (8), naar het riool */}
      <g fill="none" stroke={L} strokeWidth="5" strokeLinejoin="round">
        <path d={afvoer3} />
        <path d={naarRiool} />
      </g>
      <g fill="none" stroke="white" strokeWidth="2.6" strokeLinejoin="round">
        <path d={afvoer3} />
        <path d={naarRiool} />
      </g>
      {/* opvangbocht met verwijde mond, open naar boven */}
      <path d="M285.5 231 L288.5 238 H295.5 L298.5 231" fill="white" stroke={L} strokeWidth="1.3" />
      <path d="M287 225 H293" stroke={L} strokeWidth="1.3" />
      <path d="M197 230 H201 M217 230 H221" stroke={L} strokeWidth="1" />
      <rect x="207.5" y="246" width="3" height="2.6" fill="white" stroke={L} strokeWidth="0.8" />
      {/* waterstand in sifon 7 */}
      <path d="M195.5 233 H198.5 M219.5 233 H222.5 M197 239 H221 M200 242.5 H218" stroke={L} strokeWidth="0.8" />
      {water7 && <path d={`${afvoer3} M292 238 V243 Q292 248 298 248 H372`} fill="none" stroke="#3B82F6" strokeWidth="1.8" style={stroom} />}

      {/* voetstuk met drie ovale openingen en een stippellijn */}
      <rect x="114" y="237.5" width="35.4" height="27.5" fill="white" stroke={L} strokeWidth="1.3" />
      {[120, 131.7, 143.4].map((cx) => (
        <ellipse key={cx} cx={cx} cy="247" rx="3" ry="6" fill="none" stroke={L} strokeWidth="1.1" />
      ))}
      <line x1="114" y1="261" x2="149.4" y2="261" stroke={L} strokeWidth="1" strokeDasharray="4 3" />
      {/* verticale hartlijn door afvoer 1, sifon 2, de tuit van de trechter en het voetstuk */}
      <line x1="132" y1="148" x2="132" y2="268" stroke={L} strokeWidth="0.6" strokeDasharray="8 2 2 2" />

      {/* bouwkundig inspectieluik (4): plaat op de buitenkant van de wand, boven en onder vastgezet */}
      {luikOpen ? (
        <g>
          <rect x="170" y="118" width="9.2" height="66.7" fill="#3a3a3a" />
          <polygon points="179.2,116 212,130 212,176 179.2,189.7" fill="white" stroke={L} strokeWidth="1.3" />
        </g>
      ) : (
        <g>
          <rect x="179.2" y="116" width="3.5" height="73.7" fill="white" stroke={L} strokeWidth="1.3" />
          <path d="M175 120.5 H186.5 M175 185 H186.5" stroke={L} strokeWidth="1.3" />
        </g>
      )}

      {/* wijslijnen en nummers zoals in de figuur; 8 staat er twee keer (vrij uiteinde en opvangmond) */}
      {OZ_PLEKKEN.map((p) => (
        <g key={p.id}>
          <line x1={p.x} y1={p.y} x2={p.naar[0]} y2={p.naar[1]} stroke={L} strokeWidth="0.9" />
          <text x={p.x} y={p.y + 5} fontSize="14" textAnchor="middle" fill={L}>{p.nr}</text>
        </g>
      ))}
      <path d="M291.5 224.5 l-1.4 -6.4 l5 3.4 z" fill={L} />
      <line x1="344" y1="174" x2="300" y2="231" stroke={L} strokeWidth="0.9" />
      <path d="M300 231 l0.8 -6.5 l4.4 3.6 z" fill={L} />
      <text x="348" y="172" fontSize="14" textAnchor="middle" fill={L}>8</text>
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
  { id: "goed", tekst: "Er lekt waarschijnlijk rookgas. Vastleggen en meteen melden aan de eigenaar (VvE): zo kan het CLV niet tijdelijk door." },
  { id: "later", tekst: "Vastleggen en bij de volgende periodieke controle opnieuw meten." },
  { id: "normaal", tekst: "Vastleggen; op deze meetplek is een beetje CO normaal." },
];
const BEVINDING_UITLEG = {
  // 5.3a-03, 6.1-1-01, 6.1-3-01
  ltv: "CO in de luchttoevoer wijst op rookgaslekkage in het kanaal: rookgas komt in de lucht naar de ketels (recirculatie). Met rookgaslekkage voldoet het CLV niet meer voor tijdelijk doorgebruik.",
  // 6.1-1-01 c, 6.1-3-01
  ruimte: "Rookgas in de opstellingsruimte is een van de zeven controles voor doorgebruik. Daarmee voldoet het CLV niet meer: melden aan de eigenaar.",
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
  waarom: "Het bouwkundige inspectieluik in de schachtwand, minimaal 50 x 50 cm. Daarachter zitten de luikjes op de kanalen.",
};
const OZ_TAKEN = [
  {
    id: "lucht", doel: "n5", tekst: "Kijk in het luchttoevoerkanaal.",
    waarom: "Het luikje op het luchttoevoerkanaal. Zo bekijk je het kanaal van binnen zonder leidingen in de woning los te halen.",
  },
  {
    id: "rook", doel: "n6", tekst: "Kijk in het rookgasafvoerkanaal.",
    waarom: "Het luikje op het rookgasafvoerkanaal. Zo doe je de inwendige controle: je let op zichtbare gebreken.",
  },
  {
    id: "sifon2", doel: "n2", tekst: "Controleer de sifon onder het rookgaskanaal.", sifon: true,
    waarom: "De sifon onder de afvoer van condenswater. Hij moet bereikbaar zijn voor onderhoud en inspectie.",
  },
  {
    id: "sifon7", doel: "n7", tekst: "Controleer de sifon buiten de schacht.", sifon: true,
    waarom: "De sifon voor regen- en condenswater. Ook die moet bereikbaar zijn.",
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
  { id: "verf", goed: false, tekst: "Het kanaal van binnen schilderen tegen roest" },
  { id: "univ", goed: false, tekst: "Bij elke ketel een losse terugslagklep van de groothandel bijplaatsen" },
  { id: "c10", goed: false, tekst: "De ketels een voor een vervangen door C(10)-ketels" },
];

function OnderzijdeStap({ beoordeel, noteer, onDone }) {
  const [taken] = useState(() => [OZ_TAKEN_VAST, ...schud(OZ_TAKEN)]);
  // per sifon: werkt hij of niet (elke beurt anders)
  const [sifonOk] = useState(() => ({ n2: Math.random() < 0.6, n7: Math.random() < 0.6 }));
  const [nr, setNr] = useState(0);
  const [klaar, setKlaar] = useState([]);
  const [fb, setFb] = useState(null);
  const [oordeelVoor, setOordeelVoor] = useState(null); // sifon die nu beoordeeld wordt
  const [oordeelFout, setOordeelFout] = useState([]);
  const taak = taken[nr];
  const luikOpen = klaar.includes("n4");

  const tik = (p, e) => {
    if (!taak || oordeelVoor || klaar.includes(p.id)) return;
    if (p.id === taak.doel) {
      beoordeel("goed", punt(e));
      setKlaar((k) => [...k, p.id]);
      if (taak.sifon) {
        setOordeelVoor(p.id);
        setOordeelFout([]);
        setFb({ goed: true, tekst: taak.waarom });
      } else {
        setFb({ goed: true, tekst: taak.waarom });
        setNr((n) => n + 1);
      }
      return;
    }
    beoordeel("fout", punt(e));
    if (!luikOpen && ["n1", "n2", "n5", "n6"].includes(p.id)) {
      noteer("Je komt bij de luikjes op de kanalen via het bouwkundige inspectieluik in de schachtwand");
      setFb({ goed: false, tekst: `Dit is ${p.naam}. Daar kom je pas bij als het bouwkundige inspectieluik open is.` });
    } else {
      noteer("Ken de onderdelen onderin: bouwkundig luik, luikjes op lucht- en rookgaskanaal, twee sifons");
      setFb({ goed: false, tekst: `Dit is ${p.naam}. De opdracht was: ${taak.tekst.toLowerCase()}` });
    }
  };

  const oordeelSifon = (zegtOk, e) => {
    const werkt = sifonOk[oordeelVoor];
    if (zegtOk === werkt) {
      beoordeel("goed", punt(e));
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

  return (
    <>
      <OpdrachtKop
        titel="Ronde 3: Onderhoud van het CLV"
        stap={3}
        stappen={4}
        opdracht={oordeelVoor ? "Beoordeel de sifon." : taak ? `${taak.tekst} Tik op de juiste plek.` : "Alles gecontroleerd."}
        teller={`${Math.min(nr, taken.length)} van ${taken.length}`}
      />
      <div className="w-full max-w-2xl flex flex-col gap-3 items-center">
        <div className="w-full max-w-[460px] relative">
          <OnderzijdeSVG luikOpen={luikOpen} water2={klaar.includes("n2") && sifonOk.n2} water7={klaar.includes("n7") && sifonOk.n7} />
          {OZ_PLEKKEN.map((p) => (
            <Stip
              key={p.id}
              x={p.x}
              y={p.y}
              w={OZ_W}
              h={OZ_H}
              nr={p.nr}
              status={klaar.includes(p.id) ? "ok" : null}
              label={`plek ${p.nr}`}
              onClick={(e) => tik(p, e)}
              goed={!oordeelVoor && taak && p.id === taak.doel}
            />
          ))}
        </div>
      </div>
      {(fb || oordeelVoor || !taak) && (
        <VasteBalk>
          {oordeelVoor && (
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
          )}
          <Terugkoppeling fb={fb} />
          {!taak && (
            <GameButton onClick={onDone} className="w-full">
              Naar de laatste stap
            </GameButton>
          )}
        </VasteBalk>
      )}
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
      setFb({ goed: true, tekst: nieuw.length < 4 ? `Dat hoort erbij. Nog ${4 - nieuw.length} te gaan.` : "Dit zijn de vier punten van het onderhoud van een CLV." });
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
      noteer("CO in de luchttoevoer of rookgas in de opstellingsruimte: rookgaslekkage, meteen melden aan de eigenaar");
      setBevFout((f) => [...f, o.id]);
      setFb({ goed: false, tekst: `${BEVINDING_UITLEG[bevinding]} Wachten tot de volgende controle is dus te laat.` });
    }
  };

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 3: Onderhoud van het CLV" intro="Flat De Linde, een jaar later. Het oude CLV wordt nog tijdelijk doorgebruikt." onStart={() => setGestart(true)}>
        <UitlegItem term="Onderkant aangepast">
          {/* 5.2c-03 */}
          bij tijdelijk doorgebruik wordt een bestaande trekonderbreker onderaan vakkundig afgesloten en krijgt het rookgaskanaal een condensafvoer. Daarom ziet de onderkant er anders uit dan in ronde 1.
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
    : !woningGoed
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
        {woningGoed && (
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
      "Ja, een lage waterdruk wijst altijd op een lek in het kanaal",
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
    question: "Waarom is de binnenbuis van het CLV in De Linde onderaan dicht, met een eigen condensafvoer?", // 5.2c-03
    options: [
      "Bij tijdelijk doorgebruik is de bestaande trekonderbreker afgesloten en kwam er een condensafvoer",
      "Een CLV is onderaan altijd dicht; dat was het in ronde 1 ook",
      "Zo kan het bouwkundige luik kleiner worden",
      "Zo kan er geen regenwater in het luchtkanaal komen",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Een bestaande trekonderbreker wordt bij doorgebruik vakkundig afgesloten en krijgt een condensafvoer.",
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
  "Circa 15 jaar of ouder en alles in orde: tijdelijk doorgebruik onder voorwaarden; een punt niet in orde: niet herbruikbaar",
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
