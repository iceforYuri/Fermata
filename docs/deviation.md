# deviation.md —— 文档未覆盖处的保守实现决策（留痕）

> 规则：docs/ 没有答案的设计决策，取最保守方案并记在此。每条含日期、决策、理由。

## 2026-09-19 · M0 数据内核

### D1 · 休息态与 segments 的关系
**决策**：`rest_start` 闭合当前 focus segment（休息期间不计专注），`rest_end` 时若进程仍为 running 且计时因休息而停则重开。
**理由**：04-系统层定「弹窗出现即暂停计时」「时间的默认值是不计」；segments 是专注时长的物化视图，休息不属于专注。

### D2 · 等AI 的切入语义
**决策**：`waiting_ai` 用 `prev_state` 列记原状态；对一个 waiting_ai 进程执行 `process_switch` 视为"取回"，直接进 running 并清 prev_state（等AI 标记随切入消解）。
**理由**：CONTEXT 只定义等AI 是挂起子状态、不参与老化；切入意味着用户已接手，等待前提消失。未定义"切入但仍等AI"的形态。

### D3 · q_continuous_work_ms（当天连续无休息工作时长）口径
**决策**：当天最后一个 `rest_end` 或 `idle_start`（取较晚者，日界兜底）之后的 focus segments 总和（开口段算到 now）；休息或空闲进行中返回 0。idle_end 不重置断点——空闲既然打断过， streak 从空闲开始处已断。
**理由**：ADR-0002 的"连续工作 90 分钟"是触发口径；查询取最保守解释：休息或空闲都算作连续性的中断。

### D4 · q_suspended_ms（挂起时长/老化口径）不含等AI
**决策**：挂起时长从事件流重建，只累计 `suspended` 且非 `waiting_ai` 的区间；waiting_ai 区间整段剔除。
**理由**：CONTEXT 明确「等AI 不参与老化褪色」。

### D5 · slice_complete / slice_aborted 不由命令层推断
**决策**：`process_switch` 不自动写 `slice_aborted`；时间环是 M2 系统层职责，由系统层在切走前显式写。命令层只暴露写入入口。
**理由**：环的"进行中/剩余"状态在系统层，数据内核无法可靠推断"提前"；越权推断会污染事件日志。

### D6 · dark 主题 palette 暂用 light 同值
**决策**：palette 表 light/dark 各 7 槽，dark 暂以 light 的 PoC 暂定值种子。
**理由**：M1 才定稿色值，M4 才做双主题；占位保证 schema 与查询路径可用。

### D7 · resume 仅撤销显式 pause
**决策**：`process_resume` 只在计时因 `pause` 停止时合法；由 idle/rest 停的表须走 `idle_end`/`rest_end` 恢复。计时开合状态从事件流重建（无冗余列）。
**理由**：恢复路径三条皆显式（04-系统层）；事件流重建保证单一事实源。

### D8 · queue_position 语义
**决策**：进入挂起（创建/切出/reopen）时取当天版面 `MAX(queue_position)+1`；完成时置 NULL；`queue_reorder` 按给定顺序重排 1..n。
**理由**：docs 只定义"挂起队列序"，未定义编号细节；尾部追加是最保守的 FIFO。

### D9 · 种子当天时间线按固定钟点写入
**决策**：`pnpm seed` 当天数据固定写在 08:55–17:45；深夜运行会出现相对"未来"的时间戳，属预期（M1 截图备料）。
**理由**：种子是开发料，不与真实时钟绑定；深夜种子导致的老化/开口段显示差异随时间自然消化。

## 2026-09-19 · M1 进程页

