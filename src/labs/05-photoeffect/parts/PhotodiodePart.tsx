/**
 * Частина Б — кремнієвий фотодіод на оптичній лаві.
 *
 * Стенд:   лампа EL1 → (фільтр) → фотодіод VD1 на відстані r; поруч датчик люксметра.
 *          Режим «КЗ»: фотодіод замкнений на мультиметр PA1 (A⎓) → I_кз.
 *          Режим «ХХ»: до фотодіода під'єднано лише вольтметр PV1 (V⎓, 10 МОм) → U_хх.
 * Студент: змінює освітленість, записує I_кз, перемикає режим і записує U_хх —
 *          обидва значення потрапляють в один рядок, якщо лава не змінювалася.
 * Дані:    фізика — ../model.ts; таблиця — localStorage 'vlab:photoeffect:diode'.
 */
import { useState, type ReactNode } from 'react';
import {
  Bench,
  Controls,
  DigitalMeter,
  FitResult,
  Instruments,
  MeasurementTable,
  Panel,
  Plot,
  RecordButton,
  Segmented,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
} from '@/components/sim';
import { Diode, Meter, Schematic, Text, Wire } from '@/components/schematic/Schematic';
import { readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_DCV, LUXMETER } from '@/core/instrumentCatalog';
import { fitThroughOrigin, linearFit } from '@/core/stats';
import { formatNum, formatSci } from '@/core/format';
import { PHOTODIODE, illuminance, openCircuitVoltage, shortCircuitCurrent } from '../model';
import { LAB_ID, OpticalRail, OpticsControls, flickeringIlluminance, lg, opticsKey, type OpticsProps } from './shared';

type Mode = 'sc' | 'oc';
/** k — ключ стану лави; E — лк; Isc — мкА; Uoc — В (null — ще не виміряно). */
type PdRow = { k: string; E: number; Isc: number | null; Uoc: number | null };

const COLUMNS: Column<PdRow>[] = [
  { key: 'E', label: 'E, лк' },
  { key: 'Isc', label: 'I_кз, мкА' },
  { key: 'Uoc', label: 'U_хх, В' },
  { key: 'lgE', label: 'lg E', decimals: 3, compute: (row) => lg(row.E) },
];

/** Вхідний опір вольтметра, Ом (однаковий на всіх межах DMM_DCV). */
const VOLTMETER_R = DMM_DCV.ranges[0]!.internalR_Ohm ?? 1e7;

