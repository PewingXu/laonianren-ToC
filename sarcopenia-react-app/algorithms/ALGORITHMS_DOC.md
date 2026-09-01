# 肌少症评估算法文档

> 本文档完整描述 `algorithms/` 目录下所有 Python 文件的功能、调用方式、输入输出以及它们之间的关系。

---

## 目录

- [架构总览](#架构总览)
- [文件依赖关系图](#文件依赖关系图)
- [入口方式说明](#入口方式说明)
- [四大核心评估模块](#四大核心评估模块)
  - [1. 握力评估 (Grip)](#1-握力评估-grip)
  - [2. 起坐评估 (Sit-Stand)](#2-起坐评估-sit-stand)
  - [3. 静态站立评估 (Standing)](#3-静态站立评估-standing)
  - [4. 步态分析 (Gait)](#4-步态分析-gait)
- [辅助工具文件](#辅助工具文件)
- [综合指标研究模块](#综合指标研究模块)
- [统一调用示例](#统一调用示例)
- [API 接口一览](#api-接口一览)

---

## 架构总览

本系统是一个**肌少症 (Sarcopenia) 综合评估平台**，包含 4 大核心评估模块，每个模块有 3 层结构：

| 层级 | 文件 | 职责 |
|------|------|------|
| **算法层** | `get_glove_info_from_csv.py` 等 | 核心计算逻辑，接收 CSV 文本，返回分析结果 + 生成 PDF |
| **渲染数据层** | `glove_render_data.py` 等 | 封装算法层，接收数组（非 CSV），提供按区域拆分的 `get_*()` 方法 |
| **API 服务层** | `api_server.py` | FastAPI HTTP 接口，供前端调用 |

### 总入口

**有两种使用方式：**

1. **HTTP 接口**（前端使用）：通过 `api_server.py` 的 REST API 调用
2. **Python 直接调用**（后端/脚本使用）：通过各 `*_render_data.py` 的 `generate_*_report()` 方法

> ⚠️ **目前没有一个"统一调用全部评估"的总入口**，因为 4 种评估使用不同的传感器数据（手套传感器、足底压力垫、坐垫等），无法用同一份数据调用所有方法。每种评估必须独立调用。

---

## 文件依赖关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                     api_server.py (FastAPI 服务)                 │
│                     端口: PYTHON_API_PORT (默认 8765)            │
│                                                                  │
│  /analyze-grip    /analyze-sitstand   /analyze-standing   /analyze-gait
│  /generate-sitstand-video             /health                    │
└──────┬──────────────┬────────────────┬──────────────┬────────────┘
       │              │                │              │
       ▼              ▼                ▼              ▼
┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────────┐
│ 握力算法  │  │  起坐算法     │  │ 站立算法    │  │  步态算法       │
│ get_glove │  │ generate_sit │  │ OneStep_   │  │ generate_gait  │
│ _info_from│  │ _stand_pdf   │  │ report.py  │  │ _report.py     │
│ _csv.py   │  │ _v3.py       │  │            │  │                │
└──────────┘  ├──────────────┤  └────────────┘  └────────────────┘
       │      │ generate_ss_ │         │              │
       │      │ dashboard_   │         │              │
       │      │ v3.py(视频)  │         │              │
       │      ├──────────────┤         │              │
       │      │ layout_      │         │              │
       │      │ config.py    │         │              │
       │      └──────────────┘         │              │
       │              │                │              │
       ▼              ▼                ▼              ▼
┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────────┐
│ glove_   │  │ sit_stand_   │  │ one_step_  │  │ gait_render_   │
│ render_  │  │ render_      │  │ render_    │  │ data.py        │
│ data.py  │  │ data.py      │  │ data.py    │  │                │
└──────────┘  └──────────────┘  └────────────┘  └────────────────┘
  (渲染数据封装层 - 接收数组，提供 get_*() 方法)
```

**独立工具文件：**
- `heatmap_renderer.py` — Playwright 浏览器渲染热力图
- `layout_config.py` — PDF 报告布局配置
- `Comprehensive_Indicators_4096_modify_input.py` — 高级研究指标（独立模块）

---

## 入口方式说明

### 方式一：通过渲染数据层调用（推荐用于 Python 脚本 / 后端集成）

每个评估模块都有一个 `*_render_data.py` 文件，提供：
- **总入口** `generate_*_report()` — 接收数组数据，一次性计算全部结果
- **拆分方法** `get_*()` — 从结果中按需提取各渲染区域数据

```python
# 通用模式
result = generate_xxx_report(data)     # 一次计算
overview = get_overview(result)         # 按需提取
chart_data = get_xxx_data(result)       # 按需提取
```

### 方式二：通过 FastAPI HTTP 接口调用（前端使用）

启动服务：
```bash
cd algorithms
python api_server.py
# 或指定端口: PYTHON_API_PORT=9000 python api_server.py
```

所有接口返回 JSON 格式，通过 HTTP POST 调用。

---

## 四大核心评估模块

---

### 1. 握力评估 (Grip)

**传感器：** 手套式压力传感器，256 个感应点
**用途：** 评估手部握力、各手指力量分布、手部抖动检测

#### 文件

| 文件 | 职责 |
|------|------|
| `get_glove_info_from_csv.py` (1201行) | 核心算法：ADC→力转换、峰值检测、IMU姿态分析、PDF生成 |
| `glove_render_data.py` (402行) | 渲染数据封装：数组输入 → 拆分方法输出 |

#### Python 调用

```python
from glove_render_data import generate_grip_report
from glove_render_data import (
    get_overview, get_time_analysis, get_finger_data,
    get_force_time_series, get_force_time_echarts_option,
    get_force_distribution, get_euler_data,
    get_euler_echarts_option, get_angular_velocity_data,
)

# 总入口
result = generate_grip_report(
    sensor_data,      # [N, 256] 传感器 ADC 数据
    hand_type,        # '左手' 或 '右手'
    times=None,       # [N] 时间戳(秒)，None则按0.01s间隔生成
    imu_data=None,    # [N, 4] IMU四元数，None则不计算欧拉角
)

# 按需提取
overview = get_overview(result)
# → {'handType', 'totalFrames', 'timeRange', 'totalForce', 'totalArea', 'peakInfo'}

time_analysis = get_time_analysis(result)
# → [{'label': '抓握开始时间', 'value': '5.040 s'}, ...]

finger_data = get_finger_data(result)
# → [{'name': '大拇指', 'key': 'thumb', 'force': 12.5, 'area': 48, ...}, ...]

force_series = get_force_time_series(result)
# → {'times': [...], 'forceTimeSeries': {'thumb': [...], 'total': [...], ...}}

force_chart = get_force_time_echarts_option(result)
# → 可直接传入 ECharts 的 option 对象

distribution = get_force_distribution(result)
# → [{'name': '大拇指', 'force': 12.5, 'ratio': 0.21}, ...]

euler = get_euler_data(result)
# → {'times': [...], 'roll': [...], 'pitch': [...], 'yaw': [...]}

angular = get_angular_velocity_data(result)
# → {'times': [...], 'angularVelocity': [...]}
```

#### HTTP 接口

```
POST /analyze-grip
Content-Type: application/json

{
  "csv_content": "sensor_data_calibrated,relative_time,imu_data_calibrated\n...",
  "hand_type": "左手"
}

→ { "success": true, "data": { ... }, "images": {} }
```

#### 输出能力总结

| 能力 | 说明 |
|------|------|
| 手指力量分析 | 5个手指 + 手掌，各自的力(N)、面积(mm²)、ADC值 |
| 力-时间曲线 | 7通道时序数据（5指 + 手掌 + 总力） |
| 峰值检测 | 峰值力、峰值时间、到达峰值耗时 |
| 力分布占比 | 各手指力占比（饼图数据） |
| 手部姿态 | Roll/Pitch/Yaw 欧拉角（需 IMU 数据） |
| 抖动检测 | 角速度分析，抖动次数检测（阈值 30°/s） |
| PDF 报告 | 自动生成含中文的 PDF 报告 |

---

### 2. 起坐评估 (Sit-Stand)

**传感器：** 足底压力垫 (64×64=4096点) + 坐垫 (32×32=1024点)
**用途：** 评估坐站转换能力（五次坐站测试）

#### 文件

| 文件 | 职责 |
|------|------|
| `generate_sit_stand_pdf_v3.py` (1410行) | 核心算法：周期检测、力曲线、COP、PDF 生成 |
| `generate_ss_dashboard_v3.py` (810行) | 动态视频生成：压力热力图动画 → MP4 |
| `sit_stand_render_data.py` (341行) | 渲染数据封装 |
| `layout_config.py` (274行) | PDF 布局配置 |

#### Python 调用

```python
from sit_stand_render_data import generate_sit_stand_report
from sit_stand_render_data import (
    get_duration_stats, get_stand_evolution_images,
    get_sit_evolution_images, get_stand_cop_images,
    get_sit_cop_image, get_force_curve_data,
    get_stand_force_echarts_option, get_sit_force_echarts_option,
)

# 总入口
result = generate_sit_stand_report(
    stand_data,       # [N, 4096] 脚垫压力数据
    sit_data,         # [M, 1024] 坐垫压力数据
    username="用户",  # 报告用户名
)

# 按需提取
stats = get_duration_stats(result)
# → {'total_duration': 26.84, 'num_cycles': 5, 'avg_duration': 5.37, ...}

stand_images = get_stand_evolution_images(result)
# → [{'label': 0, 'sublabel': 0, 'image': 'data:image/png;base64,...'}, ...]
# 共 22 张 (2行×11列), label=0左脚, label=1右脚

sit_images = get_sit_evolution_images(result)
# → [{'label': 0, 'image': 'data:image/png;base64,...'}, ...] 共11张

stand_cop = get_stand_cop_images(result)
# → {'left': 'data:image/png;base64,...', 'right': 'data:image/png;base64,...'}

sit_cop = get_sit_cop_image(result)
# → 'data:image/png;base64,...'

curves = get_force_curve_data(result)
# → {'stand_times': [...], 'stand_force': [...],
#     'sit_times': [...], 'sit_force': [...], 'stand_peaks_idx': [...]}
```

#### 生成动态视频

```python
from generate_ss_dashboard_v3 import generate_video_from_content

generate_video_from_content(
    stand_csv_content,   # 脚垫 CSV 文本
    sit_csv_content,     # 坐垫 CSV 文本
    output_path,         # 输出路径，如 "output.mp4"
    speed_factor=0.5,    # 播放速度倍率
)
```

#### HTTP 接口

```
POST /analyze-sitstand (multipart/form-data)
  - stand_file: 脚垫 CSV 文件
  - sit_file: 坐垫 CSV 文件
  - username: 用户名（可选，默认"用户"）

→ { "success": true, "data": { ... } }

POST /generate-sitstand-video (multipart/form-data)
  - stand_file: 脚垫 CSV 文件
  - sit_file: 坐垫 CSV 文件

→ { "success": true, "video_url": "/assets/dynamic_report.mp4" }
```

#### 输出能力总结

| 能力 | 说明 |
|------|------|
| 周期统计 | 坐站次数、总时长、平均周期时长 |
| 压力演变热力图 | 站立 2×11 + 坐姿 1×11 = 33 张 base64 图片 |
| COP 轨迹图 | 站立左右脚 + 坐姿 COP 轨迹（base64 图片） |
| 力-时间曲线 | 站立/坐姿力曲线 + 峰值标记 |
| 动态视频 | MP4 动画展示压力变化过程 |
| PDF 报告 | 自动生成 A4 横向 PDF |

---

### 3. 静态站立评估 (Standing)

**传感器：** 足底压力垫 (64×64=4096点)
**用途：** 评估静态平衡能力、足弓形态、COP 稳定性

#### 文件

| 文件 | 职责 |
|------|------|
| `OneStep_report.py` (2481行) | 核心算法：COP 分析、足弓分类、摇摆特征、PDF 生成 |
| `one_step_render_data.py` (387行) | 渲染数据封装 |

#### Python 调用

```python
from one_step_render_data import generate_standing_report
from one_step_render_data import (
    get_arch_overview, get_pressure_distribution,
    get_arch_zone_data, get_cop_trajectory_data,
    get_cop_time_series, get_cop_metrics,
    get_sway_features, get_bilateral_pressure_ratio,
)

# 总入口
result = generate_standing_report(
    data_array,             # [N, 4096] 足底压力数据
    fps=42,                 # 采样率 (Hz)
    threshold_ratio=0.8,    # COP 计算阈值
)

# 按需提取
arch = get_arch_overview(result)
# → {'left': {'archIndex', 'archType', 'clarkeAngle', 'length', 'width', ...},
#     'right': {...}}

pressure = get_pressure_distribution(result)
# → {'left': {'forefoot': 45.2, 'midfoot': 18.6, 'hindfoot': 36.2},
#     'right': {...}}
# 值为百分比 (%)

zones = get_arch_zone_data(result)
# → {'leftSectionCoords': [前足, 中足, 后足], 'rightSectionCoords': [...],
#     'peakFrameFlat': [4096个值]}

cop_traj = get_cop_trajectory_data(result)
# → {'distLeftToBoth': 2.35, 'distRightToBoth': 2.18, 'leftForward': 0.82}

cop_params = get_cop_time_series(result)
# → {'pathLength': 245.8, 'contactArea': 1820.5, 'majorAxis': 18.6,
#     'minorAxis': 12.3, 'eccentricity': 0.75, 'avgVelocity': 8.2, ...}
# 共 14 项 COP 平衡参数

cop_metrics = get_cop_metrics(result)
# → 左右脚 COP 位置、路径长度、速度等详细指标

sway = get_sway_features(result)
# → ML/AP 摇摆位移、振荡频率、样本熵

bilateral = get_bilateral_pressure_ratio(result)
# → {'leftRatio': 48.5, 'rightRatio': 51.5}
```

#### HTTP 接口

```
POST /analyze-standing (multipart/form-data)
  - csv_file: 压力数据 CSV 文件
  - fps: 采样率（默认 42）
  - threshold_ratio: 阈值比例（默认 0.8）

→ { "success": true, "data": { ... }, "images": { ... } }
```

#### 输出能力总结

| 能力 | 说明 |
|------|------|
| 足弓分析 | 足弓指数、Clarke角、Staheli比、足弓类型(扁平/正常/高弓) |
| 足部尺寸 | 足长(mm)、足宽(mm)、接触面积(mm²) |
| 压力分布 | 前足/中足/后足压力占比 |
| COP 平衡参数 | 14 项指标：路径长度、活动面积、摇摆幅度、速度、RMS 位移等 |
| 摇摆特征 | ML/AP 方向位移、振荡频率、样本熵 |
| 左右对称性 | 双侧压力比 |
| 置信椭圆 | 95% COP 置信椭圆参数 |

#### COP 14项参数详解

| 字段 | 含义 | 单位 |
|------|------|------|
| pathLength | COP 轨迹总长度 | mm |
| contactArea | COP 活动面积 | mm² |
| majorAxis | 最大摇摆幅度（椭圆长轴） | mm |
| minorAxis | 最小摇摆幅度（椭圆短轴） | mm |
| lsRatio | 摇摆幅度系数 (长轴/短轴) | - |
| eccentricity | 摇摆均匀性系数（离心率） | - |
| deltaY | 左右(ML)摇摆幅度 | mm |
| deltaX | 前后(AP)摇摆幅度 | mm |
| maxDisplacement | 最大偏心距 | mm |
| minDisplacement | 最小偏心距 | mm |
| avgVelocity | 平均 COP 速度 | mm/s |
| rmsDisplacement | COP RMS 位移 | mm |
| stdY | 左右方向标准差 | mm |
| stdX | 前后方向标准差 | mm |

---

### 4. 步态分析 (Gait)

**传感器：** 4 块足底压力垫拼接成步道 (每块 64×64=4096点)
**用途：** 评估行走步态、步长步速、足底压力分区、步态周期

#### 文件

| 文件 | 职责 |
|------|------|
| `generate_gait_report.py` (3235行) | 核心算法：步态检测、分区分析、时相分析、图片生成 |
| `gait_render_data.py` (378行) | 渲染数据封装 |

#### Python 调用

```python
from gait_render_data import generate_gait_report
from gait_render_data import (
    get_gait_params, get_fpa_per_step, get_balance,
    get_time_series, get_partition_features, get_partition_curves,
    get_region_coords, get_support_phases, get_cycle_phases,
    get_images, get_pressure_evolution_image,
    get_gait_average_image, get_footprint_heatmap_image,
    get_time_series_image, get_pressure_region_images,
    get_partition_curve_images,
)

# 总入口
result = generate_gait_report(
    board_data,     # list[list[str]], 4块板数据
                    #   board_data[0]~[3] 对应 1.csv~4.csv 的 data 列
                    #   每个元素是 "[v0,v1,...,v4095]" 格式字符串
    board_times,    # list[list[str]], 4块板时间戳
                    #   每个元素是 "2025/12/06 17:07:33:840" 格式字符串
)

# 按需提取
params = get_gait_params(result)
# → {
#     'leftStepTime': '0.52s',       左脚步时
#     'rightStepTime': '0.50s',      右脚步时
#     'crossStepTime': '1.02s',      交叉步时
#     'leftStepLength': '62.5cm',    左脚步长
#     'rightStepLength': '63.1cm',   右脚步长
#     'crossStepLength': '125.6cm',  交叉步长
#     'stepWidth': '12.3cm',         步宽
#     'walkingSpeed': '1.23m/s',     步速
#     'leftFPA': '8.5°',             左脚足偏角
#     'rightFPA': '9.2°',            右脚足偏角
#     'doubleContactTime': '0.12s',  双支撑时间
# }

fpa = get_fpa_per_step(result)
# → {'left': [8.2, 9.1, 7.5, ...], 'right': [9.0, 8.8, 9.5, ...]}
# 每步的足偏角(FPA)

balance = get_balance(result)
# → {'left': {'整足平衡': {'峰值', '均值', '标准差'}, '前足平衡': {...}, '足跟平衡': {...}},
#     'right': {...}}

ts = get_time_series(result)
# → {'left': {'time': [...], 'area': [...], 'force': [...],
#              'copSpeed': [...], 'pressure': [...]},
#     'right': {...}}

features = get_partition_features(result)
# → {'left': [{'压力峰值', '冲量', '负载率', '峰值时间_百分比', '接触时间_百分比'}, ×6],
#     'right': [...]}
# 6 分区: S1(大拇趾) S2(2~5趾) S3(前足) S4(中足) S5(外侧跟) S6(内侧跟)

curves = get_partition_curves(result)
# → {'left': [{'data': [...]}, ×6], 'right': [...]}

coords = get_region_coords(result)
# → {'left': {'S1': [[x,y],...], 'S2': [...], ..., 'S6': [...]},
#     'right': {...}}

support = get_support_phases(result)
# → {'left': {'支撑前期': {'时长ms', '平均COP速度(mm/s)', '最大面积cm2', '最大负荷'},
#              '支撑初期': {...}, '支撑中期': {...}, '支撑末期': {...}},
#     'right': {...}}

cycle = get_cycle_phases(result)
# → {'left': {'双脚加载期': {...}, '左脚单支撑期': {...},
#              '双脚摇摆期': {...}, '右脚单支撑期': {...}},
#     'right': {...}}

imgs = get_images(result)
# → {
#     'pressureEvolution': 'base64...',     动态压力演变 (2×10网格)
#     'gaitAverage': 'base64...',           步态平均热力图+COP轨迹
#     'footprintHeatmap': 'base64...',      足迹热力图+FPA线
#     'timeSeries': 'base64...',            时序曲线图
#     'leftPressureRegions': 'base64...',   左脚分区热力图
#     'rightPressureRegions': 'base64...',  右脚分区热力图
#     'leftPartitionCurves': 'base64...',   左脚分区曲线
#     'rightPartitionCurves': 'base64...',  右脚分区曲线
# }
```

#### HTTP 接口

```
POST /analyze-gait (multipart/form-data)
  - file1: 第1块板 CSV
  - file2: 第2块板 CSV
  - file3: 第3块板 CSV
  - file4: 第4块板 CSV

→ { "success": true, "data": { ... } }
```

#### 输出能力总结

| 能力 | 说明 |
|------|------|
| 基本步态参数 | 步长、步速、步宽、步频、足偏角(FPA)、双支撑时间 |
| 每步 FPA | 逐步足偏角列表 |
| 平衡分析 | 整足/前足/足跟的峰值、均值、标准差 |
| 时序曲线 | 面积、力、COP 速度、压力的时间序列 |
| 6 分区分析 | S1-S6 各区的压力峰值、冲量、负载率 |
| 6 分区曲线 | 各区压力随时间变化 |
| 支撑相分析 | 支撑前期/初期/中期/末期的时长和特征 |
| 步态周期分析 | 双脚加载/单支撑/摇摆各期的时长和特征 |
| 8 张分析图片 | 压力演变、步态平均、足迹热力图、分区图等 |

---

## 辅助工具文件

### `layout_config.py`

PDF 报告的布局配置类，定义了：
- A4 横向页面尺寸 (29.7cm × 21cm)
- 边距、字体、颜色方案
- 热力图网格布局位置
- 提供 `LayoutConfig`、`CompactLayoutConfig`、`LargeLayoutConfig` 三种预设

仅被 `generate_sit_stand_pdf_v3.py` 导入使用，无需直接调用。

### `heatmap_renderer.py`

通过 Playwright 无头浏览器渲染热力图：

```python
import asyncio
from heatmap_renderer import generate_heatmap_png

# 异步调用
png_path = asyncio.run(generate_heatmap_png(
    peak_arr,          # list, 4096 个压力值
    output_path,       # str, 输出 PNG 路径
))
```

> 需要安装 Playwright 和 Chromium，依赖外部网页 `https://sensor.bodyta.com/4096pdf/`。

---

## 综合指标研究模块

### `Comprehensive_Indicators_4096_modify_input.py` (2650行)

这是一个**独立的高级研究模块**，包含更全面的生物力学分析算法：

- 步态参数：步长、步速、对称性、步频检测
- COP 分析：轨迹、速度、加速度
- 压力分布：足弓区域识别、平衡指标
- 时间分析：接触相、摆动相、双支撑时间
- 频率分析：FFT 功率谱
- 稳定性指标：ML/AP 摇摆、熵指标
- 运动变异性：步间变异分析

> ⚠️ 此模块目前**未被 api_server.py 集成**，属于研究/开发阶段代码。如需使用，需直接导入其中的函数。

---

## 统一调用示例

### 场景：在一个脚本中调用所有评估

```python
import sys
sys.path.insert(0, 'algorithms')

# ========== 1. 握力评估 ==========
from glove_render_data import generate_grip_report, get_overview, get_finger_data

grip_result = generate_grip_report(
    sensor_data=glove_sensor_array,   # [N, 256]
    hand_type='右手',
)
print("握力总力:", get_overview(grip_result)['totalForce'], "N")
print("各指力量:", [(f['name'], f['force']) for f in get_finger_data(grip_result)])


# ========== 2. 起坐评估 ==========
from sit_stand_render_data import generate_sit_stand_report, get_duration_stats

ss_result = generate_sit_stand_report(
    stand_data=stand_pad_array,       # [N, 4096]
    sit_data=sit_pad_array,           # [M, 1024]
)
print("坐站次数:", get_duration_stats(ss_result)['num_cycles'])


# ========== 3. 静态站立评估 ==========
from one_step_render_data import generate_standing_report, get_arch_overview, get_cop_time_series

stand_result = generate_standing_report(
    data_array=standing_pressure_array,  # [N, 4096]
    fps=42,
)
arch = get_arch_overview(stand_result)
print("左足弓类型:", arch['left']['archType'])
print("COP 路径长度:", get_cop_time_series(stand_result)['pathLength'], "mm")


# ========== 4. 步态分析 ==========
from gait_render_data import generate_gait_report, get_gait_params

gait_result = generate_gait_report(
    board_data=four_board_data,       # list[list[str]], 4块板
    board_times=four_board_times,     # list[list[str]], 4块板时间
)
params = get_gait_params(gait_result)
print("步速:", params.get('walkingSpeed'))
print("步宽:", params.get('stepWidth'))
```

> 注意：4 种评估使用**完全不同的传感器数据**，必须分别调用，无法用一份数据获得全部结果。

---

## API 接口一览

| 端点 | 方法 | 数据格式 | 输入 | 输出 |
|------|------|----------|------|------|
| `/health` | GET | - | 无 | `{status: "ok"}` |
| `/analyze-grip` | POST | JSON | csv_content + hand_type | 握力分析结果 |
| `/analyze-sitstand` | POST | multipart | stand_file + sit_file + username | 起坐分析结果 |
| `/generate-sitstand-video` | POST | multipart | stand_file + sit_file | 视频 URL |
| `/analyze-standing` | POST | multipart | csv_file + fps + threshold_ratio | 站立分析结果 + 图片 |
| `/analyze-gait` | POST | multipart | file1 ~ file4 (4块板 CSV) | 步态分析结果 |

启动命令：
```bash
cd algorithms
pip install -r requirements.txt
python api_server.py
# 默认运行在 http://127.0.0.1:8765
```

---

## 数据格式参考

### 手套传感器 CSV 格式 (握力)
```csv
sensor_data_calibrated,relative_time,imu_data_calibrated
"[23,45,0,...共256个值]",0.000,"[0.98,0.01,0.02,0.15]"
"[24,46,0,...共256个值]",0.010,"[0.98,0.01,0.02,0.15]"
```

### 压力垫 CSV 格式 (站立/起坐/步态)
```csv
data,time
"[0,0,5,12,...共4096个值]",2025/12/06 17:07:33:840
"[0,0,6,13,...共4096个值]",2025/12/06 17:07:33:864
```

### 坐垫 CSV 格式 (起坐)
```csv
data,time
"[0,0,5,12,...共1024个值]",2025/12/06 17:07:33:840
```