### D10 · 原型定稿参数全表（授权定稿）
- 色标 7 色：亮 `#D0493B #D97E33 #BE9229 #5F8A3C #3D7D67 #486E8D #97516B`（朱/橙/珀/苔/青/黛/茜，暖调家族，弃用参考图中的亮紫 #7B58F4——宪法禁紫色 SaaS 风，茜色取其暖）；暗 `#E47A6F #E59A5A #D3AE57 #8AAC63 #66A78F #7595B2 #BB82A0`（提明度保饱和）。三处同步：tokens.css / api/palette.ts / DB palette migration v2。
- 染底 13%、边框 1px·55% 不透明、圆角 6px、确认条脊 32px 全饱和。
- 行高阶梯 28/40/112/64/40，行间距 10px。
- 老化曲线 `opacity = max(0.45, 1 − 0.55·ln(1+m/8)/ln(61))`（m=挂起分钟，前快后慢，8h 触底 0.45）。
- 时间环 64px、环粗 3px、呼吸 2.6s（opacity .72↔1、scale 1↔1.035，仅最后 5 分钟）。
- 动效阶梯 140/220ms，ease-out cubic-bezier(0.22,1,0.36,1)。

### D11 · 稿库拖入中列后计划从稿库软删（plan_delete）
**理由**：docs 只说"拖入版面即成为进程"，未说稿库是否留存；留下会造成同一事项两处存在的歧义。软删保留事件日志可溯。

### D12 · 挂起行不直接开详情栏
**理由**：规格中"点击进程唤出详情"（右栏节）与"挂起行点击=切换"（行解剖节）冲突。取保守：挂起行点击=切换；切换后即为活跃行，点开详情。档案行只有"重新打开"。

### D13 · 时间环 M1 近似的两点
- 锚点=当前开口段起点；环走满写 slice_complete（并记 rest_trigger source=ring_full）后本地重置满环；提前切走按开口段取模估算 elapsed 写 slice_aborted。M2 系统层接管后精确化。
- 暂停时环冻结值为近似（board 载荷不含暂停时刻的剩余量），恢复后立即精确。
**理由**：环的真实节律归系统层（M2），本阶段先保证事件记账完整。

### D14 · processes 表加 notes 列 + process_rename / notes_set / segment_note 命令
**理由**：详情栏规格要求"标题点击可编辑""个人记录沉底""分段可加备注"，M0 schema/命令未覆盖。migration v2 追加列（带存在性检查），事件 kinds：process_rename / notes_set / segment_note（事件清单"至少覆盖"允许扩展）。

### D15 · 标题栏左侧加"稿库"文字钮
**理由**：01 文档未给稿库的显式入口控件（空态入口仅覆盖空态）；取最保守的文字 tab 式入口，不引入图标。

## 2026-09-19 · M2 系统层

### D16 · debug 替身与验收环境
- `debug_trigger_hotkey` 与物理热键共用 `toggle_switcher`（同一处理函数）；本机合成输入不触发 RegisterHotKey（PoC 探针已证：SendKeys/keybd_event/SendInput/WinRT 注入均被吞），物理终验留人工。
- `debug_set_time_scale(f)` 语义 = 环长与连轴阈值除以 f（不改时间数学）；验收用 60x。
- 本机合成输入对 GetLastInputInfo 的影响今夜抖动（idle-probe.ps1 实测）；验收注入循环带"直到翻转才继续"的自愈。

### D17 · rest_state 增加 choice 字段
弹窗出现即 rest_start（停表），但"三选态"与"休息态"需区分：`choice` = 本次休息期内最后一个 rest_choice（null=未抉择；rest/close=休息态渲染）。

### D18 · 空闲回补 = segment 合并
答"是"：删空闲后新开的开口段、把空闲前闭合段重开（起点回吞空闲区间），写 idle_confirm{yes}。30s 超时默认"是"为 04 文档明文照做。segments 表的 UPDATE/DELETE 允许（append-only 约束只针对 events）。

### D19 · 断点微弹窗位置
行旁小卡（fixed 定位在点击行下方），Enter 确认 / Esc 取消整个切换 / 失焦取消——与浮层内嵌流程语义一致。

### D20 · 软模式"切回主窗"间隙的判定
主窗获焦 = `overlay-visibility{label:main, visible:true}`（summon/conceal 命令发出）+ window focus 事件双保险；浮层打开同理。

