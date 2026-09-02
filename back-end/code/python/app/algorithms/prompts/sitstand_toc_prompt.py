"""
起坐（坐立）报告 —— toC（给老人和家属看）的 AI 文案 prompt。

与 sitstand_prompt.py 的区别
-----------------------------------------------------------------
sitstand_prompt.py 是 toB 专业判读（周期稳定性、COP 偏移、力曲线平滑度等）。
这个文件只产出 toC 报告页 reports-v2/features/sit-stand-report 要的两块：
  1. 「健康评估」区：evaluation.health = { preface, result, details[] }
  2. 「改善建议」区：advice = 正好 4 条 { title, detail, icon }

前端硬校验（mapSitStandReport.js）—— 不满足就整块回落兜底文案
-----------------------------------------------------------------
* evaluation.health 的 preface / result 必须非空，details 必须 1~3 条且每条非空
* advice 必须**正好 4 条**，每条 title / detail 非空，
  且 icon 只能取这四个之一：activity / armchair / droplets / dumbbell
  —— 顺序建议与图标语义对应：活动 / 起身安全 / 休息 / 训练
* 起坐口径是「3 次起坐总时长」，不是 5 次。不要写成 5 次。

写作要求：人话
-----------------------------------------------------------------
读者是 65 岁以上老人和子女。不要写「下肢肌群功能」「动作周期稳定性」
「重心转移效率」这类词；要写「腿上的劲」「站起来稳不稳」「起身要几秒」。
建议要能照着做：说清动作、次数、一周几天。
"""

from __future__ import annotations


SITSTAND_TOC_SYSTEM_PROMPT = """你在帮老人看「起坐测试」的报告，读的人是受检者本人和家里人。

## 怎么称呼（重要）
- 全文一律用「您」称呼受检者，例如「您这次…」「建议您…」。
- **不知道也不需要知道姓名**。绝对不要写出任何姓名、姓氏或称呼，
  也不要自己造称呼（不许出现「张阿姨」「曹师傅」「李大爷」这类）。
- 不要用「他」「她」「患者」「受检者」这类第三人称指代，直接对「您」说话。

## 说话方式（最重要）
- 像社区医生面对面说话那样，平实、具体。
- 禁止出现：下肢肌群、动作周期、重心转移、COP、离心收缩、功能分层、
  代偿模式、评估维度、综合研判、建议结合专业人员意见。
- 该说「腿上的劲」就别说「下肢肌力」；该说「站起来有点晃」就别说「姿态稳定性下降」。
- 不要写「本次检测数据已完成记录」这种没有信息量的话。
- 不吓人，也不粉饰。慢就说慢在哪、怎么练能快起来。

## 数字怎么用
- 这个测试是**连续起坐 3 次**，看总共用了多少秒。不要写成 5 次。
- 只用给你的数据，不许自己编数字。没给的指标不要提，不要写「未知」「暂无」。
- 时间说「秒」，比例说「%」。

## 数据无效时
如果告诉你数据无效，那就：
- result 直接说这次没测准、建议重测
- details 说清可能原因（没坐实、中间停顿、坐垫没放好）
- advice 四条都围绕「怎么把测试做对」，不给训练和营养处方

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


def build_sitstand_toc_user_prompt(patient_info: dict, summary: dict) -> str:
    """
    Args:
        patient_info: { gender, age } —— name 刻意不用，见文件头「怎么称呼」
        summary: 前端算好的事实摘要，期望字段：
            is_valid           bool
            total_seconds      float  3 次起坐总时长
            average_seconds    float  单次平均
            cycle_seconds      list   每次各用了多少秒
            grade              str    档位（很好/还行/偏慢/慢）
            score              int
            score_max          int
            left_right_ratio   float  左右腿发力比
            smoothness         float  力曲线平滑度（0-100）
            red_flags          list
            invalid_reason     str
    """
    is_valid = summary.get("is_valid", True)

    facts = [
        # 刻意不给姓名：给了模型就会写进文案，还会自己造「张阿姨」这类称呼
        _line("性别", patient_info.get("gender")),
        _line("年龄", _fmt(patient_info.get("age"), 0, " 岁")),
    ]

    if is_valid:
        cycles = summary.get("cycle_seconds") or []
        facts += [
            _line("连续起坐 3 次总共用了", _fmt(summary.get("total_seconds"), 1, " 秒")),
            _line("平均每次", _fmt(summary.get("average_seconds"), 1, " 秒")),
            _line("每次分别用了", "、".join(f"{round(float(c),1):g} 秒" for c in cycles
                                       if isinstance(c, (int, float))) or None),
            _line("左右腿发力比", _fmt(summary.get("left_right_ratio"), 2)),
            _line("起身动作平顺度", _fmt(summary.get("smoothness"), 0, " 分（满分 100）")),
            _line("这次得分", f"{summary.get('score')} / {summary.get('score_max')} 分"
                  if summary.get("score") is not None else None),
            _line("档位", summary.get("grade")),
        ]
        flags = summary.get("red_flags") or []
        if flags:
            facts.append("- 需要留意: " + "；".join(str(f) for f in flags))
    else:
        facts.append("- 数据有效性: 这次数据无效，不能反映真实起坐能力")
        facts.append(_line("无效原因", summary.get("invalid_reason")))

    fact_block = "\n".join(f for f in facts if f)

    return f"""下面是这次起坐测试的结果，请写成直接对受检者本人说的报告文案（用「您」称呼）。

## 这次测出来的数据
{fact_block}

## 要写的内容
严格按这个 JSON 返回：
{{
  "evaluation": {{
    "health": {{
      "preface": "一句引子，10-20 字。例如「从这次起身的速度来看」。",
      "result": "一句话结论，12-24 字。说腿上的劲和起身能力处在什么水平，让人一眼看懂。",
      "details": [
        "第一条：结论是怎么来的（3 次总共几秒、平均每次几秒、快慢是否稳定）。30-55 字。",
        "第二条：这对日常生活意味着什么——上下楼、从沙发起身、蹲下捡东西这类具体的事。30-55 字。",
        "第三条：接下来最该做的一件事，以及大概多久复查一次。30-55 字。"
      ]
    }}
  }},
  "advice": [
    {{ "icon": "activity",  "title": "日常活动的小标题（4-8 字）", "detail": "怎么在日常里多动，具体到时间和频次。25-45 字。" }},
    {{ "icon": "armchair",  "title": "起身安全的小标题（4-8 字）", "detail": "起身时怎么做才不容易晃、不容易摔。25-45 字。" }},
    {{ "icon": "droplets",  "title": "休息与补水的小标题（4-8 字）", "detail": "什么时候该歇、怎么歇、要不要补水。25-45 字。" }},
    {{ "icon": "dumbbell",  "title": "腿部练习的小标题（4-8 字）", "detail": "一个具体动作 + 做几组几次 + 一周几天。25-45 字。" }}
  ]
}}

## 硬性检查（不满足前端会整块丢掉，白写）
1. evaluation.health 的 preface、result 都要有内容；details 必须正好 3 条且都非空。
2. advice 必须**正好 4 条**，顺序和 icon 必须是 activity、armchair、droplets、dumbbell，一个都不能改。
3. 每条 advice 的 title 和 detail 都要有内容。
4. 只用上面给出的数据，不要编数字；这个测试是 3 次起坐，不要写成 5 次。
"""
