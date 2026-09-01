# 版本记录

## v6.7 — 修复足弓区域分布图和COP轨迹图数据方向 (2026-02-23)
- **日期**: 2026-02-23
- **Git Tag**: v6.7

### 问题修复
1. **数据方向翻转**: `FootAnalysis.js` 的 `parseFrameData` 函数缺少 `flipUD`（上下翻转）步骤，导致足弓区域分布图和COP轨迹图上下颠倒（趾部显示在下方、后足在上方）
2. **根因**: 对比 huisheng-prototype 原始代码，发现其 `parseFrameData` 在 `rot90` + `flipLR` 之后还执行了 `flipUD`，而我们的版本遗漏了这一步
3. **修复方案**: 在 `parseFrameData` 的 `flipLR` 之后添加 `flipUD`（`matrix.reverse()`），使 row=0 对应趾部（上方），row=63 对应后足（下方）

### 验证结果
| 图表 | 修复前 | 修复后 |
|------|--------|--------|
| 足弓区域分布图 | 趾部在下方，后足在上方 | 趾部在上方，后足在下方 ✅ |
| COP压力中心轨迹 | 足印方向颠倒 | 足印方向正确 ✅ |
| 与huisheng-prototype对比 | 不一致 | 完全一致 ✅ |

### 关键文件
| 文件 | 说明 |
|------|------|
| `src/lib/FootAnalysis.js` | parseFrameData 添加 flipUD 步骤 |

---

## v6.6 — 静态站立评估模拟模式使用真实CSV数据 (2026-02-23)
- **日期**: 2026-02-23
- **Git Tag**: v6.6

### 功能改进
1. **真实数据模拟回放**: 模拟模式不再使用随机数据，改为加载真实CSV数据(sit2026-1-2714-00-59.csv)逐帧回放，164帧×4096压力值
2. **数据预处理**: `convert_standing_csv.py` 将CSV转为紧凑JSON格式(standing_sim_data.json, 1.36MB)
3. **循环回放**: 数据播放完毕后自动从头循环，支持任意时长采集
4. **报告数据真实**: 采集的帧数据直接传入 `generateFootReport`，生成基于真实压力分布的完整报告

### 关键文件
| 文件 | 说明 |
|------|------|
| `convert_standing_csv.py` | CSV→JSON预处理脚本 |
| `public/standing_sim_data.json` | 163帧真实压力数据(每帧4096值) |
| `src/pages/assessment/StandingAssessment.jsx` | handleSimulate改为fetch加载JSON数据逐帧回放 |

---

## v6.5 — 静态站立报告新增足弓区域分布图和COP压力中心轨迹图 (2026-02-23)
- **日期**: 2026-02-23
- **Git Tag**: v6.5

### 新增图表
1. **足弓区域分布图** (`InteractiveArchChart.jsx`): 左右脚像素级区域分布Canvas图表，蓝色(趾部)、绿色(前足)、橙色(中足)、红色(后足)颜色分区，红色虚线分区线，右侧标注区域名称和采样点数，支持鼠标悬停显示区域面积和占比
2. **COP压力中心轨迹图** (`InteractiveCOPChart.jsx`): 左右脚热力图底图(蓝→绿→黄→红渐变) + COP轨迹叠加(红→白渐变表示时间顺序)，支持鼠标悬停显示帧信息和COP坐标

### 数据管线
1. **FootAnalysis.js**: 新增返回 `sectionCoords`(分区坐标)、`leftCopTrajectory`/`rightCopTrajectory`(分脚COP轨迹)、`peakFrameFlat`(峰值帧压力数据)
2. **StandingReport.jsx**: 新增 `rawData` 字段传递原始数据到Canvas图表组件

### 关键文件
| 文件 | 说明 |
|------|------|
| `src/components/report/InteractiveArchChart.jsx` | 足弓区域分布Canvas图表组件 |
| `src/components/report/InteractiveCOPChart.jsx` | COP压力中心轨迹Canvas图表组件 |
| `src/lib/FootAnalysis.js` | 新增sectionCoords/COP轨迹/peakFrame返回 |
| `src/components/report/StandingReport.jsx` | 新增2个图表区域+rawData传递 |

---