### D21 · 前端调度器只在主窗挂载
休止符双触发评估（1Hz tick）由主窗 Shell 承担；浮层窗口只做展示与转发命令，不评估触发——防多窗重复触发。

## 2026-09-19 · M3 统计页

### D22 · 日网格空格的表达
参考图空格画暗色小点；两主题下用"极浅中性点"（--ink-ghost 3px 圆点）——网格存在感与"空隙即数据"兼得。

### D23 · seed --deep 与 mock 历史数据
`pnpm seed:deep` 在一周密集数据上再铺过去 ~120 天稀疏记录（LCG 确定性伪随机，每周 3–5 天、每天 1–3 进程）。mock 层镜像铺 90 天（截图用）。

### D24 · 挂起成本口径
每件进程取"首次进入挂起（创建/切出）→ 首次 switch_in"的时长；从未捞回 = 到日末（过去天）或现在（今天）。多天跨挂的进程只算首段，跨天总老化已在进程页"挂 xx"呈现。

### D25 · 月历周一打头
中文工作周惯例；列空白格用 null 占位。

### D26 · 未计时完成
= plans.state=completed 且预定日=该天（含过去天"直接完成"）；在当天视图计划区标「未计时完成」，日网格不画圈（无时间锚点）。

## 2026-09-19 · M4 设置 + 收官

### D27 · 物理 Alt+Q 终验待人工（总说明）
本机环境对合成输入的过滤已在 PoC 用纯 Win32 探针排除框架嫌疑（scripts/hotkey-probe3/4/5.ps1 + docs/screenshots/poc/ 日志）：SendKeys / keybd_event / SendInput（扫描码）/ WinRT InputInjector 四条注入路径均不触发 RegisterHotKey，与 Tauri/Electron 无关。自动化验收走 `debug_trigger_hotkey`（与物理热键同一 `toggle_switcher` 处理函数）。**遗留人工动作：装包或 dev 运行时物理按一次 Alt+Q，确认切换浮层唤出。**

### D28 · 设置默认值的双层口径
settings 表只种 M0 任务列明的 7 键；M4 新增键（idle_confirm=1、font_scale=standard、density=standard、lib_width=300）不落库种子，由设置页 `get(k, 默认)` 惰性兜底——读不到即默认，首次改写才落行。理由：迁移最便宜，且默认值的演化不需要动存量库。

### D29 · 提醒样式为只读说明行
03 文档定"应用内弹窗"+通知兜底，无可调维度；做只读行（非控件），不设假开关。

### D30 · slice_minutes 改动只影响下一个环
03 文档明文。当前环读数不变是特性；verify-m4-real 断言已按此口径。

## 2026-09-19 · 视觉审校修复

### D31 · 主题取值单一来源
`effectiveTheme()`（src/store/board.ts）：URL override（截图用）> settings.theme。此前 applyPrefs 写 data-theme 用 override，而 markHex/DonutRing 读 settings.theme——`?theme=dark` 截图色标板错用亮板。现 markHex、DonutRing、设置页色板展示行全部收敛到 effectiveTheme；回归断言入 verify-m4 第 11 项（暗色条脊=暗板 rgb(117,149,178)，亮版抽查=#486E8D 无回归）。环内倒计时数字字体统一进等宽族（消两种数字气质并存）。

## 2026-09-19 · v1.1 设计修订

### D32 · v1.1 修订总指针
顶栏居中胶囊化、稿库改左缘细 rail（仅进程页）、步骤栈+断点双层（ADR-0004）、切页先收面板永收起进场、统计页日视角纵向滚动/月视角不滚动、亮色底 #FAF7F2→#FCFBF7（主题更名亮·淡暖/暗·工作台）、打包 MiSans。全部经用户逐条拍板，合同文档（01/02/04/AGENTS）已同步修订。

