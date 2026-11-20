# 测试说明

> 早期测试环境是 Windows + WSL2 下的独立目录 `~/webgame-test`。当前维护环境为 Linux Mint；下面的 WSLg 规则只在回到 WSL 时适用。

早期整站 smoke 测试位于外部目录 `~/webgame-test`（Playwright + Chrome for Testing），该路径在当前机器上不存在。当前仓库已包含 `tests/johnny.cjs`，覆盖乔尼及其对其他角色的回归；具体安装和运行方式见下方「乔尼回归」。旧版整站、在线双人和掉线重连检查仍按下文单独执行。

## 快速开始

```bash
cd ~/webgame-test
npx playwright test                    # 默认：desktop + mobile，headless，不弹窗
npx playwright test --project=desktop
npx playwright test --project=mobile
npx playwright show-report
```

## 在线联机 smoke

先运行无依赖的网络回归：

```bash
node tests/net.cjs
```

该脚本在虚拟时钟下运行实际 `js/net.js` 与 `worker/src/index.mjs` 的 Room，覆盖 20–400ms RTT、双方不对称链路、轻度抖动、30/60/144Hz 回调、战中缓冲升降、断线历史补帧、发送失败与重置。检查模拟按 60Hz 推进、双方同一帧的输入历史一致、断线期间冻结且恢复不快进。它不替代真实校园网、浏览器渲染性能或 Cloudflare 位置的验收。

浏览器集成回归（需要 `playwright-core` 和对应 Chromium）：先运行 `python3 server.py --host 127.0.0.1 --port 8081 --no-autoclose`，再执行 `NODE_PATH=<Playwright 所在 node_modules> node tests/net-browser.cjs`。脚本使用两个独立的无窗口浏览器进程，通过虚拟 WebSocket 调用实际 Room，双向各注入 100ms 延迟，验证真实主循环、选角、移动/攻击、同帧角色状态一致和诊断 HUD。不会连接线上房间。可用 `GAME_URL` 指向其他本地页面端口；截图保存到 `/tmp/jojo-net-diagnostics.png`。

2026-11-20 验证：网络虚拟时钟回归全部通过，20–400ms 稳定 RTT 下，启动缓冲后模拟保持约 60Hz；双浏览器 200ms 延迟测试通过，同帧角色状态一致，采样窗口模拟约 58–60 FPS、等待占比 0%。既有 `tests/johnny.cjs` 的 64 项检查和手机药草触控检查通过。尚未在学生真实校园网下验证，也未发布本次修改到 Cloudflare。

用两个独立浏览器窗口或两个浏览器进程（不要用同一个浏览器里的两个标签页；后台页会被浏览器暂停 rAF，测试会误判为卡顿）：

1. 两个页面都打开 `https://jojo.bigcow.net/`。
2. A 点「联机对战」→「创建房间」，等待 4 位房间码出现。
3. B 点「联机对战」→ 输入房间码 →「加入」。
4. 双方应进入选人界面；各自选角后自动进入战斗。
5. 双方各按方向键 / 攻击键，确认两边画面和输入帧都在推进。
6. 战斗中确认 HUD 显示延迟、输入延迟、模拟 FPS 和等待百分比；开局缓冲结束后，正常设备上模拟应约为 60 FPS。联机面板同时显示双方延迟；控制台 `JSON.stringify(JG.Net.latencyInfo())` 可复制诊断数据。
7. 模拟高延迟：在房主控制台执行 `JG.Net.rtt = 600; JG.Net.peerRtt = 600; JG.Net.lastDelayChange = 0; JG.Net.maybeAdjustDelay()`，双方输入延迟应上调并继续推进；再模拟低延迟并等待稳定后应降回。
8. 在浏览器 DevTools 里执行 `JG.Net.ws.close()` 模拟掉线：
   - 双方画面冻结，A 显示「对手连接中断，等待重连…」
   - B 显示「连接中断，正在重连…」
   - 约 1 秒内自动重连，双方从同一帧继续，位置/血量一致
9. 两边同时执行 `JG.Net.ws.close()`，确认双方都能重新连接同一房间。
10. 关闭 B 并等待 30 秒，A 应收到「对手已离开」；返回标题后重新创建房间应正常。
11. 刷新页面不会恢复当前对局，这是预期行为。

本地回归用 `./run.sh` 打开 `http://127.0.0.1:8080/`，同样流程应走同源 `/__ws`，不经过 Cloudflare。

