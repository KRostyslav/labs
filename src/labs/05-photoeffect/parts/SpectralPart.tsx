/**
 * Частина В — спектральна характеристика фотоприймачів.
 *
 * Стенд:   лампа EL1 → монохроматор (λ = 350–2000 нм, крок 10 нм, потужність на виході стала,
 *          100 мкВт) → фотоприймач (CdS, CdSe, GaAs, Si, Ge або «X») → мультиметр PA1 (A⎓).
 * Студент: вибирає фотоприймач, змінює λ, записує струм; на графіку I(λ) знаходить червону
 *          межу — де сигнал на довгохвильовому краї спадає до половини максимуму.
 * Дані:    фізика — ../model.ts; таблиця — localStorage 'vlab:photoeffect:spectral:<фотоприймач>'.
 */
import { useState } from 'react';
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
  RecordButton,
  Segmented,
  ToggleSwitch,
  Workbook,
  useMeasurements,
  useNoise,
  type Column,
} from '@/components/sim';
import { Block, Meter, Schematic, Text, Wire } from '@/components/schematic/Schematic';
import { readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA } from '@/core/instrumentCatalog';
import { addNoise } from '@/core/noise';
import { formatNum } from '@/core/format';
import {
  LAMBDA_MAX_NM,
  LAMBDA_MIN_NM,
  LAMBDA_STEP_NM,
  MONO_NOISE_REL,
  MONO_POWER_W,
  SPECTRAL_DETECTORS,
  spectralCurrent,
  type DetectorId,
} from '../model';
import { LAB_ID, spectrumName, wavelengthColor } from './shared';

/** l — довжина хвилі, нм; I — струм, мкА. */
type SpRow = { l: number; I: number };

const DETECTOR_OPTIONS: { value: DetectorId; label: string }[] = [
  { value: 'CdS', label: 'CdS' },
  { value: 'CdSe', label: 'CdSe' },
  { value: 'GaAs', label: 'GaAs' },
  { value: 'Si', label: 'Si' },
  { value: 'Ge', label: 'Ge' },
  { value: 'X', label: 'Зразок «X»' },
];