### D33 · MiSans 获取与子集化
官方源 https://hyperos.mi.com/font-download/MiSans.zip（代理可通），TTF 三档（Regular/Medium/Semibold）经 pyftsubset 子集化（GB2312 全集 6898 字符 + ASCII + 常用标点，layout-features 全留含 tnum）→ woff2 共 ~2.7MB（预算 ≤6MB）。许可说明随包（src/assets/fonts/MiSans-LICENSE.txt）。真实 WebView2 落地验证：document.fonts 三档 loaded + 字形度量与回退字体可区分（scripts/verify-wv2-v11.mjs）。

### D34 · 日视角滚动吸附的底部垫高
scroll-snap 的 start 对齐对最末单元不可达（内容尾部无法上顶），容器垫高 = 容器高 − 单元高，让今天也能吸附到顶。

### D35 · 顶栏不灵敏四真根因与修法（首诊误判更正）
B1 我归因为"拖拽区盖导航"——源码核查排除：Tauri 2.11.5 drag.js 沿 composedPath 遇 BUTTON 即返回 false，按钮点击永不进拖拽。真根因四条：
1. **resize 死带（主因）**：无边框窗 tao 对顶边 SM_CYFRAME 像素返 HTTOP，点击不进 WebView2；修法=titlebar 加 padding-top 8px（总高 44px），实证 CDP 量得胶囊命中区上缘距顶 10.6 CSS px（DPR 1.25），移出 4–8px 死带。
2. **缝隙死区**：胶囊项间 gap 是容器空白；修法=gap 归 0、间距由项自身 padding 撑开（实证项间缝隙 0px）。
3. **无按压反馈**：补 :active（转实 + 下沉 1px + 染底）。
4. **stepper 卸载 bug**：NumRow 输入框 blur 即 commit → ± 钮 mousedown 阶段被卸载、click 永不派发；修法=± 钮 onMouseDown preventDefault（阻焦点转移），回归断言改真实鼠标点 ±。
拖拽区两侧留白方案保留且实证可用（两侧各 421px data-tauri-drag-region）；TitleBar memo 保留。

## 2026-09-19 · v1.2 设计修订与缺陷修复

### D36 · v1.2 修订总指针
统一栈（ADR-0005：steps 表加 kind、breakpoint 字段退役为 note 条目、entry_delete、stack_top 派生）、无边界 morph 导航（弹簧模型 response 0.42s / zeta 0.86；参考组件文档后于 v1.0 因版权移除）、拖拽激活（FLIP 挤位+落点虚影覆盖活跃位）、日网格时间段刻度与 45° 半圆（70%/15% 阈值入 tokens）、设置页左竖导航（窄窗阈值 900px）、rail 常驻"← 稿库"提示、休息页 Esc/Enter/继续小字/SVG▶。全部用户拍板，合同文档已同步。

### D37 · v1.2 直修五缺陷的根因记录
1. idle_end 无守卫曾重开手动 pause/休息中的计时——改 last_timer_closer 口径校验（仅 idle_start 停的才由 idle_end 重开）。
2. pendingRest 在切换/完成后残留排队休止符——变更即清。
3. 断点卡复用 toast-in 动画（位移+透明）气质不符——独立"行下方展开"入场。
4. 统计页日视角 calc(100vh-130px) 魔数溢出——改实测布局链计算；scroll-snap mandatory 在内容不等高时弹跳——去吸附改自由滚动。
5. 设置页 scroll-spy 用 IntersectionObserver 批次结果写死末组——改滚动监听取"最靠顶可见组"。

### D38 · v1.2.1 定点修复口径
- 顶栏 hover 失效根因：弹簧 renderItem 每帧给所有项写内联 --pill-a（未选中=0%）压过 CSS hover 规则；修法=弹簧只写选中项/进行中项，静止未选中清内联交还 CSS；pill 染底封顶 10%（浅灰 pill + 深字）；图标换 Lucide 字形（rows-3/chart-pie/settings，viewBox 24 stroke 1.5）。
- 日视角锚点=月历选中/上次停留日（初始装载锚日-3 起）；增量生长 prepend 用 scrollTop 补偿（prepend 前后 scrollHeight 差补 scrollTop），视口零跳动。
- 设置页导航浮于内容列左侧紧邻、上下居中（absolute + translateY(-50%)），内容列恢复居中；spy 沿用 B 步"最靠顶可见组+触底末组"。
- 统计三视角滚动容器拉通全宽、内容 margin auto 居中，滚动条贴窗口右缘；进程页/设置页不动。

