/**
 * De kern van MicroGames 2.0.
 *
 * Dit bestand kent score, sterren, levens, het rondeverloop en de telemetrie.
 * Het heeft bewust geen enkele afhankelijkheid: geen React, geen Next, geen
 * npm-pakket. Daardoor draait het net zo goed in een enkel HTML-bestand
 * (script type="module") als in de app, en kunnen onze twaalf bestaande
 * microgames er later op aansluiten zonder verbouwing. Zie bouwplan 3e.
 *
 * Alles staat in een bestand omdat een module zonder relatieve imports
 * rechtstreeks in de browser te laden is. Splits het pas op als het echt te
 * groot wordt, en lever dan alsnog een gebundelde versie.
 *
 * Een game verandert deze regels nooit. Dat is precies de shell-wildgroei die
 * de pilot om zeep hielp: vijf schillen met per game andere levens, andere
 * sterrendrempels en andere straffen.
 */
// ---------------------------------------------------------------------------
// De vaste regels (bouwplan hoofdstuk 3)
// ---------------------------------------------------------------------------
export const PUNTEN = {
    goed: 100,
    bijnaGoed: 50,
    fout: -200,
    foutSlepen: -250,
    kennisvraag: 100,
};
/** Wat een handeling maximaal kan opleveren; hiermee rekenen we haalbaar uit. */
export const PUNTEN_PER_HANDELING = PUNTEN.goed;
export const LEVENS_PER_MISSIE = 3;
/**
 * Sterren zijn relatief aan wat haalbaar was in de gespeelde modus. Foutloos
 * spelen is altijd vijf sterren, ook in de challenge-modus, want die verhoogt
 * het plafond niet. "Voltooid, 0 van de 5" kan hiermee niet meer bestaan.
 */
export const STERRENDREMPELS = [
    { sterren: 5, vanaf: 1 },
    { sterren: 4, vanaf: 0.9 },
    { sterren: 3, vanaf: 0.75 },
    { sterren: 2, vanaf: 0.5 },
    { sterren: 1, vanaf: 0 },
];
export function puntenVoor(uitkomst, slepen = false) {
    if (uitkomst === "goed")
        return PUNTEN.goed;
    if (uitkomst === "bijna")
        return PUNTEN.bijnaGoed;
    return slepen ? PUNTEN.foutSlepen : PUNTEN.fout;
}
/** Sterren uit behaalde en haalbare punten. Niet voltooid is nul sterren. */
export function sterrenVoor(behaald, haalbaar, voltooid) {
    if (!voltooid)
        return 0;
    if (haalbaar <= 0)
        return 1;
    const deel = Math.max(0, behaald) / haalbaar;
    for (const drempel of STERRENDREMPELS) {
        if (deel >= drempel.vanaf)
            return drempel.sterren;
    }
    return 1;
}
/** Meten mag nooit het spel in de weg zitten; een kapotte zender slikken we. */
function veiligeZender(zender) {
    return (gebeurtenis) => {
        if (!zender)
            return;
        try {
            zender(gebeurtenis);
        }
        catch {
            // stil
        }
    };
}
/**
 * Vangt fouten die buiten het spel om ontstaan (een kapot plaatje, een fout in
 * een mechaniek) en meldt ze met game en ronde erbij. De klacht "hij loopt
 * vast" wordt hiermee een regel in het dashboard in plaats van een gerucht.
 * Geeft een opruimfunctie terug.
 */
export function vangFouten(game, zender, ronde) {
    if (typeof window === "undefined")
        return () => { };
    const melden = (melding) => {
        veiligeZender(zender)({ soort: "game_fout", game, ronde: ronde?.(), melding: melding.slice(0, 500) });
    };
    const opFout = (e) => melden(`${e.message} (${e.filename}:${e.lineno})`);
    const opBelofte = (e) => melden(`Onafgehandelde belofte: ${String(e.reason)}`);
    window.addEventListener("error", opFout);
    window.addEventListener("unhandledrejection", opBelofte);
    return () => {
        window.removeEventListener("error", opFout);
        window.removeEventListener("unhandledrejection", opBelofte);
    };
}
// ---------------------------------------------------------------------------
// De sessie
// ---------------------------------------------------------------------------
/**
 * Een gespeelde game. Alles loopt hierlangs: een mechaniek meldt alleen wat
 * de speler deed (goed, bijna goed of fout) en krijgt terug wat dat kostte.
 * De mechaniek rekent zelf nooit punten uit en houdt zelf geen levens bij.
 */
