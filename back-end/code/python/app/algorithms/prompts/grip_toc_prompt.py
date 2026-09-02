"""
握力报告 —— toC（给老人和家属看）的 AI 文案 prompt。

与 grip_prompt.py 的区别
-----------------------------------------------------------------
grip_prompt.py 产出的是 toB 专业判读：left_hand_analysis / bilateral_comparison /
clinical_suggestion 这类字段，术语密集、面向专业人员。

这个文件产出的是 toC 报告页要的东西，只有两块：
  1. 「AI 健康总结」卡：一个结论标题 + 一段说明，再加「关注方向」标题 + 一段说明
  2. 「个性化改善建议」三张卡：力量训练 / 营养补充 / 休息与恢复，每张两条

前端消费口径（reports-v2/features/grip-report/mappers/mapGripReport.js）
-----------------------------------------------------------------
* aiSummary 必须四个字段 title / body / focusTitle / focusBody **全部非空**，
  缺一个整段丢弃，页面回落到兜底文案。
* aiSummary 四段文字里**出现 "kg" 就整段丢弃** —— 交付包规定握力只显示 N。
  所以文案里一律不要写公斤/kg，需要提力量水平就用「参考线」这种说法。
* advice 必须正好 3 组，id 依次 strength / nutrition / recovery，
  每组 items 正好 2 条且都非空，否则整块丢弃。

写作要求：人话，不是官方话术
-----------------------------------------------------------------
读者是 65 岁以上的老人和他们的子女，不是医生。所以：
  - 不用「肌力储备」「双侧差异」「功能风险分层」「抗阻训练」这类词
  - 用「手上的劲」「两只手」「差多少」「练一练」
  - 不写「建议结合专业人员意见进行综合评估」这种没有信息量的套话
  - 每条建议要能照着做：说清楚做什么、做多久、一周几次
"""

from __future__ import annotations


GRIP_TOC_SYSTEM_PROMPT = """你在帮老人看握力检测报告，读的人是受检者本人和家里人。

## 怎么称呼（重要）
- 全文一律用「您」称呼受检者，例如「您这次…」「建议您…」。
- **不知道也不需要知道姓名**。绝对不要写出任何姓名、姓氏或称呼，
  也不要自己造称呼（不许出现「张阿姨」「曹师傅」「李大爷」这类）。
- 不要用「他」「她」「患者」「受检者」这类第三人称指代，直接对「您」说话。

## 说话方式（最重要）
- 像社区医生跟老人面对面说话那样，平实、具体、有温度。
- 禁止出现这些词：肌力储备、双侧差异、功能风险分层、抗阻训练、判读、量化、
  代偿、临床、评估维度、综合研判、建议结合专业人员意见。
- 该说「手上的劲」就别说「上肢肌力」；该说「两只手差不多」就别说「双侧对称性良好」。
- 不要写「本次检测数据已完成记录」这种等于什么都没说的话。
- 不要吓人，也不要粉饰。数据不好就说清楚差在哪、怎么练能好。

## 数字怎么用
- 握力单位一律用 N（牛顿），**绝对不要出现 kg、公斤、千克**，一个字都不行。
- 可以说「离参考线还差 XX N」「比上次多了 XX N」。
- 百分比可以直接说，比如「两只手差 6%」「握住 3 秒后还剩 90% 的劲」。
- 只用给你的数据，不许自己编数字。某项没有就不提，不要写「未知」「暂无」。

## 数据无效时
如果告诉你数据无效（is_valid 为 false），那就：
- title 直接说这次没测准，比如「这次没测准，建议重测一次」
- body 说清楚可能的原因（手套没戴好、只是手指碰了一下没真握紧）
- focusBody 只说怎么重测，不要给训练和营养建议
- advice 三组仍要给，但内容都围绕「怎么把测试做对」

## 输出
严格返回 JSON，不带 markdown 代码块，不带任何额外文字。
"""


def _fmt(value, digits: int = 1, suffix: str = ""):
    """数字格式化；拿不到就返回 None，让调用方直接跳过这一行。"""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        text = f"{round(float(value), digits):g}"
        return f"{text}{suffix}"
    text = str(value).strip()
    return f"{text}{suffix}" if text else None


def _line(label: str, value) -> str | None:
    formatted = value if isinstance(value, str) else _fmt(value)
    return f"- {label}: {formatted}" if formatted else None


