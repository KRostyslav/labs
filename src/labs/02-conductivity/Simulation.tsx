/**
 * Симуляція лаби №2 «Визначення питомої електропровідності напівпровідників».
 *
 * Стенд:   джерело струму G1 (0,5–10 мА, обмеження 20 В) → перемикач напрямку S1 (+/−)
 *          → мультиметр PA1 (A⎓) → брусок (контакти 1 і 4) → S1 → G1;
 *          мультиметр PV1 (V⎓) через перемикач S2 — на зондах 2–3 (4-зондова схема)
 *          або на контактах 1–4 (2-зондова).
 * Студент: вибирає зразок, вмикає джерело, задає струм, перемикає S1 і S2, межі приладів;
 *          вимірює b, l (штангенциркуль) і d (мікрометр); записує виміри.
 * Запис у два кроки: при S1 «+» записується U₊, при S1 «−» — U₋ (порядок будь-який) при
 *          ТОМУ САМОМУ струмі. Після першого кроку рядок «очікує»; якщо змінити струм, зразок
 *          чи схему, незавершений рядок скасовується з попередженням. I рядка — модуль показу
 *          PA1 на першому кроці.
 * Дані:    фізика — ./model.ts; прилади — src/core/instrumentCatalog.ts (DMM_DCA, DMM_DCV,
 *          LENGTH_TOOLS); таблиці в localStorage: 'vlab:conductivity:<зразок>:4p|2p'
 *          (I, мА; U₊, U₋, мВ) і 'vlab:conductivity:<зразок>:dims' (b, l, d, мм).
 *
 * Потік даних на кожен рендер:
 *   параметри → simulate() (істина) → readInstrument() (показ з шумом і квантуванням) → UI
 */
import { useState } from 'react';
import {
  Bench,
  Controls,
  DigitalMeter,
  FitResult,
  Instruments,
  MeasurementTable,
  PLOT_COLORS,
  Panel,
  ParamSlider,
  Plot,
  RecordButton,
  Segmented,
  Sim,
  ToggleSwitch,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
  type PlotLine,
  type PlotSeries,
} from '@/components/sim';
import { readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_DCV } from '@/core/instrumentCatalog';
import { fitThroughOrigin } from '@/core/stats';
import { formatFixed, formatNum } from '@/core/format';
import { SAMPLES, SOURCE_LIMIT_V, simulate, type Method, type SampleId } from './model';
import StandSchematic from './parts/StandSchematic';
import CurrentSourcePanel from './parts/CurrentSourcePanel';
import { readLength } from './parts/lengthGauge';
import { useDimensions, type DimKey, type DimRow } from './parts/useDimensions';

const LAB_ID = 'conductivity';

/** Рядок таблиці: I — у мА, U₊ і U₋ — у мВ (U₋ від'ємне), як у заголовках стовпців. */
type Row = { I: number; Up: number; Um: number };

const halfDiff = (r: Row) => (r.Up - r.Um) / 2;

const COLUMNS: Column<Row>[] = [
  { key: 'I', label: 'I, мА' },
  { key: 'Up', label: 'U₊, мВ' },
  { key: 'Um', label: 'U₋, мВ' },
  // Обчислювані стовпці: U = (U₊ − U₋)/2 прибирає термо-ЕРС; R = U/I (мВ/мА = Ом)
  { key: 'U', label: 'U = (U₊−U₋)/2, мВ', compute: halfDiff },
  { key: 'R', label: 'R = U/I, Ом', decimals: 1, compute: (r) => (r.I ? halfDiff(r) / r.I : null) },
];

const DIM_COLUMNS: Column<DimRow>[] = [
  { key: 'b', label: 'b, мм', decimals: 2 },
  { key: 'l', label: 'l, мм', decimals: 2 },
  { key: 'd', label: 'd, мм', decimals: 2 },
];