export class Sessie {
    constructor(opzet, opties = {}) {
        this.rondes = [];
        this.vragen = [];
        this.missieIndex = 0;
        this.rondeIndex = 0;
        this.vraagIndex = 0;
        this.fase = "briefing";
        this.levens = LEVENS_PER_MISSIE;
        this.begonnenOp = 0;
        this.tijdbonus = 0;
        this.versie = 0;
        this.herkanstRonde = null;
        /** Beste puntenaantal per ronde over alle pogingen. */
        this.beste = new Map();
        this.luisteraars = new Set();
        this.opzet = opzet;
        this.modus = opties.modus ?? "normaal";
        this.zend = veiligeZender(opties.zender);
        this.nu = opties.nu ?? (() => Date.now());
        for (const missie of opzet.missies) {
            for (const ronde of missie.rondes) {
                this.rondes.push({
                    id: ronde.id,
                    missie: missie.id,
                    mechaniek: ronde.mechaniek,
                    status: "open",
                    handelingen: ronde.handelingen,
                    beoordeeld: 0,
                    fouten: 0,
                    punten: 0,
                    haalbaar: ronde.handelingen * PUNTEN_PER_HANDELING,
                    duurMs: 0,
                    pogingen: 0,
                });
            }
            for (const vraag of missie.kennisvragen ?? []) {
                this.vragen.push({
                    id: vraag.id,
                    missie: missie.id,
                    beantwoord: false,
                    goed: false,
                    punten: 0,
                    herhalen: false,
                });
            }
        }
        this.momentopname = this.maakStand();
        this.zend({ soort: "game_start", game: opzet.id, modus: this.modus, haalbaar: this.haalbaar() });
    }
    // ---- lezen ----
    /** Stabiele momentopname; het scherm mag hier direct op renderen. */
    get stand() {
        return this.momentopname;
    }
    /** Abonneer op wijzigingen. Geeft een opzegfunctie terug. */
    luister(callback) {
        this.luisteraars.add(callback);
        return () => {
            this.luisteraars.delete(callback);
        };
    }
    haalbaar() {
        const uitRondes = this.rondes.reduce((som, r) => som + r.haalbaar, 0);
        return uitRondes + this.vragen.length * PUNTEN.kennisvraag;
    }
    punten() {
        const uitRondes = this.rondes.reduce((som, r) => som + r.punten, 0);
        const uitVragen = this.vragen.reduce((som, v) => som + v.punten, 0);
        return uitRondes + uitVragen;
    }
    /** Alle rondes gespeeld en alle kennisvragen beantwoord. */
    voltooid() {
        return (this.rondes.every((r) => r.status === "klaar" || r.status === "gefaald") &&
            this.vragen.every((v) => v.beantwoord));
    }
    sterren() {
        return sterrenVoor(this.punten(), this.haalbaar(), this.voltooid());
    }
    // ---- spelen ----
    /** Sluit de briefing en start de eerste of de volgende ronde. */
    startRonde() {
        const ronde = this.rondes[this.rondeIndex];
        if (!ronde)
            return;
        if (ronde.status === "bezig")
            return;
        ronde.status = "bezig";
        ronde.pogingen += 1;
        ronde.beoordeeld = 0;
        ronde.fouten = 0;
        this.begonnenOp = this.nu();
        this.fase = "ronde";
        this.zend({
            soort: "ronde_start",
            game: this.opzet.id,
            missie: ronde.missie,
            ronde: ronde.id,
            modus: this.modus,
            herkansing: ronde.pogingen > 1,
        });
        this.veranderd();
    }
    /**
     * Een mechaniek meldt hier wat de speler deed. De kern bepaalt de punten,
     * de levens en of de ronde daarmee vol is. Een fout kost een leven en
     * punten, nooit de hele ronde.
     */
    beoordeel(uitkomst, opties = {}) {
        const ronde = this.rondes[this.rondeIndex];
        if (!ronde || ronde.status !== "bezig") {
            return { uitkomst, punten: 0, levens: this.levens, levenKwijt: false, rondeGefaald: false };
        }
        const slepen = opties.slepen ?? false;
        const punten = puntenVoor(uitkomst, slepen);
        ronde.punten += punten;
        if (uitkomst !== "fout")
            ronde.beoordeeld += 1;
        let levenKwijt = false;
        if (uitkomst === "fout") {
            ronde.fouten += 1;
            this.levens -= 1;
            levenKwijt = true;
        }
        let rondeGefaald = false;
        if (this.levens <= 0) {
            rondeGefaald = true;
            this.sluitRonde("gefaald");
        }
        else if (ronde.beoordeeld >= ronde.handelingen) {
            this.sluitRonde("klaar");
        }
        else {
            this.veranderd();
        }
        return { uitkomst, punten, levens: this.levens, levenKwijt, rondeGefaald };
    }
    /**
     * Sluit de ronde af terwijl er nog handelingen open staan. Gebruik dit voor
     * mechanieken die zelf bepalen wanneer ze klaar zijn, bijvoorbeeld een
     * beoordeelknop die je te vroeg mag indrukken.
     */
    rondeKlaar() {
        const ronde = this.rondes[this.rondeIndex];
        if (!ronde || ronde.status !== "bezig")
            return;
        this.sluitRonde("klaar");
    }
    sluitRonde(status) {
        const ronde = this.rondes[this.rondeIndex];
        if (!ronde)
            return;
        const duur = Math.max(0, this.nu() - this.begonnenOp);
        ronde.duurMs = duur;
        ronde.status = status;
        if (ronde.punten < 0)
            ronde.punten = 0; // een ronde kan je nooit onder nul trekken
        this.zend({
            soort: status === "klaar" ? "ronde_klaar" : "ronde_gefaald",
            game: this.opzet.id,
            missie: ronde.missie,
            ronde: ronde.id,
            modus: this.modus,
            correct: status === "klaar" && ronde.fouten === 0,
            duurMs: duur,
            fouten: ronde.fouten,
            punten: ronde.punten,
            haalbaar: ronde.haalbaar,
            herkansing: ronde.pogingen > 1,
        });
        // Levens raken nooit voorgoed op: na een gefaalde ronde krijg je een
        // nieuwe set, zodat een speler nooit klem staat in de rest van de missie.
        if (status === "gefaald")
            this.levens = LEVENS_PER_MISSIE;
        if (this.herkanstRonde) {
            this.herkanstRonde = null;
            this.naarEind();
            return;
        }
        this.fase = "rondeklaar";
        this.veranderd();
    }
    /** De speler is klaar met de feedback en gaat naar het volgende scherm. */
    verder() {
        if (this.fase !== "rondeklaar")
            return;
        this.gaVerder();
    }
    /** Kennisvraag beantwoorden. Fout betekent uitleg plus terugkomen. */
    beantwoordKennisvraag(goed) {
        const vraag = this.vragen[this.vraagIndex];
        if (!vraag || vraag.beantwoord)
            return;
        vraag.beantwoord = true;
        vraag.goed = goed;
        vraag.punten = goed ? PUNTEN.kennisvraag : 0;
        vraag.herhalen = !goed;
        this.zend({
            soort: "kennisvraag",
            game: this.opzet.id,
            missie: vraag.missie,
            vraag: vraag.id,
            modus: this.modus,
            correct: goed,
        });
        this.veranderd();
    }
    /** Door naar het volgende scherm na de feedback van een kennisvraag. */
    volgendeKennisvraag() {
        const vraag = this.vragen[this.vraagIndex];
        if (!vraag || !vraag.beantwoord)
            return;
        this.vraagIndex += 1;
        this.gaVerder();
    }
    /**
     * Herkans een ronde vanaf het eindscherm. De beste poging telt; een slechte
     * herkansing maakt je score dus nooit lager.
     */
    herkans(rondeId) {
        const index = this.rondes.findIndex((r) => r.id === rondeId);
        if (index < 0)
            return;
        const ronde = this.rondes[index];
        this.beste.set(ronde.id, Math.max(this.beste.get(ronde.id) ?? 0, ronde.punten));
        this.rondeIndex = index;
        this.missieIndex = this.opzet.missies.findIndex((m) => m.id === ronde.missie);
        this.herkanstRonde = rondeId;
        this.levens = LEVENS_PER_MISSIE;
        ronde.status = "open";
        ronde.punten = 0;
        this.startRonde();
    }
    /** Naar de volgende ronde, kennisvraag of het eindscherm. */
    gaVerder() {
        const missie = this.opzet.missies[this.missieIndex];
        if (!missie) {
            this.naarEind();
            return;
        }
        const volgende = this.rondes[this.rondeIndex + 1];
        if (volgende && volgende.missie === missie.id) {
            this.rondeIndex += 1;
            this.fase = "ronde";
            this.veranderd();
            this.startRonde();
            return;
        }
        const vraag = this.vragen[this.vraagIndex];
        if (vraag && vraag.missie === missie.id) {
            this.fase = "kennisvraag";
            this.veranderd();
            return;
        }
        if (volgende) {
            this.rondeIndex += 1;
            this.missieIndex += 1;
            this.levens = LEVENS_PER_MISSIE;
            this.fase = "briefing";
            this.veranderd();
            return;
        }
        this.naarEind();
    }
    naarEind() {
        // Beste poging per ronde telt; herkansen mag je score alleen verbeteren.
        for (const ronde of this.rondes) {
            const beste = this.beste.get(ronde.id);
            if (beste !== undefined && beste > ronde.punten)
                ronde.punten = beste;
        }
        this.fase = "eind";
        this.veranderd();
        this.zend({
            soort: "game_klaar",
            game: this.opzet.id,
            modus: this.modus,
            punten: this.punten(),
            haalbaar: this.haalbaar(),
            sterren: this.sterren(),
            fouten: this.rondes.reduce((som, r) => som + r.fouten, 0),
            correct: this.rondes.every((r) => r.status === "klaar" && r.fouten === 0),
        });
    }
    /** Tijdbonus voor de challenge-ranglijst. Raakt de sterren niet. */
    telTijdbonus(punten) {
        if (this.modus !== "challenge")
            return;
        this.tijdbonus += Math.max(0, Math.round(punten));
        this.veranderd();
    }
    // ---- intern ----
    maakStand() {
        // Ook tijdens de briefing hoort de ronde erbij: de briefing ligt als
        // lichte laag over de scene, en dan moet die scene er wel al staan.
        const inRonde = this.fase === "briefing" || this.fase === "ronde" || this.fase === "rondeklaar";
        const ronde = inRonde ? this.rondes[this.rondeIndex] ?? null : null;
        const vraag = this.fase === "kennisvraag" ? this.vragen[this.vraagIndex] ?? null : null;
        const missie = this.opzet.missies[this.missieIndex];
        return {
            game: this.opzet.id,
            modus: this.modus,
            fase: this.fase,
            missieIndex: this.missieIndex,
            missie: missie ? missie.id : "",
            rondeIndex: this.rondeIndex,
            ronde: ronde ? { ...ronde } : null,
            kennisvraag: vraag ? { ...vraag } : null,
            levens: this.levens,
            punten: this.punten(),
            haalbaar: this.haalbaar(),
            sterren: this.sterren(),
            voltooid: this.voltooid(),
            rondes: this.rondes.map((r) => ({ ...r })),
            kennisvragen: this.vragen.map((v) => ({ ...v })),
            tijdbonus: this.tijdbonus,
            versie: this.versie,
        };
    }
    veranderd() {
        this.versie += 1;
        this.momentopname = this.maakStand();
        for (const luisteraar of this.luisteraars) {
            try {
                luisteraar();
            }
            catch {
                // een kapot scherm mag de sessie niet meeslepen
            }
        }
    }
}
/**
 * Leidt de kernopzet af uit een contentbestand. De kern hoeft niet te weten
 * wat een ronde inhoudelijk doet, alleen hoeveel er te beoordelen valt.
 */
export function opzetUitInhoud(inhoud) {
    return {
        id: inhoud.id,
        missies: inhoud.missies.map((missie) => ({
            id: missie.id,
            rondes: missie.rondes.map((ronde) => ({
                id: ronde.id,
                mechaniek: ronde.mechaniek,
                handelingen: ronde.handelingen ?? (Array.isArray(ronde.hotspots) ? ronde.hotspots.length : 1),
                slepen: typeof ronde.mechaniek === "string" && ronde.mechaniek.startsWith("slepen."),
            })),
            kennisvragen: (missie.kennisvragen ?? []).map((v) => ({ id: v.id })),
        })),
    };
}