## v6.4 — 起坐检测报告集成 + 静态站立报告数据集成 + 设备连接修复 (2026-02-23)
- **日期**: 2026-02-23
- **Git Tag**: v6.4

### 任务1：起坐检测报告集成
1. **数据处理脚本** (`generate_sitstand_report.py`): 解析 stand.csv/sit.csv 原始数据，生成热力图、COP轨迹图、力-时间曲线等图片 + JSON报告数据
2. **SitStandReport组件重写**: 从JSON加载真实数据，展示8个报告区域（基本信息、总体指标、站立压力演变、站立COP轨迹、坐姿压力演变、坐姿COP轨迹、力-时间曲线、综合评估）
3. **页面崩溃修复**: 在 viewReport/stop 函数中添加 stopSimulation() 调用，解决切换报告模式时3D场景未清理导致的页面崩溃

### 任务2：静态站立评估报告数据集成
1. **数据格式转换层**: 在 StandingReport 组件中添加 generateFootReport → 报告格式的转换逻辑
2. **reportData 传递**: StandingAssessment 将 generateFootReport 结果保存到 state 并传递给 StandingReport
3. **完整报告展示**: 12项足弓指标、区域压力分布饼图、COP轨迹/置信椭圆/速度时间序列、14项COP参数表、21项参数说明、综合评估评分

### 任务3：起坐检测设备连接逻辑修复
1. **独立连接按钮**: 头部栏和底部区域均显示独立的"连接坐垫"/"连接脚垫"按钮
2. **状态指示**: 坐垫和脚垫分别用绿点/灰点指示连接状态
3. **渐进连接**: 连接一个设备后提示"还需连接xxx"，并显示对应按钮

### 关键文件
| 文件 | 说明 |
|------|------|
| `generate_sitstand_report.py` | 起坐检测报告数据+图片生成脚本 |
| `public/sitstand_report_data/` | 生成的起坐报告图片和JSON |
| `src/pages/assessment/SitStandAssessment.jsx` | 起坐评估页面（含报告+连接修复） |
| `src/components/report/StandingReport.jsx` | 静态站立报告（含数据格式转换） |
| `src/pages/assessment/StandingAssessment.jsx` | 静态站立评估（reportData传递） |

---

## v6.0 — 步态报告图片生成完整版
- **日期**: 2026-02-22
- **Git Commit**: bd8f17c
- **Git Tag**: v6.0

### 核心功能
1. **四传感器拼接**: 4个64x64传感器通过时间对齐后水平拼接成64x256，旋转为256x64步道矩阵
2. **5级去噪**: 与原始算法包一致（背景基线→死点去除→弱事件过滤→孤立噪声→低值截断）
3. **压力演化图**: 完整支撑相检测（0→峰值→0），智能帧采样（重点展示过渡阶段）
4. **平均步态图**: 统一画布大小（全局最大bbox），COP轨迹叠加（最佳6步）
5. **步道热力图(FPA)**: 基于拼接矩阵绘制，跨传感器步子完整显示
6. **时序曲线**: 完整行走数据，左右脚交替模式（面积/负荷/COP速度/压强），中文标签
7. **分区曲线**: 使用演化图同一步的支撑相数据，6区域（前外/前内/中外/中内/后外/后内）压力变化
8. **分区压力点位图**: 6区域平均压力热力图
9. **3D实时显示**: 传感器顺序修正（4,3,2,1从左到右）

### 关键文件
| 文件 | 说明 |
|------|------|
| `/home/ubuntu/generate_report_v6.py` | 报告图片生成脚本（独立运行） |
| `src/lib/footpad-sdk/components/FootpadScene.js` | 3D传感器顺序修正 |
| `src/pages/assessment/GaitAssessment.jsx` | 步态评估页面（含报告展示） |
| `public/gait_report_data/` | 生成的报告图片和JSON数据 |

---

## v6.1 — 握力报告集成 (2026-02-22)
- **日期**: 2026-02-22
- **Git Commit**: a6a84d26
- **Git Tag**: v6.1

### 新增功能
1. **握力报告生成脚本** (`generate_grip_report.py`): 解析握力手套CSV数据，生成7张报告图片+JSON数据
2. **手部压力分布图** (`generate_hand_pressure.py`): AI生成手掌线框底图，叠加高斯热力图和标注
3. **前端GripReport组件重写**: 从JSON加载真实数据，10个报告章节完整展示

