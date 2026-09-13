/**
 * UI-кіт симуляцій — усе, що потрібно для Simulation.tsx будь-якої лаби:
 *   import { Sim, Bench, Panel, AnalogMeter, ParamSlider, … } from '@/components/sim';
 */
export { Sim, Bench, Workbook, Panel, Instruments, Controls, RecordButton, DeviceStatus, FitResult } from './Bench';
export { default as AnalogMeter } from './AnalogMeter';
export { default as DigitalMeter } from './DigitalMeter';
export { ParamSlider, Segmented, ToggleSwitch, Tabs, type SegOption } from './Controls';
export { default as MeasurementTable, type Column } from './MeasurementTable';
export { default as Plot, PLOT_COLORS, type PlotSeries, type PlotLine, type PlotPoint } from './Plot';
export { useMeasurements, type Row } from './useMeasurements';
export { useNoise } from './useNoise';
