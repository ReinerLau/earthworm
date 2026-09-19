# 课程包以本地 IndexedDB 为唯一业务数据源

## 状态

已接受

## 决策

Earthworm 的课程内容和学习进度以浏览器 IndexedDB 为唯一业务数据源。Skill 输出版本化的 `CoursePackage V1` 文件，桌面端和手机端都通过同一个 parser 校验后写入本地课程仓储。

二维码只携带 WebRTC 配对信息。课程包正文通过现有 Cloudflare Signal Worker 建立的 WebRTC DataChannel 传输。Signal Worker 不保存课程、账号或学习进度，因此它属于设备同步基础设施，不属于业务后端。

课程包使用稳定的包、课程和题目 ID，以及内容 hash。重新导入相同 ID 的新版本时，未变化课程保留学习进度，内容变化的课程重置进度。

## 不在本决策范围内

- 登录和用户系统
- PostgreSQL 或其他业务数据库
- 云端学习历史、排行榜和课程 API
- Animated QR 或其他光学课程正文传输协议
