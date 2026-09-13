/**
 * Стенд лаби №4 «Ефект Холла».
 *
 * Стенд:   коло зразка: джерело струму G1 (0–10 мА) → міліамперметр PA1 → зразок (контакти 1–2);
 *          коло магніта: джерело G2 (0–3 А) → амперметр PA2 → перемикач напрямку поля S2 → обмотка L1;
 *          тесламетр PT — датчик у зазорі магніта;
 *          вимірювальне коло: контакти A–B (U_H) або зонди C–D (U_σ) → перемикач S3 → мілівольтметр PV1.
 * Студент: вибирає зразок, змінює I та I_м, перемикає S2 (+B / −B) і S3, межі приладів;
 *          записує U₁ (+B) і U₂ (−B) — з двох записів складається один рядок таблиці Холла;
 *          окремо записує U_σ для обчислення провідності.
 * Дані:    фізика — ./model.ts; прилади — src/core/instrumentCatalog.ts і ./instruments.ts;
 *          таблиці — localStorage 'vlab:hall-effect:<зразок>:vsI' | ':vsB' | ':sigma'.
 *
 * Потік даних на кожен рендер:
 *   параметри → simulate() (істина) → readInstrument() (показ з шумом і квантуванням) → UI
 */
import { useState } from 'react';
import {
  AnalogMeter,
  Bench,
  Controls,
  DigitalMeter,
  FitResult,
  Instruments,
  MeasurementTable,
  Panel,
  ParamSlider,
  Plot,
  RecordButton,
  Segmented,
  Sim,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
} from '@/components/sim';
import { Block, Coil, CurrentSource, Meter, Node, Source, Wire } from '@/components/schematic/Schematic';
import { readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_MILLIVOLT, TESLAMETER } from '@/core/instrumentCatalog';
import { fitThroughOrigin, mean } from '@/core/stats';
import { formatFixed, formatNum } from '@/core/format';
import { ANALOG_AMMETER_3A } from './instruments';
import { FieldMark, MEASURE_SWITCH_PINS as S3P, MeasureSwitch, ProbeMeter, ReversingSwitch, type MeasureMode } from './parts/SchematicParts';
import SampleView from './parts/SampleView';
import { LIMITS, PROBE_DISTANCE_M, SAMPLES, SAMPLE_WIDTH_M, simulate, type FieldDir, type SampleId } from './model';
import './hall.css';

const LAB_ID = 'hall-effect';

type SeriesId = 'vsI' | 'vsB';

/** Рядок таблиці Холла: I — мА, B — мТл (модуль, показ при +B), U₁ і U₂ — мВ. */
type HallRow = { I: number; B: number; U1: number; U2: number };
/** Рядок таблиці провідності: I — мА, U — мВ (U_σ між зондами C–D). */
type SigmaRow = { I: number; U: number };

const HALL_COLUMNS: Column<HallRow>[] = [
  { key: 'I', label: 'I, мА', decimals: 2 },
  { key: 'B', label: 'B, мТл', decimals: 0 },
  { key: 'U1', label: 'U₁ (+B), мВ', decimals: 3 },
  { key: 'U2', label: 'U₂ (−B), мВ', decimals: 3 },
  // Обчислюваний стовпець: холлівська напруга без паразитних доданків
  { key: 'UH', label: 'U_H = (U₁ − U₂)/2, мВ', decimals: 3, compute: (r) => (r.U1 - r.U2) / 2 },
];

const SIGMA_COLUMNS: Column<SigmaRow>[] = [
  { key: 'I', label: 'I, мА', decimals: 2 },
  { key: 'U', label: 'U_σ, мВ', decimals: 1 },
];

const SERIES_TEXT: Record<SeriesId, { short: string; title: string }> = {
  vsI: { short: 'Серія 1', title: 'Серія 1 · U_H(I) при B = const' },
  vsB: { short: 'Серія 2', title: 'Серія 2 · U_H(B) при I = const' },
};

/** Незавершений рядок таблиці Холла (записано лише U₁ або лише U₂). */
interface Pending {
  series: SeriesId;
  sampleId: SampleId;
  /** Положення регуляторів у момент першого запису — щоб помітити зміну. */
  I_set_mA: number;
  Im_set_A: number;
  /** Покази, що підуть у таблицю. */
  I: number;
  B: number;
  U1: number | null;
  U2: number | null;
}

type Notice = { kind: 'warn' | 'ok'; text: string } | null;

