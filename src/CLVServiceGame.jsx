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

// Tikvlak over een tekening (spelonderdeel): 44 x 44 px. Na een goede tik een vinkje.
function Stip({ x, y, w, h, status, actief, label, onClick, goed }) {
  if (QA_KAAL) return null;
  const kleur = status === "ok" ? C.green : status === "niet" ? C.amber : actief ? C.olive : C.red;
  const teken = status === "ok" ? "✓" : status === "niet" ? "!" : "?";
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

// ─── TEKENONDERDELEN (eigen gamestijl: lijnen C.brownText, wanden C.beigeMid) ───
const BLAUW = "#3B82F6";
const WATER = "#38BDF8";
// bewegende stroomlijn; stil = stilstand (dakventilator uit)
const stroom = (sec, stil = false) =>
  stil ? { strokeDasharray: "8 6", opacity: 0.35 } : { strokeDasharray: "8 6", animation: `flowDash ${sec}s linear infinite` };

// Leiding als omlijnde buis, eventueel met een gekleurde stroom erin
function Pijp({ d, kleur, stijl, dik = 7 }) {
  return (
    <g>
      <path d={d} fill="none" stroke={C.brownText} strokeWidth={dik} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="white" strokeWidth={dik - 3} strokeLinejoin="round" />
      {kleur && <path d={d} fill="none" stroke={kleur} strokeWidth="2.2" strokeLinejoin="round" style={stijl} />}
    </g>
  );
}

// Pijlpunt; hoek in graden (0 = rechts, 90 = omlaag)
function Pijlpunt({ x, y, hoek, kleur, maat = 6 }) {
  const r = (hoek * Math.PI) / 180;
  const p = (a) => `${x - maat * Math.cos(r + a)},${y - maat * Math.sin(r + a)}`;
  return <polygon points={`${x},${y} ${p(0.5)} ${p(-0.5)}`} fill={kleur} />;
}

function Arcering({ id }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="white" />
      <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.2" />
    </pattern>
  );
}

// ─── TEKENING: concentrisch CLV-systeem, eigen tekening naar N40 figuur 1 ───
// Eigen maatvoering (niet uit de figuur): twee verdiepingen met toestel,
// kanaal in het hart van de schacht, onderzijde met deksel, luik, trechter,
// voetstuk en de afvoer met twee sifons en een open verbinding.
const SV_W = 360;
const SV_H = 520;
const SV_CX = 130; // hart van het kanaal
const SV_BUITEN = [108, 152]; // buitenbuis
const SV_BINNEN = [122, 138]; // binnenbuis
const SV_WAND_L = [90, 100];
const SV_WAND_R = [160, 170];
const SV_DAK = 116; // bovenkant dak
// per verdieping: plafond (onderkant vloer of dak) en de vloer eronder
const SV_VERD = [
  { plafond: 130, vloer: 250 },
  { plafond: 264, vloer: 500 },
];
const SV_BINNEN_EIND = 396; // einde binnenbuis (dwarslijn)
const SV_TOESTEL_X = [196, 244];

