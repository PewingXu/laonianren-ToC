"""
LLM prompt exports for all assessment modules.
"""

from .grip_prompt import GRIP_SYSTEM_PROMPT, build_grip_user_prompt
from .grip_toc_prompt import GRIP_TOC_SYSTEM_PROMPT, build_grip_toc_user_prompt
from .sitstand_prompt import SITSTAND_SYSTEM_PROMPT, build_sitstand_user_prompt
from .standing_prompt import STANDING_SYSTEM_PROMPT, build_standing_user_prompt
from .gait_prompt import GAIT_SYSTEM_PROMPT, build_gait_user_prompt
from .common_rules import (
    COMMON_ASSESSMENT_SYSTEM_PROMPT,
    COMMON_ASSESSMENT_USER_NOTE,
    with_common_system_rules,
    append_common_user_rules,
)

ASSESSMENT_PROMPTS = {
    "grip": (with_common_system_rules(GRIP_SYSTEM_PROMPT), build_grip_user_prompt),
    # toC 报告页（reports-v2）用的文案：只出 aiSummary 四段 + advice 三组，
    # 面向老人和家属说人话。不套 with_common_system_rules —— 那套通用规则是
    # 给 toB 专业判读写的（要求术语规范、分层判读），会把口语化要求带偏。
    "grip_toc": (GRIP_TOC_SYSTEM_PROMPT, build_grip_toc_user_prompt),
    "sitstand": (with_common_system_rules(SITSTAND_SYSTEM_PROMPT), build_sitstand_user_prompt),
    "standing": (with_common_system_rules(STANDING_SYSTEM_PROMPT), build_standing_user_prompt),
    "gait": (with_common_system_rules(GAIT_SYSTEM_PROMPT), build_gait_user_prompt),
}

__all__ = [
    "GRIP_SYSTEM_PROMPT",
    "build_grip_user_prompt",
    "GRIP_TOC_SYSTEM_PROMPT",
    "build_grip_toc_user_prompt",
    "SITSTAND_SYSTEM_PROMPT",
    "build_sitstand_user_prompt",
    "STANDING_SYSTEM_PROMPT",
    "build_standing_user_prompt",
    "GAIT_SYSTEM_PROMPT",
    "build_gait_user_prompt",
    "COMMON_ASSESSMENT_SYSTEM_PROMPT",
    "COMMON_ASSESSMENT_USER_NOTE",
    "with_common_system_rules",
    "append_common_user_rules",
    "ASSESSMENT_PROMPTS",
]
