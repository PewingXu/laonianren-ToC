"""
静态站立报告 —— toC（给老人和家属看）的 AI 文案 prompt。

前端消费口径（mapStandingReport.js）
-----------------------------------------------------------------
* summary.evaluation ← data.evaluation，是**一整段纯字符串**（不是对象）
* advice ← data.advice，最多取前 3 条，每条 { id, title, detail } 三者都非空才保留
  （不足 3 条也能显示，但少于 1 条这块就空了）

站立模块的数据说明
-----------------------------------------------------------------
站立是四项里文档最薄的一项（BACKEND_HANDOFF.md 没有 standing 章节）。
实测能拿到的主要是：左右脚负重比例、身体摇晃范围、足弓指数、足底分区压力。
所以文案只围绕这几项写，不要提没给的指标。

写作要求：人话
-----------------------------------------------------------------
不要写「COP 轨迹」「压力中心偏移」「足弓形态学分型」；
要写「站着的时候身子晃得多不多」「两只脚吃力是不是一边多」「脚掌哪块受力重」。
"""

from __future__ import annotations


STANDING_TOC_SYSTEM_PROMPT = """你在帮老人看「静静站立」的检测报告，读的人是受检者本人和家里人。

## 怎么称呼（重要）
- 全文一律用「您」称呼受检者，例如「您这次…」「建议您…」。
- **不知道也不需要知道姓名**。绝对不要写出任何姓名、姓氏或称呼，
  也不要自己造称呼（不许出现「张阿姨」「曹师傅」「李大爷」这类）。
- 不要用「他」「她」「患者」「受检者」这类第三人称指代，直接对「您」说话。

## 说话方式（最重要）
- 像社区医生面对面说话，平实、具体。
- 禁止出现：COP、压力中心、足弓形态学、姿态控制、本体感觉、平衡策略、
  功能分层、评估维度、综合研判、建议结合专业人员意见。
- 该说「站着身子晃得多不多」就别说「姿态稳定性」；
  该说「左脚比右脚多吃了几成力」就别说「负荷偏移量」。
- 不吓人，也不粉饰。晃得多就说清楚意味着什么、怎么练能稳。

## 数字怎么用
- 只用给你的数据。没给的指标一个字都不要提，不要写「未知」「暂无」。
- 比例说「%」，晃动范围说「毫米」或「厘米」（按给你的单位写）。
- 两只脚各占多少可以直接说，比如「左脚 53%、右脚 47%，差得不多」。

## 数据无效时
如果告诉你数据无效，evaluation 直接说这次没测准、可能的原因和怎么重测，
advice 三条都围绕「怎么把测试做对」，不给训练处方。

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
            sway_mm           float  身体摇晃范围（mm）
            sway_grade        str    晃动档位
            left_arch_index   float  左足弓指数
            right_arch_index  float  右足弓指数
            arch_note         str    足弓类型描述
            forefoot_percent  float  前脚掌受力占比
            heel_percent      float  后脚掌受力占比
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
        facts += [
            _line("左脚承重占比", _fmt(summary.get("left_percent"), 1, "%")),
            _line("右脚承重占比", _fmt(summary.get("right_percent"), 1, "%")),
            # COP 轨迹长度 = 站立时重心划过的总路程，越短越稳。
            # 说成「重心划过的路程」而不是 COP，读者是老人。
            _line("站着时重心划过的总路程", _fmt(summary.get("sway_mm"), 1, " 毫米")),
            _line("晃动情况", summary.get("sway_grade")),
            _line("左脚足弓指数", _fmt(summary.get("left_arch_index"), 2)),
            _line("右脚足弓指数", _fmt(summary.get("right_arch_index"), 2)),
            _line("足弓情况", summary.get("arch_note")),
            _line("前脚掌受力占比", _fmt(summary.get("forefoot_percent"), 1, "%")),
            _line("后脚掌受力占比", _fmt(summary.get("heel_percent"), 1, "%")),
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
  "evaluation": "一整段话，110-160 字。先给结论（站得稳不稳、两只脚吃力是否均匀），再说结论怎么来的（引用上面的数据），最后说这对日常生活意味着什么——比如站着穿裤子、排队等车、在厨房久站这类具体的事。说人话，不要术语，不要分点，就是一段连贯的话。",
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
"""