## 手机端手动回归

自动化 smoke 测试之外，触屏改动至少手动过一遍下面这些：

1. **Chrome / Edge 设备模拟**：按 `F12` → `Ctrl+Shift+M`，选 Pixel / iPhone，切横屏，然后**刷新页面**让触屏检测重新执行。
2. 常用尺寸：`915×412`、`844×390`、`568×320`；竖屏用 `412×915` 检查旋转提示。
3. 检查舞台完整居中，`#touch-controls` 不超出视口，轮盘和攻击键不重叠。
4. 宽度 ≥ `800px` 的横屏中，暂停键应位于屏幕水平中心；更窄时为避免和攻击键重叠会略偏左。
5. 左下虚拟轮盘：
   - 左/右拖动分别触发 `KeyA` / `KeyD`
   - 上拉触发 `Space`（跳跃）
   - 下拉触发 `KeyS`（防御）
   - 斜下拉同时触发移动 + 防御
   - 松手后轮盘回中，所有方向输入释放
6. 左手推住轮盘，右手同时按攻击键，确认多指输入互不干扰。
7. 点底部 `Ⅱ` 暂停，确认暂停菜单出现、触屏控件隐藏；恢复后控件重新出现。
8. **自定义按键**：暂停 →「自定义按键」，或点底部 `⚙`，拖动轮盘和攻击键：
   - 编辑期间控件只响应拖拽，不能出招
   - 点选按键后出现尺寸滑杆和 `−` / `+`，可在 70%–160% 间调整
   - 缩放后的轮盘仍能跟手，缩放后的攻击键仍能拖动并保留大小
   - 松开 / 点「完成」后自动保存，继续战斗后位置和大小保留；刷新页面后仍然保留
   - 点「重置」恢复默认位置与大小，`localStorage` 中的 `jojo-touch-layout` 清除
   - 旋转 / 全屏 / 改窗口尺寸后控件仍在可视区内
9. 真机再用手机浏览器横屏走一遍人机对战，重点看刘海 / 底部安全区、按钮尺寸和轮盘手感。

## 角色机制手动回归

### 东方定助

1. `H` 泡泡命中未防御目标后随机偷取力量 / 速度 / 防御 / SP，持续 8 秒。
2. `L` 泡沫弹：3 发弹药，3 发后进入 4 秒冷却；普通泡泡不偷属性。
3. 特殊能量：被命中 +2；普通 SP 获取的 50%（向下取整）也会转化过来（轻击 5 → +2，重击 8 → +4，夺 SP 20 → +10）。普通攻击仍然正常增加普通 SP。
4. 普通 SP 100 + 特殊能量 50 时按 `U` 进化；进化后 `L` 为 40 SP 超越泡泡，`U` 为 100 SP 穿透爆裂泡泡。
5. 超越泡泡命中后夺取目标全部可偷取属性 6 秒；对奇迹与你额外封印石头 / 枯木虫 6 秒。
6. 进化后攻击奇迹与你，不会触发灾厄姿态反击或灾厄领域概率反击。

### 普通攻击连段

1. 普通攻击（J / K / 挑空 / 冲刺攻击 / 空中攻击）命中后，对手不应横向后退。
2. J 命中后按 K，应能稳定接上；承太郎、DIO、乔鲁诺、花京院、东方定助都要检查。
3. 必杀、投技和飞行物仍保留击退。

### 受击脱离

1. 连段中按 `F` 消耗 25 SP 脱离连段。
2. 脱身后只有 **1 秒无敌**，角色在此期间略微半透明。
3. 无敌结束后可以正常被命中；冷却仍为 10 秒。
4. 脱身不会推开、打断或眩晕对手；对手的位置、状态和连段不应被改变。
5. 奇迹与你受击脱身应向后瞬移，不再出现在对手身后。

### 奇迹与你

1. `K` 有 3 发石头，第 3 发后进入 5 秒冷却；冷却期间短 K 为短距离拐击，长按仍可抓取。
2. J 拐杖攻击距离明显短于常规 J；所有命中僵直与追击之雨冻结时间按 0.8 倍。
3. 石头命中回复 15 SP，5 秒内 5 次命中触发 120 伤害爆炸。
4. 「灾厄的恶」掉落物触发概率 40%、40 伤害、不打断动作；浮现文字只显示「灾厄」。
5. 石头和枯木虫贴地，跳跃可以躲开；两者只朝施放方向直线移动，不会转向。

