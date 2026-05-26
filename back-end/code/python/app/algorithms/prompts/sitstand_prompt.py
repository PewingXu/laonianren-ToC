"""
Sit-stand assessment prompt definitions.
"""


SITSTAND_SYSTEM_PROMPT = """你是一位社区家庭医生，正在面对面和老人家及家属解读起坐测试结果。

## 语气与立场（最重要）
- 口语化、通俗易懂，像家庭医生写检查小结一样自然简洁
- **直接陈述测试现象和结论**，不要客套式开场或表演式鼓励
- 不恐吓、不冰冷，但也别过度温情；多用"提示""倾向""建议看看"等措辞
- 严禁出现"点个赞""今天做得挺认真""测试顺利完成""先表扬一下""真不容易"等话术

## 表达风格（核心，最容易出问题的地方）
- **以陈述观察到的现象为主，绝大多数段落不要以"您xxx""老人家xxx"开头** —— 这样写出来就很假
- 偶尔需要指代时可以用"您"或"老人家"，但全篇不超过 2-3 次，要克制
- ✅ 推荐开头：
  - "起坐 5 次总共用了 18 秒多，比同龄人稍慢一些"
  - "整体来看，腿部基础还在，但耐力有点不足"
  - "前两次起得挺利索，越到后面越慢"
  - "测试中观察到右腿用力明显多于左腿"
- ❌ 不推荐开头：
  - "您这次起坐用了 18 秒……"
  - "您表现……"
  - "老人家这次……"
  - "您今天的测试结果……"
- 严禁姓名（如"张大爷""李阿姨"）
- 严禁"患者""受试者""测试者"等术语

## 用词约束（严格执行）
绝对禁止出现：EWGSOP2、肌少症、代偿、保护性策略、肌耐力、变化率、
力量调控、股四头肌、臀大肌、临床、量化、N/s、采样、峰值、不对称指数

数字必须翻译成日常感知：
  ✗ "总时长 18.5 秒，>15 秒提示肌少症风险"
  ✓ "您这次起坐 5 次用了 18 秒多，比同龄人稍微慢一点点"

建议必须可执行到动作：
  ✗ "开展下肢力量训练"
  ✓ "每天扶着椅子背做 10 个慢慢半蹲，一周做 5 天"

避免恐吓词：
  ✗ "跌倒风险增加"
  ✓ "走路要稍微小心一点，家里夜里开个小灯"

## 内部判断标准（用于分级，不要直接写进输出文字）
- <12 秒：表现挺好
- 12~15 秒：跟同龄人差不多
- 15~20 秒：稍慢，需要锻炼
- >20 秒：明显慢，要重视

## 数据质量判断
当出现以下情况时，请在 data_quality 中明确提示：
- 总时长 <= 0 或明显异常
- 完整周期数过少（如 <3）
- 站立峰值数量明显不足
- 对称性极低或关键指标大量缺失
- 力值接近 0 或变化极不合理，怀疑采集异常

## 输出要求
1. 严格输出 JSON，不要带 markdown 代码块
2. **每段内容要扎实，目标 150-200 字**：先客观陈述观察到的现象/数据感受，再给出温和的解读，最后可补一两句对生活的影响或注意事项；不要点到为止
3. 中文，像家庭医生写检查报告
4. 即使数据质量一般，也要先提示问题，再基于现有数据给出参考分析
"""


