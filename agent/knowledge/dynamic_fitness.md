---
sources:
  - title: "Xert (Baronbiosys)"
    url: "https://www.baronbiosys.com"
  - title: "intervals.icu"
    url: "https://intervals.icu"
---

# Dynamic Fitness Models and Advanced Cycling Metrics

The landscape of endurance training has evolved significantly from static thresholds to dynamic, continuous models of human performance. Modern analytical platforms like Xert and intervals.icu leverage advanced algorithms to provide real-time insights into an athlete's physiological state.

## 1. Xert's Dynamic Fitness Model: MPA and the Fitness Signature

Xert revolutionized cycling analytics by shifting away from static Functional Threshold Power (FTP) toward a dynamic, continuous model based on three core parameters that form an athlete's **Fitness Signature**:

*   **Threshold Power (TP):** The highest power output an athlete can sustain without accumulating fatigue (analogous to FTP but derived dynamically).
*   **High-Intensity Energy (HIE):** The total amount of work (measured in kilojoules) an athlete can perform above Threshold Power before exhaustion (similar to W' or Anaerobic Work Capacity).
*   **Peak Power (PP):** The absolute maximum power (in watts) an athlete can generate for a single second, typically during a maximal sprint.

The cornerstone of the Xert model is **Maximal Power Available (MPA)**. MPA represents the maximum power an athlete can generate at any given second during an activity. While rested, MPA is equal to Peak Power. As the athlete rides above their Threshold Power, HIE is depleted, and MPA dynamically drops. When the required power to sustain an effort meets the declining MPA, exhaustion occurs. 

**Breakthrough Analysis:** A "Breakthrough" happens when an athlete's power output exceeds their current calculated MPA. Because it is physically impossible to produce more power than your maximal available power, the software mathematically reverse-engineers the effort to deduce that the athlete's Fitness Signature (TP, HIE, or PP) has improved. This eliminates the need for formal testing, as the system continuously updates the signature based on maximal efforts within regular rides or races.

## 2. Intervals.icu eFTP Estimation Methodology

Intervals.icu employs a robust, continuously updated estimation of FTP known as **eFTP** (estimated FTP). Unlike Xert's second-by-second MPA depletion model, intervals.icu relies on fitting a mathematical model to the athlete's Power-Duration (PD) curve.

The methodology involves:
1.  **Data Aggregation:** Plotting the maximum mean power for all durations (from 1 second to several hours) over a rolling window (e.g., 42 or 90 days).
2.  **Curve Fitting:** Intervals.icu applies established mathematical models (such as the Morton 3-parameter model or the Extended Critical Power model) to fit a curve to these maximal efforts.
3.  **eFTP Extraction:** The asymptote of this fitted curve, or a specific duration proxy (often corresponding to the 40-60 minute mark depending on the mathematical model used), is defined as the eFTP.
4.  **Effort Detection:** To prevent false positives from sub-maximal data, the algorithm requires "maximal efforts" of specific minimum durations (e.g., at least 3-5 minutes) to trigger an eFTP increase. If an athlete does a hard 5-minute effort that significantly raises the short end of the curve, the model recalculates the asymptote and updates the eFTP.

## 3. Training Intensity Distribution: Polarized vs. Pyramidal

The debate over the optimal Training Intensity Distribution (TID) largely centers on Polarized and Pyramidal models, both heavily researched by sports scientists like Dr. Stephen Seiler.

*   **Polarized Training (80/0/20):** Characterized by a high volume of low-intensity training (Zone 1 in a 3-zone model) and a smaller volume of high-intensity training (Zone 3), with purposeful avoidance of moderate-intensity "Tempo" or "Sweet Spot" training (Zone 2). 
    *   *Evidence:* Extensive observational research on elite rowers, cross-country skiers, and cyclists shows this is the dominant distribution among world-class endurance athletes.
    *   *Best Used:* During base phases, for highly trained athletes who need to manage massive training volumes without overtraining, and when peak aerobic capacity (VO2max) development is the primary goal.
*   **Pyramidal Training (70/20/10):** Features a large base of low-intensity training, a moderate amount of threshold/tempo work, and a small amount of high-intensity work.
    *   *Evidence:* Often naturally emerges in age-group athletes and has been shown to be highly effective, sometimes outperforming polarized training in athletes with lower weekly training volumes (under 8-10 hours).
    *   *Best Used:* During the build phase, for time-crunched amateur cyclists, and when preparing for steady-state events like Ironmans or long gran fondos where sustained sub-threshold power is critical.

## 4. Efficiency Factor (EF) and Aerobic Decoupling (Pa:HR)

Developed by Joe Friel, these metrics assess aerobic endurance and efficiency, determining when an athlete has achieved a sufficient "base."

*   **Efficiency Factor (EF):** Calculated as Normalized Power (NP) divided by average Heart Rate (HR) for a steady-state aerobic workout. A rising EF over weeks of base training indicates improved aerobic fitness—the athlete is producing more power for the same cardiovascular cost.
*   **Aerobic Decoupling (Pa:HR):** Measures the divergence between power output and heart rate over the course of a long, steady-state ride. It compares the EF of the first half of the ride to the EF of the second half.
    *   *Target:* A decoupling rate of **< 5%** indicates excellent aerobic endurance for that specific duration. If decoupling exceeds 5%, the athlete's heart rate is drifting upward significantly to maintain the same power, indicating fatigue and a need for further aerobic base development before progressing to higher-intensity phases.

## 5. Adaptive Decay Constants (Individualized Impulse-Response Models)

Traditional fitness tracking (like the classic Training Stress Balance model) assumes static time constants for calculating Chronic Training Load (CTL, "Fitness") and Acute Training Load (ATL, "Fatigue"). The default is usually 42 days for CTL and 7 days for ATL.

However, advanced platforms and sports science literature recognize that athletes adapt and recover at different rates.
*   **CTL Time Constant ($\tau$):** Represents how quickly training stress converts to long-term fitness. Older athletes or those with extensive training histories may benefit from a longer constant ($\tau = 45-55$ days), while newer or younger athletes might adapt faster ($\tau = 35-40$ days).
*   **ATL Time Constant ($\tau$):** Represents how quickly fatigue dissipates. Athletes with exceptional recovery capabilities might have an ATL $\tau = 5$ days, meaning they shed fatigue rapidly, while others may require $\tau = 10$ days. 
Adapting these constants provides a much more accurate prediction of an athlete's actual "Form" (TSB) on race day.

## 6. Power Duration Curve Analysis and Rider Phenotyping

The Power-Duration (PD) curve plots an athlete's maximal power against time. Analyzing the shape of this curve allows for precise **Rider Phenotyping**:

*   **Sprinter:** Exhibits a massive spike at the 1-15 second range (high Peak Power) but a rapid drop-off, resulting in a lower FTP compared to their peak. They excel in bunch sprints and criteriums.
*   **Pursuiter / Puncheur:** Shows exceptional power in the 1 to 5-minute range (high HIE/W' or VO2max). Their curve remains elevated longer than a sprinter's before settling to threshold. They excel in short, steep climbs, track pursuits, and decisive breakaways.
*   **Time Trialist / Climber (Steady State):** Features a very flat PD curve. Their 1-second power may be relatively low, but the curve barely declines between 5 minutes and 60 minutes. They have a high Threshold Power relative to their VO2max and excel in long climbs, triathlons, and time trials.

## 7. Modern FTP Testing Protocols

While continuous modeling (Xert, intervals.icu) reduces the need for formal testing, field tests remain vital for baselining and validation.

*   **The 20-Minute Test (× 0.95):** The classic protocol popularized by Hunter Allen and Andrew Coggan. After a thorough warm-up and a 5-minute blowout effort (to deplete anaerobic capacity), the athlete rides at maximal sustainable pace for 20 minutes. FTP is estimated as 95% of the average power. 
*   **The Ramp Test (× 0.75):** Popularized by TrainerRoad and Zwift. The athlete starts at a low wattage, and the resistance increases by a set amount (e.g., 20w) every minute until failure. FTP is typically calculated as 75% of the highest 1-minute power achieved. *Pros:* Less pacing required, less psychological stress. *Cons:* Can overestimate FTP for athletes with large anaerobic capacities (pursuiters) and underestimate for diesel engines.
*   **The 8-Minute Test (× 0.90):** Developed by Chris Carmichael (CTS). Involves two 8-minute maximal efforts separated by 10 minutes of easy spinning. FTP is calculated as 90% of the highest average power of the two efforts. This is often preferred for athletes who struggle to pace a full 20-minute effort but requires careful management of the two intervals.