## 硬性规则

1. **默认只跑 headless**；不要在 WSLg 里跑 headed / D3D12 GPU 测试。
2. 不要运行 `npm run test:gpu` / `GPU_HEADED=1 ...`，也不要用带
   `--use-gl=angle` + `GALLIUM_DRIVER=d3d12` 的 Chrome。这条路径已实测导致过
   Windows `VIDEO_TDR_ERROR (0x116)` 黑屏/重启。
3. 真 GPU、FPS、卡顿、发热、真实 WebGL/WebGPU 测试，去 **Windows 侧 Chrome** 做。
4. 跑测试前先自检：

   ```bash
   echo "GPU_HEADED=${GPU_HEADED:-<empty>}"   # 必须为空
   npx playwright test --list                 # 只应出现 desktop / mobile
   ```

> 2026-11-04 的详细事故时间线、证据和修复记录见测试环境文档的
> 「事故记录：WSLg 下 GPU 测试导致黑屏」一节。

游戏本身的启动方式见 [README.md](README.md)。


## 乔尼回归

该脚本直接使用 Node.js、`playwright-core` 与 Chromium，不依赖 Playwright Test runner。可将依赖装在独立目录，避免在游戏仓库创建包管理文件：

```bash
mkdir -p /tmp/jojo-browser-tests
npm install --prefix /tmp/jojo-browser-tests playwright-core
/tmp/jojo-browser-tests/node_modules/.bin/playwright-core install chromium
```

本地启动静态服务后执行：

```bash
python3 -m http.server 8081
# 另一终端；若 Playwright 在外部目录，设置 NODE_PATH 指向其 node_modules
NODE_PATH=/tmp/jojo-browser-tests/node_modules node tests/johnny.cjs
# 可通过 GAME_URL 指向其他本地端口
```

覆盖 ACT1 无限免费射击、马前后冲刺 / 受击脱身、首次遗体自动进化、L 上下马、下马不可移动与伤害增益、骑马/下马正常受击僵直和防御、防御动作锁定、三秒上马疾驰、十发独立五秒冷却、药草及 P2 / 手机输入、ACT2 普通 / 强射、ACT3 蓝色回旋与双孔能力、ACT4 第二回合进化 / 连打 / 骑马 100 SP 无限回转。无限回转覆盖下马与僵直禁用、满血扣除最大生命值 70%、命中前不足最大生命值 20% 斩杀、非致死命中不触发 KO、时停中行动与射击、打断必杀演出。另含 P1 蓝/P2 红光圈、隐藏角色不显示圈、八句独立语音及节流/静音、八个 MP3 的实际浏览器解码、跨回合/训练场重置、双乔尼固定种子 360 帧同步。截图输出到 `/tmp/jojo-johnny-battle.png`、`/tmp/jojo-johnny-roster.png`、`/tmp/jojo-johnny-infinite.png` 和 `/tmp/jojo-johnny-mobile.png`。无限回转截图用于查看旋转切片退场，脚本会临时隐藏终结图片覆盖层。

### 2026-11-20 乔尼调整验证

- **86 项浏览器检查通过**，手机药草触控检查通过；八句新增本地日语语音均能加载和解码，时长约 1.02–2.55 秒。
- 骑马/下马防御姿势、蓝/红脚下光圈截图检查通过；原有六名角色的必杀/绘制回归通过。
- `tests/net.cjs` 和 `tests/net-browser.cjs` 通过；双浏览器 200ms 注入延迟下同帧状态一致，稳定采样约 60 模拟 FPS、等待占比 0%。
- 以上为本地回归结果；线上部署由推送 `main` 后的 Cloudflare 工作流执行。

### 2026-11-19 验证记录

- `node --check`：已修改 JavaScript 文件通过语法检查；`git diff --check` 通过。
- `tests/johnny.cjs`：**64 项检查通过**，另有 **手机药草按钮真实触控通过**。包含六名既有角色的必杀 / 绘制回归和固定种子双模拟 360 帧一致性；这不是两台真实在线客户端的联机验收。
- 终结参考图 006：`assets/finishers/johnny.jpg` 返回成功，浏览器图片解码正常；实际触发乔尼无限回转 KO 后确认终结图加载、完整构图与台词绘制，无页面异常。预览截图为 `/tmp/jojo-johnny-finisher-006.png`。
- 本次未重新执行旧版外部整站 smoke、跨网双客户端对战或断线重连验收。