/** Три таблиці одного зразка. Ключі сталі, тому таблиці різних зразків не змішуються. */
function useSampleTables(id: SampleId) {
  return {
    vsI: useMeasurements<HallRow>(`${LAB_ID}:${id}:vsI`),
    vsB: useMeasurements<HallRow>(`${LAB_ID}:${id}:vsB`),
    sigma: useMeasurements<SigmaRow>(`${LAB_ID}:${id}:sigma`),
  };
}

const mm = (x_m: number, d = 2) => formatFixed(x_m * 1e3, d);

export default function Simulation() {
  // ---- стан стенда ----
  const [sampleId, setSampleId] = useState<SampleId>('nGe');
  const [I_mA, setI] = useState(5); // струм через зразок, мА
  const [Im_A, setIm] = useState(1.5); // струм електромагніта, А
  const [s2, setS2] = useState<FieldDir>(1);
  const [s3, setS3] = useState<MeasureMode>('H');
  const [series, setSeries] = useState<SeriesId>('vsI');
  const [aRange, setARange] = useState(2); // DMM_DCA: 20 мА
  const [cRange, setCRange] = useState(1); // амперметр магніта: 3 А
  const [vRange, setVRange] = useState(1); // мілівольтметр: 200 мВ
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [showFit, setShowFit] = useState(false);

  const noise = useNoise(LAB_ID);
  const allTables = { nGe: useSampleTables('nGe'), pGe: useSampleTables('pGe'), X: useSampleTables('X') };
  const tables = allTables[sampleId];
  const hallTable = tables[series];

  // ---- фізика → прилади ----
  const sample = SAMPLES[sampleId];
  const I_A = I_mA * 1e-3;
  const truth = simulate({ current_A: I_A, magnetCurrent_A: Im_A, fieldDir: s2 }, sample);
  const key = `${sampleId}:${I_mA}:${Im_A}:${s2}:${s3}`;
  const aRead = readInstrument(DMM_DCA, aRange, I_A, noise.rngFor(key, 'PA1'));
  const cRead = readInstrument(ANALOG_AMMETER_3A, cRange, Im_A, noise.rngFor(key, 'PA2'));
  const tRead = readInstrument(TESLAMETER, 0, truth.field_T, noise.rngFor(key, 'PT'));
  const uTrue = s3 === 'H' ? truth.voltageAB_V : truth.voltageCD_V;
  const vRead = readInstrument(DMM_MILLIVOLT, vRange, uTrue, noise.rngFor(key, 'PV1'));

  // Стрілка PA2 в упорі (так само вирішує AnalogMeter, коли пише «ЗАШКАЛЮЄ»)
  const coilPinned = cRead.overRange && cRead.raw / cRead.range.max > 1.04;

  // ---- причини, з яких запис неможливий ----
  const meterBlock = aRead.overRange
    ? 'Міліамперметр PA1 показує OL — перемкніть його на більшу межу'
    : vRead.overRange
      ? 'Мілівольтметр PV1 показує OL — перемкніть його на більшу межу'
      : null;

  const hallBlock = (which: 1 | 2): string | null => {
    if (I_mA <= 0) return 'Струм через зразок I = 0 — встановіть I більше нуля';
    if (Im_A <= 0) return 'Електромагніт вимкнено (I_м = 0) — встановіть I_м більше нуля';
    if (s3 !== 'H') return 'Перемкніть S3 у положення «U_H (A–B)»';
    if (pending && (which === 1 ? pending.U1 : pending.U2) !== null) {
      return which === 1
        ? 'U₁ для цього рядка вже записано — перемкніть S2 на −B і запишіть U₂'
        : 'U₂ для цього рядка вже записано — перемкніть S2 на +B і запишіть U₁';
    }
    if (which === 1 && s2 !== 1) return 'U₁ записують при +B — перемкніть S2 у положення «+B»';
    if (which === 2 && s2 !== -1) return 'U₂ записують при −B — перемкніть S2 у положення «−B»';
    if (coilPinned) return 'Амперметр PA2 зашкалює — перемкніть його на межу 3 А';
    return meterBlock;
  };

  const sigmaBlock =
    I_mA <= 0
      ? 'Струм через зразок I = 0 — встановіть I більше нуля'
      : s3 !== 'sigma'
        ? 'Перемкніть S3 у положення «U_σ (C–D)»'
        : meterBlock;

  // ---- незавершений рядок: скасувати, якщо змінили I, I_м, зразок або серію ----
  const drop = (text: string) => {
    setPending(null);
    setNotice({ kind: 'warn', text });
  };
  const changeI = (v: number) => {
    if (pending && v !== pending.I_set_mA) {
      drop('Ви змінили струм I між записами U₁ і U₂ — незавершений рядок скасовано. Запишіть обидві напруги заново.');
    }
    setI(v);
  };
  const changeIm = (v: number) => {
    if (pending && v !== pending.Im_set_A) {
      drop('Ви змінили струм електромагніта I_м між записами U₁ і U₂ — незавершений рядок скасовано. Запишіть обидві напруги заново.');
    }
    setIm(v);
  };
  const changeSample = (id: SampleId) => {
    if (pending && id !== pending.sampleId) drop('Зразок змінено — незавершений рядок скасовано.');
    else setNotice(null);
    setSampleId(id);
  };
  const changeSeries = (s: SeriesId) => {
    if (pending && s !== pending.series) drop('Ви перейшли до іншої серії — незавершений рядок скасовано.');
    setSeries(s);
  };

  // ---- запис ----
  const recordHall = (which: 1 | 2) => {
    const U = readingIn(vRead, 1e-3);
    const I = readingIn(aRead, 1e-3);
    const B = readingIn(tRead, 1e-3);
    if (U === null || I === null || B === null) return;
    const base: Pending = pending ?? {
      series,
      sampleId,
      I_set_mA: I_mA,
      Im_set_A: Im_A,
      I,
      B: Math.abs(B),
      U1: null,
      U2: null,
    };
    // B у таблиці — показ тесламетра при +B (при −B він від'ємний, беремо модуль лише тимчасово)
    const p: Pending = which === 1 ? { ...base, U1: U, B: Math.abs(B) } : { ...base, U2: U };
    if (p.U1 !== null && p.U2 !== null) {
      allTables[p.sampleId][p.series].add({ I: p.I, B: p.B, U1: p.U1, U2: p.U2 });
      setPending(null);
      setNotice({
        kind: 'ok',
        text: `Рядок заповнено: U_H = ${formatFixed((p.U1 - p.U2) / 2, 3)} мВ. Його додано до таблиці «${SERIES_TEXT[p.series].short}».`,
      });
    } else {
      setPending(p);
      setNotice(null);
    }
    noise.next(); // наступний вимір матиме новий випадковий розкид
  };

  const recordSigma = () => {
    const U = readingIn(vRead, 1e-3);
    const I = readingIn(aRead, 1e-3);
    if (U === null || I === null) return;
    tables.sigma.add({ I, U });
    noise.next();
  };

  // ---- графік і МНК ----
  const rows = hallTable.rows;
  const points = rows.map((r) => ({ x: series === 'vsI' ? r.I : r.B, y: (r.U1 - r.U2) / 2 }));
  const fit =
    showFit && points.length >= 2
      ? fitThroughOrigin(
          points.map((p) => p.x),
          points.map((p) => p.y),
        )
      : null;

  // ---- схема: допоміжні величини ----
  const flowI = I_mA / 10;
  const flowM = Im_A / LIMITS.maxMagnetCurrent_A;
  const fieldMark: -1 | 0 | 1 = Im_A > 0 ? s2 : 0;
  const S3X = 380;
  const S3Y = 38;
  const pinY = (k: 'A' | 'B' | 'C' | 'D') => S3Y + S3P[k];

  const pendingHere = pending && pending.sampleId === sampleId ? pending : null;
  const pendingCells = pendingHere && (
    <div className="hall-pending__cells">
      <span>I = {formatFixed(pendingHere.I, 2)} мА</span>
      <span>B = {formatFixed(pendingHere.B, 0)} мТл</span>
      {pendingHere.U1 !== null ? (
        <span className="hall-ok">U₁ = {formatFixed(pendingHere.U1, 3)} мВ ✓</span>
      ) : (
        <span className="hall-wait">U₁ — чекає (+B)</span>
      )}
      {pendingHere.U2 !== null ? (
        <span className="hall-ok">U₂ = {formatFixed(pendingHere.U2, 3)} мВ ✓</span>
      ) : (
        <span className="hall-wait">U₂ — чекає (−B)</span>
      )}
    </div>
  );

  const carrierText =
    I_mA <= 0
      ? 'Струму немає — носії не рухаються напрямлено, сила Лоренца на них не діє, U_H = 0.'
      : Im_A <= 0
        ? 'Поля немає — носії рухаються прямо вздовж зразка, заряди на краях не накопичуються, U_H = 0.'
        : sample.type === 'p' && sampleId !== 'X'
          ? `Дірки (+) рухаються за напрямом струму. Сила Лоренца зсуває їх до краю ${s2 === 1 ? 'A' : 'B'}: він заряджається «+», протилежний — «−». Тому U_AB ${s2 === 1 ? '> 0' : '< 0'}.`
          : sampleId !== 'X'
            ? `Електрони (−) рухаються проти струму, але сила Лоренца зсуває їх теж до краю ${s2 === 1 ? 'A' : 'B'}: він заряджається «−», протилежний — «+». Тому U_AB ${s2 === 1 ? '< 0' : '> 0'}.`
            : `Тип носіїв зразка «X» невідомий. Сила Лоренца зсуває будь-які носії до краю ${s2 === 1 ? 'A' : 'B'} — який знак набуде цей край, покаже знак U_H.`;

  const strength = Math.min(1, (I_mA / 10) * (Math.abs(truth.field_T) / 0.5));

  return (
    <Sim>
      <Bench>
        <Panel area="schematic" title="Схема стенда">
          <svg className="sch" viewBox="0 0 520 350" role="img" aria-label="Схема: коло зразка, коло електромагніта і вимірювальне коло з перемикачем S3">
            {/* ---- Коло зразка: G1 → PA1 → зразок → назад ---- */}
            <CurrentSource x={50} y={170} rot={270} label="G1" labelDx={-30} labelDy={4} />
            <Wire points={[[50, 140], [50, 100], [80, 100]]} flow={flowI} />
            <Meter x={110} y={100} sym="mA" label="PA1" />
            <Wire points={[[140, 100], [170, 100], [170, 170], [200, 170]]} flow={flowI} />
            <Wire points={[[320, 170], [345, 170], [345, 228], [50, 228], [50, 200]]} flow={flowI} />

            {/* Зразок з контактами 1, 2 (струм), A, B (Холл), C, D (зонди) */}
            <Block x={260} y={170} w={120} h={40} active />
            <FieldMark x={260} y={170} dir={fieldMark} r={8} />
            <text className="sch-text sch-text--small" x={193} y={162} textAnchor="middle">
              1
            </text>
            <text className="sch-text sch-text--small" x={327} y={162} textAnchor="middle">
              2
            </text>
            <text className="sch-text sch-text--small" x={252} y={205} textAnchor="end">
              d = {mm(sample.thickness_m)} мм
            </text>

            {/* ---- Вимірювальне коло: контакти → S3 → PV1 ---- */}
            <Wire points={[[225, 150], [225, pinY('C')], [S3X, pinY('C')]]} />
            <Wire points={[[260, 150], [260, pinY('A')], [S3X, pinY('A')]]} />
            <Wire points={[[295, 150], [295, pinY('D')], [S3X, pinY('D')]]} />
            <Wire points={[[260, 190], [260, 212], [365, 212], [365, pinY('B')], [S3X, pinY('B')]]} />
            {[
              [225, 150, 'C'],
              [260, 150, 'A'],
              [295, 150, 'D'],
            ].map(([x, y, t]) => (
              <g key={t}>
                <Node x={x as number} y={y as number} />
                <text className="sch-text sch-text--small" x={(x as number) + 5} y={(y as number) - 6}>
                  {t}
                </text>
              </g>
            ))}
            <Node x={260} y={190} />
            <text className="sch-text sch-text--small" x={265} y={202}>
              B
            </text>
            <MeasureSwitch x={S3X} y={S3Y} mode={s3} label="S3" />
            <text className="sch-text sch-text--small" x={S3X + 25} y={S3Y + S3P.height + 14} textAnchor="middle">
              {s3 === 'H' ? 'U_H (A–B)' : 'U_σ (C–D)'}
            </text>
            <Wire points={[[S3X + S3P.width, S3Y + S3P.out1], [480, S3Y + S3P.out1]]} />
            <Wire points={[[S3X + S3P.width, S3Y + S3P.out2], [480, S3Y + S3P.out2]]} />
            <Meter x={480} y={S3Y + (S3P.out1 + S3P.out2) / 2} rot={90} sym="mV" label="PV1" labelDx={-30} labelDy={4} />

            {/* ---- Тесламетр: датчик у зазорі магніта, біля зразка ---- */}
            <ProbeMeter x={115} y={190} sym="T" label="PT" toX={205} toY={184} />

            {/* ---- Коло електромагніта: G2 → PA2 → S2 → L1 ---- */}
            <Source x={50} y={302} rot={90} adjustable label="G2" labelDx={-30} labelDy={4} />
            <Wire points={[[50, 272], [80, 272]]} flow={flowM} />
            <Meter x={110} y={272} sym="A" label="PA2" />
            <Wire points={[[140, 272], [165, 272]]} flow={flowM} />
            <ReversingSwitch x={190} y={285} dir={s2} label="S2" sub={s2 === 1 ? '+B' : '−B'} />
            <Wire points={[[165, 298], [150, 298], [150, 332], [50, 332]]} flow={flowM} />
            <Wire points={[[215, 272], [245, 272]]} flow={flowM * s2} />
            <Coil x={275} y={272} label="L1" />
            <Wire points={[[305, 272], [330, 272], [330, 298], [215, 298]]} flow={flowM * s2} />
            <text className="sch-text sch-text--small" x={275} y={291} textAnchor="middle">
              електромагніт
            </text>
          </svg>
          <p className="hall-legend">
            <b>Умовні напрямки.</b> Струм I «+» тече від контакту 1 до контакту 2. +B — поле від нас, за
            екран (⊗); −B — до нас (⊙). <b>При I «+» і +B: U_AB &gt; 0 ⇒ p-тип (дірки); U_AB &lt; 0 ⇒
            n-тип (електрони).</b> Розміри зразка: b = {mm(SAMPLE_WIDTH_M, 1)} мм, l = {mm(PROBE_DISTANCE_M, 1)} мм
            (між C і D), d = {mm(sample.thickness_m)} мм.
          </p>

          <p className="hall-view-title">Що відбувається в зразку (вид згори)</p>
          <SampleView
            carrier={sampleId === 'X' ? null : sample.type === 'p' ? 'p' : 'n'}
            current_A={I_A}
            maxCurrent_A={LIMITS.maxCurrent_A}
            fieldDir={fieldMark}
            strength={strength}
          />
          <p className="hall-caption">{carrierText}</p>
        </Panel>

        <Panel area="instruments" title="Вимірювальні прилади" dark>
          <Instruments>
            <DigitalMeter spec={DMM_DCA} rangeIdx={aRange} onRangeChange={setARange} reading={aRead} tag="PA1" />
            <AnalogMeter spec={ANALOG_AMMETER_3A} rangeIdx={cRange} onRangeChange={setCRange} reading={cRead} tag="PA2" />
            <DigitalMeter spec={TESLAMETER} rangeIdx={0} reading={tRead} tag="PT" />
            <DigitalMeter spec={DMM_MILLIVOLT} rangeIdx={vRange} onRangeChange={setVRange} reading={vRead} tag="PV1" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented
              label="Зразок"
              value={sampleId}
              onChange={changeSample}
              options={[
                { value: 'nGe', label: 'Ge n-типу' },
                { value: 'pGe', label: 'Ge p-типу' },
                { value: 'X', label: 'Зразок «X»' },
              ]}
              hint={`Етикетка: товщина d = ${mm(sample.thickness_m)} мм; ширина b = ${mm(SAMPLE_WIDTH_M, 1)} мм; між зондами l = ${mm(PROBE_DISTANCE_M, 1)} мм.`}
            />
            <ParamSlider
              label="Струм через зразок I (G1)"
              value={I_mA}
              min={0}
              max={LIMITS.maxCurrent_A * 1e3}
              step={LIMITS.currentStep_A * 1e3}
              unit="мА"
              onChange={changeI}
            />
            <ParamSlider
              label="Струм електромагніта I_м (G2)"
              value={Im_A}
              min={0}
              max={LIMITS.maxMagnetCurrent_A}
              step={LIMITS.magnetStep_A}
              unit="А"
              onChange={changeIm}
              hint="Індукцію B у зазорі показує тесламетр PT."
            />
            <Segmented
              label="S2 · напрям поля"
              value={s2}
              onChange={setS2}
              options={[
                { value: 1, label: '+B (від нас ⊗)' },
                { value: -1, label: '−B (до нас ⊙)' },
              ]}
            />
            <Segmented
              label="S3 · що вимірює PV1"
              value={s3}
              onChange={setS3}
              options={[
                { value: 'H', label: 'U_H (A–B)' },
                { value: 'sigma', label: 'U_σ (C–D)' },
              ]}
            />

            <div className="hall-group">
              <p className="hall-group__title">Холлівська напруга</p>
              <Segmented
                label="Серія, яку заповнюєте"
                value={series}
                onChange={changeSeries}
                options={[
                  { value: 'vsI', label: '1 · U_H(I)' },
                  { value: 'vsB', label: '2 · U_H(B)' },
                ]}
                hint={series === 'vsI' ? 'Серія 1: змінюйте I, струм магніта I_м не чіпайте.' : 'Серія 2: змінюйте I_м, струм I не чіпайте.'}
              />
              {notice && <div className={`hall-notice hall-notice--${notice.kind}`}>{notice.text}</div>}
              {pendingHere ? (
                <div className="hall-pending hall-pending--active" role="status">
                  <b>⏳ Незавершений рядок ({SERIES_TEXT[pendingHere.series].short})</b>
                  {pendingCells}
                  {pendingHere.U1 === null
                    ? 'Перемкніть S2 на +B і натисніть «Записати U₁ (+B)».'
                    : 'Перемкніть S2 на −B і натисніть «Записати U₂ (−B)».'}{' '}
                  Не змінюйте I та I_м, доки рядок не заповнено.
                </div>
              ) : (
                <div className="hall-pending">
                  Один рядок таблиці = два записи при тих самих I та I_м: U₁ при +B і U₂ при −B (у будь-якому
                  порядку).
                </div>
              )}
              <RecordButton label="Записати U₁ (+B)" onRecord={() => recordHall(1)} disabledReason={hallBlock(1)} />
              <RecordButton label="Записати U₂ (−B)" onRecord={() => recordHall(2)} disabledReason={hallBlock(2)} />
            </div>

            <div className="hall-group">
              <p className="hall-group__title">Провідність (зонди C–D)</p>
              <RecordButton label="Записати U_σ" onRecord={recordSigma} disabledReason={sigmaBlock} count={tables.sigma.rows.length} />
            </div>
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={`${SERIES_TEXT[series].title} · ${sample.name}`}>
          <MeasurementTable
            columns={HALL_COLUMNS}
            rows={rows}
            onRemove={hallTable.remove}
            onClear={hallTable.clear}
            caption={pendingHere && pendingHere.series === series ? '⏳ Є незавершений рядок — див. «Керування»' : undefined}
            emptyText="Таблиця порожня. Запишіть U₁ при +B і U₂ при −B — з них складеться перший рядок."
          />
        </Panel>
        <Panel
          title={series === 'vsI' ? 'Графік U_H(I)' : 'Графік U_H(B)'}
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setShowFit((v) => !v)} disabled={points.length < 2}>
              {showFit ? 'Сховати пряму' : 'Провести пряму (МНК)'}
            </button>
          }
        >
          <Plot
            series={[{ id: series, label: sample.name, points }]}
            lines={fit ? [{ slope: fit.slope, intercept: 0, label: 'Пряма МНК через (0; 0)' }] : []}
            xLabel={series === 'vsI' ? 'I, мА' : 'B, мТл'}
            yLabel="U_H, мВ"
            xZero
            yZero
          />
          {fit &&
            (series === 'vsI' ? (
              <FitResult>
                Нахил прямої: <b>k = {formatNum(fit.slope, 4)} мВ/мА</b> (це те саме, що {formatNum(fit.slope, 4)} В/А).
                Середнє B у серії: <b>{formatNum(mean(rows.map((r) => r.B)), 3)} мТл</b>. Далі: R_H = k·d/B.
              </FitResult>
            ) : (
              <FitResult>
                Нахил прямої: <b>k = {formatNum(fit.slope, 4)} мВ/мТл</b> (це те саме, що {formatNum(fit.slope, 4)} В/Тл).
                Середній струм у серії: <b>{formatNum(mean(rows.map((r) => r.I)), 3)} мА</b>. Далі: R_H = k·d/I.
              </FitResult>
            ))}
        </Panel>
        {/* Заголовки панелей виводяться ВЕЛИКИМИ літерами, тому без «σ» (стала б «Σ») */}
        <Panel title={`Провідність: напруга між зондами C–D · ${sample.name}`}>
          <MeasurementTable
            columns={SIGMA_COLUMNS}
            rows={tables.sigma.rows}
            onRemove={tables.sigma.remove}
            onClear={tables.sigma.clear}
            emptyText="Перемкніть S3 на «U_σ (C–D)» і запишіть кілька вимірів при різних I."
          />
        </Panel>
      </Workbook>
    </Sim>
  );
}
