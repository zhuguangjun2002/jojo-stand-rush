# HANDOVER · JOJO 奇妙格斗 · STAND RUSH

最后更新：2026-11-16  
源码：<https://github.com/zhuguangjun2002/jojo-stand-rush>  
在线试玩：<https://jojo.bigcow.net/>（Cloudflare Pages + Workers 在线联机）

## 1. 项目概览

这是一个无需构建、打开即玩的横版 2D 网页格斗游戏。角色、替身、舞台、HUD 和特效都由 Canvas 程序化绘制；语音使用预生成的 VOICEVOX 日语 MP3；BGM 和战斗音效由 Web Audio 实时合成。

当前包含 **6 名角色**：

| 角色 | 替身 | 核心玩法 |
| --- | --- | --- |
| 空条承太郎 | 白金之星 | 近身连打、流星刺指、时间停止 |
| DIO | 世界 | 时停、绕后、压路机终结 |
| 乔鲁诺·乔巴纳 | 黄金体验 | 青蛙 / 生命之树、低体力镇魂曲 |
| 花京院典明 | 法皇之绿 | 绿宝石连射、远程压制 |
| 透龙 | 奇迹与你 | 灾厄、石头、指令投、灾厄领域 |
| 东方定助 | 软又湿 / 软又湿·超越 | 泡泡夺属性、受击蓄特殊能量、150 能量进化 |

## 2. 快速启动

```bash
cd jojo-stand-rush   # 仓库根目录
./run.sh
# 默认打开 http://127.0.0.1:8080/
```

其他启动方式：

```bash
make run
PORT=9000 ./run.sh
HOST=0.0.0.0 PORT=8080 ./run.sh
```

也可以直接用浏览器打开 `index.html`，但联机对战和部分浏览器音频策略建议使用 `server.py` / `run.sh`。

## 3. 联机架构

- **在线版**：`https://jojo.bigcow.net/` 由 Cloudflare Pages 托管；浏览器连接 `wss://ws.jojo.bigcow.net/__ws`，由 `worker/` 中的 Cloudflare Worker + Durable Object 按房间码转发消息。
- **本地局域网**：`./run.sh` 启动 `server.py`，浏览器优先使用同源 `/__ws`；只有静态页面才回退到在线中继。
- **协议**：与 `server.py` 一致，包含 `choice` / `peer-choice` / `start` / `rematch` / `input` / `frame` / `leave`；在线版额外支持 `ping` / `pong` / `latency` / `resume`。Durable Object 只做输入配对，不运行战斗逻辑。
- **房间**：一个 4 位房间码对应一个 Durable Object；房主先创建，guest 再加入。双方每帧交换输入后锁步推进。
- **延迟**：客户端每 2 秒 ping 中继，取最近 5 次 RTT 的中位数；开局/再战时按 `max(本地 RTT, 对方 RTT)` 自动选择 6–24 帧输入延迟（约 RTT + 3 帧）。HUD 和联机面板显示实测延迟与当前输入延迟。
- **掉线重连**：WebSocket 断开后客户端冻结画面并按 0.5–5 秒退避重连同一房间/角色；Durable Object 保留 30 秒宽限期和最近 1200 个已配对帧（约 20 秒），重连方发送 `resume(frame)` 后补齐漏掉的帧。超过宽限期或历史不足会提示重新建房。刷新页面/关闭标签页无法恢复对局。
- **配置**：`js/config.js` 的 `onlineWs` 是静态部署使用的中继地址；`onlineInputDelay` 是测速完成前的初始延迟；设为空字符串可关闭在线联机。
- **部署**：GitHub Actions 在 `main` 更新后同时发布 Pages 和 Worker。

## 4. 东方定助最终机制

