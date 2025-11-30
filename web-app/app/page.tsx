"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  formatEther,
  parseEther,
} from "ethers";
import WalletConnectProvider from "@walletconnect/ethereum-provider";

// Globals
declare global {
  interface Window {
    ethereum?: any;
  }
}

const BASE_CHAIN_ID = 8453;
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC!;

const ADMIN_ENS = "elize.base.eth";
const ADMIN_FALLBACK =
  "0xaBE04f37EfFDC17FccDAdC6A08c8ebdD5bbEb558".toLowerCase();

const SEGMENTS = [
  "JACKPOT",
  "HODL",
  "ETH",
  "WAGMI",
  "Wen?",
  "ETH",
  "ship it",
  "ETH",
  "HODL",
  "LFG",
  "ETH",
  "Wen?",
];

const MONEY_SEGMENTS = new Set([2, 5, 8, 10]);
const JACKPOT_INDEX = 0;

const CONTRACT_ABI = [
  "function spinFree()",
  "function spinPaid() payable",
  "function getPoolBalance() view returns (uint256)",
  "function freeSpinAvailable(address) view returns (bool)",
  "event SpinResult(address indexed player, bool indexed isFree, uint8 tier, uint256 amountWei, string message)",
];

const SPIN_PRICE = parseEther("0.00042");

// 🔵 ALWAYS use Base RPC for reads (miniapp safe)
const baseRpcProvider = new JsonRpcProvider(BASE_RPC, BASE_CHAIN_ID);

export default function Page() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const [spinsToday, setSpinsToday] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);

  const [result, setResult] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const [prizePool, setPrizePool] = useState("X.XXXX");
  const [isFreeAvailable, setIsFreeAvailable] = useState<boolean | null>(null);

  const [adminAddressResolved, setAdminAddressResolved] =
    useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [recentWins, setRecentWins] = useState<
    { player: string; tier: number; amount: string; message: string }[]
  >([]);

  // Load daily spins
  useEffect(() => {
    const key = `spins_${new Date().toDateString()}`;
    const saved = localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved));
  }, []);

  const saveSpins = (n: number) => {
    const key = `spins_${new Date().toDateString()}`;
    setSpinsToday(n);
    localStorage.setItem(key, n.toString());
  };

  // -------------------------
  // CONNECT WALLET
  // -------------------------
  const connectWallet = async () => {
    try {
      let eth: any = null;

      if (!window.ethereum) {
        // WalletConnect for Base only
        const wc = await WalletConnectProvider.init({
          projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
          chains: [BASE_CHAIN_ID],
          rpcMap: { [BASE_CHAIN_ID]: BASE_RPC },
          showQrModal: true,
        });
        await wc.connect();
        eth = wc;
      } else {
        eth = window.ethereum;
        await eth.request({ method: "eth_requestAccounts" });
      }

      const bp = new BrowserProvider(eth);
      setProvider(bp);

      const accs: string[] = await bp.send("eth_requestAccounts", []);
      if (accs?.length) setAddress(accs[0]);
    } catch (e) {
      console.error("wallet connect error", e);
    }
  };

  // Add TS type for Contract to avoid "does not exist on BaseContract"
type WheelContract = {
  spinFree: () => Promise<any>;
  spinPaid: (opts: { value: bigint }) => Promise<any>;
  getPoolBalance: () => Promise<bigint>;
  freeSpinAvailable: (addr: string) => Promise<boolean>;
};

// CONTRACT HELPERS
// -------------------------
const getReadContract = (): Contract & WheelContract =>
  new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, baseRpcProvider) as any;

