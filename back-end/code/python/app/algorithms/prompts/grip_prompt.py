"""
Grip assessment LLM prompt helpers.
"""

from __future__ import annotations


GRIP_SYSTEM_PROMPT = """你是一位社区家庭医生，正在面对面和老人家及家属解读握力测试结果。

## 语气与立场（最重要）
- 口语化、通俗易懂，像家庭医生写检查小结一样自然简洁
- **直接陈述测试现象和结论**，不要客套式开场或表演式鼓励
- 不恐吓、不冰冷，但也别过度温情；多用"提示""倾向""建议看看"等措辞
- 严禁出现"点个赞""今天握得挺认真""测试顺利完成""先表扬一下""真不容易"等话术

## 表达风格（核心，最容易出问题的地方）
- **以陈述观察到的现象为主，绝大多数段落不要以"您xxx""老人家xxx"开头** —— 这样写出来很假
- 偶尔需要指代时可以用"您"或"老人家"，但全篇不超过 2-3 次，要克制
- ✅ 推荐开头：
  - "左手最大能握出 22 公斤的劲儿，比同龄男性稍弱一些"
  - "整体来看，握力基础不错，但右手有点发抖"
  - "两只手相比，右手明显更有劲"
  - "测试中观察到拇指出力明显偏少"
- ❌ 不推荐开头：
  - "您左手握出了 22 公斤……"
  - "您这次握得……"
  - "老人家这次握力……"
- 严禁姓名（如"张大爷""李阿姨"）
- 严禁"患者""受试者""测试者"等术语

## 用词约束（严格执行）
绝对禁止出现：AWGS、肌少症、握力衰减、神经系统量化筛查、临床、量化、采样、
姿态角、Roll/Pitch/Yaw、角速度、欧拉角、代偿、保护性策略

数字必须翻译成日常感知：
  ✗ "左手峰值握力 22kg，<28kg 提示握力偏低"
  ✓ "您左手最大能握出 22 公斤的劲儿，比同龄男性稍微弱一些"

抖动相关也要用大白话：
  ✗ "三轴姿态角范围较大，最大角速度提示手部稳定性下降"
  ✓ "握的时候手有点轻微发抖，劲儿不太稳"

建议必须可执行：
  ✗ "开展手部肌力训练"
  ✓ "每天捏几次软橡皮球，每次 30 下、双手各 3 组"

避免恐吓词：
  ✗ "提示帕金森早期风险"
  ✓ "握的时候手有点抖，可以找医生看一下"

## 内部判断标准（用于分级，不直接写进输出文字）
握力判断基于年龄性别群体的常见水平：
- 男性最大握力 ≥ 28 公斤：表现挺好
- 男性最大握力 < 28 公斤：稍弱，需要锻炼
- 女性最大握力 ≥ 18 公斤：表现挺好
- 女性最大握力 < 18 公斤：稍弱，需要锻炼

## 分析要求
1. 左右手必须分开讲，不能揉成一段
2. 如果同时有左右手，要单独写一段双手对比（哪边更有劲、差距大不大）
3. 如果某一侧没数据，要直接说明缺失，不要编造
4. 数据质量有问题，优先在 data_quality 提示并给重测建议

## 输出要求
1. 严格 JSON，不要带 markdown 代码块
2. **每段内容要扎实，目标 150-200 字**：先客观陈述观察到的现象/数据感受，再给出温和的解读，最后可补一两句对生活的影响或注意事项；不要点到为止
3. 中文，像家庭医生写检查报告
"""


def _round(value, digits: int = 2):
    if isinstance(value, (int, float)):
        return round(float(value), digits)
    return value


def _normalize_range(range_info):
    if not isinstance(range_info, dict):
        return "未知"

    minimum = range_info.get("min")
    maximum = range_info.get("max")
    if minimum is None or maximum is None:
        return "未知"
    return f"{minimum} ~ {maximum}"


