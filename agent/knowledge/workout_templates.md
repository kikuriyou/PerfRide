---
sources:
  - title: "TrainerRoad Blog"
    url: "https://www.trainerroad.com/blog"
  - title: "Cycling Workout Generator"
    url: "https://github.com/eyang9001/Cycling-Workout-Generator"
---

# Cycling Workout Templates for AI Training Recommendation

This document outlines standard cycling workout templates based on Dr. Andrew Coggan's power zones and modern training methodologies (e.g., TrainerRoad). These templates serve as the foundation for the AI coach to generate structured workouts based on a rider's fitness level, goals, and current fatigue state.

**Note on Targets:** All power targets are expressed as a percentage of Functional Threshold Power (%FTP).

---

## 1. Active Recovery (Zone 1)

**Purpose:** Promote blood flow and clear metabolic byproducts without inducing additional fatigue. Essential for recovery between high-intensity days or after heavy training blocks.
**When to Use:** Day after a race, day after a high-intensity interval session (HIIT), or during a rest week.

*   **Duration:** 30 - 60 minutes
*   **TSS Estimate:** 15 - 30
*   **Structure:**
    *   **Warm-up:** 5 min @ 40-50% FTP
    *   **Main Set:** 20-50 min @ 45-55% FTP
    *   **Cool-down:** 5 min @ 40% FTP
*   **Cadence:** Natural, comfortable cadence (typically 85-95 rpm). Avoid grinding.

---

## 2. Endurance (Zone 2)

**Purpose:** Build aerobic base, improve fat oxidation, increase mitochondrial density, and enhance slow-twitch muscle fiber efficiency.
**When to Use:** Base building phase, long weekend rides, or as filler volume between intense days.

*   **Duration:** 1 - 6+ hours
*   **TSS Estimate:** 40 - 60 per hour
*   **Structure (Example 2-Hour Ride):**
    *   **Warm-up:** 10 min gradual build from 50% to 65% FTP
    *   **Main Set:** 100 min @ 65-75% FTP (Steady effort, minimize coasting)
    *   **Cool-down:** 10 min gradual reduction to 50% FTP
*   **Cadence:** 85-95 rpm.

---

## 3. Tempo (Zone 3)

**Purpose:** Improve muscular endurance and aerobic capacity. Requires more focus than Endurance but is sustainable for long periods.
**When to Use:** Early base phase, preparing for long sustained efforts (centuries, gravel races, Gran Fondos).

*   **Duration:** 1 - 3 hours
*   **TSS Estimate:** 50 - 70 per hour
*   **Structure (Example 90-Min Ride with 3x15m):**
    *   **Warm-up:** 15 min build 50% -> 70% FTP
    *   **Main Set:** 3 x 15 min @ 80-88% FTP with 5 min recovery @ 50% FTP between intervals
    *   **Cool-down:** 15 min @ 50% FTP
*   **Cadence:** 85-95 rpm.

---

## 4. Sweet Spot (High Zone 3 / Low Zone 4)

**Purpose:** Achieve the highest training adaptation (aerobic and muscular endurance) for the lowest physiological strain. The "sweet spot" for maximizing return on time invested.
**When to Use:** Base and build phases. Excellent for time-crunched athletes.

### Template A: 2x20 Sweet Spot
*   **Duration:** 60 - 75 minutes
*   **TSS Estimate:** 65 - 80
*   **Structure:**
    *   **Warm-up:** 10 min build 50% -> 75% FTP
    *   **Main Set:** 2 x 20 min @ 88-94% FTP with 5 min recovery @ 50% FTP
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 85-95 rpm.

### Template B: 3x15 Sweet Spot
*   **Duration:** 75 minutes
*   **TSS Estimate:** 70 - 85
*   **Structure:**
    *   **Warm-up:** 10 min build 50% -> 75% FTP
    *   **Main Set:** 3 x 15 min @ 88-94% FTP with 3-4 min recovery @ 50% FTP
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 85-95 rpm.

### Template C: 2x30 Sweet Spot
*   **Duration:** 90 - 105 minutes
*   **TSS Estimate:** 90 - 110
*   **Structure:**
    *   **Warm-up:** 15 min build 50% -> 75% FTP
    *   **Main Set:** 2 x 30 min @ 88-92% FTP with 5-10 min recovery @ 50% FTP
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 85-95 rpm.

---

## 5. Threshold (Zone 4)

**Purpose:** Push up the FTP ceiling, increase lactate tolerance, and improve muscular endurance at race-pace intensities. Time Trial preparation.
**When to Use:** Build phase, Specialty phase (for TT or sustained climbing).

### Template A: 3x10 Threshold
*   **Duration:** 60 minutes
*   **TSS Estimate:** 70 - 80
*   **Structure:**
    *   **Warm-up:** 10 min build 50% -> 80% FTP + 1 min @ 100% FTP
    *   **Main Set:** 3 x 10 min @ 95-100% FTP with 4-5 min recovery @ 50% FTP
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 90-100 rpm.

