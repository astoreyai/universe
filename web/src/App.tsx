import React, { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { initEngine, engine } from "./engine/wasm-bridge";
import { ClockDashboard } from "./components/ClockDashboard";
const DilationTable = lazy(() =>
  import("./components/DilationTable").then((m) => ({ default: m.DilationTable }))
);
const SolarSystemView = lazy(() =>
  import("./scenes/SolarSystemView").then((m) => ({ default: m.SolarSystemView }))
);
const BlackHoleView = lazy(() =>
  import("./scenes/BlackHoleView").then((m) => ({ default: m.BlackHoleView }))
);
const TwinParadoxView = lazy(() =>
  import("./scenes/TwinParadoxView").then((m) => ({ default: m.TwinParadoxView }))
);
const CosmicTimelineView = lazy(() =>
  import("./scenes/CosmicTimelineView").then((m) => ({ default: m.CosmicTimelineView }))
);

type Tab = "clocks" | "dilation" | "solar" | "blackhole" | "twins" | "cosmos";

const TAB_LABELS: Record<Tab, string> = {
  clocks: "Time Scales",
  dilation: "Dilation Map",
  solar: "Solar System",
  blackhole: "Black Hole",
  twins: "Twin Paradox",
  cosmos: "Cosmology",
};

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("clocks");

  useEffect(() => {
    initEngine()
      .then(() => {
        // Expose engine to window for Playwright mathematical rigor tests
        (window as any).__engine = engine;
        setReady(true);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Keyboard navigation: 1-6 switch tabs
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    const tabs: Tab[] = ["clocks", "dilation", "solar", "blackhole", "twins", "cosmos"];
    const num = parseInt(e.key);
    if (num >= 1 && num <= 6) setActiveTab(tabs[num - 1]);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Failed to load engine: {error}</div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.title}>UNIVERSE CLOCK</div>
          <div style={styles.subtitle}>Initializing physics engine...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>UNIVERSE CLOCK</h1>
        <p style={styles.subtitle}>
          Relativistic Multi-Frame Temporal System
        </p>
      </header>

      <nav style={styles.nav}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            title={`${TAB_LABELS[tab]} (press ${i + 1})`}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
          >
            <span style={styles.tabKey}>{i + 1}</span> {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {activeTab === "clocks" && <ClockDashboard />}
        <Suspense fallback={<div style={styles.loading}><div style={styles.subtitle}>Loading 3D scene...</div></div>}>
          {activeTab === "dilation" && <DilationTable />}
          {activeTab === "solar" && <SolarSystemView />}
          {activeTab === "blackhole" && <BlackHoleView />}
          {activeTab === "twins" && <TwinParadoxView />}
          {activeTab === "cosmos" && <CosmicTimelineView />}
        </Suspense>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, #0a0a1a 0%, #0f0f2a 100%)",
  },
  header: {
    textAlign: "center",
    padding: "14px 20px 6px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 700,
    letterSpacing: "6px",
    background: "linear-gradient(90deg, #3b82f6 0%, #60a5fa 20%, #a78bfa 50%, #60a5fa 80%, #3b82f6 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: "2px",
  },
  subtitle: {
    fontSize: "11px",
    color: "#6b7280",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  nav: {
    display: "flex",
    justifyContent: "center",
    gap: "4px",
    padding: "8px 20px",
    flexWrap: "wrap",
  },
  tab: {
    padding: "6px 14px",
    border: "1px solid #1e293b",
    borderRadius: "6px",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "12px",
    letterSpacing: "0.5px",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  },
  tabActive: {
    background: "#1e293b",
    color: "#e2e8f0",
    borderColor: "#3b82f6",
  },
  tabKey: {
    fontSize: "9px",
    opacity: 0.4,
    marginRight: "2px",
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: "8px 16px 16px",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "12px",
  },
  error: {
    color: "#ef4444",
    textAlign: "center",
    padding: "40px",
    background: "#1e0f0f",
    borderRadius: "8px",
    border: "1px solid #ef4444",
    margin: "20px",
  },
};
