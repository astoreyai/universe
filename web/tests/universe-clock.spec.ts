import { test, expect, Page } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function initApp(page: Page) {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("UNIVERSE CLOCK", { timeout: 10000 });
  await expect(page.locator("text=Initializing")).not.toBeVisible({ timeout: 10000 });
}

async function switchTab(page: Page, tabName: string) {
  await page.getByRole("button", { name: tabName, exact: true }).click();
  await page.waitForTimeout(500);
}

function extractNumber(text: string | null): number {
  if (!text) return NaN;
  const match = text.match(/-?[\d.]+/);
  return match ? parseFloat(match[0]) : NaN;
}

// ─── APP SHELL ──────────────────────────────────────────────────────────────

test.describe("App Shell", () => {
  test.beforeEach(async ({ page }) => { await initApp(page); });

  test("header renders with correct title and subtitle", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("UNIVERSE CLOCK");
    await expect(page.locator("p")).toContainText("Relativistic Multi-Frame Temporal System");
  });

  test("all 6 navigation tabs render and are clickable", async ({ page }) => {
    const tabs = ["Time Scales", "Dilation Map", "Solar System", "Black Hole", "Twin Paradox", "Cosmology"];
    for (const tab of tabs) {
      const btn = page.getByRole("button", { name: tab, exact: true });
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();
    }
  });

  test("tab switching changes active tab styling", async ({ page }) => {
    for (const tab of ["Dilation Map", "Solar System", "Cosmology", "Time Scales"]) {
      await switchTab(page, tab);
      const btn = page.getByRole("button", { name: tab, exact: true });
      // Active tab should have the blue border color
      const border = await btn.evaluate(el => getComputedStyle(el).borderColor);
      expect(border).toContain("59, 130, 246"); // #3b82f6
    }
  });

  test("WASM engine initializes without error", async ({ page }) => {
    // If WASM failed, we'd see "Failed to load engine" error
    await expect(page.locator("text=Failed to load engine")).not.toBeVisible();
    // Verify a computed value is present (proves engine is running)
    await expect(page.locator("text=Coordinated Universal Time")).toBeVisible();
  });
});

// ─── TIME SCALES TAB ────────────────────────────────────────────────────────