### D39 · 日网格刻度单点化（用户改主意，废止 D36 时间段方案）
时间段 "0–2/6–8/12–14/18–20" 废止，改单点时刻 6/12/18/24 对齐列分界（数字中心 translateX(-50%) 对格线）。稿库提示从 rail 文字改为版面左侧空白区装饰层（~35% 淡、pointer-events:none、间隙 <140px 或 hover/展开 rail 时隐）。

### D40 · v1.3 换页动效要点
主三页横向轨道：.track 300% 宽 flex，translateX(-i×33.33%)，240ms ease-page；三页常驻挂载（滚动位置/内部状态保留）；离屏页 pointer-events:none + visibility:hidden 延迟至滑动结束（transition-delay）。统计页视角切换=纵向钻取成对进出（下钻新页升/旧页让，反向同），旧页短寿命双渲染 240ms 后卸载（不常驻）。淡化只剩浮层/提示；page-in 退役。tokens 收敛 --dur-page/--ease-page。

### D41 · 日视角改版与悬停浮窗核查
悬停浮窗经 mock 与真实 exe 双向复核**未断**（字段 title/seg_start/seg_end 均随格返回），补 verify-m3 内容断言锁死。日期标移单元右下（"23 mon"），吸顶 12px 小签仅在大标滚出顶沿时出现（IO 判定 boundingClientRect.top < 容器顶）。钻取零漂移：进场动画播放前先同步 scrollTo 锚日（useLayoutEffect），动画期间锚日 y 恒定（实测 t60ms=t280ms=113）。

### D42 · 轨道 transform 内禁用 fixed 定位
主三页搬进横向滑动轨道（D40）后，`.track` 的 `transform`/`will-change` 使其成为 fixed 后代的包含块：统计页停在 translateX(-33.3%) 时，页内 `position:fixed` 的日网格悬停浮窗被搬到视口外——"浮窗消失"。规则：**页面内所有 fixed 弹层一律 createPortal 到 document.body**（dg-tip 已改）。验收：scripts/check-dgtip-real.mjs 在真实 exe（CDP）里几何断言浮窗在视口内且贴近圆圈。mock 浏览器环境在钻取+懒加载装载期间几何测量不稳，验收以真实 exe 为准。

### D42 · dev 分支定点修复口径（F1–F5）
- F2 平台坑坐实：Tauri 默认 dragDropEnabled:true 会接管 WebView2 的 OLE 拖放句柄，页内 HTML5 DnD 全死；主窗加 false 后恢复（本项目无 OS 文件拖入监听，安全）。真实 exe CDP 实测：稿库条目拖入版面落库成功（事件流 process_create/plan_delete）。
- F3 口径：断点卡的断点留给被切走的旧进程（04 明文）；无活跃进程时没有旧进程可留 → 直切不弹卡。
- F4 MRU：被切走落挂起队首（其余后移），新建仍落队尾，档案重开仍落队尾（01 明文"回挂起队列尾部"）。
- 测试残留的进程行已按进程本体从库中移除（事件日志不动，append-only 不破）。

