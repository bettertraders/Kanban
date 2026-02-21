"use client";

import React from "react";

const prices = [
  { symbol: "BTC", price: "$68,420", change: "+2.4%" },
  { symbol: "ETH", price: "$3,540", change: "-1.1%" },
  { symbol: "SOL", price: "$148", change: "+4.9%" },
  { symbol: "AVAX", price: "$41.8", change: "+0.6%" },
  { symbol: "XRP", price: "$0.62", change: "-0.3%" },
  { symbol: "LINK", price: "$18.4", change: "+1.7%" },
  { symbol: "ADA", price: "$0.53", change: "+2.1%" },
];

const sparkline = (color: string) => (
  <svg viewBox="0 0 64 20" className="h-4 w-16" aria-hidden="true">
    <polyline
      fill="none"
      stroke={color}
      strokeWidth="2"
      points="0,14 8,12 16,14 24,6 32,8 40,4 48,8 56,2 64,6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PhoneFrame = ({
  title,
  theme,
  children,
}: {
  title: string;
  theme: "light" | "dark";
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <div className="text-sm font-semibold tracking-wide text-slate-600">
      {title} · {theme}
    </div>
    <div
      className={
        "relative h-[720px] w-[360px] overflow-hidden rounded-[36px] border shadow-[0_25px_60px_-40px_rgba(15,23,42,0.7)] " +
        (theme === "dark"
          ? "border-slate-800 bg-slate-950"
          : "border-slate-200 bg-slate-50")
      }
    >
      <div className="absolute inset-0 flex flex-col">{children}</div>
      <div
        className={
          "pointer-events-none absolute left-1/2 top-2 h-1.5 w-24 -translate-x-1/2 rounded-full " +
          (theme === "dark" ? "bg-slate-700" : "bg-slate-300")
        }
      />
    </div>
  </div>
);

const BottomTabs = ({ theme }: { theme: "light" | "dark" }) => (
  <nav
    aria-label="Primary"
    className={
      "mt-auto flex h-20 items-center justify-around border-t px-4 text-xs font-medium " +
      (theme === "dark"
        ? "border-slate-800 bg-slate-950 text-slate-300"
        : "border-slate-200 bg-white text-slate-500")
    }
  >
    {["Ask Penny", "Trades", "Dashboard"].map((label, index) => (
      <button
        key={label}
        type="button"
        aria-current={index === 2 ? "page" : undefined}
        className={
          "flex flex-col items-center gap-1 rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
          (theme === "dark"
            ? "focus-visible:ring-emerald-300/70 focus-visible:ring-offset-slate-950"
            : "focus-visible:ring-emerald-500/60 focus-visible:ring-offset-white") +
          (index === 2
            ? theme === "dark"
              ? " text-emerald-300"
              : " text-emerald-600"
            : "")
        }
      >
        <div
          className={
            "h-2 w-10 rounded-full " +
            (index === 2
              ? theme === "dark"
                ? "bg-emerald-400/50"
                : "bg-emerald-200"
              : theme === "dark"
              ? "bg-slate-800"
              : "bg-slate-200")
          }
        />
        <span>{label}</span>
      </button>
    ))}
  </nav>
);

