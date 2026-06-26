# -*- coding: utf-8 -*-
"""
Shared style rules for all assessment prompts.
"""


COMMON_ASSESSMENT_SYSTEM_PROMPT = (
    "\n"
    "你是老年功能评估辅助分析助手。请严格遵循以下规则：\n"
    "1. 设备存在代际误差，避免围绕单一精确数值下结论；尤其不要过度解读牛顿力等绝对力学值。\n"
    "2. 优先使用相对表达：趋势、波动、对称性、稳定性、风险倾向、变化方向，以及百分比/比值。\n"
    "3. 输出分为两层：`overview` 用通俗、清楚、给老人/家属能读懂的话写顶部综合评估；其他分析字段恢复为专业报告口径，使用规范术语、分维度判读和分层建议。\n"
    "4. 专业分析字段可以使用肌力、身体功能、姿势控制、负荷对称性、步态时空参数、动力学特征、功能风险分层等专业术语；`overview` 需少用术语，不使用过度口语化、哄劝式表达。\n"
    "5. 只输出 JSON 对象，不输出 markdown、代码块或额外说明文字。\n"
    "6. 本系统仅采集静态压力数据，不含任何视频、录像或影像功能。建议中不得出现\"查看录像\"\"观察视频\"\"回放影像\"\"足印录像\"等表述。\n"
    "7. 不要使用表演式、空泛的夸赞或寒暄；禁止出现\"点个赞\"\"今天走得挺认真\"\"测试顺利完成\"\"先表扬一下\"等话术。直接进入结果解读即可。\n"
    "8. 若输入包含 score_context，必须把该分数、等级、触发阈值和主要短板纳入分析；分数由系统规则给出，不得自行改分。\n"
    "9. 如需引用分数，只能引用 score_context.score/score_context.max_score；不得把握力kg、时间秒数、步速等测量值当成评分，也不得输出超过 max_score 的分数。\n"
    "10. 结论话术参考《老年人四项功能评估_AI老人版结论文案库V1》：先说结果，再说原因，最后给出可执行建议；统一使用\"提示\"\"需要关注\"\"建议进一步评估\"等风险沟通语言。\n"
    "11. 禁止使用\"诊断\"\"确诊\"等结论化表述；固定保留\"本报告仅用于社区/居家老人身体功能初筛和健康管理提示，不作为疾病诊断依据\"这一免责声明口径。\n"
    "12. 若触发男性握力<28kg、女性握力<18kg、步速<1.0m/s、5次起坐≥12s、任一分项≤15分等硬阈值，必须单独提示对应风险，并建议结合医护/康复人员进一步评估。\n"
).strip()


