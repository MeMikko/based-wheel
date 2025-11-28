"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";

// Fix TypeScript: extend Window to include ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

const ADMIN_ENS = "elize.base.eth";
const ADMIN_FALLBACK = "0xaBE04f37EfFDC17FccDAdC6A08c8ebdD5bbEb558".toLowerCase();

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

  const [adminAddressResolved, setAdminAddressResolved] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [recentWins, setRecentWins] = useState<
    { player: string; tier: number; amount: string; message: string }[]
  >([]);

  /* Load today's spin count */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    const saved = window.localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved));
  }, []);

  /* Init provider */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.ethereum) {
      setProvider(new BrowserProvider(window.ethereum));
    }
  }, []);

  /* Resolve ENS + admin check + data refresh */
  useEffect(() => {
    if (!provider) return;

    const init = async () => {
      // Always refresh pool & recent events if contract exists
      if (CONTRACT_ADDRESS) {
        await refreshPool();
        await loadRecentWins();
      }

      // ENS resolution
      try {
        const resolved = await provider.resolveName(ADMIN_ENS);
        if (resolved) {
          setAdminAddressResolved(resolved.toLowerCase());
        } else {
          setAdminAddressResolved(ADMIN_FALLBACK); // fallback
        }
      } catch {
        setAdminAddressResolved(ADMIN_FALLBACK);
      }

      // Check admin
      if (address && adminAddressResolved) {
        const lower = address.toLowerCase();
        setIsAdmin(lower === adminAddressResolved || lower === ADMIN_FALLBACK);
      }

      // Check free spin
      if (address && CONTRACT_ADDRESS) await checkFreeSpin();
    };

    void init();
  }, [provider, address, adminAddressResolved]);

  const saveSpins = (num: number) => {
    const key = `spins_${new Date().toDateString()}`;
    setSpinsToday(num);
    localStorage.setItem(key, num.toString());
  };

  /* Wallet connect */
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("No wallet detected.");
      return;
    }
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accs?.length) setAddress(accs[0]);
    } catch (e) {
      console.error(e);
    }
  };

  /* Contract helpers */
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
      const balance = await c.getPoolBalance();
      setPrizePool(parseFloat(formatEther(balance)).toFixed(4));
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
      if (!provider || !CONTRACT_ADDRESS) return;
      const c = getReadContract();
      if (!c) return;

      const logs = await provider.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: 0,
        toBlock: "latest"
      });

      const parsed: typeof recentWins = [];

      for (const log of logs.reverse()) {
        try {
          const pl = c.interface.parseLog(log);
          if (pl.name === "SpinResult") {
            const tier = Number(pl.args.tier);
            const amount = BigInt(pl.args.amountWei);
            if (tier > 0) {
              parsed.push({
                player: pl.args.player,
                tier,
                amount: formatEther(amount),
                message: pl.args.message
              });
            }
          }
        } catch {}
      }

      setRecentWins(parsed.slice(0, 25));
    } catch (e) {
      console.error("Failed loading events", e);
    }
  };

  /* Spin */
  const spinOnChain = async (useFree: boolean) => {
    if (!address) {
      await connectWallet();
      if (!address) return;
    }
    if (!CONTRACT_ADDRESS) return alert("Contract not deployed.");

    try {
      const c = await getWriteContract();
      if (!c) return;

      setIsSpinning(true);
      setResult(null);
      setShowConfetti(false);

      // Visual spin
      const fullTurns = 6 + Math.random() * 4;
      const endRotation = rotation + fullTurns * 360 + Math.random() * 360;
      setRotation(endRotation);

      const tx = useFree
        ? await c.spinFree()
        : await c.spinPaid({ value: SPIN_PRICE });

      const receipt = await tx.wait();

      let display = "Spin complete!";
      let ethWin = false;

      for (const log of receipt.logs) {
        try {
          const pl = c.interface.parseLog(log);
          if (pl.name === "SpinResult") {
            const amt = BigInt(pl.args.amountWei);
            display = pl.args.message || display;
            if (amt > 0n) ethWin = true;
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
      setIsSpinning(false);
      setResult(err?.shortMessage || err?.message || "Failed");
    }
  };

  const handleSpinClick = () => {
    const useFree = spinsToday === 0 && (isFreeAvailable !== false);
    void spinOnChain(useFree);
  };

  /* Wheel rendering */
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
        const end = start + 15;

        const x1 = 50 + 42 * Math.cos((Math.PI * start) / 180);
        const y1 = 50 + 42 * Math.sin((Math.PI * start) / 180);
        const x2 = 50 + 42 * Math.cos((Math.PI * end) / 180);
        const y2 = 50 + 42 * Math.sin((Math.PI * end) / 180);

        const isJackpot = i === JACKPOT_INDEX;
        const isMoney = MONEY_SEGMENTS.has(i);

        const fill = isJackpot
          ? "#FFD700"
          : isMoney
          ? "hsl(90,80%,55%)"
          : i % 2
          ? "hsl(300,80%,55%)"
          : "hsl(330,80%,55%)";

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

  const shortAddr = address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "";

  const buttonLabel = isSpinning
    ? "SPINNING..."
    : spinsToday === 0 && isFreeAvailable !== false
    ? "FREE SPIN"
    : "SPIN 0.00042 ETH";

  return (
    <>
      {showConfetti && (
        <Confetti
          width={typeof window !== "undefined" ? window.innerWidth : 300}
          height={typeof window !== "undefined" ? window.innerHeight : 300}
          recycle={false}
          numberOfPieces={600}
        />
      )}

      <div className="min-h-screen flex flex-col items-center p-6">

        {/* Top */}
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
        <div className="relative w-72 h-72 mb-8 mx-auto">
          {renderWheel()}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 
            border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent 
            border-t-[24px] border-t-yellow-400"
          />
        </div>

        {result && (
          <h2 className="text-2xl text-yellow-300 font-black mb-4 text-center">
            {result}
          </h2>
        )}

        <div className="text-xl font-bold mb-2">
          Prize pool: {prizePool} ETH
        </div>

        <button
          disabled={isSpinning || !CONTRACT_ADDRESS}
          onClick={handleSpinClick}
          className="px-10 py-4 text-xl bg-yellow-400 text-black rounded-3xl font-black shadow-xl disabled:opacity-40"
        >
          {CONTRACT_ADDRESS ? buttonLabel : "CONTRACT NOT DEPLOYED"}
        </button>

        <p className="mt-3 opacity-90">Spins today: {spinsToday}</p>

        {/* ADMIN */}
        {isAdmin && (
          <div className="w-full max-w-3xl mt-8 p-5 bg-black/30 border border-white/20 rounded-2xl">
            <h2 className="text-xl font-bold mb-3">Admin Panel</h2>

            <div className="flex gap-3 flex-wrap">

              <button
                onClick={async () => {
                  try {
                    const c = await getWriteContract();
                    const tx = await c.withdraw40();
                    await tx.wait();
                    alert("40% withdrawn");
                    refreshPool();
                  } catch (e: any) {
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
                    alert("Game stopped & all funds withdrawn.");
                  } catch (e: any) {
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
            <p className="opacity-80">
              {CONTRACT_ADDRESS ? "No wins yet." : "No contract deployed."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentWins.map((w, i) => (
                <div
                  key={i}
                  className="p-2 bg-black/40 rounded-xl border border-white/10"
                >
                  <div className="font-bold text-yellow-300">
                    {w.amount} ETH
                  </div>
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