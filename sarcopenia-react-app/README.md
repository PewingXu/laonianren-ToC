# 肌少症/老年人评估及监测系统

> Sarcopenia Assessment and Monitoring System for Older Adults

## 技术架构

### 前端
- **React** ^18.1.0 - UI 框架（JSX 格式）
- **ECharts** ^5.6.0 - 数据可视化图表
- **Three.js** ^0.177.0 - 3D 模型渲染
- **TailwindCSS** ^3.4.0 - CSS 框架
- **Vite** ^5.0.0 - 构建工具
- **React Router** ^6.20.0 - 路由管理

### 后端
- **Express** ^4.18.2 - HTTP 服务器
- **ws** ^8.16.0 - WebSocket 实时通信
- **serialport** - 串口通信（Mac Mini 设备连接）
- **child_process** - 调用 Python 算法包

## 项目结构

```
sarcopenia-react-app/
├── server/                          # 后端服务
│   └── index.js                     # Express + WebSocket + 串口通信
├── src/                             # 前端源码
│   ├── main.jsx                     # 入口文件
│   ├── App.jsx                      # 路由配置
│   ├── index.css                    # 全局样式
│   ├── contexts/
│   │   ├── AssessmentContext.jsx     # 全局评估状态管理
│   │   └── ThemeContext.jsx         # 主题上下文
│   ├── hooks/
│   │   ├── useWebSocket.js          # WebSocket 连接 Hook
│   │   └── useDevice.js            # 设备连接 Hook
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.jsx           # 顶部导航栏
│   │   │   ├── DeviceConnector.jsx  # 设备连接组件
│   │   │   └── PatientInfoDialog.jsx # 患者信息输入弹窗
│   │   ├── charts/
│   │   │   └── PressureChart.jsx    # ECharts 图表组件
│   │   ├── three/
│   │   │   ├── HandModel.jsx        # 3D 手部模型（握力评估）
│   │   │   ├── HumanModel.jsx       # 3D 人体模型（起坐/步态）
│   │   │   └── FootModel.jsx        # 3D 足部模型（站立评估）
│   │   ├── report/
│   │   │   └── ReportViewer.jsx     # 报告查看器（PDF+视频）
│   │   └── ui/
│   │       ├── Button.jsx
│   │       ├── Card.jsx
│   │       ├── Dialog.jsx
│   │       ├── Input.jsx
│   │       ├── Select.jsx
│   │       └── Toast.jsx
│   └── pages/
│       ├── Login.jsx                # 登录页
│       ├── Dashboard.jsx            # 仪表盘（四步评估引导）
│       ├── AssessmentHistory.jsx    # 历史记录
│       ├── NotFound.jsx             # 404 页面
│       └── assessment/
│           ├── GripAssessment.jsx       # 握力评估（左右手分别采集）
│           ├── SitStandAssessment.jsx   # 起坐能力评估
│           ├── StandingAssessment.jsx   # 静态站立评估
│           └── GaitAssessment.jsx       # 行走步态评估
├── public/
│   └── assets/
│       ├── static_report.pdf        # 静态报告样例
│       └── dynamic_report.mp4       # 动态报告视频
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## 功能模块

### 1. 登录页
- 输入密钥验证
- 输入机构名称（非必填）

### 2. 仪表盘
- 四个评估模块卡片展示
- 评估完成状态追踪
- 自动激活下一步评估

### 3. 握力评估（第一步）
- **设备连接**：连接握力传感器手套 / 模拟模式
- **左手采集**：实时压力数据、3D 手部模型、ECharts 图表
- **右手采集**：自动切换，独立数据面板
- **报告生成**：静态 PDF 报告 + 动态视频报告

### 4. 起坐能力评估（第二步）
- 设备连接 → 数据采集 → 报告生成
- 3D 人体模型动画展示

### 5. 静态站立评估（第三步）
- 设备连接 → 数据采集 → 报告生成
- 3D 足部模型 + 压力分布

### 6. 行走步态评估（第四步）
- 设备连接 → 数据采集 → 报告生成
- 3D 行走动画展示

### 7. 历史记录
- 按日期/姓名搜索
- 查看四类评估报告
- 分页展示

## 软件流程

```
启动 → 登录 → 仪表盘 → 握力评估 → 起坐评估 → 站立评估 → 步态评估
                ↕                                              ↓
            历史记录                                      完成/重新评估
```

每个评估步骤统一流程：
1. 连接设备（串口传感器）
2. 输入老人信息
3. 开始采集数据
4. 结束采集
5. 查看报告（静态 PDF / 动态视频）

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（仅前端）
npm run dev

# 启动后端服务
npm run server

# 同时启动前后端
npm start

# 生产构建
npm run build
```

## 部署到 Mac Mini

### 方式一：开发模式直接运行
```bash
npm start
```

### 方式二：构建后部署
```bash
npm run build
# 使用 Express 服务静态文件
npm run server
```

### 方式三：迁移到 Electron（推荐）
项目结构已设计为可轻松迁移到 Electron 桌面应用：
1. 安装 electron 和 electron-builder
2. 将 Express 服务集成到 Electron 主进程
3. 串口通信直接在 Node.js 层处理
4. 打包为 .dmg 安装包

## 串口通信说明

后端 `server/index.js` 已预留串口通信接口：
- 握力传感器手套
- 起坐能力传感器
- 静态站立压力板
- 行走步态传感器

通过 WebSocket 实时推送传感器数据到前端。

## Python 算法包集成

后端通过 `child_process.spawn` 调用 Python 算法包：
```javascript
// 示例：调用握力报告生成
POST /api/generate-report
{
  "type": "grip",
  "patientName": "郭锡诺",
  "data": { ... }
}
```

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Login | 登录页面 |
| `/dashboard` | Dashboard | 主仪表盘 |
| `/assessment/grip` | GripAssessment | 握力评估 |
| `/assessment/sit-stand` | SitStandAssessment | 起坐能力评估 |
| `/assessment/standing` | StandingAssessment | 静态站立评估 |
| `/assessment/gait` | GaitAssessment | 行走步态评估 |
| `/history` | AssessmentHistory | 历史记录 |

---

powered by 矩侨工业
