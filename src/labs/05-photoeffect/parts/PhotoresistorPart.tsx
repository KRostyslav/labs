/**
 * Частина А — фоторезистор на оптичній лаві.
 *
 * Стенд:   лампа EL1 → (фільтр) → фоторезистор R1 або «X» на відстані r; поруч датчик люксметра.
 *          Коло: джерело G (0–30 В) → мультиметр PA1 (A⎓) → фоторезистор; PV1 (V⎓) паралельно фоторезистору.
 * Досліди: «Закон 1/r²» (лише люксметр), «ВАХ I(U)» при кількох освітленостях,
 *          «Люкс-амперна» I(E) при сталій U, плюс окремий запис темнового струму.
 * Дані:    фізика — ../model.ts; таблиці — localStorage 'vlab:photoeffect:law',
 *          'vlab:photoeffect:iv:<R1|X>', 'vlab:photoeffect:lux:<R1|X>', 'vlab:photoeffect:dark:<R1|X>'.
 * Захист:  P > 0,1 Вт — «перевантаження» (запис заблоковано), P > 0,15 Вт — фоторезистор згоряє.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bench,
  Controls,
  DeviceStatus,
  DigitalMeter,
  FitResult,
  Instruments,
  MeasurementTable,
  Panel,
  ParamSlider,
  PLOT_COLORS,
  Plot,
  RecordButton,
  Segmented,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
  type PlotLine,
  type PlotSeries,
} from '@/components/sim';
import { Meter, Node, Photoresistor, Schematic, Source, Wire } from '@/components/schematic/Schematic';
import { readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_DCV, LUXMETER } from '@/core/instrumentCatalog';
import { checkLimits, type DeviceState } from '@/core/limits';
import { fitThroughOrigin, linearFit, mean } from '@/core/stats';
import { formatNum } from '@/core/format';
import { PHOTORESISTORS, illuminance, simulatePhotoresistor, type PhotoresistorId } from '../model';
import { LAB_ID, OpticalRail, OpticsControls, flickeringIlluminance, lg, opticsKey, type OpticsProps } from './shared';

type Exp = 'law' | 'iv' | 'lux';
/** Закон 1/r²: r — у метрах, E — у люксах. */
type LawRow = { r: number; E: number };
/** ВАХ: g — ключ стану лави (для групування точок у серії), E — лк, U — В, I — мА. */
type IvRow = { g: string; E: number; U: number; I: number };
/** Люкс-амперна: E — лк, U — В, I — мА. */
type LuxRow = { E: number; U: number; I: number };
/** Темновий струм: U — В, I — мкА. */
type DarkRow = { U: number; I: number };

const LAW_COLUMNS: Column<LawRow>[] = [
  { key: 'r', label: 'r, м', decimals: 2 },
  { key: 'E', label: 'E, лк' },
  { key: 'Er2', label: 'E·r², лк·м²', decimals: 1, compute: (row) => row.E * row.r * row.r },
];

const IV_COLUMNS: Column<IvRow>[] = [
  { key: 'E', label: 'E, лк' },
  { key: 'U', label: 'U, В' },
  { key: 'I', label: 'I, мА' },
  { key: 'R', label: 'R = U/I, кОм', compute: (row) => (row.I > 0 ? row.U / row.I : null) },
];

