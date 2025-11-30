"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatEther,
  parseEther,
} from "ethers";
import WalletConnectProvider from "@walletconnect/ethereum-provider";

// ---------------------------
// CONSTANTS
// ---------------------------
const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC!;

const ADMIN_ENS = "elize.base.eth";
const ADMIN_FALLBACK =
  "0xaBE04f37EfFDC17FccDAdC6A08c8ebdD5bbEb558".toLowerCase();

const SPIN_PRICE = parseEther("0.00042");

const CONTRACT_ABI = [
  "function spinFree()",
  "function spinPaid() payable",
  "function getPoolBalance() view returns (uint256)",
  "function freeSpinAvailable(address) view returns (bool)",
  "function withdraw40()",
  "function stopGame()",
  "function emergencyWithdrawAll()",
  "event SpinResult(address indexed player, bool indexed isFree, uint8 tier, uint256 amountWei, string message)",
];

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

// Global TS
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Page() {
  // ---------------------------
  // STATE
  // ---------------------------
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const [spinsToday, setSpinsToday] = useState(0);
  const [isFreeAvailable, setIsFreeAvailable] = useState<boolean | null>(null);

  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const [prizePool, setPrizePool] = useState("X.XXXX");
  const [recentWins, setRecentWins] = useState<
    { player: string; tier: number; amount: string; message: string }[]
  >([]);

  const [adminAddressResolved, setAdminAddressResolved] =
    useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const baseRpcProvider = new JsonRpcProvider(BASE_RPC);

  // ---------------------------
  // LOAD SPINS TODAY
  // ---------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    const saved = localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved));
  }, []);

  const saveSpins = (n: number) => {
    setSpinsToday(n);
    if (typeof window !== "undefined") {
      localStorage.setItem(`spins_${new Date().toDateString()}`, String(n));
    }
  };

  // ---------------------------
  // INIT WALLET PROVIDER
  // ---------------------------
  const connectWallet = async () => {
    try {
      let ethProvider: any = null;

      if (!window.ethereum) {
        // WalletConnect fallback
        const wc = await WalletConnectProvider.init({
          projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
          chains: [BASE_CHAIN_ID],
          rpcMap: { [BASE_CHAIN_ID]: BASE_RPC },
          showQrModal: true,
        });
        await wc.connect();
        ethProvider = wc;
      } else {
        // Injected wallet
        ethProvider = window.ethereum;

        const chainHex = await ethProvider.request({ method: "eth_chainId" });
        const chain = parseInt(chainHex, 16);

        if (chain !== BASE_CHAIN_ID) {
          try {
            await ethProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: BASE_CHAIN_HEX }],
            });
          } catch (e: any) {
            if (e.code === 4902) {
              await ethProvider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: BASE_CHAIN_HEX,
                    chainName: "Base",
                    rpcUrls: [BASE_RPC],
                    blockExplorerUrls: ["https://basescan.org"],
                  },
                ],
              });
            }
          }
        }

        await ethProvider.request({ method: "eth_requestAccounts" });
      }

      const bp = new BrowserProvider(ethProvider);
      setProvider(bp);

      const accounts: string[] = await bp.send("eth_requestAccounts", []);
      if (accounts?.length) setAddress(accounts[0]);
    } catch (err) {
      console.error("Wallet connect error", err);
      alert("Wallet connection failed");
    }
  };

  // ---------------------------
  // RESOLVE ENS / ADMIN / FREE SPIN
  // ---------------------------
  useEffect(() => {
    if (!provider) return;

    const run = async () => {
      try {
        if (CONTRACT_ADDRESS) {
          await refreshPool();
          await loadRecentWins();
        }

        // Admin ENS
        try {
          const resolved = await provider.resolveName(ADMIN_ENS);
          setAdminAddressResolved(
            resolved ? resolved.toLowerCase() : ADMIN_FALLBACK
          );
        } catch {
          setAdminAddressResolved(ADMIN_FALLBACK);
        }

        // User ENS / BaseName
        try {
          if (address) {
            const name = await provider.lookupAddress(address);
            setResolvedName(name || null);
          } else {
            setResolvedName(null);
          }
        } catch {
          setResolvedName(null);
        }

        // Admin check
        if (address && adminAddressResolved) {
          setIsAdmin(
            address.toLowerCase() === adminAddressResolved ||
              address.toLowerCase() === ADMIN_FALLBACK
          );
        }

        // Free spin
        if (address) {
          const c = getReadContract();
          const free = await c.freeSpinAvailable(address);
          setIsFreeAvailable(free);
        }
      } catch (e) {
        console.error(e);
      }
    };

    run();
  }, [provider, address, adminAddressResolved]);

  // ---------------------------
  // CONTRACT HELPERS
  // ---------------------------
  const getReadContract = () =>
    new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, baseRpcProvider);

  const getWriteContract = async () => {
    if (!provider) return null;
    const signer = await provider.getSigner();
    // signer provider lähettää tx → oikea chain
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  // ---------------------------
  // POOL
  // ---------------------------
  const refreshPool = async () => {
    try {
      const c = getReadContract();
      const bal = await c.getPoolBalance();
      setPrizePool(parseFloat(formatEther(bal)).toFixed(4));
    } catch {
      setPrizePool("X.XXXX");
    }
  };

  // ---------------------------
  // RECENT WINS (last 5000 blocks)
  // ---------------------------
  const loadRecentWins = async () => {
    try {
      const c = getReadContract();
      const latest = await baseRpcProvider.getBlockNumber();
      const from = Math.max(0, latest - 5000);

      const logs = await baseRpcProvider.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: from,
        toBlock: "latest",
      });

      const parsed: typeof recentWins = [];

      for (const log of logs.reverse()) {
        try {
          const pl = c.interface.parseLog(log);
          if (pl.name === "SpinResult") {
            parsed.push({
              player: pl.args.player,
              tier: Number(pl.args.tier),
              amount: formatEther(BigInt(pl.args.amountWei)),
              message: pl.args.message,
            });
          }
        } catch {}
      }

      setRecentWins(parsed.slice(0, 25));
    } catch (err) {
      console.error("recent win load failed:", err);
    }
  };

  // ---------------------------
  // SPIN FUNCTION
  // ---------------------------
  const spin = async (useFree: boolean) => {
    if (!address) {
      await connectWallet();
      if (!address) return;
    }

    try {
      const c = await getWriteContract();
      if (!c) return;

      setIsSpinning(true);
      setShowPopup(false);
      setShowConfetti(false);
      setResult("Awaiting wallet confirmation…");

      // 1. Send transaction
      const tx = useFree
  ? await c.spinFree({
      gasLimit: 200000n
    })
  : await c.spinPaid({
      value: SPIN_PRICE.toString(),
      gasLimit: 200000n
    });



      // 2. Immediately animate wheel
      setResult("Spinning…");

      const fullTurns = 8 + Math.random() * 4;
      const endRotation =
        rotation + fullTurns * 360 + Math.random() * 360;
      setRotation(endRotation);

      // 3. Wait for on-chain result
      const receipt = await tx.wait();

      let display = "Spin complete!";
      let ethWin = false;

      for (const log of receipt.logs) {
        try {
          const pl = c.interface.parseLog(log);
          if (pl.name === "SpinResult") {
            display = pl.args.message;
            if (BigInt(pl.args.amountWei) > 0n) ethWin = true;
          }
        } catch {}
      }

      setTimeout(async () => {
        setResult(display);
        setShowPopup(true);

        if (ethWin) setShowConfetti(true);

        saveSpins(spinsToday + 1);
        await refreshPool();
        await loadRecentWins();

        if (address) {
          const c2 = getReadContract();
          setIsFreeAvailable(await c2.freeSpinAvailable(address));
        }

        setIsSpinning(false);
      }, 4200);
    } catch (err: any) {
      console.error("Spin error:", err);
      setIsSpinning(false);
      setResult(err?.message || "Transaction failed");
      setShowPopup(true);
    }
  };

  const handleSpin = () => {
    const useFree = spinsToday === 0 && isFreeAvailable !== false;
    spin(useFree);
  };

  // ---------------------------
  // WHEEL RENDER
  // ---------------------------
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

        const x1 = 50 + 42 * Math.cos((start * Math.PI) / 180);
        const y1 = 50 + 42 * Math.sin((start * Math.PI) / 180);
        const x2 = 50 + 42 * Math.cos((end * Math.PI) / 180);
        const y2 = 50 + 42 * Math.sin((end * Math.PI) / 180);

        const isJackpot = i === JACKPOT_INDEX;
        const isMoney = MONEY_SEGMENTS.has(i);

        const fill = isJackpot
          ? "#FFD700"
          : isMoney
          ? "#00FF9A"
          : "#FF44CC";

        const mid = start + 15;
        const lx = 50 + 34 * Math.cos((mid * Math.PI) / 180);
        const ly = 50 + 34 * Math.sin((mid * Math.PI) / 180);

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

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";
  const buttonLabel = isSpinning
    ? "SPINNING..."
    : spinsToday === 0 && isFreeAvailable !== false
    ? "FREE SPIN"
    : "SPIN 0.00042 ETH";

  const displayUser = resolvedName || shortAddr;

  // ---------------------------
  // RENDER
  // ---------------------------
  return (
    <>
      {showConfetti && (
        <Confetti
          width={typeof window !== "undefined" ? window.innerWidth : 400}
          height={typeof window !== "undefined" ? window.innerHeight : 400}
          recycle={false}
          numberOfPieces={700}
        />
      )}

      {showPopup && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-black p-6 rounded-2xl border border-white/20 text-center w-80">
            <h2 className="text-2xl font-bold mb-4 text-yellow-300">
              {result}
            </h2>

            <button
              onClick={() => {
                const text = result || "";
                const encoded = encodeURIComponent(text);

                if (window.parent) {
                  window.parent.postMessage(
                    { type: "farcaster-share", message: text },
                    "*"
                  );
                } else {
                  window.open(
                    `https://warpcast.com/~/compose?text=${encoded}`,
                    "_blank"
                  );
                }
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
        {/* HEADER */}
        <div className="w-full max-w-3xl flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-black">BASED WHEEL</h1>
            {adminAddressResolved && (
              <p className="text-xs opacity-70">
                House: {ADMIN_ENS} (
                {adminAddressResolved.slice(0, 6)}...
                {adminAddressResolved.slice(-4)})
              </p>
            )}
          </div>

          <button
            onClick={connectWallet}
            className="px-4 py-2 rounded-xl bg-black/60 border border-white/20 hover:bg-white hover:text-black transition"
          >
            {address ? displayUser : "Connect Wallet"}
          </button>
        </div>

        <p className="opacity-80 mb-4">
          1 free spin/day • 0.00042 ETH after • Base mainnet
        </p>

        {/* WHEEL */}
        <div className="relative w-72 h-72 mb-8 mx-auto hover:scale-105 hover:rotate-1 duration-300">
          {renderWheel()}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 
          border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent 
          border-t-[24px] border-t-yellow-400 animate-pulse" />
        </div>

        {result && !showPopup && (
          <h2 className="text-2xl text-yellow-300 font-black mb-4">{result}</h2>
        )}

        <div className="text-xl font-bold mb-2">
          Prize Pool: {prizePool} ETH
        </div>

        <button
          disabled={isSpinning}
          onClick={handleSpin}
          className="px-10 py-4 text-xl font-black rounded-3xl bg-yellow-400 text-black shadow-xl disabled:opacity-30"
        >
          {buttonLabel}
        </button>

        <p className="mt-2 opacity-90">Spins today: {spinsToday}</p>

        {/* ADMIN PANEL */}
        {isAdmin && (
          <div className="w-full max-w-3xl mt-8 p-5 bg-black/30 rounded-2xl border">
            <h2 className="text-xl font-bold mb-3">Admin Panel</h2>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    const c = await getWriteContract();
                    const tx = await c!.withdraw40();
                    await tx.wait();
                    alert("40% withdrawn");
                    refreshPool();
                  } catch (err: any) {
                    alert(err?.message || "Error");
                  }
                }}
                className="px-4 py-2 bg-yellow-400 text-black rounded-xl font-bold"
              >
                Withdraw 40%
              </button>

              <button
                onClick={async () => {
                  if (!confirm("STOP GAME + WITHDRAW ALL?")) return;
                  try {
                    const c = await getWriteContract();
                    const tx1 = await c!.stopGame();
                    await tx1.wait();
                    const tx2 = await c!.emergencyWithdrawAll();
                    await tx2.wait();
                    alert("Game stopped & funds withdrawn");
                  } catch (err: any) {
                    alert(err?.message || "Error");
                  }
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold"
              >
                Emergency Withdraw ALL
              </button>
            </div>
          </div>
        )}

        {/* RECENT WINS */}
        <div className="w-full max-w-3xl mt-10 p-4 bg-black/20 rounded-2xl border">
          <h2 className="text-xl font-bold mb-3">Recent Wins</h2>

          {recentWins.length === 0 ? (
            <p className="opacity-80">No recent wins</p>
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
                    {w.player.slice(0, 6)}...{w.player.slice(-4)} –{" "}
                    {w.message}
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
