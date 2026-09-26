import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app.js', 'utf8');

test('eraser hit testing measures distance in document pixels', () => {
  const start = source.indexOf('function summaryStudyDistanceToSegment');
  const end = source.indexOf('function drawSummaryStudyStroke', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.distance = summaryStudyDistanceToSegment;`, context);
  assert.ok(Math.abs(context.distance({ x: 0.5, y: 0.52 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 1000, 500) - 10) < 1e-8);
  assert.equal(context.distance({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 500), 0);
});

test('drawing canvas resolution stays within a bounded pixel budget', () => {
  const start = source.indexOf('const SUMMARY_STUDY_MAX_CANVAS_PIXELS');
  const end = source.indexOf('function resizeSummaryStudyDrawingLayer', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.pixelRatio = summaryStudyCanvasPixelRatio; this.pixelBudget = SUMMARY_STUDY_MAX_CANVAS_PIXELS;`, context);
  assert.equal(context.pixelRatio(800, 2000, 2), 2);
  const ratio = context.pixelRatio(1000, 12000, 2);
  assert.ok(ratio < 2);
  assert.ok(Math.floor(1000 * ratio) * Math.floor(12000 * ratio) <= context.pixelBudget);
});

test('pointer movement draws new segments immediately without redrawing saved strokes', () => {
  const start = source.indexOf('canvas.onpointermove = event =>', source.indexOf('function mountSummaryStudyDrawingLayer'));
  const end = source.indexOf('canvas.onpointerup = finish', start);
  const handler = source.slice(start, end);
  const drawingPath = handler.slice(handler.indexOf('const active = _summaryStudyDrawingActiveStroke'));
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /getCoalescedEvents/);
  assert.match(drawingPath, /flushSummaryStudyActiveStroke\(\)/);
  assert.doesNotMatch(drawingPath, /queueFrame\(\)/);
  assert.doesNotMatch(handler, /redrawSummaryStudyDrawing|clearRect/);
});

test('drawing layer remains mounted when drawing mode is turned off', () => {
  const mountStart = source.indexOf('function mountSummaryStudyDrawingLayer');
  const mountEnd = source.indexOf('function setSummaryStudyEditing', mountStart);
  const mount = source.slice(mountStart, mountEnd);
  assert.match(mount, /root\.querySelector\('\.summary-study-drawing-layer'\)/);
  assert.match(mount, /if \(!canvas \|\| canvas !== _summaryStudyDrawingCanvas\)/);
  assert.match(mount, /canvas\.style\.pointerEvents = _summaryStudyDrawing \? 'auto' : 'none'/);
  assert.doesNotMatch(mount, /summary-study-drawing-layer'\)\?\.remove/);
});

test('completed and cancelled strokes are saved, with storage errors surfaced', () => {
  assert.match(source, /canvas\.onpointerup = finish/);
  assert.match(source, /canvas\.onpointercancel = finish/);
  assert.match(source, /persistSummaryStudyAnnotations\(strokes\)/);
  assert.match(source, /Không lưu được nét vẽ/);
  assert.match(source, /_summaryStudyFinishDrawing\?\.\(\); _summaryStudyDrawing = !_summaryStudyDrawing/);
});
