"""
行走步态报告 —— toC（给老人和家属看）的 AI 文案 prompt。

前端消费口径（mapGaitReport.js / useAssessmentAiCopy.js）—— 四块
-----------------------------------------------------------------
1. assessmentSummary = { body, strength }
   - body     一段评估摘要（拿不到时兜底「暂无详细评估摘要。」）
   - strength 一句话概括强项（兜底「数据不足」）
2. scoreExplanation  一段评分说明（兜底「暂无评分说明。」）
3. recommendations   必须**正好 3 条**，每条 { id, title, description, icon, tone }
   - icon 只能是 walking / stretch / water
   - tone 只能是 green / orange / blue
   任一条不合规 → 整个数组丢弃（mapRecommendations 返回 []）
4. healthSummary = { title, body, focusBody }
   - 报告末尾的独立日常活动解读，不复述 assessmentSummary 或评分
   - 三个字段都必须是非空字符串，否则整块使用前端兜底

步态实测能拿到的指标（handoff §9）
-----------------------------------------------------------------
步速、步频、同脚步幅、步宽、双支撑时间、足偏角、左右同脚步幅差、
左右同脚周期差、相邻落脚的步时与间距变异、路径偏移。文案只围绕这些写。

写作要求：人话
-----------------------------------------------------------------
不要写「双支撑相占比」「足偏角对称性」「步态时空参数」；
要写「走路快慢」「同一只脚两次落地之间前进多远」「走起来两边是不是一样」
「走直线偏不偏」。
"""

from __future__ import annotations


GAIT_TOC_SYSTEM_PROMPT = """你在帮老人看「走路（步态）」的检测报告，读的人是受检者本人和家里人。

## 怎么称呼（重要）
- 全文一律用「您」称呼受检者，例如「您这次…」「建议您…」。
- **不知道也不需要知道姓名**。绝对不要写出任何姓名、姓氏或称呼，
  也不要自己造称呼（不许出现「张阿姨」「曹师傅」「李大爷」这类）。
- 不要用「他」「她」「患者」「受检者」这类第三人称指代，直接对「您」说话。

## 说话方式（最重要）
- 像社区医生面对面说话，平实、具体。
- 禁止出现：双支撑相、足偏角、时空参数、步态周期、对称性指数、
  运动链、功能分层、评估维度、综合研判、建议结合专业人员意见。
- 该说「走路速度」就别说「步行速度参数」；
  该说「同一只脚两次落地之间前进多远」就别含混地说成「一步跨多大」；
  该说「走起来左右不太一样」就别说「存在步态不对称」。
- 「步迹中心线偏移」只反映压力步道上的落脚路线，不能写成身体或躯干晃动。
- 「步时/落脚间距变异」只反映本次压力步道上的落脚一致性，不能写成身体晃动或跌倒风险。
- 样本可信度是「样本有限」时必须明确提醒，只能作为本次参考，不能下确定结论。
- 不吓人，也不粉饰。走得慢就说慢意味着什么、怎么练能快。

## 数字怎么用
- 只用给你的数据。没给的指标一个字都不要提，不要写「未知」「暂无」。
- 速度用「米/秒」，步频用「步/分」，长度按给你的单位写。
- 日常步速 1.0 米/秒是一条常用的参考线，可以拿它做对照，但要说成
  「一般把每秒 1 米当作参考线」，不要写成诊断标准。

## 数据无效时
如果告诉你数据无效：assessmentSummary.body 直接说这次没测准和可能原因，strength 写「数据不足」，
scoreExplanation 说明为什么算不出分，recommendations 三条都围绕「怎么把测试做对」。
healthSummary 专注复测准备与后续观察，不据此判断日常活动能力，也不给训练处方。

## 开头摘要与末尾总结分工
- assessmentSummary 用来解释本次实测结论和数据依据。
- healthSummary 用独立标题说明日常活动如何安排，以及接下来具体观察什么、如何复测。
- healthSummary 不重复综合得分、评分构成、步速数字或 assessmentSummary 中的句子。
- 日常活动安排只能作为建议，不能把未测量的耐力、疲劳、疼痛或过马路能力写成已知事实。
- 观察方向写成「留意是否…」「复测时比较…」，不能断言您已经有某种症状。
- 数据或样本有限时明确限制结论；不要把一次压力步道表现推广为日常活动的确定能力。

## 输出
严格返回 JSON，不带 markdown 代码块，不带任何额外文字。
"""


