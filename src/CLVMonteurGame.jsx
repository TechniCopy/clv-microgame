import { useState, useCallback, useEffect, useRef } from "react";
import { Wrench, CheckCircle, ClipboardCheck, Power } from "lucide-react";
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
    question: "[EXAMENVRAAG] Waarop moet je extra letten bij het demonteren van een toestel dat is aangesloten op een CLV-systeem?",
    options: [
      "Dat de aansluitstompen (rookgas én lucht) direct worden afgesloten.",
      "Dat ramen en deuren open staan voor verse lucht.",
      "Dat de bewoner niet aanwezig is tijdens het werk.",
      "Dat de schachtwand wordt aangeheeld.",
    ],
    correct: 0,
    feedbackCorrect: "Precies! Beide stompen direct afsluiten, anders kan rookgas van de buren de woning instromen.",
    feedbackWrong: "Denk aan de animatie: de open stomp liet rookgas binnen. Altijd beide stompen direct afsluiten bij demontage.",
  },
  {
    question: "[EXAMENVRAAG] Een HR-toestel wordt aangesloten op een CLV-kanaal op overdruk. Wat moet er in het toestel aanwezig zijn om rookgas-recirculatie te voorkomen?",
    options: ["Een rookgaskeerklep (terugslagklep)", "Een TTB (thermische terugslagbeveiliging)", "Een rookgasdop", "Een rookgassensor"],
    correct: 0,
    feedbackCorrect: "Correct! Bij overdruk-CLV is een terugslagklep verplicht, gekeurd samen met het toestel.",
    feedbackWrong: "Bij overdruk-CLV is de rookgaskeerklep (terugslagklep) verplicht. Een TTB is iets anders: die meet temperatuur bij open toestellen.",
  },
  {
    question: "Waarom is rookgas-recirculatie levensgevaarlijk?",
    options: [
      "Het verlaagt het zuurstofgehalte van de verbrandingslucht, waardoor koolmonoxide kan ontstaan.",
      "Het verhoogt de temperatuur in de schacht te veel.",
      "Het veroorzaakt corrosie aan de binnenzijde van het kanaal.",
      "Het zorgt voor te veel trek in het systeem.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! Minder zuurstof in de verbrandingslucht = onvolledige verbranding = koolmonoxide (CO).",
    feedbackWrong: "De kern: rookgas in de verbrandingslucht verdringt zuurstof. Met te weinig zuurstof ontstaat het giftige CO.",
  },
];

