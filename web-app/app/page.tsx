"use client";

import { useEffect, useState } from "react";
import Confetti from "confetti-react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import WalletConnectProvider from "@walletconnect/ethereum-provider";

// TypeScript globals
declare global {
  interface Window {
    ethereum?: any;
  }
}

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";

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

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

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

const SPIN_PRICE = parseEther("0.00042");

export default function Page() {
  const [spinsToday, setSpinsToday] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);

  const [result, setResult] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const [address, setAddress] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [prizePool, setPrizePool] = useState<string>("X.XXXX");
  const [isFreeAvailable, setIsFreeAvailable] = useState<boolean | null>(null);

  const [adminAddressResolved, setAdminAddressResolved] =
    useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [recentWins, setRecentWins] = useState<
    { player: string; tier: number; amount: string; message: string }[]
  >([]);

  const [fcUsername, setFcUsername] = useState<string | null>(null);

  /* Load spins from localStorage */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `spins_${new Date().toDateString()}`;
    const saved = window.localStorage.getItem(key);
    if (saved) setSpinsToday(parseInt(saved));
  }, []);

  /* Init provider & force Base if possible */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (provider) return;

    const eth = window.ethereum;
    if (!eth) return;

    (async () => {
      try {
        const chainHex = await eth.request({ method: "eth_chainId" });
        const chain = parseInt(chainHex, 16);

        if (chain !== BASE_CHAIN_ID) {
          try {
            await eth.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: BASE_CHAIN_HEX }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              // Add Base chain if not present
              try {
                await eth.request({
                  method: "wallet_addEthereumChain",
                  params: [
                    {
                      chainId: BASE_CHAIN_HEX,
                      chainName: "Base",
                      rpcUrls: ["https://mainnet.base.org"],
                      blockExplorerUrls: ["https://basescan.org"],
                    },
                  ],
                });
              } catch {
                // ignore
              }
            }
          }
        }

        setProvider(new BrowserProvider(eth));
      } catch {
        // ignore
      }
    })();
  }, [provider]);

  /* Admin + contract data + ENS/BNS for admin & user */
  useEffect(() => {
    if (!provider) return;

    const init = async () => {
      if (CONTRACT_ADDRESS) {
        await refreshPool();
        await loadRecentWins();
      }

      // Resolve admin ENS (elize.base.eth)
      try {
        const resolved = await provider.resolveName(ADMIN_ENS);
        setAdminAddressResolved(
          resolved ? resolved.toLowerCase() : ADMIN_FALLBACK
        );
      } catch {
        setAdminAddressResolved(ADMIN_FALLBACK);
      }

      // Resolve user ENS/Base Name (if address available)
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
        const lower = address.toLowerCase();
        setIsAdmin(
          lower === adminAddressResolved || lower === ADMIN_FALLBACK
        );
      }

      // Free spin check
      if (address && CONTRACT_ADDRESS) await checkFreeSpin();
    };

    void init();
  }, [provider, address, adminAddressResolved]);

  const saveSpins = (n: number) => {
    const key = `spins_${new Date().toDateString()}`;
    setSpinsToday(n);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, n.toString());
    }
  };

  /* Wallet connect:
     - If no injected wallet → WalletConnect (Base only)
     - If injected (MetaMask / Coinbase) → force Base & request accounts
  */
  const connectWallet = async () => {
    try {
      let ethProvider: any = null;

      if (typeof window === "undefined") return;

      if (!window.ethereum) {
        // WalletConnect (Base)
        const wc = await WalletConnectProvider.init({
          projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID!,
          chains: [BASE_CHAIN_ID],
          optionalChains: [BASE_CHAIN_ID],
          rpcMap: {
            [BASE_CHAIN_ID]: "https://mainnet.base.org",
          },
          showQrModal: true,
        });

        await wc.connect();
        ethProvider = wc;
      } else {
        // Injected wallet
        ethProvider = window.ethereum;

        const chainHex = await ethProvider.request({
          method: "eth_chainId",
        });
        const chain = parseInt(chainHex, 16);

        if (chain !== BASE_CHAIN_ID) {
          try {
            await ethProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: BASE_CHAIN_HEX }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              await ethProvider.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: BASE_CHAIN_HEX,
                    chainName: "Base",
                    rpcUrls: ["https://mainnet.base.org"],
                    blockExplorerUrls: ["https://basescan.org"],
                  },
                ],
              });
            }
          }
        }

        await ethProvider.request({ method: "eth_requestAccounts" });
      }

      if (ethProvider) {
        const bp = new BrowserProvider(ethProvider);
        setProvider(bp);

        const accs: string[] = await bp.send("eth_requestAccounts", []);
        if (accs?.length) {
          setAddress(accs[0]);
        }
      }
    } catch (err) {
      console.error("Wallet connect failed", err);
      alert("Wallet connection failed");
    }
  };

  /* Farcaster login (Neynar-ready: backend /api/farcaster/me) */
  const loginWithFarcaster = async () => {
    try {
      const res = await fetch("/api/farcaster/me");
      if (!res.ok) throw new Error("no backend");
      const data = await res.json();
      if (data?.username) {
        setFcUsername(data.username);
      } else {
        throw new Error("no username");
      }
    } catch (e) {
      console.error("Farcaster login failed, opening Neynar login instead", e);
      if (typeof window !== "undefined") {
        window.open("https://app.neynar.com/login", "_blank");
      }
    }
  };

  /* Contract helpers */
  const getReadContract = () =>
    provider && CONTRACT_ADDRESS
      ? new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
      : null;

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
      const available = await c.freeSpinAvailable(address);
      setIsFreeAvailable(available);
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
        toBlock: "latest",
      });

      const parsed: typeof recentWins = [];

      for (const log of logs.reverse()) {
        try {
          const pl = c.interface.parseLog(log);
          if (pl.name === "SpinResult") {
            const tier = Number(pl.args.tier);
            const amount = BigInt(pl.args.amountWei);
            parsed.push({
              player: pl.args.player,
              tier,
              amount: formatEther(amount),
              message: pl.args.message,
            });
          }
        } catch {
          // ignore unparseable logs
        }
      }

      setRecentWins(parsed.slice(0, 25));
    } catch (e) {
      console.error("Event load error", e);
    }
  };

  /* On-chain spin logic */
  const spinOnChain = async (useFree: boolean) => {
    if (!address) {
      await connectWallet();
      if (!address) return;
    }
    if (!CONTRACT_ADDRESS) return alert("Contract not deployed");

    try {
      const c = await getWriteContract();
      if (!c) return;

      setIsSpinning(true);
      setResult("Awaiting wallet confirmation...");
      setShowPopup(false);
      setShowConfetti(false);

      // Tx send
      const tx = useFree
        ? await c.spinFree()
        : await c.spinPaid({ value: SPIN_PRICE });

      // Start front-end wheel animation *after* user signs
      setResult("Spinning...");

      const fullTurns = 8 + Math.random() * 4;
      const endRotation =
        rotation + fullTurns * 360 + Math.random() * 360;
      setRotation(endRotation);

      // Wait on-chain result
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
        } catch {
          // ignore
        }
      }

      setTimeout(async () => {
        setResult(display);
        setShowPopup(true);

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
      setResult(err?.shortMessage || err?.message || "Failed");
      setShowPopup(true);
    }
  };

  const handleSpinClick = () => {
    const useFree = spinsToday === 0 && isFreeAvailable !== false;
    void spinOnChain(useFree);
  };

  /* Wheel SVG */
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

  const shortAddr = address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "";

  const buttonLabel = isSpinning
    ? "SPINNING..."
    : spinsToday === 0 && isFreeAvailable !== false
    ? "FREE SPIN"
    : "SPIN 0.00042 ETH";

  const displayUser = resolvedName || shortAddr || "";

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

      {/* RESULT POPUP */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-black p-6 rounded-2xl border border-white/20 text-center w-80">
            <h2 className="text-2xl font-bold mb-4 text-yellow-300">
              {result}
            </h2>

            {/* Miniapp-first Share on Farcaster */}
            <button
              onClick={() => {
                const text = result || "";
                const encoded = encodeURIComponent(text);

                // 1) Miniapp: postMessage parentille
                if (typeof window !== "undefined" && window.parent) {
                  try {
                    window.parent.postMessage(
                      {
                        type: "farcaster-share",
                        message: text,
                      },
                      "*"
                    );
                  } catch {
                    // ignore
                  }
                } else if (typeof window !== "undefined") {
                  // 2) Normi selain fallback → Warpcast compose
                  window.open(
                    `https://warpcast.com/~/compose?text=${encoded}`,
                    "_blank"
                  );
                }
              }}
              className="w-full py-3 bg-purple-500 rounded-xl font-bold mb-3"
            >
              Share on Farcaster
            </button>

            {/* Warpcast tipping -nappi (tip admin-osoite) */}
            <button
              onClick={() => {
                const addr = adminAddressResolved || ADMIN_FALLBACK;
                const composeText = `Tip @elize on Base: ${addr}`;
                if (typeof window !== "undefined") {
                  window.open(
                    `https://warpcast.com/~/compose?text=${encodeURIComponent(
                      composeText
                    )}`,
                    "_blank"
                  );
                }
              }}
              className="w-full py-3 bg-pink-500 rounded-xl font-bold mb-4"
            >
              Tip on Warpcast
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

      <div
        className="
          min-h-screen flex flex-col items-center p-6
          bg-gradient-to-b from-black via-[#0a0014] to-black
          text-white
        "
      >
        {/* HEADER */}
        <div className="w-full max-w-3xl flex justify-between items-center mb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black tracking-wide">
              BASED WHEEL
            </h1>
            {adminAddressResolved && (
              <p className="text-xs opacity-70">
                House:{" "}
                <span className="font-mono">
                  {ADMIN_ENS} ({adminAddressResolved.slice(0, 6)}...
                  {adminAddressResolved.slice(-4)})
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={connectWallet}
              className="
                px-4 py-2 rounded-xl 
                bg-black/60 border border-white/20
                hover:bg-white hover:text-black transition
              "
            >
              {address ? displayUser : "Connect Wallet"}
            </button>

            <button
              onClick={loginWithFarcaster}
              className="
                px-3 py-1 text-xs rounded-lg
                bg-purple-600/80 hover:bg-purple-500
                border border-white/20
              "
            >
              {fcUsername ? `@${fcUsername}` : "Login with Farcaster"}
            </button>
          </div>
        </div>

        <p className="opacity-80 mb-4">
          1 free spin/day • 0.00042 ETH after • Base mainnet
        </p>

        {/* WHEEL */}
        <div
          className="
            relative w-72 h-72 mb-8 mx-auto
            transition-transform duration-300
            hover:scale-105 hover:rotate-1
            drop-shadow-[0_0_25px_rgba(255,200,255,0.4)]
          "
        >
          {renderWheel()}
          <div
            className="
              absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0
              border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent
              border-t-[24px] border-t-yellow-400
              animate-pulse drop-shadow-[0_0_12px_rgba(255,255,0,0.8)]
            "
          />
        </div>

        {/* Result preview */}
        {result && !showPopup && (
          <h2 className="text-2xl text-yellow-300 font-black mb-4 text-center drop-shadow">
            {result}
          </h2>
        )}

        <div className="text-xl font-bold mb-2">
          Prize pool: {prizePool} ETH
        </div>

        <button
          disabled={isSpinning || !CONTRACT_ADDRESS}
          onClick={handleSpinClick}
          className="
            px-10 py-4 text-xl font-black rounded-3xl
            bg-yellow-400 text-black shadow-xl
            hover:bg-yellow-300 transition
            disabled:opacity-40
          "
        >
          {CONTRACT_ADDRESS ? buttonLabel : "CONTRACT NOT DEPLOYED"}
        </button>

        <p className="mt-3 opacity-90">Spins today: {spinsToday}</p>

        {/* ADMIN PANEL */}
        {isAdmin && (
          <div className="w-full max-w-3xl mt-8 p-5 bg-black/30 border border-white/20 rounded-2xl">
            <h2 className="text-xl font-bold mb-3">Admin Panel</h2>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={async () => {
                  try {
                    const c = await getWriteContract();
                    if (!c) return;
                    const tx = await c.withdraw40();
                    await tx.wait();
                    alert("40% withdrawn");
                    refreshPool();
                  } catch (e: any) {
                    alert(e?.message || "Withdraw failed");
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
                    if (!c) return;
                    let tx = await c.stopGame();
                    await tx.wait();
                    tx = await c.emergencyWithdrawAll();
                    await tx.wait();
                    alert("Game stopped & all funds withdrawn.");
                  } catch (e: any) {
                    alert(e?.message || "Emergency failed");
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
