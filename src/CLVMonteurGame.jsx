import { useState, useCallback, useEffect, useRef } from "react";
import { Wrench, CheckCircle, XCircle, ClipboardCheck } from "lucide-react";
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

// De CLV-Monteur (game 2 van 3): aansluiten en opleveren op een overdruk-CLV
// (C(10)). Score, sterren, levens en het eindscherm komen uit de gedeelde kern
// (src/microgame/). Elke ronde is een missie met een ronde en twee
// kennisvragen; de kern stelt na volgendeKennisvraag() vanzelf de tweede vraag.
//
// Handelingen (= echte beoordeel("goed")-momenten):
//   r1 Oude ketel eruit: aansluitleiding afvoeren, dop rookgas, dop lucht,
//      CO-controle = 4 (het wegslepen van de ketel zelf is geen keuze en telt niet)
//   r2 Nieuwe ketel aansluiten: route, leiding, montage, klep eerst, klep plek,
//      brandmanchet, voorschrift = 7
//   r3 Controleren en opleveren: 7 controlepunten + besluit in bedrijf = 8
// Haalbaar: (4 + 7 + 8) x 100 + 6 kennisvragen x 100 = 2500.
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
    { id: "m2", rondes: [{ id: "r2", handelingen: 7 }], kennisvragen: [{ id: "k2a" }, { id: "k2b" }] },
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
// de eerste getoonde ronde (alleen voor screenshots; telt niet als spel).
function leesQaStap() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("qa") !== "1") return 0;
    return Number(p.get("stap")) || 0;
  } catch {
    return 0;
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
    <div className="w-full max-w-2xl mb-3 text-center">
      <h2 className="text-lg sm:text-xl font-bold italic mb-1" style={{ color: C.brownText }}>{titel}</h2>
      <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
        {stap && (
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold border" style={{ borderColor: C.olive, color: C.oliveDark, backgroundColor: C.oliveLight }}>
            Stap {stap} van {stappen}
          </span>
        )}
        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold border" style={{ borderColor: C.beigeMid, color: C.brown, backgroundColor: "white" }}>
          {klaar} van {totaal} gedaan
        </span>
      </div>
      <p className="text-sm sm:text-base font-bold" style={{ color: C.brownText }}>
        Opdracht: <span className="font-semibold">{tekst}</span>
      </p>
    </div>
  );
}