export default function PhotodiodePart({ optics, onOpticsChange }: OpticsProps) {
  const [mode, setMode] = useState<Mode>('sc');
  const [aRange, setARange] = useState(0); // DMM_DCA: 200 мкА
  const [vRange, setVRange] = useState(1); // DMM_DCV: 2 В
  const [luxRange, setLuxRange] = useState(1);
  const [plotKind, setPlotKind] = useState<'isc' | 'uoc'>('isc');
  const [showFit, setShowFit] = useState(false);

  const noise = useNoise(LAB_ID);
  const table = useMeasurements<PdRow>(`${LAB_ID}:diode`);

  // ---- фізика → прилади ----
  const pd = PHOTODIODE;
  const key = `B:${opticsKey(optics)}:${mode}`;
  const E0 = illuminance(optics);
  const E = flickeringIlluminance(optics, noise.rngFor(key, 'lamp'));
  const R_A = DMM_DCA.ranges[aRange]!.internalR_Ohm ?? 0;
  const Isc = mode === 'sc' ? shortCircuitCurrent(pd, E, R_A) : 0;
  const Uoc = mode === 'oc' ? openCircuitVoltage(pd, E, VOLTMETER_R) : 0;
  const rE = readInstrument(LUXMETER, luxRange, E, noise.rngFor(key, 'lux'));
  const rI = mode === 'sc' ? readInstrument(DMM_DCA, aRange, Isc, noise.rngFor(key, 'PA1')) : null;
  const rU = mode === 'oc' ? readInstrument(DMM_DCV, vRange, Uoc, noise.rngFor(key, 'PV1')) : null;

  const blocked = rE.overRange
    ? 'Люксметр показує OL — перемкніть межу'
    : E0 === 0
      ? 'Освітіть фотодіод: увімкніть лампу або відкрийте штору'
      : rI?.overRange
        ? 'Амперметр показує OL — збільште межу'
        : rU?.overRange
          ? 'Вольтметр показує OL — збільште межу'
          : null;

  const record = () => {
    const Er = readingIn(rE, 1);
    const value = rI ? readingIn(rI, 1e-6) : rU ? readingIn(rU, 1) : null;
    if (Er === null || value === null) return;
    const k = opticsKey(optics);
    const field = mode === 'sc' ? 'Isc' : 'Uoc';
    const last = table.rows[table.rows.length - 1];
    if (last && last.k === k && last[field] === null) {
      // Той самий стан лави — дописуємо друге значення в той самий рядок
      table.remove(table.rows.length - 1);
      table.add({ ...last, [field]: value });
    } else {
      table.add({ k, E: Er, Isc: null, Uoc: null, [field]: value });
    }
    noise.next();
  };

  // ---- графіки ----
  const iscPts = table.rows.filter((r) => r.Isc !== null).map((r) => ({ x: r.E, y: r.Isc! }));
  const uocPts = table.rows
    .filter((r) => r.Uoc !== null && r.E > 0)
    .map((r) => ({ x: Math.log10(r.E), y: r.Uoc! }));
  const pts = plotKind === 'isc' ? iscPts : uocPts;
  const canFit = pts.length >= 2;
  let fitLine = null;
  let fitText: ReactNode = null;
  if (showFit && canFit) {
    if (plotKind === 'isc') {
      const f = fitThroughOrigin(pts.map((p) => p.x), pts.map((p) => p.y));
      fitLine = { slope: f.slope, intercept: 0, label: 'Пряма через початок координат' };
      fitText = (
        <>
          Нахил: S_E = <b>{formatNum(f.slope, 3)} мкА/лк</b> = <b>{formatSci(f.slope * 1e-6, 3)} А/лк</b>
        </>
      );
    } else {
      const f = linearFit(pts.map((p) => p.x), pts.map((p) => p.y));
      fitLine = { slope: f.slope, intercept: f.intercept, label: 'Пряма МНК' };
      fitText = (
        <>
          Нахил: <b>{formatNum(f.slope * 1e3, 3)} мВ</b> на кожне десятикратне збільшення E
        </>
      );
    }
  }

  const flow = mode === 'sc' ? Isc / 100e-6 : 0;

  return (
    <>
      <Bench>
        <Panel area="schematic" title="Оптична лава і схема кола">
          <Schematic width={460} height={300} title="Фотодіод на лаві, під'єднаний до амперметра (коротке замикання) або вольтметра (холостий хід)">
            <OpticalRail optics={optics} x0={40} x1={400} y={50} detectorLabel="VD1" />
            <Wire points={[[150, 180], [150, 140], [300, 140], [300, 180]]} flow={flow} />
            <Diode x={150} y={210} rot={90} photo label="VD1" labelDx={-38} labelDy={4} active />
            <Meter x={300} y={210} rot={90} sym={mode === 'sc' ? 'µA' : 'V'} label={mode === 'sc' ? 'PA1' : 'PV1'} labelDx={34} labelDy={4} />
            <Wire points={[[300, 240], [300, 280], [150, 280], [150, 240]]} flow={flow} />
            <Text x={225} y={132} small>
              {mode === 'sc' ? 'режим короткого замикання' : 'режим холостого ходу'}
            </Text>
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
              label="Режим фотодіода"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'sc', label: 'Короткого замикання (I_кз)' },
                { value: 'oc', label: 'Холостого ходу (U_хх)' },
              ]}
              hint="Прилад, не під'єднаний у цьому режимі, нічого не показує."
            />
            <OpticsControls optics={optics} onOpticsChange={onOpticsChange} />
            <RecordButton onRecord={record} disabledReason={blocked} count={table.rows.length} />
            <div className="sim-field__hint">
              Запишіть I_кз, перемкніть режим і запишіть U_хх — не змінюючи лаву, обидва значення потраплять в один рядок.
            </div>
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={`Таблиця · ${pd.name}`}>
          <MeasurementTable columns={COLUMNS} rows={table.rows} onRemove={table.remove} onClear={table.clear} />
        </Panel>
        <Panel
          title={plotKind === 'isc' ? 'Графік I_кз(E)' : 'Графік U_хх від lg E'}
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setShowFit((v) => !v)} disabled={!canFit}>
              {showFit ? 'Сховати пряму' : 'Провести пряму (МНК)'}
            </button>
          }
        >
          <Segmented
            value={plotKind}
            onChange={(v) => {
              setPlotKind(v);
              setShowFit(false);
            }}
            options={[
              { value: 'isc', label: 'I_кз(E)' },
              { value: 'uoc', label: 'U_хх(lg E)' },
            ]}
          />
          <Plot
            series={[{ id: 'pd', label: pd.name, points: pts }]}
            lines={fitLine ? [fitLine] : []}
            xLabel={plotKind === 'isc' ? 'E, лк' : 'lg E  (E в лк)'}
            yLabel={plotKind === 'isc' ? 'I_кз, мкА' : 'U_хх, В'}
            xZero={plotKind === 'isc'}
            yZero={plotKind === 'isc'}
          />
          {fitText && <FitResult>{fitText}</FitResult>}
        </Panel>
      </Workbook>
    </>
  );
}
