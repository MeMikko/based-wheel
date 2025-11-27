"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";

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

// soppari – aseta tämä Vercel envissä: NEXT_PUBLIC_CONTRACT_ADDRESS
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

// minimi ABI – vain mitä frontti tarvitsee
const CONTRACT_ABI = [
  "function spinFree()",
  "function spinPaid() payable",
  "function getPoolBalance() view returns (uint256)",
  "function freeSpinAvailable(address) view returns (bool)",
  "event SpinResult(address indexed player, bool indexed isFree, uint8 tier, uint256 amountWei, string message)"
];

const SPIN_PRICE = parseEther("0.00042");

export default function Page() {
  const [spinsToday, setSpinsToday] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [prizePool, setPrizePool] = useState<string>("X.XXXX");
  const [isFreeAvailable, setIsFreeAvailable] = useState<boolean | null>(null);

  // Load spins for today
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    const saved = window.localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved, 10));
  }, []);

  // Init provider if window.ethereum available
  useEffect(() => {
    if (typeof window === "undefined") return;
    // @ts-ignore
    if (window.ethereum) {
      // @ts-ignore
      const p = new BrowserProvider(window.ethereum);
      setProvider(p);
    }
  }, []);

  // When address or provider changes, refresh pool & free spin status
  useEffect(() => {
    if (!provider || !CONTRACT_ADDRESS) return;
    refreshPool();
    if (address) {
      checkFreeSpin();
    }
  }, [provider, address]);

  const saveSpins = (v: number) => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    setSpinsToday(v);
    window.localStorage.setItem(key, v.toString());
  };

  const connectWallet = async () => {
    if (typeof window === "undefined") return;
    // @ts-ignore
    if (!window.ethereum) {
      alert("No wallet detected. Install MetaMask or a Base-compatible wallet.");
      return;
    }

    try {
      // @ts-ignore
      const accounts: string[] = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        // provider jo asetettu useEffectissä
      }
    } catch (err) {
      console.error("Wallet connect error:", err);
    }
  };

  const getReadContract = () => {
    if (!provider || !CONTRACT_ADDRESS) return null;
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  };

  const getWriteContract = async () => {
    if (!provider || !CONTRACT_ADDRESS) return null;
    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  const refreshPool = async () => {
    try {
      const c = getReadContract();
      if (!c) return;
      const bal = await c.getPoolBalance();
      setPrizePool(parseFloat(formatEther(bal)).toFixed(4));
    } catch (err) {
      console.error("Error fetching pool:", err);
      setPrizePool("X.XXXX");
    }
  };

  const checkFreeSpin = async () => {
    try {
      const c = getReadContract();
      if (!c || !address) return;
      const ok = await c.freeSpinAvailable(address);
      setIsFreeAvailable(ok);
    } catch (err) {
      console.error("Error checking free spin:", err);
      setIsFreeAvailable(null);
    }
  };

  const spinOnChain = async (useFree: boolean) => {
    if (!address) {
      await connectWallet();
      if (!address) return;
    }
    const c = await getWriteContract();
    if (!c) {
      alert("Contract not configured (missing address or provider).");
      return;
    }

    try {
      setIsSpinning(true);
      setResult(null);
      setShowConfetti(false);

      // visual spin
      const fullSpins = 6 + Math.random() * 4;
      const newRot = rotation + fullSpins * 360 + Math.random() * 360;
      setRotation(newRot);

      // call contract in parallel
      let tx;
      if (useFree) {
        tx = await c.spinFree();
      } else {
        tx = await c.spinPaid({ value: SPIN_PRICE });
      }

      const receipt = await tx.wait();

      // parse SpinResult event if exists
      let display = useFree
        ? "Free spin confirmed!"
        : "Paid spin confirmed!";
      let ethWin = false;

      try {
        for (const log of receipt.logs) {
          try {
            const parsed = c.interface.parseLog(log);
            if (parsed.name === "SpinResult") {
              const tier = parsed.args.tier as number;
              const amount = parsed.args.amountWei as bigint;
              const message = parsed.args.message as string;

              if (tier === 0) {
                display = message || "Motivational only";
              } else {
                const amtFormatted = formatEther(amount);
                display = message || `You won ${amtFormatted} ETH!`;
                if (amount > 0n) ethWin = true;
              }
              break;
            }
          } catch {
            // not our event
          }
        }
      } catch (e) {
        console.warn("Event parse failed", e);
      }

      setTimeout(() => {
        setResult(display);
        if (ethWin) setShowConfetti(true);

        const s = spinsToday + 1;
        saveSpins(s);

        refreshPool();
        checkFreeSpin();

        setIsSpinning(false);
      }, 4200);
    } catch (err: any) {
      console.error("Spin tx error:", err);
      setIsSpinning(false);
      setResult(err?.shortMessage || err?.message || "Transaction failed");
    }
  };

  const handleSpinClick = () => {
    // jos free spin vielä sopparin mukaan / local päivän eka, käytetään freeä
    const shouldUseFree = spinsToday === 0 && (isFreeAvailable !== false);
    void spinOnChain(shouldUseFree);
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
    : spinsToday === 0 && (isFreeAvailable !== false)
    ? "FREE SPIN"
    : "SPIN 0.00042 ETH";

  const shortAddress =
    address && address.length > 8
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

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
        <div className="w-full flex justify-between items-center max-w-3xl mb-4">
          <h1 className="text-3xl md:text-4xl font-black drop-shadow-2xl">
            BASED WHEEL
          </h1>

          <button
            onClick={connectWallet}
            className="px-4 py-2 text-sm md:text-base font-bold bg-black/70 rounded-2xl border border-white/30 hover:bg-black/90 transition"
          >
            {address ? shortAddress : "Connect Wallet"}
          </button>
        </div>

        <p className="text-sm md:text-base mb-6 opacity-90 text-center">
          1 free spin/day • then 0.00042 ETH on Base
        </p>

        <div className="relative w-72 h-72 md:w-96 md:h-96 mb-8">
          {renderWheel()}
          <div
            className="absolute -top-4 left-1/2 -translate-x-1/2 
              w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent 
              border-t-[24px] border-t-yellow-400 drop-shadow-lg"
          />
        </div>

        {result && (
          <h2 className="text-xl md:text-2xl font-black mb-6 text-yellow-300 drop-shadow-2xl text-center">
            {result}
          </h2>
        )}

        <div className="text-lg md:text-xl mb-2 font-bold">
          Prize pool: {prizePool} ETH
        </div>
        <div className="text-xs md:text-sm mb-6 opacity-80">
          Contract: {CONTRACT_ADDRESS ? CONTRACT_ADDRESS : "not set (env)"}
        </div>

        <button
          onClick={handleSpinClick}
          disabled={isSpinning || !CONTRACT_ADDRESS}
          className="px-10 md:px-16 py-4 md:py-5 text-xl md:text-2xl font-black 
            bg-yellow-400 text-black rounded-3xl shadow-2xl 
            hover:scale-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {CONTRACT_ADDRESS ? buttonLabel : "Set contract env first"}
        </button>

        <p className="mt-4 text-sm md:text-base">Spins today: {spinsToday}</p>
      </div>
    </>
  );
}
