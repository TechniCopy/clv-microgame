# CLV-Microgames — Studium B.V.

Twee speelbare microgames over **CLV-systemen in gestapelde bouw** (Vakmanschap CO, Leerdoel 14) voor MBO-studenten installatie- en CV-techniek.

| Game | Doel |
|---|---|
| **1. De CLV-Verkenner** | Een CLV-systeem begrijpen en herkennen: werking, verschil CLV/half-CLV, onderdelen, toesteltypes |
| **2. De CLV-Monteur** | Een toestel veilig aansluiten en het systeem controleren: recirculatie voorkomen, materiaal, afschot, beugeling, opleverpunten |

Game 2 is vergrendeld tot game 1 is afgerond (voortgang in `localStorage`).

## Ontwerpprincipe

Elke ronde volgt het vaste tweeluik **INTERACTIE → MC-CONTROLE**:

1. De student sleept, schuift of stopt een animatie en ontdekt zo het concept. Goede sleepactie **+5**, foute **-5** (rood terugveren + hint).
2. Direct daarna een MC-vraag uit een **vragenpool van 3** — per speelbeurt willekeurig één, antwoordopties altijd opnieuw geschud (Fisher-Yates). Goed bij 1e poging **+10**, 2e poging **+5**, fout **-1 leven** + uitleg.

7 van de 18 MC-vragen komen letterlijk uit de officiële examenvragen bij Leerdoel 14 (`[EXAMENVRAAG]` — formulering nooit wijzigen).

## Controlemenu (voor QA)

Druk **Ctrl-D** om het controlemenu te openen: spring direct naar elke ronde of elk scherm van beide games, wis de voortgang, of ga terug naar het hoofdmenu.

## Tech

React + Vite + Tailwind CSS 4 + lucide-react, geen backend. Alle visuals zijn SVG in code. Drag & drop via custom pointer events (werkt op desktop én tablet). Gebaseerd op de technische basis van de Energie-Stapelaar.

```bash
npm install
npm run dev      # dev-server
npm run build    # productie-build
npm run lint
```

## Structuur

- `src/App.jsx` — hoofdmenu, vergrendeling game 2, Ctrl-D controlemenu
- `src/CLVVerkennerGame.jsx` — game 1 (3 rondes + vragenpools)
- `src/CLVMonteurGame.jsx` — game 2 (3 rondes + vragenpools)
- `src/shared.jsx` — huisstijl, geluid, game-juice, drag & drop-systeem, progress bar, MC-controle, eindscherm

Gebaseerd op het ontwerpdocument *Instructies_CLV_Microgame.docx* (Studium B.V., versie 3.1, juni 2026).
