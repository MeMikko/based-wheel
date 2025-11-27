"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";

const ADMIN_ENS = "elize.base.eth";

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

const MONEY_SEGMENTS = new Set([2, 5, 8, 11, 14, 17, 20, 23]);
const JACKPOT_INDEX = 0;

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

const CONTRACT_ABI = [
  "function spinFree()",
  "function spinPaid() payable",
  "function getPoolBalance() view returns (uint256)",
  "function freeSpinAvailable(address) view returns (bool)",
  "function withdraw40()",
  "function stopGame()",
  "function emergencyWithdrawAll()",
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

  const [adminAddress, setAdminAddress] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [recentWins, setRecentWins] = useState<
    { player: string; tier: number; amount: string; message: string }[]
  >([]);

  // Load spins today
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    const saved = window.localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved, 10));
  }, []);

  // Init provider
  useEffect(() => {
    if (typeof window === "undefined") return;
    // @ts-ignore
    if (window.ethereum) {
      // @ts-ignore
      setProvider(new BrowserProvider(window.ethereum));
    }
  }, []);

  // Resolve ENS admin & refresh pool/events when wallet or provider changes
  useEffect(() => {
    if (!provider || !CONTRACT_ADDRESS) return;

    const init = async () => {
      await refreshPool();
      await loadRecentWins();

      // Resolve admin ENS
      try {
        const resolved = await provider.resolveName(ADMIN_ENS);
        if (resolved) setAdminAddress(resolved.toLowerCase());
      } catch (e) {
        console.error("ENS resolution failed", e);
      }

      if (address && adminAddress && address.toLowerCase() === adminAddress) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }

      if (address) checkFreeSpin();
    };

    void init();
  }, [provider, address, adminAddress]);

  const saveSpins = (v: number) => {
    const key = `spins_${new Date().toDateString()}`;
    setSpinsToday(v);
    window.localStorage.setItem(key, v.toString());
  };

  const connectWallet = async () => {
    // @ts-ignore
    if (!window.ethereum) {
      alert("No wallet detected.");
      return;
    }
    try {
      // @ts-ignore
      const accs: string[] = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      if (accs.length > 0) setAddress(accs[0]);
    } catch (e) {
      console.error(e);
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
    } catch {
      setPrizePool("X.XXXX");
    }
  };

  const checkFreeSpin = async () => {
    try {
      const c = getReadContract();
      if (!c || !address) return;
      const ok = await c.freeSpinAvailable(address);
      setIsFreeAvailable(ok);
    } catch {
      setIsFreeAvailable(null);
    }
  };

  const loadRecentWins = async () => {
    try {
      const c = getReadContract();
      if (!c || !provider) return;

      const logs = await provider.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: 0,
        toBlock: "latest"
      });

      const parsed: typeof recentWins = [];

      for (const log of logs.reverse()) {
        try {
          const parsedLog = c.interface.parseLog(log);
          if (parsedLog.name === "SpinResult") {
            const tier = Number(parsedLog.args.tier);
            const amount = BigInt(parsedLog.args.amountWei);
            const player = parsedLog.args.player as string;
            const message = parsedLog.args.message as string;

            if (tier > 0) {
              parsed.push({
                player,
                tier,
                amount: formatEther(amount),
                message
              });
            }
          }
        } catch {}
      }

      setRecentWins(parsed.slice(0, 25));
    } catch (e) {
      console.error("Failed to load events", e);
    }
  };

  const spinOnChain = async (useFree: boolean) => {
    if (!address) {
      await connectWallet();
      if (!address) return;
    }

    try {
      const c = await getWriteContract();
      if (!c) return alert("Contract not available.");

      setIsSpinning(true);
      setResult(null);
      setShowConfetti(false);

      // Visual spin
      const full = 6 + Math.random() * 4;
      setRotation(rotation + full * 360 + Math.random() * 360);

      // On-chain call
      const tx = useFree ? await c.spinFree() : await c.spinPaid({ value: SPIN_PRICE });
      const receipt = await tx.wait();

      let display = "Spin complete!";
      let ethWin = false;

      for (const log of receipt.logs) {
        try {
          const parsed = c.interface.parseLog(log);
          if (parsed.name === "SpinResult") {
            const tier = Number(parsed.args.tier);
            const amount = BigInt(parsed.args.amountWei);
            const message = parsed.args.message as string;
            display = message || display;
            if (amount > 0n) ethWin = true;
          }
        } catch {}
      }

      setTimeout(async () => {
        setResult(display);
        if (ethWin) setShowConfetti(true);

        saveSpins(spinsToday + 1);
        await refreshPool();
        await loadRecentWins();
        await checkFreeSpin();

        setIsSpinning(false);
      }, 4200);

    } catch (err: any) {
      console.error(err);
      setIsSpinning(false);
      setResult(err?.shortMessage || err?.message || "Transaction failed");
    }
  };

  const handleSpinClick = () => {
    const useFree = spinsToday === 0 && (isFreeAvailable !== false);
    void spinOnChain(useFree);
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
        const start = i * 15;
        const end = (i + 1) * 15;

        const x1 = 50 + 42 * Math.cos((Math.PI * start) / 180);
        const y1 = 50 + 42 * Math.sin((Math.PI * start) / 180);
        const x2 = 50 + 42 * Math.cos((Math.PI * end) / 180);
        const y2 = 50 + 42 * Math.sin((Math.PI * end) / 180);

        const isJackpot = i === JACKPOT_INDEX;
        const isMoney = MONEY_SEGMENTS.has(i);

        const fill = isJackpot
          ? "#FFD700"
          : isMoney
          ? "hsl(90, 80%, 55%)"
          : i % 2
          ? "hsl(300, 80%, 55%)"
          : "hsl(330, 80%, 55%)";

        const mid = start + 7.5;
        const lx = 50 + 28 * Math.cos((Math.PI * mid) / 180);
        const ly = 50 + 28 * Math.sin((Math.PI * mid) / 180);

        return (
          <g key={i}>
            <path
              d={`M50,50 L${x1},${y1} A42,42 0 0,1 ${x2},${y2} Z`}
              fill={fill}
              stroke="#000"
              strokeWidth="0.5"
            />
            <text
              x={lx}
              y={ly}
              fill={isJackpot ? "black" : "white"}
              fontSize={isJackpot ? "5" : "4"}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${mid + 90} ${lx} ${ly})`}
            >
              {isJackpot ? "JACKPOT" : isMoney ? "ETH" : "TEXT"}
            </text>
          </g>
        );
      })}
      <circle cx="50" cy="50" r="10" fill="#111" />
    </svg>
  );

  const buttonLabel =
    isSpinning
      ? "SPINNING..."
      : spinsToday === 0 && (isFreeAvailable !== false)
      ? "FREE SPIN"
      : "SPIN 0.00042 ETH";

  const shortAddr =
    address && address.length > 10
      ? address.slice(0, 6) + "..." + address.slice(-4)
      : address;

  return (
    <>
      {showConfetti && typeof window !== "undefined" && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={600}
        />
      )}

      <div className="min-h-screen flex flex-col items-center p-6">

        {/* Top bar */}
        <div className="w-full max-w-3xl flex justify-between mb-4">
          <h1 className="text-3xl font-black">BASED WHEEL</h1>
          <button
            onClick={connectWallet}
            className="px-4 py-2 bg-black/60 rounded-xl border border-white/20"
          >
            {address ? shortAddr : "Connect Wallet"}
          </button>
        </div>

        <p className="opacity-80 mb-4">1 free spin/day • 0.00042 ETH after</p>

        {/* Wheel */}
        <div className="relative w-72 h-72 mb-8">
          {renderWheel()}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 
            border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent 
            border-t-[24px] border-t-yellow-400"
          />
        </div>

        {/* Result */}
        {result && (
          <h2 className="text-2xl text-yellow-300 font-black mb-4 text-center">
            {result}
          </h2>
        )}

        {/* Pool */}
        <div className="text-xl font-bold mb-2">Prize pool: {prizePool} ETH</div>

        {/* Button */}
        <button
          disabled={isSpinning || !CONTRACT_ADDRESS}
          onClick={handleSpinClick}
          className="px-10 py-4 text-xl bg-yellow-400 text-black rounded-3xl font-black shadow-xl"
        >
          {buttonLabel}
        </button>

        <p className="mt-3 opacity-90">Spins today: {spinsToday}</p>

        {/* ADMIN PANEL (only elize.base.eth) */}
        {isAdmin && (
          <div className="w-full max-w-3xl mt-8 p-5 bg-black/30 border border-white/20 rounded-2xl">
            <h2 className="text-xl font-bold mb-3">Admin Panel</h2>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    const c = await getWriteContract();
                    const tx = await c.withdraw40();
                    await tx.wait();
                    alert("40% withdrawn.");
                    refreshPool();
                  } catch (e:any) {
                    alert(e.message);
                  }
                }}
                className="px-4 py-2 bg-yellow-400 rounded-xl font-bold text-black"
              >
                Withdraw 40%
              </button>

              <button
                onClick={async () => {
                  if (!confirm("STOP GAME + WITHDRAW ALL?")) return;
                  try {
                    const c = await getWriteContract();
                    let tx = await c.stopGame();
                    await tx.wait();
                    tx = await c.emergencyWithdrawAll();
                    await tx.wait();
                    alert("Game stopped & all funds withdrawn!");
                  } catch (e:any) {
                    alert(e.message);
                  }
                }}
                className="px-4 py-2 bg-red-500 rounded-xl font-bold text-white"
              >
                Emergency Withdraw ALL
              </button>
            </div>
          </div>
        )}

        {/* RECENT WINS */}
        <div className="w-full max-w-3xl mt-10 p-4 bg-black/20 border border-white/10 rounded-2xl">
          <h2 className="text-xl font-bold mb-3">Recent Wins</h2>

          {recentWins.length === 0 ? (
            <p className="opacity-80">No wins yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentWins.map((w, i) => (
                <div
                  key={i}
                  className="p-2 bg-black/40 rounded-xl border border-white/10"
                >
                  <div className="font-bold text-yellow-300">{w.amount} ETH</div>
                  <div className="text-sm opacity-80">
                    {w.player.slice(0, 6)}...{w.player.slice(-4)} – {w.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