def build_grip_toc_user_prompt(patient_info: dict, grip_summary: dict) -> str:
    """
    组装 toC 握力文案的 user prompt。

    Args:
        patient_info: { gender, age } —— name 刻意不用，见文件头「怎么称呼」
        grip_summary: 前端 gripReportEnrich.js 算好的结果摘要，期望字段：
            is_valid          bool   数据是否有效
            max_force_n       float  最大握力（N）
            threshold_n       float  该性别的 AWGS 参考线（N）
            reached_threshold bool   是否达到参考线
            mean_force_n      float  握住时的平均力（N）
            diff_percent      float  两只手差异百分比
            stronger_hand     str    '左手' / '右手'
            retention_percent float  握住到最后还剩百分之几
            hold_seconds      float  握住了几秒
            cv_percent        float  力值上下浮动百分比
            score             int    V3 得分
            score_max         int    满分（25）
            grade             str    档位文案（优秀/良好/一般/偏低/低）
            red_flags         list   需要留意的点
            invalid_reason    str    数据无效的原因（is_valid 为 false 时）
    """
    gender = patient_info.get("gender") or ""
    age = _fmt(patient_info.get("age"), 0, " 岁")

    is_valid = grip_summary.get("is_valid", True)

    facts = [
        # 刻意不给姓名：给了模型就会写进文案，还会自己造「张阿姨」这类称呼
        _line("性别", gender),
        _line("年龄", age),
    ]

    if is_valid:
        facts += [
            _line("最大握力", _fmt(grip_summary.get("max_force_n"), 2, " N")),
            _line("这个年龄性别的参考线", _fmt(grip_summary.get("threshold_n"), 1, " N")),
            _line("是否达到参考线", "达到了" if grip_summary.get("reached_threshold") else "还没达到"),
            _line("握住时的平均力", _fmt(grip_summary.get("mean_force_n"), 2, " N")),
            _line("两只手差异", _fmt(grip_summary.get("diff_percent"), 1, "%")),
            _line("更有劲的一侧", grip_summary.get("stronger_hand")),
            _line("握了几秒", _fmt(grip_summary.get("hold_seconds"), 1, " 秒")),
            _line("握到最后还剩", _fmt(grip_summary.get("retention_percent"), 1, "%")),
            _line("握的时候力值上下浮动", _fmt(grip_summary.get("cv_percent"), 1, "%")),
            _line("这次得分", f"{grip_summary.get('score')} / {grip_summary.get('score_max')} 分"
                  if grip_summary.get("score") is not None else None),
            _line("档位", grip_summary.get("grade")),
        ]
        flags = grip_summary.get("red_flags") or []
        if flags:
            facts.append("- 需要留意: " + "；".join(str(f) for f in flags))
    else:
        facts.append("- 数据有效性: 这次数据无效，不能反映真实握力")
        facts.append(_line("无效原因", grip_summary.get("invalid_reason")))

    fact_block = "\n".join(f for f in facts if f)

    return f"""下面是这次握力检测的结果，请写成直接对受检者本人说的报告文案（用「您」称呼）。

## 这次测出来的数据
{fact_block}

## 要写的内容
严格按这个 JSON 返回：
{{
  "aiSummary": {{
    "title": "一句话结论，8-16 字。说这次手上的劲处在什么水平，让人一眼看懂。例如「手上的劲还不错，继续保持」「劲偏小了，需要练一练」。不要出现 kg。",
    "body": "60-100 字。先说结论怎么来的（对着参考线差多少、两只手差多少、握住之后掉了多少），再说这对日常生活意味着什么——比如拎菜、开瓶盖、扶栏杆这类具体的事。说人话，不要术语。不要出现 kg。",
    "focusTitle": "关注方向的小标题，4-10 字。例如「先把弱的那只手练上来」「保持住，别让劲掉下去」。不要出现 kg。",
    "focusBody": "50-90 字。说接下来最该做的一两件事，以及大概多久复查一次。要具体到能照着做，别说「建议加强锻炼」这种空话。不要出现 kg。"
  }},
  "advice": [
    {{
      "id": "strength",
      "items": [
        "力量训练第一条：一个具体动作 + 做几组几次 + 一周几天。20-40 字。",
        "力量训练第二条：另一个动作或注意事项。20-40 字。"
      ]
    }},
    {{
      "id": "nutrition",
      "items": [
        "营养第一条：吃什么、大概多少量。要说日常食物（鸡蛋、牛奶、豆腐、鱼肉），不要说营养素名词。20-40 字。",
        "营养第二条：另一条饮食建议。20-40 字。"
      ]
    }},
    {{
      "id": "recovery",
      "items": [
        "休息恢复第一条：练完怎么放松、隔多久练一次。20-40 字。",
        "休息恢复第二条：什么情况下要停下来或者去看医生。20-40 字。"
      ]
    }}
  ]
}}

## 硬性检查（不满足前端会整段丢掉，白写）
1. aiSummary 四个字段全部要有内容，一个都不能空。
2. 全文任何地方都不能出现 kg、公斤、千克。握力只用 N。
3. advice 必须正好 3 组，id 依次是 strength、nutrition、recovery，每组正好 2 条。
4. 只用上面给出的数据，不要自己编数字，也不要提没给你的指标。
"""
