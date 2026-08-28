/* eslint-disable react-refresh/only-export-components */
/**
 * De route A-schil: de gedeelde kern voor de twaalf bestaande microgames
 * (bouwplan 3e). Een bestaande game houdt zijn eigen mechaniek en zijn eigen
 * schermen, maar haalt score, sterren, levens, het eindscherm en de
 * telemetrie hier vandaan. Nooit meer zelf punten optellen of sterren
 * uitrekenen; dat is precies de shell-wildgroei die de pilot brak.
 *
 * Dit bestand is een kopie. De bron staat in de co-verlenging-repo onder
 * route-a/schil.jsx en wordt met "npm run route-a:sync" naar de gamerepo's
 * gekopieerd, samen met kern.js. Wijzig dit bestand dus nooit in een
 * gamerepo; wijzig de bron en sync opnieuw.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Sessie, vangFouten, LEVENS_PER_MISSIE, PUNTEN } from "./kern.js";

export { Sessie, vangFouten, LEVENS_PER_MISSIE, PUNTEN };

// ---------------------------------------------------------------------------
// Telemetrie: dezelfde soorten als de lesstof-app, gebufferd verstuurd
// ---------------------------------------------------------------------------

const SESSIE_SLEUTEL = "microgame-sessie";
const SPOEL_NA_MS = 10_000;

function sessieId() {
  try {
    const bestaand = window.sessionStorage.getItem(SESSIE_SLEUTEL);
    if (bestaand) return bestaand;
    const nieuw =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSIE_SLEUTEL, nieuw);
    return nieuw;
  } catch {
    return "onbekend";
  }
}

const begrensd = (waarde, max) =>
  typeof waarde === "number" && Number.isFinite(waarde)
    ? Math.min(max, Math.max(0, Math.round(waarde)))
    : undefined;

/** Vertaalt een kerngebeurtenis naar de rij die de lesstof-app verwacht. */
function vertaal(g) {
  const bron = String(g.game ?? "").slice(0, 40);
  switch (g.soort) {
    case "ronde_start":
      return { soort: "game_ronde_start", bron, vraagId: g.ronde };
    case "ronde_klaar":
    case "ronde_gefaald":
      return {
        soort: g.soort === "ronde_klaar" ? "game_ronde" : "game_ronde_gefaald",
        bron,
        vraagId: g.ronde,
        correct: g.soort === "ronde_klaar" && g.fouten === 0,
        duurMs: g.duurMs,
        score: begrensd(g.punten, 999),
        totaal: begrensd(g.haalbaar, 999),
      };
    case "kennisvraag":
      return { soort: "game_vraag", bron, vraagId: g.vraag, correct: g.correct };
    case "game_klaar": {
      const deel = g.haalbaar && g.haalbaar > 0 ? Math.max(0, g.punten ?? 0) / g.haalbaar : 0;
      return {
        soort: "game_score",
        bron,
        score: begrensd(g.sterren, 5),
        totaal: 5,
        cijfer: Math.round(deel * 100) / 10,
        correct: g.correct,
      };
    }
    case "game_fout":
      return { soort: "game_fout", bron, vraagId: g.ronde, melding: g.melding };
    default:
      // game_start meten we niet apart; ronde_start zegt hetzelfde en meer.
      return null;
  }
}

/**
 * Maakt een zender voor de kern die de gebeurtenissen gebufferd naar de
 * lesstof-app stuurt. Zonder url meet er niets; de game speelt dan gewoon.
 * Meten mag nooit het spel in de weg zitten: alles hier faalt stil.
 *
 * Verlaat de speler de pagina voordat de game klaar is, dan gaat er een
 * game_verlaten mee met de laatste ronde, via sendBeacon.
 *
 * LET OP: zolang de losse games op hun eigen domein draaien, blijft deze
 * zender met opzet ongebruikt (besluit van Peter, 28 augustus 2026: meten
 * en testen gebeurt pas als de games in de app staan). Zie de LEESMIJ; zet
 * `VITE_TELEMETRIE_URL` dus niet.
 */