- `H`（20 SP）：**夺走之泡**。缓慢泡泡命中未防御目标后，随机偷取力量、速度、防御或 SP，持续 8 秒；进化后持续 10 秒。
- `L`（0 SP）：**泡沫弹**。普通远程泡泡，28 伤害、可防御、不偷取属性。拥有 3 发弹药，3 发后进入 4 秒冷却，冷却结束自动补满。
- **特殊能量（0–50）**：
  - 东方定助**被命中**时 +2。
  - 所有普通 SP 获取的 **50%（向下取整）** 也会转化为特殊能量；普通攻击 / 技能仍然正常获得普通 SP。
  - 例：轻击 5 → 特殊 +2；重击 8 → 特殊 +4；夺走 20 SP → 特殊 +10。
  - HUD 在主 SP 条右侧显示独立的 50 点特殊能量条；进化后该条隐藏。
- `U`：普通 SP **100** + 特殊能量 **50**（总计 150）时，按 U 消耗全部能量进化为**软又湿·超越**。
  - 进化持续整场对战，跨回合保留。
  - 进化后 `L` 变为 40 SP 的高速、不可防御超越泡泡（74 伤害、破防）。
  - 进化后 `U` 恢复为 100 SP 的**穿透爆裂泡泡**：向前射出必杀泡泡，命中后穿过对手身体，随后对手爆开，造成 320 伤害；同时夺取目标全部可偷取属性 6 秒，并封印奇迹与你的石头 / 枯木虫 6 秒。
- 进化后的所有攻击不会触发奇迹与你的灾厄姿态反击，也不会触发「灾厄的恶」领域的概率反击。

相关文件：

- 数据：`js/data.js` 中的 `josuke`
- 状态机：`js/game/fighter.js`
- 泡泡 / 特殊能量 / 进化：`js/game/match.js`
- HUD 特殊条：`index.html`、`styles.css`、`js/game/core.js`
- 立绘 / 替身：`js/art.js`
- 终结图：`assets/finishers/josuke.jpg`
- 语音：`voices/josuke_*.mp3`

## 5. 奇迹与你当前平衡

- `J` 拐杖攻击距离缩短（`reachBonus: -14`），不再拥有常规 J 的攻击距离。
- `K` 石头：
  - 3 发资源，第 3 发后进入 5 秒冷却，冷却结束恢复 3 发。
  - 冷却期间短 K 变为距离更短的拐击（动作同 J）。
  - 长按 K 仍然升级为前冲抓取。
  - 空中 K 同样消耗石头；冷却中改为空中拐击。
  - 射程 500px，命中检测半径 38，跳出击中触发距离 95。
  - 命中僵直 `0.55 × 0.8 = 0.44 秒`。
  - 命中回复 **15 SP**，5 秒内 5 次命中仍触发 120 伤害爆炸。
- 奇迹与你造成的所有命中僵直、灾厄姿态反击僵直、五连爆炸僵直、追击之雨冻结时间统一乘 **0.8**。
- 石头和枯木虫都是贴地判定，跳跃可以躲开；两者只朝施放方向直线移动，不会转向。
- 被东方定助的 U 命中后，石头与枯木虫能力封印 6 秒；长按 K 的前冲抓取不受影响。
- `U` 灾厄的恶：
  - 随机掉落物触发概率 **40%**。
  - 掉落物伤害 **40**。
  - 不打断对手动作，不造成僵直 / 击退 / 浮空。
  - 浮现文字只显示「灾厄」，不再显示「无僵直」。
  - 短按 H 的灾厄姿态反击不受此削弱：仍是 88 伤害 + 0.92 秒僵直（1.15 × 0.8）。

相关文件：`js/data.js`（`tooru`）、`js/game/fighter.js`、`js/game/match.js`。

## 6. 操作

> 普通攻击命中不会让对手横向后退，J → K 等轻 / 重衔接可以稳定连上；必杀、投技和飞行物仍保留击退。