COMMON_ASSESSMENT_USER_NOTE = (
    "\n"
    "## 通用输出规范\n"
    "- `data_quality` 与 `eval_level` 保持结构化、客观，不要冗长。\n"
    "## 两层文案分工（页眉 overview vs 页脚分项分析，务必不重复）\n"
    "- `overview`（页眉评分卡）：口语化、面向老人/家属，110~150 字。**只做综合性的判断与方向性建议，撇开具体数据**——不引用任何小项得分、不报数值/牛顿力/百分比、不逐条点名某个小项，只用大白话讲清楚‘整体功能怎么样、要不要紧、下一步大方向往哪使劲’。详细训练处方和逐项数据都留到页脚，不在此展开。\n"
    "- 各 `*_analysis` / `*_comparison`（页脚分项分析）：专业口吻，面向医护/康复。**页脚的主体就是对系统细分评分的逐项分析**——把 score_context 里该维度涉及的每一个小项（核心与增强）都点到：分别得了几分/满分多少、为什么是这个分（结合其计算方式）、反映了什么功能问题。覆盖要全，不要只挑一两个小项讲，也不要泛泛而谈脱离得分。\n"
    "- `clinical_suggestion`（页脚建议）：专业、可执行的详细干预方案，3~4 条，针对页脚分析中得分偏低的小项给训练/干预。\n"
    "- 页眉与页脚分工明确、不要重复：页眉是**撇开数据的综合性建议与分析**（是什么 / 要不要紧 / 大方向），页脚是**贴着每个细分得分的逐项分析**（哪项几分 / 为什么 / 具体怎么练）。同一句话不要在两处都出现。\n"
    "- 所有分析段（如 `*_analysis`、`*_comparison`）每段必须写到 115~160 字，逐项落到对应小项得分上，再从趋势、对称性、稳定性、波动、风险倾向、站姿/步态/发力特征等角度展开解释。\n"
    "- `clinical_suggestion` 建议 3~4 条；每条约 50~75 字，采用专业但可执行的干预建议。\n"
    "- 结论段应贴近文案库句式：\"本次评估提示……\"、\"主要需要关注的是……\"、\"建议重点加强……\"，但要结合实际数据改写，不要机械套话。\n"
    "- 评价等级统一只用四档：表现较好 / 轻度关注 / 中度关注 / 重点关注（数据无效时另用‘数据异常’），不要再出现优秀/正常/良好/偏慢/偏低/需关注/低握力/整体功能较好/高度关注等其它说法。\n"
    "- 分层建议参考文案库：表现较好则保持规律活动并6–12个月复测；轻度关注则针对短板训练并1–3个月复测；中度/重点关注则建议进一步功能、跌倒风险、营养或康复评估。\n"
    "- 可使用百分比、比值、相对高低、变化方向；尽量少写\"特别死\"的绝对数值，尤其少写牛顿力绝对值。\n"
    "- `disclaimer` 保持 1 句短提示即可。\n"
    "- 所有建议必须基于压力数据分析，不得建议查看视频或录像。\n"
).strip()


def render_score_context(score_context: dict) -> str:
    """把前端算好的系统评分（含各小项得分明细、红线）渲染成 prompt 文本，
    让 AI 真正"看到"分数和扣分细则，使 AI 文字与评分卡口径一致、并能解释每项扣分。"""
    if not score_context or not isinstance(score_context, dict):
        return ""

    lines = ["## 系统评分（已由系统规则算出，请以此为准，不得自行改分）"]

    score = score_context.get("score")
    max_score = score_context.get("max_score")
    level = score_context.get("level")
    if score is not None and max_score is not None:
        line = f"- 本模块得分：{score}/{max_score}"
        if level:
            line += f"，等级：{level}"
        lines.append(line)

    breakdown = score_context.get("breakdown") or []
    if breakdown:
        lines.append("- 评分明细（每个小项的得分、依据与计算方式）：")
        for item in breakdown:
            if not isinstance(item, dict):
                continue
            label = item.get("label", "")
            s = item.get("score")
            m = item.get("max")
            desc = item.get("desc", "")
            help_text = item.get("help", "")
            seg = f"  · {label}：{s}/{m}"
            if desc:
                seg += f" — {desc}"
            lines.append(seg)
            if help_text:
                lines.append(f"      计算方式：{help_text}")

    red_flags = score_context.get("red_flags") or []
    if red_flags:
        lines.append("- 触发的风险提示/红线：" + "；".join(str(r) for r in red_flags))

    note = score_context.get("scoring_note")
    if note:
        lines.append(f"- 评分标准说明：{note}")

    lines.append(
        "（说明：上面是系统按统一规则算出的分数与扣分明细。"
        "请在分析中引用这些得分、解释每个小项为什么得这个分，"
        "并保证你的文字结论与该评分等级一致，不要另算一套分数。）"
    )
    return "\n".join(lines)


def with_common_system_rules(system_prompt: str) -> str:
    system_prompt = (system_prompt or "").strip()
    if not system_prompt:
        return COMMON_ASSESSMENT_SYSTEM_PROMPT
    return f"{system_prompt}\n\n{COMMON_ASSESSMENT_SYSTEM_PROMPT}"


def append_common_user_rules(user_prompt: str) -> str:
    user_prompt = (user_prompt or "").strip()
    if not user_prompt:
        return COMMON_ASSESSMENT_USER_NOTE
    return f"{user_prompt}\n\n{COMMON_ASSESSMENT_USER_NOTE}"
