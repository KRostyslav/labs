/**
 * Стенд лаби №3 «Температурна залежність електропровідності напівпровідників. Ширина забороненої зони».
 *
 * Стенд:   зразок (брусок l = 10 мм, S = 2 мм²) в електропечі; нагрівач EK1 живиться від
 *          терморегулятора через вимикач SA1; опір зразка вимірює цифровий омметр PR1
 *          (межі 200 Ом … 20 МОм), температуру поблизу зразка — цифровий термометр PK1.
 * Студент: вибирає зразок (германій, мідний дріт, «X»), вмикає піч, задає t_зад (крок 5 °C),
 *          чекає, поки температура встановиться, перемикає межі омметра й записує виміри;
 *          будує графіки R(t) і ln R — 10³/T, проводить пряму МНК через вибрані точки.
 * Дані:    фізика — ./model.ts; прилади — THERMOMETER і DMM_OHM з src/core/instrumentCatalog.ts;
 *          таблиця зберігається в localStorage під ключем 'vlab:band-gap:<зразок>'.
 *
 * Динаміка печі (у реальному часі): кожні 150 мс фактична t наближається до цілі
 * (furnaceStep, τ = 4 с; з прискоренням ×10 — у 10 разів швидше). Початковий стан
 * детермінований (t = 20 °C), а таймер запускається лише в браузері після монтування,
 * тому серверний і клієнтський рендер збігаються.
 *
 * Потік даних на кожен рендер:
 *   t (стан печі) → simulate() (істинний R) → readInstrument() (покази з шумом) → UI
 */
import { useEffect, useState } from 'react';
import {
  Bench,
  Controls,
  DigitalMeter,
  FitResult,
  Instruments,
  MeasurementTable,
  Panel,
  ParamSlider,
  Plot,
  PLOT_COLORS,
  RecordButton,
  Segmented,
  Sim,
  Tabs,
  ToggleSwitch,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
  type PlotSeries,
} from '@/components/sim';
import { Block, Heater, Meter, Node, Resistor, Schematic, Switch, Text, Wire } from '@/components/schematic/Schematic';
import { autoRange, readInstrument, readingIn } from '@/core/instruments';
import { DMM_OHM, THERMOMETER } from '@/core/instrumentCatalog';
import { linearFit } from '@/core/stats';
import { formatFixed, formatNum } from '@/core/format';
import { celsiusToKelvin } from '@/physics/constants';
import {
  AMBIENT_C,
  SAMPLES,
  SETPOINT_STEP_C,
  arrheniusPoint,
  furnaceStep,
  inFitRange,
  isStabilized,
  simulate,
  type SampleId,
} from './model';

const LAB_ID = 'band-gap';
/** Період оновлення температури печі, мс. */
const TICK_MS = 150;
/** Прискорення часу для режиму «Прискорити (×10)». */
const SPEEDUP = 10;

/** Рядок таблиці: t — у °C (показ термометра), R — в омах (незалежно від межі омметра). */
type Row = { t: number; R: number };

const COLUMNS: Column<Row>[] = [
  { key: 't', label: 't, °C', decimals: 1 },
  // Обчислювані стовпці: T = t + 273,15; 10³/T; ln R (R в омах)
  { key: 'T', label: 'T, К', decimals: 2, compute: (r) => celsiusToKelvin(r.t) },
  { key: 'R', label: 'R, Ом' },
  { key: 'invT', label: '10³/T, К⁻¹', decimals: 4, compute: (r) => 1e3 / celsiusToKelvin(r.t) },
  { key: 'lnR', label: 'ln R', decimals: 3, compute: (r) => (r.R > 0 ? Math.log(r.R) : null) },
];

const SAMPLE_OPTIONS: { value: SampleId; label: string }[] = [
  { value: 'Ge', label: 'Германій' },
  { value: 'Cu', label: 'Мідний дріт' },
  { value: 'X', label: 'Зразок «X»' },
];

/** Які точки брати для прямої МНК (0 — усі). */
const FIT_FROM_OPTIONS = [
  { value: 0, label: 'усі' },
  { value: 60, label: 't ≥ 60 °C' },
  { value: 100, label: 't ≥ 100 °C' },
];

type PlotTab = 'rt' | 'arr';

