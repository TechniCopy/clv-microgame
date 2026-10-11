import { C, GameButton } from "./shared.jsx";

// Tijdelijke plaatshouder: de bouwer van game 3 vervangt dit bestand volledig.
export default function CLVServiceGame({ onExit }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ backgroundColor: C.bgPage }}>
      <p className="text-sm" style={{ color: C.brownText }}>De CLV-Servicemonteur wordt nog gebouwd.</p>
      {onExit && <GameButton onClick={onExit}>Terug naar het menu</GameButton>}
    </div>
  );
}
