---
sources:
  - title: "Banister, E.W. (1975) - Impulse-Response Model"
    url: null
  - title: "Training and Racing with a Power Meter - Coggan & Allen"
    url: null
  - title: "Skiba, P.F. et al. (2012) - W'bal Model"
    url: null
  - title: "GoldenCheetah Open Source Project"
    url: "https://github.com/GoldenCheetah/GoldenCheetah"
---

# Cycling Fatigue Models and Metrics

## 1. Training Stress Score (TSS)

TSS is a composite number that takes into account the duration and intensity of a workout to arrive at a single estimate of the total training load and physiological stress created by that training session.

### Full Formula (Power-based)
The standard TSS formula developed by Dr. Andrew Coggan:
$$TSS = \frac{t \times NP \times IF}{FTP \times 3600} \times 100$$
Where:
- **t**: Duration in seconds.
- **NP**: Normalized Power (W).
- **IF**: Intensity Factor.
- **FTP**: Functional Threshold Power (W).
- **3600**: Seconds in an hour.

### Simplified Formula (RPE-based)
When power data is unavailable, TSS can be estimated using Duration and Rate of Perceived Exertion (RPE):
$$TSS_{est} = (\text{Duration in hours}) \times (\text{RPE}^2) \times C$$
*(Note: A common mapping uses RPE 1-10 to estimate intensity relative to threshold.)*

---

## 2. Chronic Training Load (CTL), Acute Training Load (ATL), and Training Stress Balance (TSB)

These metrics form the basis of the Impulse-Response model (Banister Model) adapted for cycling by Coggan.

### Formulas
The model uses exponentially weighted moving averages (EWMA).

- **CTL (Fitness):** Represents long-term training load (typically 42-day constant).
  $$CTL_{today} = CTL_{yesterday} + \frac{TSS_{today} - CTL_{yesterday}}{42}$$
- **ATL (Fatigue):** Represents short-term training load (typically 7-day constant).
  $$ATL_{today} = ATL_{yesterday} + \frac{TSS_{today} - ATL_{yesterday}}{7}$$
- **TSB (Form):** The difference between fitness and fatigue.
  $$TSB = CTL - ATL$$

---

## 3. TSB Interpretation Table

TSB (Form) is used to predict performance readiness and injury risk.

| TSB Value | State | Description |
| :--- | :--- | :--- |
| **> +25** | Transition | Deep recovery or loss of fitness; suitable for off-season. |
| **+10 to +25** | Freshness | Tapering for an event; peak performance zone. |
| **-10 to +10** | Neutral | Maintenance phase; "Grey zone" where fitness doesn't change much. |
| **-30 to -10** | Optimal | Productive training zone; building fitness efficiently. |
| **< -30** | Overload | High risk of overtraining and injury; requires immediate recovery. |

---

## 4. W' Balance (W'bal) Model

Developed by Dr. Philip Skiba and implemented in GoldenCheetah, W' (W-prime) represents the finite capacity to do work above Critical Power (CP).

### Formula (Integral Form)
$$W'_{bal}(t) = W' - \int_{0}^{t} W_{exp}(u) \cdot e^{-(t-u)/\tau_{W'}} du$$

### Simplified Discrete Form
$$W'_{bal} = W' - \sum (W_{exp} \cdot e^{-(t-t_i)/\tau})$$
Where:
- **W'**: The initial anaerobic work capacity (Joules).
- **W_exp**: Energy expended above CP ($P > CP$).
- **tau ($\tau$):** Recovery time constant, which depends on the difference between CP and recovery power.

---

## 5. Safe CTL Ramp Rates

To avoid overtraining, the rate at which you increase CTL (the "Ramp Rate") should be monitored weekly.

- **Safe:** 3 – 5 points per week.
- **Challenging:** 5 – 8 points per week.
- **High Risk:** > 10 points per week.

---

## 6. Intensity Factor (IF) and Normalized Power (NP)

### Normalized Power (NP)
NP accounts for the physiological cost of surges, which is more taxing than steady-state riding.
1. Calculate a 30-second rolling average of power.
2. Raise these values to the 4th power.
3. Average the resulting values.
4. Take the 4th root of that average.

### Intensity Factor (IF)
IF is the ratio of NP to FTP, providing a relative measure of intensity.
$$IF = \frac{NP}{FTP}$$
- **< 0.75:** Recovery / Level 1.
- **0.75 - 0.85:** Endurance / Level 2.
- **0.85 - 0.95:** Tempo / Level 3.
- **0.95 - 1.05:** Threshold / Level 4.
- **> 1.05:** VO2Max / Level 5+.

---

## 7. Overtraining Markers

Signs that training load is exceeding recovery capacity:
- **Resting Heart Rate:** Persistent increase of > 5 bpm.
- **HR Max:** Inability to reach maximal heart rate during intervals.
- **Sleep:** Insomnia or frequent waking.
- **Mood:** Irritability or lack of motivation.
- **Performance:** Unexpected drop in power for a given effort level.

---

## 8. TSS Benchmarks

Estimated recovery requirements based on a single session's TSS:

- **< 150:** Low stress; recovery is usually complete within 24 hours.
- **150 - 300:** Medium stress; residual fatigue may be present the next day.
- **300 - 450:** High stress; 48+ hours may be required for recovery.
- **> 450:** Very high stress; may cause fatigue lasting several days.

---

### References
- Banister, E.W. (1975). *Modeling Training Response.*
- Coggan, A., & Allen, H. *Training and Racing with a Power Meter.*
- Skiba, P. F., et al. (2012). *Modeling the expenditure and reconstitution of work capacity above critical power.*
- GoldenCheetah Open Source Project.