def _normalize_legacy_payload(grip_data: dict) -> dict:
    hand_type = str(grip_data.get("hand_type", "") or "")
    normalized = {
        "hand_type": hand_type or "左手",
        "peak_force": grip_data.get("peak_force", 0),
        "peak_force_kg": _round((grip_data.get("peak_force", 0) or 0) / 9.8, 2),
        "total_force": grip_data.get("total_force", 0),
        "total_area": grip_data.get("total_area", 0),
        "total_frames": grip_data.get("total_frames", 0),
        "time_range": grip_data.get("time_range", "-"),
        "fingers": grip_data.get("fingers", []),
        "grip_start_time": grip_data.get("grip_start_time", "未知"),
        "time_to_peak": grip_data.get("time_to_peak", "未知"),
        "peak_time": grip_data.get("peak_time", "未知"),
        "peak_duration": grip_data.get("peak_duration", "未知"),
        "shake_count": grip_data.get("shake_count", 0),
        "avg_angular_velocity": grip_data.get("avg_angular_velocity", 0),
        "max_angular_velocity": grip_data.get("max_angular_velocity", 0),
        "euler_range": grip_data.get("euler_range", {}),
    }

    if "右" in hand_type:
        return {"left_hand": None, "right_hand": normalized, "bilateral_comparison": {}}
    return {"left_hand": normalized, "right_hand": None, "bilateral_comparison": {}}


def _format_fingers(hand_data: dict) -> str:
    fingers = hand_data.get("fingers") or []
    total_force = hand_data.get("total_force") or 0
    if not fingers:
        return "  - 无手指分区数据"

    lines = []
    for finger in fingers:
        force = _round(finger.get("force", 0), 2)
        area = _round(finger.get("area", 0), 2)
        adc = finger.get("adc", 0)
        points = finger.get("points", "-")
        ratio = round((force / total_force) * 100, 1) if total_force else 0
        lines.append(
            f"  - {finger.get('name', '未知部位')}: {force}N，占比 {ratio}%，面积 {area}mm²，ADC {adc}，点位 {points}"
        )
    return "\n".join(lines)


def _format_hand_section(title: str, hand_data: dict | None) -> str:
    if not hand_data:
        return f"""## {title}
- 无该侧数据
"""

    euler_range = hand_data.get("euler_range") or {}
    return f"""## {title}
- 手别: {hand_data.get("hand_type", title)}
- 峰值握力: {_round(hand_data.get("peak_force", 0), 2)}N（约 {_round(hand_data.get("peak_force_kg", 0), 2)}kg）
- 总握力: {_round(hand_data.get("total_force", 0), 2)}N
- 总接触面积: {_round(hand_data.get("total_area", 0), 2)}mm²
- 采样帧数: {hand_data.get("total_frames", 0)}
- 采集时长: {hand_data.get("time_range", "-")}
- 开始发力时间: {hand_data.get("grip_start_time", "未知")}
- 达峰耗时: {hand_data.get("time_to_peak", "未知")}
- 峰值时刻: {hand_data.get("peak_time", "未知")}
- 峰值持续时间: {hand_data.get("peak_duration", "未知")}
- 抖动次数: {hand_data.get("shake_count", 0)}
- 平均角速度: {_round(hand_data.get("avg_angular_velocity", 0), 2)}°/s
- 最大角速度: {_round(hand_data.get("max_angular_velocity", 0), 2)}°/s
- Roll 范围: {_normalize_range(euler_range.get("roll"))}
- Pitch 范围: {_normalize_range(euler_range.get("pitch"))}
- Yaw 范围: {_normalize_range(euler_range.get("yaw"))}
- 手指/掌部受力:
{_format_fingers(hand_data)}
"""