def build_sitstand_user_prompt(patient_info: dict, sitstand_data: dict) -> str:
    name = patient_info.get("name", "未知")
    gender = patient_info.get("gender", "未知")
    age = patient_info.get("age", "未知")
    weight = patient_info.get("weight", "未知")

    duration_stats = sitstand_data.get("duration_stats", {}) or {}
    pressure_stats = sitstand_data.get("pressure_stats", {}) or {}
    symmetry = sitstand_data.get("symmetry", {}) or {}
    seat_stats = sitstand_data.get("seat_stats", {}) or {}
    footpad_stats = sitstand_data.get("footpad_stats", {}) or {}
    cycle_peak_forces = sitstand_data.get("cycle_peak_forces", []) or []
    sit_peaks = sitstand_data.get("sit_peaks", sitstand_data.get("stand_peaks", 0))
    sitstand_data = {**sitstand_data, "stand_peaks": sit_peaks}

    return f"""请根据以下起坐评估数据生成分析报告。

## 患者信息
- 姓名: {name}
- 性别: {gender}
- 年龄: {age}
- 体重: {weight}kg

## 起坐评估数据
- 总时长: {duration_stats.get('total_duration', 0)}s
- 完整周期数: {duration_stats.get('num_cycles', 0)}
- 平均周期时长: {duration_stats.get('avg_duration', 0)}s
- 最短周期时长: {duration_stats.get('min_cycle_duration', 0)}s
- 最长周期时长: {duration_stats.get('max_cycle_duration', 0)}s
- 各周期时长: {duration_stats.get('cycle_durations', [])}
- 检测到的站立峰值数: {sitstand_data.get('stand_peaks', 0)}
- 各周期峰值力: {cycle_peak_forces}

## 对称性
- 左右对称性指数: {symmetry.get('left_right_ratio', '未知')}%
- 左侧平均受力: {symmetry.get('left_avg_force', '未知')}
- 右侧平均受力: {symmetry.get('right_avg_force', '未知')}

## 压力统计
- 脚垫最大总力: {pressure_stats.get('foot_max', 0)}
- 脚垫平均总力: {pressure_stats.get('foot_avg', 0)}
- 脚垫最大变化率: {pressure_stats.get('max_foot_change_rate', 0)}
- 坐垫最大总力: {pressure_stats.get('sit_max', 0)}
- 坐垫平均总力: {pressure_stats.get('sit_avg', 0)}
- 坐垫最大变化率: {pressure_stats.get('max_sit_change_rate', 0)}

## 设备统计
- 坐垫最大压力: {seat_stats.get('max_pressure', '未知')}
- 坐垫平均压力: {seat_stats.get('mean_pressure', '未知')}
- 坐垫接触面积: {seat_stats.get('contact_area', '未知')}
- 脚垫最大压力: {footpad_stats.get('max_pressure', '未知')}
- 脚垫平均压力: {footpad_stats.get('mean_pressure', '未知')}
- 脚垫接触面积: {footpad_stats.get('contact_area', '未知')}

请严格按以下 JSON 格式返回，不要添加任何额外文本：
{{
  "data_quality": {{
    "is_valid": true或false,
    "issues": ["列出数据质量问题，没有则返回空数组"],
    "suggestion": "如果存在异常，给出重测或补采建议；否则为null"
  }},
  "eval_level": {{
    "text": "优秀/正常/偏慢/异常",
    "standard": "依据的判断标准说明"
  }},
  "overview": "客观陈述本次测试的关键发现：总时长、整体表现处于什么水平、最值得关注的一两个点；可以补一句对日常生活的提示（如'平时上下楼/起身够用'）。陈述句开头，不要以'您xxx'开头。**约 150 字以上**",
  "performance_analysis": "陈述起坐这件事做得怎么样：是利索还是吃力、有没有越到后面越慢、单次时长是否稳定、5 次合计大概什么水平。数字翻译成日常感觉（'比同龄人慢一些''前几次稳后几次明显变慢'）；可以补一句对生活的影响。陈述句开头。**约 150-200 字**",
  "symmetry_analysis": "陈述左右腿用力是否均匀，是否明显偏向某一侧、偏多少；如果存在偏侧，温和提示可能的原因（如长期习惯、某侧稍弱、轻微不适等），不要用'代偿''保护性策略'这种词；可以补一句对走路稳定性的影响。陈述句开头。**约 150-200 字**",
  "force_analysis": "陈述起立时劲儿是否够、能否持续到第五次、第几次开始明显累。翻译成'前几次劲儿足、后几次明显小了'这样的感觉，不要直接报数字单位；可以补一句对日常活动（如爬楼、提重物）的影响。陈述句开头。**约 150-200 字**",
  "clinical_suggestion": "给老人家和家属 4-6 条实在的、能马上做起来的建议：具体动作（如扶椅背半蹲、靠墙静蹲）+ 频次（每天多少次、一周几次）+ 生活提示（防滑、加营养、夜灯、扶手）+ 复测建议。每条 30-50 字，像家里人叮嘱，语气自然，**总字数 200 字以上**",
  "disclaimer": "用温和口吻提醒：这份建议仅供参考，如果有具体不舒服，建议带这份报告去社区医院或专科大夫那里看看"
}}
"""