// Waarom-regel: bij goed groen (ook leren als je gokt), bij fout rood
function Melding({ melding }) {
  if (!melding) return null;
  const goed = melding.soort === "goed";
  return (
    <div
      className="w-full max-w-xl rounded-xl border-2 px-3 py-2 my-2 flex items-start gap-2 text-sm font-medium"
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
    <div className="w-full max-w-xl">
      {vraag && (
        <p className="text-sm font-bold italic mb-2 text-center" style={{ color: C.brownText }}>{vraag}</p>
      )}
      <div className="flex flex-col gap-2">
        {opties.map((o) => (
          <button
            key={o.id}
            onClick={() => onKies(o)}
            className="text-left px-4 py-2.5 min-h-[44px] rounded-xl border-2 text-sm font-medium transition-all"
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
// Per ronde wordt een uitsnede getoond.

const K = { xl: 137, xi1: 149.5, xi2: 185, xr: 197 }; // kanaal: buiten links, binnenbuis, buiten rechts
const VERD = 286; // afstand tussen de twee verdiepingen in de figuur
const UITSNEDE_BOVEN = { x: 40, y: 245, w: 290, h: 278 };
const UITSNEDE_ONDER = { x: 40, y: 530, w: 290, h: 342 };

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
        <text x="281.5" y={450 + dy} fontSize="8.5" fontWeight="700" fill={C.brown} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function Klepje({ x, y, kleur = C.green }) {
  // terugslagklep als scharnierend klepje in de rookgasleiding
  return (
    <g>
      <circle cx={x} cy={y} r="1.6" fill={kleur} />
      <line x1={x} y1={y} x2={x + 4.5} y2={y + 4.5} stroke={kleur} strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function SchachtC10({
  uitsnede,
  boven = { ketel: "aan", leiding: "aan", label: null },
  onder = { ketel: "aan", label: null },
  rookgasUit = null, // null | "leiding" | "kanaal"
  routes = false,
  routeKeuze = null,
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
  const vb = `${uitsnede.x} ${uitsnede.y} ${uitsnede.w} ${uitsnede.h}`;

  return (
    <svg viewBox={vb} className="w-full h-auto select-none" role="img" aria-label="Doorsnede van een overdruk-CLV met twee ketels">
      <defs>
        <pattern id="gaasMon" width="4.2" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 0 V4 M0 0 H4.2" fill="none" stroke={LIJN} strokeWidth="0.45" />
        </pattern>
      </defs>
      <rect x={uitsnede.x} y={uitsnede.y} width={uitsnede.w} height={uitsnede.h} fill="white" />

      {/* stromen (spel): rookgas omhoog in de binnenbuis, lucht omlaag in de ring */}
      <path d="M167.5 752 V60" fill="none" stroke={C.red} strokeWidth="2.2" opacity="0.55" style={flowOp} />
      <path d={`M143 130 V798`} fill="none" stroke={BLAUW} strokeWidth="1.6" opacity="0.5" style={flowNeer} />
      <path d={`M191 130 V798`} fill="none" stroke={BLAUW} strokeWidth="1.6" opacity="0.5" style={flowNeer} />

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

      {/* stroompijlen van de figuur: ring omlaag, binnenbuis omhoog */}
      {[0, VERD].map((dy) => (
        <g key={dy}>
          {pijlV(143.5, 282.5 + dy, 315 + dy, `l1${dy}`)}
          {pijlV(191.5, 282.5 + dy, 315 + dy, `r1${dy}`)}
          {pijlV(143.5, 415 + dy, 447.5 + dy, `l2${dy}`)}
          {pijlV(191.5, 415 + dy, 447.5 + dy, `r2${dy}`)}
          {pijlV(167.5, 467.5 + dy, 430 + dy, `m2${dy}`)}
          {pijlV(167.5, 330 + dy, 300 + dy, `m1${dy}`)}
        </g>
      ))}

      {/* BOVENSTE VERDIEPING */}
      {routes && (
        <g fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M282 397 V338 H197" stroke={C.olive} strokeDasharray="5 4" opacity="0.8" />
          <path d="M282 397 V375 H318 V292 H212 V338 H197" stroke={routeKeuze === "B" ? C.red : C.olive} strokeDasharray="5 4" opacity="0.8" />
        </g>
      )}
      {boven.leiding === "gat" && (
        <path d="M282 397 V338 H197" fill="none" stroke={C.olive} strokeWidth="5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
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
        <>
          <path d="M282 395 V338.5 H172" fill="none" stroke={C.red} strokeWidth="1.8" opacity="0.8" style={flowOp} />
          {boven.klep && <Klepje x={280} y={372} />}
        </>
      )}
      <Toestel dy={0} status={boven.ketel === "weg" ? "weg" : "aan"} label={boven.label} />

      {/* rookgas komt de woning in: open aansluitleiding of open stomp */}
      {rookgasUit === "leiding" && (
        <g>
          <path d="M172 338.5 H282 V412" fill="none" stroke={C.red} strokeWidth="2.6" style={flowOp} />
          <path d="M277.5 406 L282 414 L286.5 406" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {rookgasUit === "kanaal" && (
        <g>
          <path d="M167.5 338.5 H236" fill="none" stroke={C.red} strokeWidth="2.6" style={flowOp} />
          <path d="M230 334 L238 338.5 L230 343" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {rookgasUit && (
        <g style={{ animation: "pulseGlow 1.4s ease-in-out infinite" }}>
          <circle cx={rookgasUit === "leiding" ? 282 : 252} cy={rookgasUit === "leiding" ? 432 : 350} r="16" fill={C.red} opacity="0.14" />
          <circle cx={rookgasUit === "leiding" ? 262 : 270} cy={rookgasUit === "leiding" ? 450 : 372} r="11" fill={C.red} opacity="0.12" />
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
        <path d={`M282 ${395 + VERD} V${338.5 + VERD} H172`} fill="none" stroke={C.red} strokeWidth="1.8" opacity="0.8" style={flowOp} />
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
        <g>
          <rect x="236" y="808" width="18" height="13" rx="1.5" fill="#C9D6EA" stroke={LIJN} strokeWidth="0.8" />
          <path d="M239 812 H251 M239 815 H249 M239 818 H250" stroke={LIJN} strokeWidth="0.5" />
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
// Links het gemeenschappelijke kanaal (ring omlaag, binnenbuis omhoog), rechts
// de gearceerde schachtwand, de concentrische stomp met d1 en D1, de maat L
// en (als hij er is) de brandmanchet boven en onder de stomp aan de kant van
// de woning. In ronde 2 komt daar de nieuwe aansluitleiding aan vast.

function StompDetail({
  open = true, // stomp zonder leiding (ronde 1)
  rookgasUit = false,
  dop = {}, // { rookgas, lucht }
  leiding = false,
  klep = false,
  manchet = false,
  maten = true,
  children,
}) {
  const flowUit = { strokeDasharray: "6 5", animation: "flowDash 0.8s linear infinite" };
  return (
    <svg viewBox="10 0 440 345" className="w-full h-auto select-none" role="img" aria-label="Aansluitstomp door de schachtwand">
      <defs>
        <pattern id="arceerMon" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke={GRIJS} strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect x="10" y="0" width="440" height="345" fill="white" />

      {/* afbreeklijnen boven en onder (grijs) */}
      <g stroke={GRIJS} strokeWidth="0.7">
        <line x1="15" y1="15" x2="67.5" y2="22.5" />
        <line x1="115" y1="31" x2="260" y2="55" />
        <line x1="15" y1="302" x2="67.5" y2="310" />
        <line x1="115" y1="322" x2="260" y2="342" />
      </g>
      <g fill={GRIJS}>
        <circle cx="91.5" cy="26" r="0.9" />
        <circle cx="185" cy="43" r="0.9" />
        <circle cx="91.5" cy="314" r="0.9" />
        <circle cx="185" cy="330" r="0.9" />
      </g>

      {/* kanaal: linkerwanden doorlopend, rechterwanden buigen af in de stomp */}
      <g stroke={LIJN} strokeWidth="1.8" fill="none" strokeLinejoin="miter">
        <path d="M36.5 16 V300" />
        <path d="M69 20 V305" />
        <path d="M172.5 37 V196.5 H345" />
        <path d="M172.5 322 V226 H345" />
        <path d="M205 44 V189 H345" />
        <path d="M205 328 V235 H345" />
        {open && !leiding && <path d="M345 189 V235" />}
      </g>

      {/* schachtwand, gearceerd, onderbroken door de stomp */}
      <rect x="222.5" y="47" width="35" height="140" fill="url(#arceerMon)" />
      <rect x="222.5" y="237" width="35" height="98" fill="url(#arceerMon)" />
      <g stroke={LIJN} strokeWidth="0.8">
        <line x1="222.5" y1="47" x2="222.5" y2="187" />
        <line x1="257.5" y1="51" x2="257.5" y2="187" />
        <line x1="222.5" y1="237" x2="222.5" y2="331" />
        <line x1="257.5" y1="237" x2="257.5" y2="335" />
      </g>

      {/* stroompijlen van de figuur */}
      {pijlV(189, 110, 158, "ringneer", 2)}
      <path d="M160 212.5 H202.5" stroke={GRIJS} strokeWidth="0.8" fill="none" />
      <path d="M160 212.5 Q145 212 144 196" stroke={GRIJS} strokeWidth="0.8" fill="none" />
      {pijlV(144, 194, 158, "binnenop", 2)}

      {/* maat L */}
      <line x1="278.5" y1="155" x2="345" y2="155" stroke={LIJN} strokeWidth="0.8" />
      <text x="310" y="148" fontSize="11" fill={LIJN} textAnchor="middle">L</text>

      {/* d1 en D1 aan het eind van de stomp */}
      {maten && !leiding && (
        <g fill={LIJN} fontSize="11">
          <text x="366" y="216">d<tspan fontSize="7" dy="2">1</tspan></text>
          <line x1="382" y1="197.5" x2="382" y2="226" stroke={LIJN} strokeWidth="0.9" />
          <text x="394" y="216">D<tspan fontSize="7" dy="2">1</tspan></text>
          <line x1="413" y1="188" x2="413" y2="235" stroke={LIJN} strokeWidth="0.9" />
        </g>
      )}

      {/* nieuwe aansluitleiding (ronde 2): concentrisch, schuift op de stomp */}
      {leiding && (
        <g stroke={LIJN} strokeWidth="1.6" fill="none">
          <rect x="338" y="185" width="16" height="54" fill="white" />
          <path d="M354 189 H450 M354 235 H450" />
          <path d="M346 196.5 H450 M346 226 H450" strokeWidth="1.2" />
          <text x="446" y="174" fontSize="9" fontWeight="600" fill={C.brown} stroke="none" textAnchor="end">naar de ketel</text>
        </g>
      )}
      {leiding && klep && (
        <g>
          <circle cx="392" cy="199.5" r="2.6" fill={C.green} />
          <line x1="392" y1="199.5" x2="403" y2="222" stroke={C.green} strokeWidth="3" strokeLinecap="round" />
          <text x="398" y="252" fontSize="9" fontWeight="700" fill={C.green} textAnchor="middle">klep</text>
        </g>
      )}

      {/* rookgas uit de open stomp (ronde 1) */}
      {rookgasUit && (
        <g>
          <path d="M150 212.5 H356 Q362 212.5 362 205 V120" fill="none" stroke={C.red} strokeWidth="3" style={flowUit} />
          <path d="M356 127 L362 117 L368 127" fill="none" stroke={C.red} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <g style={{ animation: "pulseGlow 1.4s ease-in-out infinite" }}>
            <circle cx="350" cy="102" r="16" fill={C.red} opacity="0.14" />
            <circle cx="378" cy="96" r="11" fill={C.red} opacity="0.12" />
          </g>
        </g>
      )}

      {/* doppen (ronde 1): ieder apart */}
      {dop.rookgas && <rect x="345" y="197.5" width="9" height="27.5" rx="1.5" fill={C.green} stroke={C.oliveDark} strokeWidth="1" />}
      {dop.lucht && (
        <g fill={C.olive} stroke={C.oliveDark} strokeWidth="1">
          <rect x="345" y="186" width="13" height="10" rx="1.5" />
          <rect x="345" y="227" width="13" height="10" rx="1.5" />
        </g>
      )}

      {/* brandmanchet: rood blokje boven en onder de stomp, kamerkant van de wand */}
      {manchet && (
        <g>
          <rect x="256" y="181" width="22" height="8" fill="#C8102E" stroke={LIJN} strokeWidth="0.5" />
          <rect x="256" y="235" width="22" height="9" fill="#C8102E" stroke={LIJN} strokeWidth="0.5" />
          <path d="M281 258 L270 247" stroke={LIJN} strokeWidth="0.7" />
          <path d="M269 251 L270 247 L273.5 249" fill="none" stroke={LIJN} strokeWidth="0.7" />
          <text x="285" y="265" fontSize="10" fill={LIJN}>brandmanchet</text>
          <line x1="283" y1="268" x2="352" y2="268" stroke={LIJN} strokeWidth="0.6" />
        </g>
      )}
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
const VB_STOMP = { x: 10, y: 0, w: 440, h: 345 };

// ─── TYPEPLATEN (C10 bijlage B, figuur B1 en B2) ───

function PlaatTabel({ rijen, waarschuwing }) {
  return (
    <div className="rounded-md border overflow-hidden text-[11px] sm:text-xs" style={{ borderColor: "#5C6F8C" }}>
      <table className="w-full border-collapse" style={{ backgroundColor: "#C9D6EA", color: C.brownText }}>
        <tbody>
          {rijen.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: "1px solid #5C6F8C" }}>
              <td className="px-2 py-0.5" style={{ borderRight: "1px solid #5C6F8C" }}>{k}</td>
              <td className="px-2 py-0.5 font-semibold">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {waarschuwing && (
        <div className="px-2 py-1 text-[10px] sm:text-[11px]" style={{ backgroundColor: "#D4D4D4", color: C.brownText }}>
          {waarschuwing}
        </div>
      )}
    </div>
  );
}

function TypeplaatAansluiting() {
  return (
    <PlaatTabel
      rijen={[
        ["Fabrikant", "(naam CLV-fabrikant)"],
        ["Alleen geschikt voor", "C(10)3 toestellen"],
        ["Max. massastroom", "15 gram/sec"],
        ["Max. CW-klasse", "CW 4"],
        ["Temperatuurklasse", "T120"],
      ]}
      waarschuwing="Waarschuwing: haal je het toestel weg, sluit dan de opening voor rookgas en de opening voor lucht ieder apart af."
    />
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
      "Niet nodig als de nieuwe ketel dezelfde dag komt",
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
      "De natuurlijke trek duwt het rookgas naar beneden",
      "De luchttoevoer blaast het rookgas uit de binnenbuis",
      "De kap op het dak is dicht als een ketel uit staat",
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
      "Op de kap op het dak",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Bij elke C(10)-aansluiting hangt een typeplaat van de CLV-fabrikant met die waarschuwing.",
    feedbackWrong: "Die waarschuwing staat op de typeplaat bij de aansluiting. Die plaat hangt bij elke C(10)-aansluiting.",
    aandacht: "De typeplaat bij de aansluiting waarschuwt: openingen ieder apart afsluiten",
  },
  {
    question: "Wat kan rookgaslekkage in het gemeenschappelijke kanaal veroorzaken?",
    options: [
      "Recirculatie: rookgas komt in de luchttoevoer van de ketels",
      "Meer trek in het afvoerkanaal",
      "Een hogere druk in de waterleiding",
      "Een lagere temperatuurklasse van het kanaal",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Lekt rookgas in het kanaal, dan kan het in de luchttoevoer komen: recirculatie.",
    feedbackWrong: "Rookgaslekkage in het kanaal kan leiden tot recirculatie: het rookgas komt in de luchttoevoer van de ketels.",
    aandacht: "Rookgaslekkage in het kanaal kan leiden tot recirculatie",
  },
  {
    question: "Beide openingen zijn dicht. Wat controleer je nog?",
    options: [
      "Of er nog rookgas in de opstellingsruimte komt",
      "Niets: met twee doppen is het altijd goed",
      "Of de buren hun ketel uit willen zetten",
      "Of de kap op het dak nog draait",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Controleer of er rookgas in de opstellingsruimte komt, bijvoorbeeld met de CO-meter.",
    feedbackWrong: "Controleer altijd of er rookgas in de opstellingsruimte komt. Dat zie je met de CO-meter.",
    aandacht: "Na het afsluiten: controleer of er rookgas in de opstellingsruimte komt",
  },
  {
    question: "Welke opening van een C(10)-aansluitstomp is voor het rookgas?",
    options: ["De opening in het midden, 60 mm", "De ring eromheen, 100 mm", "De opening in het midden, 100 mm", "De ring eromheen, 60 mm"],
    correct: 0,
    feedbackCorrect: "Klopt. Rookgas zit in het midden (60 mm), lucht in de ring eromheen (100 mm).",
    feedbackWrong: "Een C(10)-stomp is concentrisch: in het midden 60 mm voor rookgas, eromheen 100 mm voor lucht.",
    aandacht: "C(10)-stomp: rookgas 60 mm in het midden, lucht 100 mm eromheen",
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
    question: "Je mist een bocht. Je collega heeft er een van een ander fabricaat. Mag die in de aansluitleiding?",
    options: [
      "Nee: de aansluitleiding is van hetzelfde fabricaat, type en materiaal",
      "Ja, als de maat 60/100 klopt",
      "Ja, als het hetzelfde materiaal is",
      "Ja, als je de verbinding extra afkit",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Materialen of fabrikanten mengen is een reden om een afvoer af te keuren.",
    feedbackWrong: "De aansluitleiding is van hetzelfde fabricaat, type en materiaal. Mengen is een reden om af te keuren.",
    aandacht: "Aansluitleiding: alles van hetzelfde fabricaat, type en materiaal",
  },
  {
    question: "Waarom houd je de aansluitleiding zo kort als het kan?",
    options: [
      "Hoe langer de leiding, hoe groter de kans dat verbindingen losraken",
      "Dan heb je geen terugslagklep nodig",
      "Dan hoeft er geen brandmanchet om",
      "Dan mag je verschillende fabricaten gebruiken",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Een lange leiding geeft meer kans dat verbindingen losraken.",
    feedbackWrong: "Houd de leiding kort: hoe langer hij is, hoe groter de kans dat verbindingen losraken.",
    aandacht: "Houd de aansluitleiding kort: anders meer kans op losse verbindingen",
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
      "In het voorschrift van de fabrikant van de brandmanchet",
      "Nergens: dat mag je zelf bepalen",
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
    question: "Hoe lang moet de schacht van een C(10)-CLV brandwerend zijn?",
    options: ["60 minuten", "30 minuten", "20 minuten", "15 minuten"],
    correct: 0,
    feedbackCorrect: "Klopt. Een CLV hoort altijd in een schacht die 60 minuten brandwerend is.",
    feedbackWrong: "Een CLV hoort altijd in een schacht die 60 minuten brandwerend is.",
    aandacht: "De schacht van een CLV is 60 minuten brandwerend",
  },
  {
    question: "Volgens welk voorschrift breng je de brandmanchet aan?",
    options: [
      "Het voorschrift van de fabrikant van de doorvoer",
      "De handleiding van de ketel",
      "De typeplaat bij de aansluiting",
      "Zoals het jou het handigst lijkt",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Brandwerende voorzieningen breng je aan volgens de fabrikant van de doorvoer.",
    feedbackWrong: "Brandwerende voorzieningen breng je aan volgens het voorschrift van de fabrikant van de doorvoer.",
    aandacht: "Brandmanchet: aanbrengen volgens de fabrikant van de doorvoer",
  },
  {
    question: "Hoe sluit je een ketel aan op een half-CLV?",
    options: [
      "Rookgas op de gemeenschappelijke afvoer, lucht apart op de eigen luchttoevoer",
      "Rookgas en lucht allebei op de schacht",
      "Lucht op de schacht, rookgas apart naar de gevel",
      "Alleen de rookgasleiding; lucht is niet nodig",
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
      "Niet aansluiten: op een overdruk-CLV mogen alleen C(10)-toestellen",
      "Aansluiten: een C43 is ook een gesloten toestel",
      "Aansluiten als de bewoner tekent",
      "Aansluiten en de typeplaat bij de aansluiting weghalen",
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
    options: ["Corrosieklasse W", "Drukklasse P1", "Temperatuurklasse T120", "Afstand tot brandbaar 0 mm"],
    correct: 0,
    feedbackCorrect: "Klopt. Corrosieklasse W betekent geschikt voor condens.",
    feedbackWrong: "Corrosieklasse W betekent geschikt voor condens. Sommige systemen zijn alleen geschikt voor droge toepassingen.",
    aandacht: "Corrosieklasse W = geschikt voor condens",
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
    question: "Wat geldt voor de sifons van de condensafvoer?",
    options: [
      "Ze moeten allebei bereikbaar zijn voor onderhoud en inspectie",
      "Ze mogen achter een betimmering als ze maar werken",
      "Alleen de bovenste sifon hoeft bereikbaar te zijn",
      "Ze moeten bij de oplevering droog staan",
    ],
    correct: 0,
    feedbackCorrect: "Klopt. Beide sifons moeten bereikbaar zijn voor onderhoud en inspectie.",
    feedbackWrong: "Beide sifons moeten bereikbaar zijn voor onderhoud en inspectie.",
    aandacht: "Beide sifons moeten bereikbaar zijn",
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
      className="rounded-xl border-2 px-3 py-1.5 flex items-center gap-2 shadow-md"
      style={{ backgroundColor: rookgas ? C.redLight : C.greenLight, borderColor: rookgas ? C.red : C.green }}
      aria-live="polite"
    >
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.brownText }}>
        CO-meter woning
      </span>
      <span className="text-xl font-bold tabular-nums" style={{ color: rookgas ? C.red : C.green }}>
        {Math.round(value)}
      </span>
      <span className="text-[11px] font-semibold" style={{ color: C.brown }}>
        ppm{rookgas ? ": rookgas in de woning" : ""}
      </span>
    </div>
  );
}

function DopKaart({ label, sub }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 px-3 py-2 min-h-[48px] min-w-[96px] bg-white shadow-sm select-none" style={{ borderColor: C.oliveDark }}>
      <span className="text-sm font-bold" style={{ color: C.brownText }}>{label}</span>
      {sub && <span className="text-[10px]" style={{ color: C.brown }}>{sub}</span>}
    </div>
  );
}

const R1_DOPPEN = [
  { id: "dop60", label: "Dop 60 mm" },
  { id: "dop100", label: "Dop 100 mm" },
  { id: "kap", label: "Kap", sub: "over de hele stomp" },
];

const R1_CONTROLE = [
  { id: "meten", label: "Met de CO-meter controleren of er nog rookgas in de woning komt", goed: true },
  { id: "niets", label: "Niets meer: met twee doppen is het altijd goed" },
  { id: "buren", label: "De buren vragen hun ketel uit te zetten" },
];

function Ronde1({ beoordeel, onDone, noteer, skipIntro }) {
  const qaStap = skipIntro ? leesQaStap() : 0;
  const [gestart, setGestart] = useState(skipIntro);
  const [ketelWeg, setKetelWeg] = useState(qaStap >= 2);
  const [leidingWeg, setLeidingWeg] = useState(qaStap >= 2);
  const [dicht, setDicht] = useState(() => (qaStap >= 3 ? { rookgas: true, lucht: true } : { rookgas: false, lucht: false }));
  const [gecontroleerd, setGecontroleerd] = useState(false);
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [co, setCo] = useState(qaStap === 2 ? 180 : 0);
  const [doppen] = useState(() => schud(R1_DOPPEN));
  const [controleOpties] = useState(() => schud(R1_CONTROLE));
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

  const fase = !leidingWeg ? "weg" : !(dicht.rookgas && dicht.lucht) ? "doppen" : !gecontroleerd ? "controle" : "klaar";
  const klaar = (leidingWeg ? 1 : 0) + (dicht.rookgas ? 1 : 0) + (dicht.lucht ? 1 : 0) + (gecontroleerd ? 1 : 0);

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
  };

  const dropAfvoer = (payload, point) => {
    if (payload === "ketel" && !ketelWeg) {
      setKetelWeg(true);
      setMelding({ soort: "goed", tekst: "De ketel is los. Nu staat de aansluitleiding open naar het kanaal. Dat kanaal staat onder overdruk. Snel verder!" });
      playSound("drop");
      return "correct";
    }
    if (payload === "leiding" && ketelWeg && !leidingWeg) {
      setLeidingWeg(true);
      goed("Goed. Bij een toestelvervanging komt er ook een nieuwe aansluitleiding. Let op: de stomp staat nu open.", point);
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
      return undefined;
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
      goed("Dop 60 mm in het midden: de rookgasopening is dicht. Er komt geen rookgas meer de woning in.", point);
      return "correct";
    }
    if (opening === "lucht" && payload === "dop100") {
      setDicht((p) => ({ ...p, lucht: true }));
      goed("Dop 100 mm op de ring: de luchtopening is apart dicht, zoals de typeplaat vraagt.", point);
      return "correct";
    }
    if (opening === "lucht") {
      mis(
        "De ring is de luchtopening van 100 mm. De dop van 60 mm hoort in het midden: daar zit het rookgas.",
        "C(10)-stomp: rookgas 60 mm in het midden, lucht 100 mm eromheen",
        point
      );
      return "wrong";
    }
    mis(
      "In het midden zit de rookgasopening van 60 mm. De dop van 100 mm hoort op de ring eromheen: daar zit de lucht.",
      "C(10)-stomp: rookgas 60 mm in het midden, lucht 100 mm eromheen",
      point
    );
    return "wrong";
  };

  const kiesControle = (o) => {
    if (gecontroleerd) return;
    if (o.goed) {
      setGecontroleerd(true);
      goed("Goed. Controleer altijd of er rookgas in de opstellingsruimte komt. De meter zakt naar 0. Let op: lekt rookgas in het kanaal zelf, dan kan het in de luchttoevoer komen (recirculatie).");
      return;
    }
    setFout(o.id);
    mis(
      o.id === "niets"
        ? "Controleer altijd of er rookgas in de opstellingsruimte komt. Dat zie je met de CO-meter."
        : "De buren hoeven niets. Controleer zelf met de CO-meter of er nog rookgas in de opstellingsruimte komt.",
      "Na het afsluiten: controleer of er rookgas in de opstellingsruimte komt",
      undefined,
      false
    );
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 1: Oude ketel eruit"
        intro="Je vervangt een ketel in een flat met een overdruk-CLV. De CO-meter laat zien of er rookgas de woning in komt."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Overdruk-CLV">
          de ventilatoren van alle ketels duwen het rookgas door het kanaal. Het afvoerkanaal staat dus onder overdruk.
        </UitlegItem>
        <UitlegItem term="Ketel eruit">de oude aansluitleiding gaat er ook uit. De nieuwe ketel krijgt een nieuwe.</UitlegItem>
        <UitlegItem term="Open stomp">
          sluit de opening voor rookgas en de opening voor lucht ieder apart af. Zo staat het op de typeplaat bij de aansluiting:
        </UitlegItem>
        <div className="mt-2">
          <TypeplaatAansluiting />
        </div>
      </RondeIntro>
    );
  }

  const vb = UITSNEDE_BOVEN;
  const opdrachtTekst = {
    weg: !ketelWeg ? "sleep de oude ketel naar Afvoeren." : "wat doe je met de oude aansluitleiding? Sleep hem naar de goede bak.",
    doppen: "sluit de open stomp af. Sleep de goede dop naar elk vraagteken.",
    controle: "beide openingen zijn dicht. Kies wat je nu nog doet.",
    klaar: "klaar. Ga door naar de controlevragen.",
  }[fase];
  const stapNr = { weg: 1, doppen: 2, controle: 3, klaar: 3 }[fase];

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <StepBanner step={1} />
      <Opdracht titel="Ronde 1: Oude ketel eruit" stap={stapNr} stappen={3} tekst={opdrachtTekst} klaar={klaar} totaal={4} />
      <div className="mb-2">
        <COMeter value={co} />
      </div>

      {fase === "weg" && (
        <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-center md:items-start">
          <div className="relative w-full" style={{ maxWidth: 360 }}>
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
            <p className="text-[11px] text-center italic mt-1" style={{ color: C.brown }}>
              {ketelWeg ? "Pak de oude aansluitleiding (gestippeld vak)." : "Pak de oude ketel (gestippeld vak)."}
            </p>
          </div>
          <div className="flex flex-row md:flex-col gap-3 w-full md:w-56">
            {[
              { id: "afvoer", titel: "Afvoeren", drop: dropAfvoer },
              { id: "bewaren", titel: "Bewaren voor de nieuwe ketel", drop: dropBewaren },
            ].map((bak) => (
              <DropTarget key={bak.id} id={`r1-${bak.id}`} onDropItem={bak.drop} className="flex-1">
                {({ isHover, flash }) => (
                  <div
                    className="rounded-2xl border-2 border-dashed min-h-[72px] flex items-center justify-center text-center px-2 text-sm font-bold transition-colors"
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
        </div>
      )}

      {fase !== "weg" && (
        <div className="w-full flex flex-col items-center">
          <p className="text-[11px] italic mb-1" style={{ color: C.brown }}>
            Ingezoomd: de aansluitstomp in de schachtwand, van opzij gezien.
          </p>
          <div className="relative w-full" style={{ maxWidth: 480 }}>
            <StompDetail open rookgasUit={!dicht.rookgas} dop={dicht}>
              {fase === "doppen" && (
                <g stroke={C.olive} strokeWidth="1.3" strokeDasharray="4 3" fill="none">
                  {!dicht.lucht && <path d="M350 190 L392 72" />}
                  {!dicht.rookgas && <path d="M350 212 L392 296" />}
                  {!dicht.lucht && <circle cx="350" cy="190" r="3" fill={C.olive} />}
                  {!dicht.rookgas && <circle cx="350" cy="212" r="3" fill={C.olive} />}
                </g>
              )}
            </StompDetail>
            {fase === "doppen" &&
              [
                { opening: "lucht", x: 362, y: 36 },
                { opening: "rookgas", x: 362, y: 290 },
              ].map((v) =>
                dicht[v.opening] ? null : (
                  <DropTarget key={v.opening} id={`r1-${v.opening}`} onDropItem={dropOpening(v.opening)} className="absolute" style={vakStijl(VB_STOMP, v.x, v.y, 70, 44)}>
                    {({ isHover, flash }) => (
                      <div
                        className="w-full h-full min-h-[36px] rounded-lg border-2 border-dashed flex items-center justify-center text-lg font-bold"
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
          {fase === "doppen" && (
            <div className="flex gap-3 mt-3 flex-wrap justify-center">
              {doppen.map((d) => (
                <Draggable key={d.id} payload={d.id} ghost={<DopKaart label={d.label} sub={d.sub} />}>
                  <DopKaart label={d.label} sub={d.sub} />
                </Draggable>
              ))}
            </div>
          )}
        </div>
      )}

      <Melding melding={melding} />

      {fase === "controle" && <Keuzes vraag="Wat doe je nu nog?" opties={controleOpties} onKies={kiesControle} fout={fout} />}

      {fase === "klaar" && (
        <div className="mt-2">
          <GameButton onClick={onDone} variant="green">Naar de controlevragen</GameButton>
        </div>
      )}
    </div>
  );
}

// ─── RONDE 2: NIEUWE KETEL AANSLUITEN ───

const R2_SETS = [
  { id: "goed", titel: "Concentrisch 60/100", sub: "alle delen van hetzelfde fabricaat", goed: true },
  {
    id: "mix",
    titel: "Concentrisch 60/100",
    sub: "bocht van een ander fabricaat",
    uitleg: "Niet mengen: de aansluitleiding is van hetzelfde fabricaat, type en materiaal. Mengen is een reden om af te keuren.",
    aandacht: "Aansluitleiding: alles van hetzelfde fabricaat, type en materiaal",
  },
  {
    id: "parallel",
    titel: "Twee losse buizen 80 mm",
    sub: "parallel, hetzelfde fabricaat",
    uitleg: "Bij C(10) zijn stomp en aansluitleiding concentrisch. 80 mm is de gewone stompmaat bij een onderdruk-CLV.",
    aandacht: "C(10): concentrische aansluitleiding, 60 mm rookgas en 100 mm lucht",
  },
  {
    id: "maat",
    titel: "Concentrisch 80/125",
    sub: "alle delen van hetzelfde fabricaat",
    uitleg: "Past niet: een C(10)-stomp is 60 mm voor rookgas en 100 mm voor lucht.",
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
  { id: "goed", label: "In de handleiding van de nieuwe ketel kijken hoe de klep erin moet", goed: true },
  {
    id: "oud",
    label: "De klep van de oude ketel overzetten, die werkte nog goed",
    uitleg: "De klep hoort bij het toestel: de nieuwe ketel heeft een klep die samen met dat toestel is gekeurd.",
  },
  {
    id: "merk",
    label: "Een klep van een ander merk uit de bus nemen, die is ook 60 mm",
    uitleg: "Een klep is geen los onderdeel. Je plaatst alleen een klep die bij deze ketel hoort en die de fabrikant van de ketel geschikt vindt.",
  },
];

const R2_VOORSCHRIFT = [
  { id: "goed", label: "Volgens het voorschrift van de fabrikant van de doorvoer", goed: true },
  {
    id: "ketel",
    label: "Volgens de handleiding van de ketel",
    uitleg: "In de handleiding van de ketel staat hoe je de ketel aansluit en de klep inbouwt. De manchet breng je aan volgens de fabrikant van de doorvoer.",
  },
  {
    id: "plaat",
    label: "Volgens de typeplaat bij de aansluiting",
    uitleg: "Op die plaat staat welk toestel erop mag, niet hoe de manchet erop moet. Volg de fabrikant van de doorvoer.",
  },
];

// plekken voor de klep (tikken) en de manchet (slepen) op de stomptekening
const KLEP_PLEKKEN = [
  { id: "rookgas", label: "Rookgasdeel aansluitleiding", doel: [392, 211], vak: [318, 54, 130, 48], goed: true },
  {
    id: "lucht",
    label: "Luchtdeel aansluitleiding",
    doel: [400, 231],
    vak: [318, 284, 130, 48],
    uitleg: "In het luchtdeel stroomt verbrandingslucht. De klep hoort in het rookgasdeel van de aansluitleiding.",
  },
  {
    id: "kanaal",
    label: "Kanaal in de schacht",
    doel: [120, 150],
    vak: [40, 54, 130, 48],
    uitleg: "Het kanaal is van het CLV en wordt gedeeld met de buren. De klep hoort in jouw aansluitleiding, bij de ketel.",
  },
];

const MANCHET_PLEKKEN = [
  { id: "kamer", label: "Tegen de wand, kant van de woning", doel: [267, 184], vak: [262, 66, 120, 44], goed: true },
  {
    id: "schacht",
    label: "Tegen de wand, kant van de schacht",
    doel: [214, 184],
    vak: [96, 66, 120, 44],
    uitleg: "In het voorbeeld uit de C(10)-voorschriften zit de manchet om de leiding, tegen de schachtwand aan de kant van de woning.",
  },
  {
    id: "ketel",
    label: "Bij de ketel",
    doel: [436, 238],
    vak: [318, 286, 120, 44],
    uitleg: "De manchet hoort waar de leiding door de schachtwand gaat, niet bij de ketel.",
  },
];

function SetKaart({ set }) {
  return (
    <div className="rounded-xl border-2 bg-white px-3 py-2 min-h-[52px] w-[150px] sm:w-[160px] select-none shadow-sm" style={{ borderColor: C.oliveDark }}>
      <div className="text-sm font-bold leading-tight" style={{ color: C.brownText }}>{set.titel}</div>
      <div className="text-[11px] leading-tight mt-0.5" style={{ color: C.brown }}>{set.sub}</div>
    </div>
  );
}

const R2_FASEN = ["route", "leiding", "montage", "klepEerst", "klepPlek", "manchet", "voorschrift", "klaar"];

function Ronde2({ beoordeel, onDone, noteer, skipIntro }) {
  const qaStap = skipIntro ? leesQaStap() : 0;
  const [gestart, setGestart] = useState(skipIntro);
  const [fase, setFase] = useState(() => R2_FASEN[Math.min(Math.max(qaStap - 1, 0), R2_FASEN.length - 1)]);
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [routeFout, setRouteFout] = useState(null);
  const [sets] = useState(() => schud(R2_SETS));
  const [montage] = useState(() => schud(R2_MONTAGE));
  const [klepEerst] = useState(() => schud(R2_KLEP_EERST));
  const [voorschrift] = useState(() => schud(R2_VOORSCHRIFT));

  const index = R2_FASEN.indexOf(fase);
  const naar = (f) => {
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
  };

  const kiesRoute = (r) => {
    if (fase !== "route") return;
    if (r === "A") {
      setRouteFout(null);
      goed("Goed: hoe korter de leiding, hoe kleiner de kans dat verbindingen losraken. De maximale lengte staat in de handleiding van de ketel.", "leiding");
      return;
    }
    setRouteFout("B");
    mis("Route B is veel langer. Hoe langer de leiding, hoe groter de kans dat verbindingen losraken. Houd hem zo kort als het kan.", "Houd de aansluitleiding kort: anders meer kans op losse verbindingen");
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

  const kiesUit = (volgende, goedTekst, aandacht) => (o) => {
    if (o.goed) {
      goed(goedTekst, volgende);
      return;
    }
    setFout(o.id);
    mis(o.uitleg, aandacht);
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
      goed("Goed: om de leiding, tegen de schachtwand aan de kant van de woning, zoals in het voorbeeld uit de C(10)-voorschriften.", "voorschrift", point);
      return "correct";
    }
    mis(plek.uitleg, "Brandmanchet: om de leiding, tegen de schachtwand aan de kant van de woning", point, true);
    return "wrong";
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 2: Nieuwe ketel aansluiten"
        intro="De nieuwe ketel hangt. Sluit hem aan op de C(10)-stomp."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Aansluitleiding">
          concentrisch 60/100 (rookgas in het midden, lucht eromheen), alles van hetzelfde fabricaat, type en materiaal.
        </UitlegItem>
        <UitlegItem term="Terugslagklep">hoort bij de nieuwe ketel en komt in de aansluitleiding.</UitlegItem>
        <UitlegItem term="Brandmanchet">
          zit om de leiding, tegen de schachtwand aan de kant van de woning. De schacht is 60 minuten brandwerend; de doorvoer moet die brandeis ook halen (wbdbo: weerstand tegen branddoorslag en brandoverslag).
        </UitlegItem>
      </RondeIntro>
    );
  }

  const opdrachten = {
    route: { stap: 1, tekst: "kies de route voor de aansluitleiding. Tik op A of B." },
    leiding: { stap: 2, tekst: "sleep de juiste aansluitleiding naar de gestippelde route." },
    montage: { stap: 2, tekst: "hoe monteer je de leiding? Kies." },
    klepEerst: { stap: 3, tekst: "de terugslagklep zit los bij de ketel. Wat doe je eerst?" },
    klepPlek: { stap: 3, tekst: "tik op de plek waar de terugslagklep komt." },
    manchet: { stap: 4, tekst: "sleep de brandmanchet naar de goede plek." },
    voorschrift: { stap: 4, tekst: "volgens welk voorschrift breng je de manchet aan?" },
    klaar: { stap: 4, tekst: "klaar. Ga door naar de controlevragen." },
  };
  const o = opdrachten[fase];
  const vb = UITSNEDE_BOVEN;
  const schachtFase = ["route", "leiding", "montage"].includes(fase);

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <StepBanner step={1} />
      <Opdracht titel="Ronde 2: Nieuwe ketel aansluiten" stap={o.stap} stappen={4} tekst={o.tekst} klaar={Math.min(index, 7)} totaal={7} />

      {schachtFase && (
        <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-center md:items-start">
          <div className="relative w-full" style={{ maxWidth: 360 }}>
            <SchachtC10
              uitsnede={vb}
              boven={{ ketel: fase === "route" || fase === "leiding" ? "uit" : "aan", leiding: fase === "route" ? "geen" : fase === "leiding" ? "gat" : "aan", label: "nieuwe ketel" }}
              routes={fase === "route"}
              routeKeuze={routeFout}
            />
            {fase === "route" &&
              [
                { id: "A", x: 236, y: 338 },
                { id: "B", x: 266, y: 292 },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => kiesRoute(r.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 font-bold text-base shadow-md"
                  style={{
                    left: `${((r.x - vb.x) / vb.w) * 100}%`,
                    top: `${((r.y - vb.y) / vb.h) * 100}%`,
                    backgroundColor: routeFout === r.id ? C.redLight : "white",
                    borderColor: routeFout === r.id ? C.red : C.oliveDark,
                    color: C.brownText,
                  }}
                  aria-label={`Route ${r.id}`}
                >
                  {r.id}
                </button>
              ))}
            {fase === "leiding" && (
              <DropTarget id="r2-route" onDropItem={dropSet} className="absolute" style={vakStijl(vb, 192, 318, 108, 82)}>
                {({ isHover, flash }) => (
                  <div
                    className="w-full h-full rounded-lg border-2 border-dashed flex items-end justify-center text-[10px] font-bold pb-1"
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
          <div className="w-full md:flex-1 flex flex-col items-center">
            {fase === "leiding" && (
              <div className="grid grid-cols-2 gap-2">
                {sets.map((s) => (
                  <Draggable key={s.id} payload={s.id} ghost={<SetKaart set={s} />}>
                    <SetKaart set={s} />
                  </Draggable>
                ))}
              </div>
            )}
            {fase === "montage" && (
              <Keuzes
                opties={montage}
                fout={fout}
                onKies={kiesUit("klepEerst", "Goed: spanningsvrij, voldoende insteekdiepte en volgens de handleiding van de ketel. Bij kunststof houd je rekening met uitzetten.", "Aansluitleiding spanningsvrij en voldoende diep insteken")}
              />
            )}
            {fase === "route" && (
              <p className="text-xs italic text-center max-w-xs" style={{ color: C.brown }}>
                Beide routes komen bij dezelfde stomp uit. Welke kies jij?
              </p>
            )}
          </div>
        </div>
      )}

      {!schachtFase && (
        <div className="w-full flex flex-col items-center">
          <p className="text-[11px] italic mb-1" style={{ color: C.brown }}>
            Ingezoomd: de stomp in de schachtwand met de nieuwe aansluitleiding eraan.
          </p>
          <div className="relative w-full" style={{ maxWidth: 480 }}>
            <StompDetail open={false} leiding klep={index >= 5} manchet={index >= 6}>
              {fase === "klepPlek" &&
                KLEP_PLEKKEN.map((p) => (
                  <g key={p.id} stroke={C.olive} strokeWidth="1.3" fill="none" strokeDasharray="4 3">
                    <path d={`M${p.doel[0]} ${p.doel[1]} L${p.vak[0] + p.vak[2] / 2} ${p.vak[1] + (p.vak[1] < 150 ? p.vak[3] : 0)}`} />
                    <circle cx={p.doel[0]} cy={p.doel[1]} r="3" fill={C.olive} />
                  </g>
                ))}
              {fase === "manchet" &&
                MANCHET_PLEKKEN.map((p) => (
                  <g key={p.id} stroke={C.olive} strokeWidth="1.3" fill="none" strokeDasharray="4 3">
                    <path d={`M${p.doel[0]} ${p.doel[1]} L${p.vak[0] + p.vak[2] / 2} ${p.vak[1] + (p.vak[1] < 150 ? p.vak[3] : 0)}`} />
                    <circle cx={p.doel[0]} cy={p.doel[1]} r="3" fill={C.olive} />
                  </g>
                ))}
            </StompDetail>
            {fase === "klepPlek" &&
              KLEP_PLEKKEN.map((p) => (
                <button
                  key={p.id}
                  onClick={() => kiesKlepPlek(p)}
                  className="absolute rounded-lg border-2 text-[10px] sm:text-xs font-bold leading-tight px-1 flex items-center justify-center text-center shadow-sm"
                  style={{
                    ...vakStijl(VB_STOMP, ...p.vak),
                    minHeight: 36,
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
                <DropTarget key={p.id} id={`r2-m-${p.id}`} onDropItem={dropManchet(p)} className="absolute" style={vakStijl(VB_STOMP, ...p.vak)}>
                  {({ isHover, flash }) => (
                    <div
                      className="w-full h-full min-h-[36px] rounded-lg border-2 border-dashed text-[10px] sm:text-xs font-bold leading-tight px-1 flex items-center justify-center text-center"
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
          {fase === "manchet" && (
            <div className="mt-3">
              <Draggable payload="manchet" ghost={<DragCard label="Brandmanchet" small />}>
                <DragCard label="Brandmanchet" small />
              </Draggable>
            </div>
          )}
        </div>
      )}

      <Melding melding={melding} />

      {fase === "klepEerst" && (
        <Keuzes
          opties={klepEerst}
          fout={fout}
          onKies={kiesUit("klepPlek", "Goed: de klep zit los bij de ketel, dus de inbouwinstructie staat in de handleiding van de ketel.", "Gebruik alleen de terugslagklep die bij de nieuwe ketel hoort")}
        />
      )}
      {fase === "voorschrift" && (
        <Keuzes
          opties={voorschrift}
          fout={fout}
          onKies={kiesUit("klaar", "Goed. Controleer daarna of schachtwand, stomp en manchet samen de brandeis (wbdbo) halen. De schacht is 60 minuten brandwerend.", "Brandmanchet: aanbrengen volgens de fabrikant van de doorvoer")}
        />
      )}
      {fase === "klaar" && (
        <div className="flex flex-col items-center gap-2 mt-1 max-w-xl">
          <p className="text-sm text-center" style={{ color: C.brownText }}>
            <span className="font-bold">Let op bij een half-CLV:</span> daar is alleen de afvoer gemeenschappelijk. Je sluit het rookgas aan op de schacht en de lucht apart op de eigen luchttoevoer.
          </p>
          <GameButton onClick={onDone} variant="green">Naar de controlevragen</GameButton>
        </div>
      )}
    </div>
  );
}

// ─── RONDE 3: CONTROLEREN EN OPLEVEREN ───

// Zeven controlepunten bij het werk van een collega (onderste ketel). Per
// speelbeurt zitten er willekeurig 0 tot 3 gebreken in; per punt beslist de
// speler goedkeuren of afkeuren. Posities in de figuurcoordinaten.
const PUNTEN = [
  {
    id: "ketel",
    naam: "Ketel en typeplaat bij de aansluiting",
    x: 304,
    y: 712,
    ok: { ketel: "C(10)3" },
    gebreken: [{ ketel: "C43" }],
    goedOk: "Klopt: op deze aansluiting mogen alleen C(10)-toestellen. Dit is een C(10)3-ketel.",
    goedGebrek: "Goed gezien: een C43 hoort bij een onderdruk-CLV. Op een C(10)-aansluiting mogen alleen C(10)-toestellen.",
    foutOk: "Dit klopt wel: de plaat vraagt een C(10)-toestel en de ketel is een C(10)3.",
    foutGebrek: "Kijk naar het type: C43 hoort bij een onderdruk-CLV. Hier mogen alleen C(10)-toestellen op.",
    aandacht: "Vergelijk de typeplaat bij de aansluiting met het typeplaatje van de ketel: alleen C(10) op C(10)",
  },
  {
    id: "klep",
    naam: "Aansluitleiding",
    x: 282,
    y: 657,
    ok: { tekst: "In het rookgasdeel van de aansluitleiding zit de terugslagklep die bij deze ketel hoort." },
    gebreken: [
      { tekst: "Er zit geen terugslagklep in de aansluitleiding.", geenKlep: true },
      { tekst: "Er zit een terugslagklep in het luchtdeel. In het rookgasdeel zit geen klep.", geenKlep: true },
    ],
    goedOk: "Klopt: op een overdruk-CLV moet de ketel een terugslagklep hebben, in het rookgasdeel van de aansluitleiding.",
    goedGebrek: "Goed gezien: zonder klep in het rookgasdeel kan rookgas uit het kanaal terugstromen. Op een overdruk-CLV is de klep verplicht.",
    foutOk: "Dit klopt wel: de klep die bij de ketel hoort, zit in het rookgasdeel van de aansluitleiding.",
    foutGebrek: "Afkeuren: op een overdruk-CLV moet de ketel een terugslagklep hebben, in het rookgasdeel van de aansluitleiding.",
    aandacht: "Controleer of de terugslagklep in het rookgasdeel van de aansluitleiding zit",
  },
  {
    id: "doorvoer",
    naam: "Doorvoer door de schachtwand",
    x: 214,
    y: 624,
    ok: { tekst: "Brandmanchet om de leiding, tegen de schachtwand aan de kant van de woning. Aangebracht volgens de fabrikant van de doorvoer." },
    gebreken: [{ tekst: "Open kier rond de leiding in de schachtwand. Er zit geen brandmanchet." }],
    goedOk: "Klopt: zo haalt de doorvoer de brandeis (wbdbo) van de schacht.",
    goedGebrek: "Goed gezien: met een open kier haalt de doorvoer de brandeis (wbdbo) niet. De schacht is 60 minuten brandwerend.",
    foutOk: "Dit klopt wel: de manchet zit om de leiding tegen de schachtwand, aangebracht volgens de fabrikant van de doorvoer.",
    foutGebrek: "Afkeuren: met een open kier haalt de doorvoer de brandeis (wbdbo) van de schacht niet.",
    aandacht: "Controleer of de doorvoer door de schachtwand de brandeis (wbdbo) haalt",
  },
  {
    id: "lek",
    naam: "Lekmeting luchttoevoer (deze verdieping)",
    x: 143,
    y: 610,
    ok: { tekst: "Gemeten lek: 3 m³/h bij 50 Pa." },
    gebreken: [{ tekst: "Gemeten lek: 8 m³/h bij 50 Pa." }],
    goedOk: "Klopt: minder dan 5 m³/h per verdieping bij 50 Pa. De luchttoevoer is dicht genoeg.",
    goedGebrek: "Goed gezien: meer dan 5 m³/h is te veel. De luchttoevoer moet dan vervangen of gevoerd worden.",
    foutOk: "Dit klopt wel: de grens is minder dan 5 m³/h per verdieping bij 50 Pa.",
    foutGebrek: "Afkeuren: de luchttoevoer mag per verdieping minder dan 5 m³/h lekken bij 50 Pa.",
    aandacht: "Luchttoevoer C(10): lek kleiner dan 5 m³/h per verdieping bij 50 Pa",
  },
  {
    id: "luik",
    naam: "Inspectieluiken onderaan",
    x: 203,
    y: 760,
    ok: { tekst: "Bouwkundig luik 50 x 50 cm, vrij bereikbaar. De luikjes op lucht- en rookgaskanaal gaan open zonder speciale hulpmiddelen." },
    gebreken: [
      { tekst: "Bouwkundig luik 40 x 40 cm. De luikjes op de kanalen gaan open zonder speciale hulpmiddelen." },
      { tekst: "Er staat een vaste kast voor het bouwkundige luik van 50 x 50 cm." },
    ],
    goedOk: "Klopt: het luik is minstens 50 x 50 cm en bereikbaar. De luikjes op de kanalen gaan open zonder speciale hulpmiddelen.",
    goedGebrek: "Goed gezien: het bouwkundige luik moet minstens 50 x 50 cm zijn en bereikbaar blijven.",
    foutOk: "Dit klopt wel: 50 x 50 cm en bereikbaar. De luikjes op de kanalen gaan open zonder speciale hulpmiddelen.",
    foutGebrek: "Afkeuren: het bouwkundige luik moet minstens 50 x 50 cm zijn en bereikbaar blijven.",
    aandacht: "Bouwkundig inspectieluik: minstens 50 x 50 cm en bereikbaar",
  },
  {
    id: "sifon",
    naam: "Condensafvoer en sifons",
    x: 168,
    y: 772,
    ok: { tekst: "Beide sifons zijn bereikbaar." },
    gebreken: [{ tekst: "De tweede sifon zit achter een dichtgeschroefde betimmering." }],
    goedOk: "Klopt: beide sifons moeten bereikbaar zijn voor onderhoud en inspectie.",
    goedGebrek: "Goed gezien: ook de tweede sifon moet bereikbaar zijn voor onderhoud en inspectie.",
    foutOk: "Dit klopt wel: beide sifons zijn bereikbaar.",
    foutGebrek: "Afkeuren: beide sifons moeten bereikbaar zijn voor onderhoud en inspectie.",
    aandacht: "Beide sifons moeten bereikbaar zijn",
  },
  {
    id: "plaat",
    naam: "Typeplaat onderaan het CLV",
    x: 252,
    y: 815,
    ok: { temp: "120" },
    gebreken: [{ temp: "80" }],
    goedOk: "Klopt: T120 is het minimum voor C(10). Corrosieklasse W betekent geschikt voor condens.",
    goedGebrek: "Goed gezien: een C(10)-systeem moet minstens temperatuurklasse T120 hebben.",
    foutOk: "Dit klopt wel: temperatuurklasse 120 is genoeg voor C(10). W betekent geschikt voor condens.",
    foutGebrek: "Afkeuren: een C(10)-systeem moet minstens temperatuurklasse T120 hebben. Hier staat 80.",
    aandacht: "C(10)-afvoersysteem: minimaal temperatuurklasse T120 en corrosieklasse W",
  },
];

// Per speelbeurt: welke punten een gebrek hebben (0 tot 3) en welk gebrek
function maakSituatie() {
  const r = Math.random();
  const aantal = r < 0.1 ? 0 : r < 0.4 ? 1 : r < 0.8 ? 2 : 3;
  const metGebrek = schud(PUNTEN.map((p) => p.id)).slice(0, aantal);
  const situatie = {};
  for (const p of PUNTEN) {
    if (metGebrek.includes(p.id)) {
      situatie[p.id] = { gebrek: true, data: p.gebreken[Math.floor(Math.random() * p.gebreken.length)] };
    } else situatie[p.id] = { gebrek: false, data: p.ok };
  }
  return situatie;
}

function Observatie({ punt, data }) {
  if (punt.id === "ketel") {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.brown }}>Typeplaat bij de aansluiting</div>
          <TypeplaatAansluiting />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: C.brown }}>Typeplaatje van de ketel</div>
          <div className="rounded-md border px-2 py-1 text-xs font-semibold inline-block" style={{ borderColor: C.brownText, backgroundColor: "#EDEDED", color: C.brownText }}>
            Gesloten cv-toestel · Type: {data.ketel}
          </div>
        </div>
      </div>
    );
  }
  if (punt.id === "plaat") {
    return (
      <PlaatTabel
        rijen={[
          ["Temperatuurklasse in °C", data.temp],
          ["Drukklasse", "P1"],
          ["Corrosieklasse", "W"],
          ["Afstand tot brandbare materialen in mm", "0"],
        ]}
      />
    );
  }
  return <p className="text-sm" style={{ color: C.brownText }}>{data.tekst}</p>;
}

const R3_BESLUIT = [
  { id: "aan", label: "Ketel in bedrijf stellen" },
  { id: "niet", label: "Niet in bedrijf: eerst de gebreken laten herstellen" },
  { id: "later", label: "Ketel in bedrijf stellen en de gebreken later doorgeven" },
];

function Ronde3({ beoordeel, onDone, noteer, skipIntro }) {
  const qaStap = skipIntro ? leesQaStap() : 0;
  const [gestart, setGestart] = useState(skipIntro);
  const [situatie] = useState(maakSituatie);
  const [oordelen, setOordelen] = useState(() => (qaStap >= 2 ? Object.fromEntries(PUNTEN.map((p) => [p.id, true])) : {})); // id -> true
  const [actief, setActief] = useState(qaStap === 1 ? "ketel" : null);
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [besloten, setBesloten] = useState(false);
  const paneel = useRef(null);

  const aantalGebreken = PUNTEN.filter((p) => situatie[p.id].gebrek).length;
  const alleGedaan = PUNTEN.every((p) => oordelen[p.id]);
  const klaar = Object.keys(oordelen).length + (besloten ? 1 : 0);
  const punt = actief ? PUNTEN.find((p) => p.id === actief) : null;

  const open = (id) => {
    if (oordelen[id]) return;
    setActief(id);
    setFout(null);
    setMelding(null);
    paneel.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
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
      return;
    }
    setFout(afkeuren ? "af" : "goed");
    noteer(punt.aandacht);
    beoordeel("fout");
    setMelding({ soort: "fout", tekst: `${gebrek ? punt.foutGebrek : punt.foutOk} Kies opnieuw.` });
  };

  const kiesBesluit = (o) => {
    if (besloten) return;
    const juist = aantalGebreken > 0 ? "niet" : "aan";
    if (o.id === juist) {
      beoordeel("goed");
      playSound("levelup");
      setBesloten(true);
      setFout(null);
      setMelding({
        soort: "goed",
        tekst:
          aantalGebreken > 0
            ? "Goed: met een gebrek is de installatie niet deugdelijk en veilig. De ketel gaat pas aan als alles is hersteld."
            : "Goed: alle punten kloppen. De installatie is deugdelijk en veilig, dus de ketel mag in bedrijf.",
      });
      return;
    }
    setFout(o.id);
    noteer("Gebrek gevonden? Ketel pas in bedrijf na herstel");
    beoordeel("fout");
    setMelding({
      soort: "fout",
      tekst:
        aantalGebreken > 0
          ? "Er zijn gebreken. Je stelt de ketel pas in bedrijf als alles klopt."
          : "Alle punten kloppen. Er is geen reden om de ketel uit te laten.",
    });
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 3: Controleren en opleveren"
        intro="Een collega heeft in de woning eronder een ketel aangesloten. Controleer zeven punten voordat die ketel aangaat."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Typeplaten">
          de plaat bij de aansluiting zegt welke toestellen erop mogen. Op de plaat onderaan het CLV staan de kenmerken: bij C(10) minstens T120. W betekent geschikt voor condens.
        </UitlegItem>
        <UitlegItem term="Luchttoevoer">moet luchtdicht zijn. Bij C(10) minder dan 5 m³/h lek per verdieping, gemeten bij 50 Pa.</UitlegItem>
        <UitlegItem term="In bedrijf">pas als alle punten kloppen.</UitlegItem>
      </RondeIntro>
    );
  }

  const vb = UITSNEDE_ONDER;
  const klepWeg = situatie.klep.gebrek && oordelen.klep;
  const tekst = !alleGedaan
    ? "tik op elk rood punt en keur het goed of af."
    : !besloten
      ? "alle punten zijn gecontroleerd. Mag de ketel in bedrijf?"
      : "klaar. Ga door naar de controlevragen.";

  return (
    <div className="flex-1 flex flex-col items-center p-3 sm:p-6">
      <StepBanner step={1} />
      <Opdracht titel="Ronde 3: Controleren en opleveren" stap={alleGedaan ? 2 : 1} stappen={2} tekst={tekst} klaar={klaar} totaal={8} />

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-center md:items-start">
        <div className="relative w-full shrink-0" style={{ maxWidth: 340 }}>
          <SchachtC10
            uitsnede={vb}
            boven={{ ketel: "aan", leiding: "aan" }}
            onder={{ ketel: besloten && aantalGebreken === 0 ? "aan" : "uit", label: "ketel collega" }}
            klepOnder={!klepWeg}
            plaatOnder
          />
          {PUNTEN.map((p) => {
            const gedaan = oordelen[p.id];
            const gebrek = situatie[p.id].gebrek;
            const isActief = actief === p.id;
            return (
              <button
                key={p.id}
                onClick={() => open(p.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9"
                style={{ left: `${((p.x - vb.x) / vb.w) * 100}%`, top: `${((p.y - vb.y) / vb.h) * 100}%` }}
                aria-label={p.naam}
              >
                {!gedaan && <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: isActief ? C.olive : C.red, opacity: 0.3 }} />}
                <span
                  className="absolute inset-1 rounded-full border-2 flex items-center justify-center text-[13px] font-bold text-white"
                  style={{ backgroundColor: gedaan ? (gebrek ? C.amber : C.green) : isActief ? C.olive : C.red, borderColor: "white" }}
                >
                  {gedaan ? (gebrek ? "!" : "✓") : "?"}
                </span>
              </button>
            );
          })}
        </div>

        <div ref={paneel} className="w-full md:flex-1 flex flex-col items-center md:items-stretch">
          <div className="rounded-2xl border-2 p-3 w-full max-w-xl" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
              <span className="font-bold italic text-sm" style={{ color: C.brownText }}>
                Gecontroleerd: {Object.keys(oordelen).length} van {PUNTEN.length}
              </span>
            </div>
            {punt ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: C.olive }}>{punt.naam}</p>
                <Observatie punt={punt} data={situatie[punt.id].data} />
                <div className="grid grid-cols-2 gap-2 mt-3">
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
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: C.brown }}>
                {alleGedaan ? "Alle punten zijn gecontroleerd." : "Tik op een rood punt in de tekening."}
              </p>
            )}
          </div>
          {alleGedaan && (
            <div className="mt-2 w-full max-w-xl text-xs" style={{ color: C.brown }}>
              Gebreken gevonden: <span className="font-bold" style={{ color: aantalGebreken ? C.amber : C.green }}>{aantalGebreken}</span>
            </div>
          )}
        </div>
      </div>

      <Melding melding={melding} />

      {alleGedaan && !besloten && <Keuzes vraag="Wat doe je met de ketel?" opties={R3_BESLUIT} onKies={kiesBesluit} fout={fout} />}

      {besloten && (
        <div className="mt-2">
          <GameButton onClick={onDone} variant="green">Naar de controlevragen</GameButton>
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
  "Ketel eruit: de aansluitleiding gaat ook weg, de nieuwe ketel krijgt een nieuwe",
  "Rookgasopening en luchtopening sluit je ieder apart af; dat staat op de typeplaat bij de aansluiting",
  "C(10)-stomp: concentrisch, 60 mm rookgas in het midden en 100 mm lucht eromheen",
  "Aansluitleiding: hetzelfde fabricaat, type en materiaal; kort, spanningsvrij en voldoende diep ingestoken",
  "De terugslagklep hoort bij de ketel en zit in het rookgasdeel van de aansluitleiding; inbouwen volgens de ketelhandleiding",
  "Brandmanchet om de leiding tegen de schachtwand, volgens de fabrikant van de doorvoer; de schacht is 60 minuten brandwerend",
  "Pas in bedrijf als alles klopt: typeplaten, T120 en W, lek luchttoevoer, luiken, sifons, doorvoer en klep",
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
    if (sessie.stand.fase === "kennisvraag") setScreen(mcScreen);
  };

  // tussen de twee vragen: de kern gaat door naar de tweede vraag van de missie
  const tussenVraag = () => sessie.volgendeKennisvraag();
  const vraagKlaar = (next) => () => {
    sessie.volgendeKennisvraag();
    if (next !== "end") setScreen(next);
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
