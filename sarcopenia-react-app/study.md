# 肌少症评估系统 — 开发教程

> 本文档是一份完整的系统开发教程，从零讲解本项目用到的每一项技术、每一个模块的设计思路和具体实现方法。
> 适合拿给他人学习"这个系统是怎么从头开发出来的"。

---

## 目录

- [第一章 系统概述](#第一章-系统概述)
- [第二章 技术栈总览](#第二章-技术栈总览)
- [第三章 项目结构](#第三章-项目结构)
- [第四章 串口通信 — 从硬件到数据](#第四章-串口通信--从硬件到数据)
- [第五章 前端架构 — React + Vite](#第五章-前端架构--react--vite)
- [第六章 状态管理 — Context API](#第六章-状态管理--context-api)
- [第七章 数据可视化 — ECharts + Three.js](#第七章-数据可视化--echarts--threejs)
- [第八章 Python 算法后端 — FastAPI](#第八章-python-算法后端--fastapi)
- [第九章 前后端联调 — 数据管道](#第九章-前后端联调--数据管道)
- [第十章 四大评估模块详解](#第十章-四大评估模块详解)
- [第十一章 历史记录与持久化](#第十一章-历史记录与持久化)
- [第十二章 如何运行与部署](#第十二章-如何运行与部署)
- [第十三章 二次开发指南](#第十三章-二次开发指南)

---

## 第一章 系统概述

### 1.1 什么是肌少症评估系统

本系统是一个 **肌少症 (Sarcopenia) 综合评估平台**，通过多种传感器采集人体运动数据，利用算法分析评估肌肉功能和平衡能力。

系统包含 **4 大评估模块**：

| 模块 | 传感器 | 评估内容 |
|------|--------|----------|
| 握力评估 | 手套压力传感器 (256点) | 手部握力、各手指力量分布、手部抖动 |
| 起坐评估 | 脚垫 (64×64) + 坐垫 (32×32) | 坐站转换能力（五次坐站测试） |
| 静态站立评估 | 脚垫 (64×64) | 静态平衡能力、足弓形态、COP稳定性 |
| 步态分析 | 4块脚垫拼接步道 (各64×64) | 步长、步速、步宽、足底压力分区 |

### 1.2 系统架构总览

```
┌─────────────────────────────────────────────────────┐
│                   浏览器 (Chrome/Edge)                │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Web Serial│  │ React 18 │  │  ECharts/Three.js │  │
│  │ API      │  │ (UI 组件) │  │  (数据可视化)      │  │
│  └────┬─────┘  └────┬─────┘  └───────────────────┘  │
│       │              │                                │
│       │    ┌─────────┴─────────┐                     │
│       │    │  Vite Proxy /pyapi │                     │
│       │    └─────────┬─────────┘                     │
└───────┼──────────────┼───────────────────────────────┘
        │              │
   USB串口          HTTP
        │              │
┌───────┴──────┐  ┌────┴────────────────────────┐
│  传感器硬件   │  │  Python FastAPI (port 8765) │
│  手套/脚垫    │  │  NumPy / SciPy / Matplotlib │
│  坐垫/步道    │  │  算法分析 → JSON/图片/PDF    │
└──────────────┘  └─────────────────────────────┘
```

**关键设计决策**：

1. **浏览器直连硬件**：使用 Web Serial API，无需安装驱动程序或桌面应用
2. **前后端分离**：React 负责 UI 和实时采集，Python 负责离线计算
3. **Vite 自动管理后端**：开发时 Vite 插件自动启动 Python 后端

---

## 第二章 技术栈总览

### 2.1 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| **React** | 18.1 | UI 框架，使用 Hooks 函数式组件 |
| **Vite** | 5.0 | 构建工具，开发服务器，HMR 热更新 |
| **React Router** | 6.20 | 前端路由（SPA 单页应用） |
| **TailwindCSS** | 3.4 | 原子化 CSS 框架 |
| **ECharts** | 5.6 | 2D 图表（折线图、饼图、柱状图、散点图） |
| **Three.js** | 0.177 | 3D 可视化（手部模型、足底压力场景） |
| **@react-three/fiber** | 8.18 | React 声明式 Three.js 绑定 |
| **lucide-react** | 0.453 | 图标库 |
| **sonner** | 1.3 | Toast 通知组件 |

### 2.2 后端技术

| 技术 | 用途 |
|------|------|
| **FastAPI** | Python HTTP 框架，异步支持 |
| **NumPy** | 数值计算（矩阵运算、统计） |
| **SciPy** | 科学计算（信号处理、峰值检测、FFT） |
| **Matplotlib** | 图表生成（热力图、COP 轨迹图） |
| **ReportLab** | PDF 报告生成 |

### 2.3 通信技术

| 技术 | 用途 |
|------|------|
| **Web Serial API** | 浏览器直接读取 USB 串口数据 |
| **Vite Proxy** | 开发模式下的 API 代理（`/pyapi` → `:8765`） |
| **FormData** | 大文件上传（CSV → Python） |

### 2.4 依赖安装

```bash
# 前端
npm install

# Python 后端
cd algorithms
pip install -r requirements.txt
```

`package.json` 核心依赖：

```json
{
  "dependencies": {
    "react": "^18.1.0",
    "react-router-dom": "^6.20.0",
    "echarts": "^5.6.0",
    "echarts-for-react": "^3.0.2",
    "three": "^0.177.0",
    "@react-three/fiber": "^8.18.0",
    "@react-three/drei": "^9.122.0",
    "tailwindcss": "^3.4.0"
  }
}
```

---

## 第三章 项目结构

```
sarcopenia-react-app/
│
├── algorithms/                     # Python 算法后端
│   ├── api_server.py               # FastAPI 服务入口 (端口 8765)
│   ├── get_glove_info_from_csv.py  # 握力核心算法
│   ├── glove_render_data.py        # 握力渲染数据封装
│   ├── generate_sit_stand_pdf_v3.py # 起坐核心算法
│   ├── sit_stand_render_data.py    # 起坐渲染数据封装
│   ├── OneStep_report.py           # 站立核心算法
│   ├── one_step_render_data.py     # 站立渲染数据封装
│   ├── generate_gait_report.py     # 步态核心算法
│   ├── gait_render_data.py         # 步态渲染数据封装
│   ├── generate_ss_dashboard_v3.py # 起坐动态视频生成
│   ├── heatmap_renderer.py         # Playwright 热力图渲染
│   ├── layout_config.py            # PDF 布局配置
│   └── requirements.txt            # Python 依赖
│
├── src/                            # 前端源码
│   ├── main.jsx                    # React 入口
│   ├── App.jsx                     # 路由定义
│   ├── index.css                   # 全局样式 (Tailwind + 自定义)
│   │
│   ├── contexts/                   # React Context (全局状态)
│   │   ├── AssessmentContext.jsx    # 评估状态管理
│   │   └── ThemeContext.jsx         # 主题切换
│   │
│   ├── hooks/                      # 自定义 Hooks
│   │   ├── useDevice.js            # 设备连接 + 模拟模式
│   │   ├── useWebSocket.js         # WebSocket 连接管理
│   │   └── usePressureScene.js     # 3D 压力场景
│   │
│   ├── lib/                        # 工具库 / SDK
│   │   ├── GripSerialService.js    # 手套串口协议 (921.6kbps)
│   │   ├── SerialService.js        # 通用脚垫串口 (3Mbps)
│   │   ├── gripPythonApi.js        # Python API 调用封装
│   │   ├── gripDataMapping.js      # 传感器 → 热力图映射
│   │   ├── FootAnalysis.js         # 前端足底分析算法
│   │   ├── historyService.js       # localStorage 历史管理
│   │   ├── heatmap.js              # Canvas 热力图渲染
│   │   ├── pressure-sensor/        # 压力传感器 SDK
│   │   │   ├── PressureSensorSerial.js    # 坐垫/脚垫串口服务
│   │   │   ├── PressureDataProcessor.js   # 数据处理
│   │   │   └── PressureSimulator.js       # 模拟数据生成
│   │   └── footpad-sdk/            # 步态多传感器 SDK
│   │       ├── services/FootpadSerialService.js  # 4块板串口
│   │       └── components/FootpadSceneReact.jsx  # 3D 步道场景
│   │
│   ├── components/                 # 可复用组件
│   │   ├── layout/
│   │   │   ├── Header.jsx          # 顶部导航栏
│   │   │   ├── DeviceConnector.jsx # 设备连接对话框
│   │   │   └── PatientInfoDialog.jsx # 患者信息表单
│   │   ├── report/
│   │   │   ├── GripReport.jsx      # 握力评估报告 (多Tab)
│   │   │   ├── StandingReport.jsx  # 站立评估报告
│   │   │   └── GaitRegionChart.jsx # 步态分区图表
│   │   ├── three/
│   │   │   ├── HandModel.jsx       # 3D 手部模型
│   │   │   ├── FootModel.jsx       # 3D 足部模型
│   │   │   └── InsoleModel.jsx     # 3D 鞋垫压力
│   │   └── ui/                     # 基础 UI 组件
│   │       ├── EChart.jsx          # ECharts 高性能封装
│   │       ├── Button.jsx, Card.jsx, Dialog.jsx...
│   │       ├── COPTrajectory.jsx   # COP 轨迹可视化
│   │       └── PressureHeatmap.jsx # 压力热力图
│   │
│   └── pages/                      # 页面组件
│       ├── Login.jsx               # 登录页
│       ├── Dashboard.jsx           # 评估选择仪表盘
│       ├── AssessmentHistory.jsx   # 历史记录列表
│       ├── HistoryReportView.jsx   # 历史报告详情
│       └── assessment/
│           ├── GripAssessment.jsx      # 握力评估页面
│           ├── SitStandAssessment.jsx  # 起坐评估页面
│           ├── StandingAssessment.jsx  # 站立评估页面
│           └── GaitAssessment.jsx      # 步态评估页面
│
├── server/                         # Node.js 开发服务器
│   └── index.js                    # Express + WebSocket 模拟
│
├── public/                         # 静态资源
│   ├── icons/                      # 评估图标
│   ├── grip_report_data/           # 握力示例数据
│   ├── gait_report_data/           # 步态示例数据
│   └── *_sim_data.json             # 模拟测试数据
│
├── vite.config.js                  # Vite 配置 + Python 自动启动
├── tailwind.config.js              # TailwindCSS 配置
├── package.json                    # 项目依赖和脚本
└── index.html                      # HTML 入口
```

---

## 第四章 串口通信 — 从硬件到数据

> 这是本系统最核心的创新点之一：**直接在浏览器中通过 Web Serial API 读取传感器硬件数据**，不需要 Electron 或其他桌面框架。

### 4.1 Web Serial API 简介

Web Serial API 是 Chrome/Edge 89+ 提供的浏览器 API，允许网页直接与 USB 串口设备通信。

**基本使用流程**：

```javascript
// 1. 用户选择串口（必须由用户手势触发）
const port = await navigator.serial.requestPort();

// 2. 打开串口，设置波特率
await port.open({ baudRate: 921600 });

// 3. 获取读取器
const reader = port.readable.getReader();

// 4. 循环读取数据
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  // value 是 Uint8Array，包含串口传来的原始字节
  processData(value);
}

// 5. 关闭
reader.releaseLock();
await port.close();
```

**浏览器限制**：
- 仅 Chrome/Edge 89+ 支持
- 必须 HTTPS 或 localhost
- 端口选择必须由用户点击操作触发（安全策略）

### 4.2 传感器协议详解

本系统使用 3 种不同的传感器，各有不同的串口协议：

#### 4.2.1 握力手套 (GripSerialService)

**文件**: `src/lib/GripSerialService.js`

| 参数 | 值 |
|------|-----|
| 波特率 | 921,600 bps |
| 帧头 | `0xAA 0x55 0x03 0x99` (4字节) |
| 数据结构 | 双包结构 |

**协议结构**：

```
每帧由 2 个包组成：

包1 (134字节):
┌──────────┬──────┬──────────────┬──────────────────┐
│ 帧头 (4B) │包序=1│sensor_type(1)│ 传感器数据 (128B)  │
└──────────┴──────┴──────────────┴──────────────────┘

包2 (150字节):
┌──────────┬──────┬──────────────┬──────────────────┬────────────────┐
│ 帧头 (4B) │包序=2│sensor_type(1)│ 传感器数据 (144B)  │ IMU四元数 (16B) │
└──────────┴──────┴──────────────┴──────────────────┴────────────────┘

合并后 = 256字节传感器值 + 16字节IMU四元数(4个float32)
sensor_type 区分左右手
```

**解析代码核心逻辑**（简化版）：

```javascript
class GripSerialService {
  constructor() {
    this.buffer = new Uint8Array(0);
    this.packet1Cache = new Map();  // 缓存包1，等待包2
  }

  processData(chunk) {
    // 拼接到缓冲区
    const newBuf = new Uint8Array(this.buffer.length + chunk.length);
    newBuf.set(this.buffer);
    newBuf.set(chunk, this.buffer.length);
    this.buffer = newBuf;

    while (this.buffer.length >= 6) {  // 帧头4 + 包序1 + sensor_type1
      // 查找帧头 0xAA 0x55 0x03 0x99
      const headerPos = this.findHeader(this.buffer);
      if (headerPos === -1) break;

      const packetOrder = this.buffer[headerPos + 4];  // 1 或 2
      const sensorType = this.buffer[headerPos + 5];   // 区分左右手

      if (packetOrder === 1) {
        // 缓存包1的128字节数据，等待包2
        this.packet1Cache.set(sensorType, data);
      } else if (packetOrder === 2) {
        // 合并包1+包2
        const packet1 = this.packet1Cache.get(sensorType);
        const combined = merge(packet1, data);  // 256+16=272字节

        // 提取传感器值和IMU数据
        const sensorValues = combined.slice(0, 256);  // 256个ADC值
        const imuBytes = combined.slice(256, 272);     // 4个float32
        const quaternion = parseFloat32Array(imuBytes); // [w, x, y, z]

        this.onDataCallback({ sensorValues, quaternion, hand: sensorType });
      }
    }
  }
}
```

**输出数据格式**：

```javascript
{
  sensorValues: number[256],  // 256个传感器的ADC值 (0~255)
  quaternion: [w, x, y, z],   // IMU四元数，用于计算欧拉角
  hand: number                // 传感器类型，区分左右手
}
```

#### 4.2.2 压力垫 (PressureSensorSerial)

**文件**: `src/lib/pressure-sensor/PressureSensorSerial.js`

| 传感器 | 矩阵 | 波特率 | 数据量/帧 |
|--------|-------|--------|-----------|
| 坐垫 (seat) | 32×32 | 1,000,000 bps | 1024+4=1028字节 |
| 脚垫 (footpad) | 64×64 | 3,000,000 bps | 4096+4=4100字节 |

**协议结构**：

```
┌──────────────────────────────────┬──────────────────┐
│    数据载荷 (N 字节)               │ 帧尾 AA 55 03 99 │
│    N=1024(坐垫) 或 N=4096(脚垫)   │ (4字节)           │
└──────────────────────────────────┴──────────────────┘
```

**解析流程**：

```javascript
processData(chunk) {
  // 追加到缓冲区
  this.buffer = concat(this.buffer, chunk);

  while (this.buffer.length >= frameSize) {
    // 查找帧尾 AA 55 03 99
    const footerIndex = findFooter(this.buffer);
    if (footerIndex === -1) break;

    // 从帧尾往前取 dataSize 字节
    const dataPayload = this.buffer.slice(footerIndex - dataSize, footerIndex);

    // 转换为二维矩阵 + 旋转90°
    const matrix = toMatrix(dataPayload, rows, cols);

    // 回调输出
    this.onDataCallback({
      matrix,         // number[64][64] 二维压力矩阵
      maxVal,         // 最大值
      minVal,         // 最小值
      nonZeroCount,   // 非零点数
      timestamp       // 时间戳
    });
  }
}
```

**关键技巧：帧尾定位法**

与常见的"帧头定位"不同，压力垫使用**帧尾定位法**：先找到帧尾 `AA 55 03 99`，然后向前偏移 `dataSize` 字节取数据。这样做的好处是：即使前面有噪声数据，也能准确找到一帧的结尾。

#### 4.2.3 步态多传感器 (FootpadSerialService)

**文件**: `src/lib/footpad-sdk/services/FootpadSerialService.js`

步态评估需要 **4 块独立的脚垫传感器**拼成一条步道，每块板各自通过独立串口连接。

```javascript
// 4个独立的传感器实例
export const footpadServices = {
  sensor1: new FootpadSerialService({ /* 配置 */ }),
  sensor2: new FootpadSerialService({ /* 配置 */ }),
  sensor3: new FootpadSerialService({ /* 配置 */ }),
  sensor4: new FootpadSerialService({ /* 配置 */ }),
};
```

每个传感器协议与普通脚垫相同 (64×64, 3Mbps, 帧尾定位)，但各自通过不同的 USB 串口。

### 4.3 数据采集流程

以握力评估为例，完整的数据采集流程：

```
用户点击"连接设备"
    │
    ▼
navigator.serial.requestPort()  ← 浏览器弹出串口选择对话框
    │
    ▼
port.open({ baudRate: 921600 })
    │
    ▼
readLoop() 循环读取 → processData() 解析帧 → onDataCallback()
    │                                             │
    │                                    ┌────────┴────────┐
    │                                    │                  │
    │                              实时可视化          数据缓冲
    │                              (ECharts更新)       (frames[])
    │
用户点击"停止采集"
    │
    ▼
frames[] → 组装CSV字符串 → POST /pyapi/analyze-grip → 算法分析
    │
    ▼
返回 JSON 结果 → 渲染报告页面 (GripReport.jsx)
```

### 4.4 模拟模式

开发时可能没有真实硬件，系统提供模拟模式。

**文件**: `src/hooks/useDevice.js`

```javascript
const startSimulation = useCallback(() => {
  setStatus('connected');
  setIsSimulation(true);
  simulationRef.current = setInterval(() => {
    const data = generateSimulationData(deviceType, frameNum);
    onFrameRef.current(data);  // 模拟数据也走 onFrame 回调
  }, 50);  // 20Hz 模拟采样率
}, [deviceType]);
```

模拟数据生成示例（站立）：

```javascript
function generateStandingSimData(t) {
  const matrix = Array(64).fill(null).map(() => Array(64).fill(0));
  fillFootPressure(matrix, t, 5, 28, 8, 56);   // 左脚区域
  fillFootPressure(matrix, t, 36, 59, 8, 56);  // 右脚区域
  return matrix;  // 64×64 矩阵
}
```

---

## 第五章 前端架构 — React + Vite

### 5.1 Vite 配置

**文件**: `vite.config.js`

本项目最特别的 Vite 配置：**自动启动 Python 后端**。

```javascript
function vitePluginPythonApi() {
  return {
    name: 'python-api-server',
    configureServer() {
      // 找到 Anaconda Python
      const cmd = 'C:\\Users\\xpr12\\anaconda3\\python.exe';
      const args = ['api_server.py'];

      // 启动 Python 后端进程
      pythonProcess = spawn(cmd, args, {
        cwd: path.join(projectRoot, 'algorithms'),
        env: { ...process.env, PYTHON_API_PORT: '8765' },
      });

      // 开发服务器退出时也关闭 Python
      process.on('exit', () => pythonProcess.kill());
    },
  };
}
```

**API 代理配置**：

```javascript
server: {
  port: 5173,
  proxy: {
    '/pyapi': {
      target: 'http://127.0.0.1:8765',
      rewrite: (p) => p.replace(/^\/pyapi/, ''),
      timeout: 600000,  // Python 算法计算可能很慢，10分钟超时
    },
  },
}
```

效果：前端 `fetch('/pyapi/analyze-grip')` 会被代理到 `http://127.0.0.1:8765/analyze-grip`。

### 5.2 路由设计

**文件**: `src/App.jsx`

```jsx
<Routes>
  <Route path="/" element={<Login />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/assessment/grip" element={<GripAssessment />} />
  <Route path="/assessment/sitstand" element={<SitStandAssessment />} />
  <Route path="/assessment/standing" element={<StandingAssessment />} />
  <Route path="/assessment/gait" element={<GaitAssessment />} />
  <Route path="/history" element={<AssessmentHistory />} />
  <Route path="/history/report" element={<HistoryReportView />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

**用户操作流程**：

```
登录 → 输入患者信息 → 仪表盘(选评估) → 评估页面(采集数据) → 查看报告 → 历史记录
```

### 5.3 组件层级关系

```
App.jsx
├── ThemeProvider          ← 主题上下文
│   └── AssessmentProvider ← 评估状态上下文
│       └── ToastProvider  ← 通知上下文
│           └── Routes
│               ├── Login
│               ├── Dashboard
│               │   └── PatientInfoDialog
│               ├── GripAssessment
│               │   ├── DeviceConnector (串口连接)
│               │   ├── HandModel (3D手部)
│               │   ├── EChart (实时力曲线)
│               │   └── GripReport (分析报告)
│               ├── StandingAssessment
│               │   ├── DeviceConnector
│               │   ├── InsoleModel (3D鞋垫)
│               │   └── StandingReport
│               └── ...
```

### 5.4 样式系统

本项目使用 **TailwindCSS** + **自定义 CSS 变量** 构建一套医疗设备风格的 UI。

**文件**: `src/index.css`

```css
/* 主色调：蔡司蓝 */
:root {
  --zeiss-blue: #0066CC;
  --zeiss-green: #059669;
  --zeiss-amber: #D97706;
  --zeiss-red: #DC2626;
}

/* 卡片组件 */
.zeiss-card {
  @apply bg-white rounded-xl shadow-sm border border-gray-100 p-4;
}

/* 按钮组件 */
.zeiss-button {
  @apply px-4 py-2 rounded-lg font-medium transition-all duration-200;
}
```

---

## 第六章 状态管理 — Context API

### 6.1 AssessmentContext

**文件**: `src/contexts/AssessmentContext.jsx`

本项目使用 React Context API（非 Redux）管理全局状态，因为状态结构相对简单。

```jsx
const INITIAL_STATE = {
  secretKey: '',           // 登录密钥
  institution: '',         // 机构名称
  isLoggedIn: false,
  patientInfo: null,       // { name, gender, age, weight }
  assessments: {
    grip:     { completed: false, report: null, data: null },
    sitstand: { completed: false, report: null, data: null },
    standing: { completed: false, report: null, data: null },
    gait:     { completed: false, report: null, data: null },
  }
};
```

**核心方法**：

```javascript
// 完成一项评估
const completeAssessment = (type, report, data) => {
  setState(prev => {
    const assessments = { ...prev.assessments };
    assessments[type] = { completed: true, report, data };

    // 自动保存到 localStorage
    if (prev.patientInfo) {
      saveAssessmentSession(prev.patientInfo, prev.institution, assessments);
    }

    return { ...prev, assessments };
  });
};

// 在评估页面中使用
const { completeAssessment } = useAssessment();
completeAssessment('grip', analysisResult, rawFrames);
```

### 6.2 数据流

```
                     AssessmentContext
                    ┌───────────────────┐
                    │ patientInfo        │
  Login ──set──────►│ assessments        │◄───────── GripAssessment
                    │ institution        │           (completeAssessment)
                    └───┬───────────┬───┘
                        │           │
           Dashboard ◄──┘           └──► HistoryReportView
           (读取完成状态)              (读取报告数据)
```

---

## 第七章 数据可视化 — ECharts + Three.js

### 7.1 ECharts 封装

**文件**: `src/components/ui/EChart.jsx`

为了在 React 中高性能使用 ECharts，项目封装了一个通用组件：

```jsx
export default function EChart({ option, style, className }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    // 初始化 ECharts 实例
    chartInstance.current = echarts.init(chartRef.current);

    // ResizeObserver 自动响应容器尺寸变化
    const observer = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      chartInstance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    // 增量更新（notMerge=false），避免闪烁
    chartInstance.current?.setOption(option);
  }, [option]);

  return <div ref={chartRef} style={style} className={className} />;
}
```

**使用示例（力-时间曲线）**：

```jsx
<EChart
  option={{
    tooltip: { trigger: 'axis' },
    legend: { data: ['大拇指', '食指', '中指', '无名指', '小拇指', '手掌', '总力'] },
    xAxis: { type: 'category', data: times },
    yAxis: { type: 'value', name: '力 (N)' },
    series: [
      { name: '大拇指', type: 'line', data: thumbForce, smooth: true },
      { name: '食指', type: 'line', data: indexForce, smooth: true },
      // ...
    ]
  }}
  style={{ height: 400 }}
/>
```

### 7.2 Three.js 3D 可视化

**手部模型**：`src/components/three/HandModel.jsx`
- 使用 `@react-three/fiber` 渲染 3D 手部模型
- 传感器值映射为颜色（蓝→绿→黄→红）
- 实时更新压力分布

**足底压力场景**：`src/hooks/usePressureScene.js`
- 64×64 网格的 3D 柱状图
- 柱高度 = 压力值
- 颜色渐变映射

```jsx
// React Three Fiber 声明式用法
<Canvas>
  <ambientLight intensity={0.5} />
  <directionalLight position={[10, 10, 5]} />
  {matrix.map((row, i) =>
    row.map((val, j) => (
      <mesh key={`${i}-${j}`} position={[i, val / 50, j]}>
        <boxGeometry args={[0.9, val / 50, 0.9]} />
        <meshStandardMaterial color={pressureToColor(val)} />
      </mesh>
    ))
  )}
  <OrbitControls />
</Canvas>
```

### 7.3 Canvas 热力图

**文件**: `src/lib/heatmap.js`

对于高频实时更新（如串口采集时的实时预览），使用原生 Canvas 比 DOM/SVG 性能更好：

```javascript
function drawHeatmap(canvas, matrix, colorMap) {
  const ctx = canvas.getContext('2d');
  const rows = matrix.length;
  const cols = matrix[0].length;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = colorMap(matrix[r][c]);
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }
}
```

---

## 第八章 Python 算法后端 — FastAPI

### 8.1 FastAPI 服务架构

**文件**: `algorithms/api_server.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Sarcopenia Grip Analysis API")

# 允许跨域（开发模式）
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"])

# 接口注册
@app.get("/health")
@app.post("/analyze-grip")
@app.post("/analyze-sitstand")
@app.post("/generate-sitstand-video")
@app.post("/analyze-standing")
@app.post("/analyze-gait")
```

### 8.2 延迟导入设计

由于各算法模块依赖不同（有的需要 Matplotlib，有的需要 SciPy），采用**延迟导入**避免启动失败：

```python
_sitstand_report = None

def _get_sitstand_report():
    global _sitstand_report
    if _sitstand_report is None:
        from generate_sit_stand_pdf_v3 import generate_report_from_content
        _sitstand_report = generate_report_from_content
    return _sitstand_report
```

这样即使某个模块的依赖缺失，其他模块仍可正常使用。

### 8.3 三层架构

每个评估模块有 3 层：

```
算法层 (核心计算)               渲染数据层 (封装)              API 层 (HTTP)
get_glove_info_from_csv.py → glove_render_data.py     → api_server.py
generate_sit_stand_pdf_v3.py → sit_stand_render_data.py → api_server.py
OneStep_report.py            → one_step_render_data.py  → api_server.py
generate_gait_report.py      → gait_render_data.py      → api_server.py
```

- **算法层**：接收 CSV 字符串，内部完成所有计算，返回 dict + 生成 PDF/图片
- **渲染数据层**：接收数组（而非 CSV），提供 `get_*()` 方法按区域拆分数据
- **API 层**：接收 HTTP 请求，调用算法层，将 NumPy 类型转为 JSON 返回

### 8.4 NumPy → JSON 转换

Python 计算结果包含大量 NumPy 类型 (numpy.float64, numpy.ndarray 等)，需要转换为 Python 原生类型：

```python
def numpy_to_python(obj):
    """递归将 numpy 类型转换为 Python 原生类型，NaN/Inf 转为 None"""
    if isinstance(obj, dict):
        return {k: numpy_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [numpy_to_python(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return numpy_to_python(obj.tolist())
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        v = float(obj)
        return None if (v != v or v == float('inf') or v == float('-inf')) else v
    return obj
```

---

## 第九章 前后端联调 — 数据管道

### 9.1 完整数据管道

以**握力评估**为例，数据从硬件到报告的完整流程：

```
┌──────────────────────────────────────────────────────────┐
│ 第1步：串口采集                                           │
│                                                           │
│ GripSerialService.connect()                               │
│ → readLoop() → processData(chunk) → processPacket()       │
│ → callback({ sensorValues[256], quaternion[4], hand })     │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 第2步：前端实时可视化 + 数据缓冲                           │
│                                                           │
│ GripAssessment.jsx:                                       │
│   onFrame(data) {                                         │
│     // 实时更新 ECharts 力曲线                             │
│     updateChart(data.sensorValues);                       │
│     // 实时更新 3D 手部模型颜色                             │
│     updateHandModel(data.sensorValues);                   │
│     // 实时更新 Canvas 热力图                              │
│     drawHeatmap(data.sensorValues);                       │
│     // 缓冲帧数据                                         │
│     frames.push({ sensor: data.sensorValues,              │
│                   imu: data.quaternion,                    │
│                   time: performance.now() });              │
│   }                                                       │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 第3步：组装 CSV 并上传                                     │
│                                                           │
│ // 将缓冲的帧数据组装为 CSV 格式                            │
│ let csv = "sensor_data_calibrated,relative_time,imu\n";   │
│ frames.forEach(f => {                                     │
│   csv += `"[${f.sensor}]",${f.time},"[${f.imu}]"\n`;     │
│ });                                                       │
│                                                           │
│ // 调用 Python API                                        │
│ const result = await analyzeGripCSV(csv, '左手');           │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 第4步：Python 后端计算                                     │
│                                                           │
│ api_server.py /analyze-grip:                              │
│   1. 解析 CSV → 提取 sensor_data[N, 256] + imu[N, 4]     │
│   2. ADC → 力(N) 转换（三段校准曲线）                       │
│   3. 各手指力/面积/ADC 计算                                │
│   4. 峰值检测（AMPD算法）                                   │
│   5. IMU四元数 → 欧拉角(Roll/Pitch/Yaw)                   │
│   6. 角速度 → 抖动检测（阈值30°/s）                        │
│   7. 返回 JSON { data: {...}, images: {...} }             │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ 第5步：前端渲染报告                                        │
│                                                           │
│ GripReport.jsx:                                           │
│   - 概览卡片：总力、峰值、帧数、时间范围                     │
│   - 力-时间曲线图（ECharts 7条线）                          │
│   - 各手指力分布饼图                                       │
│   - 欧拉角变化曲线                                         │
│   - 角速度+抖动检测图                                      │
│   - 峰值帧各部位数据表格                                   │
└──────────────────────────────────────────────────────────┘
```

### 9.2 前端 API 调用模块

**文件**: `src/lib/gripPythonApi.js`

```javascript
const PYTHON_API_BASE = '/pyapi';

// 握力分析：JSON 方式
export async function analyzeGripCSV(csvContent, handType) {
  const res = await fetch(`${PYTHON_API_BASE}/analyze-grip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_content: csvContent, hand_type: handType }),
  });
  return res.json();
}

// 起坐分析：FormData 上传（文件较大）
export async function analyzeSitStandCSV(standCsv, sitCsv, username) {
  const form = new FormData();
  form.append('stand_file', new Blob([standCsv], { type: 'text/csv' }), 'stand.csv');
  form.append('sit_file', new Blob([sitCsv], { type: 'text/csv' }), 'sit.csv');
  form.append('username', username || '用户');

  const res = await fetch(`${PYTHON_API_BASE}/analyze-sitstand`, {
    method: 'POST',
    body: form,
  });
  return res.json();
}

// 步态分析：4个文件同时上传
export async function analyzeGaitCSV(csvContents) {
  const form = new FormData();
  csvContents.forEach((csv, i) => {
    form.append(`file${i + 1}`, new Blob([csv], { type: 'text/csv' }), `${i + 1}.csv`);
  });
  const res = await fetch(`${PYTHON_API_BASE}/analyze-gait`, { method: 'POST', body: form });
  return res.json();
}
```

**设计决策**：
- **握力**使用 JSON（数据量小，256×N）
- **其他**使用 FormData（数据量大，4096×N，文件级别）

---

## 第十章 四大评估模块详解

### 10.1 握力评估

**采集端**：`GripAssessment.jsx` + `GripSerialService.js`
**算法端**：`get_glove_info_from_csv.py` → `glove_render_data.py`
**报告端**：`GripReport.jsx`

**分析能力**：
- 5指+手掌各部位力(N)、面积(mm²)、ADC值
- 力-时间曲线（7通道：5指+手掌+总力）
- 峰值检测（峰值力、峰值时间、到达峰值耗时）
- 力分布占比（饼图/堆叠面积图）
- 手部姿态（Roll/Pitch/Yaw 欧拉角）
- 手部抖动检测（角速度分析，阈值30°/s）

### 10.2 起坐评估

**采集端**：`SitStandAssessment.jsx` + `PressureSensorSerial.js`
**算法端**：`generate_sit_stand_pdf_v3.py` → `sit_stand_render_data.py`

**分析能力**：
- 坐站周期检测（五次坐站测试 → 周期数、总时长、平均时长）
- 压力演变热力图（站立2×11 + 坐姿1×11 = 33张热力图）
- COP轨迹图（站立左右脚 + 坐姿）
- 力-时间曲线 + 峰值标记
- 动态视频生成（MP4）

### 10.3 静态站立评估

**采集端**：`StandingAssessment.jsx` + `PressureSensorSerial.js`
**算法端**：`OneStep_report.py` → `one_step_render_data.py`

**分析能力**：
- 足弓分析（足弓指数、Clarke角、Staheli比）
- 足部尺寸（足长mm、足宽mm、接触面积mm²）
- 压力分布（前足/中足/后足压力占比%）
- COP 14项平衡参数（路径长度、活动面积、摇摆幅度、速度、RMS位移等）
- 摇摆特征（ML/AP方向位移、振荡频率、样本熵）
- 左右对称性（双侧压力比）
- 95% COP 置信椭圆

### 10.4 步态分析

**采集端**：`GaitAssessment.jsx` + `FootpadSerialService.js`
**算法端**：`generate_gait_report.py` → `gait_render_data.py`

**分析能力**：
- 基本步态参数（步长、步速、步宽、步频、双支撑时间）
- 足偏角FPA（逐步角度列表）
- 平衡分析（整足/前足/足跟的峰值、均值、标准差）
- 时序曲线（面积、力、COP速度、压力）
- 6分区分析（S1大拇趾/S2 2~5趾/S3前足/S4中足/S5外侧跟/S6内侧跟）
- 支撑相分析（前期/初期/中期/末期）
- 步态周期分析（双脚加载期/单支撑期/摇摆期）
- 8张分析图片（base64 PNG）

---

## 第十一章 历史记录与持久化

### 11.1 historyService

**文件**: `src/lib/historyService.js`

```javascript
const STORAGE_KEY = 'sarcopenia_assessment_history';
const MAX_RECORDS = 500;

// 保存评估会话
export function saveAssessmentSession(patientInfo, institution, assessments) {
  const record = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    patientInfo,
    institution,
    assessments
  };
  const history = getHistory();
  history.unshift(record);
  if (history.length > MAX_RECORDS) history.length = MAX_RECORDS;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// 查询/删除/更新
export function getHistory() { ... }
export function deleteRecord(id) { ... }
export function queryByPatient(name) { ... }
```

### 11.2 自动保存机制

在 `AssessmentContext` 中，每次调用 `completeAssessment()` 都自动触发 `saveAssessmentSession()`：

```javascript
const completeAssessment = (type, report, data) => {
  setState(prev => {
    // 更新状态
    assessments[type] = { completed: true, report, data };
    // 自动保存
    saveAssessmentSession(prev.patientInfo, prev.institution, assessments);
    return { ...prev, assessments };
  });
};
```

---

## 第十二章 如何运行与部署

### 12.1 开发模式

```bash
# 1. 安装前端依赖
npm install

# 2. 安装 Python 依赖
cd algorithms
pip install -r requirements.txt
cd ..

# 3. 启动（自动启动前端 + Python 后端）
npm run dev
```

启动后：
- 前端：`http://localhost:5173`
- Python API：`http://127.0.0.1:8765`（由 Vite 插件自动启动）
- API 代理：`/pyapi/*` → `http://127.0.0.1:8765/*`

### 12.2 生产构建

```bash
npm run build       # 输出到 dist/
npm run preview     # 预览构建结果
```

生产模式下需要单独启动 Python 后端：

```bash
cd algorithms
python api_server.py
```

### 12.3 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | 18+ |
| Python | 3.8+ (推荐 Anaconda) |
| 浏览器 | Chrome 89+ 或 Edge 89+ (Web Serial) |
| 串口 | USB 串口设备需安装对应驱动 (CH340/CP2102等) |

---

## 第十三章 二次开发指南

### 13.1 如何添加新的评估类型

假设要添加一个"平衡木评估"：

**第1步**：创建算法

```python
# algorithms/balance_beam_report.py
def analyze_balance_beam(csv_content):
    # 你的算法逻辑
    return { 'score': 85, 'details': {...} }
```

**第2步**：创建渲染数据封装

```python
# algorithms/balance_beam_render_data.py
from balance_beam_report import analyze_balance_beam

def generate_balance_beam_report(data_array):
    csv = array_to_csv(data_array)
    return analyze_balance_beam(csv)

def get_score(result):
    return result.get('score')
```

**第3步**：注册 API 端点

```python
# algorithms/api_server.py 中添加
@app.post("/analyze-balance-beam")
async def analyze_balance_beam_api(csv_file: UploadFile = File(...)):
    content = (await csv_file.read()).decode("utf-8")
    result = analyze_balance_beam(content)
    return {"success": True, "data": numpy_to_python(result)}
```

**第4步**：前端 API 调用

```javascript
// src/lib/gripPythonApi.js 中添加
export async function analyzeBalanceBeam(csvContent) {
  const form = new FormData();
  form.append('csv_file', new Blob([csvContent], { type: 'text/csv' }), 'data.csv');
  const res = await fetch(`${PYTHON_API_BASE}/analyze-balance-beam`, {
    method: 'POST', body: form
  });
  return res.json();
}
```

**第5步**：创建评估页面

```jsx
// src/pages/assessment/BalanceBeamAssessment.jsx
export default function BalanceBeamAssessment() {
  const { completeAssessment } = useAssessment();
  const device = useDevice({ onFrame: handleFrame, deviceType: 'balancebeam' });
  // ... 串口连接、数据采集、可视化、调用API、展示报告
}
```

**第6步**：注册路由

```jsx
// src/App.jsx
<Route path="/assessment/balancebeam" element={<BalanceBeamAssessment />} />
```

### 13.2 如何添加新的串口协议

```javascript
// src/lib/BalanceBeamSerial.js
class BalanceBeamSerial {
  constructor() {
    this.port = null;
    this.buffer = new Uint8Array(0);
  }

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: YOUR_BAUD_RATE });
    this.readLoop();
  }

  async readLoop() {
    const reader = this.port.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      this.processData(value);
    }
  }

  processData(chunk) {
    // 根据你的硬件协议解析数据
    // 找到帧头/帧尾 → 提取数据 → 回调
  }
}
```

### 13.3 如何直接调用 Python 算法（不用 HTTP）

如果做二次开发不需要前端，可以直接调用 render_data 层的方法：

```python
import sys
sys.path.insert(0, 'algorithms')

# 握力
from glove_render_data import generate_grip_report, get_overview, get_finger_data
result = generate_grip_report(sensor_data_array, '左手')
print(get_overview(result))

# 站立
from one_step_render_data import generate_standing_report, get_cop_time_series
result = generate_standing_report(pressure_array, fps=42)
print(get_cop_time_series(result))
```

> 详细的直接调用文档请参见 `ALGORITHMS_DOC2.md`。

---

## 附录

### A. 数据格式参考

| 传感器 | 数据维度 | 每帧字节 | 采样率 |
|--------|----------|----------|--------|
| 握力手套 | 256个点 + IMU | 272字节 | ~100Hz |
| 脚垫 | 64×64=4096个点 | 4100字节 | ~42Hz |
| 坐垫 | 32×32=1024个点 | 1028字节 | ~42Hz |
| 步道 | 4×64×64=16384个点 | 16400字节 | ~42Hz |

### B. CSV 格式

**握力 CSV**：
```csv
sensor_data_calibrated,relative_time,imu_data_calibrated
"[23,45,0,...共256个值]",0.000,"[0.98,0.01,0.02,0.15]"
"[24,46,0,...共256个值]",0.010,"[0.98,0.01,0.02,0.15]"
```

**压力垫 CSV**（脚垫/坐垫/步道）：
```csv
data,time
"[0,0,5,12,...共4096个值]",2025/12/06 17:07:33:840
"[0,0,6,13,...共4096个值]",2025/12/06 17:07:33:864
```

### C. 关键文件路径速查

| 需求 | 文件 |
|------|------|
| 添加 API 端点 | `algorithms/api_server.py` |
| 修改串口协议 | `src/lib/GripSerialService.js` 或 `PressureSensorSerial.js` |
| 修改前端路由 | `src/App.jsx` |
| 修改全局状态 | `src/contexts/AssessmentContext.jsx` |
| 修改 Python API 调用 | `src/lib/gripPythonApi.js` |
| 修改 Vite 配置 | `vite.config.js` |
| 修改评估页面 | `src/pages/assessment/*.jsx` |
| 修改报告组件 | `src/components/report/*.jsx` |
| 修改算法逻辑 | `algorithms/*.py` |
