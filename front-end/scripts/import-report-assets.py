#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把微信收到的中文名图片素材，按 reports-v2 各 assets.js 约定的英文槽位名，
处理后写入 front-end/public/images/。

为什么要处理而不是直接改名复制：
  - 源素材是 1200~2000px 的原始输出，单张 0.5~2MB，18 张合计 20MB。
    报告页一屏能出现 5~7 张，直接上原图会让首屏多扛十几 MB。
  - 现有槽位里的图（如 gait-stability.png 25KB / gait-direction.png 23KB）
    是极低清占位图，肉眼可见糊；这批素材是它们的高清版，构图逐一对应。
  - overview-advice 是 2x2 雪碧图：AdviceCard.jsx 用 w-200%/h-200% + objectPosition
    的四个角来裁四个建议项，所以四张单图必须拼回一张，顺序不能错
    （左上 下肢力量 / 右上 身体柔韧 / 左下 步行习惯 / 右下 握力）。

输出格式的取舍：
  - 真人照片 → JPEG q88，同画质下比 PNG 小一个量级
  - 线稿/插画/含透明 → PNG（optimize），保留锐利边缘和 alpha
  - overview-portrait 沿用既有的 .webp 扩展名（assets.js 里写死了）
"""
import sys
from pathlib import Path
from PIL import Image

SRC = Path(r"D:\WechatDocuments\xwechat_files\wxid_u1rwtdqw8hcy12_8b4a\msg\file\2026-08\图片素材")
DST = Path(r"D:\juqiao_project_manage\laonianren-ToC\front-end\public\images")

# (源文件名, 目标文件名, 最长边上限, 格式)
# 最长边按该图在页面里的最大显示宽度的 2 倍取（适配 2x 屏），再向上取整到百位。
#
# 映射依据：逐张打开现有槽位图和新素材对比构图确认，不是按中文名猜的
# —— 素材的中文名与实际内容有出入，例如「站立插图」其实是坐下→起身→站立
# 三步骤图（属起坐模块），「足部插图」是足底压力热力图。
JOBS = [
    # ── 总览页 ──
    # 现有 overview-portrait 与「首页头版插图」是同一场景同一位老人，属高清替换
    ("首页头版插图.png",         "overview-portrait.webp",       1400, "WEBP"),
    ("专家形象.png",             "overview-expert.jpg",           700, "JPEG"),
    ("老人站起头版图.png",        "overview-sit-to-stand.jpg",     900, "JPEG"),
    ("步态-行走插图4.png",        "overview-gait.jpg",             900, "JPEG"),
    ("站立首页真人图.png",        "overview-standing.jpg",         900, "JPEG"),
    ("握力头版真人图.png",        "overview-grip.jpg",             900, "JPEG"),

    # ── 握力报告 ──
    # 真人照片一律 JPEG：同画质下 PNG 要大一个量级（实测 1.2MB vs 90KB），
    # 对应 assets.js 里的扩展名也已同步改成 .jpg
    ("握力头版真人图.png",        "grip-hero.jpg",                1200, "JPEG"),

    # ── 起坐报告 ──
    # 现有 sit-stand-hero 是蓝衣老人扶椅起身，与「老人站起头版图」同构图
    ("老人站起头版图.png",        "sit-stand-hero.jpg",           1200, "JPEG"),

    # ── 站立报告 ──
    ("站立首页真人图.png",        "standing-hero.jpg",            1400, "JPEG"),
    # 插画/图表类：源图经检查全是 RGB 无 alpha（大面积白底 + 柔和渐变），
    # 不需要透明通道。PNG8 量化到 256 色会让渐变出现色带且仍有 ~290KB，
    # 改走 JPEG 后同画质下只要 40~90KB。
    ("站立—脚印插图.png",         "standing-stability.jpg",        800, "JPEG"),
    ("站立—足部压力分布插图.png",  "standing-posture.jpg",          900, "JPEG"),

    # ── 步态报告 ──
    # 现有 gait-cadence 是紫衣+脚印步幅标尺 → 插图3；
    # gait-stability 是绿衣侧走+横向箭头 → 插图1；两者不可互换
    ("步态-行走插图1.png",        "gait-stability.jpg",            800, "JPEG"),
    ("步态-行走插图3.png",        "gait-cadence.jpg",              800, "JPEG"),
    ("步态-行走插图4.png",        "gait-direction.jpg",            800, "JPEG"),
    ("步态—足部插图.png",         "gait-pressure.jpg",             800, "JPEG"),
    ("行走插图.png",             "gait-body-interpretation.jpg", 1400, "JPEG"),
]

# 2x2 雪碧图：顺序必须与 AdviceCard.jsx 的 PRESENTATION[].objectPosition 对齐
SPRITE_SRC = [
    "首页建议插图1.png",  # 左上 0%   0%   下肢力量 LOWER LIMB STRENGTH
    "首页建议插图2.png",  # 右上 100% 0%   身体柔韧 BODY FLEXIBILITY
    "首页建议插图3.png",  # 左下 0%   100% 步行习惯 WALKING HABIT
    "首页建议插图4.png",  # 右下 100% 100% 握力     GRIP STRENGTH
]
SPRITE_DST = "overview-advice.jpg"
SPRITE_CELL = 512  # 单格边长，成图 1024x1024

# 图标自动裁切的搜索窗口：只在源图中央这块区域里找图标，外面的浅色圆环不参与。
# 环从画布边缘一直延伸到约 20% 处，窗口取中央 55% 才能完全避开它
# （用 0.62 时 1 号图左上角还会带进一段环弧）。
SPRITE_SEARCH = 0.55
# 落在窗口下部这一段里的内容视为英文标签，不计入图标包围盒。
# 四张图的标签都压在 70% 以下，图标本体最低点在 66% 附近。
SPRITE_LABEL_CUT = 0.68
SPRITE_PAD = 0.10  # 包围盒四周留白比例，避免图标顶到圆形边缘


def icon_bbox(im):
    """
    找出建议插画里图标本体的包围盒（返回原图坐标的 box）。

    为什么要裁：源素材每张都自带一圈浅色圆环 + 底部英文标签，而 AdviceCard 会把
    图片塞进 96px 的圆形里，并且自己已经画了一层 presentation.ring 底色、
    下方也已有中文标题 advice.title。整张塞进去的结果是：
      1) 双层圆环（素材自带的 + 卡片画的）
      2) 图标被外环挤到只占中间 40%，比替换前的旧图还小
      3) 英文标签缩成不可读的小字，且与中文标题语义重复
    所以只取图标本体，环和标签都丢掉。

    做法：在中央窗口内按「离白足够远」二值化，逐行/逐列统计墨迹，
    取有内容的行列范围。比手量比例可靠，也不怕素材换版。
    """
    w, h = im.size
    m = (1 - SPRITE_SEARCH) / 2
    win = (round(w * m), round(h * m), round(w * (1 - m)), round(h * (1 - m)))
    g = im.convert("L").crop(win)
    gw, gh = g.size
    px = g.load()

    # 阈值 236：素材的浅色环/底纹亮度都在 240 以上，图标线条和填充远低于此
    cut = round(gh * SPRITE_LABEL_CUT)
    cols = [0] * gw
    rows = [0] * gh
    for y in range(gh):
        for x in range(gw):
            if px[x, y] < 236:
                rows[y] += 1
                if y < cut:            # 标签带不计入列统计，避免横向被文字撑宽
                    cols[x] += 1

    xs = [x for x, c in enumerate(cols) if c > 0]
    ys = [y for y, c in enumerate(rows[:cut]) if c > 0]
    if not xs or not ys:               # 兜底：真找不到就用整个窗口
        return win

    pad_x = round((xs[-1] - xs[0]) * SPRITE_PAD)
    pad_y = round((ys[-1] - ys[0]) * SPRITE_PAD)
    return (
        win[0] + max(0, xs[0] - pad_x),
        win[1] + max(0, ys[0] - pad_y),
        win[0] + min(gw, xs[-1] + pad_x),
        win[1] + min(gh, ys[-1] + pad_y),
    )


def square(box, w, h):
    """把包围盒扩成正方形（雪碧图每格是正方形），超出画布则回退贴边。"""
    l, t, r, b = box
    side = max(r - l, b - t)
    cx, cy = (l + r) / 2, (t + b) / 2
    l = round(cx - side / 2)
    t = round(cy - side / 2)
    l = max(0, min(l, w - side))
    t = max(0, min(t, h - side))
    return (l, t, l + side, t + side)


def fit(im, max_side):
    """等比缩放，最长边不超过 max_side；小于则保持原样不放大。"""
    w, h = im.size
    if max(w, h) <= max_side:
        return im
    scale = max_side / max(w, h)
    return im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)


def save(im, path, fmt):
    if fmt == "JPEG":
        # JPEG 无 alpha，透明区域按白底合成，避免变黑块
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        im.save(path, "JPEG", quality=88, optimize=True, progressive=True)
    elif fmt == "WEBP":
        im.save(path, "WEBP", quality=88, method=6)
    elif fmt == "PNG8":
        # 插画/图表：源图虽是照片级渐变，但色彩层次少，量化到 256 色后
        # 肉眼几乎无差别，体积能从 400KB 降到 100KB 上下。
        # 有 alpha 的先留住透明通道再量化，否则镂空会被填成黑色。
        if im.mode == "RGBA":
            q = im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
        else:
            q = im.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT,
                                           dither=Image.FLOYDSTEINBERG)
        q.save(path, "PNG", optimize=True)
    else:
        im.save(path, "PNG", optimize=True)


def main():
    if not SRC.is_dir():
        sys.exit(f"源目录不存在: {SRC}")
    DST.mkdir(parents=True, exist_ok=True)

    rows = []
    for src_name, dst_name, max_side, fmt in JOBS:
        sp, dp = SRC / src_name, DST / dst_name
        if not sp.exists():
            rows.append(("缺失", src_name, dst_name, "", ""))
            continue
        before = dp.stat().st_size if dp.exists() else 0
        with Image.open(sp) as im:
            im.load()
            out = fit(im, max_side)
            save(out, dp, fmt)
            size = out.size
        rows.append(("OK", src_name, dst_name,
                     f"{size[0]}x{size[1]}",
                     f"{before//1024}KB -> {dp.stat().st_size//1024}KB"))

    # 2x2 雪碧图
    sheet = Image.new("RGB", (SPRITE_CELL * 2, SPRITE_CELL * 2), (255, 255, 255))
    ok = True
    for i, name in enumerate(SPRITE_SRC):
        sp = SRC / name
        if not sp.exists():
            rows.append(("缺失", name, SPRITE_DST, "", ""))
            ok = False
            continue
        with Image.open(sp) as im:
            im.load()
            rgb = im.convert("RGB")
            box = square(icon_bbox(rgb), *rgb.size)
            # 包围盒扩成正方形后，四角可能重新吃进一点源图自带的浅色环弧
            # （1 号图标偏小时尤其明显）。这里再兜一层：把明显是环的浅色像素
            # 压成纯白。阈值 246 只吃得到环的淡色，图标最浅的米色约 238，不受影响。
            cell = rgb.crop(box).resize((SPRITE_CELL, SPRITE_CELL), Image.LANCZOS)
            px = cell.load()
            for y in range(SPRITE_CELL):
                for x in range(SPRITE_CELL):
                    r, g, b = px[x, y]
                    if r >= 246 and g >= 246 and b >= 246:
                        px[x, y] = (255, 255, 255)
        sheet.paste(cell, ((i % 2) * SPRITE_CELL, (i // 2) * SPRITE_CELL))
    if ok:
        dp = DST / SPRITE_DST
        before = dp.stat().st_size if dp.exists() else 0
        save(sheet, dp, "JPEG")
        rows.append(("OK(2x2)", "首页建议插图1-4", SPRITE_DST,
                     f"{sheet.size[0]}x{sheet.size[1]}",
                     f"{before//1024}KB -> {dp.stat().st_size//1024}KB"))

    w = max(len(r[2]) for r in rows)
    for st, s, d, dim, sz in rows:
        print(f"{st:<8} {d:<{w}}  {dim:>10}  {sz}")


if __name__ == "__main__":
    main()