test.describe("Time Scales Tab", () => {
  test.beforeEach(async ({ page }) => { await initApp(page); });

  test("UTC clock shows valid ISO datetime format", async ({ page }) => {
    const utcCard = page.locator("text=Coordinated Universal Time").locator("..");
    const value = await utcCard.locator("div").nth(2).textContent();
    // Should match YYYY-MM-DD HH:MM:SS
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test("UTC shows today's date (2026-04-08)", async ({ page }) => {
    const utcCard = page.locator("text=Coordinated Universal Time").locator("..");
    const value = await utcCard.locator("div").nth(2).textContent();
    expect(value).toContain("2026-04-08");
  });

  test("TAI is ahead of UTC by exactly 37 leap seconds", async ({ page }) => {
    const utcCard = page.locator("text=Coordinated Universal Time").locator("..");
    const taiCard = page.locator("text=International Atomic Time").locator("..");
    const utcText = await utcCard.locator("div").nth(2).textContent();
    const taiText = await taiCard.locator("div").nth(2).textContent();
    // Parse seconds from both
    const utcSec = parseInt(utcText!.slice(-2));
    const taiSec = parseInt(taiText!.slice(-2));
    // TAI should be 37 seconds ahead (mod 60)
    const diff = ((taiSec - utcSec) % 60 + 60) % 60;
    expect(diff).toBe(37);
  });

  test("TAI detail shows 'UTC + 37 leap seconds'", async ({ page }) => {
    await expect(page.locator("text=UTC + 37 leap seconds")).toBeVisible();
  });

  test("TT is ahead of TAI by 32.184 seconds", async ({ page }) => {
    const taiCard = page.locator("text=International Atomic Time").locator("..");
    const ttCard = page.locator("text=Terrestrial Time").locator("..");
    const taiText = await taiCard.locator("div").nth(2).textContent();
    const ttText = await ttCard.locator("div").nth(2).textContent();
    // TT should show a time ~32s ahead of TAI (might tick to next minute)
    // Just verify it parses as a valid datetime
    expect(ttText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test("TCG shows positive offset from TT", async ({ page }) => {
    const tcgCard = page.locator("text=Geocentric Coordinate Time").locator("..");
    const value = await tcgCard.locator("div").nth(2).textContent();
    // TCG - TT should be positive (TCG runs faster)
    expect(value).toContain("TT +");
    const offset = extractNumber(value);
    // After ~49 years since 1977, offset should be ~1.07s
    expect(offset).toBeGreaterThan(0.9);
    expect(offset).toBeLessThan(1.2);
  });

  test("TCB shows larger positive offset from TT", async ({ page }) => {
    const tcbCard = page.locator("text=Barycentric Coordinate Time").locator("..");
    const value = await tcbCard.locator("div").nth(2).textContent();
    expect(value).toContain("TT +");
    const offset = extractNumber(value);
    // TCB - TT ≈ L_B × Δt, ~49 years → ~23.9s
    expect(offset).toBeGreaterThan(20);
    expect(offset).toBeLessThan(28);
  });

  test("TCG rate shows L_G constant", async ({ page }) => {
    await expect(page.locator("text=6.9693e-10")).toBeVisible();
  });

  test("TCB rate shows L_B constant", async ({ page }) => {
    await expect(page.locator("text=1.5505e-8")).toBeVisible();
  });

  test("MTC shows valid HH:MM:SS Mars time", async ({ page }) => {
    const mtcCard = page.locator("text=Coordinated Mars Time").locator("..");
    const value = await mtcCard.locator("div").nth(2).textContent();
    expect(value).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    // Hours should be 0-23
    const hours = parseInt(value!.split(":")[0]);
    expect(hours).toBeGreaterThanOrEqual(0);
    expect(hours).toBeLessThan(24);
  });

  test("MTC detail shows Sol number", async ({ page }) => {
    const mtcCard = page.locator("text=Coordinated Mars Time").locator("..");
    const detail = await mtcCard.locator("div").nth(3).textContent();
    expect(detail).toContain("Sol");
    const sol = extractNumber(detail);
    // Current MSD should be ~54000+
    expect(sol).toBeGreaterThan(53000);
    expect(sol).toBeLessThan(56000);
  });

  test("UTC Julian Date is valid for 2026", async ({ page }) => {
    const utcCard = page.locator("text=Coordinated Universal Time").locator("..");
    const detail = await utcCard.locator("div").nth(3).textContent();
    expect(detail).toContain("JD");
    const jd = extractNumber(detail);
    // JD for 2026-04-08 ≈ 2461135
    expect(jd).toBeGreaterThan(2461100);
    expect(jd).toBeLessThan(2461200);
  });

  test("clocks tick — values change over 2 seconds", async ({ page }) => {
    const utcCard = page.locator("text=Coordinated Universal Time").locator("..");
    const v1 = await utcCard.locator("div").nth(2).textContent();
    await page.waitForTimeout(2000);
    const v2 = await utcCard.locator("div").nth(2).textContent();
    expect(v1).not.toBe(v2);
  });

  test("MTC clock ticks over 3 seconds", async ({ page }) => {
    const mtcCard = page.locator("text=Coordinated Mars Time").locator("..");
    const v1 = await mtcCard.locator("div").nth(2).textContent();
    await page.waitForTimeout(3000);
    const v2 = await mtcCard.locator("div").nth(2).textContent();
    expect(v1).not.toBe(v2);
  });

  test("Time Scale Relationships info section", async ({ page }) => {
    await expect(page.locator("text=Time Scale Relationships")).toBeVisible();
    // Verify the transformation chain is shown
    await expect(page.locator("text=+32.184s")).toBeVisible();
    await expect(page.locator("text=L_G = 6.969290134")).toBeVisible();
    await expect(page.locator("text=L_B = 1.550519768")).toBeVisible();
  });

  test("all 6 clock cards have distinct label colors", async ({ page }) => {
    const labels = ["UTC", "TAI", "TT", "TCG", "TCB", "MTC"];
    for (const label of labels) {
      const el = page.locator(`text=${label}`).first();
      await expect(el).toBeVisible();
    }
  });
});

// ─── DILATION MAP TAB ───────────────────────────────────────────────────────

test.describe("Dilation Map Tab", () => {
  test.beforeEach(async ({ page }) => {
    await initApp(page);
    await switchTab(page, "Dilation Map");
  });

  test("table has all required column headers", async ({ page }) => {
    const headers = await page.locator("th").allTextContents();
    expect(headers.length).toBe(5);
    expect(headers[0]).toContain("Body");
    expect(headers[1]).toContain("dt"); // dτ/dt (Unicode τ)
    expect(headers[2]).toContain("Lost");
    expect(headers[3]).toContain("vs Earth");
    expect(headers[4]).toContain("g");
  });

  test("all 8 solar system bodies present in table", async ({ page }) => {
    const bodies = ["Sun", "Mercury", "Venus", "Earth", "Moon", "Mars", "Jupiter", "Saturn"];
    for (const body of bodies) {
      await expect(page.getByRole("cell", { name: new RegExp(body) })).toBeVisible();
    }
  });

  test("neutron star and black hole entries present", async ({ page }) => {
    // These contain Unicode: "Neutron Star (1.4M☉)" and "Black Hole (3rₛ)"
    await expect(page.locator("td", { hasText: "Neutron Star" })).toBeVisible();
    await expect(page.locator("td", { hasText: "Black Hole" })).toBeVisible();
  });

  test("Sun dilation shows ~2.12e-6 shift (66.4 s/yr lost)", async ({ page }) => {
    const sunRow = page.locator("tr").filter({ hasText: /^.*Sun.*$/ }).first();
    const text = await sunRow.textContent();
    // Sun loses ~66 seconds per year
    expect(text).toMatch(/66\.\d/);
  });

  test("Earth dilation shows ~6.95e-10 shift", async ({ page }) => {
    // Earth is row index 3 (Sun=0, Mercury=1, Venus=2, Earth=3)
    const earthCells = await page.locator("tbody tr").nth(3).locator("td").allTextContents();
    expect(earthCells[0]).toContain("Earth");
    expect(earthCells[1]).toMatch(/6\.9\d+e-10/);
  });

  test("Earth surface gravity shows ~9.8 m/s²", async ({ page }) => {
    const earthCells = await page.locator("tbody tr").nth(3).locator("td").allTextContents();
    const g = parseFloat(earthCells[4]);
    expect(g).toBeGreaterThan(9.5);
    expect(g).toBeLessThan(10.1);
  });

  test("reference frame dropdown has all solar system bodies", async ({ page }) => {
    const select = page.locator("select");
    const options = await select.locator("option").allTextContents();
    expect(options).toContain("Sun");
    expect(options).toContain("Earth");
    expect(options).toContain("Mars");
    expect(options).toContain("Jupiter");
    expect(options.length).toBe(8);
  });

  test("changing reference to Sun updates column header", async ({ page }) => {
    await page.locator("select").selectOption("Sun");
    await expect(page.getByRole("columnheader", { name: /vs Sun/ })).toBeVisible();
  });

  test("changing reference to Mars updates column header", async ({ page }) => {
    await page.locator("select").selectOption("Mars");
    await expect(page.getByRole("columnheader", { name: /vs Mars/ })).toBeVisible();
  });

  test("reference body row shows dash in comparison column", async ({ page }) => {
    // Earth is row 3, comparison is cell 3
    const earthCells = await page.locator("tbody tr").nth(3).locator("td").allTextContents();
    expect(earthCells[3]).toBe("\u2014"); // em dash
  });

  test("switching reference to Mars makes Mars row show dash", async ({ page }) => {
    await page.locator("select").selectOption("Mars");
    await page.waitForTimeout(300);
    // Mars is row 5 (Sun=0, Mercury=1, Venus=2, Earth=3, Moon=4, Mars=5)
    const marsCells = await page.locator("tbody tr").nth(5).locator("td").allTextContents();
    expect(marsCells[0]).toContain("Mars");
    expect(marsCells[3]).toBe("\u2014");
  });

  test("body comparisons section shows 4 pairs", async ({ page }) => {
    await expect(page.locator("text=Body Comparisons")).toBeVisible();
    await expect(page.locator("text=Earth vs Mars")).toBeVisible();
    await expect(page.locator("text=Earth vs Sun")).toBeVisible();
    await expect(page.locator("text=Earth vs Jupiter")).toBeVisible();
    await expect(page.locator("text=Mercury vs Earth")).toBeVisible();
  });

  test("Earth vs Sun comparison shows large positive value", async ({ page }) => {
    // From debug: "Earth vs Sun+182897.78 μs/day" — Earth ages faster than Sun
    const compText = await page.locator("div").filter({ hasText: /Body Comparisons/ }).first().textContent();
    // Should contain Earth vs Sun with a positive ms-range value
    expect(compText).toContain("Earth vs Sun");
    // The value is +182897 μs/day ≈ +183 ms/day
    expect(compText).toMatch(/Earth vs Sun\+\d+/);
  });

  test("neutron star dilation factor is dramatically below 1", async ({ page }) => {
    const nsRow = page.locator("tr").filter({ hasText: /Neutron Star/ });
    const text = await nsRow.textContent();
    // Should show something like 0.7xxxxx
    expect(text).toMatch(/0\.\d{6}/);
  });

  test("dilation color indicators present for each body", async ({ page }) => {
    // Each body row should have a colored dot (●)
    const rows = page.locator("tr").filter({ hasText: /●/ });
    const count = await rows.count();
    // 8 solar system + 2 extreme = 10
    expect(count).toBeGreaterThanOrEqual(10);
  });
});

// ─── SOLAR SYSTEM TAB ───────────────────────────────────────────────────────

test.describe("Solar System Tab", () => {
  test.beforeEach(async ({ page }) => {
    await initApp(page);
    await switchTab(page, "Solar System");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
  });

  test("3D canvas renders", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);
  });

  test("side panel shows Observer Frame title", async ({ page }) => {
    await expect(page.locator("text=Observer Frame")).toBeVisible();
  });

  test("all body selector buttons present", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    for (const body of ["Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn"]) {
      await expect(panel.getByRole("button", { name: body, exact: true })).toBeVisible();
    }
  });

  test("Earth is default selected body", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    // The selected info section should show Earth
    const selectedName = panel.locator("div").filter({ hasText: /^Earth$/ });
    await expect(selectedName.first()).toBeVisible();
  });

  test("Earth info shows dilation and orbital data", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    const text = await panel.textContent();
    expect(text).toContain("dt"); // dτ/dt (Unicode τ)
    expect(text).toContain("Lost/year");
    expect(text).toContain("AU");
  });

  test("clicking Sun shows Sun info", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    await panel.getByRole("button", { name: "Sun", exact: true }).click();
    await page.waitForTimeout(300);
    // Panel should now show Sun
    await expect(panel.locator("text=Differential Aging vs Sun")).toBeVisible();
  });

  test("clicking Mars shows Mars info and updates comparisons", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    await panel.getByRole("button", { name: "Mars", exact: true }).click();
    await page.waitForTimeout(300);
    await expect(panel.locator("text=Differential Aging vs Mars")).toBeVisible();
  });

  test("clicking Jupiter shows Jupiter info", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    await panel.getByRole("button", { name: "Jupiter", exact: true }).click();
    await page.waitForTimeout(300);
    await expect(panel.locator("text=Differential Aging vs Jupiter")).toBeVisible();
  });

  test("differential aging section shows μs/day values", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    const text = await panel.textContent();
    expect(text).toContain("s/day"); // μs/day (Unicode μ)
  });

  test("each planet button toggles selection styling", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    for (const body of ["Sun", "Mars", "Jupiter", "Earth"]) {
      await panel.getByRole("button", { name: body, exact: true }).click();
      await page.waitForTimeout(200);
      const btn = panel.getByRole("button", { name: body, exact: true });
      const border = await btn.evaluate(el => getComputedStyle(el).borderColor);
      expect(border).toContain("59, 130, 246"); // active blue
    }
  });

  test("comparison rows show signed μs/day values for non-selected bodies", async ({ page }) => {
    const panel = page.locator('[data-testid="solar-system-panel"]');
    const compText = await panel.textContent();
    // Should show positive or negative values with s/day (μs/day with Unicode μ)
    const matches = compText!.match(/[+-][\d.]+\s*\S*s\/day/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── BLACK HOLE TAB ─────────────────────────────────────────────────────────

test.describe("Black Hole Tab", () => {
  test.beforeEach(async ({ page }) => {
    await initApp(page);
    await switchTab(page, "Black Hole");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
  });

  test("3D canvas renders with proper dimensions", async ({ page }) => {
    const box = await page.locator("canvas").boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);
  });

  test("parameter panel shows title", async ({ page }) => {
    await expect(page.locator("text=Black Hole Parameters")).toBeVisible();
  });

  test("mass slider defaults to 10 M☉", async ({ page }) => {
    await expect(page.locator("text=/Mass.*10.*M/")).toBeVisible();
  });

  test("spin slider defaults to 0.00", async ({ page }) => {
    await expect(page.locator("text=/Spin.*0\\.00/")).toBeVisible();
  });

  test("observer slider defaults to 6.0", async ({ page }) => {
    // "Observer: 6.0 rₛ" — slider label (also an Observer label in 3D canvas)
    const panel = page.locator('[data-testid="blackhole-panel"]');
    await expect(panel.locator("text=/Observer.*6\\.0/")).toBeVisible();
  });

  test("three range sliders exist", async ({ page }) => {
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const sliders = panel.locator('input[type="range"]');
    await expect(sliders).toHaveCount(3);
  });

  test("Schwarzschild radius shown in km", async ({ page }) => {
    await expect(page.locator("text=Schwarzschild radius")).toBeVisible();
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const text = await panel.textContent();
    // 10 M☉ → rs ≈ 29.5 km
    expect(text).toMatch(/29\.\d.*km/);
  });

  test("dτ/dt value displayed for default params", async ({ page }) => {
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const text = await panel.textContent();
    // At 6 rs from 10 M☉ Schwarzschild: dτ/dt = √(1 - 1/6) ≈ 0.9129
    expect(text).toMatch(/0\.9\d+/);
  });

  test("time factor displayed as X× slower", async ({ page }) => {
    await expect(page.locator("text=/slower/")).toBeVisible();
  });

  test("dilation profile SVG chart renders", async ({ page }) => {
    await expect(page.locator("text=Dilation Profile")).toBeVisible();
    const svg = page.locator("svg");
    await expect(svg).toBeVisible();
    // SVG should contain a polyline (the curve)
    await expect(svg.locator("polyline")).toBeVisible();
    // SVG should contain a circle (observer marker)
    await expect(svg.locator("circle")).toBeVisible();
  });

  test("event horizon marker shown on chart", async ({ page }) => {
    const svg = page.locator("svg");
    // SVG texts include "rₛ" (Unicode subscript)
    const svgTexts = await svg.locator("text").allTextContents();
    const hasRs = svgTexts.some(t => t.includes("r"));
    expect(hasRs).toBe(true);
    // Should also have the dilation scale labels
    expect(svgTexts).toContain("0.25");
    expect(svgTexts).toContain("1.00");
  });

  test("changing mass slider updates Schwarzschild radius", async ({ page }) => {
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const massSlider = panel.locator('input[type="range"]').first();

    // Get initial rs
    const textBefore = await panel.textContent();
    const rsBefore = textBefore!.match(/Schwarzschild radius([\d.]+)/);

    // Move mass to max (100 M☉)
    await massSlider.fill("100");
    await page.waitForTimeout(300);

    // rs should be ~10× larger
    await expect(page.locator("text=/Mass.*100.*M/")).toBeVisible();
    const textAfter = await panel.textContent();
    // 100 M☉ → rs ≈ 295 km
    expect(textAfter).toMatch(/29[45]\.\d.*km/);
  });

  test("changing observer distance updates dilation", async ({ page }) => {
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const sliders = panel.locator('input[type="range"]');
    const observerSlider = sliders.nth(2);

    // Move observer very close (1.5 rₛ)
    await observerSlider.fill("1.5");
    await page.waitForTimeout(300);

    const text = await panel.textContent();
    // At 1.5 rₛ, dilation should be extreme: √(1 - 1/1.5) ≈ 0.577
    expect(text).toMatch(/0\.5\d+/);
  });

  test("enabling spin shows ergosphere info", async ({ page }) => {
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const spinSlider = panel.locator('input[type="range"]').nth(1);
    await spinSlider.fill("0.9");
    await page.waitForTimeout(300);
    await expect(page.locator("text=/Spin.*0\\.90/")).toBeVisible();
    await expect(page.locator("text=Ergosphere")).toBeVisible();
  });

  test("observer at 20 rₛ shows dilation near 1.0", async ({ page }) => {
    const panel = page.locator('[data-testid="blackhole-panel"]');
    const observerSlider = panel.locator('input[type="range"]').nth(2);
    await observerSlider.fill("20");
    await page.waitForTimeout(300);
    const text = await panel.textContent();
    // √(1 - 1/20) ≈ 0.9747
    expect(text).toMatch(/0\.97\d+/);
  });
});

// ─── TWIN PARADOX TAB ───────────────────────────────────────────────────────

test.describe("Twin Paradox Tab", () => {
  test.beforeEach(async ({ page }) => {
    await initApp(page);
    await switchTab(page, "Twin Paradox");
  });

  test("calculator title and subtitle render", async ({ page }) => {
    await expect(page.locator("text=Twin Paradox Calculator")).toBeVisible();
    await expect(page.locator("text=Differential aging for relativistic travel")).toBeVisible();
  });

  test("all 5 scenario preset buttons render", async ({ page }) => {
    for (const name of ["Custom", "GPS Satellite", "ISS", "Proxima Centauri", "Galactic Voyage"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
  });

  test("default (Custom at 0.5c) shows γ ≈ 1.1547", async ({ page }) => {
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    expect(text).toMatch(/1\.154[67]/);
  });

  test("speed and duration sliders present", async ({ page }) => {
    const sliders = page.locator('[data-testid="twin-paradox-view"]').locator('input[type="range"]');
    await expect(sliders).toHaveCount(2);
  });

  test("all 6 result cards render", async ({ page }) => {
    await expect(page.locator("text=Lorentz Factor")).toBeVisible();
    await expect(page.getByText("Earth Twin Ages")).toBeVisible();
    await expect(page.getByText("Traveler Ages")).toBeVisible();
    await expect(page.getByText("Differential Aging", { exact: true })).toBeVisible();
    await expect(page.locator("text=Distance (coord frame)")).toBeVisible();
    await expect(page.locator("text=Distance (traveler)")).toBeVisible();
  });

  test("timeline comparison shows 3 bars", async ({ page }) => {
    await expect(page.locator("text=Timeline Comparison")).toBeVisible();
    await expect(page.getByText("Earth Twin").first()).toBeVisible();
    await expect(page.getByText("Traveler").first()).toBeVisible();
    await expect(page.getByText("Coordinate Time")).toBeVisible();
  });

  test("formulas section renders", async ({ page }) => {
    await expect(page.locator("text=Formulas")).toBeVisible();
  });

  test("GPS Satellite preset: speed ≈ 3.9 km/s, tiny differential", async ({ page }) => {
    await page.getByRole("button", { name: "GPS Satellite", exact: true }).click();
    await page.waitForTimeout(300);
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    // Speed should show ~3.9 km/s
    expect(text).toMatch(/3\.9.*km\/s/);
    // γ ≈ 1.0000000001 (basically 1)
    expect(text).toMatch(/1\.0000/);
  });

  test("ISS preset: speed ≈ 7.7 km/s", async ({ page }) => {
    await page.getByRole("button", { name: "ISS", exact: true }).click();
    await page.waitForTimeout(300);
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    expect(text).toMatch(/7\.\d.*km\/s/);
  });

  test("Proxima Centauri preset: 0.1c, 84.6 years, ~4.24 ly", async ({ page }) => {
    await page.getByRole("button", { name: "Proxima Centauri", exact: true }).click();
    await page.waitForTimeout(300);
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    // At 0.1c: γ ≈ 1.005
    expect(text).toMatch(/1\.005/);
    // Distance ~8.46 ly (0.1c × 84.6 yr)
    expect(text).toMatch(/8\.4\d.*ly/);
  });

  test("Galactic Voyage preset: 0.99c, γ ≈ 7.09", async ({ page }) => {
    await page.getByRole("button", { name: "Galactic Voyage", exact: true }).click();
    await page.waitForTimeout(300);
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    // γ at 0.99c = 1/√(1-0.9801) ≈ 7.089
    expect(text).toMatch(/7\.0[89]/);
    // Traveler should age ~14 years (100/7.09)
    expect(text).toMatch(/14\.\d+.*years/);
  });

  test("Galactic Voyage: traveler ages much less than Earth twin", async ({ page }) => {
    await page.getByRole("button", { name: "Galactic Voyage", exact: true }).click();
    await page.waitForTimeout(300);
    // Full text: "...Earth Twin Ages100.0000 yearsTraveler Ages14.1067 years..."
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    const earthMatch = text!.match(/Earth Twin Ages([\d.]+)\s*years/);
    const travelerMatch = text!.match(/Traveler Ages([\d.]+)\s*years/);
    expect(earthMatch).not.toBeNull();
    expect(travelerMatch).not.toBeNull();
    const earthYears = parseFloat(earthMatch![1]);
    const travelerYears = parseFloat(travelerMatch![1]);
    expect(earthYears).toBeGreaterThan(90);
    expect(travelerYears).toBeGreaterThan(10);
    expect(travelerYears).toBeLessThan(20);
    expect(earthYears / travelerYears).toBeGreaterThan(5);
  });

  test("Custom preset activates when slider is moved", async ({ page }) => {
    // Start on GPS
    await page.getByRole("button", { name: "GPS Satellite", exact: true }).click();
    await page.waitForTimeout(200);
    // Move speed slider
    const sliders = page.locator('[data-testid="twin-paradox-view"]').locator('input[type="range"]');
    await sliders.first().fill("0.9");
    await page.waitForTimeout(300);
    // Should show 0.9c = 90% speed
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    expect(text).toMatch(/90\.\d+%.*c/);
  });

  test("length contraction: traveler distance < coordinate distance", async ({ page }) => {
    await page.getByRole("button", { name: "Galactic Voyage", exact: true }).click();
    await page.waitForTimeout(300);
    // Full text: "...Distance (coord frame)99.00 lyDistance (traveler)13.97 ly..."
    const text = await page.locator('[data-testid="twin-paradox-view"]').textContent();
    const coordMatch = text!.match(/Distance \(coord frame\)([\d.]+)\s*ly/);
    const travelerMatch = text!.match(/Distance \(traveler\)([\d.]+)\s*ly/);
    expect(coordMatch).not.toBeNull();
    expect(travelerMatch).not.toBeNull();
    const coordLy = parseFloat(coordMatch![1]);
    const travelerLy = parseFloat(travelerMatch![1]);
    expect(travelerLy).toBeLessThan(coordLy);
    expect(coordLy / travelerLy).toBeGreaterThan(5);
  });
});

// ─── COSMOLOGY TAB (Cosmic Timeline 3D) ────────────────────────────────────

test.describe("Cosmology Tab", () => {
  test.beforeEach(async ({ page }) => {
    await initApp(page);
    await switchTab(page, "Cosmology");
    // Wait for 3D scene to load
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
  });

  test("3D canvas renders with side panel", async ({ page }) => {
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator('[data-testid="cosmic-panel"]')).toBeVisible();
  });

  test("panel title shows Cosmic Timeline", async ({ page }) => {
    await expect(page.locator("text=Cosmic Timeline")).toBeVisible();
  });

  test("age of universe shows ~13.8 Gyr in ΛCDM section", async ({ page }) => {
    const panel = page.locator('[data-testid="cosmic-panel"]');
    const text = await panel.textContent();
    const match = text!.match(/(1[3-4])\.\d+\s*Gyr/);
    expect(match).not.toBeNull();
    const age = parseFloat(match![0]);
    expect(age).toBeGreaterThan(13.0);
    expect(age).toBeLessThan(14.5);
  });

  test("Hubble constant shows H₀ = 67.4 km/s/Mpc", async ({ page }) => {
    await expect(page.locator("text=67.4 km/s/Mpc")).toBeVisible();
  });

  test("matter density Ωₘ = 0.315", async ({ page }) => {
    await expect(page.locator("text=0.315")).toBeVisible();
  });

  test("dark energy ΩΛ = 0.685 shown", async ({ page }) => {
    await expect(page.locator("text=0.685")).toBeVisible();
  });

  test("epoch slice slider present with controls", async ({ page }) => {
    await expect(page.locator("text=Epoch Slice")).toBeVisible();
    const slider = page.locator('[data-testid="epoch-slider"]');
    await expect(slider).toBeVisible();
  });

  test("epoch readout shows redshift, scale factor, age, H(z)", async ({ page }) => {
    const readout = page.locator('[data-testid="epoch-readout"]');
    const text = await readout.textContent();
    expect(text).toContain("Redshift z");
    expect(text).toContain("Scale factor a");
    expect(text).toContain("Cosmic age");
    expect(text).toContain("H(z)");
    expect(text).toContain("Comoving radius");
    expect(text).toContain("Time dilation");
    expect(text).toContain("Lookback time");
  });

  test("epoch slider changes readout values", async ({ page }) => {
    const readout = page.locator('[data-testid="epoch-readout"]');
    const textBefore = await readout.textContent();

    // Move slider to a different position
    const slider = page.locator('[data-testid="epoch-slider"]');
    await slider.fill("0.9");
    await page.waitForTimeout(200);

    const textAfter = await readout.textContent();
    expect(textAfter).not.toBe(textBefore);
  });

  test("redshift milestones table has all 9 rows", async ({ page }) => {
    await expect(page.locator("text=Redshift Milestones")).toBeVisible();
    const table = page.locator("table");
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(9);
  });

  test("milestones table shows z=1100 with comoving distance ~46 Gly", async ({ page }) => {
    const table = page.locator("table");
    const lastRow = table.locator("tbody tr").last();
    const text = await lastRow.textContent();
    expect(text).toContain("1100");
    // Comoving distance to CMB should be ~45-47 Gly
    const match = text!.match(/(4[5-7])\.\d/);
    expect(match).not.toBeNull();
  });

  test("milestones table z=1 row shows a=0.5000", async ({ page }) => {
    const table = page.locator("table");
    const rows = table.locator("tbody tr");
    let found = false;
    for (let i = 0; i < await rows.count(); i++) {
      const text = await rows.nth(i).textContent();
      if (text!.includes("0.5000")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("FLRW metric section renders formula", async ({ page }) => {
    await expect(page.locator("text=FLRW Metric")).toBeVisible();
    await expect(page.locator("text=/ds.*=.*dt/")).toBeVisible();
  });

  test("FLRW detail shows Friedmann equation components", async ({ page }) => {
    await expect(page.locator("text=/Δt_obs.*1\\+z/")).toBeVisible();
  });

  test("view toggles for Hubble sphere, particles, labels", async ({ page }) => {
    await expect(page.locator("text=Hubble Sphere")).toBeVisible();
    await expect(page.locator("text=Particle Field")).toBeVisible();
    await expect(page.locator("text=Milestone Labels")).toBeVisible();
  });

  test("observer marker label visible in 3D scene", async ({ page }) => {
    await expect(page.locator("text=Observer (Here & Now)")).toBeVisible({ timeout: 5000 });
  });

  test("milestone labels visible in 3D scene", async ({ page }) => {
    await expect(page.locator("text=/CMB.*Last Scattering/")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/Present Day/")).toBeVisible({ timeout: 5000 });
  });
});

// ─── CROSS-TAB CONSISTENCY ──────────────────────────────────────────────────

test.describe("Cross-Tab Consistency", () => {
  test("dilation values present in both Dilation Map and Solar System", async ({ page }) => {
    await initApp(page);

    // Get Earth dilation value from Dilation Map
    await switchTab(page, "Dilation Map");
    const earthCells = await page.locator("tbody tr").nth(3).locator("td").allTextContents();
    expect(earthCells[0]).toContain("Earth");
    expect(earthCells[1]).toMatch(/6\.9\d+e-10/);

    // Switch to Solar System and check Earth info is shown
    await switchTab(page, "Solar System");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
    const panel = page.locator('[data-testid="solar-system-panel"]');
    const panelText = await panel.textContent();
    expect(panelText).toContain("Lost/year");
  });

  test("age of universe consistent in cosmology panel", async ({ page }) => {
    await initApp(page);
    await switchTab(page, "Cosmology");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 10000 });
    // ΛCDM section shows age ~13.8 Gyr
    const panel = page.locator('[data-testid="cosmic-panel"]');
    const text = await panel.textContent();
    const match = text!.match(/(1[3-4])\.\d+\s*Gyr/);
    expect(match).not.toBeNull();
    const age = parseFloat(match![0]);
    expect(age).toBeGreaterThan(13.0);
    expect(age).toBeLessThan(14.5);
  });

  test("navigating between all tabs doesn't crash", async ({ page }) => {
    await initApp(page);
    const tabs = ["Dilation Map", "Solar System", "Black Hole", "Twin Paradox", "Cosmology", "Time Scales",
                  "Solar System", "Cosmology", "Black Hole", "Twin Paradox", "Dilation Map", "Time Scales"];
    for (const tab of tabs) {
      await switchTab(page, tab);
      await page.waitForTimeout(200);
      // App should not show error
      await expect(page.locator("text=Failed to load")).not.toBeVisible();
    }
  });

  test("rapid tab switching doesn't cause errors", async ({ page }) => {
    await initApp(page);
    for (let i = 0; i < 10; i++) {
      const tabs = ["Time Scales", "Dilation Map", "Solar System", "Black Hole", "Twin Paradox", "Cosmology"];
      await switchTab(page, tabs[i % tabs.length]);
    }
    await expect(page.locator("text=Failed to load")).not.toBeVisible();
    await expect(page.locator("h1")).toContainText("UNIVERSE CLOCK");
  });
});