def _fmt(value, digits: int = 1, suffix: str = ""):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return f"{round(float(value), digits):g}{suffix}"
    text = str(value).strip()
    return f"{text}{suffix}" if text else None


def _line(label: str, value) -> str | None:
    formatted = value if isinstance(value, str) else _fmt(value)
    return f"- {label}: {formatted}" if formatted else None


def _confidence_text(value):
    if value == "limited":
        return "样本有限，只作本次参考"
    if value == "standard":
        return "样本量达到当前算法要求"
    return None


def build_gait_toc_user_prompt(patient_info: dict, summary: dict) -> str:
    """
    Args:
        patient_info: { gender, age } —— name 刻意不用，见文件头「怎么称呼」
        summary: 前端算好的事实摘要，期望字段：
            is_valid            bool
            speed_mps           float  步速（米/秒）
            speed_reference     float  参考线（一般 1.0）
            cadence_spm         float  步频（步/分）
            step_length_m       float  同脚步幅（米）
            step_width_cm       float  步宽（厘米）
            double_support_s    float  双脚同时着地时间（秒）
            step_length_diff    float  左右同脚步幅差（厘米）
            step_time_diff      float  左右同脚周期差（秒）
            step_time_cv_percent float 相邻落脚步时变异系数（百分比）
            step_distance_cv_percent float 相邻落脚间距变异系数（百分比）
            stability_valid_steps int 稳定性计算使用的有效落脚数
            stability_confidence str 稳定性样本可信度（standard/limited）
            path_deviation_cm   float  步迹中心线均方根偏移（厘米；足底步迹代理）
            max_path_deviation_cm float 最大步迹偏移（厘米）
            direction_valid_steps int 方向计算使用的有效落脚数
            direction_confidence str 方向样本可信度（standard/limited）
            score               int
            score_max           int
            grade               str
            red_flags           list
            invalid_reason      str
    """
    is_valid = summary.get("is_valid", True)

    facts = [
        # 刻意不给姓名：给了模型就会写进文案，还会自己造「张阿姨」这类称呼
        _line("性别", patient_info.get("gender")),
        _line("年龄", _fmt(patient_info.get("age"), 0, " 岁")),
    ]

    if is_valid:
        facts += [
            _line("走路速度", _fmt(summary.get("speed_mps"), 2, " 米/秒")),
            _line("常用参考线", _fmt(summary.get("speed_reference"), 1, " 米/秒")),
            _line("步频", _fmt(summary.get("cadence_spm"), 0, " 步/分")),
            _line("平均同脚步幅", _fmt(summary.get("step_length_m"), 2, " 米")),
            _line("两脚左右间距", _fmt(summary.get("step_width_cm"), 1, " 厘米")),
            _line("算法估算双脚同时着地时间", _fmt(summary.get("double_support_s"), 2, " 秒")),
            _line("左右同脚步幅差", _fmt(summary.get("step_length_diff"), 2, " 厘米")),
            _line("左右同脚落地周期差", _fmt(summary.get("step_time_diff"), 2, " 秒")),
            _line("相邻落脚步时变异系数", _fmt(summary.get("step_time_cv_percent"), 1, "%")),
            _line("相邻落脚间距变异系数", _fmt(summary.get("step_distance_cv_percent"), 1, "%")),
            _line("稳定性计算有效落脚数", _fmt(summary.get("stability_valid_steps"), 0, " 次")),
            _line("稳定性样本可信度", _confidence_text(summary.get("stability_confidence"))),
            _line("步迹中心线均方根偏移", _fmt(summary.get("path_deviation_cm"), 1, " 厘米")),
            _line("最大步迹偏移", _fmt(summary.get("max_path_deviation_cm"), 1, " 厘米")),
            _line("方向计算有效落脚数", _fmt(summary.get("direction_valid_steps"), 0, " 次")),
            _line("方向样本可信度", _confidence_text(summary.get("direction_confidence"))),
            _line("这次得分", f"{summary.get('score')} / {summary.get('score_max')} 分"
                  if summary.get("score") is not None else None),
            _line("档位", summary.get("grade")),
        ]
        flags = summary.get("red_flags") or []
        if flags:
            facts.append("- 需要留意: " + "；".join(str(f) for f in flags))
    else:
        facts.append("- 数据有效性: 这次数据无效，不能反映真实走路情况")
        facts.append(_line("无效原因", summary.get("invalid_reason")))

    fact_block = "\n".join(f for f in facts if f)

    return f"""下面是这次走路检测的结果，请写成直接对受检者本人说的报告文案（用「您」称呼）。

## 这次测出来的数据
{fact_block}

## 要写的内容
严格按这个 JSON 返回：
{{
  "assessmentSummary": {{
    "body": "一整段话，80-120 字。专注本次实测结论和数据依据：先说明走路快慢、左右落脚节奏是否接近，再引用上面的实测数据和适用参考线解释。只有给出步迹中心线偏移数据时才能描述本次落脚路线；它不能写成身体或躯干晃动。相邻落脚变异只能说明本次落脚一致性，不能写成跌倒风险。样本可信度为样本有限时必须明确说只作本次参考。没有相关数据时不要自行补结论。日常活动安排留给 healthSummary，不要分点。",
    "strength": "一句话说这次表现最好的一项是什么，12-24 字。例如「走起来左右很匀，节奏稳」。"
  }},
  "scoreExplanation": "一段话，60-100 字。用大白话说这个分是怎么来的——主要看走路速度，另外看节奏、步子大小、左右是否匀称。让人知道分数不是随便给的。",
  "healthSummary": {{
    "title": "8-16 字，概括日常活动的关注重点，不使用评分或数据摘要作标题。",
    "body": "60-100 字，用您能理解的方式说明如何把本次结果用于安排日常出行和活动。与 assessmentSummary 分工，不复述其中的句子，不重复得分、评分构成或步速数字。活动安排写成建议，不虚构耐力、疲劳、疼痛或能否安全过马路等未测事实。样本有限时说明只作本次参考；数据无效时改为复测准备。",
    "focusBody": "40-70 字，给出具体的后续观察和复测方向，例如同样路线下走路节奏是否变化、复测时保持自然速度以便比较。使用留意是否、复测时比较等表达，不断言已有症状，不把压力步道落脚路线等同于身体晃动或跌倒风险；不要套用保持某个强项的模板。"
  }},
  "recommendations": [
    {{ "id": "walk",    "icon": "walking", "tone": "green",  "title": "走路练习的小标题（4-8 字）", "description": "一天走多久、走多快、一周几天，具体到能照做。30-50 字。" }},
    {{ "id": "stretch", "icon": "stretch", "tone": "orange", "title": "拉伸放松的小标题（4-8 字）", "description": "一个具体动作 + 每次多久 + 一周几天。30-50 字。" }},
    {{ "id": "safety",  "icon": "water",   "tone": "blue",   "title": "补水与安全的小标题（4-8 字）", "description": "走之前走之后怎么补水、路上要注意什么才不容易摔。30-50 字。" }}
  ]
}}

## 硬性检查（不满足前端会整块丢掉，白写）
1. recommendations 必须**正好 3 条**，icon 依次是 walking、stretch、water，
   tone 依次是 green、orange、blue —— 这两组值是白名单，写错一个字整个数组作废。
2. 每条 recommendations 的 id、title、description 都要有内容。
3. assessmentSummary 的 body 和 strength 都要有内容。
4. 只用上面给出的数据，不要自己编数字，也不要提没给你的指标。
5. 提到 1 米/秒时要说成「一般把它当参考线」，不要写成诊断标准。
6. healthSummary 的 title、body、focusBody 都必须有内容，且不重复开头的评分、步速数字或摘要句子。
"""