function StrangSVG({ stempel }) {
  const L = C.brownText;
  const lijn = { stroke: L, strokeWidth: 2 };
  const [bL, bR] = SV_BUITEN;
  const [iL, iR] = SV_BINNEN;
  const op = stroom(0.8);
  const neer = stroom(1.1);
  const stempels = {
    geen: { tekst: "GEEN MAATREGELEN", kleur: C.green },
    door: { tekst: "TIJDELIJK DOORGEBRUIK", kleur: C.amber },
    niet: { tekst: "NIET HERBRUIKBAAR", kleur: C.red },
  };
  const st = stempel ? stempels[stempel] : null;
  // wanddelen tussen dak en vloeren; rechts open voor het bouwkundige luik
  const wandL = [[130, 250], [264, 500]];
  const wandR = [[130, 250], [264, 374], [418, 500]];
  const vloeren = [SV_DAK, 250];
  return (
    <svg viewBox={`0 0 ${SV_W} ${SV_H}`} className="w-full h-auto select-none" aria-label="Doorsnede van een concentrisch CLV-systeem">
      <defs>
        <Arcering id="svcArcA" />
        <pattern id="svcGaasA" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="white" />
          <path d="M0 0 H4 M0 0 V4" stroke={L} strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect width={SV_W} height={SV_H} fill="white" />

      {/* dak en verdiepingsvloer: door de schachtwanden heen tot vlak tegen het kanaal */}
      {vloeren.map((y) => (
        <g key={y}>
          <rect x="6" y={y} width={bL - 3 - 6} height="14" fill="url(#svcArcA)" stroke={L} strokeWidth="1.8" />
          <rect x={bR + 3} y={y} width={354 - bR - 3} height="14" fill="url(#svcArcA)" stroke={L} strokeWidth="1.8" />
        </g>
      ))}
      {/* begane-grondvloer loopt dicht door onder de schacht */}
      <rect x="4" y="500" width="352" height="14" fill="url(#svcArcA)" stroke={L} strokeWidth="1.8" />

      {/* schachtwanden */}
      {wandL.map(([a, b]) => (
        <rect key={`l${a}`} x={SV_WAND_L[0]} y={a} width={SV_WAND_L[1] - SV_WAND_L[0]} height={b - a} fill={C.beigeMid} stroke={L} strokeWidth="1.8" />
      ))}
      {wandR.map(([a, b]) => (
        <rect key={`r${a}`} x={SV_WAND_R[0]} y={a} width={SV_WAND_R[1] - SV_WAND_R[0]} height={b - a} fill={C.beigeMid} stroke={L} strokeWidth="1.8" />
      ))}

      {/* concentrisch kanaal: buitenbuis tot het voetstuk, binnenbuis tot boven de trechter */}
      <line x1={bL} y1={SV_DAK - 4} x2={bL} y2="462" {...lijn} />
      <line x1={bR} y1={SV_DAK - 4} x2={bR} y2="388" {...lijn} />
      <line x1={bR} y1="404" x2={bR} y2="462" {...lijn} />
      <line x1={iL} y1={SV_DAK} x2={iL} y2={SV_BINNEN_EIND} {...lijn} />
      <line x1={iR} y1={SV_DAK} x2={iR} y2={SV_BINNEN_EIND} {...lijn} />
      {/* dwarslijn over het einde van de binnenbuis */}
      <line x1={iL - 1} y1={SV_BINNEN_EIND} x2={iR + 1} y2={SV_BINNEN_EIND} stroke={L} strokeWidth="3" />

      {/* KAP op het dak: flens met twee bouten, voet, recht deel, deel dat naar boven breder wordt,
          kast met aan beide kanten een gaasrooster, uitstekende afdekplaat, uitstroompijpje */}
      <rect x="84" y="112" width="92" height="4" fill="white" stroke={L} strokeWidth="1.5" />
      <rect x="88" y="107" width="6" height="5" fill={L} />
      <rect x="166" y="107" width="6" height="5" fill={L} />
      <polygon points="100,112 160,112 155,104 105,104" fill="white" stroke={L} strokeWidth="1.8" />
      <rect x="106" y="88" width="48" height="16" fill="white" stroke={L} strokeWidth="1.8" />
      <polygon points="106,88 154,88 162,70 98,70" fill="white" stroke={L} strokeWidth="1.8" />
      <rect x="96" y="48" width="68" height="22" fill="white" stroke={L} strokeWidth="1.8" />
      <rect x="98" y="51" width="16" height="15" fill="url(#svcGaasA)" stroke={L} strokeWidth="1" />
      <rect x="146" y="51" width="16" height="15" fill="url(#svcGaasA)" stroke={L} strokeWidth="1" />
      <rect x="88" y="43" width="84" height="5" fill={L} />
      <rect x={iL} y="32" width={iR - iL} height="11" fill="white" stroke={L} strokeWidth="1.8" />
      {/* binnenbuis gestippeld door de kap tot het pijpje */}
      <g stroke={L} strokeWidth="1.2" strokeDasharray="4 3">
        <line x1={iL} y1="48" x2={iL} y2={SV_DAK} />
        <line x1={iR} y1="48" x2={iR} y2={SV_DAK} />
      </g>

      {/* LUCHT: van buiten schuin door beide roosters, omlaag de ring in, aan beide kanten omlaag */}
      <path d={`M38 38 L101 58 Q115 64 115 86 V392`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
      <path d={`M222 38 L159 58 Q145 64 145 86 V384`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
      <Pijlpunt x={74} y={49} hoek={17} kleur={BLAUW} />
      <Pijlpunt x={186} y={49} hoek={163} kleur={BLAUW} />
      {[205, 345].map((y) => (
        <g key={y}>
          <Pijlpunt x={115} y={y} hoek={90} kleur={BLAUW} />
          <Pijlpunt x={145} y={y} hoek={90} kleur={BLAUW} />
        </g>
      ))}
      {/* doorgetrokken pijl in de rechter ring: omlaag langs het einde van de binnenbuis, eronder naar links */}
      <path d={`M145 384 V401 Q145 406 140 406 H134`} fill="none" stroke={BLAUW} strokeWidth="2" />
      <Pijlpunt x={129} y={406} hoek={180} kleur={BLAUW} />

      {/* ROOKGAS: in de binnenbuis omhoog, uit het pijpje in een V schuin omhoog */}
      <path d={`M${SV_CX} 392 V30`} fill="none" stroke={C.red} strokeWidth="3" style={op} />
      <path d={`M127 30 L117 12`} fill="none" stroke={C.red} strokeWidth="2.4" style={op} />
      <path d={`M133 30 L143 12`} fill="none" stroke={C.red} strokeWidth="2.4" style={op} />
      <Pijlpunt x={115} y={8} hoek={-119} kleur={C.red} maat={7} />
      <Pijlpunt x={145} y={8} hoek={-61} kleur={C.red} maat={7} />
      <Pijlpunt x={SV_CX} y={160} hoek={-90} kleur={C.red} />

      {/* TOESTELLEN: elk direct onder het plafond, twee losse leidingen door de rechterschachtwand */}
      {SV_VERD.map(({ plafond }) => {
        const rook = plafond + 10; // bovenste leiding, buitenste bocht
        const lucht = plafond + 22; // onderste leiding, binnenste bocht
        const top = plafond + 38;
        const [tx0, tx1] = SV_TOESTEL_X;
        return (
          <g key={plafond}>
            {/* luchtleiding: uit de ring (op de buitenbuis) naar het linkerdeel van de toestelbovenkant */}
            <Pijp d={`M${bR} ${lucht} H202 Q208 ${lucht} 208 ${lucht + 6} V${top}`} kleur={BLAUW} stijl={neer} />
            {/* rookgasleiding: van het rechterdeel van de bovenkant, door de ring tot de binnenbuis */}
            <Pijp d={`M236 ${top} V${rook + 6} Q236 ${rook} 230 ${rook} H${iR}`} />
            <path d={`M236 ${top} V${rook + 6} Q236 ${rook} 230 ${rook} H${SV_CX + 5} Q${SV_CX} ${rook} ${SV_CX} ${rook - 5} V${rook - 14}`} fill="none" stroke={C.red} strokeWidth="2.2" style={op} />
            <Pijlpunt x={SV_CX} y={rook - 17} hoek={-90} kleur={C.red} />
            <rect x={tx0} y={top} width={tx1 - tx0} height="58" fill="white" stroke={L} strokeWidth="2" />
            <rect x={tx0 + 5} y={top + 44} width={tx1 - tx0 - 10} height="8" fill="white" stroke={L} strokeWidth="1" />
          </g>
        );
      })}

      {/* ONDERZIJDE */}
      {/* deksel op een kort stompje rechts op de buitenbuis, op de hoogte van het einde van de binnenbuis */}
      <rect x={bR} y="388" width="7" height="16" fill="white" stroke={L} strokeWidth="1.6" />
      <rect x={bR + 7} y="385" width="5" height="22" rx="1.5" fill="white" stroke={L} strokeWidth="1.6" />
      {[389, 393, 397, 401].map((y) => (
        <line key={y} x1={bR + 7} y1={y} x2={bR + 12} y2={y} stroke={L} strokeWidth="0.8" />
      ))}
      {/* bouwkundig luik: opening in de rechterschachtwand, plaat aan de woningkant, vast boven en onder */}
      <rect x={SV_WAND_R[1]} y="370" width="4" height="52" fill="white" stroke={L} strokeWidth="1.6" />
      {[374, 418].map((y) => (
        <g key={y} stroke={L} strokeWidth="1.4">
          <line x1={SV_WAND_R[0] + 3} y1={y} x2={SV_WAND_R[1] + 7} y2={y} />
          <line x1={SV_WAND_R[1] + 7} y1={y - 3} x2={SV_WAND_R[1] + 7} y2={y + 3} />
        </g>
      ))}
      {/* opvangtrechter over de volle breedte van de buitenbuis, uitloop in het midden */}
      <path d={`M${bL} 424 H${bR} M${bL} 426 Q${bL + 2} 434 ${SV_CX - 6} 436 V442 M${bR} 426 Q${bR - 2} 434 ${SV_CX + 6} 436 V442`} fill="none" stroke={L} strokeWidth="1.8" />
      {/* afvoer: omlaag, bocht naar rechts, door buitenbuis en schachtwand onder het luik, eerste sifon,
          horizontaal, bocht omlaag die vrij eindigt boven een trechter */}
      <Pijp d={`M${SV_CX} 440 V446 Q${SV_CX} 452 ${SV_CX + 6} 452 H184 Q190 452 190 458 V466 Q190 474 198 474 Q206 474 206 466 V458 Q206 452 212 452 H248 Q254 452 254 458 V464`} />
      <path d="M190 466 Q190 474 198 474 Q206 474 206 466" fill="none" stroke={WATER} strokeWidth="3.6" />
      {/* trechter onder het vrije einde (zichtbare spleet), tweede sifon direct eronder, leiding naar het riool */}
      <polygon points="244,470 264,470 257,478 251,478" fill="white" stroke={L} strokeWidth="1.6" />
      <Pijp d="M254 478 V482 Q254 492 262 492 Q270 492 270 484 Q270 478 276 478 H350" />
      <path d="M254 484 Q254 492 262 492 Q270 492 270 484" fill="none" stroke={WATER} strokeWidth="3.6" />
      <text data-spel="label" x="306" y="470" fontSize="14" fontWeight="700" fill={C.brown} textAnchor="middle">riool</text>
      {/* voetstuk binnen de buitenbuis met drie openingen */}
      <rect x={bL} y="462" width={bR - bL} height="38" fill="white" stroke={L} strokeWidth="2" />
      {[117, 130, 143].map((x) => (
        <ellipse key={x} cx={x} cy="481" rx="4.2" ry="8" fill="white" stroke={L} strokeWidth="1.5" />
      ))}

      {/* oordeel als stempel over de tekening */}
      {st && (
        <g data-spel="stempel" transform="rotate(-14 180 300)">
          <rect x="20" y="272" width="320" height="56" rx="8" fill="white" opacity="0.94" stroke={st.kleur} strokeWidth="5" />
          <text x="180" y="309" textAnchor="middle" fontSize="25" fontWeight="800" fill={st.kleur}>
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
    id: "kap", x: 130, y: 60, telt: true, naam: "Kap op het dak",
    vraag: "Is de kap op het dak heel?", // 6.1-1-01 e
    goed: ["De kap zit vast. De kleur is wat verbleekt door de zon."],
    fout: ["Er zit een deuk in de kap. De luchtinlaat is half dichtgedrukt.", "Een rooster van de luchtinlaat is gescheurd."],
    waaromOk: "De kap met luchtinlaat moet heel zijn. Een verbleekte kleur is geen beschadiging.",
    waaromNiet: "De kap met luchtinlaat moet heel zijn. Een beschadiging maakt het CLV niet herbruikbaar.", // 6.1-1-02
    aandacht: "De kap met luchtinlaat moet heel zijn (een van de zeven controles)",
  },
  {
    id: "bevestiging", x: 130, y: 205, telt: true, naam: "Kanaal in de schacht",
    vraag: "Zit de afvoer goed vast aan het gebouw?", // 6.1-1-01 d
    goed: ["Je trekt stevig aan het kanaal. Het geeft niet mee."],
    fout: ["Je trekt aan het kanaal. Het beweegt een paar centimeter heen en weer."],
    waaromOk: "De afvoer moet goed aan het gebouw vastzitten. Dat is in orde.",
    waaromNiet: "De afvoer moet goed aan het gebouw vastzitten. Een kanaal dat beweegt, is niet in orde.",
    aandacht: "De afvoer moet goed aan het gebouw vastzitten (een van de zeven controles)",
  },
  {
    id: "storing", x: 220, y: 197, telt: true, naam: "Storingsoverzicht van de ketels",
    vraag: "Zijn er storingen die wijzen op rookgaslekkage?", // 6.1-1-01 b
    goed: ["In het overzicht staat twee keer: waterdruk te laag. Verder niets."],
    fout: ["De vorige monteur schreef twee keer: rookgaslucht bij de ketel, lek in het kanaal vermoed."],
    waaromOk: "Alleen storingen die wijzen op rookgaslekkage tellen. Een te lage waterdruk hoort daar niet bij.",
    waaromNiet: "Storingen die wijzen op rookgaslekkage betekenen: dit punt is niet in orde.",
    aandacht: "Storingen die wijzen op rookgaslekkage: dan is het CLV niet in orde",
  },
  {
    id: "ruimte", x: 300, y: 330, telt: true, naam: "Opstellingsruimte",
    vraag: "Komt er rookgas in de ruimte waar de ketel hangt?", // 6.1-1-01 c
    goed: ["Je meter geeft in de opstellingsruimte nergens rookgas aan."],
    fout: ["Bij de verbinding van de leiding naar de schacht geeft je meter rookgas aan."],
    waaromOk: "In de opstellingsruimte mag geen rookgas komen. Dat is hier zo.",
    waaromNiet: "Rookgas in de opstellingsruimte betekent: dit punt is niet in orde.",
    aandacht: "Rookgas in de opstellingsruimte: dan is het CLV niet in orde",
  },
  {
    id: "binnen", x: 130, y: 330, telt: true, naam: "Binnenkant rookgas- en luchtkanaal",
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
    id: "luik", x: 197, y: 396, telt: true, naam: "Inspectieluik onderin",
    vraag: "Kun je in beide kanalen kijken zonder leidingen in de woning los te halen?", // 6.1-1-01 g
    goed: ["Je schroeft het luik los. Erachter zitten de luikjes van het rookgas- en het luchtkanaal; die gaan open."],
    fout: ["Het luik is dichtgekit. Om in het kanaal te kijken moet je de leiding bij een ketel losmaken."],
    waaromOk: "Je kunt rookgas- en luchtkanaal van binnen bekijken zonder leidingen in de woning te demonteren.",
    waaromNiet: "Je moet in beide kanalen kunnen kijken zonder leidingen in de woning te demonteren. Hier kan dat niet.",
    aandacht: "Beide kanalen moeten van binnen te bekijken zijn zonder leidingen in de woning te demonteren",
  },
  {
    id: "condens", x: 266, y: 428, telt: true, naam: "Condensafvoer",
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
                x={p.x}
                y={p.y}
                w={SV_W}
                h={SV_H}
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

// ─── TEKENING: rookgasafvoer met ventilatieafvoer (VMC/MVS), eigen tekening naar N48 figuur 10 ───
// Eigen maatvoering, twee verdiepingen. Buitenlucht komt via de dakopbouw en
// de vloersparingen omlaag in de schacht en via een opening in de tussenwand
// de woning in; de dakventilator zuigt rookgas en ventilatielucht samen af.
const VMC_W = 320;
const VMC_H = 540;
const VMC_BUIS = [96, 118]; // centrale afvoerbuis
const VMC_SPARING = [44, 80]; // sparing in dak en vloeren, naast de buis
const VMC_WAND_L = [20, 32];
const VMC_TUSSEN = [150, 160];
const VMC_WAND_R = [262, 272];
const VMC_VERD = [
  { plafond: 130, vloer: 310 },
  { plafond: 322, vloer: 502 },
];
const VMC_BUIS_EIND = VMC_VERD[1].plafond + 38; // houdt op bij de aansluiting van het onderste toestel

function VmcSVG({ ventilatorAan = true }) {
  const L = C.brownText;
  const stil = !ventilatorAan;
  const op = stroom(0.7, stil);
  const neer = stroom(1.2, stil);
  const vent = stroom(1, stil);
  const pijlKleur = (k) => (stil ? "#B9C3CF" : k);
  const [bL, bR] = VMC_BUIS;
  const [sL, sR] = VMC_SPARING;
  const lucht = (sL + sR) / 2;
  // vloerplaat met sparing naast de buis; de onderste vloer is dicht
  const plaat = (y, metSparing) =>
    metSparing ? (
      <g key={y}>
        <rect x="8" y={y} width={sL - 8} height="12" fill="url(#svcArcB)" stroke={L} strokeWidth="1.6" />
        <rect x={sR} y={y} width={bL - sR} height="12" fill="url(#svcArcB)" stroke={L} strokeWidth="1.6" />
        <rect x={bR} y={y} width={300 - bR} height="12" fill="url(#svcArcB)" stroke={L} strokeWidth="1.6" />
      </g>
    ) : (
      <rect key={y} x="8" y={y} width="292" height="14" fill="url(#svcArcB)" stroke={L} strokeWidth="1.6" />
    );
  return (
    <svg viewBox={`0 0 ${VMC_W} ${VMC_H}`} className="w-full h-auto select-none" aria-label="Doorsnede van een schacht met ventilator op het dak">
      <defs>
        <Arcering id="svcArcB" />
      </defs>
      <rect width={VMC_W} height={VMC_H} fill="white" />

      {/* dak, verdiepingsvloer (met sparing) en onderste vloer (dicht) */}
      {plaat(118, true)}
      {plaat(VMC_VERD[0].vloer, true)}
      {plaat(VMC_VERD[1].vloer, false)}

      {/* wanden: buitenwand links, tussenwand (schacht/woning) met een opening per verdieping, rechterwand */}
      {VMC_VERD.map(({ plafond, vloer }) => (
        <g key={`w${plafond}`}>
          <rect x={VMC_WAND_L[0]} y={plafond} width={VMC_WAND_L[1] - VMC_WAND_L[0]} height={vloer - plafond} fill={C.beigeMid} stroke={L} strokeWidth="1.6" />
          <rect x={VMC_TUSSEN[0]} y={plafond} width={VMC_TUSSEN[1] - VMC_TUSSEN[0]} height={vloer - 42 - plafond} fill={C.beigeMid} stroke={L} strokeWidth="1.6" />
          <rect x={VMC_TUSSEN[0]} y={vloer - 20} width={VMC_TUSSEN[1] - VMC_TUSSEN[0]} height="20" fill={C.beigeMid} stroke={L} strokeWidth="1.6" />
          <rect x={VMC_WAND_R[0]} y={plafond} width={VMC_WAND_R[1] - VMC_WAND_R[0]} height={vloer - plafond} fill={C.beigeLight} stroke={L} strokeWidth="1.6" />
        </g>
      ))}

      {/* dakopbouw: zijkanten met lamellen, dichte bovenplaat */}
      {[24, 176].map((x) => (
        <g key={x}>
          <rect x={x} y="77" width="12" height="41" fill="white" stroke={L} strokeWidth="1.6" />
          {[84, 92, 100, 108].map((y) => (
            <line key={y} x1={x} y1={y} x2={x + 12} y2={y + 4} stroke={L} strokeWidth="1.2" />
          ))}
        </g>
      ))}
      <rect x="18" y="72" width="176" height="5" fill={L} />

      {/* LUCHT: aan beide kanten de dakopbouw in, door de sparingen omlaag, per verdieping door de tussenwand de woning in */}
      <path d={`M2 97 H${lucht - 12} Q${lucht} 97 ${lucht} 109 V${VMC_VERD[1].vloer - 6}`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
      <path d={`M216 97 H${lucht + 12} Q${lucht} 97 ${lucht} 109`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
      <Pijlpunt x={22} y={97} hoek={0} kleur={pijlKleur(BLAUW)} />
      <Pijlpunt x={190} y={97} hoek={180} kleur={pijlKleur(BLAUW)} />
      {VMC_VERD.map(({ plafond, vloer }) => (
        <g key={`l${plafond}`}>
          <Pijlpunt x={lucht} y={plafond + 40} hoek={90} kleur={pijlKleur(BLAUW)} />
          <path d={`M${lucht} ${vloer - 31} H210 Q218 ${vloer - 31} 218 ${vloer - 39} V${plafond + 112}`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
          <Pijlpunt x={186} y={vloer - 31} hoek={0} kleur={pijlKleur(BLAUW)} />
        </g>
      ))}

      {/* centrale afvoerbuis door de schacht en de bovenplaat naar de ventilator; onderaan dicht */}
      <rect x={bL} y="60" width={bR - bL} height={VMC_BUIS_EIND - 60} fill="white" stroke={L} strokeWidth="2" />

      {/* per verdieping: ventilatieleiding (boven) en afvoer van het open toestel (eronder) naar dezelfde buis */}
      {VMC_VERD.map(({ plafond }) => {
        const vy = plafond + 11;
        const ay = plafond + 28;
        const top = plafond + 46;
        return (
          <g key={`t${plafond}`}>
            <Pijp d={`M304 ${vy} H${bR - 1}`} dik={10} />
            <path d={`M318 ${vy} H${bL + 15}`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={vent} />
            <Pijlpunt x={300} y={vy} hoek={180} kleur={pijlKleur(BLAUW)} />
            <Pijp d={`M226 ${top} V${ay + 6} Q226 ${ay} 220 ${ay} H${bR - 1}`} dik={8} />
            <path d={`M226 ${top} V${ay + 6} Q226 ${ay} 220 ${ay} H${bL + 7}`} fill="none" stroke={C.red} strokeWidth="2.2" style={op} />
            {/* open toestel, zonder luchtleiding */}
            <rect x="200" y={top} width="36" height="60" fill={stil ? "#EDEDED" : "white"} stroke={stil ? C.red : L} strokeWidth="2" />
            <text data-spel="label" x="218" y={top + 36} fontSize="13" fontWeight="700" fill={C.brown} textAnchor="middle">open</text>
            {stil && (
              <text data-spel="uit" x="218" y={top + 54} fontSize="13" fontWeight="800" textAnchor="middle" fill={C.red}>UIT</text>
            )}
          </g>
        );
      })}

      {/* in de buis: rookgas en ventilatielucht samen omhoog, door de ventilator naar buiten */}
      <path d={`M${bL + 7} ${VMC_BUIS_EIND - 6} V6`} fill="none" stroke={C.red} strokeWidth="2.4" style={op} />
      <path d={`M${bL + 15} ${VMC_VERD[1].plafond + 8} V6`} fill="none" stroke={BLAUW} strokeWidth="2.4" style={vent} />
      <Pijlpunt x={bL + 7} y={4} hoek={-90} kleur={pijlKleur(C.red)} />
      <Pijlpunt x={bL + 15} y={4} hoek={-90} kleur={pijlKleur(BLAUW)} />

      {/* ventilator op de buis */}
      <polygon points="92,36 122,36 128,42 128,58 122,64 92,64 86,58 86,42" fill="white" stroke={L} strokeWidth="2" />
      <rect x={bL + 2} y="64" width={bR - bL - 4} height="8" fill="white" stroke={L} strokeWidth="1.4" />
      <g style={{ transformBox: "view-box", transformOrigin: "107px 50px", animation: stil ? "none" : "spinFan 0.9s linear infinite" }}>
        <ellipse cx="99" cy="50" rx="7" ry="2.2" fill="none" stroke={L} strokeWidth="1.4" />
        <ellipse cx="115" cy="50" rx="7" ry="2.2" fill="none" stroke={L} strokeWidth="1.4" />
        <circle cx="107" cy="50" r="2" fill={L} />
      </g>
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
    id: "ventilator", x: 107, y: 50, echt: true, naam: "Ventilator op het dak",
    tekst: "Een centrale ventilator op het dak zuigt rookgas en ventilatielucht samen af.", // 6.4-02
  },
  {
    id: "ventilatie", x: 288, y: VMC_VERD[1].plafond + 11, echt: true, naam: "Leiding uit de woning",
    tekst: "Ventilatielucht uit de woning gaat door hetzelfde afvoerkanaal als het rookgas.", // 6.4-01
  },
  {
    id: "b1", x: 218, y: VMC_VERD[0].plafond + 76, echt: true, naam: "Open toestel (B1)",
    tekst: "Een open toestel zonder eigen ventilator. Het systeem is gemaakt voor ketels met hete rookgassen die zelf geen ventilator hebben.", // 6.4-03, 6.4-07
  },
  {
    id: "lucht", x: 30, y: 97, echt: false, naam: "Luchttoevoer bovenin",
    tekst: "Hier komt lucht binnen. Dat is geen kenmerk: bij een VMC (MVS) gaan rookgas en ventilatielucht samen de afvoer in.", // 6.4-01
  },
  {
    id: "opening", x: 155, y: VMC_VERD[1].vloer - 31, echt: false, naam: "Opening naar de woning",
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
    setFb({ goed: true, tekst: "Valt de dakventilator uit, dan zet een beveiliging alle ketels in de strang uit. Kijk: alle open toestellen staan uit." });
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

// ─── TEKENING: onderzijde van een concentrisch CLV, eigen tekening naar N48 figuur 2 ───
// Eigen maatvoering. Alleen het onderste deel van de schacht: binnenbuis
// onderaan dicht met condensafvoer en sifon in het luchtkanaal, deksels op
// binnen- en buitenbuis achter het bouwkundige luik, trechter met afvoer naar
// buiten, een sifon en een open verbinding naar het riool.
const OZ_W = 420;
const OZ_H = 330;
const OZ_CX = 124;
const OZ_BUITEN = [84, 164];
const OZ_BINNEN = [106, 142];
const OZ_WAND_L = [56, 70];
const OZ_WAND_R = [180, 194];
const OZ_BODEM = 140; // dichte bodem van de binnenbuis
const OZ_VLOER = 300;

// De onderdelen van de onderzijde. Het spel zet bij elk onderdeel een eigen
// tikvlak (m) met een wijzer naar het onderdeel (t); geen nummers uit de norm.
const OZ_PLEKKEN = [
  { id: "n1", naam: "de afvoer van condenswater uit de binnenbuis", m: [26, 100], t: [OZ_CX, 152] },
  { id: "n2", naam: "de sifon voor de afvoer van condenswater, in het luchtkanaal", m: [26, 170], t: [OZ_CX + 4, 172] },
  { id: "n3", naam: "de afvoer van regenwater uit de trechter", m: [26, 240], t: [OZ_CX, 224] },
  { id: "n4", naam: "het bouwkundige inspectieluik", m: [238, 34], t: [198, 96] },
  { id: "n5", naam: "het inspectieluik van het luchttoevoerkanaal", m: [238, 174], t: [180, 160] },
  { id: "n6", naam: "het inspectieluik van het rookgasafvoerkanaal", m: [238, 104], t: [168, 126] },
  { id: "n7", naam: "de sifon voor regen- en condenswater, buiten de schacht", m: [222, 306], t: [222, 264] },
  { id: "n8", naam: "de open verbinding naar het riool", m: [352, 206], t: [308, 254] },
];

// Spelonderdelen (data-spel): wijzers naar de tikvlakken, open luik, stromend of stilstaand water.
function OnderzijdeSVG({ luikOpen, sifon2, sifon7, wijzers = true }) {
  const L = C.brownText;
  const lijn = { stroke: L, strokeWidth: 2 };
  const [bL, bR] = OZ_BUITEN;
  const [iL, iR] = OZ_BINNEN;
  const op = stroom(0.8);
  const neer = stroom(1.1);
  const waterStroom = { strokeDasharray: "6 6", animation: "flowDash 0.7s linear infinite" };
  const afvoer = `M${OZ_CX} 218 V226 Q${OZ_CX} 232 ${OZ_CX + 6} 232 H206 Q212 232 212 238 V250 Q212 260 222 260 Q232 260 232 250 V238 Q232 232 238 232 H300 Q308 232 308 240 V250`;
  return (
    <svg viewBox={`0 0 ${OZ_W} ${OZ_H}`} className="w-full h-auto select-none" aria-label="Onderzijde van het CLV met inspectieluiken en sifons">
      <defs>
        <Arcering id="svcArcC" />
      </defs>
      <rect width={OZ_W} height={OZ_H} fill="white" />

      {/* vloer: loopt buiten de schacht door; kanaal en wanden staan erop */}
      <rect x="0" y={OZ_VLOER} width={OZ_WAND_L[0]} height="18" fill="url(#svcArcC)" stroke={L} strokeWidth="1.6" />
      <rect x={OZ_WAND_R[1]} y={OZ_VLOER} width={OZ_W - OZ_WAND_R[1]} height="18" fill="url(#svcArcC)" stroke={L} strokeWidth="1.6" />
      <line x1={OZ_WAND_L[1]} y1={OZ_VLOER} x2={OZ_WAND_R[0]} y2={OZ_VLOER} {...lijn} />

      {/* schachtwanden (bovenkant niet getekend); rechts een opening voor het bouwkundige luik */}
      <rect x={OZ_WAND_L[0]} y="4" width={OZ_WAND_L[1] - OZ_WAND_L[0]} height={OZ_VLOER + 18 - 4} fill={C.beigeMid} stroke={L} strokeWidth="1.8" />
      <rect x={OZ_WAND_R[0]} y="4" width={OZ_WAND_R[1] - OZ_WAND_R[0]} height="88" fill={C.beigeMid} stroke={L} strokeWidth="1.8" />
      <rect x={OZ_WAND_R[0]} y="180" width={OZ_WAND_R[1] - OZ_WAND_R[0]} height={OZ_VLOER + 18 - 180} fill={C.beigeMid} stroke={L} strokeWidth="1.8" />

      {/* buitenbuis tot de vloer; rechts een zijstuk met groot deksel (luchtkanaal) */}
      <line x1={bL} y1="4" x2={bL} y2={OZ_VLOER} {...lijn} />
      <line x1={bR} y1="4" x2={bR} y2="104" {...lijn} />
      <line x1={bR} y1="168" x2={bR} y2={OZ_VLOER} {...lijn} />
      <path d={`M${bR} 104 H176 M${bR} 168 H176`} {...lijn} />
      <rect x="176" y="98" width="5" height="76" rx="2" fill="white" stroke={L} strokeWidth="1.8" />
      {/* binnenbuis met dichte bodem; rechts net boven de bodem een klein zijstuk met eigen deksel (rookgaskanaal) */}
      <line x1={iL} y1="4" x2={iL} y2={OZ_BODEM} {...lijn} />
      <line x1={iR} y1="4" x2={iR} y2="118" {...lijn} />
      <line x1={iR} y1="134" x2={iR} y2={OZ_BODEM} {...lijn} />
      <line x1={iL - 1} y1={OZ_BODEM} x2={iR + 1} y2={OZ_BODEM} stroke={L} strokeWidth="3" />
      <path d={`M${iR} 118 H166 M${iR} 134 H166`} {...lijn} />
      <rect x="166" y="114" width="4" height="24" rx="1.5" fill="white" stroke={L} strokeWidth="1.6" />

      {/* stroming: rookgas omhoog in de binnenbuis, lucht omlaag in de ring aan beide kanten */}
      <path d={`M${OZ_CX} ${OZ_BODEM - 6} V10`} fill="none" stroke={C.red} strokeWidth="3" style={op} />
      <Pijlpunt x={OZ_CX} y={6} hoek={-90} kleur={C.red} maat={7} />
      <path d={`M${(bL + iL) / 2} 6 V186`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
      <path d={`M${(iR + bR) / 2} 6 V108`} fill="none" stroke={BLAUW} strokeWidth="2.2" style={neer} />
      <Pijlpunt x={(bL + iL) / 2} y={190} hoek={90} kleur={BLAUW} />
      <Pijlpunt x={(iR + bR) / 2} y={112} hoek={90} kleur={BLAUW} />

      {/* condensafvoer uit het midden van de bodem, sifon in het luchtkanaal, uitloop open naar rechtsboven */}
      <Pijp d={`M${OZ_CX} ${OZ_BODEM} V160 Q${OZ_CX} 172 ${OZ_CX + 8} 172 Q${OZ_CX + 16} 172 ${OZ_CX + 16} 162 V158 Q${OZ_CX + 16} 152 ${OZ_CX + 22} 148 L${OZ_CX + 26} 145`} dik={6} />
      <path d={`M${OZ_CX} 164 Q${OZ_CX} 172 ${OZ_CX + 8} 172 Q${OZ_CX + 16} 172 ${OZ_CX + 16} 164`} fill="none" stroke={WATER} strokeWidth="3" />

      {/* trechter onderin de buitenbuis, uitloop in het midden */}
      <path d={`M${bL} 194 L${OZ_CX - 6} 212 V220 M${bR} 194 L${OZ_CX + 6} 212 V220`} fill="none" {...lijn} />
      {/* afvoer: omlaag, naar rechts door buitenbuis en schachtwand onder het luik, een sifon, vrij einde */}
      <Pijp d={afvoer} />
      <path d="M212 250 Q212 260 222 260 Q232 260 232 250" fill="none" stroke={WATER} strokeWidth="3.6" />
      {/* los opvangstuk met wijde inlaat onder het vrije einde, leiding naar het riool */}
      <polygon points="296,258 320,258 314,266 302,266" fill="white" stroke={L} strokeWidth="1.6" />
      <Pijp d="M308 266 V274 Q308 282 316 282 H404" />
      <text data-spel="label" x="378" y="273" fontSize="15" fontWeight="700" fill={C.brown} textAnchor="middle">riool</text>
      {/* voetstuk met drie ovale openingen; daaronder tot de vloer, gestippelde lijn net boven de vloer */}
      <rect x={bL} y="242" width={bR - bL} height="30" fill="white" stroke={L} strokeWidth="1.8" />
      {[OZ_CX - 22, OZ_CX, OZ_CX + 22].map((x) => (
        <ellipse key={x} cx={x} cy="257" rx="6" ry="10" fill="white" stroke={L} strokeWidth="1.5" />
      ))}
      <line x1={bL} y1="292" x2={bR} y2="292" stroke={L} strokeWidth="1.4" strokeDasharray="5 4" />

      {/* bouwkundig luik: plaat aan de woningkant, vast boven en onder */}
      {luikOpen ? (
        <g data-spel="luik-open">
          <rect x={OZ_WAND_R[1]} y="86" width="4" height="100" fill="white" stroke={L} strokeWidth="1.6" transform={`rotate(58 ${OZ_WAND_R[1] + 2} 186)`} />
        </g>
      ) : (
        <rect x={OZ_WAND_R[1]} y="86" width="4" height="100" fill="white" stroke={L} strokeWidth="1.6" />
      )}
      {[90, 182].map((y) => (
        <g key={y} stroke={L} strokeWidth="1.4">
          <line x1={OZ_WAND_R[0] + 4} y1={y} x2={OZ_WAND_R[1] + 8} y2={y} />
          <line x1={OZ_WAND_R[1] + 8} y1={y - 3} x2={OZ_WAND_R[1] + 8} y2={y + 3} />
        </g>
      ))}

      {/* spel: water in de sifons */}
      {sifon2 === "ok" && (
        <path data-spel="water" d={`M${OZ_CX} 144 V162 Q${OZ_CX} 172 ${OZ_CX + 8} 172 Q${OZ_CX + 16} 172 ${OZ_CX + 16} 160 Q${OZ_CX + 18} 150 ${OZ_CX + 26} 145 Q${OZ_CX + 30} 160 ${OZ_CX + 26} 192`} fill="none" stroke={WATER} strokeWidth="4" style={waterStroom} />
      )}
      {sifon2 === "niet" && <ellipse data-spel="water" cx={OZ_CX + 8} cy="164" rx="14" ry="9" fill={WATER} opacity="0.7" />}
      {sifon7 === "ok" && (
        <path data-spel="water" d={`${afvoer} V262 M308 266 V274 Q308 282 316 282 H404`} fill="none" stroke={WATER} strokeWidth="4" style={waterStroom} />
      )}
      {sifon7 === "niet" && <ellipse data-spel="water" cx="222" cy="250" rx="16" ry="11" fill={WATER} opacity="0.7" />}

      {/* spel: wijzers van de tikvlakken naar de onderdelen */}
      {wijzers &&
        OZ_PLEKKEN.map((p) => (
          <g key={p.id} data-spel="wijzer">
            <line x1={p.m[0]} y1={p.m[1]} x2={p.t[0]} y2={p.t[1]} stroke={C.oliveDark} strokeWidth="1.6" strokeDasharray="4 3" />
            <circle cx={p.t[0]} cy={p.t[1]} r="3" fill={C.oliveDark} />
          </g>
        ))}
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

// Stap 3: de speler tikt per taak het juiste onderdeel aan in de tekening (acht tikvlakken met een wijzer).
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

  const kiesOnderdeel = (p, e) => {
    if (!taak || oordeelVoor || klaar.includes(p.id) || fout.includes(p.id)) return;
    if (p.id === taak.doel) {
      beoordeel("goed", punt(e));
      setKlaar((k) => [...k, p.id]);
      setFout([]);
      setFb({ goed: true, tekst: `Dit is ${p.naam}. ${taak.waarom}` });
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
      setFb({ goed: false, tekst: `Dit is ${p.naam}. Daar kom je pas bij als het bouwkundige inspectieluik open is.` });
    } else {
      noteer("Herken de onderdelen van de onderzijde: bouwkundig luik, luikjes op lucht- en rookgaskanaal, twee sifons");
      setFb({ goed: false, tekst: `Dit is ${p.naam}. De opdracht was: ${taak.tekst.toLowerCase()}` });
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
        opdracht={oordeelVoor ? "Beoordeel de sifon." : taak ? `${taak.tekst} Tik het onderdeel aan in de tekening.` : "Alles gecontroleerd."}
        teller={`${Math.min(nr, taken.length)} van ${taken.length}`}
      />
      <div className="w-full max-w-2xl flex flex-col gap-3 items-center">
        <div className="w-full max-w-[640px] relative">
          <OnderzijdeSVG luikOpen={luikOpen} sifon2={sifonStand("n2")} sifon7={sifonStand("n7")} wijzers={!QA_KAAL} />
          {OZ_PLEKKEN.map((p) => {
            const isKlaar = klaar.includes(p.id);
            const isFout = fout.includes(p.id);
            return (
              <Stip
                key={p.id}
                x={p.m[0]}
                y={p.m[1]}
                w={OZ_W}
                h={OZ_H}
                status={isKlaar ? "ok" : isFout ? "niet" : null}
                label={isKlaar ? p.naam : "onderdeel in de tekening"}
                onClick={(e) => kiesOnderdeel(p, e)}
                goed={!!taak && !oordeelVoor && p.id === taak.doel}
              />
            );
          })}
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
            <p className="text-sm font-bold" style={{ color: C.brownText }}>{taak.tekst}</p>
            {!fb && (
              <p className="text-sm italic" style={{ color: C.brown }}>
                Tik in de tekening op de stip bij het onderdeel.
              </p>
            )}
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