def build_grip_user_prompt(patient_info: dict, grip_data: dict) -> str:
    """Build the grip assessment user prompt."""

    if "left_hand" not in grip_data and "right_hand" not in grip_data:
        grip_data = _normalize_legacy_payload(grip_data)

    left_hand = grip_data.get("left_hand")
    right_hand = grip_data.get("right_hand")
    bilateral = grip_data.get("bilateral_comparison") or {}

    name = patient_info.get("name", "未知")
    gender = patient_info.get("gender", "未知")
    age = patient_info.get("age", "未知")
    weight = patient_info.get("weight", "未知")

    bilateral_lines = [
        f"- 已采集手别: {', '.join(bilateral.get('available_hands', [])) or '未知'}",
        f"- 峰值握力差值: {bilateral.get('peak_force_diff', '未知')}",
        f"- 总握力差值: {bilateral.get('total_force_diff', '未知')}",
        f"- 峰值握力比值: {bilateral.get('peak_force_ratio', '未知')}",
        f"- 总握力比值: {bilateral.get('total_force_ratio', '未知')}",
        f"- 峰值更强侧: {bilateral.get('stronger_hand', '未知')}",
    ]

    return f"""请根据以下握力评估量化数据生成 AI综合评估。

## 患者信息
- 姓名: {name}
- 性别: {gender}
- 年龄: {age}
- 体重: {weight}kg

{_format_hand_section("左手量化数据", left_hand)}
{_format_hand_section("右手量化数据", right_hand)}
## 双手补充对比信息
{chr(10).join(bilateral_lines)}

请严格按以下 JSON 格式返回，不要输出任何额外文字：
{{
  "data_quality": {{
    "is_valid": true,
    "issues": [],
    "suggestion": ""
  }},
  "eval_level": {{
    "text": "正常/偏低/低握力",
    "standard": "采用的判断标准与理由"
  }},
  "overview": "客观陈述本次握力测试的关键发现：左右手大概有多少劲儿、和同龄人比怎么样、最值得关注的一两个点；可以补一句对日常生活（拧瓶盖、提袋子、开门）的提示。陈述句开头，不要以'您xxx'开头。**约 150 字以上**",
  "left_hand_analysis": "只说左手，不带右手；如果左手没数据就直接说明。陈述左手最大有多少劲儿（公斤数翻译成日常感觉）、发力快不快、能握住多久不松、各手指是平均出力还是某根偏弱、有没有发抖；可以补一句对生活的影响（如'拿筷子、握门把基本够用'）。陈述句开头，不要'您'开头。**约 150-200 字**",
  "right_hand_analysis": "只说右手，不带左手；如果右手没数据就直接说明。陈述右手最大有多少劲儿（公斤数翻译成日常感觉）、发力快不快、能握住多久不松、各手指是平均出力还是某根偏弱、有没有发抖；可以补一句对生活的影响。陈述句开头，不要'您'开头。**约 150-200 字**",
  "bilateral_comparison": "陈述左右手对比：哪只手更有劲儿、差距大不大（多少成）、是否符合惯用手分布、对日常使用有什么影响。如果只有一只手的数据就说明无法比较。陈述句开头。**约 130-180 字**",
  "clinical_suggestion": "给老人家和家属 4-6 条实在的、能马上做起来的建议：具体动作（如捏橡皮球、拧毛巾、五指撑桌、握门把锁、扭脱毛巾）+ 频次（每天/每周多少次）+ 营养建议（蛋白质、奶蛋豆肉）+ 复测建议。每条 30-50 字，自然口吻，左右手情况不同时分别说重点，**总字数 200 字以上**",
  "disclaimer": "用温和口吻提醒：这份建议仅供参考，如果有具体不舒服，建议带这份报告去社区医院或专科大夫那里看看"
}}

额外要求：
1. left_hand_analysis 和 right_hand_analysis 必须分别写。
2. 不要把左手和右手揉成一段。
3. bilateral_comparison 只写双手差异。
4. 如果数据异常，先在 data_quality 中指出，再给出保守建议。
"""
