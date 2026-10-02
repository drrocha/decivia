/* CalcAtlas reference data + pure calculation functions (reusable across pages) */
(function (global) {
  "use strict";

  const data = {};
  const calc = {};

  /* ---------------- Electrical: wire sizing / ampacity / voltage drop ---------------- */

  // Ampacity (amps), 90°C insulation column, based on NEC Table 310.16 common published values.
  // Simplified reference only — not adjusted for ambient temperature, bundling, or conduit fill.
  data.wireAmpacity = {
    copper: [
      { awg: "14", ampacity: 25 },
      { awg: "12", ampacity: 30 },
      { awg: "10", ampacity: 40 },
      { awg: "8", ampacity: 55 },
      { awg: "6", ampacity: 75 },
      { awg: "4", ampacity: 95 },
      { awg: "3", ampacity: 110 },
      { awg: "2", ampacity: 130 },
      { awg: "1", ampacity: 150 },
      { awg: "1/0", ampacity: 170 },
      { awg: "2/0", ampacity: 195 },
      { awg: "3/0", ampacity: 225 },
      { awg: "4/0", ampacity: 260 },
    ],
    aluminum: [
      { awg: "12", ampacity: 25 },
      { awg: "10", ampacity: 35 },
      { awg: "8", ampacity: 45 },
      { awg: "6", ampacity: 60 },
      { awg: "4", ampacity: 75 },
      { awg: "3", ampacity: 85 },
      { awg: "2", ampacity: 100 },
      { awg: "1", ampacity: 115 },
      { awg: "1/0", ampacity: 135 },
      { awg: "2/0", ampacity: 150 },
      { awg: "3/0", ampacity: 175 },
      { awg: "4/0", ampacity: 205 },
    ],
  };

  // DC resistance, ohms per 1000 ft, based on NEC Chapter 9 Table 8 (uncoated conductors).
  data.wireResistanceOhmsPerKft = {
    copper: { "14": 3.14, "12": 1.98, "10": 1.24, "8": 0.778, "6": 0.491, "4": 0.308, "3": 0.245, "2": 0.194, "1": 0.154, "1/0": 0.122, "2/0": 0.0967, "3/0": 0.0766, "4/0": 0.0608 },
    aluminum: { "12": 3.25, "10": 2.04, "8": 1.28, "6": 0.808, "4": 0.508, "3": 0.403, "2": 0.319, "1": 0.253, "1/0": 0.201, "2/0": 0.159, "3/0": 0.126, "4/0": 0.1 },
  };

  // Metric cross-sectional area (mm²) and standard IEC metric equivalent
  data.wireMetricMm2 = {
    "14": { mm2: 2.08, label: "2.5 mm² eq." },
    "12": { mm2: 3.31, label: "4.0 mm² eq." },
    "10": { mm2: 5.26, label: "6.0 mm² eq." },
    "8": { mm2: 8.37, label: "10 mm² eq." },
    "6": { mm2: 13.3, label: "16 mm² eq." },
    "4": { mm2: 21.2, label: "25 mm² eq." },
    "3": { mm2: 26.7, label: "25-35 mm²" },
    "2": { mm2: 33.6, label: "35 mm² eq." },
    "1": { mm2: 42.4, label: "50 mm² eq." },
    "1/0": { mm2: 53.5, label: "50-70 mm²" },
    "2/0": { mm2: 67.4, label: "70 mm² eq." },
    "3/0": { mm2: 85.0, label: "95 mm² eq." },
    "4/0": { mm2: 107.2, label: "120 mm² eq." },
  };

  calc.awgOrder = (material) => data.wireAmpacity[material].map((r) => r.awg);

  // Picks the smallest wire that satisfies BOTH ampacity and max voltage-drop % constraints.
  calc.recommendWireSize = function ({ current, voltage, oneWayLengthFt, material, maxDropPct, parallelConductors = 1 }) {
    const table = data.wireAmpacity[material];
    const resTable = data.wireResistanceOhmsPerKft[material];
    const perConductorCurrent = current / parallelConductors;
    let result = null;
    for (const row of table) {
      if (perConductorCurrent > row.ampacity) continue;
      const r = resTable[row.awg];
      const dropV = calc.voltageDrop({ current, oneWayLengthFt, resistanceOhmsPerKft: r, parallelConductors });
      const dropPct = (dropV / voltage) * 100;
      if (dropPct <= maxDropPct) {
        result = { awg: row.awg, ampacity: row.ampacity, dropV, dropPct };
        break;
      }
    }
    return result; // null if nothing in the table satisfies constraints
  };

  calc.voltageDrop = function ({ current, oneWayLengthFt, resistanceOhmsPerKft, parallelConductors = 1 }) {
    const effectiveR = resistanceOhmsPerKft / parallelConductors;
    return (2 * oneWayLengthFt * current * effectiveR) / 1000;
  };

  /* ---------------- Pipes: flow velocity / Darcy-Weisbach pressure drop ---------------- */

  // Absolute roughness, mm — standard Moody-chart reference values.
  data.pipeRoughnessMm = {
    pvc: 0.0015,
    copper: 0.0015,
    hdpe: 0.007,
    steel: 0.045,
    galvanized: 0.15,
    castIron: 0.26,
    concrete: 1.0,
  };

  data.fluidProps = {
    water20c: { density: 998, viscosity: 0.001002 },
    water60c: { density: 983, viscosity: 0.000467 },
    glycol30: { density: 1025, viscosity: 0.0025 },
  };

  calc.pipeVelocity = ({ flowM3s, diameterM }) => flowM3s / (Math.PI * (diameterM / 2) ** 2);

  calc.reynolds = ({ density, velocity, diameterM, viscosity }) => (density * velocity * diameterM) / viscosity;

  // Swamee-Jain explicit approximation of the Darcy friction factor (avoids iterative Colebrook solving).
  calc.frictionFactorSwameeJain = function ({ roughnessM, diameterM, reynolds }) {
    if (reynolds < 2300) return 64 / reynolds; // laminar
    const term = roughnessM / (3.7 * diameterM) + 5.74 / Math.pow(reynolds, 0.9);
    return 0.25 / Math.pow(Math.log10(term), 2);
  };

  calc.darcyPressureDropPa = function ({ frictionFactor, lengthM, diameterM, density, velocity }) {
    return (frictionFactor * (lengthM / diameterM) * (density * velocity * velocity)) / 2;
  };

  calc.headLossM = ({ pressureDropPa, density }) => pressureDropPa / (density * 9.80665);

  /* ---------------- Mechanical: gear ratio / drivetrain ---------------- */

  calc.overallRatio = ({ transmissionRatio, finalDriveRatio, transferCaseRatio = 1 }) =>
    transmissionRatio * finalDriveRatio * transferCaseRatio;

  calc.wheelRpm = ({ engineRpm, overallRatio }) => engineRpm / overallRatio;

  // tireDiameterIn -> speed in mph from wheel RPM.
  calc.speedMph = ({ wheelRpm, tireDiameterIn }) => {
    const circumferenceIn = Math.PI * tireDiameterIn;
    const inPerMin = wheelRpm * circumferenceIn;
    const inPerHour = inPerMin * 60;
    return inPerHour / 63360;
  };

  // Inverse of speedMph: the engine RPM needed to hold a target road speed with a given overall ratio.
  calc.rpmAtSpeed = ({ speedMph, overallRatio, tireDiameterIn }) => {
    const circumferenceIn = Math.PI * tireDiameterIn;
    const inPerHour = speedMph * 63360;
    const wheelRpm = inPerHour / 60 / circumferenceIn;
    return wheelRpm * overallRatio;
  };

  /* ---------------- Construction: materials ---------------- */

  data.sheetSizesSqFt = { drywall4x8: 32, drywall4x10: 40, drywall4x12: 48 };
  data.bagCoverage = {
    gravelBagCuFt: 0.5, // typical 50 lb bag ≈ 0.5 cu ft
    topsoilBagCuFt: 0.75,
  };

  // Typical bulk density, lb per cubic foot — actual density varies with material and moisture.
  data.materialDensityLbPerCuFt = {
    gravel: 105,
    topsoil: 80,
  };

  calc.areaSqFt = ({ lengthFt, widthFt }) => lengthFt * widthFt;
  calc.volumeCuFt = ({ lengthFt, widthFt, depthFt }) => lengthFt * widthFt * depthFt;
  // Rounded to 6 decimals to avoid floating-point noise (e.g. 100 * 1.1) nudging Math.ceil up a whole unit.
  calc.wasteAdjust = (qty, wastePct) => Math.round(qty * (1 + wastePct / 100) * 1e6) / 1e6;

  /* ---------------- Tanks: capacity ---------------- */

  calc.rectTankVolumeGal = ({ lengthIn, widthIn, heightIn }) => (lengthIn * widthIn * heightIn) / 231;
  calc.vertCylinderVolumeGal = ({ diameterIn, heightIn }) => (Math.PI * (diameterIn / 2) ** 2 * heightIn) / 231;

  // Horizontal cylindrical tank partial-fill volume via circular-segment area.
  calc.horizCylinderFillGal = ({ diameterIn, lengthIn, fillHeightIn }) => {
    const r = diameterIn / 2;
    const h = calc.clampFill(fillHeightIn, diameterIn);
    const theta = 2 * Math.acos((r - h) / r);
    const segmentArea = 0.5 * r * r * (theta - Math.sin(theta));
    return (segmentArea * lengthIn) / 231;
  };
  calc.clampFill = (h, d) => Math.min(Math.max(h, 0), d);

  calc.galToLiters = (gal) => gal * 3.785411784;
  calc.litersToGal = (l) => l / 3.785411784;
  calc.inToCm = (i) => i * 2.54;
  calc.cmToIn = (c) => c / 2.54;
  calc.inToMm = (i) => i * 25.4;
  calc.mmToIn = (mm) => mm / 25.4;
  calc.ftToM = (ft) => ft * 0.3048;
  calc.mToFt = (m) => m / 0.3048;
  calc.sqFtToSqM = (sqFt) => sqFt * 0.09290304;
  calc.sqMToSqFt = (sqM) => sqM / 0.09290304;
  calc.cuFtToCuM = (cuFt) => cuFt * 0.028316846592;
  calc.cuMToCuFt = (cuM) => cuM / 0.028316846592;
  calc.gpmToLpm = (gpm) => gpm * 3.785411784;
  calc.lpmToGpm = (lpm) => lpm / 3.785411784;
  calc.psiToKpa = (psi) => psi * 6.894757;
  calc.kpaToPsi = (kpa) => kpa / 6.894757;
  calc.psiToBar = (psi) => psi * 0.06894757;
  calc.barToPsi = (bar) => bar / 0.06894757;
  calc.mphToKmh = (mph) => mph * 1.609344;
  calc.kmhToMph = (kmh) => kmh / 1.609344;
  calc.lbsToKg = (lbs) => lbs * 0.45359237;
  calc.kgToLbs = (kg) => kg / 0.45359237;
  calc.miToKm = (mi) => mi * 1.609344;
  calc.kmToMi = (km) => km / 1.609344;

  // Typical liquid density, kg per liter — for optional fuel-tank mass estimates.
  data.fuelDensityKgPerL = {
    gasoline: 0.74,
    diesel: 0.85,
    water: 1.0,
  };

  /* ---------------- Engineering reference tables ---------------- */

  calc.presentValueAnnuityFactor = ({ ratePct, periods }) => {
    const r = ratePct / 100;
    if (r === 0) return periods;
    return (1 - Math.pow(1 + r, -periods)) / r;
  };

  // Annuity-due: payments at the start of each period, so each is discounted one period less.
  calc.presentValueAnnuityFactorDue = ({ ratePct, periods }) => {
    const r = ratePct / 100;
    return calc.presentValueAnnuityFactor({ ratePct, periods }) * (1 + r);
  };

  // Illustrative span ranges for quick reference only — consult local code span tables / a structural engineer.
  data.beamSpanTable = [
    { size: "2x6", spacing: "16\" o.c.", maxSpanFt: 9.1 },
    { size: "2x8", spacing: "16\" o.c.", maxSpanFt: 11.9 },
    { size: "2x10", spacing: "16\" o.c.", maxSpanFt: 15.2 },
    { size: "2x12", spacing: "16\" o.c.", maxSpanFt: 18.0 },
    { size: "2x6", spacing: "24\" o.c.", maxSpanFt: 7.9 },
    { size: "2x8", spacing: "24\" o.c.", maxSpanFt: 10.4 },
    { size: "2x10", spacing: "24\" o.c.", maxSpanFt: 13.3 },
    { size: "2x12", spacing: "24\" o.c.", maxSpanFt: 15.7 },
  ];

  // USGS water hardness classification bands (mg/L as CaCO3).
  data.waterHardnessBands = [
    { band: "Soft", rangeMgL: "0 – 60" },
    { band: "Moderately hard", rangeMgL: "61 – 120" },
    { band: "Hard", rangeMgL: "121 – 180" },
    { band: "Very hard", rangeMgL: "181+" },
  ];

  calc.classifyHardness = (mgL) => {
    if (mgL <= 60) return "Soft";
    if (mgL <= 120) return "Moderately hard";
    if (mgL <= 180) return "Hard";
    return "Very hard";
  };

  // 1 grain per US gallon = 17.118 mg/L as CaCO3.
  calc.mgLToGrainsPerGallon = (mgL) => mgL / 17.118;

  // Hardness (mg/L as CaCO3) from elemental calcium/magnesium ion concentrations (mg/L).
  calc.hardnessFromCaMg = ({ ca, mg }) => 2.497 * ca + 4.118 * mg;

  // Transformer VA sizing: VA = V x I (single phase), VA = V x I x sqrt(3) (three phase).
  calc.transformerVA = ({ voltage, current, phase }) => voltage * current * (phase === 3 ? Math.sqrt(3) : 1);

  /* ---------------- Household: cost planner ---------------- */

  calc.monthlyUtilityTotal = ({ electricity = 0, gas = 0, water = 0, internet = 0, other = 0 }) =>
    electricity + gas + water + internet + other;

  calc.leaseOverageCost = ({ allowedMiles, expectedMiles, overageRatePerMile }) =>
    Math.max(0, expectedMiles - allowedMiles) * overageRatePerMile;

  calc.petSittingTotal = ({ pets, visits, ratePerVisit, surcharge = 0 }) => pets * visits * ratePerVisit + surcharge;

  global.CalcAtlas = global.CalcAtlas || {};
  global.CalcAtlas.data = data;
  global.CalcAtlas.calc = calc;
})(window);
