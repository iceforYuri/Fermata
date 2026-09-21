/** 前后端共享类型（与 Rust 侧 serde 输出对齐） */

export type ProcessState = "suspended" | "running" | "waiting_ai" | "completed";

export interface Process {
  id: number;
  title: string;
  state: ProcessState;
  prev_state: string | null;
  color_tag: number | null;
  notes: string | null;
  created_at: number;
  activated_count: number;
  completed_at: number | null;
  queue_position: number | null;
  board_date: string;
}

export interface Step {
  id: number;
  process_id: number;
  title: string;
  done: boolean;
  done_at: number | null;
  position: number;
  kind: "step" | "note"; // note = 断点条
}

export interface StackTop {
  title: string;
  kind: "step" | "note";
}

export interface Plan {
  id: number;
  title: string;
  est_minutes: number | null;
  scheduled_date: string | null;
  state: "pool" | "completed" | "deleted";
  created_at: number;
  completed_at: number | null;
  position: number | null;
  prev_position?: number | null; // plan_done 记位，plan_reopen 插回原位用
}

export interface FermataEvent {
  id: number;
  ts: number;
  kind: string;
  process_id: number | null;
  payload: string | null;
}

export interface BoardProcess {
  process: Process;
  steps: Step[];
  day_total_ms: number;
  aging_ms: number | null;
  active_segment_started_at: number | null;
  timer_open: boolean;
  ring_elapsed_ms: number;
  stack_top: StackTop | null; // 导语：栈顶条目（note 或未勾选 step）
}

export interface RestState {
  resting: boolean;
  since: number | null;
  source: "ring_full" | "continuous" | null;
  reading_ms: number | null;
  choice: RestChoice | null; // 本次休息期内的选择（null=未抉择，三选态）
}

export interface BoardDay {
  day: string;
  running: BoardProcess | null;
  suspended: BoardProcess[];
  completed: BoardProcess[];
  completed_total_ms: number;
}

export interface SliceStats {
  complete: number;
  aborted: number;
}

export interface PaletteEntry {
  theme: "light" | "dark";
  slot: number;
  hex: string;
}

export type RestChoice = "defer" | "rest" | "next" | "close";

export interface Segment {
  id: number;
  process_id: number;
  started_at: number;
  ended_at: number | null;
  day: string;
  kind: string;
  note: string | null;
}

/** M3 统计类型 */
export interface DaySlice { process_id: number; title: string; color_tag: number | null; ms: number; }
export interface DayStats {
  day: string; slices: DaySlice[]; total_ms: number; switch_count: number; longest_segment_ms: number;
}
export interface ShareByColor { color_tag: number | null; ms: number; }
export interface DayShares { day: string; shares: ShareByColor[]; }
export interface MonthShares { month: number; shares: ShareByColor[]; }
export interface YearOverview { year: number; months: MonthShares[]; available_years: number[]; }
export interface DayViewProcess {
  process_id: number; title: string; color_tag: number | null; ms: number;
  steps_done: number; steps_total: number; breakpoint: string | null;
}
export interface SuspendedCost { process_id: number; title: string; waited_ms: number; retrieved: boolean; }
export interface DayView {
  day: string; done: DayViewProcess[]; ongoing: DayViewProcess[];
  plans: Plan[]; not_done: Plan[]; suspended_costs: SuspendedCost[];
}
/** 时间格内一枚可见标记（v1.4：占用率口径，share 分母=格的 10 分钟） */
export interface CellMark {
  process_id: number;
  color_tag: number | null;
  title: string;
  occ_start: number; // 该进程在本时间格内的占用起点（钳制在格窗内）
  occ_end: number;   // 占用止点（开口段钳到当下）
  share: number;     // 占用率 0..1；<20% 的占用者不返回
  is_start: boolean; // 该进程的段起点落此格（半圆朝向右下）
  is_end: boolean;   // 段止点落此格（半圆朝向左上）
}
export interface GridOccupant {
  process_id: number;
  color_tag: number | null;
  title: string;
  occ_start: number; // 格内钳制占用起点
  occ_end: number;   // 占用止点（开口段钳到当下）
  share: number;     // 占用率 0..1（不过滤，<20% 也列出）
}
export interface GridCell {
  cell: number;
  marks: CellMark[]; // 最多两枚：≥20% 的占用者取前二（对角分半）——只管画
  occupants: GridOccupant[]; // 全部占用者按时长降序，截前 4——悬停清单
  occupant_count: number;    // 该格占用者总数（>4 时浮窗收 "…等 N 项"）
}

