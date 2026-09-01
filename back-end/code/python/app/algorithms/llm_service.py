"""
LLM service for assessment reports.
"""

import asyncio
import json
import os
import re

from openai import OpenAI

from llm_config import get_llm_config
from prompts import ASSESSMENT_PROMPTS, append_common_user_rules
from prompts.common_rules import render_score_context


_EMPTY_PRAISE_PATTERNS = [
    r"^老人家今天[^。！？\n]{0,30}(?:挺认真|很认真)[，,。！!\s]*",
    r"^今天[^。！？\n]{0,30}(?:挺认真|很认真)[，,。！!\s]*",
    r"^(?:这次)?测试[^。！？\n]{0,12}顺利完成(?:了)?[，,。！!\s]*",
    r"^先给您点个赞[，,。！!\s]*",
    r"^先点个赞[，,。！!\s]*",
    r"^先表扬一下[，,。！!\s]*",
]


def _strip_empty_praise(text):
    if not isinstance(text, str):
        return text
    cleaned = text.strip()
    changed = True
    while changed:
        changed = False
        for pattern in _EMPTY_PRAISE_PATTERNS:
            new_text = re.sub(pattern, "", cleaned)
            if new_text != cleaned:
                cleaned = new_text.lstrip(" ，,。！!；;")
                changed = True
    return cleaned


def _sanitize_ai_report(report):
    if isinstance(report, dict):
        return {key: _sanitize_ai_report(value) for key, value in report.items()}
    if isinstance(report, list):
        return [_sanitize_ai_report(item) for item in report]
    return _strip_empty_praise(report)


def _normalize_optional_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _merge_llm_overrides(config: dict, llm_overrides: dict | None):
    if not llm_overrides:
        return config

    merged = dict(config)

    api_key = _normalize_optional_text(llm_overrides.get("api_key"))
    if api_key:
        merged["api_key"] = api_key

    base_url = _normalize_optional_text(llm_overrides.get("base_url"))
    if base_url:
        merged["base_url"] = base_url

    model = _normalize_optional_text(llm_overrides.get("model"))
    if model:
        merged["model"] = model

    if llm_overrides.get("max_tokens") is not None:
        merged["max_tokens"] = llm_overrides.get("max_tokens")

    if llm_overrides.get("timeout") is not None:
        merged["timeout"] = llm_overrides.get("timeout")

    if llm_overrides.get("extra_body") is not None:
        merged["extra_body"] = llm_overrides.get("extra_body")

    if llm_overrides.get("thinking") is not None:
        merged["thinking"] = llm_overrides.get("thinking")

    return merged


def _get_client_and_config(llm_overrides: dict | None = None):
    config = _merge_llm_overrides(get_llm_config(), llm_overrides)

    api_key = _normalize_optional_text(config.get("api_key"))
    if not api_key or api_key == "sk-xxx":
        raise ValueError("未配置有效的 api_key，无法使用 AI 综合评估功能")
    config["api_key"] = api_key

    client = OpenAI(
        api_key=config["api_key"],
        base_url=config["base_url"] or None,
        timeout=config.get("timeout") or None,
    )
    return client, config


def _build_messages(assessment_type: str, patient_info: dict, assessment_data: dict):
    if assessment_type not in ASSESSMENT_PROMPTS:
        raise ValueError(f"Unsupported assessment_type: {assessment_type}")

    system_prompt, prompt_builder = ASSESSMENT_PROMPTS[assessment_type]
    base_prompt = prompt_builder(patient_info, assessment_data)

    # 把前端算好的系统评分（含各小项得分明细、红线）渲染进 prompt，
    # 让 AI 真正看到分数与扣分细则，使其文字与评分卡口径一致。
    score_block = ""
    if isinstance(assessment_data, dict):
        score_block = render_score_context(assessment_data.get("score_context"))
    if score_block:
        base_prompt = f"{base_prompt}\n\n{score_block}"

    user_prompt = append_common_user_rules(base_prompt)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return messages


def _build_request_kwargs(config: dict, messages: list, stream: bool = False):
    request_kwargs = {
        "model": config["model"],
        "messages": messages,
    }

    if stream:
        request_kwargs["stream"] = True

    # Put provider-specific fields into extra_body so OpenAI SDK accepts them.
    extra_body = dict(config.get("extra_body") or {})
    if config.get("thinking") is not None:
        extra_body["thinking"] = config["thinking"]
    if extra_body:
        request_kwargs["extra_body"] = extra_body

    if config.get("max_tokens") is not None:
        request_kwargs["max_tokens"] = config["max_tokens"]

    return request_kwargs


def _create_completion_with_fallback(client: OpenAI, request_kwargs: dict):
    try:
        return client.chat.completions.create(**request_kwargs)
    except TypeError as e:
        # Some OpenAI-compatible endpoints/SDK versions don't accept extra_body.
        if "extra_body" in request_kwargs and "unexpected keyword argument 'extra_body'" in str(e):
            retry_kwargs = dict(request_kwargs)
            retry_kwargs.pop("extra_body", None)
            return client.chat.completions.create(**retry_kwargs)
        raise


def _strip_markdown_fence(content: str) -> str:
    content = (content or "").strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
    if content.endswith("```"):
        content = content.rsplit("```", 1)[0]
    return content.strip()


def _extract_json_object(content: str) -> str | None:
    start = content.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for index in range(start, len(content)):
        char = content[index]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return content[start:index + 1]

    return None


