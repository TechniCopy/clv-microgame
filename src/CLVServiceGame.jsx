import { useState, useCallback, useEffect } from "react";
import { ClipboardCheck, CheckCircle, XCircle, Fan, Gauge, Users, FileText, Power } from "lucide-react";
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
} from "./shared.jsx";
import { useSessie, maakZender, EindschermKern } from "./microgame/schil.jsx";

// Game 3: De CLV-Servicemonteur (eindtermen 6.1, 6.4 en 8.3).
// Elke ronde is voor de kern een missie met een ronde en twee kennisvragen.
// Handelingen = het echte aantal beoordeel("goed")-momenten:
//   r1: 8 inspectiepunten + 1 eindoordeel = 9
//   r2: 6 klussen (ketelkeuze 1, plan 1, tijdlijn 3, C(11) 1, voering 1, dossier 1) = 8
//       + VMC/MVS: 4 kenmerken + 2 oplossingen = 6; samen 14
//   r3: CO-logboek 3 + woningen 1 + terugslagklep 2 + onderzijde 5 = 11
// Haalbaar: (9 + 14 + 11) x 100 + 6 kennisvragen x 100 = 4000.
// Elke inhoudelijke zin is terug te voeren op een feit-ID uit BRONBASIS
// (zie clv-gauntlet\bouw\service-BRONNEN.md); de ID's staan als commentaar.
const GAME_ID = "clv-service";

const maakOpzet = () => ({
  id: GAME_ID,
  missies: [
    { id: "m1", rondes: [{ id: "r1", handelingen: 9 }], kennisvragen: [{ id: "k1a" }, { id: "k1b" }] },
    { id: "m2", rondes: [{ id: "r2", handelingen: 14 }], kennisvragen: [{ id: "k2a" }, { id: "k2b" }] },
    { id: "m3", rondes: [{ id: "r3", handelingen: 11 }], kennisvragen: [{ id: "k3a" }, { id: "k3b" }] },
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

// QA: ?qa=1&spring=service-r2&fase=opdracht&stap=2 opent ronde 2 meteen in stap 2.
function leesQaStap() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("qa") !== "1") return 0;
    return Number(p.get("stap")) || 0;
  } catch {
    return 0;
  }
}

// QA: &kaal=1 verbergt de tikvlakken, om een tekening naast de normfiguur te leggen.
// QA: met ?qa=1 krijgen de goede keuzes een onzichtbaar data-goed-kenmerk,
// zodat een testscript de game foutloos kan uitspelen.
const QA_AAN = (() => {
  try {
    return new URLSearchParams(window.location.search).get("qa") === "1";
  } catch {
    return false;
  }
})();
const qaGoed = (goed) => (QA_AAN && goed ? "1" : undefined);

const QA_KAAL = (() => {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get("qa") === "1" && p.get("kaal") === "1";
  } catch {
    return false;
  }
})();

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
        <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: C.oliveDark }}>
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
  if (!fb) return null;
  return (
    <div
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

// Tikvlak over een tekening: 40 px op de telefoon, 36 px vanaf sm.
function Stip({ x, y, w, h, status, actief, label, onClick, goed }) {
  if (QA_KAAL) return null;
  const kleur = status === "ok" ? C.green : status === "niet" ? C.amber : actief ? C.olive : C.red;
  const teken = status === "ok" ? "✓" : status === "niet" ? "!" : "?";
  return (
    <button
      onClick={onClick}
      data-goed={qaGoed(goed && !status)}
      className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 sm:w-9 sm:h-9"
      style={{ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }}
      aria-label={label}
    >
      {!status && <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: kleur, opacity: 0.3 }} />}
      <span
        className="absolute inset-1 rounded-full border-2 flex items-center justify-center text-[14px] font-bold text-white shadow"
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

// ─── TEKENING R1: concentrisch CLV-systeem (N40 figuur 1, PDF-pagina 8) ───
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
  return (
    <svg viewBox={`0 0 ${R1_W} ${R1_H}`} className="w-full h-auto select-none" aria-label="Doorsnede van een concentrisch CLV-systeem">
      <defs>
        <pattern id="svcArc1" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3.4" stroke={L} strokeWidth="0.45" />
        </pattern>
        <pattern id="svcGaas1" width="1.3" height="1.3" patternUnits="userSpaceOnUse">
          <path d="M0 0 H1.3 M0 0 V1.3" stroke={L} strokeWidth="0.3" />
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
        {/* begane grondvloer, doorlopend */}
        <rect x="141" y="666.7" width="296" height="11.3" fill="url(#svcArc1)" stroke={L} strokeWidth="0.7" />

        {/* schachtwanden (donkergrijs) */}
        {links.map(([a, b]) => (
          <rect key={`l${a}`} x="231" y={a} width="5.7" height={b - a} fill={wand} stroke={L} strokeWidth="0.6" />
        ))}
        {rechts.map(([a, b]) => (
          <rect key={`r${a}`} x="267.8" y={a} width="5.7" height={b - a} fill={wand} stroke={L} strokeWidth="0.6" />
        ))}

        {/* KAP: flensplaat met bouten, voet, cilinder, taps deel, gaasroosters, kapplaat, uitstroompijp */}
        <rect x="214" y="157.6" width="76.6" height="1.4" fill="white" stroke={L} strokeWidth="0.5" />
        <rect x="219.5" y="155.2" width="5.5" height="2.4" fill="white" stroke={L} strokeWidth="0.4" />
        <rect x="279.5" y="155.2" width="5.5" height="2.4" fill="white" stroke={L} strokeWidth="0.4" />
        <polygon points="233.3,157.6 271.3,157.6 269.5,151.1 235,151.1" fill="white" stroke={L} strokeWidth="0.8" />
        <rect x="237.1" y="137.4" width="30.3" height="13.7" fill="white" stroke={L} strokeWidth="0.8" />
        <polygon points="237.1,137.4 267.4,137.4 269.5,118 235.1,118" fill="white" stroke={L} strokeWidth="0.8" />
        <rect x="235.1" y="102.4" width="34.4" height="15.6" fill="white" stroke={L} strokeWidth="0.8" />
        <rect x="235.4" y="102.6" width="8.8" height="10.4" fill="url(#svcGaas1)" />
        <rect x="259" y="102.6" width="10.3" height="11.6" fill="url(#svcGaas1)" />
        <rect x="230.8" y="101.5" width="42.9" height="1.2" fill={L} />
        <polygon points="245.9,101.5 258.7,101.5 258.2,96.4 246.3,96.4" fill="white" stroke={L} strokeWidth="0.8" />
        {/* kanaal in de kap gestippeld */}
        <g stroke={L} strokeWidth="0.5" strokeDasharray="2.6 1.6">
          <line x1="248" y1="102.4" x2="248" y2="159" />
          <line x1="256.6" y1="102.4" x2="256.6" y2="159" />
          <line x1="242.3" y1="121" x2="242.3" y2="159" />
          <line x1="262.2" y1="121" x2="262.2" y2="159" />
          <line x1="242.3" y1="129.4" x2="262.2" y2="129.4" />
        </g>
        {/* rookgas eruit: twee pijlen schuin omhoog */}
        <g stroke={L} strokeWidth="0.7" fill={L}>
          <line x1="249.1" y1="93.6" x2="244" y2="75" />
          <path d="M243.2 71.7 L242.3 76.4 L245.4 75.6 Z" />
          <line x1="255.4" y1="93.6" x2="260.5" y2="75" />
          <path d="M261.3 71.7 L262.2 76.4 L259.1 75.6 Z" />
        </g>
        {/* lucht erin door de gaasroosters, buigt omlaag de ring in */}
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
          <line x1="262.2" y1="621.1" x2="262.2" y2="665.7" />
          <line x1="248" y1="167.5" x2="248" y2="284" />
          <line x1="248" y1="295" x2="248" y2="616.3" />
          <line x1="256.6" y1="167.5" x2="256.6" y2="284" />
          <line x1="256.6" y1="295" x2="256.6" y2="616.3" />
        </g>
        {omlaag.map(([x, a, b]) => (
          <Pijl key={`${x}-${a}`} x={x} y1={a} y2={b} />
        ))}
        <Pijl x={252.3} y1={578.8} y2={564.6} />
        {/* breeklijn: schacht en kanaal onderbroken getekend */}
        <g stroke={L} strokeWidth="0.5" fill="none">
          <path d="M229 284 q3 -2 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" />
          <path d="M229 295 q3 -2 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" />
        </g>

        {/* GESLOTEN TOESTELLEN, elk met twee leidingen door de rechterschachtwand */}
        {R1_VLOEREN.map(([b, o]) => (
          <g key={b}>
            {/* onderste leiding: eindigt in de ring (lucht) */}
            <Leiding d={`M262.2 ${o + 14.05} H295.9 V${o + 20.8}`} />
            {/* bovenste leiding: tot in de binnenbuis (rookgas), pijl buigt omhoog */}
            <Leiding d={`M256.6 ${o + 6.25} H307.8 V${o + 20.8}`} />
            <path d={`M256.6 ${o + 6.25} Q252.3 ${o + 6.25} 252.3 ${o + 2}`} fill="none" stroke={L} strokeWidth="0.6" />
            <Pijl x={252.3} y1={o + 2} y2={b - 2.2} />
            <rect x="294.1" y={o + 20.8} width="22.6" height="35.5" fill="white" stroke={L} strokeWidth="0.85" />
            <line x1="297.7" y1={o + 20.8} x2="297.7" y2={o + 56.3} stroke={L} strokeWidth="0.6" />
            <line x1="297.7" y1={o + 52} x2="316.7" y2={o + 52} stroke={L} strokeWidth="0.6" />
            <circle cx="316.7" cy={o + 47} r="1" fill="white" stroke={L} strokeWidth="0.5" />
          </g>
        ))}
        <g fontSize="8.5" fill={L}>
          <circle cx="311.3" cy="256.3" r="0.9" fill={L} />
          <line x1="311.3" y1="256.3" x2="336.8" y2="245.4" stroke={L} strokeWidth="0.45" />
          <text x="339" y="241">gesloten</text>
          <text x="339" y="250">toestel</text>
          <circle cx="245.2" cy="415.1" r="0.9" fill={L} />
          <line x1="245.2" y1="415.1" x2="284.9" y2="392.2" stroke={L} strokeWidth="0.45" />
          <text x="287" y="390">toevoerkanaal</text>
          <text x="287" y="399">lucht</text>
          <circle cx="252.3" cy="518.8" r="0.9" fill={L} />
          <line x1="252.3" y1="518.8" x2="284.9" y2="500" stroke={L} strokeWidth="0.45" />
          <text x="287" y="498">afvoerkanaal</text>
          <text x="287" y="507">verbrandingsgassen</text>
        </g>

        {/* ONDERZIJDE: binnenbuis eindigt open, inspectiedeksel op het kanaal, inspectieluik in de wand */}
        <rect x="262.2" y="610.6" width="6.6" height="11.5" fill="white" stroke={L} strokeWidth="0.75" />
        <line x1="264.6" y1="610.6" x2="264.6" y2="622.1" stroke={L} strokeWidth="0.5" />
        <rect x="273.5" y="598.6" width="1.5" height="35.5" fill="white" stroke={L} strokeWidth="0.6" />
        <path d="M275 601.5 H278 M276.5 600 V603 M275 631.2 H278 M276.5 629.7 V632.7" stroke={L} strokeWidth="0.45" />
        {/* opvangtrechter over de volle breedte van het buitenkanaal */}
        <path d="M242.3 628.4 L250.5 634 H254.1 L262.2 628.4 Z" fill="white" stroke={L} strokeWidth="0.75" />
        {/* blok met drie ronde openingen op de vloer */}
        <rect x="242.3" y="652.9" width="19.9" height="12.8" fill="white" stroke={L} strokeWidth="0.75" />
        {[246.4, 252.3, 258.2].map((cx) => (
          <circle key={cx} cx={cx} cy="659.3" r="2.5" fill="none" stroke={L} strokeWidth="0.6" />
        ))}
        {/* condensafvoer: sifon, open verbinding boven een trechter, tweede sifon, naar de binnenriolering (1) */}
        <Leiding d="M252.3 634 V641 H288.3 V650.5 Q288.3 655 294.3 655 Q300.3 655 300.3 650.5 V641 H330.5 Q332.5 641 332.5 643.5 V645.6" dik={3} lijn={0.6} />
        <path d="M329.7 647.4 L332.5 650.2 L335.3 647.4" fill="none" stroke={L} strokeWidth="0.6" />
        <rect x="292.8" y="655" width="3" height="1.8" fill="white" stroke={L} strokeWidth="0.4" />
        <rect x="335.5" y="661.5" width="3" height="1.8" fill="white" stroke={L} strokeWidth="0.4" />
        <Leiding d="M332.5 650 V657.5 Q332.5 661.5 337 661.5 Q341.5 661.5 341.5 657.5 V650 H405.8" dik={3} lijn={0.6} />
        <g fontSize="8.5" fill={L}>
          <line x1="278" y1="614" x2="297.8" y2="605.4" stroke={L} strokeWidth="0.45" />
          <path d="M275.6 615 L278.4 611.8 L279.6 614.6 Z" fill={L} />
          <text x="300" y="606">inspectieluik</text>
          <line x1="339.2" y1="643" x2="362.3" y2="619.9" stroke={L} strokeWidth="0.45" />
          <path d="M339.2 643 L340.2 639.6 L342.4 641.8 Z" fill={L} />
          <text x="364" y="618">open verbinding</text>
          <line x1="405.8" y1="650" x2="420" y2="636" stroke={L} strokeWidth="0.45" />
          <text x="421" y="637" fontSize="9">1</text>
        </g>
        {/* hartlijn en maat 2 (hart kanaal tot voorkant inspectieluik) */}
        <line x1="252.3" y1="596" x2="252.3" y2="706" stroke={L} strokeWidth="0.45" strokeDasharray="6 1.6 1 1.6" />
        <line x1="273.5" y1="666.7" x2="273.5" y2="702.1" stroke={L} strokeWidth="0.45" />
        <g stroke={L} strokeWidth="0.45" fill={L}>
          <line x1="241" y1="697.9" x2="284.9" y2="697.9" />
          <path d="M252.3 697.9 l-3.6 -1.2 v2.4 z" />
          <path d="M273.5 697.9 l3.6 -1.2 v2.4 z" />
          <circle cx="262.9" cy="697.9" r="0.8" />
          <line x1="262.9" y1="697.9" x2="270" y2="709" />
        </g>
        <text x="271" y="716" fontSize="9" fill={L}>2</text>
        <path d="M252.3 690 q-2.6 -3.6 -1.3 -4.6 q1 -0.7 1.3 0.8 q0.3 -1.5 1.3 -0.8 q1.3 1 -1.3 4.6 Z" fill="none" stroke={L} strokeWidth="0.45" />
      </g>

      {/* oordeel als stempel over de tekening */}
      {stempel && (
        <g transform="rotate(-14 210 470)">
          <rect x="70" y="438" width="280" height="62" rx="8" fill="white" opacity="0.9" stroke={stempel === "goed" ? C.green : C.red} strokeWidth="5" />
          <text x="210" y="481" textAnchor="middle" fontSize="32" fontWeight="800" fill={stempel === "goed" ? C.green : C.red}>
            {stempel === "goed" ? "GOEDGEKEURD" : "AFGEKEURD"}
          </text>
        </g>
      )}
    </svg>
  );
}

