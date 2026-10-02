# Test report

## 1. Manual-derived test suite

`node --test tests/*.test.js` — **254 tests, 254 passing (100 %)**.

| File | What it covers |
|---|---|
| `tests/manual.test.js` | 191 tests: every worked example in the fx-991EX user manual, typed as the manual's key sequence and compared with the result the manual prints (pages 6–44) |
| `tests/sanity.test.js` | the spec's sanity checks (§7.2), persistence across restarts, corrupted / blocked / full storage, ON/OFF, RESET, IO change, and a randomised "press any key in any mode" robustness test |
| `tests/engine.test.js` | the BigInt decimal engine (rounding, transcendental functions, speed) |
| `tests/fixes.test.js` | 49 regression tests for differences found against the real unit: the [−] key as a negative sign (Abs(−1), √(−4) in Complex mode, negative Equation/Inequality coefficients), the [+] key as a plus sign (+2+4, +3 as a coefficient), S⇔D in Ratio and Equation/Func modes, ALPHA + A/B/C in MENU, the space digit separator, page-wise ▲/▼ and the indented layout of the statistics result list, the cursor at the left end of the line, the one-line cell value in Table mode, the 9×14 LCD font and the 𝑥 / × glyphs |

Examples by manual section (all passing): setup & number formats (p6–7), input rules and
priority (p8–9), natural input, INS, UNDO (p9–10), S⇔D, fractions, percent, DMS,
multi-statements, ENG, engineering symbols, prime factorisation, history, replay (p10–12),
Ans, variables, independent memory, RESET Memory (p13–14), every function example incl.
∫, d/dx, Σ, Pol/Rec, x!, Abs, Ran#, RanInt#, nPr/nCr, Rnd in both Math and Line IO (p14–17),
Complex (p18), CALC and SOLVE (p19), Statistics Ex1–Ex5 (p20–23), Base-N (p23–24),
Equation/Func (p24–25), Matrix (p25–27), Table (p27–28), Vector (p28–29), Inequality (p29–30),
Ratio (p30), Distribution (p31–33), Spreadsheet Ex1–Ex5 + copy/paste/circular (p33–36),
CONST/CONV (p37, p44), error handling (p37–39), FAQ (p42–43).

Not automated (with reason):

- **p3 Contrast** — visual; implemented (SETUP ▲ 3, ◀/▶), checked by eye.
- **p3 auto power-off after ~10 min** — timer lives in the browser layer (`js/main.js`); checked manually.
- **p17 QR Code** — needs Casio's web service; deliberately excluded (see deviations).
- **p39–41 battery / hardware** — not applicable to an app.

A randomised robustness run (40 seeds × 12 modes × 2 IO formats × 600 keys ≈ 576 000 key presses)
produced no internal errors.

### Spec sanity checks (§7.2)

| Check | Result |
|---|---|
| `sin(30)` in DEG → `1/2`, S⇔D → `0.5` | ✅ |
| `1/3 + 1/6` → `1/2` | ✅ |
| `√2 × √8` → `4` | ✅ |
| `0.1 + 0.2` → `0.3` | ✅ — like the real unit, MathI/MathO first shows the exact `3/10`; S⇔D, MathI/DecimalO and LineI/LineO show `0.3` (never 0.30000000000000004) |
| `1 ÷ 0` → `Math ERROR` | ✅ |
| STO variable survives closing/reopening | ✅ (`sanity.test.js`) |

## 2. PWA checks — `node tools/pwa-check.mjs` (Chromium)

All passing, served from a `/repo/` sub-path like GitHub Pages:

- manifest: `start_url`/`scope` `./`, `display: standalone`, icons 192, 512 and maskable 512
- Chrome installability check (DevTools `Page.getInstallabilityErrors`): **installable**
- service worker controls the page; all precache entries are in the versioned cache
- **offline:** network disabled, page reloaded, calculation works
- **auto update:** publishing a new `sw.js` version → new worker installs and takes control,
  old caches deleted, the page is *not* reloaded while in use

Lighthouse removed its PWA category in Lighthouse 12, so Chrome's own installability check is used instead.

## 3. Performance

Key press → next painted frame, Chromium with **4× CPU throttling** (mid-range Android
approximation): median 16 ms, worst 33 ms. Long computations (∫, Σ, SOLVE) run in 25 ms slices
so the UI stays responsive, and AC interrupts them (manual p14).

## 4. Visual comparison

The calculator body is built from measurements of the reference photo (body 841 × 1796 px:
key grid pitch 124 × 102 for dark keys and 150 × 125 for white keys, LCD glass 671 × 269,
D-pad centre, legend positions) and colours sampled from it. Side-by-side screenshots at phone
size were compared during development (the reference photo itself is not published here).
Intentional differences:

- no CASIO / fx-991EX / CLASSWIZ printing — replaced by the owner's "LOGO" slot (spec §4.6)
- LCD fonts and MENU pictograms are original pixel drawings in the same style (Casio's bitmaps are not copied).
  The large font uses 9×14-dot character cells (digits and capitals 7 dots wide and 11 dots tall,
  9-dot advance); the variable 𝑥 is drawn as a curly italic and the multiplication sign × as a small
  5×5 cross on the operator axis so the two cannot be confused
- D-pad, metal key finish and panel texture are CSS/SVG approximations of the photo

## 5. Device tests (to be done by the owner on real hardware)

Automated checks ran in Chromium (Android phone viewport with touch emulation, and a 1366×768 desktop).
Please confirm on the real devices:

- [ ] Samsung phone / Chrome: *Install app*, opens full-screen, works in airplane mode, fast typing feels right
- [ ] Windows / Chrome and Edge: install icon, opens in its own window, works offline
- [ ] After publishing a new version (`node tools/bump-version.mjs …` + push), the installed app updates itself on a later launch

## 6. Known deviations from the real calculator

1. **QR Code (SHIFT OPTN)** shows "QR Code not available in this app". The real QR links to Casio's
   server, which an independent app cannot use. A possible alternative is a locally generated QR
   containing the result as plain text — tell me if you want that.
2. Where the manual is silent, behaviour is a best guess: the first SHIFT ENG press on a plain
   result; Statistics-editor cursor jumping to row 1 when changing column from the empty row (needed
   by the manual's own key sequences); order of cubic/quartic roots; `√(negative)` in Complex mode
   returns an imaginary result; Normal CD shows `p` only; Matrix/Vector cells show decimals (as the
   manual's screenshots) with the highlighted cell's exact value on the bottom line.
3. Exact trig results in MathO cover multiples of 15° and 18° (e.g. sin 15° = (√6−√2)/4).
4. Numerical integration (Gauss–Kronrod 7/15), differentiation (Ridders) and SOLVE (Newton) are
   independent implementations; they reproduce the manual's results but may differ from the real unit
   in the last digits or in borderline Time Out / Can't Solve cases.
5. Spreadsheet memory limits follow the 1,700-byte capacity and the 10/49-byte cell limits; the
   "chain of consecutive references" Memory ERROR rule is not reproduced exactly.
6. Restarting the app restores the screen you left (so an OS kill or an update never loses work);
   only an explicit OFF (SHIFT AC) → ON clears the history, as on the real unit.
7. Solar-cell indicator and battery behaviour are not applicable.
8. **Normal CD / Inverse Normal** results can differ from the fx-991EX after about the 7th decimal
   place. Checked against a Casio fx-CG50, which shows the same digits as this app, so the app's
   values are kept (the fx-991EX's own approximation is the less precise one).