const POOL_R2 = [
  {
    question: "[EXAMENVRAAG] Je sluit een nieuw toestel aan op een bestaand inpandig RVS CLV-systeem. Met welk materiaal mag de verbindingsleiding worden gemaakt?",
    options: ["RVS", "Kunststof", "Dikwandig aluminium", "Dunwandig aluminium"],
    correct: 0,
    feedbackCorrect: "Correct! Bij een RVS-systeem alleen RVS gebruiken — anders ontstaat galvanische corrosie en verschil in uitzetting.",
    feedbackWrong: "Op een bestaand RVS-systeem mag je geen ander materiaal combineren. Alleen RVS.",
  },
  {
    question: "Welk afschot moet een horizontale verbindingsleiding minimaal hebben, en in welke richting?",
    options: [
      "Minimaal 50 mm per meter, afwaterend richting het toestel.",
      "Minimaal 30 mm per meter, afwaterend richting het toestel.",
      "Minimaal 50 mm per meter, afwaterend richting het CLV-kanaal.",
      "Een horizontale leiding hoeft geen afschot te hebben.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt! 50 mm (5 cm) per meter, richting het toestel — zo loopt condenswater terug naar de ketelsifon.",
    feedbackWrong: "Het afschot is minimaal 50 mm per meter en altijd richting het toestel, zodat condens via de ketelsifon wordt afgevoerd.",
  },
  {
    question: "Mag je voor de aansluitleiding onderdelen van twee verschillende merken combineren?",
    options: [
      "Nee, gebruik altijd materiaal van één fabrikant.",
      "Ja, als beide merken een QA-keur hebben.",
      "Ja, dat is geen probleem.",
      "Alleen bij metalen leidingen mag dat.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! Eén merk/fabrikant voor de hele aansluitleiding — afdichtingen en maatvoering zijn op elkaar afgestemd.",
    feedbackWrong: "Verschillende merken combineren mag niet: afdichtingsringen en maatvoering verschillen net, met lekkage als risico.",
  },
];

const POOL_R3 = [
  {
    question: "[EXAMENVRAAG] Wat is de minimale afmeting van het inspectieluik bij een CLV-systeem?",
    options: ["50 x 50 cm", "30 x 30 cm", "60 x 60 cm", "100 x 100 cm"],
    correct: 0,
    feedbackCorrect: "Klopt! Minimaal 50 x 50 cm, brandwerend, en maximaal 50 cm van het CLV-systeem.",
    feedbackWrong: "Het inspectieluik moet minimaal 50 x 50 cm zijn, zodat het systeem goed bereikbaar en inspecteerbaar blijft.",
  },
  {
    question: "Wat is de verwachte levensduur van een CLV-systeem?",
    options: ["Circa 15 jaar", "Circa 5 jaar", "Circa 30 jaar", "Onbeperkt, mits jaarlijks geïnspecteerd"],
    correct: 0,
    feedbackCorrect: "Juist! Na circa 15 jaar neemt de kans op rookgaslekkage toe door veroudering van materialen en afdichtingen.",
    feedbackWrong: "De verwachte levensduur is circa 15 jaar. Daarna verouderen metalen (corrosie), kunststof (bros) en afdichtingsringen (uitharden).",
  },
  {
    question: "Een cv-ketel in een flat is 16 jaar oud en wordt vervangen. Wat moet je naast de ketelvervanging doen met het CLV-systeem?",
    options: [
      "Controleren of het nog geschikt is; bij twijfel vervangen of een beheerplan opstellen.",
      "Niets — het CLV-systeem staat los van de ketelvervanging.",
      "Altijd direct een nieuw CLV-systeem installeren.",
      "Het systeem 2 jaar doorgebruiken zonder extra maatregelen.",
    ],
    correct: 0,
    feedbackCorrect: "Correct! Na circa 15 jaar moet je het CLV beoordelen. Tijdelijk doorgebruik kan, maar alleen met CO-melders, vervangingsplan en periodieke metingen.",
    feedbackWrong: "De levensduur is circa 15 jaar. Bij vervanging van een toestel in gestapelde bouw altijd controleren of het CLV-systeem nog geschikt is.",
  },
];

// ─── RONDE 1: RECIRCULATIE VOORKOMEN ───

function RecircSVG({ closed }) {
  const bothClosed = closed.rookgas && closed.lucht;
  const flow = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const flowSlow = { strokeDasharray: "8 6", animation: "flowDash 1.2s linear infinite" };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };

  return (
    <svg viewBox="0 0 520 430" className="w-full h-auto select-none">
      <defs>
        <pattern id="hatchM1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
        <pattern id="dotsM1" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill={C.brownText} />
        </pattern>
      </defs>

      {/* maaiveld */}
      <rect x="20" y="400" width="480" height="14" fill="url(#hatchM1)" stroke={C.brownText} strokeWidth="2" />
      {/* gevel links */}
      <rect x="60" y="84" width="14" height="316" fill="url(#hatchM1)" stroke={C.brownText} strokeWidth="2" />
      {/* dak (loopt tot de schacht) */}
      <rect x="60" y="70" width="330" height="14" fill="url(#hatchM1)" stroke={C.brownText} strokeWidth="2" />
      {/* verdiepingsvloer tussen de woningen */}
      <rect x="74" y="228" width="316" height="11" fill="url(#hatchM1)" stroke={C.brownText} strokeWidth="1.5" />

      {/* schachtwanden rechts */}
      <rect x="390" y="64" width="8" height="336" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="438" y="64" width="8" height="336" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* binnenste rookgaskanaal */}
      <line x1="410" y1="30" x2="410" y2="395" stroke={C.brownText} strokeWidth="2" />
      <line x1="426" y1="30" x2="426" y2="395" stroke={C.brownText} strokeWidth="2" />

      {/* dakdoorvoer (NEN, compact): flens, lichaam, rooster, kap */}
      <rect x="394" y="58" width="48" height="6" fill="white" stroke={C.brownText} strokeWidth="2" />
      <polygon points="400,58 436,58 433,42 403,42" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="398" y="28" width="40" height="14" fill="url(#dotsM1)" stroke={C.brownText} strokeWidth="2" />
      <rect x="394" y="22" width="48" height="6" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="412" y="10" width="12" height="12" fill="white" stroke={C.brownText} strokeWidth="2" />
      <path d="M418 8 V2 M414 5 L418 0 L422 5" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* rookgas omhoog in het binnenkanaal */}
      <path d="M418 390 L418 32" fill="none" stroke={C.red} strokeWidth="4" strokeLinecap="round" style={flow} />
      {/* lucht omlaag in de ringspleet */}
      <path d="M403 46 L403 390" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
      <path d="M433 46 L433 390" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />

      {/* ONDERSTE WONING: werkend toestel */}
      <rect x="120" y="290" width="70" height="60" fill="white" stroke={C.brownText} strokeWidth="2.5" />
      <circle cx="155" cy="313" r="11" fill="none" stroke={C.red} strokeWidth="2" />
      <path d="M150 316 q5 -12 10 0 q-5 7 -10 0" fill={C.red} opacity="0.8" />
      <text x="155" y="342" fontSize="9" fontWeight="700" fill={C.brownText} textAnchor="middle">KETEL AAN</text>
      {/* concentrische aansluiting naar de schacht */}
      <path d="M190 305 L410 305" fill="none" stroke={C.red} strokeWidth="4" style={flow} />
      <path d="M403 322 L190 322" fill="none" stroke="#3B82F6" strokeWidth="3" style={flowSlow} />

      {/* BOVENSTE WONING: gedemonteerd toestel */}
      <rect x="115" y="120" width="80" height="66" fill="none" stroke={C.beigeMid} strokeWidth="2" strokeDasharray="6 5" />
      <text x="155" y="150" fontSize="8.5" fontWeight="600" fill={C.brown} textAnchor="middle">toestel</text>
      <text x="155" y="162" fontSize="8.5" fontWeight="600" fill={C.brown} textAnchor="middle">gedemonteerd</text>

      {/* open aansluitstompen door de schachtwand (met flens, zoals in de norm) */}
      {[
        { id: "rookgas", y: 128 },
        { id: "lucht", y: 168 },
      ].map(({ id, y }) => {
        const dicht = closed[id];
        return (
          <g key={id}>
            <rect x="364" y={y + 2} width="28" height="18" fill="white" stroke={dicht ? C.green : C.brownText} strokeWidth="2" />
            <ellipse cx="364" cy={y + 11} rx="4.5" ry="11" fill={dicht ? C.greenLight : "#3B1E0A"} stroke={dicht ? C.green : C.brownText} strokeWidth="2" />
            {dicht && <circle cx="364" cy={y + 11} r="5" fill={C.green} stroke="white" strokeWidth="1.5" />}
            <text x="356" y={y + 14} fontSize="8" fontWeight="600" fill={C.brown} textAnchor="end">{id}</text>
          </g>
        );
      })}

      {/* recirculatie: rookgas stroomt de woning in zolang een stomp open is */}
      {!closed.rookgas && (
        <>
          <path d="M410 139 L364 139 L300 139 Q250 139 235 160 Q225 175 240 190" fill="none" stroke={C.red} strokeWidth="4" style={flow} opacity="0.9" />
          <path d="M232 184 L240 196 L248 186" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {!closed.lucht && (
        <>
          <path d="M410 179 L364 179 L305 179 Q275 179 268 200" fill="none" stroke={C.red} strokeWidth="3.5" style={flowSlow} opacity="0.8" />
          <path d="M261 195 L268 207 L276 197" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {/* gevaarwolkjes in de bovenwoning */}
      {!bothClosed && (
        <g style={{ animation: "pulseGlow 1.4s ease-in-out infinite" }}>
          <circle cx="250" cy="210" r="14" fill={C.red} opacity="0.15" />
          <circle cx="285" cy="200" r="10" fill={C.red} opacity="0.15" />
          <circle cx="225" cy="200" r="9" fill={C.red} opacity="0.15" />
        </g>
      )}
    </svg>
  );
}

function COMeter({ value }) {
  const danger = value >= 150;
  const warn = value >= 30 && !danger;
  return (
    <div
      className="rounded-xl border-2 px-4 py-2 flex items-center gap-3 shadow-md"
      style={{
        backgroundColor: danger ? C.redLight : warn ? "#FFF0D6" : C.greenLight,
        borderColor: danger ? C.red : warn ? "#B8860B" : C.green,
      }}
    >
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.brownText }}>
        CO-meter
      </span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: danger ? C.red : warn ? "#B8860B" : C.green }}>
        {Math.round(value)}
      </span>
      <span className="text-xs font-semibold" style={{ color: C.brown }}>
        ppm{danger ? " — GEVAAR!" : warn ? " — stijgt..." : ""}
      </span>
    </div>
  );
}