// ─── RONDE 1: IS DIT CLV NOG GOED? ───
// De zeven controlepunten van N48 §6.1 (6.1-1-01) plus de leeftijd (6.1-1-03).

const R1_PUNTEN = [
  {
    id: "kap", x: 252.3, y: 110, naam: "Kap op het dak",
    vraag: "Zijn de uitmonding en de luchtinlaat heel?", // 6.1-1-01 e
    goed: ["De kap is heel. De roosters van de luchtinlaat zijn open en niet beschadigd."],
    fout: ["Een rooster van de luchtinlaat is ingedeukt en gescheurd.", "De kap staat scheef en de uitmonding is beschadigd."],
    waaromOk: "Uitmonding en luchtinlaat moeten heel zijn. Dat is hier zo.",
    waaromNiet: "Uitmonding en luchtinlaat moeten heel zijn. Een beschadiging is een reden om af te keuren.", // 6.1-1-02
    aandacht: "Controleer of de uitmonding en de luchtinlaat op het dak heel zijn",
  },
  {
    id: "bevestiging", x: 252.3, y: 460, naam: "Kanaal in de schacht",
    vraag: "Zit de afvoer goed vast aan het gebouw?", // 6.1-1-01 d
    goed: ["Het kanaal zit overal stevig vast."],
    fout: ["Het kanaal is losgeraakt van zijn bevestiging en hangt scheef in de schacht."],
    waaromOk: "De afvoer moet goed aan het gebouw vastzitten. Dat is in orde.",
    waaromNiet: "De afvoer moet goed aan het gebouw vastzitten. Los is niet in orde.",
    aandacht: "Controleer of de afvoer goed aan het gebouw vastzit",
  },
  {
    id: "storing", x: 305.4, y: 359.2, naam: "Ketel van mevrouw Jansen",
    vraag: "Staan er storingen in die wijzen op rookgaslekkage?", // 6.1-1-01 b
    goed: ["In het storingsoverzicht van de ketel staan geen storingen die op rookgaslekkage wijzen."],
    fout: ["In het storingsoverzicht van de ketel staan storingen die wijzen op rookgaslekkage."],
    waaromOk: "Storingen die wijzen op rookgaslekkage zijn er niet. Dit punt is in orde.",
    waaromNiet: "Storingen die wijzen op rookgaslekkage betekenen: het CLV is niet in orde.",
    aandacht: "Storingen die wijzen op rookgaslekkage horen bij de beoordeling van het CLV",
  },
  {
    id: "ruimte", x: 305.4, y: 467, naam: "Opstellingsruimte van de buren",
    vraag: "Komt er rookgas in de ruimte waar de ketel hangt?", // 6.1-1-01 c
    goed: ["Je meet geen rookgas in de opstellingsruimte."],
    fout: ["Je meet rookgas in de opstellingsruimte, vlak bij de leidingen naar de schacht."],
    waaromOk: "In de opstellingsruimte mag geen rookgas komen. Dat is hier in orde.",
    waaromNiet: "Rookgas in de opstellingsruimte betekent: niet in orde.",
    aandacht: "Controleer of er rookgas in de opstellingsruimte komt",
  },
  {
    id: "binnen", x: 252.3, y: 580, naam: "Binnenkant van het kanaal",
    vraag: "Zie je bij de inwendige inspectie gebreken?", // 6.1-1-01 a
    goed: ["Je opent het deksel op het kanaal en schijnt erin met een lamp. Geen roest, geen gaten en de afdichtingsringen zijn nog soepel."],
    fout: [
      "Je opent het deksel op het kanaal en schijnt erin met een lamp. Je ziet roestplekken en een gaatje in de binnenbuis.",
      "Je opent het deksel op het kanaal en schijnt erin met een lamp. De afdichtingsringen in de verbindingen zijn hard en gescheurd.",
    ],
    waaromOk: "Bij de inwendige inspectie zie je geen gebreken. Dit punt is in orde.",
    waaromNiet: "Roest en harde afdichtingsringen zijn tekens van veroudering. Dat is een gebrek.", // 5.2f-05, 6.1-1-02
    aandacht: "Bij de inwendige inspectie let je op roest, gaten en harde afdichtingsringen",
  },
  {
    id: "luik", x: 276, y: 616, naam: "Inspectieluik onderin",
    vraag: "Kun je het rookgas- en luchtkanaal van binnen bekijken zonder leidingen in de woning los te halen?", // 6.1-1-01 g
    goed: ["Ja. Via het luik onderin de schacht kom je bij het kanaal en kun je erin kijken."],
    fout: ["Nee. Het luik is dichtgemetseld. Je kunt alleen in het kanaal kijken als je de leidingen bij een ketel losmaakt."],
    waaromOk: "Je moet in beide kanalen kunnen kijken zonder leidingen in de woning los te halen. Via het luik lukt dat.",
    waaromNiet: "Je moet in beide kanalen kunnen kijken zonder leidingen in de woning los te halen. Hier kan dat niet.",
    aandacht: "Het kanaal moet van binnen te bekijken zijn zonder leidingen in de woning los te halen",
  },
  {
    id: "condens", x: 294.3, y: 652, naam: "Condensafvoer",
    vraag: "Werkt de condensafvoer?", // 6.1-1-01 f
    goed: ["Je giet water in de opvang. Het loopt via beide sifons weg naar het riool."],
    fout: ["Je giet water in de opvang. Het blijft in de eerste sifon staan en loopt niet weg."],
    waaromOk: "De condensafvoer moet nog goed werken. Dat doet hij.",
    waaromNiet: "De condensafvoer moet nog goed werken. Blijft het water staan, dan is hij niet in orde.",
    aandacht: "Controleer of de condensafvoer nog goed werkt",
  },
];

const R1_LEEFTIJD = {
  id: "leeftijd", naam: "Gegevens van de VvE",
  vraag: "Zit het CLV nog binnen de verwachte levensduur?", // 6.1-1-03
  waaromOk: "Een rookgasafvoer gaat circa 15 jaar mee. Dit CLV zit daar nog onder.",
  waaromNiet: "Een rookgasafvoer gaat circa 15 jaar mee. Dit CLV is ouder. Leeftijd is een reden om af te keuren.", // 6.1-1-02
  aandacht: "Een rookgasafvoer gaat circa 15 jaar mee; daarna is leeftijd een afkeurreden",
};

// Elke speelbeurt een andere flat: oud, jong met gebreken of jong en in orde.
function maakR1() {
  const r = Math.random();
  const soort = r < 0.4 ? "oud" : r < 0.8 ? "gebrek" : "goed";
  // jonger dan 15 jaar is hier minstens 11 jaar: dit is een onderdruk-CLV en
  // dat werd sinds 2015 niet meer toegepast (5.1c-07)
  const leeftijd = soort === "oud" ? 16 + Math.floor(Math.random() * 4) : 11 + Math.floor(Math.random() * 4);
  const aantalFout = soort === "goed" ? 0 : soort === "gebrek" ? 1 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3);
  const fout = new Set(schud(R1_PUNTEN.map((p) => p.id)).slice(0, aantalFout));
  const bevinding = {};
  for (const p of R1_PUNTEN) {
    bevinding[p.id] = fout.has(p.id) ? { ok: false, tekst: kies(p.fout) } : { ok: true, tekst: kies(p.goed) };
  }
  bevinding.leeftijd = { ok: leeftijd < 15, tekst: `Volgens de gegevens van de VvE is het CLV ${leeftijd} jaar oud.` };
  return { leeftijd, bevinding, eindOk: leeftijd < 15 && aantalFout === 0 };
}

const R1_OORDEEL = [
  { id: "goed", tekst: "Goedkeuren: het CLV is in orde." },
  { id: "afkeur", tekst: "Afkeuren: het CLV is niet zomaar herbruikbaar. Je meldt het aan de eigenaar (VvE) voor een plan." },
  { id: "geen", tekst: "Geen oordeel nodig: je vervangt alleen de ketel. Het CLV is van de VvE." },
];

