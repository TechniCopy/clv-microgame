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
  DrainageTrein,
  playSound,
} from "./shared.jsx";

const MAX_SCORE = 145;

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
  },
  {
    question: "Een HR-toestel wordt aangesloten op een CLV-kanaal op overdruk. Wat moet er in het toestel aanwezig zijn om rookgas-recirculatie te voorkomen?",
    options: ["Een rookgaskeerklep (terugslagklep)", "Een TTB (thermische terugslagbeveiliging)", "Een rookgasdop", "Een rookgassensor"],
    correct: 0,
    feedbackCorrect: "Correct! Bij overdruk-CLV is een terugslagklep verplicht, gekeurd samen met het toestel (voorschriften CLV C(10)-toepassingen, bijlage D).",
    feedbackWrong: "Bij overdruk-CLV is de rookgaskeerklep (terugslagklep) verplicht. Een TTB is iets anders: die meet temperatuur bij open toestellen.",
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
  },
];

const POOL_R2 = [
  {
    question: "Je sluit een nieuw toestel aan op een bestaand inpandig RVS CLV-systeem. Met welk materiaal mag de verbindingsleiding worden gemaakt?",
    options: ["RVS", "Kunststof", "Dikwandig aluminium", "Dunwandig aluminium"],
    correct: 0,
    feedbackCorrect: "Correct! Bij een RVS-systeem alleen RVS gebruiken — anders ontstaat galvanische corrosie en verschil in uitzetting.",
    feedbackWrong: "Op een bestaand RVS-systeem mag je geen ander materiaal combineren. Alleen RVS.",
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
  },
];