export function maakZender({ url } = {}) {
  if (!url || typeof window === "undefined") return undefined;

  let wachtrij = [];
  let timer = null;
  let laatsteRonde;
  let bron = "";
  let klaar = false;

  const verstuur = (rijen, bijSluiten = false) => {
    if (!rijen.length) return;
    const inhoud = JSON.stringify({ sessie: sessieId(), gebeurtenissen: rijen });
    try {
      if (bijSluiten && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([inhoud], { type: "application/json" }));
        return;
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: inhoud,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // stil
    }
  };

  const spoel = (bijSluiten = false) => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    const partij = wachtrij;
    wachtrij = [];
    verstuur(partij, bijSluiten);
  };

  const bijSluiten = () => {
    if (bron && !klaar) {
      wachtrij.push({ soort: "game_verlaten", bron, vraagId: laatsteRonde });
      // een keer melden is genoeg; wie terugkomt, meldt vanzelf weer rondes
      klaar = true;
    }
    spoel(true);
  };
  window.addEventListener("pagehide", bijSluiten);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") bijSluiten();
  });

  return (g) => {
    bron = String(g.game ?? "").slice(0, 40) || bron;
    if (g.soort === "ronde_start") {
      laatsteRonde = g.ronde;
      klaar = false;
    }
    if (g.soort === "game_klaar") klaar = true;
    const rij = vertaal(g);
    if (!rij) return;
    wachtrij.push(rij);
    if (wachtrij.length >= 20) {
      spoel();
      return;
    }
    if (timer === null) timer = window.setTimeout(() => spoel(), SPOEL_NA_MS);
  };
}

// ---------------------------------------------------------------------------
// De sessie als React-hook
// ---------------------------------------------------------------------------

/**
 * Een kernsessie in een React-game. maakOpzet levert de GameOpzet (missies,
 * rondes, handelingen); de hook maakt de sessie, abonneert het scherm op de
 * stand en vangt javascriptfouten met game en ronde erbij.
 *
 *   const { sessie, stand, herstart } = useSessie(maakOpzet, { zender });
 *
 * maakOpzet en zender horen buiten het component te staan (per game zijn ze
 * constant); herstart() begint een verse sessie (de knop "Opnieuw spelen").
 */
export function useSessie(maakOpzet, { modus, zender } = {}) {
  const [sessie, setSessie] = useState(() => new Sessie(maakOpzet(), { modus, zender }));
  const stand = useSyncExternalStore(
    useCallback((cb) => sessie.luister(cb), [sessie]),
    () => sessie.stand,
  );

  // sessie.stand is altijd de verse momentopname, ook buiten de render om;
  // de foutvanger leest hem pas op het moment dat er echt iets misgaat.
  useEffect(
    () => vangFouten(sessie.stand.game, zender ?? (() => {}), () => sessie.stand.ronde?.id),
    [sessie, zender],
  );

  const herstart = useCallback(
    () => setSessie(new Sessie(maakOpzet(), { modus, zender })),
    [maakOpzet, modus, zender],
  );
  return { sessie, stand, herstart };
}

// ---------------------------------------------------------------------------
// Gedeelde schermdelen: sterren, hartjes en het eindscherm
// ---------------------------------------------------------------------------

/** Standaardkleuren (PractiQ-huisstijl); een game mag ze overschrijven. */
export const KLEUREN = {
  tekst: "#242424",
  gedempt: "#6B6B6B",
  kaart: "#FFFFFF",
  rand: "#E6CBAA",
  accent: "#52B59C",
  accentDonker: "#3D9480",
  goed: "#2E9E5B",
  aandacht: "#C25E11",
  ster: "#F5B301",
  leeg: "#D8C6B0",
  hart: "#E74C3C",
};

function SterVorm({ gevuld, grootte, kleuren }) {
  return (
    <svg width={grootte} height={grootte} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.95 6.16 6.77.87-4.97 4.68 1.28 6.69L12 17.6l-6.03 3.3 1.28-6.69-4.97-4.68 6.77-.87z"
        fill={gevuld ? kleuren.ster : "transparent"}
        stroke={gevuld ? kleuren.ster : kleuren.leeg}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** De vijf sterren van de kern. Foutloos spelen is er altijd vijf. */
export function SterrenRij({ sterren, grootte = 28, kleuren = KLEUREN }) {
  return (
    <div style={{ display: "flex", gap: 4 }} aria-label={`${sterren} van de 5 sterren`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <SterVorm key={s} gevuld={s <= sterren} grootte={grootte} kleuren={kleuren} />
      ))}
    </div>
  );
}