| 动作 | P1 | P2 |
| --- | --- | --- |
| 移动 | `A` / `D` | `←` / `→` |
| 跳跃 | `Space` / `↑` | `↑` |
| 防御 / 下蹲 | `S` / `↓` | `↓` |
| 轻攻击 | `J` | `1` |
| 重攻击 | `K` | `2` |
| 二技能 | `L` | `3` |
| 追击技 | `H` | `5` |
| 超必杀 / 定助进化 | `U` | `4` / 小键盘 `0` |
| 闪避 / 受击脱离 | `F` | 右 `Shift` |

> 受击脱离消耗 25 SP，只让自身获得 **1 秒无敌**；无敌期间角色略微半透明，冷却 10 秒。脱身不会推开、打断或眩晕对手。奇迹与你的受击脱离是向后瞬移约 200px，不再出现在对手身后。
| 暂停 | `Esc` | — |
| 静音 | `M` | — |

手机端使用虚拟轮盘与右侧 `轻 重 技 追 闪 极`。标题页和按键设置页都可以进入触屏布局编辑。

## 7. 代码结构

```text
index.html          页面与 UI（HUD、触屏轮盘、按键设置、特殊能量条）
styles.css          标题、选人、HUD、结算、触屏控件与响应式样式
js/data.js          角色、招式、舞台、难度数据
js/audio.js         合成音效、BGM、VOICEVOX 语音播放
js/art.js           舞台、角色、替身、拳位、肖像、终结图
js/game/core.js     常量、DOM、输入映射、HUD、AI、界面切换
js/game/fighter.js  角色状态机：移动、出招、受击、特殊能量、进化
js/game/match.js    回合、镜头、判定、飞行物、泡泡、灾厄、对拳
js/game/supers.js   超必杀、终结演出等绘制覆盖层
js/game/render.js   按界面分发渲染
js/game/main.js     键盘 / 触屏输入、布局、主循环
js/net.js           联机房间客户端与锁步输入
js/config.js        静态部署使用的在线中继地址
worker/             Cloudflare Worker + Durable Object 在线房间中继
assets/finishers/   终结演出图
voices/             VOICEVOX 语音与署名
server.py           本地静态服务器、局域网房间与 WebSocket 中继
HANDOVER.md         本文件
TESTING.md          自动化测试说明
.github/workflows/deploy-cloudflare.yml  推送到 main 后自动发布 Pages 与 Worker
```

## 8. 测试与验证

提交前使用过：

```bash
for f in js/data.js js/art.js js/audio.js js/game/fighter.js \
         js/game/match.js js/game/core.js js/game/main.js js/game/supers.js; do
  node --check "$f" || exit 1
done
git diff --check

cd ~/webgame-test && npx playwright test
```

当前 Playwright smoke：

```text
4 passed (desktop / mobile)
```

本次交接前额外验证过：

- 东方定助 3 发泡沫弹 → 4 秒冷却
- 特殊能量：被命中 +2；普通 SP 获取的 50%（向下取整）也会转化（轻击 5 → +2，重击 8 → +4，夺 SP 20 → +10）
- 100 SP + 49 特殊能量无法进化；50 特殊能量可以进化
- 进化动画结束、HUD 替身名 / 头像切换
- 进化后 L 为 40 SP 超越泡泡，U 为 100 SP 超必杀
- 奇迹与你 3 发石头 / 5 秒冷却 / 短 K 拐击
- 灾厄的恶 40% 概率、40 伤害、不打断动作
- 东方定助 Go Beyond 攻击不触发奇迹与你灾厄
- 受击脱身向后瞬移约 200px（不再出现在对手身后），1 秒无敌 + 半透明
- 脱身不改变对手位置、状态或连段；只让自身进入 1 秒无敌
- 普通攻击命中不横向推开对手，J → K 连段稳定
- 奇迹与你石头 / 枯木虫贴地，跳跃可以躲开
- 软又湿·超越 U 命中后穿透并爆开，造成 320 伤害；夺取全属性 6 秒；奇迹与你石头 / 枯木虫封印 6 秒

## 9. 已知限制 / 坑