export default function Simulation() {
  // ---- стан стенда ----
  const [sampleId, setSampleId] = useState<SampleId>('Ge');
  const [furnaceOn, setFurnaceOn] = useState(false);
  const [setpoint, setSetpoint] = useState(AMBIENT_C);
  const [t, setT] = useState(AMBIENT_C); // фактична температура в печі, °C
  const [fast, setFast] = useState(false);
  const [ohmRange, setOhmRange] = useState(2); // індекс межі в DMM_OHM.ranges (20 кОм)
  const [tab, setTab] = useState<PlotTab>('rt');
  const [fitFrom, setFitFrom] = useState(0);
  const [showFit, setShowFit] = useState(false);

  const noise = useNoise(LAB_ID);
  const table = useMeasurements<Row>(`${LAB_ID}:${sampleId}`);
  const sample = SAMPLES[sampleId];

  // ---- піч: t експоненційно наближається до цілі (лише в браузері) ----
  const target = furnaceOn ? setpoint : AMBIENT_C;
  useEffect(() => {
    const dt_s = (TICK_MS / 1000) * (fast ? SPEEDUP : 1);
    const id = setInterval(() => setT((prev) => furnaceStep(prev, target, dt_s)), TICK_MS);
    return () => clearInterval(id);
  }, [target, fast]);
  const stable = isStabilized(t, target);

  // ---- фізика → прилади ----
  const truth = simulate({ temperature_K: celsiusToKelvin(t) }, sample);
  // Поки температура змінюється, покази «пливуть»; після стабілізації ключ шуму сталий
  const key = stable ? `${sampleId}:${target}:stable` : `${sampleId}:${t.toFixed(1)}`;
  const tRead = readInstrument(THERMOMETER, 0, t, noise.rngFor(key, 'PK1'));
  const rRead = readInstrument(DMM_OHM, ohmRange, truth.resistance_Ohm, noise.rngFor(key, 'PR1'));
  const finerRange = !rRead.overRange && autoRange(DMM_OHM, truth.resistance_Ohm) < ohmRange;

  const blocked = rRead.overRange
    ? 'Омметр показує OL — перемкніть на більшу межу'
    : !stable
      ? furnaceOn
        ? 'Зачекайте: температура ще встановлюється'
        : 'Зачекайте: піч вимкнена, зразок ще остигає'
      : null;

  const record = () => {
    const tC = readingIn(tRead, 1);
    const R = readingIn(rRead, 1); // в омах незалежно від межі
    if (tC === null || R === null) return;
    table.add({ t: tC, R });
    noise.next(); // наступний вимір матиме новий випадковий розкид
  };

  const changeSample = (id: SampleId) => {
    setSampleId(id);
    setSetpoint((sp) => Math.min(sp, SAMPLES[id].maxTemp_C));
    setShowFit(false);
  };

  // ---- стан печі для індикатора ----
  const statusText = furnaceOn
    ? stable
      ? `✓ Стабілізовано: t = ${setpoint} °C`
      : `Температура встановлюється… ${formatFixed(t, 1)} → ${setpoint} °C`
    : stable
      ? `✓ Піч вимкнена, кімнатна температура ${AMBIENT_C} °C`
      : `Піч вимкнена — зразок остигає: ${formatFixed(t, 1)} → ${AMBIENT_C} °C`;

  // ---- графіки і МНК ----
  const rtPoints = table.rows.map((r) => ({ x: r.t, y: r.R }));
  const arr = table.rows.filter((r) => r.R > 0).map((r) => ({ t: r.t, ...arrheniusPoint(r.t, r.R) }));
  // inFitRange — з запасом 2 °C: показ 99,7 °C при t_зад = 100 °C теж входить у «t ≥ 100 °C»
  const used = arr.filter((p) => inFitRange(p.t, fitFrom)).map(({ x, y }) => ({ x, y }));
  const rest = arr.filter((p) => !inFitRange(p.t, fitFrom)).map(({ x, y }) => ({ x, y }));
  const fit =
    showFit && used.length >= 2
      ? linearFit(
          used.map((p) => p.x),
          used.map((p) => p.y),
        )
      : null;
  const arrSeries: PlotSeries[] = [
    { id: 'used', label: fitFrom > 0 ? `точки з t ≥ ${fitFrom} °C` : sample.name, points: used, color: PLOT_COLORS[0] },
  ];
  if (rest.length > 0) arrSeries.push({ id: 'rest', label: 'не входять у пряму', points: rest, color: '#9aa1aa', marker: 'square' });

  // ---- вигляд схеми ----
  const heat = Math.min(1, Math.max(0, (t - AMBIENT_C) / 230));
  const heaterFlow = furnaceOn ? (stable ? 0.3 : 0.9) : 0;

  return (
    <Sim>
      <Bench>
        <Panel area="schematic" title="Схема установки">
          <Schematic
            width={490}
            height={300}
            title="Зразок в електропечі під'єднано до омметра PR1; поруч термометр PK1; нагрівач EK1 живиться від регулятора через вимикач SA1"
          >
            {/* «Жар» у печі: що гарячіше, то яскравіше */}
            <rect x={40} y={58} width={250} height={170} rx={3} fill="#ff6a2b" opacity={0.28 * heat} />
            <Block x={165} y={143} w={250} h={170} dashed />
            <Text x={282} y={76} small anchor="end">
              Електропіч
            </Text>

            {/* Зразок і омметр */}
            <Resistor x={170} y={105} label={`Зразок ${sampleId}`} labelDy={-16} active />
            <Wire points={[[140, 105], [115, 105], [115, 32], [470, 32], [470, 105], [450, 105]]} flow={0.25} />
            <Meter x={420} y={105} sym="Ω" label="PR1" />
            <Wire points={[[200, 105], [390, 105]]} flow={-0.25} />

            {/* Термопара біля зразка → термометр */}
            <Node x={170} y={160} />
            <Wire points={[[170, 160], [370, 160]]} />
            <Block x={420} y={160} w={100} h={36} text="Термометр" sub="PK1" />

            {/* Нагрівач, вимикач і регулятор */}
            <Heater x={170} y={195} label="EK1" labelDy={24} active={furnaceOn} />
            <Wire points={[[140, 195], [115, 195], [115, 265], [130, 265]]} flow={heaterFlow} />
            <Switch x={160} y={265} closed={furnaceOn} label="SA1" labelDy={24} />
            <Wire points={[[190, 265], [220, 265]]} flow={heaterFlow} />
            <Block x={260} y={265} w={80} h={36} text="~220 В" sub={furnaceOn ? `${setpoint} °C` : 'вимк.'} />
            <Wire points={[[300, 265], [315, 265], [315, 195], [200, 195]]} flow={heaterFlow} />
          </Schematic>
        </Panel>

        <Panel area="instruments" title="Вимірювальні прилади" dark>
          <Instruments>
            <DigitalMeter spec={THERMOMETER} rangeIdx={0} reading={tRead} tag="PK1" flag="TEMP" />
            <DigitalMeter spec={DMM_OHM} rangeIdx={ohmRange} onRangeChange={setOhmRange} reading={rRead} tag="PR1" flag="Ω" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented label="Зразок" value={sampleId} onChange={changeSample} options={SAMPLE_OPTIONS} />
            <ToggleSwitch label="Електропіч" checked={furnaceOn} onChange={setFurnaceOn} led />
            <ParamSlider
              label="Задана температура"
              value={setpoint}
              min={AMBIENT_C}
              max={sample.maxTemp_C}
              step={SETPOINT_STEP_C}
              unit="°C"
              decimals={0}
              onChange={setSetpoint}
              hint={`Для цього зразка — не вище ${sample.maxTemp_C} °C.`}
            />
            <div className={`sim-status ${stable ? 'sim-status--ok' : 'sim-status--overload'}`}>{statusText}</div>
            <ToggleSwitch label="Прискорити (×10)" checked={fast} onChange={setFast} />
            <RecordButton onRecord={record} disabledReason={blocked} count={table.rows.length} />
            {finerRange && (
              <div className="sim-field__hint">
                Порада: омметр можна перемкнути на меншу межу — показ матиме більше значущих цифр.
              </div>
            )}
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={`Таблиця вимірювань · ${sample.name}`}>
          <MeasurementTable columns={COLUMNS} rows={table.rows} onRemove={table.remove} onClear={table.clear} />
        </Panel>
        <Panel
          title="Графіки"
          actions={
            tab === 'arr' && (
              <button type="button" className="btn btn-sm" onClick={() => setShowFit((v) => !v)} disabled={used.length < 2}>
                {showFit ? 'Сховати пряму' : 'Провести пряму (МНК)'}
              </button>
            )
          }
        >
          <Tabs
            tabs={[
              { id: 'rt', label: 'R(t)' },
              { id: 'arr', label: 'ln R — 10³/T' },
            ]}
            value={tab}
            onChange={setTab}
            label="Графіки"
          />
          {tab === 'rt' ? (
            <Plot series={[{ id: 'rt', label: sample.name, points: rtPoints }]} xLabel="t, °C" yLabel="R, Ом" />
          ) : (
            <>
              <Segmented label="Точки для прямої" value={fitFrom} onChange={setFitFrom} options={FIT_FROM_OPTIONS} />
              <Plot
                series={arrSeries}
                lines={fit ? [{ slope: fit.slope, intercept: fit.intercept, label: 'Пряма МНК' }] : []}
                xLabel="10³/T, К⁻¹"
                yLabel="ln R"
              />
              {fit && (
                <FitResult>
                  Нахил прямої (за {fit.n} точками): <b>{formatNum(fit.slope, 4)}</b> на одиницю 10³/T → нахил у
                  координатах ln R — 1/T: <b>{formatNum(fit.slope * 1e3, 4)} К</b>.
                  <br />
                  {fit.slope > 0 ? (
                    <>
                      E<sub>g</sub> = 2·k<sub>B</sub>·(нахил) — обчисліть самі.
                    </>
                  ) : (
                    <>Нахил від'ємний: опір зростає з нагріванням — так поводиться метал, E<sub>g</sub> для нього не визначають.</>
                  )}
                </FitResult>
              )}
            </>
          )}
        </Panel>
      </Workbook>
    </Sim>
  );
}