export default function SpectralPart() {
  const [detId, setDetId] = useState<DetectorId>('Si');
  const [lambda, setLambda] = useState(600);
  const [aRange, setARange] = useState(0); // DMM_DCA: 200 мкА
  const [norm, setNorm] = useState(false);
  const [showHalf, setShowHalf] = useState(false);

  const noise = useNoise(LAB_ID);
  const table = useMeasurements<SpRow>(`${LAB_ID}:spectral:${detId}`);

  // ---- фізика → прилад ----
  const det = SPECTRAL_DETECTORS[detId];
  const key = `C:${detId}:${lambda}`;
  const I = addNoise(noise.rngFor(key, 'mono'), spectralCurrent(det, lambda), { rel: MONO_NOISE_REL });
  const rI = readInstrument(DMM_DCA, aRange, I, noise.rngFor(key, 'PA1'));
  const blocked = rI.overRange ? 'Амперметр показує OL — збільште межу' : null;

  const record = () => {
    const v = readingIn(rI, 1e-6);
    if (v === null) return;
    table.add({ l: lambda, I: v });
    noise.next();
  };

  // ---- таблиця і графік ----
  const max = table.rows.reduce<SpRow | null>((m, r) => (!m || r.I > m.I ? r : m), null);
  const Imax = max && max.I > 0 ? max.I : null;
  const columns: Column<SpRow>[] = [
    { key: 'l', label: 'λ, нм', decimals: 0 },
    { key: 'I', label: 'I, мкА' },
    { key: 'S', label: 'S_rel = I/I_max', decimals: 3, compute: (r) => (Imax ? r.I / Imax : null) },
  ];
  const points = table.rows.map((r) => ({ x: r.l, y: norm && Imax ? r.I / Imax : r.I }));
  const half = Imax ? (norm ? 0.5 : Imax / 2) : null;

  const color = wavelengthColor(lambda);
  const flow = I / 50e-6;
  const detLabel = detId === 'X' ? '«X»' : det.name;

  return (
    <>
      <Bench>
        <Panel area="schematic" title="Схема установки">
          <Schematic width={500} height={240} title="Лампа, монохроматор, фотоприймач і мікроамперметр">
            <circle cx={40} cy={80} r={22} fill="#ffd54a" opacity={0.35} />
            <circle className="sch-body" cx={40} cy={80} r={14} style={{ fill: '#ffe9a8' }} />
            <line className="sch-thin" x1={30} y1={70} x2={50} y2={90} />
            <line className="sch-thin" x1={30} y1={90} x2={50} y2={70} />
            <Text x={40} y={52}>EL1</Text>
            <polygon points="56,76 100,70 100,90 56,84" fill="#f5b400" opacity={0.3} />
            <Block x={160} y={80} w={120} h={60} text="Монохроматор" sub={`λ = ${lambda} нм`} />
            <line
              x1={222}
              y1={80}
              x2={288}
              y2={80}
              stroke={color ?? '#9ca3af'}
              strokeWidth={8}
              strokeDasharray={color ? undefined : '6 4'}
              opacity={0.85}
            />
            <Text x={255} y={66} small>
              {color ? 'видиме світло' : lambda < 380 ? 'УФ' : 'ІЧ'}
            </Text>
            <Block x={340} y={80} w={100} h={50} text={detLabel} sub="фотоприймач" active />
            <Text x={160} y={128} small>
              P = {formatNum(MONO_POWER_W * 1e6, 3)} мкВт (стала)
            </Text>
            <Wire points={[[320, 105], [320, 190], [370, 190]]} flow={flow} />
            <Meter x={400} y={190} sym="µA" label="PA1" />
            <Wire points={[[430, 190], [470, 190], [470, 150], [360, 150], [360, 105]]} flow={flow} />
          </Schematic>
        </Panel>

        <Panel area="instruments" title="Вимірювальний прилад" dark>
          <Instruments>
            <DigitalMeter spec={DMM_DCA} rangeIdx={aRange} onRangeChange={setARange} reading={rI} tag="PA1" />
          </Instruments>
        </Panel>

        <Panel area="controls" title="Керування">
          <Controls>
            <Segmented label="Фотоприймач" value={detId} onChange={setDetId} options={DETECTOR_OPTIONS} />
            <ParamSlider
              label="Довжина хвилі λ"
              value={lambda}
              min={LAMBDA_MIN_NM}
              max={LAMBDA_MAX_NM}
              step={LAMBDA_STEP_NM}
              unit="нм"
              onChange={setLambda}
              hint={`Область спектра: ${spectrumName(lambda)}`}
            />
            <RecordButton onRecord={record} disabledReason={blocked} count={table.rows.length} />
          </Controls>
        </Panel>
      </Bench>

      <Workbook>
        <Panel title={`Таблиця · фотоприймач ${detLabel}`}>
          <MeasurementTable columns={columns} rows={table.rows} onRemove={table.remove} onClear={table.clear} />
        </Panel>
        <Panel title={norm ? 'Відносна спектральна характеристика' : 'Спектральна характеристика I(λ)'}>
          <div className="sim-toolbar">
            <ToggleSwitch label="Нормувати: S_rel = I/I_max" checked={norm} onChange={setNorm} />
            <ToggleSwitch label="Рівень половини максимуму" checked={showHalf} onChange={setShowHalf} />
          </div>
          <Plot
            series={[{ id: 'sp', label: detLabel, points, line: true }]}
            lines={showHalf && half !== null ? [{ slope: 0, intercept: half, label: 'Половина максимуму', color: '#e0531a' }] : []}
            xLabel="λ, нм"
            yLabel={norm ? 'S_rel' : 'I, мкА'}
            yZero
          />
          {max && Imax && (
            <FitResult>
              Максимум: I_max = <b>{formatNum(Imax, 4)} мкА</b> при λ = <b>{max.l} нм</b>; половина — {formatNum(Imax / 2, 4)} мкА.
              Червона межа λ_ч — там, де крива праворуч від максимуму перетинає цей рівень.
            </FitResult>
          )}
        </Panel>
      </Workbook>
    </>
  );
}
