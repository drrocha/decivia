/* Decivia shared UI utilities — vanilla JS, zero dependencies, ultra-lightweight */
(function (global) {
  "use strict";

  const util = {};

  util.formatNumber = function (value, decimals = 2) {
    if (!isFinite(value)) return "—";
    const rounded = Number(value.toFixed(decimals));
    return rounded.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  };

  util.clamp = function (value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  // Shared unit-conversion helpers
  util.units = {
    inToM: (v) => v * 0.0254,
    ftToM: (v) => v * 0.3048,
    mToFt: (v) => v / 0.3048,
    gpmToM3s: (v) => v * 0.0000630902,
    paToPsi: (v) => v / 6894.757,
    psiToPa: (v) => v * 6894.757,
    cuFtToCuYd: (v) => v / 27,
    mgLToGrainsPerGal: (v) => v / 17.118,
  };

  // Reads + validates a numeric input. Returns a number, or null (and shows an error) if invalid.
  util.readNumber = function (input, opts = {}) {
    const { min, max, allowZero = true, errorEl, label = "Value" } = opts;
    const raw = input.value.trim();
    const errorTarget = errorEl || (input.closest(".field") && input.closest(".field").querySelector(".error-msg"));

    const setError = (msg) => {
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (errorTarget) errorTarget.textContent = msg || "";
    };

    if (raw === "") {
      setError(`${label} is required.`);
      return null;
    }
    const value = Number(raw);
    if (!isFinite(value)) {
      setError(`${label} must be a number.`);
      return null;
    }
    if (!allowZero && value === 0) {
      setError(`${label} cannot be zero.`);
      return null;
    }
    if (value < 0) {
      setError(`${label} cannot be negative.`);
      return null;
    }
    if (typeof min === "number" && value < min) {
      setError(`${label} must be at least ${min}.`);
      return null;
    }
    if (typeof max === "number" && value > max) {
      setError(`${label} must be no more than ${max}.`);
      return null;
    }
    setError("");
    return value;
  };

  // Wires a unit <select> next to a numeric <input>: switching units converts the displayed
  // number so the physical quantity stays the same. `factors[unit]` = base units per 1 of that unit.
  util.wireUnitSelect = function (input, select, factors) {
    select.dataset.prevUnit = select.value;
    select.addEventListener("change", () => {
      const oldUnit = select.dataset.prevUnit;
      const newUnit = select.value;
      const raw = parseFloat(input.value);
      if (isFinite(raw) && oldUnit !== newUnit) {
        const converted = (raw * factors[oldUnit]) / factors[newUnit];
        input.value = Math.round(converted * 1e6) / 1e6;
      }
      select.dataset.prevUnit = newUnit;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  // Reads + validates a numeric input expressed in the unit chosen by `select`, then converts it
  // to the base unit the calculator expects.
  util.readNumberInBase = function (input, select, factors, opts = {}) {
    const factor = factors[select.value];
    const displayOpts = { ...opts };
    if (typeof opts.max === "number") displayOpts.max = opts.max / factor;
    if (typeof opts.min === "number") displayOpts.min = opts.min / factor;
    const value = util.readNumber(input, displayOpts);
    return value === null ? null : value * factor;
  };

  // Builds a semantic, caption+header table inside a container with enhanced styling.
  util.renderTable = function (container, { caption, headers, rows, highlightRowIndex }) {
    if (!container) return;
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    const table = document.createElement("table");
    if (caption) {
      const cap = document.createElement("caption");
      cap.textContent = caption;
      table.appendChild(cap);
    }
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach((h) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = h;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      if (i === highlightRowIndex) {
        tr.className = "highlight";
        tr.setAttribute("aria-current", "true");
      }
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  };

  // High-DPI modern line chart on <canvas> with gradient fill, gridlines, and clear threshold
  util.drawLineChart = function (canvas, series, opts = {}) {
    if (!canvas || !series || series.length === 0) return;
    const {
      xLabel = "",
      yLabel = "",
      markX = null,
      thresholdY = null,
      thresholdLabel = ""
    } = opts;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 280);
    const h = Math.max(rect.height, 190);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.hasAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

    // Dynamic modern color palette based on theme
    const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)";
    const textColor = isDark ? "#94a3b8" : "#475569";
    const lineColor = isDark ? "#38bdf8" : "#1d4ed8";
    const alertColor = isDark ? "#f87171" : "#dc2626";

    const padL = 46, padB = 32, padT = 16, padR = 16;
    const xs = series.map((p) => p.x);
    const ys = series.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const rawYMax = Math.max(...ys, thresholdY !== null ? thresholdY * 1.15 : 0);
    const yMin = 0;
    const yMax = rawYMax > 0 ? rawYMax * 1.12 : 5;

    const toPx = (x, y) => {
      const px = padL + ((x - xMin) / (xMax - xMin || 1)) * (w - padL - padR);
      const py = h - padB - ((y - yMin) / (yMax - yMin || 1)) * (h - padT - padB);
      return [px, py];
    };

    // Draw horizontal grid lines
    const gridSteps = 4;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= gridSteps; i++) {
      const val = (yMax / gridSteps) * i;
      const [, py] = toPx(xMin, val);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(w - padR, py);
      ctx.stroke();
      ctx.fillText(val.toFixed(1) + "%", padL - 8, py);
    }

    // Gradient fill under curve
    if (series.length > 1) {
      const fillGrad = ctx.createLinearGradient(0, padT, 0, h - padB);
      fillGrad.addColorStop(0, isDark ? "rgba(56, 189, 248, 0.18)" : "rgba(29, 78, 216, 0.12)");
      fillGrad.addColorStop(1, isDark ? "rgba(56, 189, 248, 0.0)" : "rgba(29, 78, 216, 0.0)");

      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      series.forEach((p, i) => {
        const [px, py] = toPx(p.x, p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      const [lastPx] = toPx(series[series.length - 1].x, 0);
      const [firstPx] = toPx(series[0].x, 0);
      ctx.lineTo(lastPx, h - padB);
      ctx.lineTo(firstPx, h - padB);
      ctx.closePath();
      ctx.fill();
    }

    // Draw threshold line (e.g. 3% limit)
    if (thresholdY !== null && isFinite(thresholdY)) {
      const [, py] = toPx(xMin, thresholdY);
      ctx.strokeStyle = alertColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(w - padR, py);
      ctx.stroke();
      ctx.setLineDash([]);

      if (thresholdLabel) {
        ctx.fillStyle = alertColor;
        ctx.textAlign = "right";
        ctx.fillText(thresholdLabel, w - padR, py - 6);
      }
    }

    // Draw main data line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    series.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Draw active gauge marker
    if (markX !== null && isFinite(markX) && markX >= 0 && markX < series.length) {
      const point = series[markX];
      if (point) {
        const [px, py] = toPx(point.x, point.y);

        // Vertical highlight line
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(15, 23, 42, 0.2)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px, padT);
        ctx.lineTo(px, h - padB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Outer glow circle
        ctx.fillStyle = isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(29, 78, 216, 0.18)";
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();

        // Inner solid dot
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Center point
        ctx.fillStyle = isDark ? "#0b0f17" : "#ffffff";
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Axis labels
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    if (xLabel) {
      ctx.fillText(xLabel, w / 2, h - 8);
    }
  };

  // Toast notification utility
  util.showToast = function (message) {
    let toast = document.querySelector(".toast-msg");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast-msg";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  };

  // Copy result helper
  util.copyResultToClipboard = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        util.showToast("✓ Result summary copied to clipboard");
      }).catch(() => {
        util.fallbackCopy(text);
      });
    } else {
      util.fallbackCopy(text);
    }
  };

  util.fallbackCopy = function (text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      util.showToast("✓ Result copied to clipboard");
    } catch (e) {
      util.showToast("Press Ctrl+C to copy");
    }
    document.body.removeChild(ta);
  };

  // Lazy-inits advanced-section content (charts etc.) only once, on first open.
  util.onAdvancedOpen = function (detailsEl, fn) {
    if (!detailsEl) return;
    let done = false;
    detailsEl.addEventListener("toggle", () => {
      if (detailsEl.open && !done) {
        done = true;
        fn();
      }
    });
  };

  util.announce = function (liveRegion, text) {
    if (liveRegion) liveRegion.textContent = text;
  };

  util.debounce = function (fn, wait = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  // Mode selector
  util.initModeSelector = function (root) {
    if (!root) return;
    const buttons = root.querySelectorAll("[data-mode]");
    const panels = root.querySelectorAll("[data-mode-panel]");
    function setMode(mode) {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      panels.forEach((p) => {
        p.hidden = p.dataset.modePanel !== mode;
      });
    }
    buttons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    const initial = root.querySelector("[data-mode][aria-pressed='true']");
    setMode(initial ? initial.dataset.mode : buttons[0] && buttons[0].dataset.mode);
  };

  // Unified Unit System Selector (Imperial vs Metric)
  util.getUnitSystem = function (defaultSys = "imperial") {
    try {
      return localStorage.getItem("preferred_unit_system") || defaultSys;
    } catch (e) {
      return defaultSys;
    }
  };

  util.setUnitSystem = function (sys) {
    try {
      localStorage.setItem("preferred_unit_system", sys);
    } catch (e) {}
  };

  util.initUnitSystem = function (root, opts = {}) {
    if (!root) return { getSystem: () => "imperial", setSystem: () => {} };
    const container = root.querySelector(".unit-system-bar") || root;
    const buttons = container.querySelectorAll("[data-system]");
    if (!buttons || buttons.length === 0) return { getSystem: () => "imperial", setSystem: () => {} };

    let currentSystem = opts.initial || util.getUnitSystem("imperial");

    function apply(sys, triggerChange = true) {
      currentSystem = sys;
      util.setUnitSystem(sys);
      buttons.forEach((b) => {
        const active = b.dataset.system === sys;
        b.setAttribute("aria-pressed", String(active));
        b.classList.toggle("active", active);
      });
      if (triggerChange && typeof opts.onChange === "function") {
        opts.onChange(sys);
      }
    }

    buttons.forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const sys = b.dataset.system;
        if (sys && sys !== currentSystem) {
          apply(sys, true);
        }
      });
    });

    apply(currentSystem, false);

    return {
      getSystem: () => currentSystem,
      setSystem: (s) => apply(s, true),
    };
  };

  // Converts input field values and unit badges on unit switch
  util.convertFieldsOnUnitChange = function (fieldDefs, fromSys, toSys) {
    if (!fieldDefs || fromSys === toSys) return;
    fieldDefs.forEach((def) => {
      const input = document.getElementById(def.id);
      const badge = def.badgeId ? document.getElementById(def.badgeId) : null;
      if (badge) {
        badge.textContent = toSys === "metric" ? def.metUnit : def.impUnit;
      }
      if (input && input.value.trim() !== "") {
        const val = parseFloat(input.value);
        if (isFinite(val)) {
          const converted = toSys === "metric" ? def.impToMet(val) : def.metToImp(val);
          const dec = typeof def.decimals === "number" ? def.decimals : 2;
          input.value = Number(converted.toFixed(dec));
        }
      }
    });
  };

  global.CalcAtlas = global.CalcAtlas || {};
  global.CalcAtlas.util = util;
})(window);

