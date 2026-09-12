"""
静态站立报告 —— toC（给老人和家属看）的 AI 文案 prompt。

前端消费口径（mapStandingReport.js / useAssessmentAiCopy.js）
-----------------------------------------------------------------
* summary.evaluation ← data.evaluation，是**一整段纯字符串**（不是对象）
* healthSummary = { title, body, focusBody }：末尾独立的通俗总结，三字段完整才采用
* advice ← data.advice，最多取前 3 条，每条 { id, title, detail } 三者都非空才保留
  （不足 3 条也能显示，但少于 1 条这块就空了）

站立模块的数据说明
-----------------------------------------------------------------
站立是四项里文档最薄的一项（BACKEND_HANDOFF.md 没有 standing 章节）。
实测能拿到的主要是：左右脚负重比例、算法选取范围内的 COP 轨迹总长、
足弓指数、足底分区压力。代表侧单足 COP 不能写成整个身体的重心或身体晃动。
文案只围绕这些已给出的指标写，不要提没给的指标。

写作要求：人话
-----------------------------------------------------------------
不要在给用户的文案里堆「COP 轨迹」「压力中心偏移」「足弓形态学分型」；
代表侧单足 COP 可说成「这次记录的一只脚的脚底受力变化」，但不能扩大成身体晃动；
左右承重和足底分区可说「两只脚吃力是不是一边多」「脚掌哪块受力重」。
"""

from __future__ import annotations


STANDING_TOC_SYSTEM_PROMPT = """你在帮老人看「静静站立」的检测报告，读的人是受检者本人和家里人。

## 怎么称呼（重要）
- 全文一律用「您」称呼受检者，例如「您这次…」「建议您…」。
- **不知道也不需要知道姓名**。绝对不要写出任何姓名、姓氏或称呼，
  也不要自己造称呼（不许出现「张阿姨」「曹师傅」「李大爷」这类）。
- 不要用「他」「她」「患者」「受检者」这类第三人称指代，直接对「您」说话。

## 说话方式（最重要）
- 像面对面向老人解释一样，平实、具体，多用短句，一句话只讲一件事。
- 禁止出现：COP、压力中心、足弓形态学、姿态控制、本体感觉、平衡策略、
  功能分层、评估维度、综合研判、建议结合专业人员意见。
- 如果事实标明「代表侧单足 COP」，最多说「这次记录的一只脚的脚底受力变化」，
  不能说成整个身体的重心移动、身体晃动或跌倒风险。
- 该说「左脚用力更多」「两只脚用力差不多」就别说「负荷偏移量」「双侧承重均衡」。
- 不把两只脚用力接近等同于站得稳，也不把脚底受力差异等同于身体不稳。
- 不吓人，也不粉饰。出现需要关注的结果时说清楚意味着什么、怎么练能稳。

## 末尾健康总结怎么写
- healthSummary 是给老人和家属看的日常解释，不重复报告开头的分数、评分构成或轨迹数字。
- 标题直接点出要留意的事，不套用「您的站立能力处于某某范围」。
- 不使用「综合评估」「足底支撑状态」「算法选取」「独立活动能力」等抽象说法。
- 用做饭、排队、穿裤子、换鞋等熟悉场景说明怎么安排站立和休息，不要堆指标。
- focusBody 说具体观察什么，例如「留意是否总有同一只脚酸」「是否比以前更需要扶着东西」。
- 这些只作为观察提醒，不能写成您已经酸痛、乏力、不能久站或容易跌倒等未测事实。
- 只解释已给出的测量。数据不完整时不补充判断，也不要把一次检测说成平时一直如此。

## 数字怎么用
- 只用给你的数据。没给的指标一个字都不要提，不要写「未知」「暂无」。
- 比例说「%」，轨迹总长说「毫米」或「厘米」（按给你的单位写）。
- 两只脚各占多少可以直接说，比如「左脚 53%、右脚 47%，差得不多」。

## 数据无效时
如果告诉你数据无效，evaluation 和 healthSummary 用简单的话说明这次还不能判断、怎么重新测量。
原因只引用已提供的信息，不猜测是受检者站错了。advice 三条都围绕「怎么把测试做对」，不给训练处方。

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


def build_standing_toc_user_prompt(patient_info: dict, summary: dict) -> str:
    """
    Args:
        patient_info: { gender, age } —— name 刻意不用，见文件头「怎么称呼」
        summary: 前端算好的事实摘要，期望字段：
            is_valid          bool
            left_percent      float  左脚负重占比
            right_percent     float  右脚负重占比
            cop_scope         str    "代表侧单足 COP" 或 "整体 COP"
            sway_cm           float  对应范围内的 COP 轨迹总长（cm）
            sway_grade        str    COP 轨迹档位
            left_arch_index   float  左足弓指数
            right_arch_index  float  右足弓指数
            arch_note         str    足弓类型描述
            left_forefoot_percent/right_forefoot_percent  float
            left_midfoot_percent/right_midfoot_percent    float
            left_heel_percent/right_heel_percent          float
            score             int
            score_max         int
            grade             str
            red_flags         list
            invalid_reason    str
    """
    is_valid = summary.get("is_valid", True)

    facts = [
        # 刻意不给姓名：给了模型就会写进文案，还会自己造「张阿姨」这类称呼
        _line("性别", patient_info.get("gender")),
        _line("年龄", _fmt(patient_info.get("age"), 0, " 岁")),
    ]

    if is_valid:
        cop_scope = summary.get("cop_scope") or "COP"
        facts += [
            _line("左脚承重占比", _fmt(summary.get("left_percent"), 1, "%")),
            _line("右脚承重占比", _fmt(summary.get("right_percent"), 1, "%")),
            _line(f"{cop_scope} 轨迹总长", _fmt(summary.get("sway_cm"), 2, " 厘米")),
            _line(f"{cop_scope} 轨迹情况", summary.get("sway_grade")),
            _line("左脚足弓指数", _fmt(summary.get("left_arch_index"), 2)),
            _line("右脚足弓指数", _fmt(summary.get("right_arch_index"), 2)),
            _line("足弓情况", summary.get("arch_note")),
            _line("左脚前足压力占比", _fmt(summary.get("left_forefoot_percent"), 1, "%")),
            _line("左脚中足压力占比", _fmt(summary.get("left_midfoot_percent"), 1, "%")),
            _line("左脚后足压力占比", _fmt(summary.get("left_heel_percent"), 1, "%")),
            _line("右脚前足压力占比", _fmt(summary.get("right_forefoot_percent"), 1, "%")),
            _line("右脚中足压力占比", _fmt(summary.get("right_midfoot_percent"), 1, "%")),
            _line("右脚后足压力占比", _fmt(summary.get("right_heel_percent"), 1, "%")),
            _line("这次得分", f"{summary.get('score')} / {summary.get('score_max')} 分"
                  if summary.get("score") is not None else None),
            _line("档位", summary.get("grade")),
        ]
        flags = summary.get("red_flags") or []
        if flags:
            facts.append("- 需要留意: " + "；".join(str(f) for f in flags))
    else:
        facts.append("- 数据有效性: 这次数据无效，不能反映真实站立情况")
        facts.append(_line("无效原因", summary.get("invalid_reason")))

    fact_block = "\n".join(f for f in facts if f)

    return f"""下面是这次静态站立检测的结果，请写成直接对受检者本人说的报告文案（用「您」称呼）。