export default function PhotoresistorPart({ optics, onOpticsChange }: OpticsProps) {
  // ---- стан стенда ----
  const [prId, setPrId] = useState<PhotoresistorId>('R1');
  const [exp, setExp] = useState<Exp>('lux');
  const [U0, setU0] = useState(5);
  const [aRange, setARange] = useState(1); // DMM_DCA: 2000 мкА
  const [vRange, setVRange] = useState(2); // DMM_DCV: 20 В
  const [luxRange, setLuxRange] = useState(1); // LUXMETER: 2000 лк
  const [burnt, setBurnt] = useState<Partial<Record<PhotoresistorId, boolean>>>({});
  const [showFit, setShowFit] = useState(false);

  const noise = useNoise(LAB_ID);
  const law = useMeasurements<LawRow>(`${LAB_ID}:law`);
  const iv = useMeasurements<IvRow>(`${LAB_ID}:iv:${prId}`);
  const lux = useMeasurements<LuxRow>(`${LAB_ID}:lux:${prId}`);
  const dark = useMeasurements<DarkRow>(`${LAB_ID}:dark:${prId}`);

  // ---- фізика → прилади ----
  const pr = PHOTORESISTORS[prId];
  const R_A = DMM_DCA.ranges[aRange]!.internalR_Ohm ?? 0;
  const key = `A:${prId}:${opticsKey(optics)}:${U0}`;
  const E0 = illuminance(optics);
  const E = flickeringIlluminance(optics, noise.rngFor(key, 'lamp'));

  // Перевантаження оцінюємо за середньою (без мерехтіння) освітленістю
  const ideal = simulatePhotoresistor({ sourceVoltage_V: U0, illuminance_lx: E0, ammeterR_Ohm: R_A }, pr);
  const destroyed = !!burnt[prId];
  const state: DeviceState = destroyed ? 'destroyed' : checkLimits({ maxPower_W: pr.maxPower_W }, ideal, 'ok');
  const burning = state === 'destroyed' && !destroyed;
  useEffect(() => {
    if (burning) setBurnt((b) => ({ ...b, [prId]: true }));
  }, [burning, prId]);

  // Згорілий фоторезистор — обрив: струму немає, вольтметр показує напругу джерела
  const truth =
    state === 'destroyed'
      ? { current_A: 0, voltage_V: U0 }
      : simulatePhotoresistor({ sourceVoltage_V: U0, illuminance_lx: E, ammeterR_Ohm: R_A }, pr);
  const rE = readInstrument(LUXMETER, luxRange, E, noise.rngFor(key, 'lux'));
  const rI = readInstrument(DMM_DCA, aRange, truth.current_A, noise.rngFor(key, 'PA1'));
  const rU = readInstrument(DMM_DCV, vRange, truth.voltage_V, noise.rngFor(key, 'PV1'));

  // ---- чому не можна записати ----
  const circuitBlock =
    state === 'destroyed'
      ? 'Фоторезистор згорів — натисніть «Замінити елемент»'
      : state === 'overload'
        ? 'Перевантаження — зменште напругу або освітленість'
        : rI.overRange
          ? 'Амперметр показує OL — збільште межу'
          : rU.overRange
            ? 'Вольтметр показує OL — збільште межу'
            : U0 === 0
              ? 'Встановіть напругу джерела'
              : null;
  const luxBlock = rE.overRange ? 'Люксметр показує OL — перемкніть межу' : null;
  const blocked =
    exp === 'law'
      ? !optics.lampOn
        ? 'Увімкніть лампу'
        : luxBlock
      : (circuitBlock ?? luxBlock ?? (exp === 'lux' && E0 === 0 ? 'Освітіть фоторезистор — увімкніть лампу' : null));
  const darkBlocked =
    E0 > 0
      ? 'Для темнового струму вимкніть лампу й закрийте штору'
      : (circuitBlock ?? (rI.value === 0 ? 'Струм надто малий для цієї межі — зменште межу амперметра' : null));

  const record = () => {
    const Er = readingIn(rE, 1);
    if (Er === null) return;
    if (exp === 'law') {
      law.add({ r: optics.distance_m, E: Er });
    } else {
      const U = readingIn(rU, 1);
      const I = readingIn(rI, 1e-3);
      if (U === null || I === null) return;
      if (exp === 'iv') iv.add({ g: opticsKey(optics), E: Er, U, I });
      else lux.add({ E: Er, U, I });
    }
    noise.next();
  };
  const recordDark = () => {
    const U = readingIn(rU, 1);
    const I = readingIn(rI, 1e-6);
    if (U === null || I === null) return;
    dark.add({ U, I });
    noise.next();
  };

  // ---- темновий опір (з останнього темнового виміру) ----
  const lastDark = dark.rows[dark.rows.length - 1];
  const darkR_Ohm = lastDark && lastDark.I > 0 ? lastDark.U / (lastDark.I * 1e-6) : null;
  const iph = (row: LuxRow) => (darkR_Ohm ? row.I - (row.U / darkR_Ohm) * 1e3 : null);
  const luxColumns: Column<LuxRow>[] = [
    { key: 'E', label: 'E, лк' },
    { key: 'U', label: 'U, В' },
    { key: 'I', label: 'I, мА' },
    { key: 'Iph', label: 'I_ф, мА', compute: iph },
    { key: 'lgE', label: 'lg E', decimals: 3, compute: (row) => lg(row.E) },
    { key: 'lgI', label: 'lg I_ф', decimals: 3, compute: (row) => lg(iph(row)) },
  ];

  // ---- графіки ----
  let plot: { series: PlotSeries[]; lines: PlotLine[]; xLabel: string; yLabel: string; zero: boolean };
  let fitText: ReactNode = null;
  let canFit = false;
  if (exp === 'law') {
    const pts = law.rows.map((row) => ({ x: 1 / (row.r * row.r), y: row.E }));
    canFit = pts.length >= 2;
    const f = showFit && canFit ? fitThroughOrigin(pts.map((p) => p.x), pts.map((p) => p.y)) : null;
    plot = {
      series: [{ id: 'law', label: 'E(1/r²)', points: pts }],
      lines: f ? [{ slope: f.slope, intercept: 0, label: 'Пряма через початок координат' }] : [],
      xLabel: '1/r², м⁻²',
      yLabel: 'E, лк',
      zero: true,
    };
    if (f) fitText = <>Нахил: <b>{formatNum(f.slope, 3)} лк·м²</b> = T·I_v (для T = 1 — сила світла лампи в кд)</>;
  } else if (exp === 'iv') {
    const groups = new Map<string, IvRow[]>();
    iv.rows.forEach((row) => groups.set(row.g, [...(groups.get(row.g) ?? []), row]));
    const series: PlotSeries[] = [];
    const lines: PlotLine[] = [];
    const fits: { label: string; R: number }[] = [];
    [...groups.values()].forEach((rows, i) => {
      const color = PLOT_COLORS[i % PLOT_COLORS.length]!;
      const label = `E ≈ ${formatNum(mean(rows.map((row) => row.E)), 3)} лк`;
      series.push({ id: `g${i}`, label, color, points: rows.map((row) => ({ x: row.U, y: row.I })) });
      if (showFit && rows.length >= 2) {
        const f = linearFit(rows.map((row) => row.U), rows.map((row) => row.I));
        lines.push({ slope: f.slope, intercept: f.intercept, color });
        fits.push({ label, R: 1 / f.slope });
      }
    });
    canFit = [...groups.values()].some((rows) => rows.length >= 2);
    plot = { series, lines, xLabel: 'U, В', yLabel: 'I, мА', zero: true };
    if (fits.length) {
      fitText = fits.map((f) => (
        <div key={f.label}>
          {f.label}: R = 1/нахил = <b>{formatNum(f.R, 3)} кОм</b>
        </div>
      ));
    }
  } else {
    const pts = lux.rows
      .map((row) => ({ x: lg(row.E), y: lg(iph(row)) }))
      .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
    canFit = pts.length >= 2;
    const f = showFit && canFit ? linearFit(pts.map((p) => p.x), pts.map((p) => p.y)) : null;
    plot = {
      series: [{ id: 'lux', label: pr.name, points: pts }],
      lines: f ? [{ slope: f.slope, intercept: f.intercept, label: 'Пряма МНК' }] : [],
      xLabel: 'lg E  (E в лк)',
      yLabel: 'lg I_ф  (I_ф в мА)',
      zero: false,
    };
    if (f) fitText = <>Нахил прямої: <b>γ = {formatNum(f.slope, 3)}</b></>;
  }

  const table = exp === 'law' ? law : exp === 'iv' ? iv : lux;
  const flow = truth.current_A / 0.02;
  const prLabel = prId === 'X' ? 'Rx' : 'R1';

  return (
    <>
      <Bench>
        <Panel area="schematic" title="Оптична лава і схема кола">
          <Schematic width={520} height={300} title="Лампа і фоторезистор на лаві; джерело, амперметр і фоторезистор послідовно, вольтметр паралельно фоторезистору">
            <OpticalRail optics={optics} x0={40} x1={470} y={50} detectorLabel={prLabel} />
            <Source x={60} y={210} rot={90} adjustable label="G" labelDx={-26} labelDy={4} />
            <Wire points={[[60, 180], [60, 140], [150, 140]]} flow={flow} />
            <Meter x={180} y={140} sym="A" label="PA1" />
            <Wire points={[[210, 140], [330, 140], [330, 180]]} flow={flow} />
            <Photoresistor x={330} y={210} rot={90} label={prLabel} labelDx={-44} labelDy={4} active broken={state === 'destroyed'} />
            <Wire points={[[330, 240], [330, 280], [60, 280], [60, 240]]} flow={flow} />
            <Wire points={[[330, 155], [430, 155], [430, 180]]} />
            <Meter x={430} y={210} rot={90} sym="V" label="PV1" labelDx={32} labelDy={4} />
            <Wire points={[[430, 240], [430, 265], [330, 265]]} />
            <Node x={330} y={155} />
            <Node x={330} y={265} />
          </Schematic>
        </Panel>

        <Panel area="instruments" title="Вимірювальні прилади" dark>
          <Instruments>
            <DigitalMeter spec={LUXMETER} rangeIdx={luxRange} onRangeChange={setLuxRange} reading={rE} tag="Люксметр" flag="LUX" />
            <DigitalMeter spec={DMM_DCA} rangeIdx={aRange} onRangeChange={setARange} reading={rI} tag="PA1" />
            <DigitalMeter spec={DMM_DCV} rangeIdx={vRange} onRangeChange={setVRange} reading={rU} tag="PV1" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented
              label="Дослід"
              value={exp}
              onChange={(v) => {
                setExp(v);
                setShowFit(false);
              }}
              options={[
                { value: 'law', label: 'Закон 1/r²' },
                { value: 'iv', label: 'ВАХ I(U)' },
                { value: 'lux', label: 'Люкс-амперна' },
              ]}
            />
            <Segmented
              label="Фоторезистор"
              value={prId}
              onChange={setPrId}
              options={[
                { value: 'R1', label: 'R1 (навчальний)' },
                { value: 'X', label: 'Зразок «X»' },
              ]}
            />
            <OpticsControls optics={optics} onOpticsChange={onOpticsChange} />
            <ParamSlider label="Напруга джерела U₀" value={U0} min={0} max={30} step={0.1} unit="В" onChange={setU0} />
            <DeviceStatus
              state={state}
              name={pr.name}
              onReplace={() => setBurnt((b) => ({ ...b, [prId]: false }))}
              overloadText="потужність більша за 0,1 Вт! Зменште напругу або відсуньте лампу, інакше фоторезистор згорить."
            />
            <RecordButton onRecord={record} disabledReason={blocked} count={table.rows.length} />
            {exp === 'lux' && (
              <>
                <RecordButton label="Записати темновий струм" onRecord={recordDark} disabledReason={darkBlocked} />
                <div className="sim-field__hint">
                  {lastDark && darkR_Ohm ? (
                    <>
                      Темновий струм: I_темн = <b>{formatNum(lastDark.I, 3)} мкА</b> при U = {formatNum(lastDark.U, 3)} В →
                      R_темн = U/I_темн = <b>{formatNum(darkR_Ohm / 1e6, 3)} МОм</b>. Стовпець I_ф = I − U/R_темн.
                    </>
                  ) : (
                    'Темновий струм ще не виміряно — стовпці I_ф порожні.'
                  )}
                </div>
              </>
            )}
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={exp === 'law' ? 'Таблиця · закон обернених квадратів' : `Таблиця · ${pr.name}`}>
          {exp === 'law' ? (
            <MeasurementTable columns={LAW_COLUMNS} rows={law.rows} onRemove={law.remove} onClear={law.clear} />
          ) : exp === 'iv' ? (
            <MeasurementTable columns={IV_COLUMNS} rows={iv.rows} onRemove={iv.remove} onClear={iv.clear} />
          ) : (
            <MeasurementTable columns={luxColumns} rows={lux.rows} onRemove={lux.remove} onClear={lux.clear} />
          )}
        </Panel>
        <Panel
          title={exp === 'law' ? 'Графік E(1/r²)' : exp === 'iv' ? 'Графік I(U)' : 'Графік lg I_ф від lg E'}
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setShowFit((v) => !v)} disabled={!canFit}>
              {showFit ? 'Сховати пряму' : 'Провести пряму (МНК)'}
            </button>
          }
        >
          <Plot series={plot.series} lines={plot.lines} xLabel={plot.xLabel} yLabel={plot.yLabel} xZero={plot.zero} yZero={plot.zero} />
          {fitText && <FitResult>{fitText}</FitResult>}
        </Panel>
      </Workbook>
    </>
  );
}
