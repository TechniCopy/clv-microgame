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
  RondeIntro,
  UitlegItem,
  useEersteFoutVrij,
  useAandacht,
  DrainageTrein,
  playSound,
} from "./shared.jsx";

const MAX_SCORE = 150;

// ─── VRAGENPOOLS ───

const POOL_R1 = [
  {
    question: "Waarop moet je extra letten bij het demonteren van een toestel dat is aangesloten op een CLV-systeem?",
    options: [
      "Dat de aansluitstompen (rookgas en lucht) direct worden afgesloten.",
      "Dat ramen en deuren open staan voor verse lucht.",
      "Dat de bewoner niet aanwezig is tijdens het werk.",
      "Dat de schachtwand wordt aangeheeld.",
    ],
    correct: 0,
    feedbackCorrect: "Precies! Beide stompen direct afsluiten, anders kan rookgas van de buren de woning instromen. Deze waarschuwing staat ook verplicht op de typeplaat bij elke aansluiting (voorschriften CLV C(10)-toepassingen, hoofdstuk 7).",
    feedbackWrong: "Denk aan de animatie: de open stomp liet rookgas binnen. Altijd beide stompen direct afsluiten bij demontage.",
    aandacht: "Bij demontage sluit je beide aansluitstompen direct af",
  },
  {
    question: "Waarom is rookgas-recirculatie levensgevaarlijk?",
    options: [
      "Rookgas bevat koolmonoxide (CO), zeker bij een onvolledige verbranding — dat giftige gas adem je dan in.",
      "Het verhoogt de temperatuur in de schacht te veel.",
      "Het veroorzaakt corrosie aan de binnenzijde van het kanaal.",
      "Het zorgt voor te veel trek in het systeem.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! Rookgas bevat koolmonoxide (CO) — en bij een onvolledige verbranding veel meer. Via recirculatie adem je dat giftige, reukloze gas in.",
    feedbackWrong: "De kern: rookgas bevat koolmonoxide (CO), zeker bij een onvolledige verbranding. Via recirculatie komt dat giftige gas de woning in.",
    aandacht: "Recirculatie is levensgevaarlijk omdat rookgas koolmonoxide (CO) bevat",
  },
];

const POOL_R2 = [
  {
    question: "Een HR-toestel wordt aangesloten op een CLV-kanaal op overdruk. Wat moet er in het toestel aanwezig zijn om rookgas-recirculatie te voorkomen?",
    options: ["Een rookgaskeerklep (terugslagklep)", "Een TTB (thermische terugslagbeveiliging)", "Een rookgasdop", "Een rookgassensor"],
    correct: 0,
    feedbackCorrect: "Correct! Bij overdruk-CLV is een terugslagklep verplicht, gekeurd samen met het toestel (voorschriften CLV C(10)-toepassingen, bijlage D).",
    feedbackWrong: "Bij overdruk-CLV is de rookgaskeerklep (terugslagklep) verplicht. Een TTB is iets anders: die meet temperatuur bij open toestellen.",
    aandacht: "Bij overdruk-CLV is een terugslagklep in het toestel verplicht",
  },
  {
    question: "Je sluit een nieuw toestel aan op een bestaand inpandig RVS CLV-systeem. Met welk materiaal mag de verbindingsleiding worden gemaakt?",
    options: ["RVS", "Kunststof", "Dikwandig aluminium", "Dunwandig aluminium"],
    correct: 0,
    feedbackCorrect: "Correct! Bij een RVS-systeem alleen RVS gebruiken — anders ontstaat galvanische corrosie en verschil in uitzetting.",
    feedbackWrong: "Op een bestaand RVS-systeem mag je geen ander materiaal combineren. Alleen RVS.",
    aandacht: "Op een RVS-systeem hoort een RVS-leiding: ander materiaal geeft galvanische corrosie",
  },
  {
    question: "Wat is het verschil tussen een onderdruk- en een overdruk-CLV-systeem?",
    options: [
      "Bij onderdruk ontstaat de trek natuurlijk door de warme rookgassen; bij overdruk zet de ventilator van het toestel druk op het kanaal.",
      "Bij onderdruk zit de ventilator in het kanaal, bij overdruk in het toestel.",
      "Een overdruksysteem werkt alleen bij lage buitentemperaturen.",
      "Er is geen verschil; het zijn twee namen voor hetzelfde systeem.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! Onderdruk (VR) werkt op natuurlijke trek (NPR 3378-40); bij overdruk (HR) duwt de ventilator het rookgas onder druk het kanaal in (voorschriften CLV C(10)-toepassingen).",
    feedbackWrong: "Denk aan de schuif: bij onderdruk stijgt het rookgas vanzelf (natuurlijke trek), bij overdruk zet de ventilator van het toestel druk op het kanaal.",
    aandacht: "Onderdruk werkt op natuurlijke trek, bij overdruk zet de ventilator druk op het kanaal",
  },
  {
    question: "Waarom is bij een overdruk-CLV-systeem een terugslagklep in het toestel verplicht?",
    options: [
      "De druk in het kanaal is hoger dan in de woning; zonder klep kan rookgas via een stilstaand toestel de woning in worden gedrukt.",
      "De klep vergroot de trek in het kanaal.",
      "De klep voorkomt dat condenswater het toestel in loopt.",
      "De klep is alleen nodig om geluid te dempen.",
    ],
    correct: 0,
    feedbackCorrect: "Correct! Bij overdruk staat het kanaal onder druk. Een stilstaand toestel zonder terugslagklep wordt dan een open route voor rookgas de woning in (voorschriften CLV C(10)-toepassingen, bijlage D).",
    feedbackWrong: "Bij overdruk is de druk in het kanaal hoger dan in de woning. Zonder terugslagklep duwt het rookgas zich via een stilstaand toestel naar binnen.",
    aandacht: "Bij overdruk kan rookgas via een stilstaand toestel zonder klep de woning in",
  },
  {
    question: "Mag je voor de aansluitleiding onderdelen van twee verschillende merken combineren?",
    options: [
      "Nee, gebruik altijd materiaal van dezelfde fabrikant.",
      "Ja, als beide merken een QA-keur hebben.",
      "Ja, dat is geen probleem.",
      "Alleen bij metalen leidingen mag dat.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! Hetzelfde merk voor de hele aansluitleiding — afdichtingen en maten passen dan op elkaar.",
    feedbackWrong: "Verschillende merken combineren mag niet: afdichtingsringen en maatvoering verschillen net, met lekkage als risico.",
    aandacht: "Gebruik voor de hele aansluitleiding onderdelen van hetzelfde merk",
  },
];

const POOL_R3 = [
  {
    question: "Wat is de minimale afmeting van het inspectieluik bij een CLV-systeem?",
    options: ["50 x 50 cm", "30 x 30 cm", "60 x 60 cm", "100 x 100 cm"],
    correct: 0,
    feedbackCorrect: "Klopt! Minimaal 50 x 50 cm, brandwerend, en maximaal 50 cm van het hart van het CLV-systeem (NPR 3378-40, art. 5.1.5).",
    feedbackWrong: "Het inspectieluik moet minimaal 50 x 50 cm zijn, zodat het systeem goed bereikbaar en inspecteerbaar blijft (NPR 3378-40, art. 5.1.5).",
    aandacht: "Het inspectieluik is minimaal 50 x 50 cm",
  },
  {
    question: "Wat is de verwachte levensduur van een CLV-systeem?",
    options: ["Circa 15 jaar", "Circa 5 jaar", "Circa 30 jaar", "Onbeperkt, mits jaarlijks geïnspecteerd"],
    correct: 0,
    feedbackCorrect: "Juist! Na circa 15 jaar neemt de kans op rookgaslekkage toe door veroudering van materialen en afdichtingen.",
    feedbackWrong: "De verwachte levensduur is circa 15 jaar. Daarna verouderen metalen (corrosie), kunststof (bros) en afdichtingsringen (uitharden).",
    aandacht: "Een CLV-systeem gaat circa 15 jaar mee",
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
    aandacht: "Vervang je een toestel? Controleer dan of het CLV-systeem nog geschikt is",
  },
  {
    question: "Je opent tijdens een onderhoudsbeurt het inspectieluik van de rookgasafvoer (RGA). Waar moet je op bedacht zijn?",
    options: [
      "Waterophoping achter het luik.",
      "Overdruk die het luik eruit blaast.",
      "Dat het luik daarna niet meer terug mag worden geplaatst.",
      "Roetaanslag die het luik vastplakt.",
    ],
    correct: 0,
    feedbackCorrect: "Klopt! Achter het RGA-inspectieluik kan zich condenswater hebben opgehoopt — pas op als je het opent.",
    feedbackWrong: "Bij het openen van het RGA-luik moet je bedacht zijn op waterophoping: er kan condenswater achter het luik staan.",
    aandacht: "Achter het RGA-inspectieluik kan condenswater staan: pas op bij het openen",
  },
  {
    question: "Welke onderdelen reinig je bij een onderhoudsbeurt van een CLV-systeem?",
    options: [
      "De rookgasafvoer, de sifons (ook de rioleringssifon, met water gevuld) en het luchttoevoerdeel.",
      "Alleen de rookgasafvoer; de rest is onderhoudsvrij.",
      "Alleen de sifons; de kanalen reinigen zichzelf door de trek.",
      "De buitenzijde van de schacht en het dak.",
    ],
    correct: 0,
    feedbackCorrect: "Juist! Je reinigt de rookgasafvoer, beide sifons (en vult ze met water terug) en het luchttoevoerdeel.",
    feedbackWrong: "Volgens de onderhoudsvoorschriften reinig je drie dingen: de rookgasafvoer, de sifons (met water, ook de rioleringssifon) en het luchttoevoerdeel.",
    aandacht: "Bij onderhoud reinig je de rookgasafvoer, beide sifons en het luchttoevoerdeel",
  },
];

// Onderhoudsvoorschriften CLV (uit de lesstof): in deze volgorde afwerken
const ONDERHOUD_STAPPEN = [
  { id: "s1", label: "Open het toegangsluik in de wand — het CLV-kanaal is nu zichtbaar" },
  { id: "s2", label: "Open de inspectieluiken: eerst luchttoevoer, dan RGA (pas op waterophoping!)" },
  { id: "s3", label: "Controleer of het typeplaatje zichtbaar op het CLV-kanaal is gemonteerd" },
  { id: "s4", label: "Reinig de rookgasafvoer, de sifons (met water, ook de rioleringssifon) en het luchttoevoerdeel" },
  { id: "s5", label: "Plaats de inspectiedeksels terug en controleer of de afdichting goed zit" },
  { id: "s6", label: "Plaats het toegangsluik terug" },
];

// ─── RONDE 1: RECIRCULATIE VOORKOMEN ───

function RecircSVG({ closed, gedemonteerd }) {
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

      {/* BOVENSTE WONING */}
      {!gedemonteerd ? (
        <>
          {/* het oude toestel hangt er nog (uit), aangesloten op de stompen */}
          <rect x="115" y="120" width="80" height="66" fill="white" stroke={C.brownText} strokeWidth="2.5" />
          <circle cx="145" cy="146" r="10" fill="none" stroke={C.beigeMid} strokeWidth="2" />
          <text x="155" y="176" fontSize="8.5" fontWeight="700" fill={C.brownText} textAnchor="middle">OUDE KETEL (UIT)</text>
          <path d="M195 139 H360" fill="none" stroke={C.brownText} strokeWidth="5" strokeLinecap="round" />
          <path d="M195 179 H360" fill="none" stroke={C.brownText} strokeWidth="5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="115" y="120" width="80" height="66" fill="none" stroke={C.beigeMid} strokeWidth="2" strokeDasharray="6 5" />
          <text x="155" y="150" fontSize="8.5" fontWeight="600" fill={C.brown} textAnchor="middle">toestel</text>
          <text x="155" y="162" fontSize="8.5" fontWeight="600" fill={C.brown} textAnchor="middle">gedemonteerd</text>
        </>
      )}

      {/* afvoerbak voor het oude toestel */}
      <path d="M96 208 L104 226 H166 L174 208" fill={gedemonteerd ? C.beigeLight : "white"} stroke={C.brownText} strokeWidth="2" strokeLinejoin="round" />
      <text x="135" y="221" fontSize="7.5" fontWeight="600" fill={C.brown} textAnchor="middle">afvoer</text>
      {gedemonteerd && <rect x="112" y="200" width="46" height="10" fill="white" stroke={C.brownText} strokeWidth="1.5" />}

      {/* aansluitstompen door de schachtwand (met flens, zoals in de norm) */}
      {[
        { id: "rookgas", y: 128 },
        { id: "lucht", y: 168 },
      ].map(({ id, y }) => {
        const dicht = closed[id];
        const open = gedemonteerd && !dicht;
        return (
          <g key={id}>
            <rect x="364" y={y + 2} width="28" height="18" fill="white" stroke={dicht ? C.green : C.brownText} strokeWidth="2" />
            <ellipse cx="364" cy={y + 11} rx="4.5" ry="11" fill={dicht ? C.greenLight : open ? "#3B1E0A" : "white"} stroke={dicht ? C.green : C.brownText} strokeWidth="2" />
            {dicht && <circle cx="364" cy={y + 11} r="5" fill={C.green} stroke="white" strokeWidth="1.5" />}
            <text x="356" y={y + 14} fontSize="8" fontWeight="600" fill={C.brown} textAnchor="end">{id}</text>
          </g>
        );
      })}

      {/* open rookgasstomp: rookgas (CO) stroomt de woning in */}
      {gedemonteerd && !closed.rookgas && (
        <>
          <path d="M410 139 L364 139 L300 139 Q250 139 235 160 Q225 175 240 190" fill="none" stroke={C.red} strokeWidth="4" style={flow} opacity="0.9" />
          <path d="M232 184 L240 196 L248 186" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {/* open luchtstomp: hier blaast alleen lucht uit het toevoerkanaal */}
      {gedemonteerd && !closed.lucht && (
        <>
          <path d="M403 179 L364 179 L324 179" fill="none" stroke="#3B82F6" strokeWidth="3" style={flowSlow} opacity="0.8" />
          <path d="M332 174 L322 179 L332 184" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {/* gevaarwolkjes in de bovenwoning (alleen door het rookgas) */}
      {gedemonteerd && !closed.rookgas && (
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

function Ronde1({ addScore, onDone, noteer }) {
  const [gestart, setGestart] = useState(false);
  const [gedemonteerd, setGedemonteerd] = useState(false);
  const [closed, setClosed] = useState({ rookgas: false, lucht: false });
  const [kappenOver, setKappenOver] = useState(2);
  const [hint, setHint] = useState(null);
  const [co, setCo] = useState(0);
  const gratisFout = useEersteFoutVrij();
  const stateRef = useRef({ closed, gedemonteerd });
  useEffect(() => {
    stateRef.current = { closed, gedemonteerd };
  }, [closed, gedemonteerd]);

  const bothClosed = closed.rookgas && closed.lucht;

  // CO komt alleen uit de open rookgasstomp: die is pas open na demontage,
  // en de meter daalt zodra de stomp is afgedopt (de luchtstomp geeft geen CO)
  useEffect(() => {
    const timer = setInterval(() => {
      setCo((prev) => {
        const open = stateRef.current.gedemonteerd && !stateRef.current.closed.rookgas;
        const target = open ? 600 : 0;
        const next = prev + (target - prev) * (open ? 0.012 : 0.08);
        return Math.abs(next - target) < 1 ? target : next;
      });
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // fase 1: het oude toestel naar de afvoerbak slepen
  const dropAfvoer = (payload, point) => {
    if (gedemonteerd) return undefined;
    if (payload === "toestel") {
      setGedemonteerd(true);
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    return undefined;
  };

  // fase 2: het juiste onderdeel (afsluitkap) op de open stompen
  const FOUTE_ONDERDELEN = {
    tape: "Tape is niet gasdicht en niet toegestaan. Gebruik een afsluitkap.",
    beugel: "Een beugel sluit niets af, die is om leidingen op te hangen. Gebruik een afsluitkap.",
  };
  const FOUT_AANDACHT = {
    tape: "Een open stomp sluit je af met een afsluitkap, nooit met tape",
    beugel: "Een beugel sluit niets af: gebruik een afsluitkap",
  };

  const dropKap = (stomp) => (payload, point) => {
    if (!gedemonteerd || closed[stomp]) return undefined;
    if (payload.startsWith("kap")) {
      setClosed((prev) => ({ ...prev, [stomp]: true }));
      setKappenOver((prev) => prev - 1);
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    const uitleg = FOUTE_ONDERDELEN[payload] ?? "Dat onderdeel hoort hier niet.";
    noteer(FOUT_AANDACHT[payload]);
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
    return "wrong";
  };

  const dropFout = (foutHint) => (payload, point) => {
    if (!gedemonteerd) return undefined;
    noteer("Sluit de open stompen af in de woning waar je het toestel weghaalt");
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${foutHint} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(foutHint);
    return "wrong";
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 1: Recirculatie voorkomen"
        intro="Het grootste gevaar bij een CLV-systeem. Even kort waarom:"
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Recirculatie">rookgas van een ander toestel komt jouw woning binnen.</UitlegItem>
        <UitlegItem term="Waarom gevaarlijk">
          rookgas bevat koolmonoxide (CO), vooral bij onvolledige verbranding. Een giftig gas dat je niet ruikt.
        </UitlegItem>
        <UitlegItem term="Jouw klus">
          demonteer het oude toestel in de bovenwoning. Let op: daarna staan de stompen open.
        </UitlegItem>
      </RondeIntro>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 1: Recirculatie voorkomen
      </h2>
      <p className="text-sm mb-3 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        {!gedemonteerd
          ? "Stap 1: demonteer het oude toestel. Sleep (of tik) het naar de afvoerbak."
          : "Het toestel is weg, maar nu staan de aansluitstompen open! Sluit ze allebei af voordat het rookgas van de buren binnenstroomt."}
      </p>

      <div className="mb-3">
        <COMeter value={co} />
      </div>

      <div className="relative w-full" style={{ maxWidth: 520 }}>
        <RecircSVG closed={closed} gedemonteerd={gedemonteerd} />
        {/* fase 1: het oude toestel is sleepbaar */}
        {!gedemonteerd && (
          <>
            <Draggable
              payload="toestel"
              ghost={<ToestelVisual />}
              className="absolute"
              style={{ left: `${(115 / 520) * 100}%`, top: `${(120 / 430) * 100}%`, width: `${(80 / 520) * 100}%`, height: `${(66 / 430) * 100}%` }}
            >
              <div className="w-full h-full rounded-lg border-2 border-dashed" style={{ borderColor: C.olive, backgroundColor: "rgba(92,107,46,0.08)" }} />
            </Draggable>
            <DropTarget
              id="afvoerbak"
              onDropItem={dropAfvoer}
              className="absolute"
              style={{ left: `${(90 / 520) * 100}%`, top: `${(198 / 430) * 100}%`, width: `${(90 / 520) * 100}%`, height: `${(34 / 430) * 100}%` }}
            >
              {({ isHover }) => (
                <div
                  className="w-full h-full rounded-lg border-2 transition-colors"
                  style={{
                    borderStyle: "dashed",
                    borderColor: isHover ? C.olive : "transparent",
                    backgroundColor: isHover ? "rgba(92,107,46,0.25)" : "transparent",
                  }}
                />
              )}
            </DropTarget>
          </>
        )}
        {/* fase 2: dropzones over de stompen (viewBox 520x430) */}
        {gedemonteerd && (
          <>
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
          </>
        )}
      </div>

      {hint && (
        <p className="text-xs text-center italic mb-2 mt-1 font-medium max-w-md" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      {!gedemonteerd ? (
        <p className="text-xs italic font-medium mt-2" style={{ color: C.brown }}>
          Tip: pak het oude toestel in de bovenwoning en sleep het naar de afvoerbak eronder.
        </p>
      ) : !bothClosed ? (
        <div className="flex gap-3 mt-2 items-center flex-wrap justify-center">
          {Array.from({ length: kappenOver }).map((_, i) => (
            <Draggable key={i} payload={`kap${i}`} ghost={<KapVisual />}>
              <KapVisual />
            </Draggable>
          ))}
          <Draggable payload="tape" ghost={<TapeVisual />}>
            <TapeVisual />
          </Draggable>
          <Draggable payload="beugel" ghost={<BeugelVisual />}>
            <BeugelVisual />
          </Draggable>
          <span className="text-xs italic font-medium" style={{ color: C.brown }}>
            ← kies het juiste onderdeel voor de open stompen
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

function TapeVisual() {
  return (
    <div className="flex flex-col items-center select-none">
      <svg width="52" height="40" viewBox="0 0 52 40">
        <circle cx="26" cy="21" r="13" fill="#9CA3AF" stroke={C.brownText} strokeWidth="2" />
        <circle cx="26" cy="21" r="5" fill="white" stroke={C.brownText} strokeWidth="1.5" />
        <path d="M38 16 H48 V26 H39" fill="#9CA3AF" stroke={C.brownText} strokeWidth="1.5" />
      </svg>
      <span className="text-[9px] font-bold" style={{ color: C.brownText }}>Tape</span>
    </div>
  );
}

function BeugelVisual() {
  return (
    <div className="flex flex-col items-center select-none">
      <svg width="52" height="40" viewBox="0 0 52 40">
        <path d="M14 26 a12 12 0 0 1 24 0" fill="none" stroke={C.brownText} strokeWidth="4" />
        <line x1="26" y1="14" x2="26" y2="5" stroke={C.brownText} strokeWidth="3.5" />
        <line x1="12" y1="28" x2="40" y2="28" stroke={C.brownText} strokeWidth="2.5" />
      </svg>
      <span className="text-[9px] font-bold" style={{ color: C.brownText }}>Beugel</span>
    </div>
  );
}

function ToestelVisual() {
  return (
    <div className="rounded border-2 px-3 py-2 text-[9px] font-bold select-none" style={{ backgroundColor: "white", borderColor: C.brownText, color: C.brownText }}>
      OUDE KETEL
    </div>
  );
}

// ─── RONDE 2: HET TOESTEL AANSLUITEN ───

const MATERIALEN = [
  { id: "rvs", label: "RVS — zelfde merk", kleur: "#B7BfC4", correct: true },
  {
    id: "rvsB",
    label: "RVS — ander merk",
    kleur: "#B7BfC4",
    correct: false,
    uitleg: "Wel RVS, maar een ander merk mag niet: afdichtingsringen en maten verschillen net, met lekkage als risico. Gebruik altijd onderdelen van dezelfde fabrikant.",
    aandacht: "Gebruik voor de hele aansluitleiding onderdelen van hetzelfde merk",
  },
  { id: "kunststof", label: "Kunststof", kleur: "#E8E3D8", correct: false },
  { id: "aluminium", label: "Aluminium", kleur: "#8E9AA3", correct: false },
];

function LeidingKaart({ mat }) {
  return (
    <div className="flex flex-col items-center select-none">
      <svg width="90" height="30" viewBox="0 0 90 30">
        <rect x="4" y="9" width="82" height="12" rx="6" fill={mat.kleur} stroke={C.brownText} strokeWidth="2" />
        {mat.id.startsWith("rvs") && <line x1="10" y1="13" x2="80" y2="13" stroke="white" strokeWidth="2" opacity="0.7" />}
        {mat.id === "rvsB" && <circle cx="45" cy="15" r="4" fill="none" stroke={C.brownText} strokeWidth="1.3" />}
        {mat.id === "kunststof" && <line x1="10" y1="15" x2="80" y2="15" stroke="#C96" strokeWidth="2" opacity="0.6" />}
      </svg>
      <span className="text-[10px] font-bold" style={{ color: C.brownText }}>{mat.label}</span>
    </div>
  );
}

// ─── STAP B: DE DRUKVERKENNER (onderdruk vs overdruk) ───

const R2B_KAARTJES = [
  { id: "d1", label: "Werkt op natuurlijke trek", col: "onderdruk", aandacht: "Onderdruk werkt op natuurlijke trek: het warme rookgas stijgt vanzelf" },
  { id: "d2", label: "De ventilator van het toestel zet druk op het kanaal", col: "overdruk", aandacht: "Bij overdruk zet de ventilator van het toestel druk op het kanaal" },
  { id: "d3", label: "Terugslagklep in het toestel verplicht", col: "overdruk", aandacht: "De terugslagklep is verplicht bij overdruk, niet bij onderdruk" },
  { id: "d4", label: "Dubbele sifon in serie met open verbinding", col: "onderdruk", aandacht: "Onderdruk: dubbele sifon in serie met een open verbinding ertussen" },
  { id: "d5", label: "Aparte condens- en regenwatersifon per kanaal", col: "overdruk", aandacht: "Overdruk: een aparte condens- en regenwatersifon per kanaal" },
  { id: "d6", label: "Maximaal 2 toestellen per verdieping", col: "overdruk", aandacht: "Bij een C(10) overdruk-CLV: maximaal 2 toestellen per verdieping" },
];

function DrukSchuif({ modus, onChange }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.brownText }}>
        Systeemdruk
      </span>
      <div
        className="relative flex rounded-full border-2 p-1 cursor-pointer select-none"
        style={{ backgroundColor: C.beigeLight, borderColor: C.brownText, width: 240 }}
        onClick={() => onChange(modus === "onderdruk" ? "overdruk" : "onderdruk")}
      >
        <div
          className="absolute top-1 bottom-1 rounded-full transition-all duration-300 shadow-md"
          style={{ width: "calc(50% - 4px)", left: modus === "onderdruk" ? 4 : "calc(50% + 0px)", backgroundColor: C.olive }}
        />
        {["onderdruk", "overdruk"].map((m) => (
          <div
            key={m}
            className="flex-1 text-center py-2 text-xs font-bold uppercase z-10 transition-colors duration-300"
            style={{ color: modus === m ? "white" : C.brown }}
          >
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

// labels=false verbergt de benoemende teksten (tijdens de mini-opdracht, anders zijn ze de antwoordsleutel)
function DrukSysteemSVG({ modus, aangesloten = true, labels = true }) {
  const over = modus === "overdruk";
  const flowUp = { strokeDasharray: "8 6", animation: `flowDash ${over ? "0.45s" : "1.1s"} linear infinite` };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };
  // U-vormige sifon (waterslot): pad van inlaatbeen xi (top yt) naar uitlaatbeen xi+w
  const uTrap = (xi, yt, w, d) => {
    const r = 4;
    return `M${xi} ${yt} V${yt + d - r} Q${xi} ${yt + d} ${xi + r} ${yt + d} H${xi + w - r} Q${xi + w} ${yt + d} ${xi + w} ${yt + d - r} V${yt}`;
  };

  return (
    <svg viewBox="0 0 520 400" className="w-full h-auto select-none">
      <defs>
        <pattern id="hatchM2b" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* vloer */}
      <rect x="20" y="380" width="440" height="12" fill="url(#hatchM2b)" stroke={C.brownText} strokeWidth="2" />

      {/* schachtwanden */}
      <rect x="350" y="20" width="8" height="360" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="422" y="20" width="8" height="360" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* binnenste rookgaskanaal + opvangbak */}
      <line x1="378" y1="20" x2="378" y2="320" stroke={C.brownText} strokeWidth="2" />
      <line x1="402" y1="20" x2="402" y2="320" stroke={C.brownText} strokeWidth="2" />
      <path d="M376 320 H404 V328 Q404 336 390 336 Q376 336 376 328 Z" fill="white" stroke={C.brownText} strokeWidth="2" />

      {/* stromen (pas als het toestel is aangesloten en in bedrijf) */}
      {aangesloten && (
        <>
          <path d="M390 316 L390 16" fill="none" stroke={C.red} strokeWidth={over ? 5 : 3.5} strokeLinecap="round" style={flowUp} />
          <path d="M385 14 L390 4 L395 14" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M364 26 L364 350" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
          <path d="M416 26 L416 350" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
        </>
      )}
      {/* natuurlijke trek: warmtegolfjes boven de uitmonding */}
      {!over && (
        <g stroke={C.brown} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7">
          <path d="M372 8 q4 -4 8 0" />
          <path d="M400 8 q4 -4 8 0" />
        </g>
      )}

      {/* drukmeter naast het kanaal */}
      <g>
        <circle cx="475" cy="80" r="17" fill="white" stroke={C.brownText} strokeWidth="2" />
        <text x="463" y="85" fontSize="11" fontWeight="700" fill="#3B82F6">&#8722;</text>
        <text x="482" y="85" fontSize="11" fontWeight="700" fill={C.red}>+</text>
        <line
          x1="475"
          y1="80"
          x2={!aangesloten ? 475 : over ? 484 : 466}
          y2={!aangesloten ? 66 : 69}
          stroke={!aangesloten ? C.beigeMid : over ? C.red : "#3B82F6"}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="475" cy="80" r="2.5" fill={C.brownText} />
        <text x="475" y="110" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">druk in</text>
        <text x="475" y="120" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">het kanaal</text>
      </g>

      {/* parallelle aansluiting: aparte rookgasafvoer- en luchttoevoerleiding */}
      {aangesloten ? (
        <>
          {/* rookgasafvoerleiding: van het toestel naar het BINNENKANAAL */}
          <path d="M95 160 V110 H380" fill="none" stroke={C.brownText} strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M95 160 V110 H380" fill="none" stroke="#B7BFC4" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M95 154 V110 H386" fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round" style={flowUp} />
        </>
      ) : (
        /* nog niet aangesloten: het gat waar de rookgasleiding moet komen */
        <path d="M95 160 V110 H376" fill="none" stroke={C.brown} strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="10 8" opacity="0.4" />
      )}
      <ellipse cx="380" cy="110" rx="4" ry="10" fill="white" stroke={C.brownText} strokeWidth="2" />
      <text x="165" y="101" fontSize="8" fontWeight="600" fill={C.brown}>rookgasafvoer</text>
      {/* luchttoevoerleiding: van de RINGSPLEET naar het toestel */}
      <path d="M362 140 H120 V160" fill="none" stroke={C.brownText} strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M362 140 H120 V160" fill="none" stroke="#B7BFC4" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" />
      {aangesloten && <path d="M364 140 H120 V154" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round" style={flowDown} />}
      <ellipse cx="362" cy="140" rx="4" ry="10" fill="white" stroke={C.brownText} strokeWidth="2" />
      <text x="165" y="157" fontSize="8" fontWeight="600" fill={C.brown}>luchttoevoer</text>

      {/* terugslagklep in de rookgasafvoer: alleen verplicht (en getoond) bij overdruk */}
      {over && (
        <g>
          <circle cx="240" cy="110" r="9" fill={C.greenLight} stroke={C.green} strokeWidth="2.5" />
          <line x1="235" y1="115" x2="245" y2="105" stroke={C.green} strokeWidth="2.5" />
          {labels && <text x="240" y="92" fontSize="8.5" fontWeight="700" fill={C.green} textAnchor="middle">terugslagklep verplicht</text>}
        </g>
      )}

      {/* aansluitstubs bovenop het toestel: rookgas (links) en lucht (rechts) */}
      <rect x="86" y="158" width="18" height="12" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="111" y="158" width="18" height="12" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="60" y="170" width="90" height="100" fill="white" stroke={C.brownText} strokeWidth="2.5" />
      {/* vlam (alleen als het toestel in bedrijf is) */}
      <circle cx="88" cy="225" r="10" fill="none" stroke={aangesloten ? C.red : C.beigeMid} strokeWidth="2" />
      {aangesloten && <path d="M83 228 q5 -12 10 0 q-5 7 -10 0" fill={C.red} opacity="0.7" />}
      {/* ventilator (draait bij overdruk) */}
      <circle cx="124" cy="200" r="11" fill="white" stroke={C.brownText} strokeWidth="2" />
      <g
        stroke={aangesloten && over ? C.red : C.beigeMid}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={aangesloten && over ? { transformOrigin: "124px 200px", animation: "spinFan 0.7s linear infinite" } : undefined}
      >
        <line x1="124" y1="200" x2="124" y2="192" />
        <line x1="124" y1="200" x2="131" y2="204" />
        <line x1="124" y1="200" x2="117" y2="204" />
      </g>
      <text x="105" y="258" fontSize="9" fontWeight="700" fill={C.brownText} textAnchor="middle">
        {over ? "HR-KETEL" : "VR-KETEL"}
      </text>

      {/* kier in de schachtwand: wat gebeurt er bij een lek? (pas zichtbaar in bedrijf) */}
      {aangesloten && (
        <>
      <rect x="349" y="232" width="10" height="14" fill="white" />
      <line x1="350" y1="232" x2="358" y2="232" stroke={C.brownText} strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="350" y1="246" x2="358" y2="246" stroke={C.brownText} strokeWidth="1.5" strokeDasharray="2 2" />
      {over ? (
        <g>
          <path d="M356 239 L322 239" fill="none" stroke={C.red} strokeWidth="3" style={flowUp} />
          <path d="M330 234 L320 239 L330 244" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="305" cy="239" r="9" fill={C.red} opacity="0.15" style={{ animation: "pulseGlow 1.4s ease-in-out infinite" }} />
          <text x="288" y="226" fontSize="8.5" fontWeight="700" fill={C.red} textAnchor="end">rookgas drukt</text>
          <text x="288" y="236" fontSize="8.5" fontWeight="700" fill={C.red} textAnchor="end">naar buiten!</text>
        </g>
      ) : (
        <g>
          <path d="M324 239 L352 239" fill="none" stroke="#3B82F6" strokeWidth="2.5" style={flowUp} />
          <path d="M344 234 L354 239 L344 244" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="316" y="226" fontSize="8.5" fontWeight="600" fill="#3B82F6" textAnchor="end">lucht zuigt</text>
          <text x="316" y="236" fontSize="8.5" fontWeight="600" fill="#3B82F6" textAnchor="end">naar binnen</text>
        </g>
      )}
        </>
      )}

      {/* ── condensafvoer onderaan, normconform per systeem ── */}
      {!over ? (
        <>
          {/* ONDERDRUK (NPR 3378-40): drukvereffeningsopeningen + dubbele sifon in serie met open verbinding */}
          <g fill="none" stroke={C.brownText} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {[381, 390, 399].map((cx) => (
              <circle key={cx} cx={cx} cy="352" r="2.6" strokeWidth="1.4" />
            ))}
            <path d="M390 336 V342 H436" />
            <path d="M466 346 H492 V392" />
          </g>
          <DrainageTrein x={436} y={342} s={0.78} stroke={C.brownText} strokeWidth={3.1} riool={false} />
          {labels && (
            <>
              <text x="466" y="333" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">2 sifons in serie</text>
              <text x="466" y="342" fontSize="7.5" fontWeight="600" fill={C.brown} textAnchor="middle">+ open verbinding</text>
            </>
          )}
        </>
      ) : (
        <>
          {/* OVERDRUK (C(10)): aparte condenssifon (rookgaskanaal) + regenwatersifon (luchtkanaal), parallel */}
          <g fill="none" stroke={C.brownText} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {/* condenssifon onder het rookgaskanaal */}
            <path d="M390 336 V343" />
            <path d={uTrap(390, 343, 15, 19)} />
            <path d="M405 343 H414 V392" />
            {/* regenwatersifon onder het luchtkanaal, ernaast */}
            <path d="M416 350 V347 H446" />
            <path d={uTrap(446, 347, 17, 22)} />
            <path d="M463 347 V392" />
          </g>
          {labels && (
            <>
              <text x="382" y="336" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">condens-</text>
              <text x="382" y="345" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">sifon</text>
              <text x="460" y="336" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">regenwater-</text>
              <text x="460" y="345" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">sifon</text>
            </>
          )}
        </>
      )}

      {/* max 2 toestellen per verdieping (alleen overdruk, C(10)-voorschriften hfst. 8) */}
      {over && labels && (
        <text x="20" y="60" fontSize="9" fontWeight="700" fill={C.brownText}>
          max. 2 toestellen per verdieping
        </text>
      )}
    </svg>
  );
}

function Ronde2({ addScore, onDone, noteer }) {
  const [gestart, setGestart] = useState(false);
  const [stap, setStap] = useState(0); // 0 = materiaalkeuze, 1 = drukverkenner
  const [aangesloten, setAangesloten] = useState(false); // na stap A start de installatie
  const [hint, setHint] = useState(null);
  const [modus, setModus] = useState("onderdruk");
  const [seen, setSeen] = useState({ onderdruk: true, overdruk: false });
  const [opdracht, setOpdracht] = useState(false); // mini-opdracht gestart: labels en spiekbrief verdwijnen
  const [placed, setPlaced] = useState({});
  const gratisFout = useEersteFoutVrij();

  const bothSeen = seen.onderdruk && seen.overdruk;
  const allPlaced = R2B_KAARTJES.every((k) => placed[k.id]);

  // STAP A: materiaal
  const dropMateriaal = (payload, point) => {
    if (stap !== 0) return undefined;
    const mat = MATERIALEN.find((m) => m.id === payload);
    if (!mat) return undefined;
    if (mat.correct) {
      addScore(5, point);
      setHint(null);
      // de leiding zit erin: het toestel komt in bedrijf en de stromen starten
      setAangesloten(true);
      playSound("levelup");
      setTimeout(() => setStap(1), 1800);
      return "correct";
    }
    const uitleg = mat.uitleg ?? `${mat.label} mag hier niet: de schacht is RVS. Twee verschillende metalen of materialen geven galvanische corrosie en verschil in uitzetting.`;
    noteer(mat.aandacht ?? "Op een RVS-systeem hoort een RVS-leiding: ander materiaal geeft galvanische corrosie");
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
    return "wrong";
  };

  // STAP B: drukverkenner
  const handleModus = (m) => {
    setModus(m);
    setSeen((prev) => ({ ...prev, [m]: true }));
  };

  const dropIn = (col) => (payload, point) => {
    const kaart = R2B_KAARTJES.find((k) => k.id === payload);
    if (!kaart || placed[kaart.id]) return undefined;
    if (kaart.col === col) {
      setPlaced((prev) => ({ ...prev, [kaart.id]: col }));
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    noteer(kaart.aandacht);
    const uitleg =
      col === "onderdruk"
        ? "Bij onderdruk werkt het kanaal op natuurlijke trek, met een dubbele sifon in serie en een open verbinding (NEN 3287). De aparte condens-/regenwatersifon hoort bij overdruk."
        : "Overdruk = ventilatordruk op het kanaal. Daarom: terugslagklep verplicht, een aparte condens- en regenwatersifon per kanaal, en max. 2 toestellen per verdieping.";
    if (gratisFout()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
    return "wrong";
  };

  const kolom = (col, titel, sub) => (
    <DropTarget id={`r2b-${col}`} onDropItem={dropIn(col)} className="flex-1">
      {({ isHover, flash }) => (
        <div
          className="rounded-2xl border-2 p-3 min-h-[160px] transition-colors"
          style={{
            borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
            backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
            borderStyle: "dashed",
          }}
        >
          <div className="text-center font-bold italic text-sm" style={{ color: C.brownText }}>
            {titel}
          </div>
          <div className="text-center text-[10px] mb-2" style={{ color: C.brown }}>
            {sub}
          </div>
          <div className="flex flex-col gap-1.5">
            {R2B_KAARTJES.filter((k) => placed[k.id] === col).map((k) => (
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

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 2: Aansluiten — onderdruk of overdruk?"
        intro="Eerst de juiste leiding kiezen. Daarna het verschil tussen onderdruk en overdruk."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Materiaal">RVS-systeem? Dan ook een RVS-leiding. Anders gaat het roesten (galvanische corrosie).</UitlegItem>
        <UitlegItem term="Merk">alles van dezelfde fabrikant. Afdichtingen en maten van een ander merk passen net niet — lekkage.</UitlegItem>
        <UitlegItem term="Onderdruk (VR)">natuurlijke trek: warm rookgas stijgt vanzelf op. Dubbele sifon met open verbinding.</UitlegItem>
        <UitlegItem term="Overdruk (HR)">de ventilator duwt het rookgas door het kanaal. Daarom een terugslagklep verplicht.</UitlegItem>
        <p className="text-xs mt-3 italic" style={{ color: C.brown }}>
          Schuif tussen ONDERDRUK en OVERDRUK. Let op de drukmeter, de kier, de klep en de sifons.
        </p>
      </RondeIntro>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 2: Aansluiten — onderdruk of overdruk?
      </h2>
      <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        {stap === 0
          ? aangesloten
            ? "De leiding zit erin — het toestel komt in bedrijf en de stromen starten!"
            : "Stap A: de rookgasleiding ontbreekt nog (stippellijn). Kies de juiste leiding. Let op: de schacht is van RVS!"
          : opdracht
            ? "Sorteer de eigenschappen. De schuif blijft werken — kijk goed naar de tekening."
            : "Stap B: zet de schuif op ONDERDRUK en op OVERDRUK en kijk wat er verandert: de drukmeter, de kier in de wand, de terugslagklep en de sifons."}
      </p>

      {stap === 0 && (
        <>
          <div className="relative w-full" style={{ maxWidth: 520 }}>
            <DrukSysteemSVG modus="onderdruk" aangesloten={aangesloten} />
            {!aangesloten && (
              <DropTarget
                id="leiding-gat-v"
                onDropItem={dropMateriaal}
                className="absolute"
                style={{ left: `${(78 / 520) * 100}%`, top: `${(126 / 400) * 100}%`, width: `${(34 / 520) * 100}%`, height: `${(32 / 400) * 100}%` }}
              >
                {({ isHover, flash }) => (
                  <div
                    className="w-full h-full rounded-xl border-2 transition-colors"
                    style={{
                      borderStyle: "dashed",
                      borderColor: flash === "wrong" ? C.red : isHover ? C.olive : "transparent",
                      backgroundColor: flash === "wrong" ? "rgba(192,57,43,0.2)" : isHover ? "rgba(92,107,46,0.15)" : "transparent",
                    }}
                  />
                )}
              </DropTarget>
            )}
            {!aangesloten && (
              <DropTarget
                id="leiding-gat"
                onDropItem={dropMateriaal}
                className="absolute"
                style={{ left: `${(80 / 520) * 100}%`, top: `${(94 / 400) * 100}%`, width: `${(310 / 520) * 100}%`, height: `${(34 / 400) * 100}%` }}
              >
                {({ isHover, flash }) => (
                  <div
                    className="w-full h-full rounded-full border-2 transition-colors flex items-center justify-center text-[10px] font-bold"
                    style={{
                      borderStyle: "dashed",
                      borderColor: flash === "wrong" ? C.red : isHover ? C.olive : "transparent",
                      backgroundColor: flash === "wrong" ? "rgba(192,57,43,0.2)" : isHover ? "rgba(92,107,46,0.15)" : "transparent",
                      color: C.brown,
                    }}
                  >
                    sleep de juiste leiding hierheen
                  </div>
                )}
              </DropTarget>
            )}
          </div>

          {hint && (
            <p className="text-xs text-center italic mb-2 mt-1 font-medium max-w-md" style={{ color: C.red }}>
              {hint}
            </p>
          )}

          {!aangesloten && (
            <div className="flex gap-4 mt-3">
              {MATERIALEN.map((mat) => (
                <Draggable key={mat.id} payload={mat.id} ghost={<LeidingKaart mat={mat} />}>
                  <LeidingKaart mat={mat} />
                </Draggable>
              ))}
            </div>
          )}
        </>
      )}

      {stap === 1 && (
        <>
          <div className="flex flex-col lg:flex-row gap-6 w-full max-w-3xl items-center lg:items-start">
            <div className="w-full max-w-md">
              <div
                className="rounded-xl px-4 py-2 mb-2 text-center font-bold italic border-2"
                style={{ backgroundColor: modus === "onderdruk" ? C.oliveLight : "#FFF0D6", borderColor: C.brownText, color: C.brownText }}
              >
                {modus === "onderdruk" ? "Concentrisch CLV met onderdruk (VR)" : "Concentrisch CLV met overdruk (HR)"}
              </div>
              <DrukSysteemSVG modus={modus} labels={!opdracht} />
            </div>
            <div className="flex flex-col gap-3 items-center lg:pt-14">
              <DrukSchuif modus={modus} onChange={handleModus} />
              {!opdracht && (
                <ul className="text-xs max-w-[230px] flex flex-col gap-1.5 italic" style={{ color: C.brown }}>
                  {modus === "onderdruk" ? (
                    <>
                      <li>• Natuurlijke trek: warme rookgassen stijgen vanzelf op</li>
                      <li>• Druk in het kanaal is lager dan in de luchttoevoer (NPR 3378-40)</li>
                      <li>• Dubbele sifon in serie met open verbinding</li>
                    </>
                  ) : (
                    <>
                      <li>• De ventilator van het toestel zet druk op het kanaal</li>
                      <li>• Druk in het kanaal is hoger dan in de woning — terugslagklep verplicht</li>
                      <li>• Aparte condens- en regenwatersifon per kanaal, max. 2 toestellen per verdieping</li>
                    </>
                  )}
                </ul>
              )}
              {!bothSeen && (
                <p className="text-xs font-bold" style={{ color: C.olive }}>
                  Bekijk ook de andere stand →
                </p>
              )}
              {bothSeen && !opdracht && (
                <GameButton onClick={() => setOpdracht(true)}>Naar de mini-opdracht</GameButton>
              )}
            </div>
          </div>

          {opdracht && (
            <div className="w-full max-w-3xl mt-5">
              <div className="text-sm font-bold italic mb-2 text-center" style={{ color: C.brownText }}>
                Mini-opdracht: sleep elke eigenschap naar het juiste systeem
              </div>
              <div className="flex gap-4 mb-3 flex-col sm:flex-row">
                {kolom("onderdruk", "Onderdruk-CLV", "natuurlijke trek (VR)")}
                {kolom("overdruk", "Overdruk-CLV", "ventilatordruk (HR)")}
              </div>
              {hint && (
                <p className="text-xs text-center italic mb-2 font-medium" style={{ color: C.red }}>
                  {hint}
                </p>
              )}
              <div className="flex gap-2 flex-wrap justify-center">
                {R2B_KAARTJES.filter((k) => !placed[k.id]).map((k) => (
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
        </>
      )}
    </div>
  );
}

// ─── RONDE 3: CONTROLEREN EN IN BEDRIJF STELLEN ───

// Oplevering via klik-op-locatie: de speler loopt de installatie langs.
// Per hotspot kiest hij wat je daar controleert; op 2 plekken is het juiste
// antwoord dat er niets te controleren valt. Posities in de 280x400-viewBox.
const HOTSPOTS = [
  {
    id: "typeplaat", x: 48, y: 141, echt: true, naam: "Typeplaat op het toestel",
    opties: ["Past het toesteltype (C43) bij dit CLV-systeem?", "Hangt de typeplaat recht?", "Hier hoef je niets te controleren"],
    correct: 0,
    uitleg: "Op de typeplaat staat de toestelcode. Die moet passen bij dit CLV-systeem.",
    aandacht: "Controleer op de typeplaat of de toestelcode past bij het CLV-systeem",
  },
  {
    id: "klep", x: 118, y: 70, echt: true, naam: "Rookgasafvoerleiding",
    opties: [
      "Zit de leiding goed vast en is de verbinding luchtdicht?",
      "Is de terugslagklep aanwezig en gemonteerd?",
      "Hier hoef je niets te controleren",
    ],
    correct: 0,
    uitleg: "De aansluiting controleer je altijd op dichtheid. Een terugslagklep is hier niet verplicht: die hoort bij overdruk, en dit C43-toestel werkt op onderdruk.",
    aandacht: "Controleer de aansluitleiding op dichtheid; een terugslagklep hoort alleen bij overdruk",
  },
  {
    id: "luik", x: 160, y: 256, echt: true, naam: "Schachtwand onderin",
    opties: ["Is het inspectieluik min. 50x50 cm en bereikbaar?", "Zit het luik goed op slot?", "Hier hoef je niets te controleren"],
    correct: 0,
    uitleg: "Min. 50x50 cm en max. 50 cm van het systeem (NPR 3378-40, art. 5.1.5).",
    aandacht: "Het inspectieluik is minimaal 50 x 50 cm en moet bereikbaar zijn",
  },
  {
    id: "sifon", x: 228, y: 338, echt: true, naam: "Condensafvoer",
    opties: ["Werkt de afvoer en zijn beide sifons gevuld?", "Zijn de sifons leeg en droog?", "Hier hoef je niets te controleren"],
    correct: 0,
    uitleg: "Beide sifons gevuld met water. Anders komt er rookgas of rioolgas door.",
    aandacht: "Beide sifons moeten met water gevuld zijn, anders komt er rookgas of rioolgas door",
  },
  {
    id: "plaat", x: 97, y: 257, echt: true, naam: "Plaat bij het inspectieluik",
    opties: ["Is de schoorsteenplaat aanwezig met de juiste gegevens?", "Is de plaat mooi gepoetst?", "Hier hoef je niets te controleren"],
    correct: 0,
    uitleg: "De schoorsteenplaat vermeldt de gegevens van het systeem en de installateur, en moet aanwezig en leesbaar zijn.",
    aandacht: "De schoorsteenplaat met de systeemgegevens moet aanwezig en leesbaar zijn",
  },
  {
    id: "melder", x: 50, y: 30, echt: true, naam: "Plafond van de opstellingsruimte",
    opties: ["Hangt er een CO-melder in de opstellingsruimte?", "Hangt er een lamp met genoeg licht?", "Hier hoef je niets te controleren"],
    correct: 0,
    uitleg: "Een CO-melder waarschuwt als er toch koolmonoxide vrijkomt.",
    aandacht: "In de opstellingsruimte hoort een CO-melder te hangen",
  },
  {
    id: "loosleiding", x: 46, y: 94, echt: false, naam: "De leiding zelf",
    opties: ["De kleur van de leiding beoordelen", "De leiding opnieuw verven", "Hier hoef je bij de oplevering niets te controleren"],
    correct: 2,
    uitleg: "De kleur van de leiding zegt niets. Dit hoort niet bij de oplevering.",
    aandacht: "Bij de oplevering controleer je alleen wat de norm voorschrijft, geen kleur of uiterlijk",
  },
  {
    id: "loosvlam", x: 60, y: 185, echt: false, naam: "De brander in het toestel",
    opties: ["De cv-druk bij de buren controleren", "De brander alvast bijstellen", "Hier hoef je bij de oplevering niets te controleren"],
    correct: 2,
    uitleg: "De brander en de buren horen niet bij de oplevering van het CLV-systeem.",
    aandacht: "De brander en de installatie van de buren horen niet bij deze oplevering",
  },
];

function ControleSVG({ checked, running, onderhoudStap = 0 }) {
  const hl = (id) => (checked.includes(id) ? C.green : C.brownText);
  const fillOk = (id) => (checked.includes(id) ? C.greenLight : "white");
  const flow = { strokeDasharray: "8 6", animation: "flowDash 0.8s linear infinite" };
  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };
  // onderhoudsbeurt: de tekening bouwt mee met de gesleepte stappen
  const s = onderhoudStap;
  const luikOpen = s >= 1 && s < 6;
  const dekselsOpen = s >= 2 && s < 5;
  const dekselsZichtbaar = s >= 2;
  const reinigen = s === 4;

  return (
    <svg viewBox="0 0 280 400" className="w-full h-auto select-none">
      <defs>
        <pattern id="hatchM3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={C.brownText} strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* vloer (met sparing voor de rioolaansluiting) */}
      <rect x="8" y="370" width="232" height="12" fill="url(#hatchM3)" stroke={C.brownText} strokeWidth="1.5" />

      {/* schachtwanden (doorsnede, zoals de NEN-figuur) */}
      <rect x="160" y="20" width="8" height="350" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      <rect x="208" y="20" width="8" height="350" fill={C.beigeMid} stroke={C.brownText} strokeWidth="2" />
      {/* binnenste rookgaskanaal + opvangbak */}
      <line x1="180" y1="20" x2="180" y2="300" stroke={C.brownText} strokeWidth="2" />
      <line x1="196" y1="20" x2="196" y2="300" stroke={C.brownText} strokeWidth="2" />
      <path d="M178 300 H198 V308 Q198 316 188 316 Q178 316 178 308 Z" fill="white" stroke={C.brownText} strokeWidth="2" />
      {/* drukvereffeningsopeningen onderin */}
      {[176, 188, 200].map((cx) => (
        <circle key={cx} cx={cx} cy="352" r="3.5" fill="none" stroke={C.brownText} strokeWidth="1.5" />
      ))}
      {running && (
        <>
          <path d="M188 296 L188 26" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" style={flow} />
          <path d="M173 30 L173 280" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" style={flowDown} />
          <path d="M203 30 L203 280" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" style={flowDown} />
        </>
      )}

      {/* schoorsteenplaat: typeplaat nabij het inspectieluik (C(10)-voorschriften, 7.2) */}
      <rect x="76" y="246" width="42" height="22" fill={fillOk("plaat")} stroke={hl("plaat")} strokeWidth={checked.includes("plaat") ? 3 : 2} />
      <line x1="82" y1="253" x2="112" y2="253" stroke={hl("plaat")} strokeWidth="1.5" />
      <line x1="82" y1="260" x2="104" y2="260" stroke={hl("plaat")} strokeWidth="1.5" />

      {/* CO-melder in de opstellingsruimte */}
      <circle cx="50" cy="30" r="11" fill={fillOk("melder")} stroke={hl("melder")} strokeWidth={checked.includes("melder") ? 3 : 2} />
      <circle cx="50" cy="30" r="4" fill={hl("melder")} />
      <text x="50" y="54" fontSize="7.5" fontWeight="600" fill={C.brown} textAnchor="middle">CO-melder</text>

      {/* parallelle aansluiting: rookgasafvoer naar het binnenkanaal, lucht naar de ringspleet */}
      <path d="M46 112 V70 H182" fill="none" stroke={C.brownText} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M46 112 V70 H182" fill="none" stroke="#B7BFC4" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
      {running && <path d="M46 106 V70 H188" fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round" style={flow} />}
      <ellipse cx="182" cy="70" rx="3.5" ry="9" fill="white" stroke={C.brownText} strokeWidth="2" />
      <path d="M170 92 H74 V112" fill="none" stroke={C.brownText} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M170 92 H74 V112" fill="none" stroke="#B7BFC4" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
      {running && <path d="M172 92 H74 V106" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round" style={flowDown} />}
      <ellipse cx="170" cy="92" rx="3.5" ry="9" fill="white" stroke={C.brownText} strokeWidth="2" />
      {/* koppeling in de rookgasafvoerleiding (controlepunt: zit de verbinding goed dicht? geen terugslagklep — dit is onderdruk) */}
      <rect x="111" y="62" width="14" height="16" rx="2" fill={fillOk("klep")} stroke={hl("klep")} strokeWidth={checked.includes("klep") ? 3 : 2} />

      {/* toestel met aparte stubs (rookgas links, lucht rechts) + typeplaat + vlam */}
      <rect x="38" y="108" width="16" height="12" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="66" y="108" width="16" height="12" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="20" y="120" width="80" height="100" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="30" y="132" width="36" height="18" fill={fillOk("typeplaat")} stroke={hl("typeplaat")} strokeWidth={checked.includes("typeplaat") ? 2.5 : 1.5} />
      <text x="48" y="144" fontSize="7" fontWeight="700" fill={C.brownText} textAnchor="middle">C43</text>
      <circle cx="60" cy="185" r="11" fill="none" stroke={running ? C.red : C.beigeMid} strokeWidth="2" />
      {running && <path d="M55 188 q5 -12 10 0 q-5 7 -10 0" fill={C.red} opacity="0.8" />}

      {/* bouwkundig inspectieluik in de schachtwand (opent tijdens de onderhoudsbeurt) */}
      {luikOpen ? (
        <>
          <rect x="152" y="240" width="16" height="32" fill="#3B1E0A" stroke={C.brownText} strokeWidth="2" />
          <g transform="rotate(-70 152 240)">
            <rect x="152" y="240" width="6" height="32" fill="white" stroke={C.brownText} strokeWidth="1.5" />
          </g>
        </>
      ) : (
        <>
          <rect x="152" y="240" width="16" height="32" fill={fillOk("luik")} stroke={hl("luik")} strokeWidth={checked.includes("luik") ? 3 : 2} />
          <line x1="155" y1="246" x2="165" y2="246" stroke={hl("luik")} strokeWidth="1.5" />
          <line x1="155" y1="266" x2="165" y2="266" stroke={hl("luik")} strokeWidth="1.5" />
          {s >= 6 && (
            <>
              <circle cx="146" cy="238" r="7" fill={C.green} />
              <path d="M143 238 L145.5 240.5 L149.5 236" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
        </>
      )}

      {/* inspectiedeksels van lucht- en rookgaskanaal (alleen tijdens de onderhoudsbeurt) */}
      {dekselsZichtbaar && (
        <g>
          {[
            { x: 168, y: 284 },
            { x: 184, y: 284 },
          ].map(({ x, y }, i) =>
            dekselsOpen ? (
              <g key={i}>
                <rect x={x} y={y} width="11" height="9" fill="#3B1E0A" stroke={C.brownText} strokeWidth="1.3" />
                <rect x={x - 6} y={y - 7} width="11" height="6" fill="white" stroke={C.brownText} strokeWidth="1.2" transform={`rotate(-25 ${x} ${y})`} />
              </g>
            ) : (
              <g key={i}>
                <rect x={x} y={y} width="11" height="9" fill="white" stroke={C.green} strokeWidth="1.5" />
                <path d={`M${x + 2.5} ${y + 4.5} L${x + 4.5} ${y + 6.5} L${x + 8.5} ${y + 2.5}`} fill="none" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          )}
        </g>
      )}

      {/* reinigen: borstel in het rookgaskanaal */}
      {reinigen && (
        <g>
          <line x1="188" y1="215" x2="188" y2="258" stroke={C.brown} strokeWidth="2.5" strokeLinecap="round" />
          <rect x="182" y="258" width="12" height="16" rx="3" fill={C.olive} stroke={C.oliveDark} strokeWidth="1.5" />
          {[262, 267, 272].map((y) => (
            <line key={y} x1="183" y1={y} x2="193" y2={y} stroke="white" strokeWidth="1" opacity="0.7" />
          ))}
          <g stroke={C.olive} strokeWidth="1.4" strokeLinecap="round" style={{ animation: "pulseGlow 1s ease-in-out infinite" }}>
            <path d="M176 240 l4 4 M180 240 l-4 4" />
            <path d="M198 250 l4 4 M202 250 l-4 4" />
            <path d="M177 290 l4 4 M181 290 l-4 4" />
          </g>
        </g>
      )}

      {/* typeplaat-controle: gele gloed op de schoorsteenplaat */}
      {s === 3 && <rect x="72" y="242" width="50" height="30" fill="#FBBF24" opacity="0.3" rx="4" />}

      {/* condensafvoer (NPR 3378-40/41): opvangbak -> sifon 1 -> open verbinding -> sifon 2 -> riool */}
      <path d="M188 316 V320 H206" fill="none" stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <DrainageTrein x={206} y={320} s={1} stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 2 : 1.7} riool={false} />
      <path d="M243 325 H262 V370" fill="none" stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x="256" y="392" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">riool</text>
    </svg>
  );
}

function schudDrie() {
  const mix = [0, 1, 2];
  for (let i = mix.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mix[i], mix[j]] = [mix[j], mix[i]];
  }
  return mix;
}

function Ronde3({ addScore, onDone, noteer }) {
  const [gestart, setGestart] = useState(false);
  const [klaarHotspots, setKlaarHotspots] = useState([]); // afgeronde hotspot-ids
  const [actief, setActief] = useState(null); // geopende hotspot-id
  const [optieMix, setOptieMix] = useState([0, 1, 2]);
  const [gekozen, setGekozen] = useState(null); // gekozen optie-positie (fout blijft staan)
  const [hint, setHint] = useState(null);
  const [running, setRunning] = useState(false);
  const [fase, setFase] = useState("oplever"); // oplever -> onderhoud
  const [gedaan, setGedaan] = useState([]); // uitgevoerde onderhoudsstappen, op volgorde
  const [kaarten] = useState(() => [...ONDERHOUD_STAPPEN].sort(() => Math.random() - 0.5));
  const gratisFoutOplever = useEersteFoutVrij();
  const gratisFoutStap = useEersteFoutVrij();
  const sluitTimer = useRef(null); // pending sluit-timeout van een goed beantwoorde hotspot

  // groen laten oplichten in de tekening: alleen de echte controlepunten
  const checked = klaarHotspots.filter((id) => HOTSPOTS.find((h) => h.id === id)?.echt);
  const alleGecheckt = klaarHotspots.length === HOTSPOTS.length;
  const onderhoudKlaar = gedaan.length === ONDERHOUD_STAPPEN.length;
  const hotspot = actief ? HOTSPOTS.find((h) => h.id === actief) : null;

  const openHotspot = (id) => {
    if (klaarHotspots.includes(id)) return;
    clearTimeout(sluitTimer.current); // anders sluit de vorige hotspot deze meteen weer
    setActief(id);
    setGekozen(null);
    setHint(null);
    setOptieMix(schudDrie()); // opties schudden bij openen
  };

  const kiesOptie = (pos) => {
    // al afgevinkt: klikken in het 700ms-sluitvenster mag niets meer doen
    if (!hotspot || gekozen === pos || klaarHotspots.includes(hotspot.id)) return;
    setGekozen(pos);
    if (optieMix[pos] === hotspot.correct) {
      playSound("correct");
      addScore(5);
      setKlaarHotspots((prev) => (prev.includes(hotspot.id) ? prev : [...prev, hotspot.id]));
      setHint(null);
      sluitTimer.current = setTimeout(() => {
        setActief(null);
        setGekozen(null);
      }, 700);
    } else {
      const uitleg = hotspot.uitleg;
      noteer(hotspot.aandacht);
      if (gratisFoutOplever()) {
        playSound("wrong");
        setHint(`${uitleg} (deze eerste misser telt niet mee — kies opnieuw)`);
      } else {
        playSound("wrong");
        addScore(-5);
        setHint(`${uitleg} Kies opnieuw.`);
      }
      setTimeout(() => setGekozen(null), 700);
    }
  };

  const startToestel = () => {
    setRunning(true);
    playSound("levelup");
    setTimeout(() => {
      setFase("onderhoud");
      setHint(null);
    }, 2200);
  };

  // onderhoudsbeurt: stappen in de juiste volgorde naar het stappenplan slepen
  const dropStap = (payload, point) => {
    const verwacht = ONDERHOUD_STAPPEN[gedaan.length];
    if (!verwacht || gedaan.includes(payload)) return undefined;
    if (payload === verwacht.id) {
      setGedaan((prev) => [...prev, payload]);
      addScore(5, point);
      setHint(null);
      playSound("drop");
      return "correct";
    }
    const uitleg =
      "Let op de volgorde van de onderhoudsvoorschriften: eerst alles openen (van buiten naar binnen), dan controleren en reinigen, en daarna alles weer terugplaatsen.";
    noteer("Onderhoudsvolgorde: eerst openen van buiten naar binnen, dan reinigen, dan alles terugplaatsen");
    if (gratisFoutStap()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
    return "wrong";
  };

  if (!gestart) {
    return (
      <RondeIntro
        title="Ronde 3: Inbedrijfstellen & Onderhoud"
        intro="Twee taken van de monteur: opleveren en onderhouden."
        onStart={() => setGestart(true)}
      >
        <UitlegItem term="Opleveren">
          loop de installatie langs. Tik op de stippen in de tekening en kies wat je daar controleert.
        </UitlegItem>
        <UitlegItem term="Let op">op sommige plekken hoef je niets te controleren. Trap er niet in.</UitlegItem>
        <UitlegItem term="Onderhoud">
          open van buiten naar binnen, controleer en reinig, sluit daarna alles weer af. In die volgorde.
        </UitlegItem>
        <UitlegItem term="Levensduur">
          een CLV-systeem gaat circa 15 jaar mee. Daarna verouderen materiaal en afdichtingen: controleren, en bij
          twijfel vervangen of een beheerplan opstellen.
        </UitlegItem>
      </RondeIntro>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center p-6">
      <StepBanner step={1} />
      <h2 className="text-xl font-bold italic mb-1" style={{ color: C.brownText }}>
        Ronde 3: Inbedrijfstellen &amp; Onderhoud
      </h2>
      <p className="text-sm mb-4 max-w-lg text-center font-medium" style={{ color: C.brown }}>
        {fase === "oplever"
          ? "Loop de installatie langs: tik op elke stip en kies wat je daar controleert."
          : "Het toestel draait! Nu de onderhoudsbeurt van het CLV-systeem zelf: sleep de onderhoudsvoorschriften in de juiste volgorde naar het stappenplan. Kijk mee in de tekening."}
      </p>

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        {fase === "oplever" ? (
          /* oplevering: vraagpanel naast de tekening */
          <div className="flex-1 w-full">
            <div className="rounded-2xl border-2 p-3 mb-3" style={{ backgroundColor: C.bgCard, borderColor: C.brownText }}>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
                <span className="font-bold italic text-sm" style={{ color: C.brownText }}>
                  Oplevering — {klaarHotspots.length}/{HOTSPOTS.length} locaties gecheckt
                </span>
              </div>
              {!hotspot ? (
                <p className="text-xs italic" style={{ color: C.brown }}>
                  {alleGecheckt
                    ? "Alle locaties gecheckt. Stel het toestel in bedrijf!"
                    : "Tik op een pulserende stip in de tekening om die plek te controleren."}
                </p>
              ) : (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: C.olive }}>
                    {hotspot.naam}
                  </p>
                  <p className="text-sm font-bold italic mb-2" style={{ color: C.brownText }}>
                    Wat doe je hier?
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {optieMix.map((optIdx, pos) => (
                      <button
                        key={pos}
                        onClick={() => kiesOptie(pos)}
                        className="text-left px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all"
                        style={{
                          backgroundColor:
                            gekozen === pos
                              ? optIdx === hotspot.correct
                                ? C.greenLight
                                : C.redLight
                              : "white",
                          borderColor:
                            gekozen === pos ? (optIdx === hotspot.correct ? C.green : C.red) : C.beigeMid,
                          color: C.brownText,
                        }}
                      >
                        {hotspot.opties[optIdx]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* afgeronde punten */}
            {klaarHotspots.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {klaarHotspots.map((id) => {
                  const h = HOTSPOTS.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="rounded-lg px-2 py-1 text-[10px] font-semibold border flex items-center gap-1"
                      style={{ backgroundColor: C.greenLight, borderColor: C.green, color: C.green }}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {h?.naam}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* onderhoudsbeurt: stappenplan in de juiste volgorde */
          <div className="flex-1 w-full">
            <DropTarget id="stappenplan" onDropItem={dropStap}>
              {({ isHover, flash }) => (
                <div
                  className="rounded-2xl border-2 p-3 mb-3 min-h-[150px] transition-colors"
                  style={{
                    borderStyle: "dashed",
                    borderColor: flash === "wrong" ? C.red : isHover ? C.olive : C.brownText,
                    backgroundColor: flash === "wrong" ? C.redLight : isHover ? C.oliveLight : C.bgCard,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck className="w-4 h-4" style={{ color: C.olive }} />
                    <span className="font-bold italic text-sm" style={{ color: C.brownText }}>
                      Stappenplan onderhoudsbeurt ({gedaan.length}/{ONDERHOUD_STAPPEN.length})
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {gedaan.map((id, i) => {
                      const stapInfo = ONDERHOUD_STAPPEN.find((s) => s.id === id);
                      return (
                        <div
                          key={id}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border-2 flex items-center gap-2"
                          style={{ backgroundColor: "white", borderColor: C.green, color: C.green }}
                        >
                          <span
                            className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                            style={{ backgroundColor: C.green }}
                          >
                            {i + 1}
                          </span>
                          {stapInfo?.label}
                        </div>
                      );
                    })}
                    {!onderhoudKlaar && (
                      <div
                        className="rounded-lg px-2.5 py-1.5 text-xs italic border-2 border-dashed"
                        style={{ borderColor: C.beigeMid, color: C.brown }}
                      >
                        {gedaan.length + 1}. Sleep hier de volgende stap heen...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DropTarget>

            <div className="flex flex-col gap-1.5">
              {kaarten
                .filter((s) => !gedaan.includes(s.id))
                .map((s) => (
                  <Draggable key={s.id} payload={s.id} ghost={<DragCard label={s.label} small />}>
                    <div
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold border-2 bg-white"
                      style={{ borderColor: C.beigeMid, color: C.brownText }}
                    >
                      {s.label}
                    </div>
                  </Draggable>
                ))}
            </div>
          </div>
        )}

        {/* tekening (met hotspots tijdens de oplevering) */}
        <div className="w-full max-w-[280px] mx-auto md:w-[260px] shrink-0 relative">
          <ControleSVG checked={checked} running={running} onderhoudStap={fase === "onderhoud" ? gedaan.length : 0} />
          {fase === "oplever" &&
            HOTSPOTS.map((h) => {
              const klaar = klaarHotspots.includes(h.id);
              const isActief = actief === h.id;
              return (
                <button
                  key={h.id}
                  onClick={() => openHotspot(h.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(h.x / 280) * 100}%`, top: `${(h.y / 400) * 100}%`, width: 26, height: 26 }}
                  aria-label={h.naam}
                >
                  {!klaar && (
                    <span
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ backgroundColor: isActief ? C.olive : C.red, opacity: 0.35 }}
                    />
                  )}
                  <span
                    className="absolute inset-1 rounded-full border-2 flex items-center justify-center text-[11px] font-bold text-white"
                    style={{
                      backgroundColor: klaar ? C.green : isActief ? C.olive : C.red,
                      borderColor: "white",
                    }}
                  >
                    {klaar ? "✓" : "?"}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {hint && (
        <p className="text-xs text-center italic mt-2 font-medium max-w-md" style={{ color: C.red }}>
          {hint}
        </p>
      )}

      <div className="mt-4">
        {fase === "oplever" &&
          (running ? (
            <p className="text-sm font-bold italic" style={{ color: C.green }}>
              Het toestel start op... rookgasafvoer loopt — alles in orde!
            </p>
          ) : (
            <GameButton onClick={startToestel} disabled={!alleGecheckt} variant="green">
              <Power className="w-4 h-4" />
              Toestel in bedrijf stellen
            </GameButton>
          ))}
        {fase === "onderhoud" && onderhoudKlaar && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-bold italic" style={{ color: C.green }}>
              Onderhoudsbeurt compleet — het systeem is schoon en weer netjes afgesloten!
            </p>
            <GameButton onClick={onDone} variant="green">
              Naar de controlevraag
            </GameButton>
          </div>
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

// Kernpunten van deze game: staan altijd op het eindscherm, ook bij een foutloos spel.
const LEERMOMENTEN = [
  "Sluit bij demontage beide aansluitstompen direct af met een afsluitkap",
  "Rookgas bevat koolmonoxide (CO): recirculatie is levensgevaarlijk",
  "Een terugslagklep is verplicht bij overdruk, niet bij onderdruk",
  "Op een RVS-systeem hoort een RVS-leiding van hetzelfde merk",
  "Onderhoud: openen van buiten naar binnen, reinigen, en alles weer afsluiten",
];

export default function CLVMonteurGame({ initialScreen = "start", onExit }) {
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
            <IntroScreen title="Missie: de monteur" buttonText="Aan de slag" onNext={() => setScreen("r1")}>
              <div className="leading-relaxed" style={{ color: C.brownText }}>
                <p className="mb-2">
                  Jij bent de monteur. Een CLV-systeem heeft meerdere toestellen op 1 kanaal. Dat vraagt om opletten.
                </p>
                <p>Je leert recirculatie voorkomen, een toestel aansluiten en het systeem controleren.</p>
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
              text="Je kunt nu een toestel veilig aansluiten en controleren op een CLV-systeem!"
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