- 参考视频是实质单声道，角色语音和 BGM 无法真正完全分离；透龙语音是按角色自我介绍段做音高匹配的近似。
- VOICEVOX 语音通过 tts.quest 预先合成；若替换语音，保持文件名和相对路径不变。
- `voices/josuke_fruit.mp3` 已随果实机制移除；不要再把果实逻辑加回来。
- 东方定助的特殊能量来源：受击 +2，以及普通 SP 获取的 50%（向下取整）。相关逻辑在 `Fighter.gainSpecialOnHit()` 与 `Fighter.gainSpecialFromEnergy()`。
- 网络联机使用共享 RNG；新加影响玩法的随机必须走 `match.rand()`，纯视觉随机才用 `Math.random()`。
- `specialMeter` 每回合重置；`goBeyond` 跨回合保留。
- HUD 特殊条只在东方定助未进化时显示。
- 奇迹与你所有僵直缩放在 `js/game/match.js` 的 `TOORU_STUN_SCALE = 0.8`；直接改单招 hitstun 时注意别重复缩放。
- 终结图 `josuke.jpg` 是用户提供的参考图，仅用于非商业同人演示；公开部署前请确认素材授权。
- 在线联机依赖 Cloudflare Worker + Durable Object（`jojo-stand-rush-ws` / `ws.jojo.bigcow.net`）；`server.py` 只负责本地局域网，不会在 Pages 上运行。
- `js/game/core.js` 的 `Server.probe()` 会探测 `/__net/info`：本地服务器优先走同源 `/__ws`，静态页面回退到 `js/config.js` 的在线中继，并停止无用的 `/__heartbeat` 请求。
- 在线联机是锁步中继，开局前按实测 RTT 自动选择 6–24 帧输入延迟；局域网模式使用 0 帧延迟。网络中断会自动重连 30 秒，但页面刷新/关闭标签页不能恢复；动态延迟只在开局/再战时重算，战斗中不会实时调整。房间码为 4 位，公开推广前建议改成 6 位并加限流。
- 线上版地址 <https://jojo.bigcow.net/>，构建时不复制 `server.py`、`worker/`、`.bat`、文档和 Git 元数据；Worker 由独立步骤发布。

## 10. 交接检查清单

- [ ] `git status` 干净，最新提交为本次交接提交
- [ ] `node --check` 通过
- [ ] `git diff --check` 通过
- [ ] Playwright smoke 4/4 通过
- [ ] 在线联机：两个独立浏览器创建 / 加入房间，双方选角后能进入战斗并交换输入帧
- [ ] 本地 `./run.sh` 仍走同源 `/__ws`，没有被在线中继覆盖
- [ ] 东方定助：H 偷属性、L 3 发泡沫弹、受击 +2 特殊、普通 SP 获取的 50% 转化特殊、U 150 能量进化
- [ ] 东方定助进化后：L 40 SP 超越泡泡、U 100 SP 超必杀、无视奇迹与你灾厄
- [ ] 奇迹与你：3 发石头 / 5 秒冷却 / 短 K 拐击 / 射程 500 / 命中 +15 SP
- [ ] 奇迹与你：灾厄的恶 40% 概率、40 伤害、不打断动作
- [ ] 手机 HUD 特殊条没有溢出，触屏按键仍可正常编辑

## 11. 下一步建议

1. 用实际对战数据继续调东方定助：特殊能量（受击 +2 + 普通 SP 50%）是否过快、150 能量进化是否太慢。
2. 观察奇迹与你 3 发石头 + 5 秒冷却后的压制力，必要时调 4/5 秒冷却或第 3 发伤害。
3. 如果需要，补一个仓库内的 `tests/` 目录，把本次交接用的东方定助 / 奇迹与你 headless 断言固化成正式测试。
4. 继续补充 VOICEVOX 语音时，同步更新 `voices/README.txt` 和 `voices/VOICEVOX-CREDITS.txt`。