## 这次测出来的数据
{fact_block}

## 要写的内容
严格按这个 JSON 返回：
{{
  "evaluation": "一整段话，80-120 字。用短句解释本次实际测到的结果和依据，如两只脚哪边用力多。若数据标注为代表侧单足 COP，只能解释为一只脚的脚底受力变化，不能推断整个身体晃动或跌倒风险。用您称呼，不堆术语，不分点；日常安排留给 healthSummary。",
  "healthSummary": {{
    "title": "8-18 字，直接说日常要留意的事，通俗易懂，不使用评分或档位作标题。",
    "body": "60-100 字，用两三句短话说明本次结果对日常站立有什么提醒，再给一个做饭、排队或换鞋时能照做的建议。比如按实测结果说两只脚用力差不多或哪只脚用力更多；不据此判断站得稳不稳，不重复分数、轨迹数字或 evaluation 的句子。数据无效时只说怎么重测。",
    "focusBody": "40-70 字，用留意是否、下次测量时看看等说法，提醒观察站一会儿后是否同一只脚酸、是否比以前更需要扶靠，并提示保持相近条件再测。不断言已有不适，不套用保持某种能力或关注足底支撑状态等抽象模板。"
  }},
  "advice": [
    {{ "id": "balance",  "title": "练平衡的小标题（4-8 字）", "detail": "一个具体动作 + 做多久 + 一周几天，并写明要扶着东西做。30-50 字。" }},
    {{ "id": "posture",  "title": "站姿的小标题（4-8 字）",   "detail": "平时站着该注意什么，怎么站更省劲更稳。30-50 字。" }},
    {{ "id": "footcare", "title": "护脚的小标题（4-8 字）",   "detail": "鞋子怎么挑、脚要怎么照顾，结合上面的足弓和受力情况说。30-50 字。" }}
  ]
}}

## 硬性检查（不满足前端会整块丢掉，白写）
1. evaluation 必须是**一个字符串**，不是对象、不是数组、不要分点符号。
2. advice 必须正好 3 条，id 依次是 balance、posture、footcare，每条 title 和 detail 都要有内容。
3. 只用上面给出的数据，不要自己编数字，也不要提没给你的指标。
4. 涉及平衡训练时必须提醒扶稳或有人陪同 —— 读者是老人，安全第一。
5. healthSummary 的 title、body、focusBody 都必须是非空字符串，表达通俗，不重复开头的评分或技术指标。
"""
