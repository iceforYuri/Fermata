# Fermata

把一天排成一页版面。

并行工作的挂起、恢复与度量——给全天与 AI 协作、频繁切换、容易忘记"上一件做到哪"的人。

![Fermata 进程页](docs/screenshots/release/readme-board.png)

## 它在解决什么

切走容易，回来难。Fermata 的内核是一台任务调度器：进程状态机、断点、计时、休止符。报纸式排版只是它的呈现。

- **进程，不是任务**——一天的事情排在一页版面上；折线之上，只放一件正在做的
- **断点，不是备注**——切走时留一句话，往步骤栈顶压一条；回来，从断点继续
- **休止符**——时间片走满，或连轴 90 分钟，右下角弹一张不抢焦点的暖卡。无超时，不催促，恢复永远由你显式开始
- **时间格**——一天画成 18×6 的圆点网格（06–24 时，每格 10 分钟）。空隙本身，也是数据

![日网格](docs/screenshots/release/readme-daygrid.png)

## 触点

- `Alt+Q` 唤出切换浮层——进程版 Alt+Tab：过滤与新建二合一、断点内嵌、数字键直选
- 休止符弹窗停在主屏右下角，实心暖卡、鼠标可点、绝不抢你的输入焦点
- 主窗默认不置顶——它是"回来看版面"的地方，不挡你干活

![暗 · 工作台](docs/screenshots/release/board-rich-dark.png)

亮 · 淡暖 / 暗 · 工作台，两套主题。

## 安装

| 形态 | 位置（构建产物，不入库，`pnpm tauri build` 随时可再生成） |
| --- | --- |
| 安装包（推荐） | `publish/Fermata-1.0.0-setup.exe` |
| 绿色单文件 | `publish/Fermata-1.0.0-portable.exe` |

要求 Windows 10/11（WebView2 随系统自带；安装包内含引导）。首次启动即是一张空版面——没有演示数据，你的数据从第一行事件起就属于你。

从 gika 时代升级：旧库 `%APPDATA%/com.gika.dev/gika.db` 首启时自动复制迁移，原目录原样保留。

## 数据

local-first。SQLite 存在本机 `%APPDATA%/com.fermata.app/fermata.db`；事件日志 append-only，可导出 JSON。没有账号，没有云，没有遥测。

## 开发

```bash
pnpm install
pnpm tauri dev
```

演示数据：`pnpm seed`（一周）/ `pnpm seed:deep`（+120 天），用 `FERMATA_DB_PATH` 指定库文件。
打包：`pnpm tauri build`，产物在 `src-tauri/target/release/`。
验证：`cargo test` + `node scripts/verify-m1|m2|m3|m4`，发布验收总表见 [docs/screenshots/release/checklist.md](docs/screenshots/release/checklist.md)。

结构地图：`src/`（api 薄封装 · pages · store · styles/tokens）｜`src-tauri/`（db 数据内核 · commands · sys 六原语）｜`docs/`（设计合同 01–04 · ADR · 验收证据）。
分支模型：`dev` 开发主线 / `main` 发布分支 / `feature/*` 功能分支。
词汇与纪律：[CONTEXT.md](CONTEXT.md) 与 [AGENTS.md](AGENTS.md)。

## 许可与致谢

界面字体 MiSans（小米，免费商用，子集内嵌），许可见 [src/assets/fonts/MiSans-LICENSE.txt](src/assets/fonts/MiSans-LICENSE.txt)。