### 报告章节
| 序号 | 章节 | 内容 |
|------|------|------|
| 1 | 基本信息 | 手型、帧数、时间范围、峰值力 |
| 2 | 手部压力分布 | 手掌热力图 + 6部位力值/面积/占比 |
| 3 | 时间分析 | 前置时间、峰值时间、反应时间、持续时间 |
| 4 | 峰值帧数据 | 各部位ADC/力值/面积/点数表格 |
| 5 | 力-时间曲线 | 各手指+手掌+总力随时间变化 |
| 6 | 力分布堆叠图 | 各部位力的堆叠面积图 |
| 7 | 各部位力分布 | 柱状图 + 饼图 |
| 8 | 手部姿态 | 欧拉角(Roll/Pitch/Yaw)曲线 |
| 9 | 抖动检测 | 角速度曲线 + 检测阈值线 |
| 10 | 力占比分析 | 峰值帧各部位力占比饼图 |

### 关键文件
| 文件 | 说明 |
|------|------|
| `/home/ubuntu/generate_grip_report.py` | 握力报告图片+JSON生成脚本 |
| `/home/ubuntu/generate_hand_pressure.py` | 手部压力分布图生成脚本 |
| `src/components/report/GripReport.jsx` | 握力报告前端组件 |
| `public/grip_report_data/` | 生成的报告图片和JSON数据 |

---

## v6.3 — 握力评估3D手部模型+热力图集成 (2026-02-23)
- **日期**: 2026-02-23
- **Git Tag**: v6.3

### 核心功能
1. **GLB手部模型**: 集成用户提供的 `hand0423g.glb` 高精度3D手部模型，替换原有简单几何体
2. **实时热力图纹理**: 基于 `HeatmapCanvas` 库生成热力图纹理，实时贴到3D模型表面
3. **传感器数据映射**: 实现 `mapLeftHand` / `mapRightHand` 函数，将传感器阵列数据映射到手部UV坐标
4. **模拟数据生成**: `generateSimulatedSensorData` 函数生成逼真的握力模拟数据，支持左右手不同分布
5. **压力指示球体**: 采集过程中显示动态压力指示球，颜色随压力值变化

### 关键文件
| 文件 | 说明 |
|------|------|
| `public/assets/hand0423g.glb` | 高精度3D手部GLB模型 |
| `src/components/three/HandModel.jsx` | 重写的HandModel组件（GLB加载+热力图纹理） |
| `src/lib/heatmap.js` | 热力图Canvas生成库 |
| `src/lib/gripDataMapping.js` | 传感器数据→手部UV坐标映射工具 |
| `src/pages/assessment/GripAssessment.jsx` | 集成热力图初始化和模拟数据映射 |

---

## v6.2 — 手部压力图浅色风格优化 (2026-02-22)
- **日期**: 2026-02-22

### 优化内容
1. **浅色风格重构**: 手部压力分布图从深蓝色背景改为白色/浅灰背景，与蔡司报告整体设计风格统一
2. **线框手部模型**: 使用细灰色网格线框手掌轮廓，专业医疗仪器风格
3. **热力图遮罩**: 热力图颜色严格限制在手掌轮廓内，不会溢出到背景
4. **白色卡片标注**: 各手指/手掌标注使用白色圆角卡片+左侧彩色条，清晰易读
5. **色标条优化**: 底部色标条完整显示，蓝→青→绿→黄→红渐变
6. **HandPressureMap组件简化**: 前端组件改为直接加载Python生成的PNG图片，减少SVG渲染复杂度

### 关键文件
| 文件 | 说明 |
|------|------|
| `generate_hand_pressure.py` | 浅色风格手部压力图生成脚本 |
| `src/components/report/HandPressureMap.jsx` | 简化的图片加载组件 |
| `public/grip_report_data/hand_pressure_map.png` | 生成的浅色风格压力图 |

---

### 回滚命令
```bash
cd /home/ubuntu/sarcopenia-react-app
git checkout v6.0   # 回滚v6.0
git checkout v6.1   # 回滚v6.1
```
