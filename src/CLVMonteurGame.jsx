import { useState, useCallback, useEffect, useRef } from "react";
import { Wrench, CheckCircle, XCircle } from "lucide-react";
import {
  C,
  useGameJuice,
  DragProvider,
  Draggable,
  DropTarget,
  useDrag,
  ProgressBar,
  GameButton,
  IntroScreen,
  MCControle,
  StepBanner,
  RondeIntro,
  UitlegItem,
  VasteBalk,
  RUIMTE_VOOR_BALK,
  useAandacht,
  playSound,
} from "./shared.jsx";
import { useSessie, maakZender, EindschermKern } from "./microgame/schil.jsx";

// De CLV-Monteur (game 2 van 3): aansluiten en opleveren op een overdruk-CLV
// (C(10)). Score, sterren, levens en het eindscherm komen uit de gedeelde kern
// (src/microgame/). Elke ronde is een missie met een ronde en twee
// kennisvragen; de kern stelt na volgendeKennisvraag() vanzelf de tweede vraag.
//
// Handelingen (= echte beoordeel("goed")-momenten):
//   r1 Oude ketel eruit: aansluitleiding afvoeren, dop rookgas, dop lucht,
//      typeplaat lezen (mag een C43 hier op?) = 4. Het wegslepen van de ketel
//      zelf is geen keuze en telt niet.
//   r2 Nieuwe ketel aansluiten: route, leiding, montage, klep eerst, klep plek,
//      manchet plek, voorschrift doorvoer, controle wbdbo, half-CLV = 9
//   r3 Controleren en opleveren: 7 controlepunten + besluit = 8
// Haalbaar: (4 + 9 + 8) x 100 + 6 kennisvragen x 100 = 2700.
//
// Alle lesstof is terug te voeren op een feit-ID in clv-gauntlet\BRONBASIS.md;
// de koppeling per tekst staat in clv-gauntlet\bouw\monteur-BRONNEN.md.
// Tekeningen: SchachtC10 volgt C10 figuur 1 (PDF-pagina 5), StompDetail volgt
// C10 figuur 3 (PDF-pagina 10), de typeplaten volgen C10 figuur B1 en B2.
const GAME_ID = "clv-monteur";

const maakOpzet = () => ({
  id: GAME_ID,
  missies: [
    { id: "m1", rondes: [{ id: "r1", handelingen: 4 }], kennisvragen: [{ id: "k1a" }, { id: "k1b" }] },
    { id: "m2", rondes: [{ id: "r2", handelingen: 9 }], kennisvragen: [{ id: "k2a" }, { id: "k2b" }] },
    { id: "m3", rondes: [{ id: "r3", handelingen: 8 }], kennisvragen: [{ id: "k3a" }, { id: "k3b" }] },
  ],
});

// De game meet niets zolang hij op zijn eigen domein draait: besluit van
// Peter (28 augustus 2026). Zonder VITE_TELEMETRIE_URL geeft maakZender geen
// zender terug en meldt de kern nergens heen. Zet die variabele dus niet.
const zender = maakZender({ url: import.meta.env.VITE_TELEMETRIE_URL });

const RONDE_NAMEN = {
  r1: "Oude ketel eruit",
  r2: "Nieuwe ketel aansluiten",
  r3: "Controleren en opleveren",
};

const RONDE_SCHERMEN = ["r1", "r2", "r3"];
const SCREEN_ROUND = { r1: 1, r1mc: 1, r2: 2, r2mc: 2, r3: 3, r3mc: 3 };

// Controlemenu: zo ver moet de kern doorgespeeld zijn om op een scherm te
// kunnen landen. Heel getal n: de eerste n rondes met hun twee vragen af; met
// een half erbij is ook de ronde erna af en staan haar vragen nog open.
const SPOEL_STAPPEN = {
  intro: 0, r1: 0, r1mc: 0.5, r2: 1, r2mc: 1.5, r3: 2, r3mc: 2.5, end: 3,
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
    if (metVragen) {
      for (let v = 0; v < 2; v += 1) {
        sessie.beantwoordKennisvraag(true);
        sessie.volgendeKennisvraag();
      }
    }
  };
  for (let i = 0; i < heel; i += 1) speel(i, true);
  if (stappen % 1) speel(heel, false);
}

// ─── HULPJES ───

// Fisher-Yates; alleen aanroepen in een state-initializer of een handler
function schud(lijst) {
  const a = [...lijst];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function kiesTwee(n) {
  const volgorde = schud(Array.from({ length: n }, (_, i) => i));
  return [volgorde[0], volgorde[1]];
}

// QA: ?qa=1&spring=monteur-r2&fase=opdracht&stap=3 opent een latere stap van
// de eerste getoonde ronde (alleen voor screenshots; zonder qa=1 doet dit niets).
function leesQaStap() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("qa") !== "1") return 0;
    return Number(p.get("stap")) || 0;
  } catch {
    return 0;
  }
}

function naarBoven() {
  try {
    window.scrollTo({ top: 0 });
  } catch {
    /* geen venster */
  }
}

const BLAUW = "#3B82F6";
const GRIJS = "#9A9A9A";
const LIJN = C.brownText;

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

// Vetgedrukte opdrachtregel met stap en teller (didactische regel 4)
function Opdracht({ titel, stap, stappen, tekst, klaar, totaal }) {
  return (
    <div className="w-full max-w-2xl mb-2 text-center">
      <h2 className="text-lg sm:text-xl font-bold italic mb-1" style={{ color: C.brownText }}>{titel}</h2>
      <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
        {stap && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold border" style={{ borderColor: C.olive, color: C.oliveDark, backgroundColor: C.oliveLight }}>
            Stap {stap} van {stappen}
          </span>
        )}
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold border" style={{ borderColor: C.beigeMid, color: C.brown, backgroundColor: "white" }}>
          {klaar} van {totaal} gedaan
        </span>
      </div>
      <p className="text-sm sm:text-base font-bold" style={{ color: C.brownText }}>
        Opdracht: <span className="font-semibold">{tekst}</span>
      </p>
    </div>
  );
}

// Waarom-regel: bij goed groen (ook leren als je gokt), bij fout rood. Scrolt
// zichzelf in beeld, ook binnen de vaste balk op een telefoon.
function Melding({ melding }) {
  const ref = useRef(null);
  const tekst = melding?.tekst;
  useEffect(() => {
    if (tekst) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [tekst]);
  if (!melding) return null;
  const goed = melding.soort === "goed";
  return (
    <div
      ref={ref}
      className="w-full rounded-xl border-2 px-3 py-2 flex items-start gap-2 text-sm font-medium"
      style={{ backgroundColor: goed ? C.greenLight : C.redLight, borderColor: goed ? C.green : C.red, color: C.brownText }}
      role="status"
    >
      {goed ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.green }} /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.red }} />}
      <span>{melding.tekst}</span>
    </div>
  );
}