/** Незавершений рядок: записано один з двох кроків. */
interface Pending {
  sampleId: SampleId;
  method: Method;
  /** Струм на ручці джерела під час першого кроку, мА. */
  Iset: number;
  /** Показ PA1 (модуль), мА. */
  I: number;
  Up: number | null;
  Um: number | null;
}

type Pol = '+' | '−';

export default function Simulation() {
  // ---- стан стенда ----
  const [sampleId, setSampleId] = useState<SampleId>('nSi');
  const [power, setPower] = useState(true);
  const [Iset, setIset] = useState(5); // мА
  const [pol, setPol] = useState<Pol>('+');
  const [method, setMethod] = useState<Method>('4p');
  const [aRange, setARange] = useState(2); // DMM_DCA: 20 мА
  const [vRange, setVRange] = useState(1); // DMM_DCV: 2 В
  const [showFit, setShowFit] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastDim, setLastDim] = useState<string | null>(null);

  const noise = useNoise(LAB_ID);
  const table4 = useMeasurements<Row>(`${LAB_ID}:${sampleId}:4p`);
  const table2 = useMeasurements<Row>(`${LAB_ID}:${sampleId}:2p`);
  const table = method === '4p' ? table4 : table2;
  const dims = useDimensions(`${LAB_ID}:${sampleId}:dims`);

  // ---- фізика → прилади ----
  const sample = SAMPLES[sampleId];
  const polarity: 1 | -1 = pol === '+' ? 1 : -1;
  const ammeterR = DMM_DCA.ranges[aRange]!.internalR_Ohm ?? 0;
  const truth = simulate(
    { setCurrent_A: power ? Iset * 1e-3 : 0, polarity, method, ammeterR_Ohm: ammeterR },
    sample,
  );
  const key = `${sampleId}:${method}:${pol}:${Iset}:${power ? 1 : 0}`; // шум залежить від параметрів
  const iRead = readInstrument(DMM_DCA, aRange, truth.current_A, noise.rngFor(key, 'PA1'));
  const uRead = readInstrument(DMM_DCV, vRange, truth.voltmeter_V, noise.rngFor(key, 'PV1'));

  const step: 'Up' | 'Um' = polarity > 0 ? 'Up' : 'Um';
  const stepName = step === 'Up' ? 'U₊' : 'U₋';
  const otherPol: Pol = pol === '+' ? '−' : '+';

  const blocked = !power
    ? 'Джерело вимкнене — коло не живиться. Увімкніть живлення G1'
    : truth.inLimit
      ? `Джерело в режимі ОБМЕЖЕННЯ (потрібно понад ${SOURCE_LIMIT_V} В) — зменште струм`
      : iRead.overRange
        ? 'Міліамперметр показує OL — перемкніть на більшу межу'
        : uRead.overRange
          ? 'Вольтметр показує OL — перемкніть на більшу межу'
          : pending && pending[step] !== null
            ? `${stepName} уже записано — перемкніть S1 у положення «${otherPol}»`
            : null;

  // ---- зміни, що скасовують незавершений рядок ----
  const discard = (why: string) => {
    if (!pending) return;
    setPending(null);
    setNotice(why);
  };
  const changeI = (v: number) => {
    if (pending && v !== pending.Iset) {
      discard('Струм змінено між двома кроками — незавершений рядок скасовано. U₊ і U₋ треба записати при однаковому струмі.');
    }
    setIset(v);
  };
  const changeSample = (v: SampleId) => {
    if (v !== sampleId) discard('Зразок змінено — незавершений рядок скасовано.');
    setSampleId(v);
    setLastDim(null);
  };
  const changeMethod = (v: Method) => {
    if (v !== method) discard('Схему S2 змінено — незавершений рядок скасовано.');
    setMethod(v);
  };

  const record = () => {
    const U = readingIn(uRead, 1e-3); // мВ
    const I = readingIn(iRead, 1e-3); // мА
    if (U === null || I === null) return;
    if (!pending) {
      setPending({
        sampleId,
        method,
        Iset,
        I: Math.abs(I),
        Up: step === 'Up' ? U : null,
        Um: step === 'Um' ? U : null,
      });
    } else {
      const Up = step === 'Up' ? U : pending.Up;
      const Um = step === 'Um' ? U : pending.Um;
      if (Up !== null && Um !== null) table.add({ I: pending.I, Up, Um });
      setPending(null);
    }
    setNotice(null);
    noise.next(); // наступний вимір матиме новий випадковий розкид
  };

  const measureDim = (q: DimKey) => {
    const tool = q === 'd' ? 'micrometer' : 'caliper';
    const true_m = q === 'b' ? sample.width_m : q === 'd' ? sample.thickness_m : sample.probeSpacing_m;
    const rd = readLength(tool, true_m, noise.rngFor(sampleId, 'dim', q));
    dims.fill(q, rd.value_mm);
    setLastDim(`${q} = ${formatFixed(rd.value_mm, rd.decimals)} мм`);
    noise.next();
  };

  // ---- графік U(I) і МНК через початок координат ----
  const toPoints = (rows: Row[]) => rows.map((r) => ({ x: r.I, y: halfDiff(r) / 1000 }));
  const sets = [
    { id: '4p', label: '4-зондова схема', rows: table4.rows, color: PLOT_COLORS[0]!, marker: 'circle' as const, R: 'R₄' },
    { id: '2p', label: '2-зондова схема', rows: table2.rows, color: PLOT_COLORS[1]!, marker: 'square' as const, R: 'R₂' },
  ];
  const series: PlotSeries[] = sets
    .filter((s) => s.rows.length > 0 || s.id === '4p')
    .map((s) => ({ id: s.id, label: s.label, points: toPoints(s.rows), color: s.color, marker: s.marker }));
  const fits = sets
    .filter((s) => s.rows.length >= 2)
    .map((s) => {
      const pts = toPoints(s.rows);
      const k = fitThroughOrigin(pts.map((p) => p.x), pts.map((p) => p.y)).slope; // В/мА
      return { ...s, k };
    });
  const lines: PlotLine[] = showFit
    ? fits.map((f) => ({ slope: f.k, intercept: 0, label: `Пряма МНК (${f.id === '4p' ? '4 зонди' : '2 зонди'})`, color: f.color }))
    : [];

  const flow = power ? Math.abs(truth.current_A) / 10e-3 : 0;

  return (
    <Sim>
      <Bench>
        <Panel area="schematic" title="Схема стенда">
          <StandSchematic label={sample.label} polarity={polarity} method={method} flow={flow} />
        </Panel>

        <Panel area="instruments" title="Вимірювальні прилади" dark>
          <Instruments>
            <CurrentSourcePanel
              tag="G1"
              setCurrent_mA={Iset}
              on={power}
              inLimit={power && truth.inLimit}
              outputVoltage_V={truth.sourceVoltage_V}
              limit_V={SOURCE_LIMIT_V}
            />
            <DigitalMeter spec={DMM_DCA} rangeIdx={aRange} onRangeChange={setARange} reading={iRead} tag="PA1" />
            <DigitalMeter spec={DMM_DCV} rangeIdx={vRange} onRangeChange={setVRange} reading={uRead} tag="PV1" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented
              label="Зразок"
              value={sampleId}
              onChange={changeSample}
              options={[
                { value: 'nSi', label: 'n-Si (навч.)' },
                { value: 'pGe', label: 'p-Ge (навч.)' },
                { value: 'X', label: 'Зразок «X»' },
              ]}
              hint={sample.info}
            />
            <ToggleSwitch label="Живлення джерела G1" checked={power} onChange={setPower} led />
            <ParamSlider
              label="Струм джерела I"
              value={Iset}
              min={0.5}
              max={10}
              step={0.5}
              decimals={1}
              unit="мА"
              onChange={changeI}
            />
            <Segmented
              label="S1 — напрямок струму"
              value={pol}
              onChange={setPol}
              options={[
                { value: '+', label: '«+» прямий' },
                { value: '−', label: '«−» зворотний' },
              ]}
            />
            <Segmented
              label="S2 — схема вимірювання"
              value={method}
              onChange={changeMethod}
              options={[
                { value: '4p', label: '4-зондова (2–3)' },
                { value: '2p', label: '2-зондова (1–4)' },
              ]}
            />
            <RecordButton
              onRecord={record}
              disabledReason={blocked}
              label={`Записати ${stepName} (крок ${pending ? 2 : 1} з 2)`}
              count={table.rows.length}
            />
            {pending && (
              <div className="sim-fit" role="status">
                <b>Крок 1 з 2 виконано:</b> I = {formatNum(pending.I, 4)} мА,{' '}
                {pending.Up !== null ? `U₊ = ${formatNum(pending.Up, 4)} мВ` : `U₋ = ${formatNum(pending.Um ?? 0, 4)} мВ`}.
                <br />
                Не змінюючи струму, перемкніть S1 у «{pending.Up !== null ? '−' : '+'}» і запишіть{' '}
                {pending.Up !== null ? 'U₋' : 'U₊'}.{' '}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPending(null)}>
                  Скасувати
                </button>
              </div>
            )}
            {notice && (
              <div className="sim-status" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }} role="alert">
                <span>⚠ {notice}</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNotice(null)}>
                  Зрозуміло
                </button>
              </div>
            )}
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={`Розміри зразка · ${sample.label}`}>
          <div className="sim-controls">
            <div className="sim-toolbar">
              <button type="button" className="btn btn-sm" onClick={() => measureDim('b')}>
                Виміряти штангенциркулем b
              </button>
              <button type="button" className="btn btn-sm" onClick={() => measureDim('l')}>
                Виміряти штангенциркулем l
              </button>
              <button type="button" className="btn btn-sm" onClick={() => measureDim('d')}>
                Виміряти мікрометром d
              </button>
            </div>
            <span className="sim-record__msg">
              {lastDim ? `Останній вимір: ${lastDim}` : 'b — ширина, d — товщина бруска, l — відстань між зондами 2 і 3. Виміряйте кожен розмір 3 рази.'}
            </span>
            <MeasurementTable
              columns={DIM_COLUMNS}
              rows={dims.rows}
              onRemove={dims.remove}
              onClear={dims.clear}
              emptyText="Таблиця порожня. Виміряйте b, l і d кнопками вище (по 3 рази)."
            />
          </div>
        </Panel>

        <Panel title={`Таблиця вимірювань · ${sample.label} · ${method === '4p' ? '4 зонди' : '2 зонди'}`}>
          <MeasurementTable
            columns={COLUMNS}
            rows={table.rows}
            onRemove={table.remove}
            onClear={table.clear}
            emptyText="Таблиця порожня. Запишіть U₊ (S1 «+») і U₋ (S1 «−») при однаковому струмі — рядок з'явиться після другого кроку."
          />
        </Panel>
      </Workbook>

      <Panel
        title={`Графік U(I) · ${sample.label}`}
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setShowFit((v) => !v)} disabled={fits.length === 0}>
            {showFit ? 'Сховати прямі' : 'Провести пряму (МНК)'}
          </button>
        }
      >
        <Plot series={series} lines={lines} xLabel="I, мА" yLabel="U = (U₊−U₋)/2, В" xZero yZero height={320} />
        {showFit && fits.length > 0 && (
          <FitResult>
            {fits.map((f) => (
              <div key={f.id}>
                {f.label}: нахил <b>{formatNum(f.k, 4)} В/мА</b> → {f.R} = <b>{formatNum(f.k * 1e3, 4)} Ом</b>
              </div>
            ))}
            <div>Пряма проходить через початок координат: U = R·I.</div>
          </FitResult>
        )}
      </Panel>
    </Sim>
  );
}