function Ronde1({ addScore, onDone }) {
  const [closed, setClosed] = useState({ rookgas: false, lucht: false });
  const [kappenOver, setKappenOver] = useState(2);
  const [hint, setHint] = useState(null);
  const [co, setCo] = useState(0);
  const closedRef = useRef(closed);
  useEffect(() => {
    closedRef.current = closed;
  }, [closed]);

  const bothClosed = closed.rookgas && closed.lucht;

  // CO-meter loopt op zolang er een stomp open staat, en daalt daarna naar 0
  useEffect(() => {
    const timer = setInterval(() => {
      setCo((prev) => {
        const open = !(closedRef.current.rookgas && closedRef.current.lucht);
        const target = open ? 600 : 0;
        const next = prev + (target - prev) * (open ? 0.012 : 0.08);
        return Math.abs(next - target) < 1 ? target : next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const dropKap = (stomp) => (payload, point) => {
    if (closed[stomp]) return undefined;
    setClosed((prev) => ({ ...prev, [stomp]: true }));
    setKappenOver((prev) => prev - 1);
    addScore(5, point);
    setHint(null);
    playSound("drop");
    return "correct";
  };

  const dropFout = (foutHint) => (payload, point) => {
    addScore(-5, point);
    setHint(foutHint);
    return "wrong";
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 1: Recirculatie voorkomen
      </h2>
      <p className="text-sm mb-3 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        In de bovenwoning is een toestel gedemonteerd — de aansluitstompen staan nog open! Sleep de afsluitkappen op de open
        stompen voordat het rookgas van de buren binnenstroomt.
      </p>

      <div className="mb-3">
        <COMeter value={co} />
      </div>

      <div className="relative w-full" style={{ maxWidth: 520 }}>
        <RecircSVG closed={closed} />
        {/* dropzones over de stompen (viewBox 520x430) */}
        <DropTarget
          id="stomp-rookgas"
          onDropItem={closed.rookgas ? undefined : dropKap("rookgas")}
          className="absolute"
          style={{ left: `${(352 / 520) * 100}%`, top: `${(120 / 430) * 100}%`, width: `${(48 / 520) * 100}%`, height: `${(38 / 430) * 100}%` }}
        >
          {({ isHover }) => (
            <div
              className="w-full h-full rounded-lg border-2 transition-colors"
              style={{
                borderStyle: closed.rookgas ? "solid" : "dashed",
                borderColor: closed.rookgas ? C.green : isHover ? C.olive : "transparent",
                backgroundColor: isHover && !closed.rookgas ? "rgba(92,107,46,0.25)" : "transparent",
              }}
            />
          )}
        </DropTarget>
        <DropTarget
          id="stomp-lucht"
          onDropItem={closed.lucht ? undefined : dropKap("lucht")}
          className="absolute"
          style={{ left: `${(352 / 520) * 100}%`, top: `${(160 / 430) * 100}%`, width: `${(48 / 520) * 100}%`, height: `${(38 / 430) * 100}%` }}
        >
          {({ isHover }) => (
            <div
              className="w-full h-full rounded-lg border-2 transition-colors"
              style={{
                borderStyle: closed.lucht ? "solid" : "dashed",
                borderColor: closed.lucht ? C.green : isHover ? C.olive : "transparent",
                backgroundColor: isHover && !closed.lucht ? "rgba(92,107,46,0.25)" : "transparent",
              }}
            />
          )}
        </DropTarget>
        {/* afleider: het werkende toestel beneden */}
        <DropTarget
          id="fout-ketel"
          onDropItem={dropFout("De kap hoort niet op het werkende toestel — sluit de open aansluitstompen in de bovenwoning af.")}
          className="absolute"
          style={{ left: `${(115 / 520) * 100}%`, top: `${(285 / 430) * 100}%`, width: `${(80 / 520) * 100}%`, height: `${(70 / 430) * 100}%` }}
        >
          {({ flash }) => (
            <div
              className="w-full h-full rounded-lg transition-colors"
              style={{ backgroundColor: flash === "wrong" ? "rgba(192,57,43,0.25)" : "transparent" }}
            />
          )}
        </DropTarget>
      </div>

      {hint && (
        <p className="text-xs text-center italic mb-2 mt-1 font-medium max-w-md" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      {!bothClosed ? (
        <div className="flex gap-3 mt-2 items-center">
          {Array.from({ length: kappenOver }).map((_, i) => (
            <Draggable key={i} payload={`kap${i}`} ghost={<KapVisual />}>
              <KapVisual />
            </Draggable>
          ))}
          <span className="text-xs italic font-medium" style={{ color: C.brown }}>
            ← sleep de afsluitkappen naar de open stompen
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 mt-2">
          <p className="text-sm font-bold italic" style={{ color: C.green }}>
            Beide stompen dicht — de recirculatie is gestopt en de CO-waarde daalt!
          </p>
          <GameButton onClick={onDone} variant="green">
            Naar de controlevraag
          </GameButton>
        </div>
      )}
    </div>
  );
}

function KapVisual() {
  return (
    <div className="flex flex-col items-center select-none">
      <svg width="52" height="40" viewBox="0 0 52 40">
        <rect x="8" y="12" width="36" height="20" rx="5" fill={C.olive} stroke={C.oliveDark} strokeWidth="2.5" />
        <rect x="4" y="16" width="8" height="12" rx="2" fill={C.oliveDark} />
        <text x="28" y="26" fontSize="8" fontWeight="700" fill="white" textAnchor="middle">KAP</text>
      </svg>
      <span className="text-[9px] font-bold" style={{ color: C.brownText }}>Afsluitkap</span>
    </div>
  );
}

// ─── RONDE 2: HET TOESTEL AANSLUITEN ───

const MATERIALEN = [
  { id: "rvs", label: "RVS", kleur: "#B7BfC4", correct: true },
  { id: "kunststof", label: "Kunststof", kleur: "#E8E3D8", correct: false },
  { id: "aluminium", label: "Aluminium", kleur: "#8E9AA3", correct: false },
];

function LeidingKaart({ mat }) {
  return (
    <div className="flex flex-col items-center select-none">
      <svg width="90" height="30" viewBox="0 0 90 30">
        <rect x="4" y="9" width="82" height="12" rx="6" fill={mat.kleur} stroke={C.brownText} strokeWidth="2" />
        {mat.id === "rvs" && <line x1="10" y1="13" x2="80" y2="13" stroke="white" strokeWidth="2" opacity="0.7" />}
        {mat.id === "kunststof" && <line x1="10" y1="15" x2="80" y2="15" stroke="#C96" strokeWidth="2" opacity="0.6" />}
      </svg>
      <span className="text-[10px] font-bold" style={{ color: C.brownText }}>{mat.label}</span>
    </div>
  );
}

function AansluitSVG({ stap, afschot, beugels }) {
  // toestel links, schachtstomp rechts; horizontale leiding ~3 m
  const leidingY = 120;
  const tilt = -afschot * 0.9; // visuele kanteling in graden (positief afschot = laag bij het toestel)
  const flowUp = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };

  return (
    <svg viewBox="0 0 520 260" className="w-full h-auto select-none">
      <defs>
        <pattern id="hatchM2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* vloer */}
      <rect x="20" y="234" width="480" height="12" fill="url(#hatchM2)" stroke={C.brownText} strokeWidth="2" />

      {/* schachtwanden rechts (doorsnede) */}
      <rect x="430" y="14" width="8" height="220" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="482" y="14" width="8" height="220" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* binnenste rookgaskanaal */}
      <line x1="452" y1="14" x2="452" y2="234" stroke={C.brownText} strokeWidth="2" />
      <line x1="468" y1="14" x2="468" y2="234" stroke={C.brownText} strokeWidth="2" />
      {/* stromen in het kanaal */}
      <path d="M460 230 L460 18" fill="none" stroke={C.red} strokeWidth="3.5" strokeLinecap="round" style={flowUp} />
      <path d="M444 18 L444 230" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" style={flowDown} />
      <path d="M476 18 L476 230" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" style={flowDown} />
      <text x="460" y="10" fontSize="9" fontWeight="700" fill={C.brown} textAnchor="middle">
        RVS CLV-KANAAL
      </text>
      {/* aansluitstomp met flens door de schachtwand */}
      <rect x="412" y={leidingY - 12} width="22" height="24" fill="white" stroke={C.brownText} strokeWidth="2" />
      <ellipse cx="412" cy={leidingY} rx="5" ry="14" fill="white" stroke={C.brownText} strokeWidth="2" />

      {/* toestel links */}
      <rect x="40" y={leidingY - 20} width="80" height="110" fill="white" stroke={C.brownText} strokeWidth="2.5" />
      <circle cx="80" cy={leidingY + 38} r="13" fill="none" stroke={C.red} strokeWidth="2" />
      <path d={`M74 ${leidingY + 42} q6 -14 12 0 q-6 8 -12 0`} fill={C.red} opacity="0.7" />
      <text x="80" y={leidingY + 76} fontSize="9" fontWeight="700" fill={C.brownText} textAnchor="middle">HR-KETEL</text>
      {/* toestel-uitgang */}
      <rect x="112" y={leidingY - 12} width="16" height="24" fill="white" stroke={C.brownText} strokeWidth="2.5" />

      {/* leiding (na stap A) */}
      {stap > 0 && (
        <g transform={`rotate(${tilt} 268 ${leidingY})`}>
          <rect x="128" y={leidingY - 9} width="280" height="18" rx="9" fill="#B7BFC4" stroke={C.brownText} strokeWidth="2.5" />
          <line x1="140" y1={leidingY - 3} x2="396" y2={leidingY - 3} stroke="white" strokeWidth="2.5" opacity="0.7" />
          {/* beugels op de leiding */}
          {beugels.map((pos) => (
            <g key={pos}>
              <rect x={128 + pos * 93.3 - 5} y={leidingY - 16} width="10" height="8" rx="2" fill={C.olive} stroke={C.oliveDark} strokeWidth="1.5" />
              <line x1={128 + pos * 93.3} y1={leidingY - 16} x2={128 + pos * 93.3} y2={leidingY - 26} stroke={C.oliveDark} strokeWidth="3" />
            </g>
          ))}
        </g>
      )}
      {stap === 0 && (
        <rect x="128" y={leidingY - 9} width="280" height="18" rx="9" fill="none" stroke={C.beigeMid} strokeWidth="2.5" strokeDasharray="8 6" />
      )}

      {/* meetlat (stap C) */}
      {stap >= 2 && (
        <g>
          <line x1="128" y1="190" x2="408" y2="190" stroke={C.brownText} strokeWidth="1.5" />
          {[0, 1, 2, 3].map((m) => (
            <g key={m}>
              <line x1={128 + m * 93.3} y1="185" x2={128 + m * 93.3} y2="195" stroke={C.brownText} strokeWidth="1.5" />
              <text x={128 + m * 93.3} y="208" fontSize="9" fontWeight="600" fill={C.brownText} textAnchor="middle">
                {m} m
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function Ronde2({ addScore, onDone }) {
  const [stap, setStap] = useState(0); // 0=materiaal, 1=afschot, 2=beugels, 3=klaar
  const [hint, setHint] = useState(null);
  const [afschot, setAfschot] = useState(0);
  const [afschotVast, setAfschotVast] = useState(false);
  const [beugels, setBeugels] = useState([]); // posities in meters (1, 2)

  // STAP A: materiaal
  const dropMateriaal = (payload, point) => {
    if (stap !== 0) return undefined;
    const mat = MATERIALEN.find((m) => m.id === payload);
    if (!mat) return undefined;
    if (mat.correct) {
      addScore(5, point);
      setHint(null);
      setStap(1);
      playSound("drop");
      return "correct";
    }
    addScore(-5, point);
    setHint(
      `${mat.label} mag hier niet: de schacht is RVS. Twee verschillende metalen of materialen geven galvanische corrosie en verschil in uitzetting.`
    );
    return "wrong";
  };

  // STAP B: afschot vastzetten bij loslaten van de schuif
  const handleAfschotRelease = () => {
    if (afschotVast || stap !== 1) return;
    if (afschot === 5) {
      addScore(5);
      setAfschotVast(true);
      setHint(null);
      setTimeout(() => setStap(2), 600);
    } else {
      addScore(-5);
      setHint(
        afschot < 0
          ? "Verkeerde richting! Het afschot moet áflopen richting het toestel, zodat condens naar de ketelsifon stroomt."
          : `Niet vastgeklikt op ${afschot} cm/m — het afschot moet precies 5 cm per meter richting het toestel zijn.`
      );
      setAfschot(0);
    }
  };

  // STAP C: beugels
  const dropBeugel = (positie, correct) => (payload, point) => {
    if (stap !== 2 || beugels.includes(positie)) return undefined;
    if (correct) {
      setBeugels((prev) => {
        const next = [...prev, positie];
        if (next.length === 2) setTimeout(() => setStap(3), 500);
        return next;
      });
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    addScore(-5, point);
    setHint("Daar hoort geen beugel: horizontaal beugel je elke meter — dus op 1 m en 2 m vanaf het toestel.");
    return "wrong";
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 2: Het toestel aansluiten
      </h2>
      <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        {stap === 0 && "Stap A: kies de juiste leiding. Let op: de schacht is van RVS!"}
        {stap === 1 && "Stap B: zet het afschot van de leiding goed met de schuif en laat los om vast te klikken."}
        {stap === 2 && "Stap C: sleep de beugels naar de juiste posities. Horizontaal: elke meter. Gebruik de meetlat!"}
        {stap === 3 && "De verbindingsleiding zit er netjes in!"}
      </p>

      <div className="relative w-full" style={{ maxWidth: 520 }}>
        <AansluitSVG stap={stap} afschot={afschotVast || stap > 1 ? 5 : afschot} beugels={beugels} />

        {/* dropzone leiding-gat (stap A) */}
        {stap === 0 && (
          <DropTarget
            id="leiding-gat"
            onDropItem={dropMateriaal}
            className="absolute"
            style={{ left: `${(128 / 520) * 100}%`, top: `${(95 / 260) * 100}%`, width: `${(280 / 520) * 100}%`, height: `${(34 / 260) * 100}%` }}
          >
            {({ isHover, flash }) => (
              <div
                className="w-full h-full rounded-full border-2 transition-colors flex items-center justify-center text-[10px] font-bold"
                style={{
                  borderStyle: "dashed",
                  borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brown,
                  backgroundColor: flash === "wrong" ? "rgba(192,57,43,0.2)" : isHover ? "rgba(92,107,46,0.15)" : "transparent",
                  color: C.brown,
                }}
              >
                sleep de juiste leiding hierheen
              </div>
            )}
          </DropTarget>
        )}

        {/* dropzones beugels (stap C): correct op 1 m en 2 m, afleider op 0,5 m */}
        {stap === 2 &&
          [
            { pos: 0.5, correct: false },
            { pos: 1, correct: true },
            { pos: 2, correct: true },
            { pos: 2.5, correct: false },
          ].map(({ pos, correct }) => (
            <DropTarget
              key={pos}
              id={`beugel-${pos}`}
              onDropItem={dropBeugel(pos, correct)}
              className="absolute"
              style={{
                left: `${((128 + pos * 93.3 - 20) / 520) * 100}%`,
                top: `${(78 / 260) * 100}%`,
                width: `${(40 / 520) * 100}%`,
                height: `${(34 / 260) * 100}%`,
              }}
            >
              {({ isHover, flash }) => (
                <div
                  className="w-full h-full rounded-lg border-2 transition-colors"
                  style={{
                    borderStyle: "dashed",
                    borderColor: beugels.includes(pos)
                      ? "transparent"
                      : flash === "wrong"
                      ? C.red
                      : isHover
                      ? C.olive
                      : C.beigeMid,
                    backgroundColor: flash === "wrong" ? "rgba(192,57,43,0.2)" : isHover ? "rgba(92,107,46,0.15)" : "transparent",
                  }}
                />
              )}
            </DropTarget>
          ))}
      </div>

      {hint && (
        <p className="text-xs text-center italic mb-2 mt-1 font-medium max-w-md" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      {/* STAP A: materiaalkeuze */}
      {stap === 0 && (
        <div className="flex gap-4 mt-3">
          {MATERIALEN.map((mat) => (
            <Draggable key={mat.id} payload={mat.id} ghost={<LeidingKaart mat={mat} />}>
              <LeidingKaart mat={mat} />
            </Draggable>
          ))}
        </div>
      )}

      {/* STAP B: afschot-schuif */}
      {stap === 1 && (
        <div className="flex flex-col items-center gap-1 mt-3 w-full max-w-sm">
          <div className="flex justify-between w-full text-[10px] font-semibold" style={{ color: C.brown }}>
            <span>← richting kanaal</span>
            <span>richting toestel →</span>
          </div>
          <input
            type="range"
            min="-10"
            max="10"
            step="1"
            value={afschot}
            onChange={(e) => setAfschot(Number(e.target.value))}
            onPointerUp={handleAfschotRelease}
            onKeyUp={(e) => {
              if (e.key === "Enter") handleAfschotRelease();
            }}
            className="w-full"
            style={{ accentColor: C.olive }}
          />
          <div
            className="text-sm font-bold italic"
            style={{ color: afschot === 5 ? C.green : C.brownText }}
          >
            {afschot === 0
              ? "0 cm/m — waterpas"
              : `${Math.abs(afschot)} cm/m richting ${afschot > 0 ? "toestel" : "kanaal"}`}
            {afschot === 5 ? " ✓" : ""}
          </div>
          <p className="text-[10px] italic" style={{ color: C.brown }}>
            Laat de schuif los op de juiste stand om de leiding vast te klikken.
          </p>
        </div>
      )}

      {/* STAP C: beugels */}
      {stap === 2 && (
        <div className="flex gap-4 mt-3 items-center">
          {Array.from({ length: 2 - beugels.length }).map((_, i) => (
            <Draggable key={i} payload={`beugel${i}`} ghost={<BeugelVisual />}>
              <BeugelVisual />
            </Draggable>
          ))}
          <span className="text-xs italic font-medium" style={{ color: C.brown }}>
            ← sleep de beugels naar de leiding
          </span>
        </div>
      )}

      {stap === 3 && (
        <div className="flex flex-col items-center gap-2 mt-3">
          <p className="text-sm font-bold italic" style={{ color: C.green }}>
            RVS-leiding, 5 cm/m afschot richting toestel en correct gebeugeld!
          </p>
          <GameButton onClick={onDone} variant="green">
            Naar de controlevraag
          </GameButton>
        </div>
      )}
    </div>
  );
}

function BeugelVisual() {
  return (
    <div className="flex flex-col items-center select-none">
      <svg width="40" height="36" viewBox="0 0 40 36">
        <path d="M8 24 a12 12 0 0 1 24 0" fill="none" stroke={C.olive} strokeWidth="5" />
        <line x1="20" y1="12" x2="20" y2="2" stroke={C.oliveDark} strokeWidth="4" />
        <line x1="6" y1="26" x2="34" y2="26" stroke={C.oliveDark} strokeWidth="3" />
      </svg>
      <span className="text-[9px] font-bold" style={{ color: C.brownText }}>Beugel</span>
    </div>
  );
}

// ─── RONDE 3: CONTROLEREN EN IN BEDRIJF STELLEN ───

const CONTROLEPUNTEN = [
  { id: "typeplaat", label: "Klopt het toesteltype met dit CLV-systeem? (typeplaat)", verplicht: true },
  { id: "klep", label: "Is de terugslagklep aanwezig en gemonteerd (bij overdruk-CLV)?", verplicht: true },
  { id: "luik", label: "Is het inspectieluik (min. 50x50 cm) aanwezig en bereikbaar?", verplicht: true },
  { id: "sifon", label: "Functioneert de condensaatafvoer? Zijn beide sifons gevuld?", verplicht: true },
  { id: "plaat", label: "Is de schoorsteenplaat aanwezig met de juiste gegevens?", verplicht: true },
  { id: "melder", label: "Is er een CO-melder geplaatst in de opstellingsruimte?", verplicht: true },
  { id: "kleur", label: "De kleur van de leiding beoordelen", verplicht: false },
  { id: "cvdruk", label: "De cv-druk bij de buren controleren", verplicht: false },
];

function ControleSVG({ checked, running }) {
  const hl = (id) => (checked.includes(id) ? C.green : C.brownText);
  const fillOk = (id) => (checked.includes(id) ? C.greenLight : "white");
  const flow = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };

  return (
    <svg viewBox="0 0 260 385" className="w-full h-auto select-none">
      <defs>
        <pattern id="hatchM3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* vloer (met sparing voor de rioolaansluiting) */}
      <rect x="8" y="358" width="230" height="12" fill="url(#hatchM3)" stroke={C.brownText} strokeWidth="1.5" />

      {/* schachtwanden (doorsnede) */}
      <rect x="170" y="28" width="8" height="330" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="218" y="28" width="8" height="330" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* binnenste rookgaskanaal + opvangbak */}
      <line x1="192" y1="28" x2="192" y2="320" stroke={C.brownText} strokeWidth="2" />
      <line x1="206" y1="28" x2="206" y2="320" stroke={C.brownText} strokeWidth="2" />
      <path d="M190 320 H208 V327 Q208 334 199 334 Q190 334 190 327 Z" fill="white" stroke={C.brownText} strokeWidth="2" />
      {running && <path d="M199 316 L199 30" fill="none" stroke={C.red} strokeWidth="3.5" strokeLinecap="round" style={flow} />}

      {/* schoorsteenplaat (gegevensplaat aan de schachtwand) */}
      <rect x="152" y="6" width="46" height="20" fill={fillOk("plaat")} stroke={hl("plaat")} strokeWidth={checked.includes("plaat") ? 3 : 2} />
      <line x1="158" y1="13" x2="192" y2="13" stroke={hl("plaat")} strokeWidth="1.5" />
      <line x1="158" y1="19" x2="184" y2="19" stroke={hl("plaat")} strokeWidth="1.5" />

      {/* toestel + typeplaat + vlam */}
      <rect x="28" y="90" width="70" height="90" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="38" y="100" width="34" height="18" fill={fillOk("typeplaat")} stroke={hl("typeplaat")} strokeWidth={checked.includes("typeplaat") ? 2.5 : 1.5} />
      <text x="55" y="112" fontSize="7" fontWeight="700" fill={C.brownText} textAnchor="middle">C43</text>
      <circle cx="63" cy="150" r="11" fill="none" stroke={running ? C.red : C.beigeMid} strokeWidth="2" />
      {running && <path d="M58 153 q5 -12 10 0 q-5 7 -10 0" fill={C.red} opacity="0.8" />}
      {/* verbindingsleiding met terugslagklep, op de stomp met flens */}
      <rect x="98" y="116" width="66" height="14" fill="#B7BFC4" stroke={C.brownText} strokeWidth="2" />
      <ellipse cx="166" cy="123" rx="4" ry="11" fill="white" stroke={C.brownText} strokeWidth="2" />
      <circle cx="132" cy="123" r="9" fill={fillOk("klep")} stroke={hl("klep")} strokeWidth={checked.includes("klep") ? 3 : 2} />
      <line x1="127" y1="128" x2="137" y2="118" stroke={hl("klep")} strokeWidth="2.5" />

      {/* inspectieluik in de schachtwand */}
      <rect x="158" y="258" width="20" height="34" fill={fillOk("luik")} stroke={hl("luik")} strokeWidth={checked.includes("luik") ? 3 : 2} />
      <line x1="162" y1="264" x2="174" y2="264" stroke={hl("luik")} strokeWidth="1.5" />
      <line x1="162" y1="286" x2="174" y2="286" stroke={hl("luik")} strokeWidth="1.5" />

      {/* condensafvoer: sifon, open verbinding, tweede sifon, naar riool */}
      <g fill="none" stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 3 : 2.5}>
        <path d="M199 334 V340 C199 351 213 351 213 340 V352 H224" />
        <path d="M228 346 H238 M230 349 L233 353 L236 349" />
        <path d="M233 353 V355 H240 C240 367 254 367 254 355 V372" />
      </g>
      <text x="246" y="382" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">riool</text>

      {/* CO-melder in de opstellingsruimte */}
      <circle cx="58" cy="48" r="11" fill={fillOk("melder")} stroke={hl("melder")} strokeWidth={checked.includes("melder") ? 3 : 2} />
      <circle cx="58" cy="48" r="4" fill={hl("melder")} />
      <text x="58" y="72" fontSize="7.5" fontWeight="600" fill={C.brown} textAnchor="middle">CO-melder</text>
    </svg>
  );
}

function Ronde3({ addScore, onDone }) {
  const [checked, setChecked] = useState([]); // ids in 'gecontroleerd'
  const [hint, setHint] = useState(null);
  const [running, setRunning] = useState(false);

  const verplichteIds = CONTROLEPUNTEN.filter((p) => p.verplicht).map((p) => p.id);
  const alleVerplicht = verplichteIds.every((id) => checked.includes(id));

  const dropControle = (payload, point) => {
    const punt = CONTROLEPUNTEN.find((p) => p.id === payload);
    if (!punt || checked.includes(punt.id)) return undefined;
    if (punt.verplicht) {
      const next = [...checked, punt.id];
      setChecked(next);
      addScore(5, point);
      setHint(null);
      playSound("drop");
      // laatste verplichte punt binnen: afleiders die correct zijn blijven staan leveren +5 op
      if (verplichteIds.every((id) => next.includes(id))) {
        const overgebleven = CONTROLEPUNTEN.filter((p) => !p.verplicht && !next.includes(p.id));
        if (overgebleven.length > 0) {
          setTimeout(() => addScore(overgebleven.length * 5), 600);
        }
      }
      return "correct";
    }
    addScore(-5, point);
    setHint(`"${punt.label}" hoort niet bij de verplichte controles van een CLV-systeem. Laat dit punt staan.`);
    return "wrong";
  };

  const startToestel = () => {
    setRunning(true);
    playSound("levelup");
    setTimeout(onDone, 2200);
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 3: Controleren en in bedrijf stellen
      </h2>
      <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        Werk het opleverformulier af: sleep elk verplicht controlepunt naar &lsquo;Gecontroleerd&rsquo;. Pas op — er zitten
        punten tussen die er niet bij horen!
      </p>

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        {/* opleverformulier */}
        <div className="flex-1 w-full">
          <div className="rounded-2xl border-2 p-3 mb-3" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
              <span className="font-bold italic text-sm" style={{ color: C.brownText }}>
                Opleverformulier — te controleren
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {CONTROLEPUNTEN.filter((p) => !checked.includes(p.id)).map((p) => (
                <Draggable key={p.id} payload={p.id} ghost={<DragCard label={p.label} small />}>
                  <div
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border-2 bg-white"
                    style={{ borderColor: C.beigeMid, color: C.brownText }}
                  >
                    {p.label}
                  </div>
                </Draggable>
              ))}
              {CONTROLEPUNTEN.filter((p) => !checked.includes(p.id)).length === 0 && (
                <span className="text-xs italic" style={{ color: C.brown }}>
                  (leeg)
                </span>
              )}
            </div>
          </div>

          <DropTarget id="gecontroleerd" onDropItem={dropControle}>
            {({ isHover, flash }) => (
              <div
                className="rounded-2xl border-2 p-3 min-h-[110px] transition-colors"
                style={{
                  borderStyle: "dashed",
                  borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.green,
                  backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.greenLight,
                }}
              >
                <span className="font-bold italic text-sm" style={{ color: C.green }}>
                  Gecontroleerd ✓ ({checked.length}/6)
                </span>
                <div className="flex flex-col gap-1.5 mt-2">
                  {CONTROLEPUNTEN.filter((p) => checked.includes(p.id)).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border-2 flex items-center gap-1.5"
                      style={{ backgroundColor: "white", borderColor: C.green, color: C.green }}
                    >
                      <CheckCircle className="w-3 h-3 shrink-0" />
                      {p.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DropTarget>
        </div>

        {/* tekening */}
        <div className="w-full md:w-[240px] shrink-0">
          <ControleSVG checked={checked} running={running} />
        </div>
      </div>

      {hint && (
        <p className="text-xs text-center italic mt-2 font-medium max-w-md" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      <div className="mt-4">
        {running ? (
          <p className="text-sm font-bold italic" style={{ color: C.green }}>
            Het toestel start op... rookgasafvoer loopt — alles in orde!
          </p>
        ) : (
          <GameButton onClick={startToestel} disabled={!alleVerplicht} variant="green">
            <Power className="w-4 h-4" />
            Toestel in bedrijf stellen
          </GameButton>
        )}
      </div>
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
          Sluit een toestel veilig aan op een CLV-systeem en stel het in bedrijf
        </p>
        <GameButton onClick={onStart}>Start de game</GameButton>
      </div>
    </div>
  );
}

// ─── MAIN ───

const SCREEN_ROUND = { r1: 1, r1mc: 1, r2: 2, r2mc: 2, r3: 3, r3mc: 3 };

export default function CLVMonteurGame({ initialScreen = "start", onExit }) {
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
    if (screen === "end") juice.triggerLevelUp();
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
              title="Missie: de monteur"
              text={'"Jij bent de monteur. Meerdere toestellen op één kanaal — dat vraagt om opletten. Je leert recirculatie voorkomen, het toestel correct aansluiten en het systeem controleren."'}
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
              text="Je kunt nu een toestel veilig aansluiten en controleren op een CLV-systeem!"
              onRestart={resetGame}
              onExit={onExit}
            />
          )}
        </div>
      </DragProvider>
    </div>
  );
}
