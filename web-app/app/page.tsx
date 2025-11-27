"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";

const MOTIVATIONS = [
  "GM legend",
  "HODL",
  "LFG",
  "Stay Based",
  "You will make it",
  "Wen lambo? TODAY",
  "Based & redpilled",
  "Just ship it"
];

// 24 segments total
// 8 money wins evenly spaced
// 1 jackpot
const MONEY_SEGMENTS = new Set([2, 5, 8, 11, 14, 17, 20, 23]); // 8 positions
const JACKPOT_INDEX = 0;

export default function Page() {
  const [spinsToday, setSpinsToday] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Load spins for today
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    const saved = window.localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved, 10));
  }, []);

  const saveSpins = (v: number) => {
    const key = `spins_${new Date().toDateString()}`;
    setSpinsToday(v);
    window.localStorage.setItem(key, v.toString());
  };

  const spin = () => {
    if (isSpinning) return;

    setIsSpinning(true);
    setResult(null);
    setShowConfetti(false);

    // Visual spin: 6–10 complete rotations + random offset
    const fullSpins = 6 + Math.random() * 4;
    const newRot = rotation + fullSpins * 360 + Math.random() * 360;
    setRotation(newRot);

    setTimeout(() => {
      // On-chain logic will replace this later
      const r = Math.random() * 100;
      let text = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];
      let eth = false;

      if (r < 95) {
        // 95% → motivational
      } else if (r < 95 + 4) {
        text = "You won 0.001 ETH!";
        eth = true;
      } else if (r < 95 + 4 + 0.9) {
        text = "You won 0.01 ETH!";
        eth = true;
      } else if (r < 95 + 4 + 0.9 + 0.09) {
        text = "You won 0.05 ETH!";
        eth = true;
      } else {
        text = "JACKPOT (up to 1.5 ETH)!";
        eth = true;
      }

      setResult(text);
      if (eth) setShowConfetti(true);

      const s = spinsToday + 1;
      saveSpins(s);
      setIsSpinning(false);
    }, 4200);
  };

  const renderWheel = () => (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{
        transform: `rotate(${rotation}deg)`,
        transition: isSpinning
          ? "transform 4.2s cubic-bezier(0.17,0.67,0.12,0.99)"
          : "none"
      }}
    >
      {Array.from({ length: 24 }).map((_, i) => {
        const startAngle = i * 15;
        const endAngle = (i + 1) * 15;

        const x1 = 50 + 42 * Math.cos((Math.PI * startAngle) / 180);
        const y1 = 50 + 42 * Math.sin((Math.PI * startAngle) / 180);
        const x2 = 50 + 42 * Math.cos((Math.PI * endAngle) / 180);
        const y2 = 50 + 42 * Math.sin((Math.PI * endAngle) / 180);

        const isJackpot = i === JACKPOT_INDEX;
        const isMoney = !isJackpot && MONEY_SEGMENTS.has(i);

        const fill =
          isJackpot
            ? "#FFD700"
            : isMoney
            ? "hsl(90, 80%, 55%)"
            : i % 2 === 0
            ? "hsl(330, 80%, 55%)"
            : "hsl(300, 80%, 55%)";

        const midAngle = startAngle + 7.5;
        const labelX = 50 + 28 * Math.cos((Math.PI * midAngle) / 180);
        const labelY = 50 + 28 * Math.sin((Math.PI * midAngle) / 180);

        let label = "TEXT";
        if (isJackpot) label = "JACKPOT";
        else if (isMoney) label = "ETH";

        return (
          <g key={i}>
            <path
              d={`M50,50 L${x1},${y1} A42,42 0 0,1 ${x2},${y2} Z`}
              fill={fill}
              stroke="#000"
              strokeWidth="0.5"
            />

            <text
              x={labelX}
              y={labelY}
              fill={isJackpot ? "black" : "white"}
              fontSize={isJackpot ? "5" : "4"}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${midAngle + 90} ${labelX} ${labelY})`}
            >
              {label}
            </text>
          </g>
        );
      })}

      <circle cx="50" cy="50" r="10" fill="#1a1a1a" />
    </svg>
  );

  const buttonLabel = isSpinning
    ? "SPINNING..."
    : spinsToday === 0
    ? "FREE SPIN"
    : "SPIN 0.00042 ETH";

  return (
    <>
      {typeof window !== "undefined" && showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={800}
          gravity={0.15}
        />
      )}

      <div className="min-h-screen flex flex-col items-center justify-center p-6 select-none">
        <h1 className="text-5xl md:text-6xl font-black mb-4 drop-shadow-2xl text-center">
          BASED WHEEL
        </h1>

        <p className="text-lg md:text-xl mb-8 opacity-90 text-center">
          1 free spin/day • then 0.00042 ETH (on-chain)
        </p>

        <div className="relative w-72 h-72 md:w-96 md:h-96 mb-10">
          {renderWheel()}
          <div
            className="absolute -top-4 left-1/2 -translate-x-1/2 
              w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent 
              border-t-[24px] border-t-yellow-400 drop-shadow-lg"
          />
        </div>

        {result && (
          <h2 className="text-2xl md:text-3xl font-black mb-8 text-yellow-300 drop-shadow-2xl text-center">
            {result}
          </h2>
        )}

        <div className="text-xl md:text-2xl mb-6 font-bold">
          Prize pool: X.XXXX ETH (live data soon)
        </div>

        <button
          onClick={spin}
          disabled={isSpinning}
          className="px-10 md:px-16 py-5 md:py-6 text-2xl md:text-3xl font-black 
            bg-yellow-400 text-black rounded-3xl shadow-2xl 
            hover:scale-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>

        <p className="mt-6 text-lg">Spins today: {spinsToday}</p>
      </div>
    </>
  );
}