/** De drie levens van de kern, als hartjes. */
export function HartjesRij({ levens, grootte = 18, kleuren = KLEUREN }) {
  return (
    <div style={{ display: "flex", gap: 3 }} aria-label={`${levens} van de ${LEVENS_PER_MISSIE} levens`}>
      {Array.from({ length: LEVENS_PER_MISSIE }, (_, i) => i + 1).map((h) => (
        <svg key={h} width={grootte} height={grootte} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21s-7.5-4.9-9.7-9.2C.7 8.6 2.6 5 6.1 5c2 0 3.4 1.1 4.2 2.4L12 9.5l1.7-2.1C14.5 6.1 15.9 5 17.9 5c3.5 0 5.4 3.6 3.8 6.8C19.5 16.1 12 21 12 21z"
            fill={h <= levens ? kleuren.hart : "transparent"}
            stroke={h <= levens ? kleuren.hart : kleuren.leeg}
            strokeWidth="1.6"
          />
        </svg>
      ))}
    </div>
  );
}

function EindKnop({ onClick, nadruk, kleuren, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: "0 18px",
        borderRadius: 12,
        border: `2px solid ${nadruk ? kleuren.accentDonker : kleuren.rand}`,
        background: nadruk ? kleuren.accent : kleuren.kaart,
        color: nadruk ? "#fff" : kleuren.tekst,
        font: "inherit",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Het gedeelde eindscherm van route A. Leest alles uit de kernstand: punten,
 * haalbaar, sterren en de rondes. Een ronde die punten liet liggen krijgt een
 * herkansknop; de kern telt daarbij de beste poging.
 *
 * - onHerkans(rondeId) wordt aangeroepen NA sessie.herkans(rondeId); de game
 *   toont dan zelf het scherm van die ronde.
 * - onOpnieuw start een verse sessie (de herstart uit useSessie).
 * - rondeNamen maakt de herkanslijst leesbaar: { m1r1: "De verraderlijke binding" }.
 * - leermomenten en aandacht zijn de vaste leerpunten en de persoonlijke
 *   missers van deze speler, zoals de pilotgames die al toonden.
 */
export function EindschermKern({
  sessie,
  stand,
  tekst,
  rondeNamen = {},
  leermomenten = [],
  aandacht = [],
  onHerkans,
  onOpnieuw,
  kleuren = KLEUREN,
}) {
  const punten = Math.max(0, stand.punten);
  const herkansbaar = stand.rondes.filter((r) => r.punten < r.haalbaar);
  const kaart = {
    background: kleuren.kaart,
    border: `2px solid ${kleuren.rand}`,
    borderRadius: 16,
    padding: 20,
    maxWidth: 520,
    width: "100%",
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        color: kleuren.tekst,
      }}
    >
      <SterrenRij sterren={stand.sterren} grootte={44} kleuren={kleuren} />
      <div style={{ fontSize: 40, fontWeight: 800, fontStyle: "italic" }}>
        {punten} / {stand.haalbaar}
      </div>

      {tekst && (
        <div style={kaart}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, textAlign: "center" }}>{tekst}</p>
        </div>
      )}

      {leermomenten.length > 0 && (
        <div style={kaart}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: kleuren.accent, marginBottom: 8 }}>
            Belangrijkste leermomenten
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
            {leermomenten.map((l) => (
              <li key={l} style={{ fontSize: 14, lineHeight: 1.4 }}>{l}</li>
            ))}
          </ul>
          {aandacht.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: kleuren.aandacht, margin: "14px 0 8px" }}>
                Jouw aandachtspunten
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {aandacht.map((a) => (
                  <li key={a} style={{ fontSize: 14, lineHeight: 1.4 }}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {herkansbaar.length > 0 && (
        <div style={kaart}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: kleuren.gedempt, marginBottom: 8 }}>
            Hier liet je punten liggen
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {herkansbaar.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 14 }}>
                  {rondeNamen[r.id] ?? r.id}
                  <span style={{ color: kleuren.gedempt }}> ({r.punten}/{r.haalbaar})</span>
                </span>
                <EindKnop
                  kleuren={kleuren}
                  onClick={() => {
                    sessie.herkans(r.id);
                    onHerkans?.(r.id);
                  }}
                >
                  Herkans
                </EindKnop>
              </div>
            ))}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: kleuren.gedempt }}>
            Herkansen kan je score alleen verbeteren; de beste poging telt.
          </p>
        </div>
      )}

      {onOpnieuw && (
        <EindKnop nadruk kleuren={kleuren} onClick={onOpnieuw}>
          Opnieuw spelen
        </EindKnop>
      )}
    </div>
  );
}