const POOL_R3 = [
  {
    question: "Wat is de minimale afmeting van het inspectieluik bij een CLV-systeem?",
    options: ["50 x 50 cm", "30 x 30 cm", "60 x 60 cm", "100 x 100 cm"],
    correct: 0,
    feedbackCorrect: "Klopt! Minimaal 50 x 50 cm, brandwerend, en maximaal 50 cm van het hart van het CLV-systeem (NPR 3378-40, art. 5.1.5).",
    feedbackWrong: "Het inspectieluik moet minimaal 50 x 50 cm zijn, zodat het systeem goed bereikbaar en inspecteerbaar blijft (NPR 3378-40, art. 5.1.5).",
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

function RecircSVG({ closed }) {
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

      {/* open rookgasstomp: rookgas (CO) stroomt de woning in */}
      {!closed.rookgas && (
        <>
          <path d="M410 139 L364 139 L300 139 Q250 139 235 160 Q225 175 240 190" fill="none" stroke={C.red} strokeWidth="4" style={flow} opacity="0.9" />
          <path d="M232 184 L240 196 L248 186" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {/* open luchtstomp: hier blaast alleen lucht uit het toevoerkanaal */}
      {!closed.lucht && (
        <>
          <path d="M403 179 L364 179 L324 179" fill="none" stroke="#3B82F6" strokeWidth="3" style={flowSlow} opacity="0.8" />
          <path d="M332 174 L322 179 L332 184" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {/* gevaarwolkjes in de bovenwoning (alleen door het rookgas) */}
      {!closed.rookgas && (
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
  const [gestart, setGestart] = useState(false);
  const [closed, setClosed] = useState({ rookgas: false, lucht: false });
  const [kappenOver, setKappenOver] = useState(2);
  const [hint, setHint] = useState(null);
  const [co, setCo] = useState(0);
  const gratisFout = useEersteFoutVrij();
  const closedRef = useRef(closed);
  useEffect(() => {
    closedRef.current = closed;
  }, [closed]);

  const bothClosed = closed.rookgas && closed.lucht;

  // CO komt alleen uit de open rookgasstomp: de meter loopt op zolang die
  // open staat, en daalt zodra hij is afgedopt (de luchtstomp geeft geen CO)
  useEffect(() => {
    const timer = setInterval(() => {
      setCo((prev) => {
        const open = !closedRef.current.rookgas;
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
        <UitlegItem term="Bij demontage">de stompen staan open. Dop ze allebei (rookgas en lucht) meteen af.</UitlegItem>
        <p className="text-xs mt-3 italic" style={{ color: C.brown }}>
          Kijk hoe het rookgas binnenstroomt en de CO-meter oploopt. Stop het op tijd.
        </p>
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
  // toestel links (afvoer bovenop), schachtstomp rechts; horizontale leiding ~3 m
  const leidingY = 88;
  // positief afschot = leiding loopt af richting het toestel (linkerkant lager)
  const leftY = leidingY + afschot * 2.2;
  const pipeAt = (x) => leftY + (leidingY - leftY) * ((x - 132) / (408 - 132));
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

      {/* toestel links, met de rookgasaansluiting bovenop */}
      <rect x="50" y="140" width="76" height="94" fill="white" stroke={C.brownText} strokeWidth="2.5" />
      <circle cx="88" cy="184" r="13" fill="none" stroke={C.red} strokeWidth="2" />
      <path d="M82 188 q6 -14 12 0 q-6 8 -12 0" fill={C.red} opacity="0.7" />
      <text x="88" y="222" fontSize="9" fontWeight="700" fill={C.brownText} textAnchor="middle">HR-KETEL</text>
      {/* aansluitstub bovenop het toestel */}
      <rect x="79" y="126" width="18" height="14" fill="white" stroke={C.brownText} strokeWidth="2.5" />

      {/* leiding (na stap A): bocht omhoog vanaf de ketel + horizontaal deel met afschot */}
      {stap > 0 && (
        <g>
          {/* bocht van de aansluitstub naar de horizontale leiding */}
          <path d={`M88 136 V${leftY} H134`} fill="none" stroke={C.brownText} strokeWidth="20" strokeLinejoin="round" strokeLinecap="round" />
          <path d={`M88 136 V${leftY} H134`} fill="none" stroke="#B7BFC4" strokeWidth="15" strokeLinejoin="round" strokeLinecap="round" />
          {/* horizontale leiding (linkerkant zakt mee met het afschot) */}
          <polygon
            points={`132,${leftY - 9} 408,${leidingY - 9} 408,${leidingY + 9} 132,${leftY + 9}`}
            fill="#B7BFC4"
            stroke={C.brownText}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <line x1="142" y1={leftY - 3 + (leidingY - leftY) * (10 / 276)} x2="396" y2={leidingY - 3 - (leidingY - leftY) * (12 / 276)} stroke="white" strokeWidth="2.5" opacity="0.7" />
          {/* beugels op de leiding */}
          {beugels.map((pos) => {
            const bx = 128 + pos * 93.3;
            const by = pipeAt(bx);
            return (
              <g key={pos}>
                <rect x={bx - 5} y={by - 16} width="10" height="8" rx="2" fill={C.olive} stroke={C.oliveDark} strokeWidth="1.5" />
                <line x1={bx} y1={by - 16} x2={bx} y2={by - 26} stroke={C.oliveDark} strokeWidth="3" />
              </g>
            );
          })}
        </g>
      )}
      {stap === 0 && (
        <g>
          <path d={`M88 136 V${leidingY} H132`} fill="none" stroke={C.beigeMid} strokeWidth="2.5" strokeDasharray="8 6" />
          <rect x="132" y={leidingY - 9} width="276" height="18" rx="9" fill="none" stroke={C.beigeMid} strokeWidth="2.5" strokeDasharray="8 6" />
        </g>
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

// ─── STAP B: DE DRUKVERKENNER (onderdruk vs overdruk) ───

const R2B_KAARTJES = [
  { id: "d1", label: "Werkt op natuurlijke trek", col: "onderdruk" },
  { id: "d2", label: "De ventilator van het toestel zet druk op het kanaal", col: "overdruk" },
  { id: "d3", label: "Terugslagklep in het toestel verplicht", col: "overdruk" },
  { id: "d4", label: "Dubbele sifon in serie met open verbinding", col: "onderdruk" },
  { id: "d5", label: "Aparte condens- en regenwatersifon per kanaal", col: "overdruk" },
  { id: "d6", label: "Maximaal 2 toestellen per verdieping", col: "overdruk" },
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

function DrukSysteemSVG({ modus }) {
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

      {/* stromen */}
      <path d="M390 316 L390 16" fill="none" stroke={C.red} strokeWidth={over ? 5 : 3.5} strokeLinecap="round" style={flowUp} />
      <path d="M385 14 L390 4 L395 14" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M364 26 L364 350" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
      <path d="M416 26 L416 350" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" style={flowDown} />
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
          x2={over ? 484 : 466}
          y2="69"
          stroke={over ? C.red : "#3B82F6"}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="475" cy="80" r="2.5" fill={C.brownText} />
        <text x="475" y="110" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">druk in</text>
        <text x="475" y="120" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">het kanaal</text>
      </g>

      {/* parallelle aansluiting: aparte rookgasafvoer- en luchttoevoerleiding */}
      {/* rookgasafvoerleiding: van het toestel naar het BINNENKANAAL */}
      <path d="M95 160 V110 H380" fill="none" stroke={C.brownText} strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M95 160 V110 H380" fill="none" stroke="#B7BFC4" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M95 154 V110 H386" fill="none" stroke={C.red} strokeWidth="2.2" strokeLinecap="round" style={flowUp} />
      <ellipse cx="380" cy="110" rx="4" ry="10" fill="white" stroke={C.brownText} strokeWidth="2" />
      <text x="165" y="101" fontSize="8" fontWeight="600" fill={C.brown}>rookgasafvoer</text>
      {/* luchttoevoerleiding: van de RINGSPLEET naar het toestel */}
      <path d="M362 140 H120 V160" fill="none" stroke={C.brownText} strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M362 140 H120 V160" fill="none" stroke="#B7BFC4" strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M364 140 H120 V154" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round" style={flowDown} />
      <ellipse cx="362" cy="140" rx="4" ry="10" fill="white" stroke={C.brownText} strokeWidth="2" />
      <text x="165" y="157" fontSize="8" fontWeight="600" fill={C.brown}>luchttoevoer</text>

      {/* terugslagklep in de rookgasafvoer: alleen verplicht (en getoond) bij overdruk */}
      {over && (
        <g>
          <circle cx="240" cy="110" r="9" fill={C.greenLight} stroke={C.green} strokeWidth="2.5" />
          <line x1="235" y1="115" x2="245" y2="105" stroke={C.green} strokeWidth="2.5" />
          <text x="240" y="92" fontSize="8.5" fontWeight="700" fill={C.green} textAnchor="middle">terugslagklep verplicht</text>
        </g>
      )}

      {/* aansluitstubs bovenop het toestel: rookgas (links) en lucht (rechts) */}
      <rect x="86" y="158" width="18" height="12" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="111" y="158" width="18" height="12" fill="white" stroke={C.brownText} strokeWidth="2" />
      <rect x="60" y="170" width="90" height="100" fill="white" stroke={C.brownText} strokeWidth="2.5" />
      {/* vlam */}
      <circle cx="88" cy="225" r="10" fill="none" stroke={C.red} strokeWidth="2" />
      <path d="M83 228 q5 -12 10 0 q-5 7 -10 0" fill={C.red} opacity="0.7" />
      {/* ventilator (draait bij overdruk) */}
      <circle cx="124" cy="200" r="11" fill="white" stroke={C.brownText} strokeWidth="2" />
      <g
        stroke={over ? C.red : C.beigeMid}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={over ? { transformOrigin: "124px 200px", animation: "spinFan 0.7s linear infinite" } : undefined}
      >
        <line x1="124" y1="200" x2="124" y2="192" />
        <line x1="124" y1="200" x2="131" y2="204" />
        <line x1="124" y1="200" x2="117" y2="204" />
      </g>
      <text x="105" y="258" fontSize="9" fontWeight="700" fill={C.brownText} textAnchor="middle">
        {over ? "HR-KETEL" : "VR-KETEL"}
      </text>

      {/* kier in de schachtwand: wat gebeurt er bij een lek? */}
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
          <text x="466" y="333" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">2 sifons in serie</text>
          <text x="466" y="342" fontSize="7.5" fontWeight="600" fill={C.brown} textAnchor="middle">+ open verbinding</text>
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
          <text x="382" y="336" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">condens-</text>
          <text x="382" y="345" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">sifon</text>
          <text x="460" y="336" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">regenwater-</text>
          <text x="460" y="345" fontSize="8" fontWeight="700" fill={C.brownText} textAnchor="middle">sifon</text>
        </>
      )}

      {/* max 2 toestellen per verdieping (alleen overdruk, C(10)-voorschriften hfst. 8) */}
      {over && (
        <text x="20" y="60" fontSize="9" fontWeight="700" fill={C.brownText}>
          max. 2 toestellen per verdieping
        </text>
      )}
    </svg>
  );
}

function Ronde2({ addScore, onDone }) {
  const [gestart, setGestart] = useState(false);
  const [stap, setStap] = useState(0); // 0 = materiaalkeuze, 1 = drukverkenner
  const [hint, setHint] = useState(null);
  const [modus, setModus] = useState("onderdruk");
  const [seen, setSeen] = useState({ onderdruk: true, overdruk: false });
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
      setTimeout(() => setStap(1), 700);
      playSound("drop");
      return "correct";
    }
    const uitleg = `${mat.label} mag hier niet: de schacht is RVS. Twee verschillende metalen of materialen geven galvanische corrosie en verschil in uitzetting.`;
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
          ? "Stap A: kies (sleep of tik) de juiste leiding. Let op: de schacht is van RVS!"
          : "Stap B: zet de schuif op ONDERDRUK en op OVERDRUK en kijk wat er verandert: de drukmeter, de kier in de wand, de terugslagklep en het aantal sifons."}
      </p>

      {stap === 0 && (
        <>
          <div className="relative w-full" style={{ maxWidth: 520 }}>
            <AansluitSVG stap={0} afschot={0} beugels={[]} />
            <DropTarget
              id="leiding-gat"
              onDropItem={dropMateriaal}
              className="absolute"
              style={{ left: `${(128 / 520) * 100}%`, top: `${(63 / 260) * 100}%`, width: `${(280 / 520) * 100}%`, height: `${(34 / 260) * 100}%` }}
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
          </div>

          {hint && (
            <p className="text-xs text-center italic mb-2 mt-1 font-medium max-w-md" style={{ color: C.red }}>
              {hint}
            </p>
          )}

          <div className="flex gap-4 mt-3">
            {MATERIALEN.map((mat) => (
              <Draggable key={mat.id} payload={mat.id} ghost={<LeidingKaart mat={mat} />}>
                <LeidingKaart mat={mat} />
              </Draggable>
            ))}
          </div>
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
              <DrukSysteemSVG modus={modus} />
            </div>
            <div className="flex flex-col gap-3 items-center lg:pt-14">
              <DrukSchuif modus={modus} onChange={handleModus} />
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
              {!bothSeen && (
                <p className="text-xs font-bold" style={{ color: C.olive }}>
                  Bekijk ook de andere stand →
                </p>
              )}
            </div>
          </div>

          {bothSeen && (
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

  const flowDown = { strokeDasharray: "6 5", animation: "flowDash 1.1s linear infinite" };

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
      <rect x="104" y="246" width="42" height="22" fill={fillOk("plaat")} stroke={hl("plaat")} strokeWidth={checked.includes("plaat") ? 3 : 2} />
      <line x1="110" y1="253" x2="140" y2="253" stroke={hl("plaat")} strokeWidth="1.5" />
      <line x1="110" y1="260" x2="132" y2="260" stroke={hl("plaat")} strokeWidth="1.5" />

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
      {/* terugslagklep in de rookgasafvoer */}
      <circle cx="118" cy="70" r="8.5" fill={fillOk("klep")} stroke={hl("klep")} strokeWidth={checked.includes("klep") ? 3 : 2} />
      <line x1="113" y1="75" x2="123" y2="65" stroke={hl("klep")} strokeWidth="2.5" />

      {/* toestel met aparte stubs (rookgas links, lucht rechts) + typeplaat + vlam */}
      <rect x="38" y="108" width="16" height="12" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="66" y="108" width="16" height="12" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="20" y="120" width="80" height="100" fill="white" stroke={hl("typeplaat")} strokeWidth="2" />
      <rect x="30" y="132" width="36" height="18" fill={fillOk("typeplaat")} stroke={hl("typeplaat")} strokeWidth={checked.includes("typeplaat") ? 2.5 : 1.5} />
      <text x="48" y="144" fontSize="7" fontWeight="700" fill={C.brownText} textAnchor="middle">C43</text>
      <circle cx="60" cy="185" r="11" fill="none" stroke={running ? C.red : C.beigeMid} strokeWidth="2" />
      {running && <path d="M55 188 q5 -12 10 0 q-5 7 -10 0" fill={C.red} opacity="0.8" />}

      {/* bouwkundig inspectieluik in de schachtwand */}
      <rect x="152" y="240" width="16" height="32" fill={fillOk("luik")} stroke={hl("luik")} strokeWidth={checked.includes("luik") ? 3 : 2} />
      <line x1="155" y1="246" x2="165" y2="246" stroke={hl("luik")} strokeWidth="1.5" />
      <line x1="155" y1="266" x2="165" y2="266" stroke={hl("luik")} strokeWidth="1.5" />

      {/* condensafvoer (NPR 3378-40/41): opvangbak -> sifon 1 -> open verbinding -> sifon 2 -> riool */}
      <path d="M188 316 V320 H206" fill="none" stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <DrainageTrein x={206} y={320} s={1} stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 2 : 1.7} riool={false} />
      <path d="M243 325 H262 V370" fill="none" stroke={hl("sifon")} strokeWidth={checked.includes("sifon") ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x="256" y="392" fontSize="8" fontWeight="600" fill={C.brown} textAnchor="middle">riool</text>
    </svg>
  );
}

function Ronde3({ addScore, onDone }) {
  const [gestart, setGestart] = useState(false);
  const [checked, setChecked] = useState([]); // ids in 'gecontroleerd'
  const [hint, setHint] = useState(null);
  const [running, setRunning] = useState(false);
  const [fase, setFase] = useState("oplever"); // oplever -> onderhoud
  const [gedaan, setGedaan] = useState([]); // uitgevoerde onderhoudsstappen, op volgorde
  const [kaarten] = useState(() => [...ONDERHOUD_STAPPEN].sort(() => Math.random() - 0.5));
  const gratisFoutOplever = useEersteFoutVrij();
  const gratisFoutStap = useEersteFoutVrij();

  const verplichteIds = CONTROLEPUNTEN.filter((p) => p.verplicht).map((p) => p.id);
  const alleVerplicht = verplichteIds.every((id) => checked.includes(id));
  const onderhoudKlaar = gedaan.length === ONDERHOUD_STAPPEN.length;

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
    const uitleg = `"${punt.label}" hoort niet bij de verplichte controles van een CLV-systeem. Laat dit punt staan.`;
    if (gratisFoutOplever()) {
      playSound("wrong");
      setHint(`${uitleg} (deze eerste misser telt niet mee)`);
      return "wrong";
    }
    addScore(-5, point);
    setHint(uitleg);
    return "wrong";
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
          check de vaste punten: typeplaat, terugslagklep, inspectieluik, sifons gevuld, schoorsteenplaat en een CO-melder.
        </UitlegItem>
        <UitlegItem term="Let op">sommige punten op het formulier horen er niet bij. Die laat je staan.</UitlegItem>
        <UitlegItem term="Onderhoud">
          open van buiten naar binnen, controleer en reinig, sluit daarna alles weer af. In die volgorde.
        </UitlegItem>
        <p className="text-xs mt-3 italic" style={{ color: C.brown }}>
          Eerst het opleverformulier. Daarna in bedrijf stellen en de onderhoudsbeurt.
        </p>
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
          ? "Werk het opleverformulier af: sleep elk verplicht controlepunt naar ‘Gecontroleerd’. Pas op — er zitten punten tussen die er niet bij horen!"
          : "Het toestel draait! Nu de onderhoudsbeurt van het CLV-systeem zelf: sleep de onderhoudsvoorschriften in de juiste volgorde naar het stappenplan."}
      </p>

      <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl items-start">
        {fase === "oplever" ? (
          /* opleverformulier */
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
        {fase === "oplever" &&
          (running ? (
            <p className="text-sm font-bold italic" style={{ color: C.green }}>
              Het toestel start op... rookgasafvoer loopt — alles in orde!
            </p>
          ) : (
            <GameButton onClick={startToestel} disabled={!alleVerplicht} variant="green">
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
            <IntroScreen title="Missie: de monteur" buttonText="Aan de slag" onNext={() => setScreen("r1")}>
              <div className="leading-relaxed" style={{ color: C.brownText }}>
                <p className="mb-2">
                  Jij bent de monteur. Een CLV-systeem heeft meerdere toestellen op 1 kanaal. Dat vraagt om opletten.
                </p>
                <p>Je leert recirculatie voorkomen, een toestel aansluiten en het systeem controleren.</p>
              </div>
            </IntroScreen>
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
