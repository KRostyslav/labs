/**
 * ШАБЛОН симуляції (приклад: закон Ома для резистора). Копіюйте й змінюйте.
 *
 * Стенд:   джерело G (0–10 В) → міліамперметр PA1 → резистор R → назад до G;
 *          вольтметр PV1 (цифровий) паралельно резистору.
 * Студент: вибирає резистор, змінює напругу, перемикає межі приладів, записує виміри.
 * Дані:    фізика — ./model.ts; прилади — src/core/instrumentCatalog.ts;
 *          таблиця зберігається в localStorage під ключем 'vlab:template:<зразок>'.
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
import { Meter, Node, Resistor, Schematic, Source, Wire } from '@/components/schematic/Schematic';
import { readInstrument, readingIn } from '@/core/instruments';
import { ANALOG_MILLIAMMETER, DMM_DCV } from '@/core/instrumentCatalog';
import { linearFit } from '@/core/stats';
import { formatNum } from '@/core/format';
import { SAMPLES, simulate, type SampleId } from './model';

const LAB_ID = 'template';

/** Рядок таблиці: U — у вольтах, I — у міліамперах (як у заголовках стовпців). */
type Row = { U: number; I: number };

const COLUMNS: Column<Row>[] = [
  { key: 'U', label: 'U, В' },
  { key: 'I', label: 'I, мА' },
  // Обчислюваний стовпець: R = U / I (I переводимо з мА в А)
  { key: 'R', label: 'R = U/I, Ом', decimals: 1, compute: (r) => (r.I ? r.U / (r.I * 1e-3) : null) },
];

export default function Simulation() {
  // ---- стан стенда ----
  const [sampleId, setSampleId] = useState<SampleId>('R1');
  const [U0, setU0] = useState(3);
  const [aRange, setARange] = useState(1); // індекс межі в ANALOG_MILLIAMMETER.ranges
  const [vRange, setVRange] = useState(2); // індекс межі в DMM_DCV.ranges
  const [showFit, setShowFit] = useState(false);

  const noise = useNoise(LAB_ID);
  const table = useMeasurements<Row>(`${LAB_ID}:${sampleId}`);

  // ---- фізика → прилади ----
  const sample = SAMPLES[sampleId];
  const ammeterR = ANALOG_MILLIAMMETER.ranges[aRange]!.internalR_Ohm ?? 0;
  const truth = simulate({ sourceVoltage_V: U0, ammeterR_Ohm: ammeterR }, sample);
  const key = `${sampleId}:${U0}`; // шум залежить від параметрів і номера виміру
  const iRead = readInstrument(ANALOG_MILLIAMMETER, aRange, truth.current_A, noise.rngFor(key, 'PA1'));
  const uRead = readInstrument(DMM_DCV, vRange, truth.voltage_V, noise.rngFor(key, 'PV1'));

  const blocked = iRead.overRange
    ? 'Міліамперметр зашкалює — збільште межу'
    : uRead.overRange
      ? 'Вольтметр показує OL — збільште межу'
      : null;

  const record = () => {
    const U = readingIn(uRead, 1);
    const I = readingIn(iRead, 1e-3);
    if (U === null || I === null) return;
    table.add({ U, I });
    noise.next(); // наступний вимір матиме новий випадковий розкид
  };

  // ---- графік і МНК ----
  const points = table.rows.map((r) => ({ x: r.I, y: r.U }));
  const fit = showFit && points.length >= 2 ? linearFit(points.map((p) => p.x), points.map((p) => p.y)) : null;

  return (
    <Sim>
      <Bench>
        <Panel area="schematic" title="Схема кола">
          <Schematic width={420} height={220} title="Джерело, міліамперметр і резистор послідовно; вольтметр паралельно резистору">
            <Source x={50} y={110} rot={90} adjustable label="G" labelDx={-26} labelDy={4} />
            <Wire points={[[50, 80], [50, 40], [140, 40]]} flow={truth.current_A / 0.05} />
            <Meter x={170} y={40} sym="mA" label="PA1" />
            <Wire points={[[200, 40], [290, 40], [290, 80]]} flow={truth.current_A / 0.05} />
            <Resistor x={290} y={110} rot={90} label={sampleId === 'X' ? 'Rx' : 'R1'} labelDx={-28} labelDy={4} active />
            <Wire points={[[290, 140], [290, 180], [50, 180], [50, 140]]} flow={truth.current_A / 0.05} />
            <Wire points={[[290, 55], [370, 55], [370, 80]]} />
            <Meter x={370} y={110} rot={90} sym="V" label="PV1" labelDx={30} labelDy={4} />
            <Wire points={[[370, 140], [370, 165], [290, 165]]} />
            <Node x={290} y={55} />
            <Node x={290} y={165} />
          </Schematic>
        </Panel>

        <Panel area="instruments" title="Вимірювальні прилади" dark>
          <Instruments>
            <AnalogMeter spec={ANALOG_MILLIAMMETER} rangeIdx={aRange} onRangeChange={setARange} reading={iRead} tag="PA1" />
            <DigitalMeter spec={DMM_DCV} rangeIdx={vRange} onRangeChange={setVRange} reading={uRead} tag="PV1" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented
              label="Резистор"
              value={sampleId}
              onChange={setSampleId}
              options={[
                { value: 'R1', label: 'R1 (навчальний)' },
                { value: 'X', label: 'Зразок «X»' },
              ]}
            />
            <ParamSlider label="Напруга джерела U₀" value={U0} min={0} max={10} step={0.1} unit="В" onChange={setU0} />
            <RecordButton onRecord={record} disabledReason={blocked} count={table.rows.length} />
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={`Таблиця вимірювань · ${sample.name}`}>
          <MeasurementTable columns={COLUMNS} rows={table.rows} onRemove={table.remove} onClear={table.clear} />
        </Panel>
        <Panel
          title="Графік U(I)"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setShowFit((v) => !v)} disabled={points.length < 2}>
              {showFit ? 'Сховати пряму' : 'Провести пряму (МНК)'}
            </button>
          }
        >
          <Plot
            series={[{ id: 'ui', label: sample.name, points }]}
            lines={fit ? [{ slope: fit.slope, intercept: fit.intercept, label: 'Пряма МНК' }] : []}
            xLabel="I, мА"
            yLabel="U, В"
            xZero
            yZero
          />
          {fit && (
            <FitResult>
              Нахил прямої: <b>{formatNum(fit.slope, 4)} В/мА</b> → R = <b>{formatNum(fit.slope * 1e3, 4)} Ом</b>
            </FitResult>
          )}
        </Panel>
      </Workbook>
    </Sim>
  );
}