def _parse_json_response(content: str) -> dict:
    content = _strip_markdown_fence(content)

    try:
        return json.loads(content)
    except json.JSONDecodeError as original_error:
        extracted = _extract_json_object(content)
        if extracted:
            try:
                return json.loads(extracted)
            except json.JSONDecodeError:
                pass
        raise ValueError(f"AI response is not valid JSON: {content[:200]}") from original_error


async def call_assessment_ai_report(
    assessment_type: str,
    patient_info: dict,
    assessment_data: dict,
    llm_overrides: dict | None = None,
) -> dict:
    # NOTE: logs are in ASCII/English on purpose — the Windows console runs on a GBK
    # code page and would render Chinese log text as mojibake.
    import time
    t0 = time.time()
    tag = f"[AI:{assessment_type}]"
    print(f"\n{tag} ===== START =====", flush=True)

    try:
        client, config = _get_client_and_config(llm_overrides=llm_overrides)
    except Exception as e:
        print(f"{tag} [FAIL] create client: {type(e).__name__}: {e}", flush=True)
        raise

    key = str(config.get("api_key") or "")
    masked = (key[:4] + "***" + key[-4:]) if len(key) > 8 else ("(EMPTY)" if not key else "***")
    src = "frontend" if (llm_overrides or {}).get("api_key") else "settings-file/env"
    print(f"{tag} config: base_url={config.get('base_url')} model={config.get('model')} "
          f"max_tokens={config.get('max_tokens')} timeout={config.get('timeout')}", flush=True)
    print(f"{tag} api_key={masked} (from: {src})", flush=True)
    if not key:
        print(f"{tag} [WARN] api_key is EMPTY -> request will fail with 401. "
              f"Set it on the login page or in llm_settings.json", flush=True)

    try:
        messages = _build_messages(assessment_type, patient_info, assessment_data)
    except Exception as e:
        print(f"{tag} [FAIL] build prompt: {type(e).__name__}: {e}", flush=True)
        raise
    sys_len = len(messages[0]["content"])
    usr_len = len(messages[1]["content"])
    print(f"{tag} prompt: system={sys_len} chars, user={usr_len} chars "
          f"(~{(sys_len + usr_len) // 2} tokens est.)", flush=True)

    request_kwargs = _build_request_kwargs(config=config, messages=messages, stream=False)
    print(f"{tag} --> calling LLM, please wait "
          f"(no response usually means: no network / wrong base_url / unknown model)", flush=True)

    # OpenAI Python SDK here is sync; offload to thread to avoid blocking FastAPI event loop.
    try:
        response = await asyncio.to_thread(_create_completion_with_fallback, client, request_kwargs)
    except Exception as e:
        print(f"{tag} [FAIL] request failed after {time.time() - t0:.1f}s: {type(e).__name__}: {e}", flush=True)
        raise
    print(f"{tag} <-- response received in {time.time() - t0:.1f}s", flush=True)

    try:
        usage = getattr(response, "usage", None)
        if usage:
            print(f"{tag} tokens: in={getattr(usage, 'prompt_tokens', '?')} "
                  f"out={getattr(usage, 'completion_tokens', '?')} "
                  f"total={getattr(usage, 'total_tokens', '?')}", flush=True)
        finish = getattr(response.choices[0], "finish_reason", None)
        if finish and finish != "stop":
            print(f"{tag} [WARN] finish_reason={finish} "
                  f"('length' means truncated by max_tokens -> JSON will be incomplete)", flush=True)
    except Exception:
        pass

    content = response.choices[0].message.content
    print(f"{tag} content length: {len(content or '')} chars", flush=True)
    if not content:
        print(f"{tag} [WARN] model returned empty content", flush=True)

    try:
        parsed = _parse_json_response(content)
    except Exception as e:
        print(f"{tag} [FAIL] JSON parse: {type(e).__name__}: {e}", flush=True)
        # 只打印结构片段（去掉中文正文，避免控制台乱码刷屏）
        tail = (content or "")[-200:]
        ascii_tail = tail.encode("ascii", "replace").decode("ascii")
        print(f"{tag} raw tail (non-ascii replaced): ...{ascii_tail}", flush=True)
        raise

    result = _sanitize_ai_report(parsed)
    print(f"{tag} [OK] done in {time.time() - t0:.1f}s, fields={list(result.keys())}\n", flush=True)
    return result


def stream_assessment_ai_report(
    assessment_type: str,
    patient_info: dict,
    assessment_data: dict,
    llm_overrides: dict | None = None,
):
    client, config = _get_client_and_config(llm_overrides=llm_overrides)
    messages = _build_messages(assessment_type, patient_info, assessment_data)
    request_kwargs = _build_request_kwargs(config=config, messages=messages, stream=True)

    stream = _create_completion_with_fallback(client, request_kwargs)
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def call_grip_ai_report(
    patient_info: dict,
    grip_data: dict,
    llm_overrides: dict | None = None,
) -> dict:
    return await call_assessment_ai_report(
        "grip",
        patient_info,
        grip_data,
        llm_overrides=llm_overrides,
    )


def stream_grip_ai_report(
    patient_info: dict,
    grip_data: dict,
    llm_overrides: dict | None = None,
):
    return stream_assessment_ai_report(
        "grip",
        patient_info,
        grip_data,
        llm_overrides=llm_overrides,
    )
