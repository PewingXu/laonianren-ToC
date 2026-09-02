"""
行走步态报告 —— toC（给老人和家属看）的 AI 文案 prompt。

前端消费口径（mapGaitReport.js）—— 三块，校验最严
-----------------------------------------------------------------
1. assessmentSummary = { body, strength }
   - body     一段评估摘要（拿不到时兜底「暂无详细评估摘要。」）
   - strength 一句话概括强项（兜底「数据不足」）
2. scoreExplanation  一段评分说明（兜底「暂无评分说明。」）
3. recommendations   必须**正好 3 条**，每条 { id, title, description, icon, tone }
   - icon 只能是 walking / stretch / water
   - tone 只能是 green / orange / blue
   任一条不合规 → 整个数组丢弃（mapRecommendations 返回 []）

步态实测能拿到的指标（handoff §9）
-----------------------------------------------------------------
步速、步频、步幅、步宽、双支撑时间、足偏角、左右步长差、左右步时差、路径偏移。
文案只围绕这些写。

写作要求：人话
-----------------------------------------------------------------
不要写「双支撑相占比」「足偏角对称性」「步态时空参数」；
要写「走路快慢」「两步之间跨多大」「走起来两边是不是一样」「走直线偏不偏」。
"""

from __future__ import annotations


GAIT_TOC_SYSTEM_PROMPT = """你在帮老人看「走路（步态）」的检测报告，读的人是老人自己和他的子女。

## 说话方式（最重要）
- 像社区医生面对面说话，平实、具体。
- 禁止出现：双支撑相、足偏角、时空参数、步态周期、对称性指数、
  运动链、功能分层、评估维度、综合研判、建议结合专业人员意见。
- 该说「走路速度」就别说「步行速度参数」；
  该说「一步跨多大」就别说「步幅长度」；
  该说「走起来左右不太一样」就别说「存在步态不对称」。
- 不吓人，也不粉饰。走得慢就说慢意味着什么、怎么练能快。

## 数字怎么用
- 只用给你的数据。没给的指标一个字都不要提，不要写「未知」「暂无」。
- 速度用「米/秒」，步频用「步/分」，长度按给你的单位写。
- 日常步速 1.0 米/秒是一条常用的参考线，可以拿它做对照，但要说成
  「一般把每秒 1 米当作参考线」，不要写成诊断标准。

## 数据无效时
如果告诉你数据无效：body 直接说这次没测准和可能原因，strength 写「数据不足」，
scoreExplanation 说明为什么算不出分，recommendations 三条都围绕「怎么把测试做对」。

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


def build_gait_toc_user_prompt(patient_info: dict, summary: dict) -> str:
    """
    Args:
        patient_info: { name, gender, age }
        summary: 前端算好的事实摘要，期望字段：
            is_valid            bool
            speed_mps           float  步速（米/秒）
            speed_reference     float  参考线（一般 1.0）
            cadence_spm         float  步频（步/分）
            step_length_m       float  步幅（米）
            step_width_cm       float  步宽（厘米）
            double_support_s    float  双脚同时着地时间（秒）
            step_length_diff    float  左右步长差
            step_time_diff      float  左右步时差
            path_deviation_cm   float  走直线的偏移（厘米）
            score               int
            score_max           int
            grade               str
            red_flags           list
            invalid_reason      str
    """
    name = patient_info.get("name") or "这位长辈"
    is_valid = summary.get("is_valid", True)

    facts = [
        _line("姓名", name),
        _line("性别", patient_info.get("gender")),
        _line("年龄", _fmt(patient_info.get("age"), 0, " 岁")),
    ]

    if is_valid:
        facts += [
            _line("走路速度", _fmt(summary.get("speed_mps"), 2, " 米/秒")),
            _line("常用参考线", _fmt(summary.get("speed_reference"), 1, " 米/秒")),
            _line("步频", _fmt(summary.get("cadence_spm"), 0, " 步/分")),
            _line("一步跨多大", _fmt(summary.get("step_length_m"), 2, " 米")),
            _line("两脚左右间距", _fmt(summary.get("step_width_cm"), 1, " 厘米")),
            _line("双脚同时着地时间", _fmt(summary.get("double_support_s"), 2, " 秒")),
            _line("左右步长差", _fmt(summary.get("step_length_diff"), 2)),
            _line("左右步时差", _fmt(summary.get("step_time_diff"), 2)),
            _line("走直线的偏移", _fmt(summary.get("path_deviation_cm"), 1, " 厘米")),
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

    return f"""下面是 {name} 这次走路检测的结果，请写成给他和家人看的报告文案。

## 这次测出来的数据
{fact_block}

## 要写的内容
严格按这个 JSON 返回：
{{
  "assessmentSummary": {{
    "body": "一整段话，100-150 字。先给结论（走得快不快、稳不稳、两边是否一样），再说结论怎么来的（引用上面的数据、跟参考线比），最后说这对日常生活意味着什么——比如过马路来不来得及、买菜走一段累不累、上下台阶稳不稳。说人话，不要分点。",
    "strength": "一句话说这次表现最好的一项是什么，12-24 字。例如「走起来左右很匀，节奏稳」。"
  }},
  "scoreExplanation": "一段话，60-100 字。用大白话说这个分是怎么来的——主要看走路速度，另外看节奏、步子大小、左右是否匀称。让人知道分数不是随便给的。",
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
"""