### D43 · v1.2.3 空态放置区 + 日网格18×6 + 时间片小卡 + 休止符右下角
- 日网格改 18 列 × 6 行 = 108 格（每格 10 分钟、每列 1 小时），时窗 06:00–24:00；**0–6 点不画**（跨午夜段截断到 0 点止），为保守默认值，后续若用户要 24h 全窗再开设置项。
- 空态放置区承接稿库拖入（text/gika-plan）：落挂起不激活，与"拖到版面=激活"区分。
- 时间环点击调时间片小卡（25/45/60/90）：slice_override 只调**本次**时间片语义（写 slice_override 事件，环重置满环），不改进程默认片长。
- 休止符弹窗挪主屏工作区右下角（距右/下 16px 逻辑）：修法=全链路物理像素——Tauri primary_monitor().work_area()（物理）+ 卡尺寸 420×300 逻辑 ×scale_factor + 无边框窗隐形 resize 边按对称折算。原 SystemParametersInfoW 实现把逻辑卡尺寸当物理用（125% 缩放下卡片右/下缘超出工作区 ~98px）。已删 windows-sys 的 SPI_GETWORKAREA 依赖。
- 验收方法偏离：本机 CopyFromScreen 截屏抓不到 WebView2 窗口（DirectComposition 翻转链），浮层视觉证据 = CDP Page.captureScreenshot（内容）+ Win32 GetWindowRect 枚举（落点，存 restpop-bottom-right-position.txt）；不抢焦点回归 debug_focus_check pass。

### D44 · v1.2.4 拖放统一插入预览（先塌陷后开缝）+ 中列整列感应
- **挤压修复**：旧预览数学只把 insertAt 之后的行往下推、被拖行原槽不塌陷 → 视觉上"后面的行全部后移一格"。新模型=纯 transform 编舞：每行目标位 = 塌陷位 +（塌陷位 ≥ 插入位 ? 1 : 0），位移 =（目标位 − 原槽位）×74；被拖行跟手，原槽由后续行弹簧补位。等价"先塌陷后开缝"的逐帧净几何，无两趟 FLIP 记账。共享几何收敛在 `src/components/dnd.ts`（ROW_PITCH / queueInsertAt / isOverActive / SQUEEZE），进程行 pointer 拖拽与稿库 HTML5 拖入共用。
- **中列整列感应**：稿库拖入的 dragover/drop 从挂起队列窄区提到 `.center-inner` 整列；拖出中列（relatedTarget 出列）或 Esc（原生）收缝。SuspendedRow 的窄感应区与 BoardPage 的 4px 折线条删除；EmptyState 不再自持 drop。
- **语义统一**：稿库拖到活跃位且当前有活跃 → 先落队再弹断点卡（归属原活跃，Enter 确认/Esc 取消整个切换、新进程留在队列）；空板拖入改"直接激活"（推翻 D43 的"落挂起不激活"，用户拍板：空板没有旧进程可留断点，时间从松手开始计）；队列位 = 挂到该位。
- **测试环境偏离**：headless Chromium 的 Playwright 合成 HTML5 拖动里，dragover 命中测试不可靠（命中 .track-page 而非深层行元素，深元素监听收不到），虚影断言改用 bubbles 合成 DragEvent 直测中列 handler 几何；原生 drop 链路（mouse.up）在 mock 与真实 exe 均正常。真实 exe 的 OLE 拖放由 CDP 实证覆盖。

