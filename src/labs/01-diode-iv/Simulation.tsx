/**
 * Симуляція лаби №1: вольт-амперна характеристика кремнієвого та германієвого діодів.
 *
 * Стенд:   джерело G (пряме 0–10 В, зворотне 0–50 В) → перемикач полярності S1 →
 *          обмежувальний резистор Rобм (51 Ом / 10 кОм — перемикається разом із S1) →
 *          амперметр (PA1 — міліамперметр на прямій гілці, PA2 — мікроамперметр на зворотній) →
 *          діод (VD1 Si, VD2 Ge або «X») → назад до G.
 *          Вольтметр PV1 перемикається разом із S1: пряме — безпосередньо на діоді;
 *          зворотне — на діоді разом із мікроамперметром (так менша похибка методу).
 * Студент: вибирає діод і положення S1 (або вкладку гілки — це те саме), змінює U₀, перемикає
 *          межі приладів, записує виміри, проводить дотичну МНК до прямої гілки.
 * Дані:    фізика й розрахунок кола — ./model.ts; прилади — src/core/instrumentCatalog.ts;
 *          6 таблиць (3 діоди × 2 гілки) у localStorage під ключами 'vlab:diode-iv:<діод>:<гілка>'.
 *
 * Потік даних на кожен рендер:
 *   параметри → simulate() (істина) → checkLimits() (перевантаження/згоряння) →
 *   readInstrument() (показ із шумом і квантуванням) → UI
 */
import { useEffect, useState } from 'react';
import {
  AnalogMeter,
  Bench,
  Controls,
  DeviceStatus,
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
  Tabs,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
  type PlotSeries,
} from '@/components/sim';
import { Diode, Meter, Node, Resistor, Schematic, Source, Terminal, Text, Wire } from '@/components/schematic/Schematic';
import { readInstrument, readingIn, type Reading } from '@/core/instruments';
import { ANALOG_MICROAMMETER, ANALOG_MILLIAMMETER, ANALOG_VOLTMETER } from '@/core/instrumentCatalog';
import { checkLimits, type DeviceState } from '@/core/limits';
import { formatNum, formatSI } from '@/core/format';
import { R_LIMIT_OHM, SAMPLES, SOURCE_MAX_V, limitsFor, simulate, tangentFit, type DiodeSample, type Polarity, type SampleId } from './model';

const LAB_ID = 'diode-iv';

/** Рядок таблиці: U — у вольтах; I — у міліамперах (пряма гілка) або мікроамперах (зворотна, модуль). */
type IvRow = { U: number; I: number };

const FWD_COLUMNS: Column<IvRow>[] = [
  { key: 'U', label: 'U, В' },
  { key: 'I', label: 'I, мА' },
  // Статичний опір Rст = U / I (I переводимо з мА в А)
  { key: 'R', label: 'Rст = U/I, Ом', decimals: 1, compute: (r) => (r.I > 0 ? r.U / (r.I * 1e-3) : null) },
];

const REV_COLUMNS: Column<IvRow>[] = [
  { key: 'U', label: 'Uзв, В' },
  { key: 'I', label: 'Iзв, мкА' },
];

const DIODES: SampleId[] = ['VD1', 'VD2', 'X'];

/** Підписи діодів у перемикачі й легенді (матеріал «X» не розкриваємо). */
const DIODE_TEXT: Record<SampleId, string> = { VD1: 'VD1 · Si', VD2: 'VD2 · Ge', X: '«X»' };
const DIODE_COLOR: Record<SampleId, string> = { VD1: PLOT_COLORS[0]!, VD2: PLOT_COLORS[1]!, X: PLOT_COLORS[2]! };
const DIODE_MARKER: Record<SampleId, PlotSeries['marker']> = { VD1: 'circle', VD2: 'square', X: 'triangle' };

/** Струм, при якому анімація «течії» на схемі найшвидша: пряма гілка — 40 мА, зворотна — 200 мкА. */
const FLOW_SCALE_A: Record<Polarity, number> = { forward: 40e-3, reverse: 200e-6 };