const getWriteContract = async (): Promise<(Contract & WheelContract) | null> => {
  if (!provider) return null;

  const signer = await provider.getSigner();
  const signedContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  return signedContract.connect(baseRpcProvider) as any;
};


  // -------------------------
  // REFRESH DATA
  // -------------------------
  const refreshPool = async () => {
    try {
      const c = getReadContract();
      const bal = await c.getPoolBalance();
      setPrizePool(parseFloat(formatEther(bal)).toFixed(4));
    } catch {
      setPrizePool("X.XXXX");
    }
  };

  const checkFreeSpin = async () => {
    if (!address) return;
    try {
      const c = getReadContract();
      const avail = await c.freeSpinAvailable(address);
      setIsFreeAvailable(avail);
    } catch {
      setIsFreeAvailable(null);
    }
  };

  // Load recent wins
  const loadRecentWins = async () => {
    try {
      const c = getReadContract();
      const logs = await baseRpcProvider.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: 0,
        toBlock: "latest",
      });

      const arr: any[] = [];
      for (const log of logs.reverse()) {
        try {
          const p = c.interface.parseLog(log);
          if (p.name === "SpinResult") {
            arr.push({
              player: p.args.player,
              tier: Number(p.args.tier),
              amount: formatEther(p.args.amountWei),
              message: p.args.message,
            });
          }
        } catch {}
      }
      setRecentWins(arr.slice(0, 25));
    } catch (e) {
      console.error("recent win load failed:", e);
    }
  };

  // Resolve ENS & admin check
  useEffect(() => {
    (async () => {
      if (!provider || !address) return;

      try {
        const name = await provider.lookupAddress(address);
        setResolvedName(name || null);
      } catch {
        setResolvedName(null);
      }

      try {
        const resolved = await baseRpcProvider.resolveName(ADMIN_ENS);
        setAdminAddressResolved(
          resolved ? resolved.toLowerCase() : ADMIN_FALLBACK
        );
      } catch {
        setAdminAddressResolved(ADMIN_FALLBACK);
      }

      if (adminAddressResolved) {
        setIsAdmin(address.toLowerCase() === adminAddressResolved);
      }

      await refreshPool();
      await loadRecentWins();
      await checkFreeSpin();
    })();
  }, [provider, address, adminAddressResolved]);

  // -------------------------
  // LISTENER MODE SPIN
  // -------------------------
  const spinOnChain = async (useFree: boolean) => {
    if (!address) {
      await connectWallet();
      if (!address) return;
    }

    try {
      const c = await getWriteContract();
      const readC = getReadContract();
      if (!c || !readC) return;

      setIsSpinning(true);
      setResult("Awaiting wallet confirmation…");
      setShowPopup(false);
      setShowConfetti(false);

      // 1. Listen BEFORE sending tx
      let resolved = false;
      const filter = readC.filters.SpinResult(address);

      const handler = async (
        player: string,
        isFree: boolean,
        tier: number,
        amountWei: bigint,
        message: string
      ) => {
        if (resolved) return;
        resolved = true;

        readC.off(filter, handler);

        const win = amountWei > 0n;

        // Finish after wheel stops
        setTimeout(async () => {
          setResult(message);
          setShowPopup(true);
          if (win) setShowConfetti(true);

          saveSpins(spinsToday + 1);
          await refreshPool();
          await loadRecentWins();
          await checkFreeSpin();

          setIsSpinning(false);
        }, 4200);
      };

      readC.on(filter, handler);

      // 2. Send transaction
      const tx = useFree ? await c.spinFree() : await c.spinPaid({ value: SPIN_PRICE });

      // 3. Start animation immediately
      setResult("Spinning…");
      const fullTurns = 8 + Math.random() * 4;
      const endRotation = rotation + fullTurns * 360 + Math.random() * 360;
      setRotation(endRotation);

      // We DO NOT WAIT — miniapp safe:
      tx.wait().catch(() => {});

    } catch (err: any) {
      console.error("Spin error:", err);

      const m = (err?.message || "").toLowerCase();
      const harmless =
        m.includes("coalesce") ||
        m.includes("unexpected") ||
        m.includes("network") ||
        m.includes("gas") ||
        m.includes("estimate") ||
        m.includes("transaction") ||
        err?.code === -32603;

      if (harmless) {
        setResult("Spinning…");
        return;
      }

      setIsSpinning(false);
      setResult(err?.message || "Failed");
      setShowPopup(true);
    }
  };

  const handleSpinClick = () => {
    const useFree =
      spinsToday === 0 && (isFreeAvailable === true || isFreeAvailable === null);
    spinOnChain(useFree);
  };

  // -------------------------
  // SVG WHEEL
  // -------------------------
  const renderWheel = () => (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{
        transform: `rotate(${rotation}deg)`,
        transition: isSpinning
          ? "transform 4.2s cubic-bezier(0.17,0.67,0.12,0.99)"
          : "none",
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => {
        const start = i * 30;
        const end = start + 30;

        const x1 = 50 + 42 * Math.cos((Math.PI * start) / 180);
        const y1 = 50 + 42 * Math.sin((Math.PI * start) / 180);
        const x2 = 50 + 42 * Math.cos((Math.PI * end) / 180);
        const y2 = 50 + 42 * Math.sin((Math.PI * end) / 180);

        const isJackpot = i === JACKPOT_INDEX;
        const isMoney = MONEY_SEGMENTS.has(i);

        const fill = isJackpot
          ? "#FFD700"
          : isMoney
          ? "#00FF9A"
          : "#FF44CC";

        const mid = start + 15;
        const lx = 50 + 34 * Math.cos((Math.PI * mid) / 180);
        const ly = 50 + 34 * Math.sin((Math.PI * mid) / 180);

        return (
          <g key={i}>
            <path
              d={`M50,50 L${x1},${y1} A42,42 0 0,1 ${x2},${y2} Z`}
              fill={fill}
              stroke="#000"
              strokeWidth="0.4"
            />
            <text
              x={lx}
              y={ly}
              fill={isJackpot ? "black" : "white"}
              fontSize="6"
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${mid + 90} ${lx} ${ly})`}
            >
              {SEGMENTS[i]}
            </text>
          </g>
        );
      })}
      <circle cx="50" cy="50" r="10" fill="#111" />
    </svg>
  );

  // -------------------------
  // UI
  // -------------------------
  const shortAddr = address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "";
  const displayUser = resolvedName || shortAddr || "";

  const buttonLabel = isSpinning
    ? "SPINNING..."
    : spinsToday === 0 && isFreeAvailable !== false
    ? "FREE SPIN"
    : "SPIN 0.00042 ETH";

  return (
    <>
      {showConfetti && (
        <Confetti width={window.innerWidth} height={window.innerHeight} />
      )}

      {/* RESULT POPUP */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-black p-6 rounded-2xl border border-white/20 text-center w-80">
            <h2 className="text-2xl font-bold mb-4 text-yellow-300">
              {result}
            </h2>

            <button
              onClick={() => {
                const txt = encodeURIComponent(result || "");
                window.open(
                  `https://warpcast.com/~/compose?text=${txt}`,
                  "_blank"
                );
              }}
              className="w-full py-3 bg-purple-500 rounded-xl font-bold mb-4"
            >
              Share on Farcaster
            </button>

            <button
              onClick={() => setShowPopup(false)}
              className="w-full py-3 bg-white/10 rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="min-h-screen flex flex-col items-center p-6 bg-black text-white">
        <h1 className="text-3xl font-black mb-4">BASED WHEEL</h1>

        <button
          onClick={connectWallet}
          className="px-4 py-2 rounded-xl bg-white/10 border border-white/20"
        >
          {address ? displayUser : "Connect Wallet"}
        </button>

        <p className="opacity-80 mt-3 mb-4">
          1 free spin/day • 0.00042 ETH after • Base mainnet
        </p>

        {/* WHEEL */}
        <div className="relative w-72 h-72 mb-8 mx-auto">
          {renderWheel()}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[24px] border-t-yellow-400" />
        </div>

        {result && !showPopup && (
          <h2 className="text-2xl text-yellow-300 font-black mb-4">
            {result}
          </h2>
        )}

        <div className="text-xl font-bold mb-2">
          Prize pool: {prizePool} ETH
        </div>

        <button
          disabled={isSpinning}
          onClick={handleSpinClick}
          className="px-10 py-4 text-xl font-black rounded-3xl bg-yellow-400 text-black disabled:opacity-40"
        >
          {buttonLabel}
        </button>

        <p className="mt-3 opacity-80">Spins today: {spinsToday}</p>

        {/* RECENT WINS */}
        <div className="w-full max-w-3xl mt-10 p-4 bg-white/5 border border-white/10 rounded-2xl">
          <h2 className="text-xl font-bold mb-3">Recent Wins</h2>
          {recentWins.map((w, i) => (
            <div
              key={i}
              className="p-2 bg-black/40 rounded-xl border border-white/10 mb-2"
            >
              <div className="font-bold text-yellow-300">
                {w.amount} ETH
              </div>
              <div className="text-sm opacity-80">
                {w.player.slice(0, 6)}...{w.player.slice(-4)} — {w.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