### D45 · v1.4 日视角五项定点修复（用户商讨定稿）
- **上滑加载跳底根因**：prepend 的 scrollTop 手动补偿与 Chromium 原生 scroll anchoring 双补偿叠加，快速滚轮下被钳到滚动区最底（"回到当天"）。修法=`.daygrid-scroll` 加 `overflow-anchor: none`（原生锚定让位给手动补偿；慢/快滚轮 Playwright 双向复现对照）。
- **share 口径修订（v1.2 文档语义 vs 实现歧义坐实）**：原实现算的是"格内各进程总占用中主导者占比"（支配率，单进程恒 1.0 → 永远全圆），规格本意是"格的 10 分钟被占比例"（占用率）。v1.4 统一为占用率：<20% 不画、20–80% 斜半圆、≥80% 全圆；冲突格两进程均 ≥20% 时同一枚圆对角分半（主导右下、次者左上）取前二。阈值 token 改 0.2/0.8；`--grid-min-share` 在数据层（mock/Rust）镜像写死 0.2，渲染阈值仍走 token。
- **悬停浮窗口径**：显示进程名 + 该时间格内占用起止 + 时长，区间钳制在格窗内、开口段钳到当下；删断点行（历史日显示"现在"的栈顶属时间穿越）。`GridCell` 改每格 `marks[]`（≤2），mock 与 Rust 同口径重写（原 mock 取"当天第一段"、Rust 取"覆盖格的段区间"，两实现不一致的暗债一并清偿）。
- **进场锚点**：v1.1 的"锚日贴顶"改为"锚日大日期标底缘距窗口底 40px"（token `--day-enter-gap`）；底部垫高 240px → 同 token（旧垫高是贴顶阅读模型的遗产），末尾日单元去底边距——滚到尽头即今天的进场位置，一条规则管两头。进场公式由 `offsetTop` 差改 `getBoundingClientRect` 差（原公式带 81px 系统偏差）。
- **滚动条**：日视角隐藏（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}` 双保险，兼容老 WebView2）；导航路径=滚轮 + 月视角点日期直达 + 吸顶签回月。

### D45 · 产品更名 gika → Fermata（v1.0 更名批次）
- 全量改名：crate/bin/lib（gika/gika_lib → fermata/fermata_lib）、productName=Fermata、identifier=com.fermata.app、窗口标题、事件名 gika-idle → fermata-idle、拖拽 MIME text/gika-plan → text/fermata-plan、环境变量 GIKA_* → FERMATA_*（DB_PATH/IDLE_SECS/AS_OF；TIME_SCALE 同规则）、GikaEvent 类型 → FermataEvent、种子/mock 演示进程名、scripts 与活文档（AGENTS/CONTEXT/README/01–06）。
- **保留旧名的位置（刻意）**：docs/screenshots/ 下各阶段验收册与 poc-runtime.log（历史证据，记录的是当时真名）；deviation 历史条目；`F:/Code/20260917_gika` 目录本身；main.rs 迁移代码对旧路径的引用。（注：docs/gika.png、gika-day.png 两张历史参考图与 docs/reference/navigation.md 后在发布收口时按版权要求删除。）
- **数据迁移（启动时、DB 打开前）**：仅走默认路径时生效（FERMATA_DB_PATH 优先、兼容 GIKA_DB_PATH 兜底，env 覆盖不触发迁移）。旧 `%APPDATA%\com.gika.dev\gika.db` 存在且新 `com.fermata.app\fermata.db` 不存在 → 复制（不移动）gika.db 及 -wal/-shm 边车到 fermata.db，写 `[rename]` 日志；旧目录原样保留（回滚零成本）。
- **kernel.rs 日网格测试修复（顺带）**：主会话 v1.4 改 GridCell 为 marks[]（占用率取前二、对角分半）后测试未跟上；断言迁到 marks API（首枚=多数派、次席、空格 marks.is_empty），跨午夜用例锚到昨天——v1.4 的"占用止点钳到当下"会把锚在今天晚间的未来段钳没。
- docs/screenshots/v12/restpop-bottom-right-position.txt 是更名前抓的窗口枚举证据（标题行含 gika），作为当时证据保留。

### D46 · 导航命中区结构修复（fix/nav-hit-test）
排查起因：用户报"悬停不变手型 + 点击不稳定"。证据链：CDP 合成点击 20/20 正常；真实 OS 输入坐标映射精确（mousemove 所见即所得）但合成 click 被本机安全软件过滤（PoC 已留证），无法完全复现真人路径。两个结构性隐患按"宁可错杀"修复：①拖拽区与导航几何交叠（实测 23/141px）→ 拖拽区改绝对定位让出导航足印（144px 居中），零交叠断言入 check-nav-hitzone；②morph 动画中 tab 整体横向滑动，按下与抬起间按钮可能移出光标下 → 收进固定槽位（48px/槽），按钮绕槽心伸缩、中心全程不动（0/60/120/240ms 四帧采样零漂移）。另：input-probe（Rust，scripts/input-probe）为本机合成输入的可靠探针（DPI 感知 + SetCursorPos 读回验证）。