/** 数据内核接口：Tauri 与 mock 双实现 */
export interface DataApi {
  processCreate(title: string, colorTag?: number, boardDate?: string): Promise<number>;
  processSwitch(pid: number, breakpoint?: string): Promise<void>;
  processComplete(pid: number): Promise<void>;
  processReopen(pid: number): Promise<void>;
  processPause(pid: number): Promise<void>;
  processResume(pid: number): Promise<void>;
  breakpointSet(pid: number, text: string): Promise<void>; // = 压 note 栈顶
  entryDelete(stepId: number): Promise<void>;
  colorSet(pid: number, slot: number | null): Promise<void>;
  waitingAiSet(pid: number, on: boolean): Promise<void>;
  stepAdd(pid: number, title: string): Promise<number>;
  stepCheck(stepId: number, done: boolean): Promise<void>;
  stepsReorder(pid: number, orderedStepIds: number[]): Promise<void>;
  queueReorder(day: string, orderedPids: number[]): Promise<void>;
  planCreate(title: string, estMinutes?: number, scheduledDate?: string): Promise<number>;
  planUpdate(
    id: number,
    patch: { title?: string; estMinutes?: number; scheduledDate?: string },
  ): Promise<void>;
  planDone(id: number): Promise<void>;
  planDelete(id: number): Promise<void>;
  planReopen(id: number): Promise<void>;
  idleStart(runningPid?: number): Promise<void>;
  idleEnd(runningPid?: number): Promise<void>;
  restTrigger(pid: number | null, source: "ring_full" | "continuous", readingMs: number): Promise<void>;
  restChoice(pid: number | null, choice: RestChoice): Promise<void>;
  restStart(pid?: number): Promise<void>;
  restEnd(pid?: number): Promise<void>;
  sliceComplete(pid: number): Promise<void>;
  sliceAborted(pid: number, elapsedMs: number): Promise<void>;
  sliceOverride(pid: number, minutes: number): Promise<void>;
  qBoard(day: string): Promise<BoardDay>;
  qProcessDayTotal(pid: number, day: string): Promise<number>;
  qSuspendedMs(pid: number, day: string): Promise<number>;
  qSliceStats(pid: number, day: string): Promise<SliceStats>;
  qContinuousWorkMs(day: string): Promise<number>;
  qEvents(day?: string): Promise<FermataEvent[]>;
  qSettings(): Promise<[string, string][]>;
  qPalette(): Promise<PaletteEntry[]>;
  qPlans(): Promise<Plan[]>;
  qSegments(pid: number, day: string): Promise<Segment[]>;
  segmentNote(segmentId: number, note: string): Promise<void>;
  processRename(pid: number, title: string): Promise<void>;
  notesSet(pid: number, notes: string): Promise<void>;
  settingSet(key: string, value: string): Promise<void>;
  idleConfirm(pid: number, yes: boolean): Promise<void>;
  qRestState(): Promise<RestState>;
  qDayStats(day: string): Promise<DayStats>;
  qMonthCalendar(year: number, month: number): Promise<DayShares[]>;
  qYearOverview(year: number): Promise<YearOverview>;
  qDayView(day: string): Promise<DayView>;
  qDayGrid(day: string): Promise<GridCell[]>;
  qFirstDay(): Promise<string | null>;
  exportEvents(): Promise<string>;
  /** 全量快照：另存为对话框（取消 → null） */
  exportSnapshotDialog(): Promise<string | null>;
  /** 可测层：导出到指定路径 */
  exportSnapshotTo(path: string): Promise<string>;
  /** 事件日志导出（次要行）：另存为对话框 */
  exportEventsDialog(): Promise<string | null>;
  /** 打开对话框选快照（取消 → null） */
  importSnapshotDialog(): Promise<string | null>;
  /** 读+校验（不碰库），返回确认覆盖层摘要 */
  importSnapshotCheck(path: string): Promise<{ processes: number; events: number; exported_at: number | null }>;
  /** 备份+事务导入，返回回执 */
  importSnapshotFrom(path: string): Promise<{ backup: string; processes: number; events: number }>;
}