// Dark-mode toggle & keyboard shortcuts
(function () {
  "use strict";

  const STORAGE_KEY = "theme";

  function storedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function isDarkActive() {
    const stored = storedTheme();
    return stored ? stored === "dark" : systemPrefersDark();
  }

  function updateButton(btn) {
    const dark = isDarkActive();
    btn.innerHTML = dark
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> Light`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> Dark`;
    btn.setAttribute("aria-pressed", String(dark));
  }

  function init() {
    const header = document.querySelector(".header-actions") || document.querySelector(".site-header-inner");
    if (!header || header.querySelector(".theme-toggle")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Toggle dark theme");
    updateButton(btn);

    btn.addEventListener("click", () => {
      const next = isDarkActive() ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {
        // ignore
      }
      document.documentElement.setAttribute("data-theme", next);
      updateButton(btn);

      // Re-render chart if open to match theme
      const chartCanvas = document.querySelector("canvas.chart-canvas");
      if (chartCanvas && window.dispatchEvent) {
        window.dispatchEvent(new Event("resize"));
      }
    });

    header.appendChild(btn);

    // Auto-inject brand mark icon into .site-logo if not present
    const siteLogo = document.querySelector(".site-logo");
    if (siteLogo && !siteLogo.querySelector(".brand-icon") && !document.querySelector(".brand-icon")) {
      const icon = document.createElement("span");
      icon.className = "brand-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.style.display = "inline-flex";
      icon.style.marginRight = "0.45rem";
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="3" x2="12" y2="21"></line><line x1="3" y1="12" x2="21" y2="12"></line><circle cx="12" cy="12" r="3"></circle></svg>`;
      siteLogo.prepend(icon);
    }

    // Auto-enrich any .result-panel that lacks .result-top-bar with modern badge and copy button
    document.querySelectorAll(".result-panel").forEach((panel) => {
      if (!panel.querySelector(".result-top-bar")) {
        const topBar = document.createElement("div");
        topBar.className = "result-top-bar";
        topBar.innerHTML = `
          <div class="result-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Calculated Output</span>
          </div>
          <button type="button" class="copy-btn" title="Copy calculation summary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy Summary</span>
          </button>
        `;

        const copyBtn = topBar.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
          const mainText = panel.querySelector(".result-main") ? panel.querySelector(".result-main").textContent.trim() : "";
          const items = Array.from(panel.querySelectorAll(".result-item")).map((it) => {
            const lbl = it.querySelector(".label") ? it.querySelector(".label").textContent.trim() : "";
            const val = it.querySelector(".value") ? it.querySelector(".value").textContent.trim() : "";
            return lbl && val ? `${lbl}: ${val}` : "";
          }).filter(Boolean);

          const summary = `Decivia Calculation: ${mainText}${items.length > 0 ? " | " + items.join(" | ") : ""}`;
          util.copyResultToClipboard(summary);
        });

        panel.prepend(topBar);
      }
    });

    // Keep hub pages semantically connected to the calculator URLs they list.
    const canonical = document.querySelector('link[rel="canonical"]');
    const canonicalUrl = canonical ? canonical.href : "";
    if (canonicalUrl.endsWith("/index.html") && canonicalUrl !== "https://decivia.online/index.html") {
      const items = Array.from(document.querySelectorAll("main .feature-group a[href]"))
        .filter((link) => !link.href.endsWith("/index.html"))
        .filter((link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index)
        .map((link, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: link.textContent.trim(),
          url: link.href
        }));
      if (items.length > 0) {
        appendJsonLd({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : "Decivia calculators",
          itemListElement: items
        });
      }
    }

    const faqByPath = {
      "/construction/baluster-spacing.html": [
        ["How is baluster spacing calculated?", "The available railing run is divided among the balusters and clear openings after the end margins are removed. The calculator reports both the clear opening and center-to-center pitch."],
        ["What does maximum clear gap mean?", "It is the largest open space allowed between adjacent balusters. The calculator increases the count when the selected count would exceed that limit."],
        ["Does this replace local railing code?", "No. Maximum openings, height, loading, and installation requirements vary by jurisdiction. Confirm the design with your local building code before construction."]
      ],
      "/construction/construction-cost.html": [
        ["What does the construction cost estimator include?", "It combines material cost, labor cost, waste, fixed fees, delivery, equipment, tax, and contingency using the rates you enter."],
        ["Are the material and labor rates current market prices?", "No. Rates are user-provided inputs, so the estimate is only as current and accurate as the prices and quantities entered."],
        ["Does the estimate include every project cost?", "Not necessarily. Permits, design fees, site conditions, financing, and other project-specific costs may need to be added separately."]
      ],
      "/construction/ramp-slope.html": [
        ["How is ramp slope calculated?", "Slope percentage is rise divided by run multiplied by 100. The ratio is expressed as 1 unit of rise for the calculated number of units of run."],
        ["What does a 1:12 ramp ratio mean?", "A 1:12 ratio means the ramp rises 1 unit for every 12 units of horizontal run, which is an 8.33% slope."],
        ["Is this a code-compliance tool?", "No. Accessibility and building requirements vary by location and use. Confirm the required slope, landings, handrails, width, and edge protection with the applicable code."]
      ],
      "/engineering/charging-time.html": [
        ["How do you estimate battery charging time?", "Required charge is battery capacity multiplied by the change in state of charge. Charging time divides that charge by current and adjusts for the entered efficiency."],
        ["Why is actual charging time different?", "Charging current can taper near full charge, and temperature, battery chemistry, charger limits, and battery-management controls can change the result."],
        ["Can this calculator determine battery safety?", "No. It is a general time estimate and does not validate charger compatibility, thermal conditions, cell balance, or battery safety."]
      ],
      "/mechanical/spring-rate.html": [
        ["What does spring rate mean?", "Spring rate is the force required for one unit of deflection. A higher rate means the spring requires more force to compress or extend by the same distance."],
        ["Which spring inputs affect the rate most?", "For an ideal helical compression spring, wire diameter has a fourth-power effect, while mean coil diameter has a cubic inverse effect. Active coils and shear modulus also affect the result."],
        ["Is this suitable for final spring design?", "No. The estimate does not account for fatigue, buckling, solid height, end conditions, manufacturing tolerances, or material limits."]
      ],
      "/pipes/differential-pressure.html": [
        ["How is differential pressure calculated?", "Differential pressure is upstream pressure minus downstream pressure. A positive result means upstream pressure is higher; a negative result means downstream pressure is higher."],
        ["What is fluid head?", "Fluid head is the equivalent height of a fluid column. It is calculated from pressure difference divided by fluid density and gravitational acceleration."],
        ["Is this the same as pipe friction loss?", "No. This tool compares two measured pressures. Use the pipe pressure-drop calculator for Darcy-Weisbach friction loss through a pipe."]
      ],
      "/statistics/relative-frequency.html": [
        ["How is relative frequency calculated?", "Relative frequency is each category count divided by the total count. Multiplying it by 100 gives the percentage for that category."],
        ["What should relative frequencies add up to?", "When all categories are included, relative frequencies should total 1, and percentages should total 100%, apart from rounding."],
        ["Can categories have the same label?", "Yes. The calculator keeps entered rows separate, so duplicate labels are treated as separate observations rather than automatically merged."]
      ]
    };

    const faqItems = faqByPath[window.location.pathname.replace(/\/$/, "")];
    if (faqItems && !document.querySelector(".faq-list")) {
      const section = document.createElement("section");
      section.className = "faq-list";
      section.innerHTML = `<h2>Frequently asked questions</h2>${faqItems.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join("")}`;
      const relatedHeading = Array.from(document.querySelectorAll("main h2")).find((heading) => /related tools/i.test(heading.textContent));
      if (relatedHeading) relatedHeading.before(section);
      else document.querySelector("main")?.appendChild(section);
      appendJsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer }
        }))
      });
    }

    const footer = document.querySelector(".site-footer");
    const footerNav = footer && footer.querySelector(".footer-nav");
    if (footer && !footer.querySelector('a[href="/methodology.html"]')) {
      const methodologyLink = document.createElement("a");
      methodologyLink.href = "/methodology.html";
      methodologyLink.textContent = "Methodology";
      (footerNav || footer).appendChild(methodologyLink);
    }

    // Global keyboard shortcut: Press "/" to focus search if on home page
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
        const searchInput = document.getElementById("tool-filter");
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    });
  }

  function appendJsonLd(value) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(value);
    document.head.appendChild(script);
  }

  /* New calculator tools share the existing app bundle and utility layer. */
  const util = window.CalcAtlas.util;
  const newTools = {};
  const toolValue = (id, label, options) => util.readNumber(document.getElementById(id), { label, ...options });
  const toolShow = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const toolReveal = (id, visible) => { const el = document.getElementById(id); if (el) el.hidden = !visible; };
  const toolFormat = (value, decimals = 2) => util.formatNumber(value, decimals);
  const toolBind = (form, compute) => {
    form.addEventListener("submit", (event) => { event.preventDefault(); compute(); });
    form.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener(input.tagName === "SELECT" ? "input" : "change", compute);
    });
  };

  newTools.pressure = function () {
    const form = document.getElementById("pressure-form"); if (!form) return;
    const factors = { Pa: 1, kPa: 1000, bar: 100000, psi: 6894.757 }, unit = document.getElementById("dp-unit");
    function compute() {
      const upstream = toolValue("dp-upstream", "Upstream pressure");
      const downstream = toolValue("dp-downstream", "Downstream pressure");
      if (upstream === null || downstream === null) return toolReveal("dp-result", false);
      const delta = (upstream - downstream) * factors[unit.value];
      const display = delta / factors[unit.value];
      const direction = delta > 0 ? "upstream is higher" : delta < 0 ? "downstream is higher" : "the pressures are equal";
      toolShow("dp-main", `${toolFormat(Math.abs(display), 3)} ${unit.value} differential (${direction}).`);
      toolShow("dp-common", `${toolFormat(delta / 1000, 3)} kPa | ${toolFormat(delta / 6894.757, 3)} psi | signed ΔP: ${toolFormat(display, 3)} ${unit.value}`);
      const density = toolValue("dp-density", "Fluid density", { min: 0.001 });
      if (density !== null) toolShow("dp-head", `${toolFormat(delta / (density * 9.80665), 3)} m fluid head at ${toolFormat(density, 1)} kg/m³.`);
      toolReveal("dp-result", true);
    }
    unit.addEventListener("change", compute); toolBind(form, compute); compute();
  };

  newTools.cost = function () {
    const form = document.getElementById("cost-form"); if (!form) return;
    function compute() {
      const quantity = toolValue("cost-qty", "Project quantity", { min: 0.000001, allowZero: false });
      const materialRate = toolValue("cost-material-rate", "Material cost per unit", { min: 0 });
      const laborQuantity = toolValue("cost-labor-qty", "Labor quantity", { min: 0 });
      const laborRate = toolValue("cost-labor-rate", "Labor rate", { min: 0 });
      const waste = toolValue("cost-waste", "Waste percentage", { min: 0, max: 100 });
      if ([quantity, materialRate, laborQuantity, laborRate, waste].some((value) => value === null)) return toolReveal("cost-result", false);
      const material = quantity * materialRate, labor = laborQuantity * laborRate, wasteAmount = material * waste / 100;
      const fees = (toolValue("cost-fees", "Fixed fees", { min: 0 }) || 0) + (toolValue("cost-delivery", "Delivery fee", { min: 0 }) || 0) + (toolValue("cost-equipment", "Equipment rental", { min: 0 }) || 0);
      const contingency = toolValue("cost-contingency", "Contingency percentage", { min: 0, max: 100 }) || 0;
      const tax = toolValue("cost-tax", "Tax rate", { min: 0, max: 100 }) || 0;
      const beforeTax = material + labor + wasteAmount + fees, contingencyAmount = beforeTax * contingency / 100;
      const taxAmount = (beforeTax + contingencyAmount) * tax / 100, total = beforeTax + contingencyAmount + taxAmount;
      toolShow("cost-main", `Estimated project total: $${toolFormat(total)}`);
      toolShow("cost-breakdown", `Materials $${toolFormat(material)} | Labor $${toolFormat(labor)} | Waste $${toolFormat(wasteAmount)} | Fees $${toolFormat(fees)} | Contingency $${toolFormat(contingencyAmount)} | Tax $${toolFormat(taxAmount)}`);
      toolShow("cost-unit", `$${toolFormat(total / quantity)} per ${document.getElementById("cost-unit").dataset.label || "unit"}`); toolReveal("cost-result", true);
    }
    toolBind(form, compute); compute();
  };

  newTools.ramp = function () {
    const form = document.getElementById("ramp-form"); if (!form) return;
    function compute() {
      const rise = toolValue("ramp-rise", "Rise", { min: 0.000001, allowZero: false }), run = toolValue("ramp-run", "Available run", { min: 0.000001, allowZero: false }), target = toolValue("ramp-target", "Target ratio denominator", { min: 1, allowZero: false });
      if ([rise, run, target].some((value) => value === null)) return toolReveal("ramp-result", false);
      const landings = toolValue("ramp-landings", "Landing length", { min: 0 }) || 0, segments = toolValue("ramp-segments", "Ramp segments", { min: 1, allowZero: false }) || 1;
      toolShow("ramp-main", `Slope 1:${toolFormat(run / rise, 2)} (${toolFormat(rise / run * 100, 2)}%, ${toolFormat(Math.atan(rise / run) * 180 / Math.PI, 2)}°)`);
      toolShow("ramp-required", `Required run for 1:${toolFormat(target, 0)}: ${toolFormat(rise * target, 2)} units. Total footprint with ${toolFormat(landings, 2)} units of landing per end: ${toolFormat(rise * target + landings * 2, 2)} units.`);
      toolShow("ramp-status", `${run >= rise * target ? "Meets" : "Does not meet"} the selected target ratio. ${toolFormat(segments, 0)} segment${segments === 1 ? "" : "s"} entered.`); toolReveal("ramp-result", true);
    }
    toolBind(form, compute); compute();
  };

  newTools.baluster = function () {
    const form = document.getElementById("baluster-form"); if (!form) return;
    function compute() {
      const run = toolValue("bal-run", "Railing run", { min: 0.000001, allowZero: false }), width = toolValue("bal-width", "Baluster width", { min: 0.000001, allowZero: false }), maxGap = toolValue("bal-gap", "Maximum clear gap", { min: 0.000001, allowZero: false });
      if ([run, width, maxGap].some((value) => value === null)) return toolReveal("bal-result", false);
      const left = toolValue("bal-left", "Left margin", { min: 0 }) || 0, right = toolValue("bal-right", "Right margin", { min: 0 }) || 0, available = run - left - right;
      if (available <= 0) { document.getElementById("bal-run").setAttribute("aria-invalid", "true"); toolShow("bal-run-err", "Railing run must exceed the two end margins."); return toolReveal("bal-result", false); }
      const fixed = toolValue("bal-fixed", "Fixed baluster count", { min: 1, allowZero: false }), count = Math.max(1, fixed === null ? Math.ceil((available - maxGap) / (maxGap + width)) : Math.round(fixed)), gap = (available - count * width) / (count + 1);
      toolShow("bal-main", `${count} baluster${count === 1 ? "" : "s"}; clear opening ${toolFormat(gap, 3)} units (${gap <= maxGap ? "within" : "exceeds"} the ${toolFormat(maxGap, 3)}-unit maximum).`);
      toolShow("bal-details", `Occupied width: ${toolFormat(count * width, 3)} units. End margins: ${toolFormat(left, 3)} left and ${toolFormat(right, 3)} right. Center-to-center pitch: ${toolFormat(gap + width, 3)} units.`);
      toolShow("bal-diagram", `Run: ${toolFormat(available, 2)} units | ${count} balusters | ${toolFormat(gap, 2)}-unit clear gaps`); toolReveal("bal-result", true);
    }
    toolBind(form, compute); compute();
  };

  newTools.charging = function () {
    const form = document.getElementById("charging-form"); if (!form) return;
    function compute() {
      const capacity = toolValue("charge-capacity", "Battery capacity", { min: 0.000001, allowZero: false }), current = toolValue("charge-current", "Charger current", { min: 0.000001, allowZero: false }), start = toolValue("charge-start", "Starting state of charge", { min: 0, max: 100 }), target = toolValue("charge-target", "Target state of charge", { min: 0, max: 100 }), efficiency = toolValue("charge-efficiency", "Charging efficiency", { min: 0.001, max: 100 });
      if ([capacity, current, start, target, efficiency].some((value) => value === null)) return toolReveal("charging-result", false);
      if (target <= start) { toolShow("charge-target-err", "Target state of charge must be greater than starting state."); document.getElementById("charge-target").setAttribute("aria-invalid", "true"); return toolReveal("charging-result", false); }
      const required = capacity * (target - start) / 100, ideal = required / current, adjusted = ideal / (efficiency / 100), hours = Math.floor(adjusted), minutes = Math.round((adjusted - hours) * 60);
      toolShow("charging-main", `Estimated time: ${hours} h ${minutes} min`); toolShow("charging-details", `Required charge: ${toolFormat(required, 3)} Ah-equivalent | Ideal: ${toolFormat(ideal, 2)} h | Efficiency-adjusted: ${toolFormat(adjusted, 2)} h`); toolReveal("charging-result", true);
    }
    toolBind(form, compute); compute();
  };

  newTools.spring = function () {
    const form = document.getElementById("spring-form"); if (!form) return;
    function compute() {
      const wire = toolValue("spring-wire", "Wire diameter", { min: 0.000001, allowZero: false }), mean = toolValue("spring-mean", "Mean coil diameter", { min: 0.000001, allowZero: false }), coils = toolValue("spring-coils", "Active coils", { min: 0.000001, allowZero: false }), modulus = toolValue("spring-modulus", "Shear modulus", { min: 0.000001, allowZero: false }), deflection = toolValue("spring-deflection", "Deflection", { min: 0 });
      if ([wire, mean, coils, modulus, deflection].some((value) => value === null)) return toolReveal("spring-result", false);
      if (mean <= wire) { toolShow("spring-mean-err", "Mean coil diameter must be greater than wire diameter."); document.getElementById("spring-mean").setAttribute("aria-invalid", "true"); return toolReveal("spring-result", false); }
      const rate = modulus * Math.pow(wire, 4) / (8 * Math.pow(mean, 3) * coils), force = rate * deflection, energy = 0.5 * rate * deflection * deflection;
      toolShow("spring-main", `Spring rate k = ${toolFormat(rate, 4)} force units / length unit`); toolShow("spring-details", `Force at ${toolFormat(deflection, 3)} units: ${toolFormat(force, 3)} force units | Stored energy: ${toolFormat(energy, 3)} force-length units`); toolShow("spring-diameters", `Estimated outer diameter: ${toolFormat(mean + wire, 3)} | Inner diameter: ${toolFormat(mean - wire, 3)}`); toolReveal("spring-result", true);
    }
    toolBind(form, compute); compute();
  };

  newTools.frequency = function () {
    const form = document.getElementById("frequency-form"); if (!form) return;
    const rows = document.getElementById("frequency-rows");
    function addRow(category = "Category", count = "") {
      const row = document.createElement("div"); row.className = "input-grid frequency-row";
      row.innerHTML = `<div class="field"><label>Category</label><input type="text" class="freq-category" value="${category}" required></div><div class="field"><label>Count</label><input type="number" class="freq-count" min="0" step="1" value="${count}" required><span class="error-msg" role="alert"></span></div><button type="button" class="btn secondary remove-frequency">Remove row</button>`;
      row.querySelector(".remove-frequency").addEventListener("click", () => { row.remove(); compute(); }); row.querySelectorAll("input").forEach((input) => input.addEventListener("input", compute)); rows.appendChild(row);
    }
    function compute() {
      const entries = [...rows.querySelectorAll(".frequency-row")].map((row) => ({ category: row.querySelector(".freq-category").value.trim(), input: row.querySelector(".freq-count") })).filter((entry) => entry.category || entry.input.value !== "");
      const valid = entries.length > 0 && entries.every((entry) => entry.category && entry.input.value !== "" && Number(entry.input.value) >= 0 && isFinite(Number(entry.input.value)));
      if (!valid) return toolReveal("frequency-result", false);
      const total = entries.reduce((sum, entry) => sum + Number(entry.input.value), 0); if (total <= 0) return toolReveal("frequency-result", false);
      let cumulative = 0; const decimals = Number(document.getElementById("frequency-decimals").value);
      const tableRows = entries.map((entry) => { const count = Number(entry.input.value), relative = count / total; cumulative += count; return [entry.category, toolFormat(count, 0), relative.toFixed(decimals), `${(relative * 100).toFixed(decimals)}%`, toolFormat(cumulative, 0), `${(cumulative / total * 100).toFixed(decimals)}%`]; });
      toolShow("frequency-summary", `Total count: ${toolFormat(total, 0)} across ${entries.length} categories.`); util.renderTable(document.getElementById("frequency-table"), { caption: "Relative frequency table", headers: ["Category", "Count", "Relative frequency", "Percentage", "Cumulative frequency", "Cumulative relative frequency"], rows: tableRows }); toolReveal("frequency-result", true);
    }
    document.getElementById("add-frequency").addEventListener("click", () => addRow()); document.getElementById("frequency-decimals").addEventListener("input", compute); addRow("A", "12"); addRow("B", "8"); addRow("C", "5"); form.addEventListener("submit", (event) => { event.preventDefault(); compute(); }); compute();
  };
  window.DeciviaTools = newTools;

  const toolPages = {
    "pressure-form": newTools.pressure,
    "cost-form": newTools.cost,
    "ramp-form": newTools.ramp,
    "baluster-form": newTools.baluster,
    "charging-form": newTools.charging,
    "spring-form": newTools.spring,
    "frequency-form": newTools.frequency
  };
  Object.keys(toolPages).some((formId) => {
    if (!document.getElementById(formId)) return false;
    toolPages[formId]();
    return true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