// Keuzekaarten (casus met keuze): elke knop minstens 44 px hoog
function Keuzes({ vraag, opties, onKies, fout }) {
  return (
    <div className="w-full">
      {vraag && (
        <p className="text-sm font-bold mb-2" style={{ color: C.brownText }}>{vraag}</p>
      )}
      <div className="flex flex-col gap-2">
        {opties.map((o) => (
          <button
            key={o.id}
            onClick={() => onKies(o)}
            className="text-left px-3 py-2 min-h-[44px] rounded-xl border-2 text-sm font-medium transition-all"
            style={{
              backgroundColor: fout === o.id ? C.redLight : "white",
              borderColor: fout === o.id ? C.red : C.beigeMid,
              color: C.brownText,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── TEKENING 1: C(10)-PRINCIPE (C10 figuur 1, PDF-pagina 5) ───
//
// Coordinaten zijn de normfiguur op schaal: kanaal, kap, vloeren, twee
// toestellen met concentrische aansluitleiding (vier lijnen, omhoog en dan
// links het kanaal in), breeklijnen en de onderzijde (binnenbuis dicht met
// sifon, twee inspectiedeksels rechts, gebogen bodem met afvoer door de wand).
// Per ronde wordt een uitsnede getoond, steeds vanaf een breeklijn.

const K = { xl: 137, xi1: 149.5, xi2: 185, xr: 197 }; // kanaal: buiten links, binnenbuis, buiten rechts
const VERD = 286; // afstand tussen de twee verdiepingen in de figuur
const UITSNEDE_BOVEN = { x: 40, y: 222, w: 290, h: 301 };
const UITSNEDE_ONDER = { x: 40, y: 512, w: 290, h: 360 };

function pijlV(x, y1, y2, sleutel, s = 1) {
  const dir = y2 > y1 ? 1 : -1;
  return (
    <g key={sleutel}>
      <line x1={x} y1={y1} x2={x} y2={y2 - dir * 3 * s} stroke={LIJN} strokeWidth={0.9 * s} />
      <path d={`M${x - 2 * s} ${y2 - dir * 5 * s} L${x} ${y2} L${x + 2 * s} ${y2 - dir * 5 * s} Z`} fill={LIJN} />
    </g>
  );
}

function Breek({ y }) {
  return (
    <g>
      {[
        [131, 155],
        [179, 203],
      ].map(([a, b]) => (
        <g key={a}>
          <line x1={a} y1={y - 2.5} x2={b} y2={y + 2.5} stroke="white" strokeWidth="3.4" />
          <line x1={a} y1={y - 4.2} x2={b} y2={y + 0.8} stroke={GRIJS} strokeWidth="0.6" />
          <line x1={a} y1={y - 0.8} x2={b} y2={y + 4.2} stroke={GRIJS} strokeWidth="0.6" />
        </g>
      ))}
      <circle cx="167.5" cy={y - 1.6} r="0.6" fill={GRIJS} />
      <circle cx="167.5" cy={y + 1.6} r="0.6" fill={GRIJS} />
    </g>
  );
}

// verticale lijn met openingen (waar de aansluitleidingen het kanaal ingaan)
function wandPad(x, y1, y2, gaten) {
  let d = "";
  let y = y1;
  for (const [a, b] of gaten) {
    d += `M${x} ${y} V${a} `;
    y = b;
  }
  return `${d}M${x} ${y} V${y2}`;
}

// concentrische aansluitleiding zoals in de figuur: vier lijnen
function leidingPaden(dy) {
  return [
    `M${K.xr} ${330 + dy} H290 V${397 + dy}`,
    `M${K.xi2} ${332.5 + dy} H287.7 V${397 + dy}`,
    `M${K.xi2} ${343.5 + dy} H276 V${397 + dy}`,
    `M${K.xr} ${346 + dy} H273.5 V${397 + dy}`,
  ];
}

function Toestel({ dy, status, label }) {
  if (status === "weg") {
    return <rect x="240" y={397 + dy} width="83" height="99" fill="none" stroke={GRIJS} strokeWidth="1" strokeDasharray="4 3" />;
  }
  return (
    <g>
      <rect x="240" y={397 + dy} width="83" height="99" fill="white" stroke={LIJN} strokeWidth="1" />
      {label && (
        <text data-spel="label" x={dy ? 319 : 281.5} y={(dy ? 490 : 452) + dy} fontSize="12" fontWeight="700" fill={C.brown} textAnchor={dy ? "end" : "middle"}>
          {label}
        </text>
      )}
    </g>
  );
}

// terugslagklep als scharnierend klepje (spelonderdeel, plek volgens de normtekst)
function Klepje({ x, y, kleur = C.green }) {
  return (
    <g data-spel="klep">
      <circle cx={x} cy={y} r="1.8" fill={kleur} />
      <line x1={x} y1={y} x2={x + 5} y2={y + 5} stroke={kleur} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
}

function SchachtC10({
  uitsnede,
  boven = { ketel: "aan", leiding: "aan", label: null },
  onder = { ketel: "aan", label: null },
  rookgasUit = null, // null | "leiding"
  routes = false,
  klepOnder = true,
  plaatOnder = false,
  children,
}) {
  const flowOp = { strokeDasharray: "6 5", animation: "flowDash 0.9s linear infinite" };
  const flowNeer = { strokeDasharray: "5 5", animation: "flowDash 1.2s linear infinite" };
  const gatenXr = [
    [330, 346],
    [330 + VERD, 346 + VERD],
  ];
  const gatenXi2 = [
    [332.5, 343.5],
    [332.5 + VERD, 343.5 + VERD],
  ];
  const bovenLeidingZichtbaar = boven.leiding === "aan";
  const stompDicht = boven.leiding === "geen" || boven.leiding === "gat";
  const vb = `${uitsnede.x} ${uitsnede.y} ${uitsnede.w} ${uitsnede.h}`;

  return (
    <svg viewBox={vb} className="w-full h-auto select-none" role="img" aria-label="Doorsnede van een overdruk-CLV met twee ketels">
      <defs>
        <pattern id="gaasMon" width="4.2" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 0 V4 M0 0 H4.2" fill="none" stroke={LIJN} strokeWidth="0.45" />
        </pattern>
      </defs>
      <rect x={uitsnede.x} y={uitsnede.y} width={uitsnede.w} height={uitsnede.h} fill="white" />

      {/* stromen (spel, licht): rookgas omhoog naast de pijlen, lucht omlaag in de ring */}
      <g data-spel="stroom">
        <path d="M171 752 V60" fill="none" stroke={C.red} strokeWidth="1.6" opacity="0.35" style={flowOp} />
        <path d="M140.5 130 V798" fill="none" stroke={BLAUW} strokeWidth="1.3" opacity="0.3" style={flowNeer} />
        <path d="M194 130 V798" fill="none" stroke={BLAUW} strokeWidth="1.3" opacity="0.3" style={flowNeer} />
      </g>

      {/* kap: gaas tussen twee platen, binnenbuis door het gaas, buitenbuis verwijdt naar boven */}
      <rect x="117" y="74" width="102" height="56.6" fill="url(#gaasMon)" />
      <line x1="115.8" y1="74" x2="219.5" y2="74" stroke={LIJN} strokeWidth="1.4" />
      <line x1="115.8" y1="130.6" x2="219.5" y2="130.6" stroke={LIJN} strokeWidth="1.4" />
      <path d="M125.2 131.3 L137 215.6" stroke={LIJN} strokeWidth="1.1" fill="none" />
      <path d="M209.5 131.3 L197 215.6" stroke={LIJN} strokeWidth="1.1" fill="none" />
      <path d="M141.4 65.6 L149.5 146.9" stroke={LIJN} strokeWidth="1.1" fill="none" />
      <path d="M193.9 65.6 L185 150" stroke={LIJN} strokeWidth="1.1" fill="none" />
      <path d="M181.5 100 Q183 55.3 192 55.3 H224" stroke={GRIJS} strokeWidth="0.8" fill="none" />
      <path d="M222 53.4 L227 55.3 L222 57.2 Z" fill={LIJN} />
      <line x1="202.7" y1="120.3" x2="194.6" y2="169" stroke={GRIJS} strokeWidth="0.8" />
      <path d="M193 168.5 L194 173.4 L196.2 169 Z" fill={LIJN} />
      <line x1="206.4" y1="118.1" x2="233" y2="118.1" stroke={LIJN} strokeWidth="0.6" />
      {pijlV(167.4, 215.5, 181.3, "kapop")}

      {/* kanaalwanden */}
      <g stroke={LIJN} strokeWidth="1.7" fill="none">
        <path d={`M${K.xl} 215.6 V843.7`} />
        <path d={`M${K.xi1} 146.9 V754.5`} />
        <path d={wandPad(K.xi2, 150, 754.5, gatenXi2)} />
        <path d={wandPad(K.xr, 215.6, 843.7, gatenXr)} />
        <path d={`M${K.xi1} 754.5 H${K.xi2}`} />
        <path d={`M${K.xl} 843.7 H${K.xr}`} />
      </g>

      {/* verdiepingsvloeren (twee lijnen, eindigen vlak bij het kanaal) */}
      {[261, 261 + VERD].map((y) => (
        <g key={y} stroke={LIJN} strokeWidth="0.8" fill="none">
          <path d={`M47.5 ${y} H133 V${y + 21.5} H47.5`} />
          <path d={`M287.5 ${y} H201.5 V${y + 21.5} H287.5`} />
        </g>
      ))}
      <g stroke={LIJN} strokeWidth="0.8">
        <line x1="47.5" y1="844.5" x2="287.5" y2="844.5" />
        <line x1="47.5" y1="864.5" x2="287.5" y2="864.5" />
      </g>

      {/* stroompijlen van de figuur: onder elke vloer ring omlaag en de bocht omhoog;
          de tweede set staat in de figuur alleen onder de bovenste aansluitleiding */}
      {[0, VERD].map((dy) => (
        <g key={dy}>
          {pijlV(143.5, 282.5 + dy, 315 + dy, `l1${dy}`)}
          {pijlV(191.5, 282.5 + dy, 315 + dy, `r1${dy}`)}
          {pijlV(167.5, 330 + dy, 300 + dy, `m1${dy}`)}
        </g>
      ))}
      {pijlV(143.5, 415, 447.5, "l2")}
      {pijlV(191.5, 415, 447.5, "r2")}
      {pijlV(167.5, 467.5, 430, "m2")}

      {/* BOVENSTE VERDIEPING */}
      {stompDicht && (
        <g data-spel="dop">
          <line x1={K.xr} y1="330" x2={K.xr} y2="346" stroke={LIJN} strokeWidth="1.7" />
          <line x1={K.xi2} y1="332.5" x2={K.xi2} y2="343.5" stroke={LIJN} strokeWidth="1.7" />
          <rect x="197.5" y="328.5" width="4" height="19" rx="1" fill={C.olive} />
        </g>
      )}
      {routes && (
        <g data-spel="route">
          <g fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" stroke={C.olive} opacity="0.8" strokeDasharray="5 4">
            <path d="M282 397 V338 H202" />
            <path d="M282 397 V375 H318 V292 H212 V338 H202" />
            <path d="M282 397 V386 H266 V374 H250 V362 H234 V350 H218 V338 H202" />
          </g>
          <text x="264" y="331" fontSize="16" fontWeight="800" fill={C.oliveDark} textAnchor="middle">A</text>
          <text x="300" y="286" fontSize="16" fontWeight="800" fill={C.oliveDark} textAnchor="middle">B</text>
          <text x="228" y="378" fontSize="16" fontWeight="800" fill={C.oliveDark} textAnchor="middle">C</text>
        </g>
      )}
      {boven.leiding === "gat" && (
        <path data-spel="route" d="M282 397 V338 H202" fill="none" stroke={C.olive} strokeWidth="5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      )}
      {bovenLeidingZichtbaar && (
        <g stroke={LIJN} strokeWidth="1.4" fill="none">
          {leidingPaden(0).map((d) => (
            <path key={d} d={d} />
          ))}
          <path d="M175 338.5 H204" stroke={GRIJS} strokeWidth="0.8" />
          <path d="M175 338.5 Q168 338 167.5 331" stroke={GRIJS} strokeWidth="0.8" />
        </g>
      )}
      {bovenLeidingZichtbaar && boven.ketel === "aan" && (
        <path data-spel="stroom" d="M282 395 V338.5 H172" fill="none" stroke={C.red} strokeWidth="1.6" opacity="0.6" style={flowOp} />
      )}
      {bovenLeidingZichtbaar && boven.klep && <Klepje x={280} y={372} />}
      <Toestel dy={0} status={boven.ketel === "weg" ? "weg" : "aan"} label={boven.label} />

      {/* rookgas komt de woning in uit de open aansluitleiding */}
      {rookgasUit === "leiding" && (
        <g data-spel="rookgas">
          <path d="M172 338.5 H282 V412" fill="none" stroke={C.red} strokeWidth="2.6" style={flowOp} />
          <path d="M277.5 406 L282 414 L286.5 406" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" />
          <g style={{ animation: "pulseGlow 1.4s ease-in-out infinite" }}>
            <circle cx="282" cy="432" r="16" fill={C.red} opacity="0.14" />
            <circle cx="262" cy="450" r="11" fill={C.red} opacity="0.12" />
          </g>
        </g>
      )}

      {/* ONDERSTE VERDIEPING */}
      <g stroke={LIJN} strokeWidth="1.4" fill="none">
        {leidingPaden(VERD).map((d) => (
          <path key={d} d={d} />
        ))}
        <path d={`M175 ${338.5 + VERD} H204`} stroke={GRIJS} strokeWidth="0.8" />
        <path d={`M175 ${338.5 + VERD} Q168 ${338 + VERD} 167.5 ${331 + VERD}`} stroke={GRIJS} strokeWidth="0.8" />
      </g>
      {onder.ketel === "aan" && (
        <path data-spel="stroom" d={`M282 ${395 + VERD} V${338.5 + VERD} H172`} fill="none" stroke={C.red} strokeWidth="1.6" opacity="0.6" style={flowOp} />
      )}
      {klepOnder && <Klepje x={280} y={372 + VERD} />}
      <Toestel dy={VERD} status="aan" label={onder.label} />

      {/* onderzijde: binnenbuis dicht met sifon, inspectiedeksels, gebogen bodem met afvoer */}
      <g stroke={LIJN} strokeWidth="0.9" fill="none">
        <path d="M185 736 H192.8 M185 753.5 H192.8 M192.8 734 V755.5" />
        <rect x="197.8" y="730.5" width="10" height="28.2" />
        <rect x="197.8" y="761.7" width="10" height="28.3" />
      </g>
      <g stroke={GRIJS} strokeWidth="0.8" fill="none">
        <path d="M207.8 739.5 A5 5 0 0 1 207.8 749.5" />
        <path d="M207.8 770.7 A5 5 0 0 1 207.8 780.7" />
        <path d="M158.3 754.5 V775 A9.35 9.35 0 0 0 177 775 V767" />
        <path d="M165.3 754.5 V775 A2.15 2.15 0 0 0 169.6 775 V767" />
        <circle cx="172.8" cy="763" r="4.5" />
        <path d="M137 800 Q167 806 197 800" />
        <path d="M161 803.7 H173.5 M171.3 803.7 V810.7 H225.8 M163.3 803.7 V811 Q163.3 818 170 818 H218.3" />
        <path d="M227 806 L218 823" />
      </g>
      {plaatOnder && (
        <g data-spel="typeplaat">
          <rect x="246" y="798" width="18" height="13" rx="1.5" fill="#C9D6EA" stroke={LIJN} strokeWidth="0.8" />
          <path d="M249 802 H261 M249 805 H259 M249 808 H260" stroke={LIJN} strokeWidth="0.5" />
        </g>
      )}

      <Breek y={230} />
      <Breek y={520} />
      <Breek y={710} />

      {children}
    </svg>
  );
}

// ─── TEKENING 2: AANSLUITSTOMP DOOR DE SCHACHTWAND (C10 figuur 3, PDF-pagina 10) ───
//
// Nagetekend op de uitsnede van de normfiguur (clv-gauntlet\tekenen\F6.png,
// 920 x 767 px = 4 px per PDF-punt). Coordinaten zijn dus de pixels van die
// uitsnede: links het kanaal (twee wanden), de binnenbuis en de ring die in
// de stomp ombuigen, de licht gearceerde schachtwand, de concentrische stomp
// met maten L, d1 en D1 en de eventuele brandmanchet met label. Alles wat
// niet in de figuur staat (doppen, rookgas, aansluitleiding, klep, wijslijnen)
// is spel en heeft data-spel.

const DIK = 5.5; // dikke lijnen van de figuur
const DUN = 2.6; // schachtwandlijnen en maatstrepen

function arceer(x0, x1, y0, y1) {
  // lichte arcering "/" om de 50 px, alleen binnen het vak
  const lijnen = [];
  for (let c = x0 + y0 - 44; c < x1 + y1 + 50; c += 50) {
    const ya = Math.max(y0, c - x1);
    const yb = Math.min(y1, c - x0);
    if (yb > ya) lijnen.push(`M${c - ya} ${ya} L${c - yb} ${yb}`);
  }
  return lijnen.join(" ");
}

function StompDetail({ rookgasUit = false, dop = {}, leiding = false, klep = false, manchet = true, children }) {
  const flowUit = { strokeDasharray: "14 12", animation: "flowDash 0.8s linear infinite" };
  return (
    <svg viewBox="0 0 920 767" className="w-full h-auto select-none" role="img" aria-label="Aansluitstomp door de schachtwand">
      <rect x="0" y="0" width="920" height="767" fill="white" />

      {/* afbreeklijnen boven en onder (licht), met stippen */}
      <g stroke="#DADADA" strokeWidth="2.4" fill="none">
        <path d="M0 8 L120 28 M230 46 L565 102" />
        <path d="M0 665 L120 685 M230 703 L565 759" />
      </g>
      <g fill={LIJN}>
        <rect x="176" y="35" width="3" height="6" />
        <rect x="389" y="71" width="4" height="6" />
        <rect x="176" y="690" width="3" height="3" />
        <rect x="389" y="723" width="4" height="6" />
      </g>

      {/* schachtwand: lichte arcering tussen twee dunne lijnen */}
      <path d={`${arceer(461, 537, 85, 409)} ${arceer(461, 537, 523, 750)}`} stroke="#D3D3D3" strokeWidth="2.6" fill="none" />
      <g stroke={LIJN} strokeWidth={DUN}>
        <line x1="460" y1="83" x2="460" y2="409" />
        <line x1="538" y1="95" x2="538" y2="409" />
        <line x1="460" y1="523" x2="460" y2="740" />
        <line x1="538" y1="523" x2="538" y2="752" />
      </g>

      {/* waar de stomp door de wand gaat, vallen wandrand en stomplijn samen tot een dikke band */}
      <g fill={LIJN}>
        <rect x="460" y="403" width="80" height="11" />
        <rect x="460" y="517" width="80" height="11" />
      </g>

      {/* kanaal en stomp */}
      <g stroke={LIJN} strokeWidth={DIK} fill="none" strokeLinejoin="miter">
        <path d="M33 11 V671" strokeWidth="11" />
        <path d="M107 26 V683" />
        <path d="M347 62 V434.5 H747" />
        <path d="M347 722 V497.5 H747" />
        <path d="M422.5 77 V410.5 H747" />
        <path d="M422.5 734 V521.5 H747" />
        <path d="M747 408 V524" />
      </g>

      {/* stroompijlen van de figuur: ring omlaag, binnenbuis omhoog met bocht uit de stomp */}
      <g fill={LIJN} stroke="none">
        <rect x="381.5" y="224" width="5" height="98" />
        <path d="M377.5 320 L390.5 320 L384 337 Z" />
        <rect x="294.5" y="350" width="5" height="90" />
        <path d="M290.5 352 L303.5 352 L297 335 Z" />
        <rect x="323" y="464.5" width="94" height="3.4" />
      </g>
      <path d="M297 440 Q300 466 323 466" stroke="#C8C8C8" strokeWidth="2.6" fill="none" />

      {/* maat L */}
      <line x1="591" y1="330" x2="746" y2="330" stroke={LIJN} strokeWidth={DUN} />
      <text x="660" y="320" fontSize="37" fontFamily="Arial, sans-serif" fill={LIJN}>L</text>

      {/* d1 en D1 */}
      <g fill={LIJN} fontFamily="Arial, sans-serif">
        <text x="784" y="480" fontSize="37">d</text>
        <text x="806" y="484" fontSize="32">1</text>
        <line x1="825" y1="432" x2="825" y2="500" stroke={LIJN} strokeWidth={DUN + 1} />
        <text x="860" y="480" fontSize="37">D</text>
        <text x="886" y="484" fontSize="32">1</text>
        <line x1="906" y1="411" x2="906" y2="521" stroke={LIJN} strokeWidth={DUN + 1} />
      </g>

      {/* eventuele brandmanchet: rood blokje boven en onder de stomp, label met holle pijl */}
      {manchet && (
        <g>
          <rect x="540" y="389" width="52" height="20" fill="#D00000" stroke={LIJN} strokeWidth="1.5" />
          <rect x="540" y="523" width="52" height="20" fill="#D00000" stroke={LIJN} strokeWidth="1.5" />
          <line x1="606" y1="582" x2="580" y2="562" stroke="#BDBDBD" strokeWidth={DUN} />
          <path d="M567 551 L590 557 L578 571 Z" fill="white" stroke="#BDBDBD" strokeWidth="2" />
          <text x="620" y="594" fontSize="33" textLength="246" lengthAdjust="spacingAndGlyphs" fontFamily="Arial, sans-serif" fill={LIJN}>evt. brandmanchet</text>
          <line x1="615" y1="604" x2="890" y2="604" stroke={LIJN} strokeWidth={DUN} />
        </g>
      )}

      {/* SPEL: nieuwe aansluitleiding (ronde 2), schuift over de stomp */}
      {leiding && (
        <g data-spel="leiding" stroke="#6B6B6B" strokeWidth="4" fill="none">
          <rect x="735" y="398" width="34" height="136" fill="white" />
          <path d="M769 410.5 H920 M769 521.5 H920" />
          <path d="M769 434.5 H920 M769 497.5 H920" strokeWidth="3" />
          <text x="915" y="388" fontSize="32" fontWeight="600" fill={C.brown} stroke="none" textAnchor="end">naar de ketel</text>
        </g>
      )}
      {leiding && klep && (
        <g data-spel="klep">
          <circle cx="845" cy="441" r="6" fill={C.green} />
          <line x1="845" y1="441" x2="871" y2="490" stroke={C.green} strokeWidth="7" strokeLinecap="round" />
          <text x="915" y="560" fontSize="34" fontWeight="700" fill={C.green} textAnchor="end">klep</text>
        </g>
      )}

      {/* SPEL: rookgas uit de open stomp (ronde 1) */}
      {rookgasUit && (
        <g data-spel="rookgas">
          <path d="M290 466 H760 Q775 466 775 450 V300" fill="none" stroke={C.red} strokeWidth="7" style={flowUit} />
          <path d="M762 316 L775 292 L788 316" fill="none" stroke={C.red} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <g style={{ animation: "pulseGlow 1.4s ease-in-out infinite" }}>
            <circle cx="690" cy="240" r="38" fill={C.red} opacity="0.14" />
            <circle cx="640" cy="262" r="24" fill={C.red} opacity="0.12" />
          </g>
        </g>
      )}

      {/* SPEL: doppen (ronde 1): de 60 mm-dop in de rookgasopening, de 100 mm-dop over het hele uiteinde */}
      {dop.rookgas && <rect data-spel="dop" x="712" y="438" width="32" height="57" rx="4" fill={C.green} stroke={C.oliveDark} strokeWidth="2" />}
      {dop.lucht && <rect data-spel="dop" x="748" y="400" width="28" height="132" rx="5" fill={C.olive} fillOpacity="0.85" stroke={C.oliveDark} strokeWidth="2" />}
      {children}
    </svg>
  );
}

// Overlay-vak boven een tekening, geplaatst in viewBox-coordinaten
function vakStijl(vb, x, y, w, h) {
  return {
    left: `${((x - vb.x) / vb.w) * 100}%`,
    top: `${((y - vb.y) / vb.h) * 100}%`,
    width: `${(w / vb.w) * 100}%`,
    height: `${(h / vb.h) * 100}%`,
  };
}
const VB_STOMP = { x: 0, y: 0, w: 920, h: 767 };

// stippellijn van een vak naar de plek in de tekening
function Wijslijnen({ vakken }) {
  return (
    <g data-spel="wijslijn" stroke={C.olive} strokeWidth="3.2" fill="none" strokeDasharray="9 7">
      {vakken.map((p) => {
        const [x, y, w, h] = p.vak;
        const bx = x + w * 0.75;
        const by = y < 380 ? y + h : y;
        return (
          <g key={p.id}>
            <path d={`M${p.doel[0]} ${p.doel[1]} L${bx} ${by}`} />
            <circle cx={p.doel[0]} cy={p.doel[1]} r="8" fill={C.olive} />
          </g>
        );
      })}
    </g>
  );
}

// ─── TYPEPLATEN (C10 bijlage B, figuur B1 en B2) ───

function PlaatTabel({ rijen, waarschuwing }) {
  return (
    <div className="shrink-0 rounded-md border overflow-hidden text-xs" style={{ borderColor: "#5C6F8C" }}>
      <table className="w-full border-collapse" style={{ backgroundColor: "#B8CCE4", color: C.brownText }}>
        <tbody>
          {rijen.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: "1px solid #5C6F8C" }}>
              <td className="px-2 py-0.5 align-top" style={{ borderRight: "1px solid #5C6F8C" }}>{k}</td>
              <td className="px-2 py-0.5 font-semibold align-top">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {waarschuwing && (
        <div className="px-2 py-1 text-xs" style={{ backgroundColor: "#D4D4D4", color: C.brownText }}>
          {waarschuwing}
        </div>
      )}
    </div>
  );
}

const C10_3 = (
  <span>
    C<sub style={{ fontSize: 12 }}>(10)3</sub> toestellen
  </span>
);

// Typeplaat per aansluiting (figuur B1): zes regels in dezelfde volgorde, dan de waarschuwing
function TypeplaatAansluiting() {
  return (
    <PlaatTabel
      rijen={[
        ["Fabrikant:", "(naam CLV-fabrikant)"],
        ["Alleen geschikt voor:", C10_3],
        ["Maximaal toelaatbare massastroom:", "15 gram/sec"],
        ["Maximaal toelaatbare belasting:", "35 kW op bovenwaarde"],
        ["Maximale CW klasse:", "CW 4"],
        ["Temperatuurklasse:", "T120"],
      ]}
      waarschuwing="Waarschuwing: haal je het toestel weg, sluit dan de opening voor rookgas en de opening voor lucht ieder apart af."
    />
  );
}

// Typeplaat onderaan het CLV (figuur B2): tien regels in dezelfde volgorde
function TypeplaatOnderaan({ temp, corrosie, materiaal }) {
  return (
    <PlaatTabel
      rijen={[
        ["Fabrikant:", "(naam CLV-fabrikant)"],
        ["Installateur", "(naam installateur)"],
        ["Installatie datum", "(datum)"],
        ["Diameter afvoerkanaal (uitwendig) in mm", "180"],
        ["Diameter toevoerkanaal (uitwendig) in mm", "270"],
        ["Temperatuurklasse in °C", temp],
        ["Drukklasse", "P1"],
        ["Corrosieklasse", corrosie],
        ["Materiaal", materiaal],
        ["Afstand tot brandbare materialen in mm", "0"],
      ]}
    />
  );
}

// Typeplaat als venster over het scherm: de balk onderin blijft kort en
// niets wordt afgedekt zolang de speler sleept (het venster is dan dicht).
function PlaatVenster({ titel, children, onSluit }) {
  return (
    <div className="fixed inset-0 z-[140] bg-black/50 flex items-center justify-center p-3" onClick={onSluit}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border-2 p-3 flex flex-col gap-2"
        style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold" style={{ color: C.brownText }}>{titel}</p>
        {children}
        <GameButton onClick={onSluit} className="w-full">Sluiten</GameButton>
      </div>
    </div>
  );
}

function PlaatKnop({ label, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="w-full min-h-[44px] rounded-xl border-2 px-3 text-sm font-bold text-left shrink-0"
      style={{ borderColor: "#5C6F8C", backgroundColor: "#E4EBF5", color: C.brownText }}
    >
      {label}
    </button>
  );
}

// ─── VRAGENPOOLS (elk minstens 6; per ronde worden er 2 verschillende getrokken) ───

const POOL_R1 = [
  {
    question: "Je haalt een ketel weg van een overdruk-CLV. Hoe sluit je de aansluitstomp af?",
    options: [
      "Rookgasopening en luchtopening ieder met een eigen dop",
      "Met een kap over de hele stomp, dan is alles in een keer dicht",
      "Alleen de rookgasopening; de luchtopening mag open blijven",
      "Alleen de luchtopening; daar stroomt de verbrandingslucht",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De typeplaat bij de aansluiting zegt het ook: rookgasopening en luchtopening ieder apart afsluiten.",
    feedbackWrong: "Sluit de rookgasopening en de luchtopening ieder apart af. Die waarschuwing staat op de typeplaat bij elke C(10)-aansluiting.",
    aandacht: "Bij het weghalen van een ketel: rookgasopening en luchtopening ieder apart afsluiten",
  },
  {
    question: "De oude ketel gaat eruit. Wat doe je met de oude aansluitleiding?",
    options: [
      "Ook weghalen: de nieuwe ketel krijgt een nieuwe aansluitleiding",
      "Laten zitten als hij nog heel is",
      "Opnieuw gebruiken als de nieuwe ketel van hetzelfde merk is",
      "Laten zitten en alleen de afdichtingsringen vervangen",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij een toestelvervanging vervang je ook de aansluitleiding.",
    feedbackWrong: "Bij een toestelvervanging vervang je ook de aansluitleiding. Ook als de oude nog heel lijkt.",
    aandacht: "Nieuwe ketel? Dan ook een nieuwe aansluitleiding",
  },
  {
    question: "Waarom komt er rookgas uit een open rookgasopening van een overdruk-CLV?",
    options: [
      "De ventilatoren van de ketels zetten het afvoerkanaal onder overdruk",
      "De natuurlijke trek in het kanaal duwt het rookgas naar beneden",
      "De luchttoevoer blaast het rookgas uit de binnenbuis",
      "De kap op het dak sluit zodra een ketel uit staat",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij een overdruk-CLV duwen de ventilatoren in de ketels het rookgas door het kanaal. Het afvoerkanaal staat dus onder overdruk.",
    feedbackWrong: "Bij een overdruk-CLV duwen de ventilatoren in de ketels het rookgas door het kanaal. Daardoor staat het afvoerkanaal onder overdruk en komt er rookgas uit een open opening.",
    aandacht: "Overdruk-CLV: de ventilatoren van de ketels zetten het afvoerkanaal onder overdruk",
  },
  {
    question: "Waar staat de waarschuwing dat je de openingen apart moet afsluiten?",
    options: [
      "Op de typeplaat bij de aansluiting van het CLV",
      "Op het typeplaatje van de ketel",
      "Op de typeplaat onderaan het CLV, bij het inspectieluik",
      "In de handleiding van de nieuwe ketel",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij elke C(10)-aansluiting hangt een typeplaat van de CLV-fabrikant met die waarschuwing.",
    feedbackWrong: "Die waarschuwing staat op de typeplaat bij de aansluiting. Die plaat hangt bij elke C(10)-aansluiting.",
    aandacht: "De typeplaat bij de aansluiting waarschuwt: openingen ieder apart afsluiten",
  },
  {
    question: "De nieuwe ketel is een C43. Mag die op een C(10)-aansluiting?",
    options: [
      "Nee: op deze aansluiting mag alleen een C(10)-ketel",
      "Ja: een C43 is ook een gesloten toestel met ventilator",
      "Ja, als hij niet zwaarder is dan de oude ketel",
      "Ja, als de aansluitleiding ook 60/100 is",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Op deze aansluiting mogen alleen C(10)-toestellen. Een C43 hoort bij een onderdruk-CLV.",
    feedbackWrong: "Nee. De typeplaat bij de aansluiting zegt: alleen geschikt voor C(10) toestellen. Een C43 hoort bij een onderdruk-CLV.",
    aandacht: "Op een C(10)-aansluiting alleen C(10)-toestellen; C43 hoort bij onderdruk",
  },
  {
    question: "Welke opening van een C(10)-aansluitstomp is voor het rookgas?",
    options: ["De opening in het midden, 60 mm", "De ring eromheen, 100 mm", "De opening in het midden, 100 mm", "De ring eromheen, 60 mm"],
    correct: 0,
    feedbackCorrect: "Klopt. Rookgas zit in het midden (60 mm), lucht in de ring eromheen (100 mm).",
    feedbackWrong: "Een C(10)-stomp is concentrisch: in het midden 60 mm voor rookgas, eromheen 100 mm voor lucht.",
    aandacht: "C(10)-stomp: rookgas 60 mm in het midden, lucht 100 mm eromheen",
  },
  {
    question: "Waar begint het CLV-systeem? Wie is daarvoor verantwoordelijk?",
    options: [
      "Bij de aansluitstomp in de schachtwand; die valt onder de CLV-fabrikant",
      "Bij de ketel; alles daarachter valt onder de CLV-fabrikant",
      "Bij de aansluitstomp; die valt onder de installateur",
      "Bij het inspectieluik onderaan; daarboven valt alles onder de installateur",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Het CLV begint bij de aansluitstomp en die valt onder de CLV-fabrikant. Vanaf de stomp sluit de installateur aan.",
    feedbackWrong: "Het CLV begint bij de aansluitstomp in de schachtwand; die valt onder de CLV-fabrikant. Vanaf daar sluit de installateur de ketel aan.",
    aandacht: "Het CLV begint bij de aansluitstomp; die valt onder de CLV-fabrikant",
  },
];

const POOL_R2 = [
  {
    question: "Welke aansluitleiding past op een C(10)-aansluitstomp?",
    options: [
      "Concentrisch: 60 mm rookgas en 100 mm lucht",
      "Concentrisch: 80 mm rookgas en 125 mm lucht",
      "Twee losse buizen naast elkaar (parallel)",
      "Concentrisch: 100 mm rookgas en 60 mm lucht",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij C(10) zijn stomp en aansluitleiding concentrisch: 60 mm rookgas, 100 mm lucht.",
    feedbackWrong: "Bij C(10) zijn stomp en aansluitleiding concentrisch: 60 mm voor rookgas, 100 mm voor lucht.",
    aandacht: "C(10): concentrische aansluitleiding, 60 mm rookgas en 100 mm lucht",
  },
  {
    question: "Je mist een bocht. Je collega heeft er een van een ander materiaal. Mag die in de aansluitleiding?",
    options: [
      "Nee: de aansluitleiding is van hetzelfde fabricaat, type en materiaal",
      "Ja, als de maat 60/100 klopt",
      "Ja, als het hetzelfde fabricaat is",
      "Ja, als je de verbinding extra afkit",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Materialen of fabrikanten mengen is een reden om een afvoer af te keuren.",
    feedbackWrong: "De aansluitleiding is van hetzelfde fabricaat, type en materiaal. Mengen is een reden om af te keuren.",
    aandacht: "Aansluitleiding: alles van hetzelfde fabricaat, type en materiaal",
  },
  {
    question: "Wat moet er volgens de handleiding van de ketel kloppen aan de aansluitleiding?",
    options: [
      "De lengte en de totale weerstand blijven onder het maximum van de fabrikant",
      "Alleen dat hij zo kort mogelijk is",
      "Alleen dat de maat 60/100 is",
      "Dat hij net zo lang is als de oude leiding",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De maximale lengte en de maximale weerstand staan in de handleiding van de ketel. Daarbinnen houd je de leiding zo kort als het kan.",
    feedbackWrong: "Lengte en totale weerstand van de aansluitleiding moeten onder het maximum van de ketelfabrikant blijven.",
    aandacht: "Aansluitleiding: lengte en totale weerstand onder het maximum van de fabrikant",
  },
  {
    question: "Waar vind je hoe lang de aansluitleiding maximaal mag zijn?",
    options: [
      "In de handleiding van de ketel",
      "Op de typeplaat bij de aansluiting",
      "Op de typeplaat onderaan het CLV",
      "In het voorschrift van de fabrikant van de doorvoer",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De maximale lengte staat in de installatievoorschriften van de ketel. Houd de leiding daarbinnen en zo kort als het kan.",
    feedbackWrong: "De maximale leidinglengte staat in de handleiding (installatievoorschriften) van de ketel.",
    aandacht: "Maximale lengte aansluitleiding: volgens de handleiding van de ketel",
  },
  {
    question: "Waar zit de terugslagklep?",
    options: [
      "In het rookgasdeel van de aansluitleiding; hij hoort bij de ketel",
      "In het luchtdeel van de aansluitleiding",
      "In het gemeenschappelijke kanaal in de schacht",
      "Onderaan het CLV, bij de sifon",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De klep zit in de aansluitleiding, in het rookgasdeel. Hij hoort bij de ketel.",
    feedbackWrong: "De terugslagklep zit in de aansluitleiding, in het rookgasdeel. Hij hoort bij de ketel.",
    aandacht: "De terugslagklep zit in het rookgasdeel van de aansluitleiding en hoort bij de ketel",
  },
  {
    question: "De klep zit los bij de nieuwe ketel. Waar vind je hoe je hem inbouwt?",
    options: [
      "In de handleiding van de ketel",
      "Op de typeplaat bij de aansluiting",
      "In het voorschrift van de fabrikant van de doorvoer",
      "Op de typeplaat onderaan het CLV",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Wordt de klep los meegeleverd, dan staat de inbouwinstructie in de handleiding van de ketel.",
    feedbackWrong: "Een los meegeleverde klep bouw je in volgens de handleiding van de ketel.",
    aandacht: "Losse terugslagklep: inbouwen volgens de handleiding van de ketel",
  },
  {
    question: "De klep van de oude ketel werkt nog goed. Mag die in de nieuwe aansluitleiding?",
    options: [
      "Nee: de klep hoort bij het toestel en is samen met de nieuwe ketel gekeurd",
      "Ja, als hij nog goed sluit",
      "Ja, als hij dezelfde maat heeft",
      "Ja, maar dan in het luchtdeel",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De nieuwe ketel heeft een terugslagklep nodig die samen met dat toestel is gekeurd.",
    feedbackWrong: "Een terugslagklep is geen los onderdeel: hij is samen met de nieuwe ketel gekeurd en hoort daarbij.",
    aandacht: "Gebruik alleen de terugslagklep die bij de nieuwe ketel hoort",
  },
  {
    question: "Volgens welk voorschrift werk je de doorvoer en een eventuele brandmanchet af?",
    options: [
      "Het voorschrift van de fabrikant van de doorvoer",
      "De handleiding van de ketel",
      "De typeplaat bij de aansluiting",
      "De typeplaat onderaan het CLV",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Brandwerende voorzieningen breng je aan volgens de fabrikant van de doorvoer.",
    feedbackWrong: "Brandwerende voorzieningen breng je aan volgens het voorschrift van de fabrikant van de doorvoer.",
    aandacht: "Brandwerende voorzieningen: volgens de fabrikant van de doorvoer",
  },
  {
    question: "Wat controleer jij als installateur bij de doorvoer van de aansluitleiding door de schachtwand?",
    options: [
      "Of schachtwand, stomp en een eventuele manchet samen de wbdbo-eis halen",
      "Niets: de CLV-fabrikant heeft de doorvoer ontworpen",
      "Alleen of de schacht 60 minuten brandwerend is",
      "Alleen of er een brandmanchet om de leiding zit",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De CLV-fabrikant ontwerpt de doorvoer; jij controleert of het geheel de wbdbo-eis haalt.",
    feedbackWrong: "De CLV-fabrikant ontwerpt de doorvoer. Jij controleert bij het aansluiten of schachtwand, stomp en een eventuele manchet samen de wbdbo-eis halen.",
    aandacht: "Bij de doorvoer controleer je of het geheel de wbdbo-eis haalt",
  },
  {
    question: "Hoeveel minuten is de wbdbo-eis voor de doorvoer?",
    options: [
      "Dat stel je eerst vast: 20, 30 of 60 minuten",
      "Altijd 60 minuten, net als de schacht",
      "Altijd 30 minuten",
      "Er is geen eis voor de doorvoer",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. De wbdbo-eis wordt eerst vastgesteld; die kan 20, 30 of 60 minuten zijn. De 60 minuten is de eis voor de schacht van een C(10)-CLV.",
    feedbackWrong: "De wbdbo-eis wordt eerst vastgesteld: 20, 30 of 60 minuten. De 60 minuten is de eis voor de schacht van een C(10)-CLV zelf.",
    aandacht: "Wbdbo-eis wordt eerst vastgesteld (20, 30 of 60 minuten); de schacht van een C(10)-CLV is 60 minuten",
  },
  {
    question: "Hoe sluit je een ketel aan op een half-CLV?",
    options: [
      "Rookgas op de gemeenschappelijke afvoer, lucht apart op de eigen luchttoevoer",
      "Rookgas en lucht allebei op de schacht",
      "Lucht op de schacht, rookgas apart naar de gevel",
      "Alleen de rookgasleiding; de ketel haalt lucht uit de opstellingsruimte",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij een half-CLV is alleen de afvoer gemeenschappelijk; de lucht sluit je apart aan.",
    feedbackWrong: "Bij een half-CLV gaat het rookgas naar de gemeenschappelijke afvoer en sluit je de lucht apart aan op de eigen luchttoevoer.",
    aandacht: "Half-CLV: rookgas op de gemeenschappelijke afvoer, lucht apart",
  },
  {
    question: "Wat hoort bij het goed monteren van de aansluitleiding?",
    options: [
      "Spanningsvrij en voldoende diep ingestoken",
      "Half ingestoken, zodat kunststof kan uitzetten",
      "Met een spanband strak naar de stomp getrokken",
      "Met kit in de stomp vastgezet",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Spanningsvrij, voldoende insteekdiepte en volgens de handleiding van de ketel.",
    feedbackWrong: "De aansluitleiding moet spanningsvrij zitten en voldoende diep ingestoken zijn.",
    aandacht: "Aansluitleiding spanningsvrij en voldoende diep insteken",
  },
];

const POOL_R3 = [
  {
    question: "Wat staat op de typeplaat bij een C(10)-aansluiting?",
    options: [
      "Alleen geschikt voor C(10) toestellen",
      "Alleen geschikt voor C43 toestellen",
      "Geschikt voor alle gesloten toestellen",
      "Geschikt voor alle toestellen met een ventilator",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij elke C(10)-aansluiting hangt een plaat met die tekst.",
    feedbackWrong: "Bij elke C(10)-aansluiting hangt een typeplaat met de tekst: alleen geschikt voor C(10) toestellen.",
    aandacht: "Typeplaat bij de aansluiting: alleen geschikt voor C(10) toestellen",
  },
  {
    question: "Op het typeplaatje van de ketel staat C43. De aansluiting is C(10). Wat doe je?",
    options: [
      "Afkeuren: op een overdruk-CLV mogen alleen C(10)-toestellen",
      "Goedkeuren: een C43 is ook een gesloten toestel",
      "Goedkeuren als de ketel een terugslagklep heeft",
      "Goedkeuren als de aansluitleiding 60/100 is",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Een C43 hoort bij een onderdruk-CLV. Op een overdruk-CLV mogen alleen C(10)-toestellen.",
    feedbackWrong: "Een C43 hoort bij een onderdruk-CLV. Op een overdruk-CLV mogen alleen C(10)-toestellen.",
    aandacht: "Op een overdruk-CLV alleen C(10)-toestellen; C43 hoort bij onderdruk",
  },
  {
    question: "Hoeveel lek mag de luchttoevoer van een C(10)-CLV per verdieping hebben, gemeten bij 50 Pa?",
    options: ["Minder dan 5 m³/h", "Minder dan 10 m³/h", "Minder dan 50 m³/h", "Minder dan 15 m³/h"],
    correct: 0,
    feedbackCorrect: "Klopt. Minder dan 5 m³/h per verdieping bij 50 Pa. Anders vervangen of voeren.",
    feedbackWrong: "De lek moet kleiner zijn dan 5 m³/h per verdieping, gemeten bij 50 Pa.",
    aandacht: "Luchttoevoer C(10): lek kleiner dan 5 m³/h per verdieping bij 50 Pa",
  },
  {
    question: "Welke temperatuurklasse moet een C(10)-afvoersysteem minstens hebben?",
    options: ["T120", "T80", "T100", "T60"],
    correct: 0,
    feedbackCorrect: "Klopt. Een C(10)-systeem heeft minimaal temperatuurklasse T120.",
    feedbackWrong: "Een C(10)-systeem moet minimaal temperatuurklasse T120 hebben.",
    aandacht: "C(10)-afvoersysteem: minimaal temperatuurklasse T120",
  },
  {
    question: "Welke klasse op de typeplaat laat zien dat het afvoersysteem geschikt is voor condens?",
    options: ["Corrosieklasse W", "Drukklasse P1", "Temperatuurklasse 120", "Afstand tot brandbare materialen 0 mm"],
    correct: 0,
    feedbackCorrect: "Klopt. Corrosieklasse W betekent geschikt voor condens.",
    feedbackWrong: "Corrosieklasse W betekent geschikt voor condens. Sommige systemen zijn alleen geschikt voor droge toepassingen.",
    aandacht: "Corrosieklasse W = geschikt voor condens",
  },
  {
    question: "Van welk materiaal mag een C(10)-CLV zijn?",
    options: ["Metaal of kunststof", "Alleen metaal", "Alleen kunststof", "Alleen roestvast staal"],
    correct: 0,
    feedbackCorrect: "Klopt. Een C(10)-CLV mag van metaal of kunststof zijn.",
    feedbackWrong: "Een C(10)-CLV mag van metaal of kunststof zijn.",
    aandacht: "C(10)-CLV: metaal of kunststof mag",
  },
  {
    question: "Wat is verplicht voor het gemeenschappelijke afvoersysteem van een C(10)-CLV?",
    options: ["Een CE-markering", "Een KOMO-keur van de installateur", "Een typeplaat op elke ketel", "Een eigen sifon per woning"],
    correct: 0,
    feedbackCorrect: "Klopt. De gemeenschappelijke voorziening van een C(10)-CLV moet een CE-markering hebben.",
    feedbackWrong: "De gemeenschappelijke voorziening van een C(10)-CLV moet een CE-markering hebben.",
    aandacht: "C(10)-CLV: CE-markering verplicht",
  },
  {
    question: "Hoe groot moet het bouwkundige inspectieluik onderaan de schacht minstens zijn?",
    options: ["50 x 50 cm", "40 x 40 cm", "30 x 30 cm", "60 x 60 cm"],
    correct: 0,
    feedbackCorrect: "Klopt. Minstens 50 x 50 cm. Het luik moet ook bereikbaar blijven.",
    feedbackWrong: "Het inspectieluik is minstens 50 x 50 cm en moet bereikbaar blijven.",
    aandacht: "Bouwkundig inspectieluik: minstens 50 x 50 cm en bereikbaar",
  },
  {
    question: "Hoe moeten de inspectieluikjes op het lucht- en rookgaskanaal open kunnen?",
    options: [
      "Zonder speciale hulpmiddelen",
      "Alleen met een speciale sleutel van de fabrikant",
      "Alleen via het dak",
      "Alleen na het openbreken van de schachtwand",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Beide kanalen moeten zonder speciale hulpmiddelen bereikbaar zijn voor inspectie en reiniging.",
    feedbackWrong: "Het lucht- en het rookgaskanaal moeten via een inspectieluik zonder speciale hulpmiddelen bereikbaar zijn.",
    aandacht: "Inspectieluikjes op de kanalen: open zonder speciale hulpmiddelen",
  },
  {
    question: "Wat geldt voor de condensafvoer onderaan het rookgaskanaal van een C(10)-CLV?",
    options: [
      "Er zit altijd een sifon in en die moet bereikbaar zijn",
      "Een sifon is alleen nodig bij kunststof",
      "De sifon mag achter een betimmering als hij maar werkt",
      "Een sifon is niet nodig bij overdruk",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Het rookgaskanaal heeft onderaan altijd een condensafvoer met sifon. De sifons moeten bereikbaar zijn.",
    feedbackWrong: "Het rookgaskanaal heeft onderaan altijd een condensafvoer met sifon. De sifons moeten bereikbaar zijn voor onderhoud en inspectie.",
    aandacht: "Condensafvoer rookgaskanaal: altijd een sifon die bereikbaar is",
  },
  {
    question: "Bij de controle vind je een gebrek. De bewoner wil vandaag warm water. Wat doe je?",
    options: [
      "Ketel niet in bedrijf stellen tot het gebrek is hersteld",
      "Ketel in bedrijf stellen en het gebrek later doorgeven",
      "Ketel in bedrijf stellen als de CO-meter nu niets meet",
      "Alleen het warme water aanzetten",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Pas als de installatie deugdelijk en veilig is, gaat de ketel aan.",
    feedbackWrong: "Je stelt de ketel pas in bedrijf als alles klopt. Met een gebrek is de installatie niet deugdelijk en veilig.",
    aandacht: "Gebrek gevonden? Ketel pas in bedrijf na herstel",
  },
];

// Twee verschillende controlevragen uit de pool; de kern doet de tweede
// vraag van dezelfde missie na volgendeKennisvraag().
function ControleBlok({ pool, beantwoord, onFout, onTussen, onKlaar, lastRound = false }) {
  const [paar] = useState(() => kiesTwee(pool.length));
  const [nr, setNr] = useState(0);
  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <StepBanner step={2} />
      <p className="text-xs font-bold mb-2" style={{ color: C.brown }}>
        Controlevraag {nr + 1} van 2
      </p>
      <MCControle
        key={nr}
        pool={[pool[paar[nr]]]}
        beantwoord={beantwoord}
        onFout={onFout}
        lastRound={lastRound && nr === 1}
        volgendeTekst={nr === 0 ? "Volgende vraag" : "Volgende ronde"}
        onComplete={() => {
          if (nr === 0) {
            onTussen();
            setNr(1);
            naarBoven();
          } else onKlaar();
        }}
      />
    </div>
  );
}

// ─── RONDE 1: OUDE KETEL ERUIT ───

function COMeter({ value }) {
  const rookgas = value >= 5;
  return (
    <div
      className="rounded-xl border-2 px-3 py-1 flex items-center justify-center gap-2 flex-wrap"
      style={{ backgroundColor: rookgas ? C.redLight : C.greenLight, borderColor: rookgas ? C.red : C.green }}
      aria-live="polite"
    >
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.brownText }}>
        CO-meter opstellingsruimte
      </span>
      <span className="text-lg font-bold tabular-nums" style={{ color: rookgas ? C.red : C.green }}>
        {Math.round(value)} ppm
      </span>
    </div>
  );
}

function DopKaart({ label, sub }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 px-2 py-1 min-h-[48px] min-w-[84px] bg-white shadow-sm select-none" style={{ borderColor: C.oliveDark }}>
      <span className="text-sm font-bold" style={{ color: C.brownText }}>{label}</span>
      {sub && <span className="text-xs" style={{ color: C.brown }}>{sub}</span>}
    </div>
  );
}

const R1_DOPPEN = [
  { id: "dop60", label: "Dop 60 mm" },
  { id: "dop100", label: "Dop 100 mm" },
  { id: "kap", label: "Kap", sub: "over alles" },
];

// twee vakken boven en onder de stomp; welk vak welke opening is, staat niet in de DOM
const R1_VAKKEN = [
  { id: "r1-vak-1", vak: [600, 10, 300, 130] },
  { id: "r1-vak-2", vak: [600, 625, 300, 130] },
];

// Per beurt willekeurig welk vak naar de ring (lucht) en welk naar het midden
// (rookgas) wijst; de ring wordt aangewezen aan de kant van het vak.
function maakR1Vakken() {
  const luchtBoven = Math.random() < 0.5;
  return R1_VAKKEN.map((v, i) => {
    const boven = i === 0;
    const opening = boven === luchtBoven ? "lucht" : "rookgas";
    const doel = opening === "rookgas" ? [752, 466] : boven ? [752, 422] : [752, 510];
    return { ...v, opening, doel };
  });
}

const R1_C43 = [
  { id: "goed", label: "Nee: hier mag alleen een C(10)-ketel op", goed: true },
  {
    id: "gesloten",
    label: "Ja: een C43 is ook een gesloten toestel met ventilator",
    uitleg: "Een C43 is wel een gesloten toestel met ventilator, maar de typeplaat zegt: alleen geschikt voor C(10) toestellen. Een C43 hoort bij een onderdruk-CLV.",
  },
  {
    id: "belasting",
    label: "Ja, als hij niet zwaarder is dan de oude ketel",
    uitleg: "Ook dan niet. De typeplaat zegt: alleen geschikt voor C(10) toestellen. Een C43 hoort bij een onderdruk-CLV.",
  },
];

function Ronde1({ beoordeel, onDone, noteer, skipIntro }) {
  const qaStap = skipIntro ? leesQaStap() : 0;
  const drag = useDrag();
  const [gestart, setGestart] = useState(skipIntro);
  const [ketelWeg, setKetelWeg] = useState(qaStap >= 2);
  const [leidingWeg, setLeidingWeg] = useState(qaStap >= 2);
  const [dicht, setDicht] = useState(() => (qaStap >= 3 ? { rookgas: true, lucht: true } : { rookgas: false, lucht: false }));
  const [plaatGedaan, setPlaatGedaan] = useState(false);
  const [plaatOpen, setPlaatOpen] = useState(false);
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [co, setCo] = useState(qaStap === 2 ? 180 : 0);
  const [doppen] = useState(() => schud(R1_DOPPEN));
  const [vakken] = useState(maakR1Vakken);
  const [c43Opties] = useState(() => schud(R1_C43));
  const stand = useRef({ ketelWeg, dicht });
  useEffect(() => {
    stand.current = { ketelWeg, dicht };
  }, [ketelWeg, dicht]);

  // CO loopt op zolang de rookgasweg open staat; hij zakt als de rookgasopening dicht is
  useEffect(() => {
    const timer = setInterval(() => {
      setCo((prev) => {
        const open = stand.current.ketelWeg && !stand.current.dicht.rookgas;
        const doel = open ? 400 : 0;
        const volgende = prev + (doel - prev) * (open ? 0.012 : 0.08);
        return Math.abs(volgende - doel) < 1 ? doel : volgende;
      });
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const fase = !leidingWeg ? "weg" : !(dicht.rookgas && dicht.lucht) ? "doppen" : !plaatGedaan ? "plaat" : "klaar";
  const klaar = (leidingWeg ? 1 : 0) + (dicht.rookgas ? 1 : 0) + (dicht.lucht ? 1 : 0) + (plaatGedaan ? 1 : 0);

  const goed = (tekst, point) => {
    beoordeel("goed", point);
    setMelding({ soort: "goed", tekst });
    setFout(null);
    playSound("drop");
  };
  const mis = (tekst, aandacht, point, slepen = true) => {
    noteer(aandacht);
    beoordeel("fout", point, slepen ? { slepen: true } : undefined);
    setMelding({ soort: "fout", tekst });
    drag.clearSelect();
  };

  const dropAfvoer = (payload, point) => {
    if (payload === "ketel" && !ketelWeg) {
      setKetelWeg(true);
      setMelding({ soort: "goed", tekst: "De ketel is los. De aansluitleiding staat nu open naar het afvoerkanaal. Dat staat onder overdruk. Snel verder!" });
      playSound("drop");
      return "correct";
    }
    if (payload === "leiding" && ketelWeg && !leidingWeg) {
      setLeidingWeg(true);
      goed("Goed. Bij een toestelvervanging vervang je ook de aansluitleiding. Let op: de stomp staat nu open.", point);
      naarBoven();
      return "correct";
    }
    return undefined;
  };
  const dropBewaren = (payload, point) => {
    if (payload === "leiding" && ketelWeg && !leidingWeg) {
      mis(
        "Niet bewaren: bij een toestelvervanging vervang je ook de aansluitleiding. Ook als hij nog heel lijkt.",
        "Nieuwe ketel? Dan ook een nieuwe aansluitleiding",
        point
      );
      return "wrong";
    }
    if (payload === "ketel") {
      setMelding({ soort: "fout", tekst: "Deze ketel wordt vervangen. Sleep hem naar Afvoeren." });
      drag.clearSelect();
    }
    return undefined;
  };

  const dropOpening = (opening) => (payload, point) => {
    if (dicht[opening]) return undefined;
    if (payload === "kap") {
      mis(
        "Een kap over alles mag niet. De typeplaat bij de aansluiting zegt: rookgasopening en luchtopening ieder apart afsluiten.",
        "Bij het weghalen van een ketel: rookgasopening en luchtopening ieder apart afsluiten",
        point
      );
      return "wrong";
    }
    if (opening === "rookgas" && payload === "dop60") {
      setDicht((p) => ({ ...p, rookgas: true }));
      goed("Dop 60 mm in het midden: de rookgasopening is dicht. De CO-meter in de opstellingsruimte (de ruimte waar de ketel hangt) zakt weer.", point);
      return "correct";
    }
    if (opening === "lucht" && payload === "dop100") {
      setDicht((p) => ({ ...p, lucht: true }));
      goed("Dop 100 mm over de buitenbuis: ook de luchtopening is apart dicht, zoals de typeplaat bij de aansluiting vraagt.", point);
      return "correct";
    }
    if (opening === "lucht") {
      mis(
        "Dit vak wijst naar de ring: de luchtopening van 100 mm. De dop van 60 mm hoort in het midden: daar zit het rookgas.",
        "C(10)-stomp: rookgas 60 mm in het midden, lucht 100 mm eromheen",
        point
      );
      return "wrong";
    }
    mis(
      "Dit vak wijst naar het midden: de rookgasopening van 60 mm. De dop van 100 mm hoort over de ring eromheen: daar zit de lucht.",
      "C(10)-stomp: rookgas 60 mm in het midden, lucht 100 mm eromheen",
      point
    );
    return "wrong";
  };

  const kiesC43 = (o) => {
    if (plaatGedaan) return;
    if (o.goed) {
      setPlaatGedaan(true);
      goed("Goed gelezen. Op deze aansluiting mogen alleen C(10)-toestellen. Een C43 hoort bij een onderdruk-CLV. Er komt dus een C(10)-ketel.");
      return;
    }
    setFout(o.id);
    mis(o.uitleg, "Op een C(10)-aansluiting alleen C(10)-toestellen; C43 hoort bij onderdruk", undefined, false);
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 1: Oude ketel eruit"
        intro="Je vervangt een ketel in een flat met een overdruk-CLV. De CO-meter in de opstellingsruimte (de ruimte waar de ketel hangt) laat zien of daar rookgas binnenkomt."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Overdruk-CLV">
          de ventilatoren van de ketels duwen het rookgas door het kanaal. Het afvoerkanaal staat daardoor onder overdruk.
        </UitlegItem>
        <UitlegItem term="Waar het CLV begint">
          bij de aansluitstomp in de schachtwand. Die valt onder de CLV-fabrikant. Tussen de stomp en de ketel zit de aansluitleiding van de installateur.
        </UitlegItem>
        <UitlegItem term="Typeplaat">bij elke C(10)-aansluiting hangt een typeplaat van de CLV-fabrikant. Lees hem voordat je iets losmaakt.</UitlegItem>
      </RondeIntro>
    );
  }

  const vb = UITSNEDE_BOVEN;
  const opdrachtTekst = {
    weg: !ketelWeg ? "sleep de oude ketel naar Afvoeren." : "wat doe je met de oude aansluitleiding? Sleep hem naar een bak.",
    doppen: "sluit de open stomp af. Sleep een dop of kap naar elk vraagteken.",
    plaat: "lees de typeplaat bij de aansluiting en beantwoord de vraag.",
    klaar: "klaar. Ga door naar de controlevragen.",
  }[fase];
  const stapNr = { weg: 1, doppen: 2, plaat: 3, klaar: 3 }[fase];

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <StepBanner step={1} />
      <Opdracht titel="Ronde 1: Oude ketel eruit" stap={stapNr} stappen={3} tekst={opdrachtTekst} klaar={klaar} totaal={4} />

      {fase === "weg" ? (
        <div className="relative w-full mb-2" style={{ maxWidth: 300 }}>
          <SchachtC10
            uitsnede={vb}
            boven={{ ketel: ketelWeg ? "weg" : "uit", leiding: "aan", label: ketelWeg ? null : "oude ketel" }}
            rookgasUit={ketelWeg ? "leiding" : null}
          />
          {!ketelWeg && (
            <Draggable payload="ketel" ghost={<DopKaart label="Oude ketel" />} className="absolute" style={vakStijl(vb, 238, 395, 87, 103)}>
              <div className="w-full h-full rounded-lg border-2 border-dashed" style={{ borderColor: C.olive, backgroundColor: "rgba(82,181,156,0.10)" }} />
            </Draggable>
          )}
          {ketelWeg && (
            <Draggable payload="leiding" ghost={<DopKaart label="Oude aansluitleiding" />} className="absolute" style={vakStijl(vb, 199, 318, 100, 82)}>
              <div className="w-full h-full rounded-lg border-2 border-dashed" style={{ borderColor: C.olive, backgroundColor: "rgba(82,181,156,0.10)" }} />
            </Draggable>
          )}
          <p className="text-xs text-center italic mt-1" style={{ color: C.brown }}>
            {ketelWeg ? "Pak de oude aansluitleiding (gestippeld vak)." : "Pak de oude ketel (gestippeld vak)."}
          </p>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center mb-2">
          <p className="text-xs italic mb-1" style={{ color: C.brown }}>
            Ingezoomd: de stomp in de schachtwand.
          </p>
          <div className="relative w-full" style={{ maxWidth: 460 }}>
            <StompDetail rookgasUit={!dicht.rookgas} dop={dicht}>
              {fase === "doppen" && <Wijslijnen vakken={vakken.filter((v) => !dicht[v.opening])} />}
            </StompDetail>
            {fase === "doppen" &&
              vakken.map((v) =>
                dicht[v.opening] ? null : (
                  <DropTarget key={v.id} id={v.id} onDropItem={dropOpening(v.opening)} className="absolute" style={vakStijl(VB_STOMP, ...v.vak)}>
                    {({ isHover, flash }) => (
                      <div
                        className="w-full h-full min-h-[44px] rounded-lg border-2 border-dashed flex items-center justify-center text-xl font-bold"
                        style={{
                          borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.oliveDark,
                          backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : "white",
                          color: C.oliveDark,
                        }}
                      >
                        ?
                      </div>
                    )}
                  </DropTarget>
                )
              )}
          </div>
        </div>
      )}

      {plaatOpen && (
        <PlaatVenster titel="Typeplaat bij de aansluiting" onSluit={() => setPlaatOpen(false)}>
          <TypeplaatAansluiting />
        </PlaatVenster>
      )}

      <VasteBalk>
        {fase !== "plaat" && fase !== "klaar" && <COMeter value={co} />}
        {fase !== "plaat" && <Melding melding={melding} />}
        {fase === "weg" && (
          <div className="flex gap-2">
            {[
              { id: "afvoer", titel: "Afvoeren", drop: dropAfvoer },
              { id: "bewaren", titel: "Bewaren voor de nieuwe ketel", drop: dropBewaren },
            ].map((bak) => (
              <DropTarget key={bak.id} id={`r1-${bak.id}`} onDropItem={bak.drop} className="flex-1">
                {({ isHover, flash }) => (
                  <div
                    className="rounded-2xl border-2 border-dashed min-h-[64px] flex items-center justify-center text-center px-2 text-sm font-bold transition-colors"
                    style={{
                      borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
                      backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : "white",
                      color: C.brownText,
                    }}
                  >
                    {bak.titel}
                  </div>
                )}
              </DropTarget>
            ))}
          </div>
        )}
        {fase === "doppen" && (
          <>
            <PlaatKnop label="Typeplaat bij de aansluiting: tik om te lezen" onOpen={() => setPlaatOpen(true)} />
            <div className="flex gap-2 justify-center">
              {doppen.filter((d) => !(d.id === "dop60" && dicht.rookgas) && !(d.id === "dop100" && dicht.lucht)).map((d) => (
                <Draggable key={d.id} payload={d.id} ghost={<DopKaart label={d.label} sub={d.sub} />}>
                  <DopKaart label={d.label} sub={d.sub} />
                </Draggable>
              ))}
            </div>
          </>
        )}
        {fase === "plaat" && (
          <>
            <TypeplaatAansluiting />
            <Keuzes vraag="De nieuwe ketel die morgen komt, is een C43. Mag die op deze aansluiting?" opties={c43Opties} onKies={kiesC43} fout={fout} />
            <Melding melding={melding} />
          </>
        )}
        {fase === "klaar" && (
          <GameButton onClick={onDone} variant="green" className="w-full">Naar de controlevragen</GameButton>
        )}
      </VasteBalk>
    </div>
  );
}

// ─── RONDE 2: NIEUWE KETEL AANSLUITEN ───

// Spelwaarden: alle drie de routes blijven binnen de 3 m; de keuze zit in
// de weerstand (maximum van de fabrikant) en in zo kort als het kan.
const R2_ROUTES = [
  { id: "A", label: "Route A: 1,6 m, 2 bochten, weerstand 60 % van het maximum", goed: true },
  {
    id: "B",
    label: "Route B: 2,8 m, 4 bochten, weerstand 95 % van het maximum",
    uitleg: "Route B mag volgens de handleiding, maar is langer dan nodig. Hoe langer de leiding, hoe groter de kans dat verbindingen losraken.",
  },
  {
    id: "C",
    label: "Route C: 1,4 m, 6 bochten, weerstand 115 % van het maximum",
    uitleg: "Route C is het kortst, maar de totale weerstand komt boven het maximum uit de handleiding. De weerstand van de aansluitleiding moet onder dat maximum blijven.",
  },
];

const R2_SETS = [
  { id: "set-1", titel: "Concentrisch 60/100", sub: "alle delen van hetzelfde fabricaat, type en materiaal", goed: true },
  {
    id: "set-2",
    titel: "Concentrisch 60/100",
    sub: "bocht van een ander materiaal",
    uitleg: "Niet mengen: de aansluitleiding is van hetzelfde fabricaat, type en materiaal. Een ander materiaal is een reden om af te keuren.",
    aandacht: "Aansluitleiding: alles van hetzelfde fabricaat, type en materiaal",
  },
  {
    id: "set-3",
    titel: "Concentrisch 60/100",
    sub: "bocht van een ander fabricaat",
    uitleg: "Niet mengen: de aansluitleiding is van hetzelfde fabricaat, type en materiaal. Een ander fabricaat is een reden om af te keuren.",
    aandacht: "Aansluitleiding: alles van hetzelfde fabricaat, type en materiaal",
  },
  {
    id: "set-4",
    titel: "Twee losse buizen 80 mm",
    sub: "parallel, hetzelfde fabricaat",
    uitleg: "Bij C(10) zijn stomp en aansluitleiding concentrisch: 60 mm rookgas, 100 mm lucht. 80 mm is de gewone stompmaat bij een onderdruk-CLV.",
    aandacht: "C(10): concentrische aansluitleiding, 60 mm rookgas en 100 mm lucht",
  },
];

const R2_MONTAGE = [
  { id: "goed", label: "Spanningsvrij en voldoende diep ingestoken, volgens de handleiding van de ketel", goed: true },
  {
    id: "half",
    label: "Half ingestoken, zodat kunststof ruimte heeft om uit te zetten",
    uitleg: "Half is niet genoeg: de insteekdiepte moet voldoende zijn. Met uitzetten van kunststof houd je wel rekening (10 mm is genoeg bij 2 m).",
  },
  {
    id: "band",
    label: "Met een spanband strak naar de stomp getrokken, dan zit hij muurvast",
    uitleg: "Niet trekken: de aansluitleiding moet spanningsvrij gemonteerd zijn.",
  },
];

const R2_KLEP_EERST = [
  { id: "goed", label: "In de handleiding van de nieuwe ketel nagaan of en hoe de klep erin moet", goed: true },
  {
    id: "oud",
    label: "De klep van de oude ketel overzetten, die werkte nog goed",
    uitleg: "De klep hoort bij het toestel: de nieuwe ketel heeft een klep die samen met dat toestel is gekeurd.",
  },
  {
    id: "merk",
    label: "Een klep van een ander merk nemen, die past ook op 60 mm",
    uitleg: "Een klep is geen los onderdeel. Je plaatst alleen een klep die bij deze ketel hoort en die de fabrikant van de ketel geschikt vindt.",
  },
];

const R2_VOORSCHRIFT = [
  { id: "goed", label: "Het voorschrift van de fabrikant van de doorvoer", goed: true },
  {
    id: "ketel",
    label: "De handleiding van de ketel",
    uitleg: "In de handleiding van de ketel staat hoe je de ketel aansluit en de klep inbouwt. Brandwerende voorzieningen breng je aan volgens de fabrikant van de doorvoer.",
  },
  {
    id: "plaat",
    label: "De typeplaat bij de aansluiting",
    uitleg: "Op die plaat staat welk toestel erop mag, niet hoe de doorvoer brandwerend wordt. Volg de fabrikant van de doorvoer.",
  },
];

const R2_CONTROLE = [
  { id: "goed", label: "Of schachtwand, stomp en de eventuele manchet samen de wbdbo-eis halen", goed: true },
  {
    id: "niets",
    label: "Niets: de CLV-fabrikant heeft de doorvoer ontworpen",
    uitleg: "De CLV-fabrikant ontwerpt de doorvoer, maar jij controleert bij het aansluiten of schachtwand, stomp en eventuele manchet samen de wbdbo-eis halen.",
  },
  {
    id: "zestig",
    label: "Alleen of de schacht 60 minuten brandwerend is",
    uitleg: "60 minuten is de eis voor de schacht van een C(10)-CLV. De wbdbo-eis voor de doorvoer wordt eerst vastgesteld: 20, 30 of 60 minuten.",
  },
];

const R2_HALF = [
  { id: "goed", label: "Op de eigen luchttoevoer van de woning, bijvoorbeeld uit de gevel", goed: true },
  {
    id: "ring",
    label: "Op de ring van de schacht, net als bij een CLV",
    uitleg: "Bij een half-CLV is alleen de afvoer gemeenschappelijk. De lucht sluit je apart aan op de eigen luchttoevoer, bijvoorbeeld uit de gevel.",
  },
  {
    id: "ruimte",
    label: "Nergens: de ketel haalt lucht uit de opstellingsruimte",
    uitleg: "Bij een half-CLV sluit je de ketel apart aan op de eigen luchttoevoer, bijvoorbeeld uit de gevel.",
  },
];

// plekken op de stomptekening (vak in viewBox-coordinaten en de plek waar de lijn naar wijst)
const KLEP_PLEKKEN = [
  { id: "p1", label: "Rookgasdeel aansluitleiding", doel: [845, 466], vak: [600, 10, 300, 130], goed: true },
  {
    id: "p2",
    label: "Luchtdeel aansluitleiding",
    doel: [860, 510],
    vak: [600, 625, 300, 130],
    uitleg: "In het luchtdeel stroomt verbrandingslucht. De klep hoort in het rookgasdeel van de aansluitleiding.",
  },
  {
    id: "p3",
    label: "Kanaal in de schacht",
    doel: [230, 300],
    vak: [120, 10, 300, 130],
    uitleg: "Het kanaal is van het CLV en wordt gedeeld met de buren. De klep hoort in jouw aansluitleiding, bij de ketel.",
  },
];

const MANCHET_PLEKKEN = [
  { id: "m1", label: "Om de leiding bij de schachtwand", doel: [566, 398], vak: [600, 10, 300, 130], goed: true },
  {
    id: "m2",
    label: "Bij de ketel",
    doel: [905, 535],
    vak: [600, 625, 300, 130],
    uitleg: "Een eventuele brandmanchet zit om de aansluitleiding waar die door de schachtwand gaat, niet bij de ketel.",
  },
  {
    id: "m3",
    label: "Om het kanaal in de schacht",
    doel: [230, 300],
    vak: [120, 10, 300, 130],
    uitleg: "Een eventuele brandmanchet zit om de aansluitleiding waar die door de schachtwand gaat, niet om het kanaal.",
  },
];

function SetKaart({ set }) {
  return (
    <div className="rounded-xl border-2 bg-white px-2.5 py-1.5 min-h-[56px] w-full select-none shadow-sm" style={{ borderColor: C.oliveDark }}>
      <div className="text-sm font-bold leading-tight" style={{ color: C.brownText }}>{set.titel}</div>
      <div className="text-xs leading-tight mt-0.5" style={{ color: C.brown }}>{set.sub}</div>
    </div>
  );
}

const R2_FASEN = ["route", "leiding", "montage", "klepEerst", "klepPlek", "manchet", "voorschrift", "controle", "half", "klaar"];
const R2_STAP = { route: 1, leiding: 2, montage: 2, klepEerst: 3, klepPlek: 3, manchet: 4, voorschrift: 4, controle: 4, half: 5, klaar: 5 };

function Ronde2({ beoordeel, onDone, noteer, skipIntro }) {
  const qaStap = skipIntro ? leesQaStap() : 0;
  const drag = useDrag();
  const [gestart, setGestart] = useState(skipIntro);
  const [fase, setFase] = useState(() => R2_FASEN[Math.min(Math.max(qaStap - 1, 0), R2_FASEN.length - 1)]);
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [sets] = useState(() => schud(R2_SETS));
  const [opties] = useState(() => ({
    route: schud(R2_ROUTES),
    montage: schud(R2_MONTAGE),
    klepEerst: schud(R2_KLEP_EERST),
    voorschrift: schud(R2_VOORSCHRIFT),
    controle: schud(R2_CONTROLE),
    half: schud(R2_HALF),
  }));

  const index = R2_FASEN.indexOf(fase);
  const schachtFase = ["route", "leiding", "montage"].includes(fase);
  const naar = (f) => {
    if (["route", "leiding", "montage"].includes(fase) && !["route", "leiding", "montage"].includes(f)) naarBoven();
    setFase(f);
    setFout(null);
  };
  const goed = (tekst, volgende, point) => {
    beoordeel("goed", point);
    setMelding({ soort: "goed", tekst });
    playSound("drop");
    naar(volgende);
  };
  const mis = (tekst, aandacht, point, slepen) => {
    noteer(aandacht);
    beoordeel("fout", point, slepen ? { slepen: true } : undefined);
    setMelding({ soort: "fout", tekst });
    drag.clearSelect();
  };

  const kies = (volgende, goedTekst, aandacht) => (o) => {
    if (o.goed) {
      goed(goedTekst, volgende);
      return;
    }
    setFout(o.id);
    mis(o.uitleg, aandacht);
  };

  const dropSet = (payload, point) => {
    if (fase !== "leiding") return undefined;
    const set = R2_SETS.find((s) => s.id === payload);
    if (!set) return undefined;
    if (set.goed) {
      goed("Past: concentrisch 60/100 op de C(10)-stomp, alles van hetzelfde fabricaat, type en materiaal.", "montage", point);
      return "correct";
    }
    mis(set.uitleg, set.aandacht, point, true);
    return "wrong";
  };

  const kiesKlepPlek = (p) => {
    if (fase !== "klepPlek") return;
    if (p.goed) {
      goed("Ja: de klep zit in de aansluitleiding, in het rookgasdeel. Hij hoort bij de ketel. Op een overdruk-CLV is hij verplicht.", "manchet");
      return;
    }
    setFout(p.id);
    mis(p.uitleg, "De terugslagklep zit in het rookgasdeel van de aansluitleiding en hoort bij de ketel");
  };

  const dropManchet = (plek) => (payload, point) => {
    if (fase !== "manchet" || payload !== "manchet") return undefined;
    if (plek.goed) {
      goed("Goed: een eventuele brandmanchet zit om de aansluitleiding waar die door de schachtwand gaat. Of hij nodig is en hoe hij erom moet, bepaalt het voorschrift.", "voorschrift", point);
      return "correct";
    }
    mis(plek.uitleg, "Een eventuele brandmanchet zit om de aansluitleiding bij de doorvoer door de schachtwand", point, true);
    return "wrong";
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 2: Nieuwe ketel aansluiten"
        intro="De nieuwe C(10)-ketel hangt. Sluit hem aan op de stomp."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Aansluitleiding">
          die kies en monteer jij, vanaf de stomp. De handleiding van de ketel zegt hoe en hoe lang.
        </UitlegItem>
        <UitlegItem term="Terugslagklep">op een overdruk-CLV moet elke ketel er een hebben. De klep hoort bij het toestel.</UitlegItem>
        <UitlegItem term="Doorvoer">
          waar de leiding door de schachtwand gaat, moet de wand brandwerend blijven (wbdbo: weerstand tegen branddoorslag en brandoverslag).
        </UitlegItem>
      </RondeIntro>
    );
  }

  const opdrachten = {
    route: "kies de route voor de aansluitleiding. Kijk naar de handleiding van de ketel.",
    leiding: "sleep de juiste aansluitleiding naar de gestippelde route.",
    montage: "hoe monteer je de leiding?",
    klepEerst: "de terugslagklep zit los bij de ketel. Wat doe je eerst?",
    klepPlek: "tik op de plek waar de terugslagklep komt.",
    manchet: "waar hoort een eventuele brandmanchet? Sleep hem naar de goede plek.",
    voorschrift: "volgens welk voorschrift werk je de doorvoer af?",
    controle: "wat controleer jij daarna bij de doorvoer?",
    half: "stel: dit gebouw had een half-CLV. Waar sluit je dan de luchtleiding aan?",
    klaar: "klaar. Ga door naar de controlevragen.",
  };
  const vb = UITSNEDE_BOVEN;

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <StepBanner step={1} />
      <Opdracht titel="Ronde 2: Nieuwe ketel aansluiten" stap={R2_STAP[fase]} stappen={5} tekst={opdrachten[fase]} klaar={Math.min(index, 9)} totaal={9} />

      {schachtFase ? (
        <div className="relative w-full mb-2" style={{ maxWidth: 300 }}>
          <SchachtC10
            uitsnede={vb}
            boven={{ ketel: fase === "montage" ? "aan" : "uit", leiding: fase === "route" ? "geen" : fase === "leiding" ? "gat" : "aan", label: "nieuwe ketel" }}
            routes={fase === "route"}
          />
          {fase === "leiding" && (
            <DropTarget id="r2-route" onDropItem={dropSet} className="absolute" style={vakStijl(vb, 192, 318, 108, 82)}>
              {({ isHover, flash }) => (
                <div
                  className="w-full h-full rounded-lg border-2 border-dashed flex items-end justify-center text-xs font-bold pb-1"
                  style={{
                    borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.oliveDark,
                    backgroundColor: flash === "wrong" ? "rgba(217,72,59,0.15)" : isHover ? "rgba(82,181,156,0.18)" : "rgba(255,255,255,0.35)",
                    color: C.oliveDark,
                  }}
                >
                  leiding hier
                </div>
              )}
            </DropTarget>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center mb-2">
          <p className="text-xs italic mb-1" style={{ color: C.brown }}>
            Ingezoomd: de stomp met de nieuwe leiding.
          </p>
          <div className="relative w-full" style={{ maxWidth: 460 }}>
            <StompDetail leiding klep={index >= 5} manchet={index >= 6}>
              {fase === "klepPlek" && <Wijslijnen vakken={KLEP_PLEKKEN} />}
              {fase === "manchet" && <Wijslijnen vakken={MANCHET_PLEKKEN} />}
            </StompDetail>
            {fase === "klepPlek" &&
              KLEP_PLEKKEN.map((p) => (
                <button
                  key={p.id}
                  onClick={() => kiesKlepPlek(p)}
                  className="absolute rounded-lg border-2 text-xs font-bold leading-tight px-1 flex items-center justify-center text-center shadow-sm"
                  style={{
                    ...vakStijl(VB_STOMP, ...p.vak),
                    minHeight: 44,
                    backgroundColor: fout === p.id ? C.redLight : "white",
                    borderColor: fout === p.id ? C.red : C.oliveDark,
                    color: C.brownText,
                  }}
                >
                  {p.label}
                </button>
              ))}
            {fase === "manchet" &&
              MANCHET_PLEKKEN.map((p) => (
                <DropTarget key={p.id} id={`r2-${p.id}`} onDropItem={dropManchet(p)} className="absolute" style={vakStijl(VB_STOMP, ...p.vak)}>
                  {({ isHover, flash }) => (
                    <div
                      className="w-full h-full min-h-[44px] rounded-lg border-2 border-dashed text-xs font-bold leading-tight px-1 flex items-center justify-center text-center"
                      style={{
                        borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.oliveDark,
                        backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : "white",
                        color: C.brownText,
                      }}
                    >
                      {p.label}
                    </div>
                  )}
                </DropTarget>
              ))}
          </div>
        </div>
      )}

      <VasteBalk>
        <Melding melding={melding} />
        {fase === "route" && (
          <>
            <p className="text-sm rounded-lg px-2 py-1.5" style={{ backgroundColor: C.beigeLight, color: C.brownText }}>
              <span className="font-bold">Handleiding ketel:</span> aansluitleiding maximaal 3 m, totale weerstand onder het maximum.
            </p>
            <Keuzes
              opties={opties.route}
              fout={fout}
              onKies={kies("leiding", "Goed: binnen de maximale lengte en onder de maximale weerstand uit de handleiding van de ketel. En zo kort als het kan: hoe korter, hoe kleiner de kans dat verbindingen losraken.", "Aansluitleiding: binnen lengte en weerstand uit de ketelhandleiding en zo kort als het kan")}
            />
          </>
        )}
        {fase === "leiding" && (
          <div className="grid grid-cols-2 gap-2">
            {sets.map((s) => (
              <Draggable key={s.id} payload={s.id} ghost={<div style={{ width: 150 }}><SetKaart set={s} /></div>}>
                <SetKaart set={s} />
              </Draggable>
            ))}
          </div>
        )}
        {fase === "montage" && (
          <Keuzes opties={opties.montage} fout={fout} onKies={kies("klepEerst", "Goed: spanningsvrij, voldoende insteekdiepte en volgens de handleiding van de ketel. Bij kunststof houd je rekening met uitzetten.", "Aansluitleiding spanningsvrij en voldoende diep insteken")} />
        )}
        {fase === "klepEerst" && (
          <Keuzes opties={opties.klepEerst} fout={fout} onKies={kies("klepPlek", "Goed: de klep zit los bij de ketel, dus de inbouwinstructie staat in de handleiding van de ketel. Daar zie je ook of de klep geschikt is.", "Gebruik alleen de terugslagklep die bij de nieuwe ketel hoort")} />
        )}
        {fase === "manchet" && (
          <div className="flex justify-center">
            <Draggable payload="manchet" ghost={<DopKaart label="Brandmanchet" />}>
              <DopKaart label="Brandmanchet" />
            </Draggable>
          </div>
        )}
        {fase === "voorschrift" && (
          <Keuzes opties={opties.voorschrift} fout={fout} onKies={kies("controle", "Goed: de doorvoer en een eventuele brandmanchet breng je aan volgens het voorschrift van de fabrikant van de doorvoer.", "Brandwerende voorzieningen: volgens de fabrikant van de doorvoer")} />
        )}
        {fase === "controle" && (
          <Keuzes opties={opties.controle} fout={fout} onKies={kies("half", "Goed. De CLV-fabrikant ontwerpt de doorvoer; jij controleert of het geheel de wbdbo-eis haalt. Die eis wordt eerst vastgesteld: 20, 30 of 60 minuten. De schacht van een C(10)-CLV zelf is altijd 60 minuten brandwerend.", "Bij de doorvoer controleer je of het geheel de wbdbo-eis haalt")} />
        )}
        {fase === "half" && (
          <Keuzes opties={opties.half} fout={fout} onKies={kies("klaar", "Goed: bij een half-CLV is alleen de afvoer gemeenschappelijk. Het rookgas gaat naar de schacht, de lucht sluit je apart aan op de eigen luchttoevoer.", "Half-CLV: rookgas op de gemeenschappelijke afvoer, lucht apart")} />
        )}
        {fase === "klaar" && (
          <GameButton onClick={onDone} variant="green" className="w-full">Naar de controlevragen</GameButton>
        )}
      </VasteBalk>
    </div>
  );
}

// ─── RONDE 3: CONTROLEREN EN OPLEVEREN ───

// Zeven controlepunten bij het werk van een collega (onderste ketel). Per
// speelbeurt zitten er willekeurig 0 tot 3 gebreken in. Elke melding (goed en
// fout) noemt de regel, zodat de controlevragen altijd behandelde stof toetsen.
// x/y = stip, doel = plek waar de wijslijn heen gaat (figuurcoordinaten).
const PUNTEN = [
  {
    id: "ketel",
    naam: "Ketel en typeplaat bij de aansluiting",
    x: 300,
    y: 722,
    ok: [{ ketel: "C(10)3" }],
    gebreken: [{ ketel: "C43" }],
    goedOk: "Klopt: de plaat zegt alleen geschikt voor C(10) toestellen. Dit is een C(10)3-ketel. Een C43 (onderdruk) zou hier niet mogen.",
    goedGebrek: "Goed gezien: een C43 hoort bij een onderdruk-CLV. Op deze aansluiting mogen alleen C(10)-toestellen.",
    foutOk: "Dit klopt wel: de plaat vraagt een C(10)-toestel en de ketel is een C(10)3. Alleen een C43 (onderdruk) zou je afkeuren.",
    foutGebrek: "Kijk naar het type: C43 hoort bij een onderdruk-CLV. Hier mogen alleen C(10)-toestellen op.",
    aandacht: "Vergelijk de typeplaat bij de aansluiting met het typeplaatje van de ketel: alleen C(10) op C(10)",
  },
  {
    id: "klep",
    naam: "Aansluitleiding",
    x: 282,
    y: 656,
    ok: [{ tekst: "In het rookgasdeel van de aansluitleiding zit de terugslagklep die bij deze ketel hoort." }],
    gebreken: [
      { tekst: "Er zit geen terugslagklep in de aansluitleiding." },
      { tekst: "Er zit een terugslagklep in het luchtdeel. In het rookgasdeel zit geen klep." },
    ],
    goedOk: "Klopt: op een overdruk-CLV moet de ketel een terugslagklep hebben, in het rookgasdeel van de aansluitleiding.",
    goedGebrek: "Goed gezien: op een overdruk-CLV moet de ketel een terugslagklep hebben, in het rookgasdeel. Zonder klep kan rookgas uit het kanaal terugstromen.",
    foutOk: "Dit klopt wel: de klep die bij de ketel hoort, zit in het rookgasdeel van de aansluitleiding.",
    foutGebrek: "Afkeuren: op een overdruk-CLV moet de ketel een terugslagklep hebben, in het rookgasdeel van de aansluitleiding.",
    aandacht: "Controleer of de terugslagklep in het rookgasdeel van de aansluitleiding zit",
  },
  {
    id: "doorvoer",
    naam: "Doorvoer door de schachtwand",
    x: 230,
    y: 594,
    doel: [200, 624],
    ok: [
      { tekst: "De doorvoer is dicht afgewerkt, met een brandmanchet om de leiding, volgens het voorschrift van de fabrikant van de doorvoer. De wbdbo-eis wordt gehaald." },
      { tekst: "De doorvoer is dicht afgewerkt volgens het voorschrift van de fabrikant van de doorvoer. Dat voorschrift vraagt hier geen brandmanchet. De wbdbo-eis wordt gehaald." },
    ],
    gebreken: [{ tekst: "Rond de leiding zit een open kier in de schachtwand." }],
    goedOk: "Klopt: de doorvoer haalt de wbdbo-eis en is afgewerkt volgens de fabrikant van de doorvoer. Een brandmanchet is er alleen als dat voorschrift erom vraagt.",
    goedGebrek: "Goed gezien: met een open kier haalt de doorvoer de wbdbo-eis niet. Laat hem afwerken volgens de fabrikant van de doorvoer.",
    foutOk: "Dit klopt wel: de doorvoer is afgewerkt volgens de fabrikant van de doorvoer en haalt de wbdbo-eis. Een brandmanchet is er alleen als dat voorschrift erom vraagt.",
    foutGebrek: "Afkeuren: met een open kier haalt de doorvoer de wbdbo-eis niet.",
    aandacht: "Controleer of de doorvoer door de schachtwand de wbdbo-eis haalt",
  },
  {
    id: "lek",
    naam: "Lekmeting luchttoevoer (deze verdieping)",
    x: 98,
    y: 632,
    doel: [140, 632],
    ok: [{ tekst: "Gemeten lek: 3 m³/h bij 50 Pa." }],
    gebreken: [{ tekst: "Gemeten lek: 8 m³/h bij 50 Pa." }],
    goedOk: "Klopt: minder dan 5 m³/h per verdieping bij 50 Pa. De luchttoevoer is dicht genoeg.",
    goedGebrek: "Goed gezien: de grens is 5 m³/h per verdieping bij 50 Pa. Deze luchttoevoer moet vervangen of gevoerd worden.",
    foutOk: "Dit klopt wel: de grens is minder dan 5 m³/h per verdieping bij 50 Pa.",
    foutGebrek: "Afkeuren: de luchttoevoer mag per verdieping minder dan 5 m³/h lekken bij 50 Pa.",
    aandacht: "Luchttoevoer C(10): lek kleiner dan 5 m³/h per verdieping bij 50 Pa",
  },
  {
    id: "luik",
    naam: "Inspectieluiken onderaan",
    x: 228,
    y: 748,
    doel: [208, 748],
    ok: [{ tekst: "Bouwkundig luik 50 x 50 cm, vrij bereikbaar. De luikjes op lucht- en rookgaskanaal gaan open zonder speciale hulpmiddelen." }],
    gebreken: [
      { tekst: "Bouwkundig luik 40 x 40 cm. De luikjes op lucht- en rookgaskanaal gaan open zonder speciale hulpmiddelen." },
      { tekst: "Er staat een vaste kast voor het bouwkundige luik van 50 x 50 cm." },
    ],
    goedOk: "Klopt: het luik is minstens 50 x 50 cm en bereikbaar. De luikjes op de kanalen gaan open zonder speciale hulpmiddelen.",
    goedGebrek: "Goed gezien: het bouwkundige luik moet minstens 50 x 50 cm zijn en bereikbaar blijven. Daarachter moeten de luikjes op de kanalen open kunnen zonder speciale hulpmiddelen.",
    foutOk: "Dit klopt wel: 50 x 50 cm en bereikbaar. De luikjes op de kanalen gaan open zonder speciale hulpmiddelen.",
    foutGebrek: "Afkeuren: het bouwkundige luik moet minstens 50 x 50 cm zijn en bereikbaar blijven. De luikjes erachter moeten open kunnen zonder speciale hulpmiddelen.",
    aandacht: "Bouwkundig inspectieluik: minstens 50 x 50 cm en bereikbaar",
  },
  {
    id: "sifon",
    naam: "Condensafvoer onderaan",
    x: 98,
    y: 772,
    doel: [158, 768],
    ok: [{ tekst: "Onder de binnenbuis zit een sifon in de condensafvoer. Hij is bereikbaar voor onderhoud en inspectie." }],
    gebreken: [
      { tekst: "In de condensafvoer onder de binnenbuis zit geen sifon." },
      { tekst: "De sifon zit achter een dichtgeschroefde betimmering." },
    ],
    goedOk: "Klopt: het rookgaskanaal heeft onderaan altijd een condensafvoer met sifon. De sifon moet bereikbaar zijn.",
    goedGebrek: "Goed gezien: het rookgaskanaal heeft onderaan altijd een condensafvoer met sifon. Die moet bereikbaar zijn voor onderhoud en inspectie.",
    foutOk: "Dit klopt wel: er zit een sifon in en die is bereikbaar.",
    foutGebrek: "Afkeuren: het rookgaskanaal heeft onderaan altijd een condensafvoer met sifon. Die moet bereikbaar zijn.",
    aandacht: "Condensafvoer rookgaskanaal: altijd een sifon die bereikbaar is",
  },
  {
    id: "plaat",
    naam: "Typeplaat onderaan het CLV",
    x: 290,
    y: 818,
    doel: [264, 806],
    ok: [
      { temp: "120", corrosie: "W", materiaal: "RVS (316L)", ce: true },
      { temp: "120", corrosie: "W", materiaal: "PP (kunststof)", ce: true },
    ],
    gebreken: [
      { temp: "80", corrosie: "W", materiaal: "RVS (316L)", ce: true },
      { temp: "120", corrosie: "(niet vermeld)", materiaal: "RVS (316L)", ce: true, droog: true },
      { temp: "120", corrosie: "W", materiaal: "PP (kunststof)", ce: false },
    ],
    goedOk: "Klopt: CE-markering aanwezig, minstens T120 en corrosieklasse W (geschikt voor condens). Een C(10)-CLV mag van metaal of kunststof zijn.",
    goedGebrek: "Goed gezien: een C(10)-systeem heeft een CE-markering, minstens T120 en corrosieklasse W (geschikt voor condens). Metaal of kunststof mag allebei.",
    foutOk: "Dit klopt wel: CE-markering, T120, corrosieklasse W. Een C(10)-CLV mag van metaal of kunststof zijn.",
    foutGebrek: "Afkeuren: een C(10)-systeem moet een CE-markering hebben, minstens T120 en corrosieklasse W (geschikt voor condens). Een systeem dat alleen geschikt is voor droge toepassingen, mag niet.",
    aandacht: "C(10)-systeem: CE-markering, minimaal T120, corrosieklasse W; metaal of kunststof",
  },
];

// Per speelbeurt: welke punten een gebrek hebben (0 tot 3) en welke variant
function maakSituatie() {
  const r = Math.random();
  const aantal = r < 0.15 ? 0 : r < 0.45 ? 1 : r < 0.8 ? 2 : 3;
  const metGebrek = schud(PUNTEN.map((p) => p.id)).slice(0, aantal);
  const kies = (lijst) => lijst[Math.floor(Math.random() * lijst.length)];
  const situatie = {};
  for (const p of PUNTEN) {
    const gebrek = metGebrek.includes(p.id);
    situatie[p.id] = { gebrek, data: kies(gebrek ? p.gebreken : p.ok) };
  }
  return situatie;
}

// Wat de speler bij een punt ziet. De typeplaten openen in een venster, zodat
// de balk kort blijft en de tekening met het punt in beeld blijft.
function PlaatOnderaanInhoud({ data }) {
  return (
    <>
      <TypeplaatOnderaan temp={data.temp} corrosie={data.corrosie} materiaal={data.materiaal} />
      <p className="text-sm" style={{ color: C.brownText }}>
        CE-markering op het kanaal: <span className="font-bold">{data.ce ? "aanwezig" : "ontbreekt"}</span>
      </p>
      {data.droog && (
        <p className="text-sm" style={{ color: C.brownText }}>
          Productinformatie: <span className="font-bold">alleen geschikt voor droge toepassingen.</span>
        </p>
      )}
    </>
  );
}

function Observatie({ punt, data, onPlaat }) {
  if (punt.id === "ketel") {
    return (
      <>
        <div className="rounded-md border px-2 py-1 text-sm font-semibold self-start" style={{ borderColor: C.brownText, backgroundColor: "#EDEDED", color: C.brownText }}>
          Typeplaatje ketel: gesloten cv-toestel, type {data.ketel}
        </div>
        <PlaatKnop label="Bekijk de typeplaat bij de aansluiting" onOpen={onPlaat} />
      </>
    );
  }
  if (punt.id === "plaat") {
    return <PlaatKnop label="Bekijk de typeplaat onderaan het CLV" onOpen={onPlaat} />;
  }
  return <p className="text-sm" style={{ color: C.brownText }}>{data.tekst}</p>;
}

function Ronde3({ beoordeel, onDone, noteer, skipIntro }) {
  const qaStap = skipIntro ? leesQaStap() : 0;
  const [gestart, setGestart] = useState(skipIntro);
  const [situatie] = useState(maakSituatie);
  const [oordelen, setOordelen] = useState(() => (qaStap >= 2 ? Object.fromEntries(PUNTEN.map((p) => [p.id, true])) : {}));
  const [actief, setActief] = useState(qaStap === 1 ? "ketel" : null);
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [plaatOpen, setPlaatOpen] = useState(false);
  const [keuze, setKeuze] = useState([]); // besluit: aangetikte punten of "geen"
  const [besloten, setBesloten] = useState(false);

  const gebrekIds = PUNTEN.filter((p) => situatie[p.id].gebrek).map((p) => p.id);
  const alleGedaan = PUNTEN.every((p) => oordelen[p.id]);
  const klaar = Object.keys(oordelen).length + (besloten ? 1 : 0);
  const punt = actief ? PUNTEN.find((p) => p.id === actief) : null;

  const open = (id, e) => {
    if (oordelen[id]) return;
    setActief(id);
    setFout(null);
    setMelding(null);
    const stip = e?.currentTarget;
    setTimeout(() => stip?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 60);
  };

  const oordeel = (afkeuren) => {
    if (!punt || oordelen[punt.id]) return;
    const gebrek = situatie[punt.id].gebrek;
    if (afkeuren === gebrek) {
      beoordeel("goed");
      playSound("correct");
      setOordelen((p) => ({ ...p, [punt.id]: true }));
      setMelding({ soort: "goed", tekst: gebrek ? punt.goedGebrek : punt.goedOk });
      setActief(null);
      setFout(null);
      return;
    }
    setFout(afkeuren ? "af" : "goed");
    noteer(punt.aandacht);
    beoordeel("fout");
    setMelding({ soort: "fout", tekst: `${gebrek ? punt.foutGebrek : punt.foutOk} Kies opnieuw.` });
  };

  const tikKeuze = (id) => {
    if (besloten) return;
    setFout(null);
    setMelding(null);
    setKeuze((k) => {
      if (id === "geen") return k.includes("geen") ? [] : ["geen"];
      const zonder = k.filter((x) => x !== "geen");
      return zonder.includes(id) ? zonder.filter((x) => x !== id) : [...zonder, id];
    });
  };

  const bevestig = () => {
    if (besloten || keuze.length === 0) return;
    const juist = gebrekIds.length === 0 ? ["geen"] : gebrekIds;
    const klopt = keuze.length === juist.length && juist.every((id) => keuze.includes(id));
    if (klopt) {
      beoordeel("goed");
      playSound("levelup");
      setBesloten(true);
      setMelding({
        soort: "goed",
        tekst:
          gebrekIds.length > 0
            ? "Goed: deze punten herstel je eerst. Pas als de checklist klopt, is de installatie deugdelijk en veilig en lever je op."
            : "Goed: alle punten kloppen. De installatie is deugdelijk en veilig: je levert op en de ketel mag in bedrijf.",
      });
      return;
    }
    noteer("Gebrek gevonden? Ketel pas in bedrijf na herstel");
    beoordeel("fout");
    setFout("besluit");
    const namen = gebrekIds.map((id) => PUNTEN.find((p) => p.id === id).naam.toLowerCase());
    setMelding({
      soort: "fout",
      tekst:
        gebrekIds.length > 0
          ? `Niet goed. ${namen.length === 1 ? "Een punt had" : `${namen.length} punten hadden`} een gebrek. Kijk terug naar wat je afkeurde en pas je keuze aan.`
          : "Niet goed. Alle zeven punten klopten: er hoeft niets hersteld te worden. Pas je keuze aan.",
    });
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 3: Controleren en opleveren"
        intro="Een collega heeft in de woning eronder een ketel aangesloten. Keur zeven punten voordat die ketel aangaat."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="C(10)-systeem">
          CE-markering verplicht, van metaal of kunststof, minstens temperatuurklasse T120 en geschikt voor condens (corrosieklasse W).
        </UitlegItem>
        <UitlegItem term="Luchttoevoer">minder dan 5 m³/h lek per verdieping, gemeten bij 50 Pa.</UitlegItem>
        <UitlegItem term="Opleveren">pas als alle punten kloppen. Dan mag de ketel in bedrijf.</UitlegItem>
      </RondeIntro>
    );
  }

  const vb = UITSNEDE_ONDER;
  const klepWeg = situatie.klep.gebrek && oordelen.klep;
  const tekst = !alleGedaan
    ? "tik op elk rood punt en keur het goed of af."
    : !besloten
      ? "welke punten moeten eerst hersteld worden? Tik ze aan, of tik Geen."
      : "klaar. Ga door naar de controlevragen.";

  return (
    <div className={`flex-1 flex flex-col items-center p-3 sm:p-6 ${RUIMTE_VOOR_BALK}`}>
      <StepBanner step={1} />
      <Opdracht titel="Ronde 3: Controleren en opleveren" stap={alleGedaan ? 2 : 1} stappen={2} tekst={tekst} klaar={klaar} totaal={8} />

      <div className="relative w-full mb-2" style={{ maxWidth: 300 }}>
        <SchachtC10
          uitsnede={vb}
          boven={{ ketel: "aan", leiding: "aan" }}
          onder={{ ketel: besloten && gebrekIds.length === 0 ? "aan" : "uit", label: "ketel collega" }}
          klepOnder={!klepWeg}
          plaatOnder
        >
          <g data-spel="wijslijn" stroke={C.red} strokeWidth="1.3" strokeDasharray="3 3" fill="none" opacity="0.8">
            {PUNTEN.filter((p) => p.doel && !oordelen[p.id]).map((p) => (
              <path key={p.id} d={`M${p.x} ${p.y} L${p.doel[0]} ${p.doel[1]}`} />
            ))}
          </g>
        </SchachtC10>
        {PUNTEN.map((p) => {
          const gedaan = oordelen[p.id];
          const isActief = actief === p.id;
          return (
            <button
              key={p.id}
              onClick={(e) => open(p.id, e)}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11"
              style={{ left: `${((p.x - vb.x) / vb.w) * 100}%`, top: `${((p.y - vb.y) / vb.h) * 100}%` }}
              aria-label={p.naam}
            >
              {!gedaan && <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: isActief ? C.olive : C.red, opacity: 0.3 }} />}
              <span
                className="absolute inset-1 rounded-full border-2 flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: gedaan ? "#8C857C" : isActief ? C.olive : C.red, borderColor: "white" }}
              >
                {gedaan ? "✓" : "?"}
              </span>
            </button>
          );
        })}
      </div>

      {plaatOpen && punt && (
        <PlaatVenster
          titel={punt.id === "ketel" ? "Typeplaat bij de aansluiting" : "Typeplaat onderaan het CLV"}
          onSluit={() => setPlaatOpen(false)}
        >
          {punt.id === "ketel" ? <TypeplaatAansluiting /> : <PlaatOnderaanInhoud data={situatie.plaat.data} />}
        </PlaatVenster>
      )}

      <VasteBalk>
        <Melding melding={melding} />
        {!alleGedaan &&
          (punt ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.olive }}>{punt.naam}</p>
              <Observatie punt={punt} data={situatie[punt.id].data} onPlaat={() => setPlaatOpen(true)} />
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "goed", label: "Goedkeuren", af: false },
                  { id: "af", label: "Afkeuren", af: true },
                ].map((k) => (
                  <button
                    key={k.id}
                    onClick={() => oordeel(k.af)}
                    className="min-h-[44px] rounded-xl border-2 text-sm font-bold"
                    style={{
                      backgroundColor: fout === k.id ? C.redLight : "white",
                      borderColor: fout === k.id ? C.red : k.af ? C.amber : C.green,
                      color: C.brownText,
                    }}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: C.brown }}>Tik op een rood punt in de tekening.</p>
          ))}
        {alleGedaan && !besloten && (
          <>
            <p className="text-sm font-bold" style={{ color: C.brownText }}>Besluit: welke punten moeten eerst hersteld worden?</p>
            <div className="grid grid-cols-2 gap-2">
              {[...PUNTEN.map((p) => ({ id: p.id, label: p.naam })), { id: "geen", label: "Geen: alles klopt" }].map((o) => {
                const aan = keuze.includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => tikKeuze(o.id)}
                    className="min-h-[44px] rounded-xl border-2 text-xs sm:text-sm font-bold px-2 text-left leading-tight"
                    style={{ backgroundColor: aan ? C.oliveLight : "white", borderColor: aan ? C.oliveDark : C.beigeMid, color: C.brownText }}
                    aria-pressed={aan}
                  >
                    {aan ? "✓ " : ""}
                    {o.label}
                  </button>
                );
              })}
            </div>
            <GameButton onClick={bevestig} disabled={keuze.length === 0} className="w-full">
              Bevestig besluit
            </GameButton>
          </>
        )}
        {besloten && (
          <GameButton onClick={onDone} variant="green" className="w-full">Naar de controlevragen</GameButton>
        )}
      </VasteBalk>
    </div>
  );
}

// ─── STARTSCHERM ───

function StartScreen({ onStart }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="py-3 px-5 text-center" style={{ backgroundColor: C.bgHeader }}>
        <span className="text-white font-bold italic text-lg">De CLV-Monteur</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
        <div className="rounded-full p-7 border-4" style={{ backgroundColor: C.beigeLight, borderColor: C.brownText }}>
          <Wrench className="w-20 h-20" style={{ color: C.brownText }} />
        </div>
        <h1 className="text-3xl font-bold italic" style={{ color: C.brownText }}>
          De CLV-Monteur
        </h1>
        <p className="max-w-sm text-center font-medium" style={{ color: C.brown }}>
          Haal een oude ketel weg, sluit een nieuwe veilig aan en controleer het werk
        </p>
        <GameButton onClick={onStart}>Start de game</GameButton>
      </div>
    </div>
  );
}

// ─── MAIN ───

// Kernpunten van deze game: staan altijd op het eindscherm, ook bij een foutloos spel.
const LEERMOMENTEN = [
  "Bij een toestelvervanging gaat ook de aansluitleiding weg; de nieuwe ketel krijgt een nieuwe",
  "Rookgasopening en luchtopening sluit je ieder apart af; dat staat op de typeplaat bij de aansluiting",
  "Het CLV begint bij de aansluitstomp (van de CLV-fabrikant); de C(10)-stomp is concentrisch: 60 mm rookgas, 100 mm lucht",
  "Op een C(10)-aansluiting alleen C(10)-toestellen; een C43 hoort bij onderdruk",
  "Aansluitleiding: hetzelfde fabricaat, type en materiaal; lengte en totale weerstand binnen het maximum van de ketelhandleiding en kort; spanningsvrij en voldoende diep ingestoken",
  "Terugslagklep: verplicht op een overdruk-CLV, hoort bij de ketel, in het rookgasdeel van de aansluitleiding; inbouwen volgens de ketelhandleiding",
  "Doorvoer: eventuele brandmanchet volgens de fabrikant van de doorvoer; jij controleert of het geheel de wbdbo-eis haalt; de schacht van een C(10)-CLV is 60 minuten brandwerend",
  "C(10)-systeem: CE-markering, metaal of kunststof, minstens T120 en corrosieklasse W; luchttoevoer minder dan 5 m³/h lek per verdieping bij 50 Pa",
  "Pas opleveren en in bedrijf stellen als alle punten kloppen",
];

export default function CLVMonteurGame({ initialScreen = "start", onExit, onGameComplete, qaFase = null }) {
  const [screen, setScreen] = useState(initialScreen);
  const { aandacht, noteer, reset: resetAandacht } = useAandacht();
  const juice = useGameJuice();
  const { sessie, stand, herstart } = useSessie(maakOpzet, { zender });
  // QA-sprong met &fase=opdracht: de eerste getoonde ronde slaat de introkaart over
  const [qaRonde] = useState(() => (qaFase === "opdracht" ? initialScreen : null));

  // controlemenu-sprong: speel de kern door tot het gevraagde scherm
  useState(() => doorspelenTot(sessie, initialScreen));

  // De ronde begint zodra het rondescherm in beeld komt
  // (startRonde is idempotent zolang de ronde al bezig is).
  useEffect(() => {
    if (RONDE_SCHERMEN.includes(screen)) sessie.startRonde();
  }, [screen, sessie]);

  // Een ronde meldt alleen wat de speler deed; de kern bepaalt de punten en
  // de levens en sluit de ronde als hij vol of gefaald is.
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

  // Staat de kern op het eind (ook direct na een herkansing), dan wint dat
  // van het eigen schermpje.
  const scherm = stand.fase === "eind" ? "end" : screen;

  // het menu markeert deze game als gespeeld zodra het eindscherm verschijnt (ontgrendelt game 3)
  useEffect(() => {
    if (scherm === "end") onGameComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scherm]);

  const resetGame = () => {
    herstart();
    setScreen("start");
    resetAandacht();
  };

  // derde fout: de kern sloot de ronde als gefaald en gaf verse levens
  const gefaald = stand.fase === "rondeklaar" && stand.ronde?.status === "gefaald";

  // Een ronde is af: door naar de controlevragen. Sluit de kernronde ook als
  // er handelingen open bleven.
  const rondeAf = (mcScreen) => {
    sessie.rondeKlaar();
    if (sessie.stand.fase === "rondeklaar") sessie.verder();
    if (sessie.stand.fase === "kennisvraag") {
      setScreen(mcScreen);
      naarBoven();
    }
  };

  // tussen de twee vragen: de kern gaat door naar de tweede vraag van de missie
  const tussenVraag = () => sessie.volgendeKennisvraag();
  const vraagKlaar = (next) => () => {
    sessie.volgendeKennisvraag();
    if (next !== "end") setScreen(next);
    naarBoven();
  };

  const showProgress = !["start", "intro", "end"].includes(scherm);
  const rondeProps = { beoordeel, noteer };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ backgroundColor: C.bgPage }}>
      <juice.JuiceOverlay />
      <DragProvider>
        <div
          className="max-w-[800px] w-full mx-auto flex flex-col min-h-screen shadow-lg overflow-x-hidden"
          style={{ backgroundColor: C.bgPage, animation: juice.shaking ? "shake 0.3s ease-in-out" : "none" }}
        >
          {showProgress && <ProgressBar currentRound={SCREEN_ROUND[scherm] ?? 1} score={Math.max(0, stand.punten)} lives={stand.levens} totalRounds={3} />}

          {scherm === "start" && <StartScreen onStart={() => setScreen("intro")} />}

          {scherm === "intro" && (
            <IntroScreen title="Missie: de monteur" buttonText="Aan de slag" onNext={() => setScreen("r1")}>
              <div className="leading-relaxed" style={{ color: C.brownText }}>
                <p className="mb-2">
                  Jij bent de monteur in een flat met een overdruk-CLV (C(10)). Alle ketels zijn aangesloten op hetzelfde luchtkanaal en hetzelfde rookgaskanaal.
                </p>
                <p>Je haalt een oude ketel weg, sluit een nieuwe aan en controleert het werk van een collega.</p>
              </div>
            </IntroScreen>
          )}

          {scherm === "r1" && <Ronde1 {...rondeProps} skipIntro={qaRonde === "r1"} onDone={() => rondeAf("r1mc")} />}
          {scherm === "r1mc" && (
            <ControleBlok key="r1mc" pool={POOL_R1} beantwoord={beantwoord} onFout={noteer} onTussen={tussenVraag} onKlaar={vraagKlaar("r2")} />
          )}

          {scherm === "r2" && <Ronde2 {...rondeProps} skipIntro={qaRonde === "r2"} onDone={() => rondeAf("r2mc")} />}
          {scherm === "r2mc" && (
            <ControleBlok key="r2mc" pool={POOL_R2} beantwoord={beantwoord} onFout={noteer} onTussen={tussenVraag} onKlaar={vraagKlaar("r3")} />
          )}

          {scherm === "r3" && <Ronde3 {...rondeProps} skipIntro={qaRonde === "r3"} onDone={() => rondeAf("r3mc")} />}
          {scherm === "r3mc" && (
            <ControleBlok key="r3mc" pool={POOL_R3} beantwoord={beantwoord} onFout={noteer} onTussen={tussenVraag} onKlaar={vraagKlaar("end")} lastRound />
          )}

          {scherm === "end" && (
            <EindschermKern
              sessie={sessie}
              stand={stand}
              tekst="Sterk werk! Je hebt een oude ketel veilig weggehaald, een nieuwe ketel volgens de regels aangesloten en het werk gecontroleerd voordat de ketel aanging."
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