const PriceTickerA = ({ theme }: { theme: "light" | "dark" }) => (
  <div
    className={
      "relative h-12 overflow-hidden border-b px-4 " +
      (theme === "dark"
        ? "border-slate-800 bg-slate-900 text-slate-200"
        : "border-slate-200 bg-white text-slate-700")
    }
  >
    <div className="absolute inset-y-0 left-0 flex items-center">
      <span
        className={
          "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-widest " +
          (theme === "dark"
            ? "bg-emerald-500/10 text-emerald-300"
            : "bg-emerald-100 text-emerald-700")
        }
      >
        Live
      </span>
    </div>
    <div className="ticker-marquee absolute left-16 top-0 flex h-full w-[650px] items-center gap-6 whitespace-nowrap animate-[ticker_22s_linear_infinite]">
      {[...prices, ...prices].map((item, index) => (
        <div key={`${item.symbol}-${index}`} className="flex items-center gap-2 text-xs">
          <span className="font-semibold">{item.symbol}</span>
          <span className="opacity-80">{item.price}</span>
          <span
            className={
              "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
              (item.change.startsWith("+")
                ? theme === "dark"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-emerald-100 text-emerald-700"
                : theme === "dark"
                ? "bg-rose-500/20 text-rose-300"
                : "bg-rose-100 text-rose-600")
            }
          >
            {item.change}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const PriceTickerB = ({ theme }: { theme: "light" | "dark" }) => (
  <div
    className={
      "flex h-14 items-center justify-between border-b px-4 " +
      (theme === "dark"
        ? "border-slate-800 bg-slate-900 text-slate-200"
        : "border-slate-200 bg-white text-slate-700")
    }
  >
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
      <span className="text-amber-500">Market</span>
      <span className="text-slate-400">/</span>
      <span className="text-slate-400">24h</span>
    </div>
    <div className="flex gap-4">
      {prices.slice(0, 4).map((item) => (
        <div key={item.symbol} className="flex items-center gap-2 text-xs">
          <span className="font-semibold">{item.symbol}</span>
          <span className="opacity-80">{item.price}</span>
          {sparkline(item.change.startsWith("+") ? "#34d399" : "#f87171")}
        </div>
      ))}
    </div>
  </div>
);

const AskPennyA = ({ theme }: { theme: "light" | "dark" }) => (
  <div
    className={
      "flex flex-1 flex-col gap-4 px-4 py-6 " +
      (theme === "dark" ? "text-slate-100" : "text-slate-700")
    }
  >
    <div
      className={
        "self-start rounded-2xl px-4 py-3 text-sm shadow " +
        (theme === "dark"
          ? "bg-slate-800 text-slate-200"
          : "bg-white text-slate-700")
      }
    >
      Morning! Want a trade plan for BTC volatility today?
    </div>
    <div
      className={
        "self-end rounded-2xl px-4 py-3 text-sm shadow " +
        (theme === "dark"
          ? "bg-emerald-500/20 text-emerald-200"
          : "bg-emerald-100 text-emerald-800")
      }
    >
      Yes — focus on high probability setups.
    </div>
    <div
      className={
        "rounded-2xl px-4 py-3 text-sm shadow " +
        (theme === "dark"
          ? "bg-slate-800 text-slate-200"
          : "bg-white text-slate-700")
      }
    >
      Here are 3 entries, each with tight stops and 2R targets.
    </div>
    <div className="mt-auto grid grid-cols-2 gap-3">
      {["Open order", "Set alert", "Risk check", "View notes"].map((label) => (
        <button
          key={label}
          className={
            "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide shadow " +
            (theme === "dark"
              ? "bg-slate-800 text-slate-200"
              : "bg-white text-slate-600")
          }
        >
          {label}
        </button>
      ))}
    </div>
  </div>
);

const AskPennyB = ({ theme }: { theme: "light" | "dark" }) => (
  <div
    className={
      "flex flex-1 flex-col gap-4 px-4 py-6 " +
      (theme === "dark" ? "text-slate-100" : "text-slate-700")
    }
  >
    <div
      className={
        "rounded-3xl px-4 py-6 text-center shadow " +
        (theme === "dark"
          ? "bg-slate-900/70 text-slate-100"
          : "bg-white text-slate-700")
      }
    >
      <div className="text-xs uppercase tracking-[0.35em] text-slate-400">
        Listening
      </div>
      <div className="mt-4 flex items-center justify-center gap-1">
        {Array.from({ length: 16 }).map((_, index) => (
          <div
            key={index}
            className={
              "wave-bar h-10 w-1 rounded-full " +
              (theme === "dark" ? "bg-emerald-400" : "bg-emerald-500")
            }
            style={{
              animation: `wave 1.4s ${index * 0.1}s ease-in-out infinite`,
              opacity: 0.3 + (index % 5) * 0.12,
            }}
          />
        ))}
      </div>
    </div>
    <div
      className={
        "rounded-2xl px-4 py-4 text-sm shadow " +
        (theme === "dark"
          ? "bg-slate-800 text-slate-200"
          : "bg-white text-slate-700")
      }
    >
      <div className="text-xs uppercase tracking-widest text-slate-400">
        Transcript
      </div>
      <p className="mt-2 text-sm">
        “Should I take profit on my SOL long or trail the stop?”
      </p>
      <p className="mt-2 text-sm text-emerald-500">
        Penny: Trail at 1.5% and lock 60% profit.
      </p>
    </div>
    <button
      type="button"
      aria-label="Tap to speak"
      className={
        "mt-auto flex items-center justify-between rounded-2xl px-4 py-3 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
        (theme === "dark"
          ? "focus-visible:ring-emerald-300/70 focus-visible:ring-offset-slate-950"
          : "focus-visible:ring-emerald-500/60 focus-visible:ring-offset-white")
      }
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Tap to speak
      </span>
      <span
        aria-hidden="true"
        className={
          "h-10 w-10 rounded-full shadow-lg " +
          (theme === "dark" ? "bg-emerald-400" : "bg-emerald-500")
        }
      />
    </button>
  </div>
);

const TradesA = ({ theme }: { theme: "light" | "dark" }) => (
  <div className="flex flex-1 flex-col gap-4 px-4 py-6">
    {[
      { pair: "BTC/USD", status: "Open", pnl: "+$420" },
      { pair: "ETH/USD", status: "Closed", pnl: "-$85" },
      { pair: "SOL/USD", status: "Open", pnl: "+$210" },
    ].map((trade, index) => (
      <div
        key={trade.pair}
        className={
          "flex items-center justify-between rounded-2xl px-4 py-4 shadow " +
          (theme === "dark"
            ? "bg-slate-800 text-slate-200"
            : "bg-white text-slate-700")
        }
      >
        <div>
          <div className="text-sm font-semibold">{trade.pair}</div>
          <div className="text-xs text-slate-400">5x · Limit · {index + 1}h ago</div>
        </div>
        <div className="text-right">
          <div
            className={
              "text-sm font-semibold " +
              (trade.pnl.startsWith("+") ? "text-emerald-500" : "text-rose-500")
            }
          >
            {trade.pnl}
          </div>
          <div
            className={
              "mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
              (trade.status === "Open"
                ? theme === "dark"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-emerald-100 text-emerald-600"
                : theme === "dark"
                ? "bg-slate-700 text-slate-300"
                : "bg-slate-200 text-slate-500")
            }
          >
            {trade.status}
          </div>
        </div>
      </div>
    ))}
    <div
      className={
        "mt-2 flex items-center justify-between rounded-2xl border border-dashed px-4 py-3 text-xs font-semibold uppercase tracking-widest " +
        (theme === "dark"
          ? "border-slate-700 text-slate-400"
          : "border-slate-300 text-slate-400")
      }
    >
      Swipe for actions
      <span className="text-emerald-500">›</span>
    </div>
  </div>
);

const TradesB = ({ theme }: { theme: "light" | "dark" }) => (
  <div className="flex flex-1 flex-col gap-3 px-4 py-6">
    <div className="text-xs uppercase tracking-widest text-slate-400">Active Boards</div>
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[
        { title: "Open", count: 3, color: "emerald" },
        { title: "Pending", count: 2, color: "amber" },
        { title: "Closed", count: 5, color: "slate" },
      ].map((lane) => (
        <div
          key={lane.title}
          className={
            "min-w-[220px] rounded-3xl p-4 shadow " +
            (theme === "dark"
              ? "bg-slate-800 text-slate-200"
              : "bg-white text-slate-700")
          }
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{lane.title}</div>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                (lane.color === "emerald"
                  ? theme === "dark"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-emerald-100 text-emerald-600"
                  : lane.color === "amber"
                  ? theme === "dark"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-amber-100 text-amber-600"
                  : theme === "dark"
                  ? "bg-slate-700 text-slate-300"
                  : "bg-slate-200 text-slate-500")
              }
            >
              {lane.count}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className={
                  "rounded-2xl px-3 py-2 text-xs shadow " +
                  (theme === "dark"
                    ? "bg-slate-900 text-slate-300"
                    : "bg-slate-50 text-slate-600")
                }
              >
                {lane.title} trade · {index + 1}h ago
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const DonutChart = ({ theme }: { theme: "light" | "dark" }) => (
  <svg viewBox="0 0 200 200" className="h-40 w-40" aria-hidden="true">
    <circle
      cx="100"
      cy="100"
      r="70"
      fill="none"
      stroke={theme === "dark" ? "#1f2937" : "#e2e8f0"}
      strokeWidth="20"
    />
    <circle
      cx="100"
      cy="100"
      r="70"
      fill="none"
      stroke="#34d399"
      strokeWidth="20"
      strokeDasharray="220 440"
      strokeLinecap="round"
      transform="rotate(-90 100 100)"
    />
    <circle
      cx="100"
      cy="100"
      r="70"
      fill="none"
      stroke="#60a5fa"
      strokeWidth="20"
      strokeDasharray="140 440"
      strokeLinecap="round"
      transform="rotate(60 100 100)"
    />
    <circle
      cx="100"
      cy="100"
      r="70"
      fill="none"
      stroke="#fbbf24"
      strokeWidth="20"
      strokeDasharray="80 440"
      strokeLinecap="round"
      transform="rotate(140 100 100)"
    />
  </svg>
);

const DashboardA = ({ theme }: { theme: "light" | "dark" }) => (
  <div
    className={
      "flex flex-1 flex-col gap-6 px-5 py-6 " +
      (theme === "dark" ? "text-slate-100" : "text-slate-700")
    }
  >
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Portfolio balance
        </div>
        <div className="mt-2 text-3xl font-semibold">$128,420.32</div>
        <div className="mt-1 text-sm text-emerald-400">+$4,820 (3.9%)</div>
      </div>
      <div
        className={
          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest " +
          (theme === "dark"
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-emerald-100 text-emerald-600")
        }
      >
        Live
      </div>
    </div>
    <div className="flex items-center justify-center rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-black py-4">
      <DonutChart theme={theme} />
    </div>
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Day P&L", value: "+$1,240" },
        { label: "Total Return", value: "+18.4%" },
        { label: "Active Trades", value: "6" },
      ].map((stat) => (
        <div
          key={stat.label}
          className={
            "rounded-2xl px-3 py-3 text-center text-xs shadow " +
            (theme === "dark"
              ? "bg-slate-900 text-slate-200"
              : "bg-white text-slate-700")
          }
        >
          <div className="text-[10px] uppercase tracking-widest text-slate-400">
            {stat.label}
          </div>
          <div className="mt-2 text-sm font-semibold">{stat.value}</div>
        </div>
      ))}
    </div>
    <div
      className={
        "rounded-3xl px-4 py-4 shadow-lg " +
        (theme === "dark"
          ? "bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950"
          : "bg-gradient-to-br from-white via-slate-50 to-slate-100")
      }
    >
      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
        Allocation focus
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>BTC / ETH / SOL</span>
        <span className="text-emerald-400">72% core</span>
      </div>
    </div>
  </div>
);

const DashboardB = ({ theme }: { theme: "light" | "dark" }) => {
  const textPrimary = theme === "dark" ? "text-white" : "text-slate-700";
  const textMuted = theme === "dark" ? "text-white/60" : "text-slate-500";
  const glassPanel =
    theme === "dark"
      ? "border-white/20 bg-white/10"
      : "border-slate-200/60 bg-white/70";

  return (
    <div
      className={
        "flex flex-1 flex-col gap-6 px-5 py-6 " +
        (theme === "dark" ? "text-slate-100" : "text-slate-700")
      }
    >
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-400/30 via-sky-400/20 to-fuchsia-300/20 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_55%)]" />
        <div className="relative">
          <div className={`text-xs uppercase tracking-[0.3em] ${textMuted}`}>
            Total balance
          </div>
          <div
            className={`balance-pulse mt-2 text-3xl font-semibold ${textPrimary} animate-[pulseBalance_4s_ease-in-out_infinite]`}
          >
            $128,420.32
          </div>
          <div className={`mt-1 text-sm ${textPrimary}`}>+$4,820 (3.9%)</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`rounded-3xl border ${glassPanel} p-4 shadow-lg backdrop-blur-xl`}
        >
          <div className={`text-xs uppercase tracking-[0.3em] ${textMuted}`}>
            Allocation
          </div>
          <div className="mt-3 flex justify-center">
            <DonutChart theme={theme} />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { label: "Day P&L", value: "+$1,240" },
            { label: "Total Return", value: "+18.4%" },
            { label: "Active Trades", value: "6" },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl border ${glassPanel} px-3 py-3 text-xs ${textPrimary} shadow-lg backdrop-blur-xl`}
            >
              <div className={`text-[10px] uppercase tracking-widest ${textMuted}`}>
                {stat.label}
              </div>
              <div className={`mt-2 text-sm font-semibold ${textPrimary}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className={`rounded-[32px] border ${glassPanel} p-4 shadow-xl backdrop-blur-xl`}
      >
        <div className={`text-xs uppercase tracking-[0.3em] ${textMuted}`}>
          Active strategies
        </div>
        <div className={`mt-3 flex items-center justify-between text-sm ${textPrimary}`}>
          <span>Momentum + Mean Revert</span>
          <span className={theme === "dark" ? "text-emerald-200" : "text-emerald-600"}>
            3 running
          </span>
        </div>
      </div>
    </div>
  );
};

const Screen = ({
  theme,
  ticker,
  children,
}: {
  theme: "light" | "dark";
  ticker: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="flex h-full flex-col">
    {ticker}
    {children}
    <BottomTabs theme={theme} />
  </div>
);

export default function MobileMockupsPage() {
  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
            ClawDesk Trading
          </div>
          <h1 className="mt-2 text-3xl font-semibold">
            iPhone mockups · Price ticker · Ask Penny · Trades · Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Two visual directions for each tab with premium, crypto-native aesthetics. Mix and
            match price ticker versions across tabs.
          </p>
        </div>

        <section className="grid gap-8 lg:grid-cols-2">
          <PhoneFrame title="Price ticker · Version A" theme="light">
            <Screen theme="light" ticker={<PriceTickerA theme="light" />}>
              <AskPennyA theme="light" />
            </Screen>
          </PhoneFrame>
          <PhoneFrame title="Price ticker · Version A" theme="dark">
            <Screen theme="dark" ticker={<PriceTickerA theme="dark" />}>
              <AskPennyA theme="dark" />
            </Screen>
          </PhoneFrame>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <PhoneFrame title="Price ticker · Version B" theme="light">
            <Screen theme="light" ticker={<PriceTickerB theme="light" />}>
              <AskPennyB theme="light" />
            </Screen>
          </PhoneFrame>
          <PhoneFrame title="Price ticker · Version B" theme="dark">
            <Screen theme="dark" ticker={<PriceTickerB theme="dark" />}>
              <AskPennyB theme="dark" />
            </Screen>
          </PhoneFrame>
        </section>

        <section className="mt-14 grid gap-8 lg:grid-cols-2">
          <PhoneFrame title="Trades · Version A" theme="light">
            <Screen theme="light" ticker={<PriceTickerA theme="light" />}>
              <TradesA theme="light" />
            </Screen>
          </PhoneFrame>
          <PhoneFrame title="Trades · Version A" theme="dark">
            <Screen theme="dark" ticker={<PriceTickerA theme="dark" />}>
              <TradesA theme="dark" />
            </Screen>
          </PhoneFrame>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <PhoneFrame title="Trades · Version B" theme="light">
            <Screen theme="light" ticker={<PriceTickerB theme="light" />}>
              <TradesB theme="light" />
            </Screen>
          </PhoneFrame>
          <PhoneFrame title="Trades · Version B" theme="dark">
            <Screen theme="dark" ticker={<PriceTickerB theme="dark" />}>
              <TradesB theme="dark" />
            </Screen>
          </PhoneFrame>
        </section>

        <section className="mt-14 grid gap-8 lg:grid-cols-2">
          <PhoneFrame title="Dashboard · Version A" theme="dark">
            <Screen theme="dark" ticker={<PriceTickerA theme="dark" />}>
              <DashboardA theme="dark" />
            </Screen>
          </PhoneFrame>
          <PhoneFrame title="Dashboard · Version A" theme="light">
            <Screen theme="light" ticker={<PriceTickerA theme="light" />}>
              <DashboardA theme="light" />
            </Screen>
          </PhoneFrame>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <PhoneFrame title="Dashboard · Version B" theme="dark">
            <Screen theme="dark" ticker={<PriceTickerB theme="dark" />}>
              <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.35),_transparent_55%)]">
                <DashboardB theme="dark" />
              </div>
            </Screen>
          </PhoneFrame>
          <PhoneFrame title="Dashboard · Version B" theme="light">
            <Screen theme="light" ticker={<PriceTickerB theme="light" />}>
              <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%)]">
                <DashboardB theme="light" />
              </div>
            </Screen>
          </PhoneFrame>
        </section>
      </div>

      <style jsx global>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes wave {
          0%,
          100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1.1);
          }
        }
        @keyframes pulseBalance {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-marquee,
          .wave-bar,
          .balance-pulse {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