/**
 * Стрілка магнітоелектричного приладу не заходить за нуль (упор): крихітний від'ємний шум
 * біля нуля показуємо як 0, щоб у таблицю не потрапляли від'ємні модулі.
 */
function atZeroStop(rd: Reading): Reading {
  if (rd.raw >= 0 && (rd.value === null || rd.value >= 0)) return rd;
  return { ...rd, raw: Math.max(0, rd.raw), value: rd.value === null ? null : Math.max(0, rd.value) };
}

export default function Simulation() {
  // ---- стан стенда ----
  const [diodeId, setDiodeId] = useState<SampleId>('VD1');
  const [branch, setBranch] = useState<Polarity>('forward'); // положення S1 = вкладка гілки
  const [U0, setU0] = useState(0);
  const [maRange, setMaRange] = useState(1); // межа ANALOG_MILLIAMMETER (30 мА)
  const [uaRange, setUaRange] = useState(1); // межа ANALOG_MICROAMMETER (100 мкА)
  const [vRange, setVRange] = useState(0); // межа ANALOG_VOLTMETER (1 В)
  const [destroyed, setDestroyed] = useState<Record<SampleId, boolean>>({ VD1: false, VD2: false, X: false });
  const [showFit, setShowFit] = useState(false);

  const noise = useNoise(LAB_ID);
  // Окрема таблиця для кожного діода й кожної гілки (хуки викликаються завжди в тому самому порядку)
  const tables = {
    VD1: { forward: useMeasurements<IvRow>(`${LAB_ID}:VD1:forward`), reverse: useMeasurements<IvRow>(`${LAB_ID}:VD1:reverse`) },
    VD2: { forward: useMeasurements<IvRow>(`${LAB_ID}:VD2:forward`), reverse: useMeasurements<IvRow>(`${LAB_ID}:VD2:reverse`) },
    X: { forward: useMeasurements<IvRow>(`${LAB_ID}:X:forward`), reverse: useMeasurements<IvRow>(`${LAB_ID}:X:reverse`) },
  };
  const table = tables[diodeId][branch];

  // ---- фізика ----
  const fwd = branch === 'forward';
  const sample: DiodeSample = SAMPLES[diodeId];
  const aSpec = fwd ? ANALOG_MILLIAMMETER : ANALOG_MICROAMMETER;
  const aIdx = fwd ? maRange : uaRange;
  const params = {
    sourceVoltage_V: U0,
    polarity: branch,
    ammeterR_Ohm: aSpec.ranges[aIdx]!.internalR_Ohm ?? 0,
    voltmeterR_Ohm: ANALOG_VOLTMETER.ranges[vRange]!.internalR_Ohm ?? 1e3,
  };
  const wasDestroyed = destroyed[diodeId];
  const intact = simulate(params, sample);
  const state: DeviceState = checkLimits(
    limitsFor(sample, branch),
    { current_A: intact.diodeCurrent_A },
    wasDestroyed ? 'destroyed' : 'ok',
  );
  const isOpen = state === 'destroyed';
  const truth = isOpen ? simulate({ ...params, open: true }, sample) : intact;

  // Згоряння «липке»: запам'ятовуємо його до натискання «Замінити елемент»
  useEffect(() => {
    if (isOpen && !wasDestroyed) setDestroyed((d) => ({ ...d, [diodeId]: true }));
  }, [isOpen, wasDestroyed, diodeId]);

  // ---- прилади ----
  const key = `${diodeId}:${branch}:${U0}:${aIdx}:${vRange}:${isOpen ? 'open' : 'ok'}`;
  const iRead = atZeroStop(readInstrument(aSpec, aIdx, truth.ammeterCurrent_A, noise.rngFor(key, fwd ? 'PA1' : 'PA2')));
  const uRead = atZeroStop(readInstrument(ANALOG_VOLTMETER, vRange, truth.voltmeterVoltage_V, noise.rngFor(key, 'PV1')));

  const blocked = isOpen
    ? 'Діод згорів — коло розірване. Натисніть «Замінити елемент».'
    : state === 'overload'
      ? 'Струм більший за допустимий для діода — зменште U₀.'
      : iRead.overRange
        ? `${fwd ? 'Міліамперметр' : 'Мікроамперметр'} зашкалює — перемкніть на більшу межу.`
        : uRead.overRange
          ? 'Вольтметр зашкалює — перемкніть на більшу межу.'
          : null;

  const record = () => {
    const U = readingIn(uRead, 1);
    const I = readingIn(iRead, fwd ? 1e-3 : 1e-6);
    if (U === null || I === null) return;
    table.add({ U, I });
    noise.next(); // наступний вимір матиме новий випадковий розкид
  };

  // ---- дії ----
  // З міркувань безпеки після зміни діода чи полярності напруга джерела скидається до 0
  const selectDiode = (id: SampleId) => {
    setDiodeId(id);
    setU0(0);
  };
  const switchBranch = (b: Polarity) => {
    if (b === branch) return;
    setBranch(b);
    setU0(0);
  };
  const replace = () => {
    setDestroyed((d) => ({ ...d, [diodeId]: false }));
    setU0(0);
  };

  // ---- графік і дотична ----
  const series: PlotSeries[] = DIODES.map((id) => ({
    id,
    label: DIODE_TEXT[id],
    points: tables[id][branch].rows.map((r) => ({ x: r.U, y: r.I })),
    color: DIODE_COLOR[id],
    marker: DIODE_MARKER[id],
  }));
  const fwdRows = tables[diodeId].forward.rows;
  const tangent = fwd && showFit ? tangentFit(fwdRows) : null;
  const maxU = tangent ? Math.max(...tangent.used.map((p) => p.U)) : 0;

  // ---- анімація струму на схемі (знак — напрям уздовж точок провідника) ----
  const dir = fwd ? 1 : -1;
  const mag = (I_A: number) => Math.min(1, Math.abs(I_A) / FLOW_SCALE_A[branch]);
  const fSrc = mag(truth.sourceCurrent_A);
  const fAmm = mag(truth.ammeterCurrent_A);
  const fDiode = mag(truth.diodeCurrent_A);
  const fVolt = mag(truth.voltmeterCurrent_A);

  return (
    <Sim>
      <Bench>
        <Panel area="schematic" title="Схема кола">
          <Schematic
            width={500}
            height={240}
            title={
              fwd
                ? 'Пряме ввімкнення: джерело, перемикач S1, резистор 51 Ом, міліамперметр і діод послідовно; вольтметр безпосередньо на діоді'
                : 'Зворотне ввімкнення: джерело, перемикач S1, резистор 10 кОм, мікроамперметр і діод послідовно; вольтметр на діоді разом із мікроамперметром'
            }
          >
            {/* Джерело G */}
            <Source x={40} y={125} rot={90} adjustable label="G" labelDx={-26} labelDy={4} />
            <Wire points={[[40, 95], [40, 50], [85, 50]]} flow={fSrc} />
            <Wire points={[[85, 200], [40, 200], [40, 155]]} flow={fSrc} />

            {/* Перемикач полярності S1: прямі перемички або «хрест» */}
            <rect x={85} y={36} width={40} height={178} rx={3} className="sch-thin" style={{ strokeDasharray: '5 4' }} />
            <Text x={105} y={28}>
              S1
            </Text>
            {fwd ? (
              <>
                <Wire points={[[85, 50], [125, 50]]} flow={fSrc} />
                <Wire points={[[125, 200], [85, 200]]} flow={fSrc} />
              </>
            ) : (
              <>
                <Wire points={[[85, 50], [125, 200]]} flow={fSrc} />
                <Wire points={[[125, 50], [85, 200]]} flow={fSrc} />
              </>
            )}
            <Terminal x={85} y={50} />
            <Terminal x={125} y={50} />
            <Terminal x={85} y={200} />
            <Terminal x={125} y={200} />
            <Text x={105} y={230} small>
              {fwd ? 'пряме' : 'зворотне'}
            </Text>

            {/* Обмежувальний резистор */}
            <Wire points={[[125, 50], [150, 50]]} flow={dir * fSrc} />
            <Resistor x={180} y={50} />
            <text className="sch-text" x={180} y={32} textAnchor="middle">
              R
              <tspan fontSize="10" dy="3">
                обм
              </tspan>
            </text>
            <Text x={180} y={76} small>
              {fwd ? '51 Ом' : '10 кОм'}
            </Text>
            <Wire points={[[210, 50], [230, 50]]} flow={dir * fSrc} />
            <Wire points={[[230, 50], [250, 50]]} flow={dir * fAmm} />

            {/* Амперметр */}
            <Meter x={280} y={50} sym={fwd ? 'mA' : 'µA'} label={fwd ? 'PA1' : 'PA2'} labelDy={38} />
            <Wire points={[[310, 50], [360, 50], [360, 75]]} flow={dir * fAmm} />

            {/* Діод (анод угорі) */}
            <Wire points={[[360, 75], [360, 95]]} flow={dir * fDiode} />
            <Diode x={360} y={125} rot={90} label={sample.label} labelDx={-34} labelDy={4} active={!isOpen} broken={isOpen} />
            <Wire points={[[360, 155], [360, 200]]} flow={dir * fDiode} />
            <Text x={376} y={92} small>
              {fwd ? '+' : '−'}
            </Text>
            <Text x={376} y={168} small>
              {fwd ? '−' : '+'}
            </Text>
            {isOpen && (
              <text x={398} y={129} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--danger)">
                обрив
              </text>
            )}
            <Wire points={[[360, 200], [125, 200]]} flow={dir * fSrc} />

            {/* Вольтметр: пряме — на діоді, зворотне — на діоді разом із мікроамперметром */}
            <Meter x={450} y={125} rot={90} sym="V" label="PV1" labelDx={32} labelDy={4} />
            {fwd ? (
              <>
                <Wire points={[[360, 75], [450, 75], [450, 95]]} flow={dir * fVolt} />
                <Node x={360} y={75} />
              </>
            ) : (
              <>
                <Wire points={[[230, 50], [230, 18], [450, 18], [450, 95]]} flow={dir * fVolt} />
                <Node x={230} y={50} />
              </>
            )}
            <Wire points={[[450, 155], [450, 200], [360, 200]]} flow={dir * fVolt} />
            <Node x={360} y={200} />
          </Schematic>
        </Panel>

        <Panel area="instruments" title="Вимірювальні прилади" dark>
          <Instruments>
            <AnalogMeter
              key={branch}
              spec={aSpec}
              rangeIdx={aIdx}
              onRangeChange={fwd ? setMaRange : setUaRange}
              reading={iRead}
              tag={fwd ? 'PA1' : 'PA2'}
            />
            <AnalogMeter spec={ANALOG_VOLTMETER} rangeIdx={vRange} onRangeChange={setVRange} reading={uRead} tag="PV1" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented
              label="Діод"
              value={diodeId}
              onChange={selectDiode}
              options={DIODES.map((id) => ({ value: id, label: DIODE_TEXT[id] }))}
            />
            <Segmented
              label="Перемикач S1"
              value={branch}
              onChange={switchBranch}
              options={[
                { value: 'forward', label: 'Пряме' },
                { value: 'reverse', label: 'Зворотне' },
              ]}
              hint={
                fwd
                  ? `Rобм = ${formatSI(R_LIMIT_OHM.forward, 'Ом')}; амперметр PA1 (мА); вольтметр — безпосередньо на діоді.`
                  : `Rобм = ${formatSI(R_LIMIT_OHM.reverse, 'Ом')}; амперметр PA2 (мкА); вольтметр — на діоді разом із PA2.`
              }
            />
            <ParamSlider
              key={branch}
              label="Напруга джерела U₀"
              value={U0}
              min={0}
              max={SOURCE_MAX_V[branch]}
              step={fwd ? 0.05 : 0.5}
              unit="В"
              onChange={setU0}
              hint="Напругу на діоді показує вольтметр PV1: частина U₀ падає на резисторі Rобм."
            />
            <DeviceStatus
              state={state}
              name={`Діод ${sample.label}`}
              onReplace={replace}
              overloadText={
                fwd
                  ? `прямий струм більший за допустимий (${formatSI(sample.Imax_A, 'А')}). Зменште U₀, інакше діод згорить.`
                  : `зворотний струм більший за допустимий (${formatSI(sample.IrevMax_A ?? 0, 'А')}) — це пробій! Зменште U₀, інакше діод згорить.`
              }
            />
            {isOpen && (
              <div className="sim-field__hint">
                На місці діода — обрив: вольтметр показує майже всю напругу джерела, а через амперметр
                тече лише струм самого вольтметра. Так на практиці й знаходять згорілий елемент.
              </div>
            )}
            <RecordButton onRecord={record} disabledReason={blocked} count={table.rows.length} />
          </Controls>
        </Panel>
      </Bench>

      <Tabs
        label="Гілка вольт-амперної характеристики"
        tabs={[
          { id: 'forward', label: 'Пряма гілка' },
          { id: 'reverse', label: 'Зворотна гілка' },
        ]}
        value={branch}
        onChange={switchBranch}
      />

      <Workbook>
        <Panel title={`Таблиця · ${sample.name} · ${fwd ? 'пряма' : 'зворотна'} гілка`}>
          <MeasurementTable
            columns={fwd ? FWD_COLUMNS : REV_COLUMNS}
            rows={table.rows}
            onRemove={table.remove}
            onClear={table.clear}
          />
        </Panel>
        <Panel title={fwd ? 'Пряма гілка ВАХ: I(U)' : 'Зворотна гілка ВАХ: Iзв(Uзв)'}>
          <Plot
            series={series}
            lines={
              tangent
                ? [
                    {
                      slope: tangent.slope,
                      intercept: tangent.intercept,
                      label: `Дотична (МНК) · ${DIODE_TEXT[diodeId]}`,
                      color: DIODE_COLOR[diodeId],
                      xFrom: tangent.Uopen_V,
                      xTo: maxU + 0.03,
                    },
                  ]
                : []
            }
            xLabel={fwd ? 'U, В' : 'Uзв, В'}
            yLabel={fwd ? 'I, мА' : 'Iзв, мкА'}
            xZero
            yZero
          />
          {fwd && (
            <div className="sim-toolbar" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowFit((v) => !v)}
                disabled={fwdRows.length < 4}
                aria-pressed={showFit}
              >
                {showFit ? 'Сховати дотичну' : 'Провести дотичну (МНК за 4 останніми точками)'}
              </button>
              <span className="sim-field__hint">
                {fwdRows.length < 4
                  ? `Потрібно щонайменше 4 точки прямої гілки ${DIODE_TEXT[diodeId]}.`
                  : `Для діода ${DIODE_TEXT[diodeId]} — за 4 точками з найбільшим струмом.`}
              </span>
            </div>
          )}
          {tangent && (
            <FitResult>
              Дотична до ВАХ {DIODE_TEXT[diodeId]}: I = <b>{formatNum(tangent.slope, 3)}</b>·U{' '}
              {tangent.intercept < 0 ? '−' : '+'} <b>{formatNum(Math.abs(tangent.intercept), 3)}</b> (I — у мА, U — у В).
              <br />
              Напруга відкривання: U<sub>відкр</sub> = −b/k = <b>{formatNum(tangent.Uopen_V, 3)} В</b>
            </FitResult>
          )}
        </Panel>
      </Workbook>
    </Sim>
  );
}
