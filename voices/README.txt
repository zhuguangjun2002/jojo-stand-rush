JOJO 奇妙格斗 · 可选语音包
============================

把你自己录制、请配音演员录制，或已获得授权的 .mp3 文件放进这个文件夹，
游戏会优先播放这些文件；缺失时自动回退到系统语音合成。

需要的文件名：

  jotaro_ora.mp3          ORA ORA ORA!
  dio_muda.mp3            MUDA MUDA MUDA!
  giorno_muda.mp3         MUDA MUDA!
  kakyoin_emerald.mp3     EMERALD SPLASH!
  jotaro_star_finger.mp3  STAR FINGER!
  dio_time_stop.mp3       ZA WARUDO! TIME STOP!
  dio_road_roller.mp3     ROAD ROLLER DA!
  jotaro_super.mp3        STAR PLATINUM: THE WORLD!
  giorno_super.mp3        GOLD EXPERIENCE!
  giorno_requiem.mp3      GOLD EXPERIENCE REQUIEM!
  kakyoin_super.mp3       EMERALD SPLASH!

  连打短句（自动循环到技能结束）：
  jotaro_ora_short.mp3
  dio_muda_short.mp3
  giorno_muda_short.mp3
  kakyoin_emerald_short.mp3
  josuke_bubble_short.mp3

  东方定助 / 软又湿：
  josuke_bubble_short.mp3  SOFT & WET!
  josuke_bubble.mp3        その力、奪わせてもらう。
  josuke_evolve.mp3        SOFT & WET: GO BEYOND!
  josuke_steal.mp3         いただき。
  josuke_super.mp3         SOFT & WET: GO BEYOND!
  josuke_finisher.mp3      泡沫は、すべてを奪う。

当前附带语音：
- 乔尼使用 johnny_intro / nail / barrage / evolve / super / herb / hurt / finisher.mp3，
  分别对应出场、爪弹、连打、进化、无限回转、药草、受击与终结。
  VOICEVOX 玄野武宏（ノーマル），台词与处理参数见 johnny-lines.json。
- 本目录下的 MP3 是用 VOICEVOX 合成的角色台词。
- 使用四个不同男声：青山龍星（承太郎 / 透龙）、玄野武宏（DIO / 东方定助）、
  白上虎太郎（乔鲁诺）、剣崎雌雄（花京院）。
- 透龙使用 `tooru_*.mp3`，东方定助使用 `josuke_*.mp3`。
- 不是原版声优；角色专属的 ORA / MUDA / 时停 / 压路机 / 绿宝石等台词都已生成。
- 长按 K 使用 *_short.mp3 短句循环，直到技能结束才停。
- 这些文件只在本地读取，Chrome 可直接播放，不需要系统语音。
- 署名和许可证见 VOICEVOX-CREDITS.txt。

建议：
- MP3，单声道或立体声，44.1kHz
- 1～2 秒短句，峰值不要削波
- 不要放入未经授权的动画原声或声优片段
- 只放你有权使用的录音

游戏通过相对路径读取 voices/*.mp3，因此用本地服务器或直接打开 index.html 都可以。
