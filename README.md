# Sayden 言港 · AI 英语口语陪练

**真实对话，先练一遍。**

你会说 “I have a reservation.” 可如果酒店前台回答「查不到你的预订」，下一句怎么接？

**Sayden 言港**是一款开源、本地优先的英语口语练习桌面应用。你可以在出发前演练酒店入住，在面试前接一通模拟招聘电话，或者练习怎样加入同事的闲聊。**41 节内置情景课都能离线跟练，无需 API Key。** 接入自己的 AI 模型后，就能用自己的话回答，也能为明天要面对的对话定制一节课。

**[查看 macOS / Windows 发布进度](https://github.com/ZXQ1227/language-lab/releases)** · **[体验源码版](#从源码运行)** · **[看看酒店入住课](https://github.com/ZXQ1227/language-lab/blob/main/docs/development/HOTEL_CHECKIN.md)**

正式安装包尚未发布。想在开放下载时收到提醒，可以在仓库右上角选择 **Watch → Custom → Releases**。

_Sayden is an open-source, local-first desktop app for English conversation practice on macOS and Windows. Rehearse travel, job interviews, and everyday conversations with 41 offline guided lessons, or connect an OpenAI-compatible model for open-ended roleplay and personalized lessons._

## 第一课可以这样练

打开 **首页 → 课程库 → 场景对话**，选择 **酒店入住（Hotel Check-in）**。这是一节约 20 分钟的 A2 英语课。你扮演住客，要在前台办好一件完整的事。

1. **先练顺利入住。** 报出预订姓名，确认住两晚，提出想要安静房间的请求。第一次卡住时，可以看示范回答，再试着自己说一遍。
2. **再试一次意外情况。** 选择「查不到预订」挑战。这次只重复姓名还不够，你要提供预订编号，请前台再查一次。另一条挑战是「今晚没有安静的房间」，你可以练习协商第二天换房。
3. **合上示范，看看自己记住了什么。** 试着凭记忆问清押金能否退还、早餐几点开始、最晚几点退房。写下答案后，再与示例对照。

## 你想为哪一次对话做准备？

内置课程覆盖 CEFR A2、B1 和 B2 三个等级。可以按难度筛选，也可以直接挑最近用得上的一课。[完整课程目录](https://github.com/ZXQ1227/language-lab/blob/main/content/starter-catalog.json)

| 学习路径   | 课数 | 可以提前练的事                                 |
| ---------- | ---: | ---------------------------------------------- |
| 旅行与住宿 |    9 | 在机场办理值机、到酒店入住、在咖啡店点单       |
| 求职与职场 |    9 | 接招聘初筛电话、参加英语面试、向经理汇报进度   |
| 留学与校园 |    6 | 在答疑时间向老师问清论文要求、加入课堂讨论     |
| 海外生活   |   10 | 在超市换货、看医生时描述症状、联系上门维修     |
| 日常社交   |    7 | 跟同事闲聊、礼貌婉拒邀约、和久未联系的朋友叙旧 |

## 离线能练什么？接入 AI 后能做什么？

**想马上开始，就选离线引导练习。** 41 节内置课都提供情景、目标和示例回答。你可以先熟悉对方可能怎么问，借助提示练习回应，再回到复习任务巩固表达。

**想练自己的说法，就接入 AI。** 在 **我的 → 设置** 保存兼容 OpenAI 接口的模型连接，即可在场景里自由作答。也可以从学习计划打开「自由对话」，和英语搭档 Zoi 聊一件自己的事，之后在「学习记忆」里重看这段交流。

**有一场具体的对话要准备，就让 AI 出题。** 在课程库选择「用 AI 设计课程」，写下「我想把周五的英语面试改到下周，并确认对方说的是哪个时区」。先预览角色、练习步骤和示例表达，合适就开始练。[AI 课程设计说明](https://github.com/ZXQ1227/language-lab/blob/main/docs/development/SCENARIO_COURSES.md#ai-designed-lessons)

## 可以用麦克风练吗？记录存在哪里？

可以打字，也可以在设置里单独配置语音识别。录完一句，先检查转写，再把回复发出去。要听对方怎么说，可以选择电脑上已安装的英语语音，或连接兼容的语音合成服务。[语音设置指南](https://github.com/ZXQ1227/language-lab/blob/main/docs/development/VOICE_LOOP.md)

课程进度、已保存的对话和复习记录保存在本机 SQLite 数据库，API 密钥保存在操作系统钥匙串。使用外部 AI 服务时，相关消息和所需的学习上下文会发给你配置的服务商；使用外部语音识别时，录音会发给所选识别服务。界面支持简体中文、繁体中文和英文。

## 从源码运行

想现在体验桌面版，可以在准备好 Git、Node.js、项目指定版本的 pnpm、稳定版 Rust 及系统对应的 Tauri 依赖后运行。[项目环境配置](https://github.com/ZXQ1227/language-lab/blob/main/package.json) · [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/ZXQ1227/language-lab.git
cd language-lab
pnpm install --frozen-lockfile
pnpm --filter @language-lab/desktop tauri dev
```

启动后，直接到 **首页 → 课程库 → 场景对话** 选一节内置课，就可以开始第一次引导练习。

Sayden 使用 Tauri 2、React、TypeScript、Rust 和 SQLite 构建，采用 MIT 许可证。[开发指南](https://github.com/ZXQ1227/language-lab/blob/main/docs/development/DEVELOPMENT.md) · [架构说明](https://github.com/ZXQ1227/language-lab/blob/main/docs/architecture/SYSTEM_ARCHITECTURE.md) · [贡献约定](https://github.com/ZXQ1227/language-lab/blob/main/AGENTS.md) · [许可证](https://github.com/ZXQ1227/language-lab/blob/main/LICENSE)