### Template B: 2x20 Threshold
*   **Duration:** 75 - 90 minutes
*   **TSS Estimate:** 85 - 100
*   **Structure:**
    *   **Warm-up:** 15 min build 50% -> 80% FTP + 2 min @ 100% FTP
    *   **Main Set:** 2 x 20 min @ 95-100% FTP with 5-8 min recovery @ 50% FTP
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 90-100 rpm.

### Template C: Over-Unders (Criss-Cross)
*   **Duration:** 60 - 75 minutes
*   **TSS Estimate:** 75 - 90
*   **Structure:**
    *   **Warm-up:** 10 min build 50% -> 80% FTP
    *   **Main Set:** 3 x 12 min intervals. Each interval consists of alternating: 2 min @ 95% FTP ("Under") / 1 min @ 105% FTP ("Over"). Recover 4-5 min @ 50% FTP between sets.
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 90-100 rpm (maintain cadence or slightly increase during "Overs").

---

## 6. VO2max (Zone 5)

**Purpose:** Increase maximal oxygen uptake (VO2max), improve repeatability of high-power efforts, and pull the FTP ceiling higher.
**When to Use:** Late Build phase, Specialty phase (criteriums, cross-country MTB, road racing).

### Template A: 4x4 min VO2max
*   **Duration:** 60 minutes
*   **TSS Estimate:** 75 - 85
*   **Structure:**
    *   **Warm-up:** 15 min build 50% -> 80% FTP + 2x(1m @ 100%, 1m @ 50%)
    *   **Main Set:** 4 x 4 min @ 106-115% FTP with 4 min recovery @ 40-50% FTP
    *   **Cool-down:** 15 min @ 50% FTP
*   **Cadence:** 95-105+ rpm.

### Template B: 30/30s (Micro-intervals)
*   **Duration:** 60 minutes
*   **TSS Estimate:** 65 - 75
*   **Structure:**
    *   **Warm-up:** 15 min build 50% -> 80% FTP
    *   **Main Set:** 3 blocks of (10 x [30 sec @ 120-130% FTP / 30 sec @ 50% FTP]). Recover 5 min @ 50% FTP between blocks.
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 100+ rpm during efforts.

### Template C: Rønnestad Intervals (30/15s)
*   **Duration:** 60 minutes
*   **TSS Estimate:** 70 - 85
*   **Structure:**
    *   **Warm-up:** 15 min build 50% -> 80% FTP
    *   **Main Set:** 3 blocks of (13 x [30 sec @ 120-130% FTP / 15 sec @ 50% FTP]). Recover 4 min @ 50% FTP between blocks.
    *   **Cool-down:** 10 min @ 50% FTP
*   **Cadence:** 100+ rpm during efforts. Requires high focus due to short recovery.

---

## 7. Anaerobic Capacity (Zone 6)

**Purpose:** Improve neuromuscular power, sprint capability, and ability to handle intense, short-duration surges (attacks, punchy climbs).
**When to Use:** Specialty phase, 1-3 weeks prior to goal event (criteriums, track racing, cyclocross).

### Template A: Tabata Intervals
*   **Duration:** 45 - 60 minutes
*   **TSS Estimate:** 50 - 65
*   **Structure:**
    *   **Warm-up:** 20 min extended warm-up, building to 80% FTP with 2-3 short spin-ups.
    *   **Main Set:** 2-3 sets of (8 x [20 sec @ 150%+ FTP (Max Effort) / 10 sec @ 40% FTP]). Recover 8-10 min @ 40-50% FTP between sets.
    *   **Cool-down:** 15 min @ 40-50% FTP
*   **Cadence:** 110+ rpm during efforts.

### Template B: Sprints (Neuromuscular)
*   **Duration:** 60 minutes
*   **TSS Estimate:** 40 - 55 (Note: TSS is a poor metric for sprint workouts; focus on peak power generated).
*   **Structure:**
    *   **Warm-up:** 20 min thorough warm-up.
    *   **Main Set:** 6 x 15 sec ALL-OUT sprints (200%+ FTP / Peak Power). Recover 5-8 min @ 40-50% FTP between sprints to ensure full ATP-PC system replenishment.
    *   **Cool-down:** 10-15 min @ 40-50% FTP
*   **Cadence:** Max cadence (120+ rpm) during sprint.

---

## 8. Opener (Pre-Race)

**Purpose:** "Prime" the aerobic and anaerobic systems, clear out sluggishness after a taper, without inducing fatigue that carries over to race day.
**When to Use:** 24 hours before a B or A priority event.

*   **Duration:** 45 - 60 minutes
*   **TSS Estimate:** 35 - 45
*   **Structure:**
    *   **Warm-up:** 15-20 min @ 50-65% FTP
    *   **Main Set:**
        *   1 x 3 min @ 100% FTP (Threshold)
        *   2 min recovery @ 50% FTP
        *   1 x 1 min @ 110-115% FTP (VO2max)
        *   2 min recovery @ 50% FTP
        *   3 x 10 sec @ 150%+ FTP (Sprint), 1 min recovery between
    *   **Cool-down:** 15 min @ 40-50% FTP
*   **Cadence:** Mixed. Use race-specific cadences during efforts.