function Ronde1({ beoordeel, onDone, noteer, zonderIntro, startStap }) {
  const [gestart, setGestart] = useState(zonderIntro);
  const [opzet] = useState(maakR1);
  const [stap, setStap] = useState(startStap === 2 ? 2 : 1);
  const [klaar, setKlaar] = useState({}); // id -> "ok" | "niet"
  const [actief, setActief] = useState(null);
  const [foutKnop, setFoutKnop] = useState([]);
  const [fb, setFb] = useState(null);
  const [oordeelFout, setOordeelFout] = useState([]);
  const [oordeel, setOordeel] = useState(null);

  const allePunten = [...R1_PUNTEN, R1_LEEFTIJD];
  const aantalKlaar = Object.keys(klaar).length;
  const punt1 = actief ? allePunten.find((p) => p.id === actief) : null;
  const bev = actief ? opzet.bevinding[actief] : null;

  const open = (id) => {
    if (klaar[id]) return;
    setActief(id);
    setFoutKnop([]);
    setFb(null);
  };

  const antwoord = (zegtOk, e) => {
    if (!punt1 || klaar[punt1.id]) return;
    const goed = zegtOk === bev.ok;
    if (goed) {
      beoordeel("goed", punt(e));
      setKlaar((k) => ({ ...k, [punt1.id]: bev.ok ? "ok" : "niet" }));
      setFb({ goed: true, tekst: bev.ok ? punt1.waaromOk : punt1.waaromNiet });
    } else {
      beoordeel("fout", punt(e));
      noteer(punt1.aandacht);
      setFoutKnop((f) => [...f, zegtOk ? "ok" : "niet"]);
      setFb({ goed: false, tekst: bev.ok ? punt1.waaromOk : punt1.waaromNiet });
    }
  };

  const kiesOordeel = (o, e) => {
    const juist = opzet.eindOk ? "goed" : "afkeur";
    if (o.id === juist) {
      beoordeel("goed", punt(e));
      setOordeel(o.id);
      playSound("levelup");
      setFb({
        goed: true,
        tekst: opzet.eindOk
          ? "Alle punten zijn in orde en het CLV is jonger dan circa 15 jaar. Dan zijn er geen maatregelen nodig op basis van leeftijd. Mevrouw Jansen krijgt haar nieuwe ketel." // 6.1-1-05
          : "Een of meer punten zijn niet in orde, of het CLV is ouder dan circa 15 jaar. Dan is het niet zomaar herbruikbaar. De eigenaar hoort het van jou; met hem komt er een plan.", // 6.1-1-02, 6.1-3-01
      });
      return;
    }
    beoordeel("fout", punt(e));
    setOordeelFout((f) => [...f, o.id]);
    if (o.id === "geen") {
      noteer("Bij een ketelwissel op een CLV beoordeel je eerst de staat van het CLV zelf");
      setFb({ goed: false, tekst: "Vervang je een ketel op een CLV, dan beoordeel je eerst de staat van het CLV zelf." }); // eindterm 6.1 stap 1
    } else if (o.id === "goed") {
      noteer("Is een punt niet in orde of is het CLV ouder dan circa 15 jaar, dan keur je af");
      setFb({ goed: false, tekst: "Je vond een punt dat niet in orde is, of het CLV is ouder dan circa 15 jaar. Dan keur je af." });
    } else {
      noteer("Alles in orde en jonger dan circa 15 jaar: dan is afkeuren niet nodig");
      setFb({ goed: false, tekst: "Alle punten zijn in orde en het CLV is jonger dan circa 15 jaar. Afkeuren is niet nodig." });
    }
  };

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 1: Is dit CLV nog goed?" intro="Flat De Linde. Mevrouw Jansen wil een nieuwe ketel." onStart={() => setGestart(true)}>
        <UitlegItem term="Eerst het CLV">
          {/* eindterm 6.1 stap 1; 6.1-1-01 */}
          vervang je een ketel op een CLV, dan beoordeel je eerst het CLV zelf: de binnenkant, de kap, de bevestiging, de condensafvoer en of er rookgas lekt.
        </UitlegItem>
        <UitlegItem term="Levensduur">
          {/* 6.1-1-03, 5.2f-05 */}
          een rookgasafvoer gaat circa 15 jaar mee. Daarna roest metaal, wordt kunststof bros en worden afdichtingsringen hard.
        </UitlegItem>
        <UitlegItem term="Leeftijd telt">
          {/* 6.1-2-01 */}
          is de ketel jonger dan het kanaal, dan bepaalt de leeftijd van het kanaal wat je doet.
        </UitlegItem>
      </RondeIntro>
    );
  }

  const paneel = stap === 1 && punt1 && (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] p-3 md:static md:p-0 md:z-auto"
      style={{ filter: "drop-shadow(0 -4px 12px rgba(0,0,0,0.15))" }}
    >
      <div className="rounded-2xl border-2 p-3 max-w-xl mx-auto flex flex-col gap-2" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.oliveDark }}>{punt1.naam}</p>
          <button className="text-xs underline px-3 min-h-[36px] min-w-[44px]" style={{ color: C.brown }} onClick={() => setActief(null)}>
            sluiten
          </button>
        </div>
        <p className="text-sm font-bold" style={{ color: C.brownText }}>{punt1.vraag}</p>
        <div className="rounded-lg px-3 py-2 text-sm italic" style={{ backgroundColor: "#FDF4E9", color: C.brownText }}>
          Wat je ziet: {bev.tekst}
        </div>
        {!klaar[punt1.id] ? (
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "ok", tekst: "In orde" },
              { id: "niet", tekst: "Niet in orde" },
            ].map((k) => (
              <button
                key={k.id}
                disabled={foutKnop.includes(k.id)}
                onClick={(e) => antwoord(k.id === "ok", e)}
                data-goed={qaGoed((k.id === "ok") === bev.ok)}
                className="min-h-[44px] rounded-xl border-2 text-sm font-bold"
                style={{
                  backgroundColor: foutKnop.includes(k.id) ? C.redLight : "white",
                  borderColor: foutKnop.includes(k.id) ? C.red : k.id === "ok" ? C.green : C.amber,
                  color: C.brownText,
                }}
              >
                {k.tekst}
              </button>
            ))}
          </div>
        ) : null}
        <Terugkoppeling fb={fb} />
        {klaar[punt1.id] && (
          <GameButton onClick={() => { setActief(null); setFb(null); }} className="w-full">
            {aantalKlaar === allePunten.length ? "Naar je oordeel" : "Volgende plek"}
          </GameButton>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6 pb-40 md:pb-6">
      <OpdrachtKop
        titel="Ronde 1: Is dit CLV nog goed?"
        stap={stap}
        stappen={2}
        opdracht={
          stap === 1
            ? "Tik op elke plek, bekijk wat je ziet en kies: in orde of niet in orde."
            : "Geef je oordeel over het CLV van flat De Linde."
        }
        teller={stap === 1 ? `${aantalKlaar} van ${allePunten.length}` : null}
      />
      {stap === 1 && (
        <Situatie wie="Mevrouw Jansen:">&quot;Mijn ketel is kapot. Kan er vandaag een nieuwe in?&quot; Voor je begint, beoordeel je het CLV van haar strang.</Situatie>
      )}

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        <div className="w-full max-w-[340px] mx-auto md:w-[330px] shrink-0 relative">
          <StrangSVG stempel={oordeel ? (oordeel === "goed" ? "goed" : "af") : null} />
          {stap === 1 &&
            R1_PUNTEN.map((p) => (
              <Stip key={p.id} x={r1x(p.x)} y={r1y(p.y)} w={R1_W} h={R1_H} status={klaar[p.id]} actief={actief === p.id} label={p.naam} onClick={() => open(p.id)} goed={!actief} />
            ))}
        </div>

        <div className={`flex-1 w-full flex flex-col gap-3 ${stap === 2 ? "order-first md:order-none" : ""}`}>
          {stap === 1 && (
            <button
              onClick={() => open("leeftijd")}
              data-goed={qaGoed(!klaar.leeftijd && !actief)}
              className="w-full rounded-xl border-2 px-3 py-2 min-h-[44px] flex items-center gap-2 text-left"
              style={{
                backgroundColor: klaar.leeftijd ? (klaar.leeftijd === "ok" ? C.greenLight : "#FCE9D8") : "white",
                borderColor: klaar.leeftijd ? (klaar.leeftijd === "ok" ? C.green : C.amber) : C.red,
              }}
            >
              <FileText className="w-5 h-5 shrink-0" style={{ color: C.brownText }} />
              <span className="text-sm font-bold" style={{ color: C.brownText }}>
                Gegevens van de VvE {klaar.leeftijd ? (klaar.leeftijd === "ok" ? "✓" : "!") : "(tik om te bekijken)"}
              </span>
            </button>
          )}

          {stap === 1 && !punt1 && (
            <p className="text-sm italic hidden md:block" style={{ color: C.brown }}>
              Tik op een rode stip in de tekening of op de gegevens van de VvE.
            </p>
          )}
          {paneel}

          {stap === 1 && aantalKlaar === allePunten.length && !punt1 && (
            <GameButton onClick={() => { setStap(2); setFb(null); }} className="w-full">
              Naar je oordeel
            </GameButton>
          )}

          {stap === 2 && (
            <div className="rounded-2xl border-2 p-3 flex flex-col gap-3" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
                <span className="text-sm font-bold" style={{ color: C.brownText }}>Jouw inspectie</span>
              </div>
              <ul className="text-xs flex flex-col gap-1" style={{ color: C.brownText }}>
                {allePunten.map((p) => {
                  const st = klaar[p.id] ?? (opzet.bevinding[p.id].ok ? "ok" : "niet");
                  return (
                    <li key={p.id} className="flex gap-1.5 items-start">
                      <span className="font-bold" style={{ color: st === "ok" ? C.green : C.amber }}>{st === "ok" ? "✓" : "!"}</span>
                      <span>
                        {p.naam}: {st === "ok" ? "in orde" : "niet in orde"}
                        {p.id === "leeftijd" ? ` (${opzet.leeftijd} jaar)` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Keuzes opties={R1_OORDEEL} fout={oordeelFout} goedId={oordeel} juist={[opzet.eindOk ? "goed" : "afkeur"]} onKies={kiesOordeel} />
              <Terugkoppeling fb={fb} />
              {oordeel && (
                <GameButton onClick={onDone} variant="green" className="w-full">
                  Naar de controlevragen
                </GameButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TEKENING R2: combinatie RGAV en ventilatieafvoer, VMC/MVS (N48 figuur 10, PDF-pagina 25) ───

const VMC_W = 260;
const VMC_H = 590;
const VMC_VLOER_ONDER = [91, 218.5, 331, 443.5]; // onderkant van dak en vloeren, per verdieping
const VMC_VLOER_BOVEN = [212.5, 325, 437.5, 571.5]; // bovenkant van de volgende vloer

function VmcSVG({ ventilatorAan }) {
  const grijs = "#9a9a9a";
  return (
    <svg viewBox={`0 0 ${VMC_W} ${VMC_H}`} className="w-full h-auto select-none" aria-label="Doorsnede van een VMC (MVS)">
      <defs>
        <pattern id="svcArc2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={C.brownText} strokeWidth="0.9" />
        </pattern>
      </defs>

      {/* dak en vloeren (gearceerd) */}
      <rect x="70" y="85" width="150" height="6" fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1.1" />
      {[212.5, 325, 437.5].map((y) => (
        <rect key={y} x="70" y={y} width="150" height="6" fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1.1" />
      ))}
      <rect x="70" y="571.5" width="150" height="7.5" fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1.1" />

      {/* linkerwand (gearceerd), over de hele hoogte */}
      <rect x="82.5" y="91" width="7.5" height="480.5" fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1.1" />

      {/* luchttoevoer bovendaks: kragen links en rechts (gearceerd), dichte bovenkant */}
      <rect x="82.5" y="42" width="7.5" height="43" fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1.1" />
      <rect x="170" y="42" width="6" height="43" fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1.1" />
      <line x1="82.5" y1="40" x2="176" y2="40" stroke={C.brownText} strokeWidth="1.6" />
      <g stroke={C.brownText} strokeWidth="1.2" fill={C.brownText}>
        <line x1="47" y1="63" x2="78" y2="63" />
        <path d="M82 63 l-6 -2.5 v5 z" />
        <line x1="215" y1="63" x2="182" y2="63" />
        <path d="M178 63 l6 -2.5 v5 z" />
      </g>
      <circle cx="200" cy="63" r="1.2" fill={C.brownText} />
      <line x1="200" y1="63" x2="212" y2="50" stroke={C.brownText} strokeWidth="0.8" />
      <text x="214" y="50" fontSize="10" fill={C.brownText}>2</text>

      {/* centrale afvoerbuis van onder, door het dak, tot de ventilator */}
      <rect x="122.5" y="38" width="12.5" height="444.5" fill="white" stroke={C.brownText} strokeWidth="1.4" />
      <line x1="122.5" y1="482.5" x2="135" y2="482.5" stroke={C.brownText} strokeWidth="2" />

      {/* ventilator (1) boven op de afvoerbuis, met pijl omhoog */}
      <polygon points="123,22 140,22 143,26 143,34 140,38 123,38 120,34 120,26" fill="white" stroke={C.brownText} strokeWidth="1.3" />
      <g
        style={{
          transformBox: "view-box",
          transformOrigin: "131.5px 30px",
          animation: ventilatorAan ? "spinFan 0.9s linear infinite" : "none",
        }}
      >
        <ellipse cx="127.2" cy="30" rx="4.2" ry="1.6" fill="none" stroke={C.brownText} strokeWidth="0.9" />
        <ellipse cx="135.8" cy="30" rx="4.2" ry="1.6" fill="none" stroke={C.brownText} strokeWidth="0.9" />
      </g>
      {ventilatorAan && (
        <g stroke={C.brownText} strokeWidth="1.4" fill={C.brownText}>
          <line x1="131.5" y1="18" x2="131.5" y2="6" />
          <path d="M131.5 1 l-3 6 h6 z" />
        </g>
      )}
      <line x1="141" y1="26" x2="155" y2="12" stroke={C.brownText} strokeWidth="0.8" />
      <text x="157" y="13" fontSize="10" fill={C.brownText}>1</text>

      {/* per verdieping: middenwand, rechterwand, ventilatieleiding (3), afvoer B1, B1-toestel */}
      {VMC_VLOER_ONDER.map((onder, i) => {
        const boven = VMC_VLOER_BOVEN[i];
        const opening = boven - 16; // pijl van de schacht naar de woning
        const vent = onder + 12;
        const afv = onder + 24;
        const b1 = onder + 34;
        return (
          <g key={onder}>
            {/* middenwand (gearceerd) met opening onderaan */}
            <rect x="150" y={onder} width="6" height={opening - 5 - onder} fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1" />
            <rect x="150" y={opening + 5} width="6" height={boven - opening - 5} fill="url(#svcArc2)" stroke={C.brownText} strokeWidth="1" />
            {/* rechterwand (grijs) met opening voor de ventilatieleiding */}
            <rect x="202.5" y={onder} width="6" height={vent - 4 - onder} fill={grijs} stroke={C.brownText} strokeWidth="1" />
            <rect x="202.5" y={vent + 8} width="6" height={boven - vent - 8} fill={grijs} stroke={C.brownText} strokeWidth="1" />
            {/* ventilatieleiding uit de woning naar de afvoerbuis */}
            <rect x="135" y={vent - 2} width="97.5" height="6" fill="white" stroke={C.brownText} strokeWidth="1.1" />
            <g stroke={C.brownText} strokeWidth="1.1" fill={C.brownText}>
              <line x1="252" y1={vent + 1} x2="238" y2={vent + 1} />
              <path d={`M235 ${vent + 1} l6 -2.5 v5 z`} />
            </g>
            {/* afvoer van het B1-toestel naar de afvoerbuis */}
            <path d={`M135 ${afv} H178 V${b1}`} fill="none" stroke={C.brownText} strokeWidth="4" />
            <path d={`M135 ${afv} H178 V${b1}`} fill="none" stroke="white" strokeWidth="1.8" />
            {/* B1-toestel */}
            <rect x="169" y={b1} width="22" height="46" fill="white" stroke={ventilatorAan ? C.brownText : C.red} strokeWidth="1.3" />
            <text x="176" y={b1 + 24} fontSize="10" fontStyle="italic" fill={C.brownText}>B</text>
            <text x="183" y={b1 + 27} fontSize="7" fontStyle="italic" fill={C.brownText}>1</text>
            {!ventilatorAan && (
              <text x="180" y={b1 + 40} fontSize="8" fontWeight="800" textAnchor="middle" fill={C.red}>UIT</text>
            )}
            {/* lucht omlaag in de schacht en naar de woning */}
            <g stroke={C.brownText} strokeWidth="1.1" fill={C.brownText}>
              <line x1="105" y1={onder + 5} x2="105" y2={onder + 19} />
              <path d={`M105 ${onder + 22} l-2.5 -6 h5 z`} />
              <line x1="141" y1={opening} x2="168" y2={opening} />
              <path d={`M172 ${opening} l-6 -2.5 v5 z`} />
            </g>
          </g>
        );
      })}
      <line x1="232.5" y1="103" x2="244" y2="92" stroke={C.brownText} strokeWidth="0.8" />
      <text x="246" y="92" fontSize="10" fill={C.brownText}>3</text>
    </svg>
  );
}

// ─── RONDE 2: WAT DOE JE BIJ VERVANGING? ───

// Klus 1: vier ketels naast elkaar; een voldoet aan alle vier voorwaarden (5.2g-01).
const KETEL_EISEN = [
  {
    id: "klep", label: "Terugslagklep", goed: "samen met de ketel gekeurd", fout: "los gekocht, niet met de ketel gekeurd",
    uitleg: "De terugslagklep moet samen met de ketel gekeurd zijn. Een los gekochte klep voldoet niet.", // 5.2g-01, 5.2b-02
  },
  {
    id: "belasting", label: "Maximale belasting", goed: "24 kW", fout: "30 kW",
    uitleg: "De maximale belasting mag niet hoger zijn dan die van de oude ketel (24 kW).", // 5.2g-01
  },
  {
    id: "toekomst", label: "Belasting geschikt voor het nieuwe kanaal", goed: "ja", fout: "nee",
    uitleg: "De belasting moet passen bij het nieuwe kanaal dat er straks komt.", // 5.2g-01
  },
  {
    id: "druk", label: "Bestand tegen overdruk bij minimale belasting (met aansluitleiding)", goed: "30 Pa", fout: "15 Pa",
    uitleg: "De ketel met aansluitleiding moet bestand zijn tegen minimaal 25 Pa overdruk.", // 5.2g-01, T19
  },
];

function maakKetels() {
  const faalt = schud(KETEL_EISEN.map((e) => e.id)).slice(0, 3);
  const kaarten = [{ id: "goed", faalt: null }, ...faalt.map((f) => ({ id: `k-${f}`, faalt: f }))];
  return schud(kaarten).map((k, i) => ({ ...k, naam: `Ketel ${"ABCD"[i]}` }));
}

const KLUSSEN = [
  { id: "ketel", soort: "ketels", handelingen: 1 },
  {
    id: "plan", soort: "keuze", handelingen: 1,
    wie: "Meneer Bakker (flat De Linde)",
    situatie: "krijgt als eerste in zijn strang een nieuwe ketel. De ketel werkt prima op het oude kanaal.",
    opdracht: "Kies wat je nog regelt.",
    opties: [
      { id: "goed", tekst: "Met de eigenaar (VvE) een vervangings- of renovatieplan voor de hele strang opstellen." },
      { id: "niets", tekst: "Niets meer. De ketel werkt zonder storing, dus het kanaal is in orde." },
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
  { id: "tijdlijn", soort: "tijdlijn", handelingen: 3 },
  {
    id: "c11", soort: "keuze", handelingen: 1,
    wie: "Flat Het Anker",
    situatie: "wordt gerenoveerd. De VvE kiest een toestelgebonden CLV (C(11)): het kanaal is samen met de ketel gekeurd.",
    opdracht: "Kies wat dit betekent voor de ketels in de strang.",
    opties: [
      { id: "goed", tekst: "Alle ketels worden vervangen door een type (C(11)) en een fabricaat." },
      { id: "c10", tekst: "Elke bewoner kiest zelf een merk, als het maar een C(10)-ketel is." },
      { id: "oud", tekst: "Alleen de ketels die ouder zijn dan 15 jaar worden vervangen." },
    ],
    // 6.1-3-02, 5.1b-08
    waarom: "Bij een toestelgebonden CLV worden na renovatie alle ketels een type (C(11)) en een fabricaat. Een losse ketelwissel met een ander merk kan hier niet.",
    fout: {
      c10: "Merken door elkaar mag alleen bij een CLV met overdrukdimensionering en C(10)-ketels. Dit is een toestelgebonden CLV: alle ketels een type (C(11)) en een fabricaat.",
      oud: "Bij een toestelgebonden CLV gaan alle ketels in de strang over op een type (C(11)) en een fabricaat, ook de jongere.",
    },
    aandacht: "Toestelgebonden CLV (C(11)): alle ketels een type en een fabricaat",
  },
  {
    id: "voering", soort: "keuze", handelingen: 1,
    wie: "Flat De Linde",
    situatie: "krijgt een overdruksysteem in plaats van het oude onderdruk-CLV. Het plan is een voering in het oude kanaal. Jij meet: het kanaal is te smal voor de voering die nodig is.",
    opdracht: "Kies de oplossing.",
    opties: [
      { id: "goed", tekst: "Het hele systeem vervangen." },
      { id: "dun", tekst: "Een dunnere voering nemen dan eigenlijk nodig is." },
      { id: "laten", tekst: "Het onderdruk-CLV houden en er moderne HR-ketels op hangen." },
    ],
    // 6.1-4-03, 6.1-4-04, 5.1b-05
    waarom: "Een onderdruk-CLV dat niet meer bruikbaar is, wordt een overdruksysteem: met een voering of door alles te vervangen. Past de voering niet, dan vervang je het hele systeem.",
    fout: {
      dun: "De maat van het kanaal moet genoeg zijn voor de voering. Is hij te klein, dan vervang je het hele systeem.",
      laten: "Moderne HR-ketels mogen niet op een oud onderdruk-CLV. Past de voering niet, dan vervang je het hele systeem.",
    },
    aandacht: "Te smal voor een voering: dan vervang je het hele systeem",
  },
  {
    id: "dossier", soort: "keuze", handelingen: 1,
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

// Klus 3: tijdelijk doorgebruik op een tijdlijn (6.1-2-04, 6.1-2-05; zonder de 3 jaar, T11)
const TIJD_VAKKEN = [
  { id: "start", label: "Start" },
  { id: "jaar1", label: "Binnen 1 jaar" },
  { id: "jaar5", label: "Na maximaal 5 jaar" },
];
const TIJD_KAARTEN = [
  {
    id: "start", label: "Eerste ketel in de strang vervangen",
    waarom: "Bij de vervanging van de eerste ketel gaat de termijn in.",
  },
  {
    id: "jaar1", label: "Beheersmaatregelen klaar, zoals CO-melders in elke woning",
    waarom: "Binnen maximaal een jaar zijn de maatregelen opgesteld en uitgevoerd, zoals CO-melders in de opstellingsruimte van elke woning.",
  },
  {
    id: "jaar5", label: "Verlengde levensduur van het oude CLV is op",
    waarom: "Met die maatregelen kan het oude CLV maximaal vijf jaar langer mee.",
  },
];

// Stap 2: de VMC (MVS) in flat De Wilg (6.4)
const VMC_PLEKKEN = [
  {
    id: "ventilator", x: 131.5, y: 30, echt: true, naam: "Ventilator op het dak",
    tekst: "Een centrale ventilator op het dak zuigt rookgas en ventilatielucht samen af.", // 6.4-02
  },
  {
    id: "ventilatie", x: 222, y: 232, echt: true, naam: "Ventilatieleiding uit de woning",
    tekst: "Ventilatielucht uit de woning gaat door hetzelfde afvoerkanaal als het rookgas.", // 6.4-01
  },
  {
    id: "buis", x: 128.75, y: 382, echt: true, naam: "Het afvoerkanaal",
    tekst: "Het kanaal is meestal een gespiraliseerde, verzinkte metalen buis.", // 6.4-02
  },
  {
    id: "b1", x: 180, y: 388, echt: true, naam: "Toestel B1",
    tekst: "Een open toestel zonder eigen ventilator. Het systeem is gemaakt voor ketels met hete rookgassen die zelf geen ventilator hebben.", // 6.4-03, 6.4-07
  },
  {
    id: "lucht", x: 56, y: 63, echt: false, naam: "Luchttoevoer bovenin",
    tekst: "Hier komt lucht binnen. Dat is niet het kenmerk: bij een VMC (MVS) gaan rookgas en ventilatielucht samen de afvoer in.", // 6.4-01
  },
  {
    id: "opening", x: 157, y: 535, echt: false, naam: "Opening naar de woning",
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
      <Terugkoppeling fb={fb} />
      {goedId && <GameButton onClick={onKlaar} className="w-full">Volgende</GameButton>}
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
        tekst: "Deze ketel voldoet aan alle vier: klep samen gekeurd, niet zwaarder dan de oude, geschikt voor het nieuwe kanaal en bestand tegen minimaal 25 Pa. Een C(10)-ketel voldoet aan deze vier.",
      });
    } else {
      beoordeel("fout", punt(e));
      noteer("Nieuwe ketel op een bestaand CLV: klep samen gekeurd, niet zwaarder, past bij het nieuwe kanaal, minimaal 25 Pa");
      setFout((f) => [...f, k.id]);
      setFb({ goed: false, tekst: KETEL_EISEN.find((x) => x.id === k.faalt).uitleg });
    }
  };
  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      <Situatie wie="Mevrouw Jansen (flat De Linde)">
        heeft een kapotte ketel van 24 kW. Het CLV van de flat wordt binnenkort vervangen. Haar nieuwe ketel moet ook op het nieuwe kanaal passen.
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
              data-goed={qaGoed(!k.faalt && !goedId)}
              disabled={isFout || !!goedId}
              className="text-left rounded-xl border-2 p-2 flex flex-col gap-1"
              style={{
                backgroundColor: isGoed ? C.greenLight : isFout ? C.redLight : "white",
                borderColor: isGoed ? C.green : isFout ? C.red : C.brownText,
                opacity: goedId && !isGoed ? 0.55 : 1,
              }}
            >
              <span className="text-sm font-bold italic" style={{ color: C.brownText }}>{k.naam}</span>
              {KETEL_EISEN.map((eis) => (
                <span key={eis.id} className="text-[11px] leading-tight" style={{ color: C.brownText }}>
                  <span style={{ color: C.brown }}>{eis.label}: </span>
                  <span className="font-bold">{k.faalt === eis.id ? eis.fout : eis.goed}</span>
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <Terugkoppeling fb={fb} />
      {goedId && <GameButton onClick={onKlaar} className="w-full">Volgende</GameButton>}
    </div>
  );
}

function KlusTijdlijn({ beoordeel, noteer, onKlaar }) {
  const [kaarten] = useState(() => schud(TIJD_KAARTEN));
  const [geplaatst, setGeplaatst] = useState({}); // vak -> kaart
  const [fb, setFb] = useState(null);
  const alles = Object.keys(geplaatst).length === TIJD_VAKKEN.length;
  const drop = (vakId) => (payload, pt) => {
    if (geplaatst[vakId]) return undefined;
    const kaart = TIJD_KAARTEN.find((k) => k.id === payload);
    if (!kaart || Object.values(geplaatst).includes(payload)) return undefined;
    if (kaart.id === vakId) {
      setGeplaatst((g) => ({ ...g, [vakId]: payload }));
      beoordeel("goed", pt);
      setFb({ goed: true, tekst: kaart.waarom });
      playSound("drop");
      return "correct";
    }
    beoordeel("fout", pt, { slepen: true });
    noteer("Tijdelijk doorgebruik: start bij de eerste ketel, binnen een jaar maatregelen, maximaal vijf jaar langer");
    setFb({ goed: false, tekst: `${kaart.label} hoort hier niet. ${kaart.waarom}` });
    return "wrong";
  };
  return (
    <div className="w-full max-w-2xl flex flex-col gap-3">
      <Situatie wie="De VvE van flat De Linde">
        wil het oude CLV nog een tijd gebruiken. Dat tijdelijke doorgebruik mag alleen onder strikte voorwaarden.
      </Situatie>
      <p className="text-sm font-bold" style={{ color: C.brownText }}>Sleep (of tik) elk kaartje naar het juiste moment op de tijdlijn.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TIJD_VAKKEN.map((v) => {
          const kaart = TIJD_KAARTEN.find((k) => k.id === geplaatst[v.id]);
          return (
            <DropTarget key={v.id} id={`tijd-${v.id}`} onDropItem={drop(v.id)}>
              {({ isHover, flash }) => (
                <div
                  data-vak={v.id}
                  className="rounded-xl border-2 border-dashed p-2 min-h-[72px] flex flex-col gap-1"
                  style={{
                    borderColor: flash === "wrong" ? C.red : kaart ? C.green : isHover ? C.olive : C.brownText,
                    backgroundColor: flash === "wrong" ? C.redLight : kaart ? C.greenLight : isHover ? C.oliveLight : "white",
                  }}
                >
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.oliveDark }}>{v.label}</span>
                  {kaart ? (
                    <span className="text-xs font-bold" style={{ color: C.green }}>{kaart.label}</span>
                  ) : (
                    <span className="text-[11px] italic" style={{ color: C.brown }}>sleep hier een kaartje</span>
                  )}
                </div>
              )}
            </DropTarget>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {kaarten
          .filter((k) => !Object.values(geplaatst).includes(k.id))
          .map((k) => (
            <Draggable key={k.id} payload={k.id} ghost={<DragCard label={k.label} small />}>
              <div data-kaart={k.id} className="rounded-xl px-3 py-2.5 min-h-[44px] text-sm font-bold border-2 text-white" style={{ backgroundColor: C.olive, borderColor: C.oliveDark }}>
                {k.label}
              </div>
            </Draggable>
          ))}
      </div>
      <Terugkoppeling fb={fb} />
      {alles && <GameButton onClick={onKlaar} className="w-full">Volgende</GameButton>}
    </div>
  );
}

function VmcStap({ beoordeel, noteer, onDone }) {
  const [gevonden, setGevonden] = useState([]);
  const [foutPlek, setFoutPlek] = useState([]);
  const [fb, setFb] = useState(null);
  const [ventilatorAan, setVentilatorAan] = useState(true);
  const [getest, setGetest] = useState(false);
  const [opties] = useState(() => schud(VMC_OPLOSSINGEN));
  const [gekozen, setGekozen] = useState([]);
  const [foutOpl, setFoutOpl] = useState([]);
  const echt = VMC_PLEKKEN.filter((p) => p.echt);
  const fase = gevonden.length < echt.length ? "zoek" : !getest ? "test" : gekozen.length < 2 ? "advies" : "klaar";

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
    setFb({ goed: true, tekst: "Valt de dakventilator uit, dan zet een beveiliging alle ketels in de strang uit." });
  };

  const kiesOpl = (o, e) => {
    if (gekozen.includes(o.id) || foutOpl.includes(o.id)) return;
    if (o.goed) {
      beoordeel("goed", punt(e));
      const nieuw = [...gekozen, o.id];
      setGekozen(nieuw);
      setFb({
        goed: true,
        tekst:
          nieuw.length < 2
            ? "Dat is een van de twee oplossingen. Er is er nog een."
            : "Een VMC (MVS) is niet herbruikbaar als rookgasafvoer: vervangen of rookgas en ventilatie scheiden. Je advies gaat naar de eigenaar (VvE) van De Wilg.", // 6.4-05, 6.4-06
      });
      if (nieuw.length === 2) playSound("levelup");
    } else {
      beoordeel("fout", punt(e));
      noteer("VMC (MVS): niet herbruikbaar; rookgasafvoer vervangen of rookgas en ventilatie scheiden");
      setFoutOpl((f) => [...f, o.id]);
      setFb({ goed: false, tekst: o.uitleg });
    }
  };

  const opdracht =
    fase === "zoek"
      ? "Tik de 4 plekken aan waaraan je ziet dat dit een VMC (MVS) is."
      : fase === "test"
        ? "Test wat er gebeurt: zet de dakventilator uit."
        : "Kies de 2 oplossingen die je de eigenaar adviseert.";
  const teller = fase === "zoek" ? `${gevonden.length} van 4` : fase === "test" ? null : `${gekozen.length} van 2`;

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <OpdrachtKop titel="Ronde 2: Wat doe je bij vervanging?" stap={2} stappen={2} opdracht={opdracht} teller={teller} />
      <Situatie wie="Flat De Wilg.">
        Op het dak draait een grote ventilator. Bewoner Ahmed wil een nieuwe HR-ketel. Eerst stel je vast wat voor afvoer hier zit.
      </Situatie>
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        <div className="w-full max-w-[280px] mx-auto md:w-[270px] shrink-0 relative">
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
        <div className="flex-1 w-full flex flex-col gap-3">
          {gevonden.length > 0 && (
            <ul className="text-xs flex flex-col gap-1" style={{ color: C.brownText }}>
              {gevonden.map((id) => (
                <li key={id} className="flex gap-1.5">
                  <span style={{ color: C.green }} className="font-bold">✓</span>
                  {VMC_PLEKKEN.find((p) => p.id === id).naam}
                </li>
              ))}
            </ul>
          )}
          {fase === "test" && (
            <GameButton onClick={test} variant="danger" className="w-full">
              <Fan className="w-4 h-4" />
              Zet de dakventilator uit
            </GameButton>
          )}
          {(fase === "advies" || fase === "klaar") && (
            <Keuzes opties={opties} fout={foutOpl} goedIds={gekozen} klaar={fase === "klaar"} juist={VMC_OPLOSSINGEN.filter((o) => o.goed).map((o) => o.id)} onKies={kiesOpl} />
          )}
          <Terugkoppeling fb={fb} />
          {fase === "klaar" && (
            <GameButton onClick={onDone} variant="green" className="w-full">
              Naar de controlevragen
            </GameButton>
          )}
        </div>
      </div>
    </div>
  );
}

function Ronde2({ beoordeel, onDone, noteer, zonderIntro, startStap }) {
  const [gestart, setGestart] = useState(zonderIntro);
  const [volgorde] = useState(() => schud(KLUSSEN.map((k) => k.id)));
  const [nr, setNr] = useState(startStap === 2 ? KLUSSEN.length : 0);

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 2: Wat doe je bij vervanging?" intro="Eerst zes klussen. Daarna een flat met een ventilator op het dak." onStart={() => setGestart(true)}>
        <UitlegItem term="Nieuwe ketel op een bestaand CLV">
          {/* 5.2g-01 */}
          terugslagklep samen met de ketel gekeurd, niet zwaarder dan de oude ketel, geschikt voor het toekomstige kanaal en bestand tegen minimaal 25 Pa overdruk.
        </UitlegItem>
        <UitlegItem term="Eerste ketel in de strang">
          {/* 6.1-3-01, 6.1-2-04, 6.1-2-05 */}
          de start van een plan met de eigenaar (VvE). Wil de VvE het oude CLV tijdelijk houden: binnen een jaar maatregelen, zoals CO-melders in elke woning. Zo kan het maximaal vijf jaar langer mee.
        </UitlegItem>
        <UitlegItem term="VMC (MVS)">
          {/* 6.4-01, 6.4-02, 6.4-05 */}
          een ventilator op het dak zuigt rookgas en ventilatielucht samen af. Zo&apos;n systeem is niet herbruikbaar als rookgasafvoer.
        </UitlegItem>
      </RondeIntro>
    );
  }

  if (nr >= KLUSSEN.length) {
    return <VmcStap beoordeel={beoordeel} noteer={noteer} onDone={onDone} />;
  }

  const klus = KLUSSEN.find((k) => k.id === volgorde[nr]);
  const volgende = () => setNr((n) => n + 1);
  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <OpdrachtKop
        titel="Ronde 2: Wat doe je bij vervanging?"
        stap={1}
        stappen={2}
        opdracht="Lees elke klus en maak de juiste keuze."
        teller={`Klus ${nr + 1} van ${KLUSSEN.length}`}
      />
      {klus.soort === "ketels" && <KlusKetels key={klus.id} beoordeel={beoordeel} noteer={noteer} onKlaar={volgende} />}
      {klus.soort === "tijdlijn" && <KlusTijdlijn key={klus.id} beoordeel={beoordeel} noteer={noteer} onKlaar={volgende} />}
      {klus.soort === "keuze" && <KlusKeuze key={klus.id} klus={klus} beoordeel={beoordeel} noteer={noteer} onKlaar={volgende} />}
    </div>
  );
}

// ─── TEKENING R3: inspectieluik onderzijde CLV (N48 figuur 2, PDF-pagina 9) ───

const OZ_W = 400;
const OZ_H = 285;

// Tikplekken op de plaats van de nummers uit de figuur, met een wijslijn.
const OZ_PLEKKEN = [
  { id: "n1", nr: 1, x: 40, y: 105, naar: [133, 152.5], naam: "de afvoer van condenswater uit de binnenbuis" },
  { id: "n2", nr: 2, x: 40, y: 155, naar: [129.5, 166], naam: "de sifon voor de afvoer van condenswater" },
  { id: "n3", nr: 3, x: 40, y: 205, naar: [132, 195], naam: "de afvoer van regenwater onderin het luchtkanaal" },
  { id: "n4", nr: 4, x: 232, y: 75, naar: [182.7, 121], naam: "het bouwkundige inspectieluik" },
  { id: "n5", nr: 5, x: 232, y: 125, naar: [162.5, 145.7], naam: "het inspectieluik van het luchttoevoerkanaal" },
  { id: "n6", nr: 6, x: 232, y: 175, naar: [146.7, 145.3], naam: "het inspectieluik van het rookgasafvoerkanaal" },
  { id: "n7", nr: 7, x: 248, y: 262, naar: [212, 244.5], naam: "de sifon voor regen- en condenswater, buiten de schacht" },
  { id: "n8", nr: 8, x: 302, y: 172, naar: [291, 229], naam: "de open verbinding naar het riool" },
];

// Maten opgemeten uit N48 figuur 2: wand tot wand 78 eenheden, vloer op 265.
function OnderzijdeSVG({ luikOpen, water2, water7 }) {
  const wand = "#8a8a8a";
  const L = C.brownText;
  const stroom = { strokeDasharray: "5 5", animation: "flowDash 0.9s linear infinite" };
  const afvoer3 = "M133 197.5 V206 Q133 214.5 141 214.5 H193 V232 Q193 244 209 244 Q225 244 225 232 V216.8 H283 Q290 216.8 290 222 V227";
  const naarRiool = "M290 235 V243 Q290 248 296 248 H372";
  return (
    <svg viewBox={`0 0 ${OZ_W} ${OZ_H}`} className="w-full h-auto select-none" aria-label="Onderzijde van het CLV met inspectieluiken en sifons">
      <defs>
        <pattern id="svcArc3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={L} strokeWidth="1" />
        </pattern>
      </defs>
      {/* vloer (gearceerd) links en rechts van de schacht */}
      <rect x="0" y="265" width="92" height="16" fill="url(#svcArc3)" stroke={L} strokeWidth="1.2" />
      <rect x="179.2" y="265" width="214.8" height="16" fill="url(#svcArc3)" stroke={L} strokeWidth="1.2" />
      {/* schachtwanden, bovenkant schuin afgebroken */}
      <polygon points="92,51.8 101.2,47.6 101.2,265 92,265" fill={wand} stroke={L} strokeWidth="1.2" />
      <polygon points="170,16.1 179.2,11.9 179.2,118 170,118" fill={wand} stroke={L} strokeWidth="1.2" />
      <rect x="170" y="184.7" width="9.2" height="80.3" fill={wand} stroke={L} strokeWidth="1.2" />
      <line x1="82.8" y1="56" x2="188.4" y2="7.8" stroke={L} strokeWidth="1" strokeDasharray="12 3 2 3" />

      {/* buitenbuis (luchtkanaal): loopt door tot op het voetstuk */}
      <g stroke={L} strokeWidth="1.5" fill="none">
        <line x1="114" y1="41.8" x2="114" y2="237.5" />
        <line x1="149.4" y1="25.6" x2="149.4" y2="134" />
        <line x1="149.4" y1="168.6" x2="149.4" y2="237.5" />
        {/* T-stuk naar het inspectieluik van het luchtkanaal (5) */}
        <path d="M149.4 134 H160.5 M149.4 168.6 H160.5" />
        {/* opvangtrechter binnen in het luchtkanaal */}
        <path d="M114 180.6 L131 197.5 M149.4 180.6 L135 197.5" />
      </g>
      <rect x="160.5" y="131" width="3.5" height="40.6" fill="url(#svcArc3)" stroke={L} strokeWidth="1.2" />
      {/* binnenbuis (rookgas), onderaan dicht */}
      <g stroke={L} strokeWidth="1.5">
        <line x1="123.2" y1="37.6" x2="123.2" y2="150.3" />
        <line x1="140.2" y1="29.8" x2="140.2" y2="150.3" />
        <line x1="123.2" y1="150.3" x2="140.2" y2="150.3" />
      </g>
      {/* inspectieluik rookgasafvoer (6) op de binnenbuis */}
      <rect x="140.2" y="141" width="4.4" height="9" fill={L} />
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
      <path d="M127 158 H134 M144 157 H148" stroke={L} strokeWidth="1.6" />
      <rect x="133.3" y="175" width="3" height="2.4" fill="white" stroke={L} strokeWidth="0.8" />
      {water2 && <path d="M131 151 V169 Q131 174 134.75 174 Q138.5 174 138.5 169 V161 H145.5" fill="none" stroke="#3B82F6" strokeWidth="1.6" style={stroom} />}

      {/* afvoer regenwater (3) uit de trechter, door de wand naar sifon (7), open verbinding (8), naar het riool */}
      <g fill="none" stroke={L} strokeWidth="5" strokeLinejoin="round">
        <path d={afvoer3} />
        <path d={naarRiool} />
      </g>
      <g fill="none" stroke="white" strokeWidth="2.6" strokeLinejoin="round">
        <path d={afvoer3} />
        <path d={naarRiool} />
      </g>
      <path d="M284 233.5 H296" stroke={L} strokeWidth="1.6" />
      <rect x="207.5" y="246" width="3" height="2.6" fill="white" stroke={L} strokeWidth="0.8" />
      {water7 && <path d={`${afvoer3} M290 235 V243 Q290 248 296 248 H372`} fill="none" stroke="#3B82F6" strokeWidth="1.8" style={stroom} />}

      {/* voetstuk met drie ovale openingen en een stippellijn */}
      <rect x="114" y="237.5" width="35.4" height="27.5" fill="white" stroke={L} strokeWidth="1.3" />
      {[120, 131.7, 143.4].map((cx) => (
        <ellipse key={cx} cx={cx} cy="247" rx="3" ry="6" fill="none" stroke={L} strokeWidth="1.1" />
      ))}
      <line x1="114" y1="261" x2="149.4" y2="261" stroke={L} strokeWidth="1" strokeDasharray="4 3" />

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

      {/* wijslijnen en nummers zoals in de figuur */}
      {OZ_PLEKKEN.map((p) => (
        <g key={p.id}>
          <line x1={p.x} y1={p.y} x2={p.naar[0]} y2={p.naar[1]} stroke={L} strokeWidth="0.9" />
          <text x={p.x} y={p.y + 4} fontSize="11" textAnchor="middle" fill={L}>{p.nr}</text>
        </g>
      ))}
      <path d="M291 229 l-1 -6.5 l5 3.2 z" fill={L} />
    </svg>
  );
}

// ─── RONDE 3: ONDERHOUD VAN HET CLV ───

// Stap 1: CO-meetplekken uit het beheerplan (8.3-01)
const CO_PLEKKEN = [
  { id: "rga", label: "Rookgasafvoer", goed: true, waarom: "De rookgasafvoer is een van de drie vaste CO-meetplekken uit het beheerplan." }, // 8.3-01
  { id: "ltv", label: "Luchttoevoer", goed: true, waarom: "Lekt er rookgas in het kanaal, dan kan het in de luchttoevoer komen (recirculatie)." }, // 8.3-01, 5.3a-03
  { id: "ruimte", label: "Opstellingsruimte", goed: true, waarom: "Hier hangt de ketel. Rookgas hoort hier niet te komen." }, // 8.3-01, 6.1-1-01 c
  { id: "trap", label: "Trappenhuis", goed: false },
  { id: "dak", label: "Bij de kap op het dak", goed: false },
  { id: "meter", label: "Meterkast", goed: false },
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

// Stap 2: terugslagklep (8.3-02, 5.2b-02, 5.2b-03, 5.2b-04)
const KLEP_VRAGEN = [
  {
    id: "nieuw",
    wie: "Woning 2",
    situatie: "heeft de nieuwe ketel van vorig jaar, met een terugslagklep in de aansluitleiding.",
    opdracht: "Kies hoe je de klep controleert.",
    opties: [
      { id: "goed", tekst: "Kijken of de klep er zit en bij deze ketel hoort. Onderhoud volgens de instructie in de handleiding van de ketel." },
      { id: "univ", tekst: "Er een nieuwe klep van de groothandel in zetten. Die past op elke ketel en is altijd goed." },
      { id: "niets", tekst: "Niets controleren. Een terugslagklep heeft geen onderhoud nodig." },
    ],
    waarom: "De klep hoort bij de ketel en zit in de aansluitleiding. Het onderhoud staat in de handleiding van de ketel.", // 8.3-02, 5.3b-01
    fout: {
      univ: "Een klep is geen los onderdeel dat overal past. Hij hoort bij de ketel; onderhoud volgens de handleiding van de ketel.",
      niets: "De klep controleer je wel: zit hij erin en hoort hij bij de ketel. Onderhoud volgens de handleiding van de ketel.",
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
      { id: "zelf", tekst: "Meteen zelf een klep plaatsen. De fabrikant van de ketel hoef je niet te vragen." },
      { id: "niets", tekst: "Niets doen. Een oude ketel zonder klep geeft nooit problemen." },
    ],
    waarom: "Oudere ketels hebben niet altijd een terugslagklep en dat kan problemen geven. Een klep komt er alleen in als de fabrikant van de ketel hem geschikt vindt.", // 5.2b-03, 5.2b-04
    fout: {
      zelf: "Eerst de fabrikant van de ketel: die moet de klep geschikt vinden. Pas dan plaats je hem.",
      niets: "Een ketel zonder klep kan op een collectief systeem juist problemen geven. Noteer en meld het.",
    },
    aandacht: "Geen klep bij een oude ketel: melden; een klep alleen als de ketelfabrikant hem geschikt vindt",
  },
];

// Stap 3: onderzijde (8.3-03, 8.3-04, 8.3-05, 5.2a-02, 5.2a-04, 5.2d-01)
const OZ_TAKEN_VAST = {
  id: "toegang", doel: "n4", tekst: "Open de toegang tot de kanalen.",
  waarom: "Het bouwkundige inspectieluik in de schachtwand, minimaal 50 x 50 cm. Daarachter zitten de luikjes op de kanalen.",
};
const OZ_TAKEN = [
  {
    id: "lucht", doel: "n5", tekst: "Kijk in het luchttoevoerkanaal.",
    waarom: "Het luikje op het luchttoevoerkanaal. Het kanaal moet zonder speciaal gereedschap te inspecteren zijn. Je ziet geen gebreken en legt dat vast.",
  },
  {
    id: "rook", doel: "n6", tekst: "Kijk in het rookgasafvoerkanaal.",
    waarom: "Het luikje op het rookgasafvoerkanaal. Zo doe je de inwendige controle: je let op zichtbare gebreken. Niets gevonden, dat leg je vast.",
  },
  {
    id: "sifon2", doel: "n2", tekst: "Controleer de sifon onder het rookgaskanaal.",
    waarom: "De sifon onder de afvoer van condenswater. Hij moet bereikbaar zijn. Het water loopt goed door.",
  },
  {
    id: "sifon7", doel: "n7", tekst: "Controleer de sifon buiten de schacht.",
    waarom: "De sifon voor regen- en condenswater. Ook die moet bereikbaar zijn. Daarna valt het water via de open verbinding naar het riool.",
  },
];

function OnderzijdeStap({ beoordeel, noteer, onDone }) {
  const [taken] = useState(() => [OZ_TAKEN_VAST, ...schud(OZ_TAKEN)]);
  const [nr, setNr] = useState(0);
  const [klaar, setKlaar] = useState([]);
  const [fb, setFb] = useState(null);
  const taak = taken[nr];
  const luikOpen = klaar.includes("n4");

  const tik = (p, e) => {
    if (!taak || klaar.includes(p.id)) return;
    if (p.id === taak.doel) {
      beoordeel("goed", punt(e));
      setKlaar((k) => [...k, p.id]);
      setFb({ goed: true, tekst: taak.waarom });
      setNr((n) => n + 1);
      if (nr === taken.length - 1) playSound("levelup");
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

  return (
    <>
      <OpdrachtKop
        titel="Ronde 3: Onderhoud van het CLV"
        stap={3}
        stappen={3}
        opdracht={taak ? `${taak.tekst} Tik op de juiste plek.` : "Alles gecontroleerd."}
        teller={`${Math.min(nr, taken.length)} van ${taken.length}`}
      />
      <div className="w-full max-w-2xl flex flex-col gap-3 items-center">
        <div className="w-full max-w-[460px] relative">
          <OnderzijdeSVG luikOpen={luikOpen} water2={klaar.includes("n2")} water7={klaar.includes("n7")} />
          {OZ_PLEKKEN.map((p) => (
            <Stip
              key={p.id}
              x={p.x}
              y={p.y}
              w={OZ_W}
              h={OZ_H}
              status={klaar.includes(p.id) ? "ok" : null}
              label={`plek ${p.nr}`}
              onClick={(e) => tik(p, e)}
              goed={taak && p.id === taak.doel}
            />
          ))}
        </div>
        <Terugkoppeling fb={fb} />
        {!taak && (
          <GameButton onClick={onDone} variant="green" className="w-full">
            Naar de controlevragen
          </GameButton>
        )}
      </div>
    </>
  );
}

function Ronde3({ beoordeel, onDone, noteer, zonderIntro, startStap }) {
  const [gestart, setGestart] = useState(zonderIntro);
  const [stap, setStap] = useState(startStap >= 1 && startStap <= 3 ? startStap : 1);
  // stap 1
  const [chips] = useState(() => schud(CO_PLEKKEN));
  const [logboek, setLogboek] = useState([]);
  const [woningOpties] = useState(() => schud(WONINGEN_KEUZE.opties));
  const [woningFout, setWoningFout] = useState([]);
  const [woningGoed, setWoningGoed] = useState(null);
  // stap 2
  const [klepNr, setKlepNr] = useState(0);
  const [fb, setFb] = useState(null);

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

  if (!gestart) {
    return (
      <RondeIntro title="Ronde 3: Onderhoud van het CLV" intro="Flat De Linde, een jaar later. Het oude CLV wordt tijdelijk doorgebruikt." onStart={() => setGestart(true)}>
        <UitlegItem term="CO meten">
          {/* 8.3-01 */}
          volgens het beheerplan in de rookgasafvoer, de luchttoevoer en de opstellingsruimte, in elke woning. Elke meting leg je vast.
        </UitlegItem>
        <UitlegItem term="Terugslagklep">
          {/* 8.3-02, 5.3b-01 */}
          zit hij erin en hoort hij bij de ketel? Het onderhoud doe je volgens de handleiding van de ketel.
        </UitlegItem>
        <UitlegItem term="Onderin">
          {/* 8.3-03, 8.3-05, 5.2a-04 */}
          via het bouwkundige inspectieluik kom je bij de luikjes op het lucht- en het rookgaskanaal en bij de condensafvoer met twee sifons.
        </UitlegItem>
      </RondeIntro>
    );
  }

  if (stap === 3) {
    return (
      <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
        <OnderzijdeStap beoordeel={beoordeel} noteer={noteer} onDone={onDone} />
      </div>
    );
  }

  if (stap === 2) {
    const v = KLEP_VRAGEN[klepNr];
    return (
      <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
        <OpdrachtKop titel="Ronde 3: Onderhoud van het CLV" stap={2} stappen={3} opdracht={v.opdracht} teller={`${klepNr + 1} van ${KLEP_VRAGEN.length}`} />
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
  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <OpdrachtKop
        titel="Ronde 3: Onderhoud van het CLV"
        stap={1}
        stappen={3}
        opdracht={!logVol ? "Sleep (of tik) de 3 CO-meetplekken uit het beheerplan naar het logboek." : "Kies in welke woningen je meet."}
        teller={!logVol ? `${logboek.length} van 3` : null}
      />
      <div className="w-full max-w-2xl flex flex-col gap-3">
        <DropTarget id="logboek" onDropItem={dropLog}>
          {({ isHover, flash }) => (
            <div
              data-vak="logboek"
              className="rounded-2xl border-2 border-dashed p-3 flex flex-col gap-2"
              style={{
                borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
                backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
              }}
            >
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4" style={{ color: C.olive }} />
                <span className="text-sm font-bold" style={{ color: C.brownText }}>Logboek CO-metingen, woning 1</span>
              </div>
              {[0, 1, 2].map((i) => {
                const id = logboek[i];
                const chip = CO_PLEKKEN.find((c) => c.id === id);
                return (
                  <div
                    key={i}
                    className="rounded-lg border-2 px-3 py-2 text-sm flex items-center gap-2 min-h-[40px]"
                    style={{ borderColor: chip ? C.green : C.beigeMid, backgroundColor: chip ? C.greenLight : "white", color: chip ? C.green : C.brown }}
                  >
                    <span className="font-bold">{i + 1}.</span>
                    {chip ? (
                      <span className="font-bold">{chip.label}: gemeten en vastgelegd</span>
                    ) : (
                      <span className="italic">meetplek ...</span>
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
                    data-kaart={c.goed ? "logboek" : "nee"}
                    className="rounded-xl px-2 py-2.5 min-h-[44px] text-sm font-bold border-2 text-white text-center flex items-center justify-center"
                    style={{ backgroundColor: C.olive, borderColor: C.oliveDark }}
                  >
                    {c.label}
                  </div>
                </Draggable>
              ))}
          </div>
        )}
        {logVol && (
          <div className="flex flex-col gap-2">
            <Situatie wie="De strang">heeft vier woningen.</Situatie>
            <Keuzes opties={woningOpties} fout={woningFout} goedId={woningGoed} juist={["goed"]} onKies={kiesWoning} />
          </div>
        )}
        <Terugkoppeling fb={fb} />
        {woningGoed && (
          <GameButton
            onClick={() => {
              setStap(2);
              setFb(null);
            }}
            className="w-full"
          >
            Naar de terugslagklep
          </GameButton>
        )}
      </div>
    </div>
  );
}

// ─── CONTROLEVRAGEN (pools van minstens 6; per ronde twee verschillende) ───

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
    question: "Welke veroudering kan na circa 15 jaar optreden?", // 5.2f-05
    options: [
      "Metaal roest, kunststof wordt bros en afdichtingsringen worden hard.",
      "Metaal wordt bros, kunststof roest en afdichtingsringen worden zacht.",
      "Het kanaal wordt wijder en de kap zakt naar beneden.",
      "Er treedt geen veroudering op zolang de ketel goed is afgesteld.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Corrosie van metaal, bros kunststof en harde afdichtingsringen.",
    feedbackWrong: "Na circa 15 jaar: metaal corrodeert, kunststof wordt bros en afdichtingsringen harden uit.",
    aandacht: "Veroudering: metaal roest, kunststof wordt bros, afdichtingsringen worden hard",
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
      "Via het inspectieluik, zonder leidingen in de woning los te halen",
      "Door de aansluitleiding bij een ketel los te halen",
      "Door een gat in de schachtwand te boren",
      "Alleen via de kap op het dak",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De kanalen moeten van binnen te bekijken zijn zonder leidingen in de woning te demonteren.",
    feedbackWrong: "Je moet in beide kanalen kunnen kijken zonder leidingen in de opstellingsruimte los te halen: via het inspectieluik.",
    aandacht: "Het kanaal moet van binnen te bekijken zijn zonder leidingen in de woning los te halen",
  },
  {
    question: "In het storingsoverzicht van een ketel staan storingen die wijzen op rookgaslekkage. Wat betekent dat voor je oordeel over het CLV?", // 6.1-1-01 b
    options: [
      "Het CLV is niet in orde: dit is een van de controlepunten.",
      "Niets: storingen gaan alleen over de ketel.",
      "Het CLV is in orde als de storing gereset is.",
      "Je kijkt er pas naar als de bewoner klaagt.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Storingen die wijzen op rookgaslekkage horen bij de beoordeling van het CLV.",
    feedbackWrong: "Storingen die wijzen op rookgaslekkage zijn een controlepunt bij het CLV. Dan is het niet in orde.",
    aandacht: "Storingen die wijzen op rookgaslekkage horen bij de beoordeling van het CLV",
  },
  {
    question: "Welke is een reden om een bestaand collectief CLV af te keuren?", // 6.1-1-02
    options: ["Lekkage", "Het kanaal is van metaal", "Er hangen vier ketels aan", "Het kanaal is concentrisch"],
    correct: 0,
    feedbackCorrect: "Klopt. Afkeurredenen zijn onder meer leeftijd, lekkage, beschadigingen, afdichtingen en de uitmonding.",
    feedbackWrong: "Lekkage is een afkeurreden. Andere zijn leeftijd, beschadigingen, afdichtingen, de uitmonding en ongeschikte toesteltypes.",
    aandacht: "Afkeurredenen: leeftijd, lekkage, beschadigingen, afdichtingen, uitmonding, ongeschikte toestellen",
  },
  {
    question: "Een CLV is 12 jaar oud en alle controlepunten zijn in orde. Moet het om zijn leeftijd worden aangepakt?", // 6.1-1-05
    options: [
      "Nee, onder de circa 15 jaar zijn er geen maatregelen nodig op basis van leeftijd.",
      "Ja, een CLV moet na 10 jaar altijd worden aangepakt.",
      "Ja, bij elke ketelwissel gaat het CLV eruit.",
      "Dat beslist de bewoner van de bovenste woning.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd.",
    feedbackWrong: "Jonger dan circa 15 jaar en alle punten in orde: dan zijn er geen maatregelen nodig op basis van leeftijd.",
    aandacht: "Jonger dan circa 15 jaar en alles in orde: geen maatregelen op basis van leeftijd",
  },
];

const POOL_R2 = [
  {
    question: "Je vervangt een ketel op een bestaand collectief CLV. Welke terugslagklep moet de nieuwe ketel hebben?", // 5.2b-02
    options: [
      "Een klep die samen met de ketel is gekeurd",
      "Een losse klep; het merk maakt niet uit",
      "Geen klep; die hoort alleen bij nieuwbouw",
      "Een klep in de schacht, onder het kanaal",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De klep is samen met de ketel gekeurd.",
    feedbackWrong: "De nieuwe ketel heeft een terugslagklep die samen met de ketel is gekeurd.",
    aandacht: "Nieuwe ketel op een bestaand CLV: klep samen met de ketel gekeurd",
  },
  {
    question: "Mag de nieuwe ketel een hogere maximale belasting hebben dan de oude?", // 5.2g-01
    options: ["Nee, niet hoger dan de oude ketel", "Ja, als de bewoner meer warm water wil", "Ja, tot 10 % hoger", "Ja, als er een klep in zit"],
    correct: 0,
    feedbackCorrect: "Klopt. De maximale belasting is niet hoger dan die van de oude ketel.",
    feedbackWrong: "De maximale belasting van de nieuwe ketel mag niet hoger zijn dan die van de oude.",
    aandacht: "Nieuwe ketel: maximale belasting niet hoger dan de oude",
  },
  {
    question: "Tegen hoeveel overdruk moet de nieuwe ketel met aansluitleiding minimaal bestand zijn?", // 5.2g-01
    options: ["25 Pa", "5 Pa", "50 Pa", "200 Pa"],
    correct: 0,
    feedbackCorrect: "Klopt. Minimaal 25 Pa, bij minimale belasting.",
    feedbackWrong: "De ketel met aansluitleiding moet bestand zijn tegen minimaal 25 Pa overdruk.",
    aandacht: "Nieuwe ketel met aansluitleiding: bestand tegen minimaal 25 Pa overdruk",
  },
  {
    question: "Het oude CLV wordt tijdelijk doorgebruikt. Wat moet er binnen maximaal een jaar gebeuren?", // 6.1-2-04, 6.1-2-05
    options: [
      "Beheersmaatregelen opstellen en uitvoeren, zoals CO-melders in elke woning",
      "Alle ketels vervangen door C(10)-ketels",
      "Niets; pas na vijf jaar is er actie nodig",
      "Alleen de bovenste woning een CO-melder geven",
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
    feedbackCorrect: "Klopt. Maximaal vijf jaar, gerekend vanaf de eerste ketelwissel.",
    feedbackWrong: "Met beheersmaatregelen kan de levensduur maximaal vijf jaar worden verlengd.",
    aandacht: "Tijdelijk doorgebruik: maximaal vijf jaar langer",
  },
  {
    question: "Er is geen technisch dossier en je kunt niet controleren of de afvoer geschikt is. Wat doe je met de nieuwe ketel?", // 6.1-2-03
    options: ["Niet in bedrijf nemen", "In bedrijf nemen en het dossier later opvragen", "In bedrijf nemen als de bewoner tekent", "Op halve kracht in bedrijf nemen"],
    correct: 0,
    feedbackCorrect: "Klopt. Zonder dossier en zonder controle neem je de ketel niet in bedrijf.",
    feedbackWrong: "Ontbreekt het dossier en kun je de afvoer niet controleren, dan neem je de ketel niet in bedrijf.",
    aandacht: "Geen technisch dossier en geen controle mogelijk: ketel niet in bedrijf nemen",
  },
  {
    question: "Waaraan herken je een VMC (MVS)?", // 6.4-01, 6.4-02
    options: [
      "Een centrale ventilator op het dak zuigt rookgas en ventilatielucht samen af.",
      "Elke ketel heeft een eigen afvoer door de gevel.",
      "Lucht en rookgas gaan door een concentrisch kanaal, zonder ventilator op het dak.",
      "De ketels hebben elk een terugslagklep.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Rookgas en ventilatielucht gaan samen door de afvoer, met een ventilator op het dak.",
    feedbackWrong: "Bij een VMC (MVS) zuigt een centrale ventilator op het dak rookgas en ventilatielucht samen af.",
    aandacht: "Een VMC (MVS) herken je aan de dakventilator die rookgas en ventilatielucht samen afzuigt",
  },
  {
    question: "Wat gebeurt er als de dakventilator van een VMC (MVS) uitvalt?", // 6.4-04
    options: [
      "Een beveiliging zet alle ketels in de strang uit.",
      "De ketels draaien door op natuurlijke trek.",
      "Alleen de bovenste ketel gaat uit.",
      "De ventilatie stopt, maar de ketels merken niets.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij storing van de dakventilator gaan alle ketels uit.",
    feedbackWrong: "Valt de dakventilator uit, dan schakelt een beveiliging alle ketels uit.",
    aandacht: "VMC (MVS): valt de dakventilator uit, dan gaan alle ketels uit",
  },
  {
    question: "Wat is een oplossing voor een VMC (MVS) bij renovatie?", // 6.4-05
    options: [
      "De rookgasafvoer helemaal vervangen",
      "Een HR-ketel met ventilator aansluiten op het bestaande kanaal",
      "In elke ketel een terugslagklep zetten",
      "De dakventilator harder laten draaien",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Vervangen, of rookgasafvoer en ventilatie scheiden.",
    feedbackWrong: "Een VMC (MVS) is niet herbruikbaar als rookgasafvoer: vervangen of rookgas en ventilatie scheiden.",
    aandacht: "VMC (MVS): niet herbruikbaar; rookgasafvoer vervangen of rookgas en ventilatie scheiden",
  },
  {
    question: "Met wie maak je het vervangings- of renovatieplan voor de strang?", // 6.1-3-01, 6.4-06
    options: ["Met de gebouweigenaar, bijvoorbeeld de VvE", "Met de bewoner van de woning met de nieuwe ketel", "Met de bovenburen", "Met de groothandel"],
    correct: 0,
    feedbackCorrect: "Klopt. Het plan maak je met de gebouweigenaar.",
    feedbackWrong: "Het plan maak je in overleg met de gebouweigenaar, bijvoorbeeld de VvE.",
    aandacht: "Het renovatieplan maak je met de gebouweigenaar (VvE)",
  },
  {
    question: "Een toestelgebonden CLV (C(11)) wordt gerenoveerd. Wat geldt voor de ketels?", // 6.1-3-02
    options: [
      "Alle ketels worden een type (C(11)) en een fabricaat.",
      "Elke bewoner kiest zelf een merk C(10)-ketel.",
      "Alleen de ketels ouder dan 15 jaar gaan eruit.",
      "De oude ketels blijven, met een klep erbij.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Na renovatie: alle ketels een type (C(11)) en een fabricaat.",
    feedbackWrong: "Bij een toestelgebonden CLV worden na renovatie alle ketels een type (C(11)) en een fabricaat.",
    aandacht: "Toestelgebonden CLV (C(11)): alle ketels een type en een fabricaat",
  },
  {
    question: "Het kanaal is te smal voor de voering die nodig is. Wat nu?", // 6.1-4-04
    options: ["Het hele systeem vervangen", "Een dunnere voering nemen", "Het oude kanaal zo laten", "Een sterkere ventilator in de ketel"],
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
      "Alleen in de opstellingsruimte",
      "Alleen bij de kap op het dak",
      "In het trappenhuis en de meterkast",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Drie meetplekken, in elke woning.",
    feedbackWrong: "Je meet CO in de rookgasafvoer, de luchttoevoer en de opstellingsruimte, in elke woning.",
    aandacht: "CO meten volgens het beheerplan: rookgasafvoer, luchttoevoer en opstellingsruimte",
  },
  {
    question: "Wat doe je met de CO-metingen uit het beheerplan?", // 8.3-01
    options: ["Ze allemaal vastleggen", "Alleen de hoge waarden onthouden", "Niets, de meter bewaart ze vanzelf", "Alleen melden aan de bewoner"],
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
      "De sifon staat vol water.",
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
      "Volgens een algemene instructie van de groothandel",
      "Niet: een klep heeft geen onderhoud nodig",
      "Door hem bij elke beurt te vervangen door een universele klep",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De klep hoort bij de ketel; het onderhoud staat in de handleiding van de ketel.",
    feedbackWrong: "Het onderhoud van de terugslagklep doe je volgens de handleiding van de ketel.",
    aandacht: "Terugslagklep: aanwezig en bij de ketel horend; onderhoud volgens de handleiding van de ketel",
  },
  {
    question: "Een oude ketel heeft geen terugslagklep. Wanneer mag er een klep in?", // 5.2b-04
    options: [
      "Alleen als de fabrikant van de ketel de klep geschikt vindt",
      "Altijd, elke klep is beter dan geen klep",
      "Nooit, een oude ketel mag geen klep krijgen",
      "Als de VvE het goedvindt",
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
      "Ze zitten aan de buitenkant van de schachtwand",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Achter het bouwkundige luik zitten de luikjes op het lucht- en het rookgaskanaal.",
    feedbackWrong: "Achter het bouwkundige inspectieluik in de schachtwand zitten aparte luikjes op het lucht- en rookgaskanaal.",
    aandacht: "Je komt bij de luikjes op de kanalen via het bouwkundige inspectieluik in de schachtwand",
  },
  {
    question: "Waar let je op bij de condensafvoer?", // 8.3-03
    options: [
      "Of hij nog goed werkt en of beide sifons bereikbaar zijn",
      "Alleen of de leiding de goede kleur heeft",
      "Of de sifons helemaal droog staan",
      "Alleen of er een typeplaat op zit",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Werkt hij nog en kun je bij beide sifons.",
    feedbackWrong: "Bij de condensafvoer controleer je of hij nog goed werkt en of beide sifons bereikbaar zijn.",
    aandacht: "Condensafvoer: werkt hij nog en zijn beide sifons bereikbaar",
  },
  {
    question: "Hoe groot is het bouwkundige inspectieluik minimaal?", // 5.2a-02
    options: ["50 x 50 cm", "30 x 30 cm", "20 x 40 cm", "100 x 100 cm"],
    correct: 0,
    feedbackCorrect: "Klopt. Minimaal 50 x 50 cm.",
    feedbackWrong: "Het inspectieluik is minimaal 50 x 50 cm.",
    aandacht: "Het bouwkundige inspectieluik is minimaal 50 x 50 cm",
  },
];

// Twee verschillende vragen uit de pool; per vraag een eigen MCControle.
function ControleVragen({ pool, sessie, beantwoord, noteer, onKlaar, laatste }) {
  const [vragen] = useState(() => schud(pool).slice(0, 2));
  const [nr, setNr] = useState(0);
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
  "Vervang je een ketel op een CLV, beoordeel dan eerst het CLV: binnenkant, kap, bevestiging, condensafvoer, storingen en rookgas in de ruimte",
  "Een rookgasafvoer gaat circa 15 jaar mee; de leeftijd van de afvoer gaat voor die van de ketel",
  "Nieuwe ketel op een bestaand CLV: klep samen gekeurd, niet zwaarder, past bij het nieuwe kanaal, minimaal 25 Pa",
  "De eerste ketelwissel in een strang is de start van een plan met de eigenaar (VvE)",
  "Tijdelijk doorgebruik: binnen een jaar maatregelen zoals CO-melders in elke woning, maximaal vijf jaar langer",
  "VMC (MVS): dakventilator zuigt rookgas en ventilatielucht af; niet herbruikbaar, dus vervangen of scheiden",
  "Onderhoud: CO meten op drie plekken in elke woning en vastleggen, klep volgens de ketelhandleiding, condensafvoer en beide sifons",
];

export default function CLVServiceGame({ initialScreen = "start", onExit, onGameComplete, qaFase }) {
  const [screen, setScreen] = useState(initialScreen);
  const [qaZonderIntro] = useState(() => (qaFase === "opdracht" ? initialScreen : null));
  const [qaStap] = useState(leesQaStap);
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

  const resetGame = () => {
    herstart();
    setScreen("start");
    resetAandacht();
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

          {scherm === "r2" && <Ronde2 {...rondeProps("r2")} />}
          {scherm === "r2mc" && (
            <ControleVragen key="r2mc" pool={POOL_R2} sessie={sessie} beantwoord={beantwoord} noteer={noteer} onKlaar={naar("r3")} />
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
