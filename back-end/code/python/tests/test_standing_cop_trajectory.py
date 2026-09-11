import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd


ALGORITHMS_DIR = Path(__file__).resolve().parents[1] / "app" / "algorithms"
sys.path.insert(0, str(ALGORITHMS_DIR))

from OneStep_report import (
    STANDING_COP_FILTER_HZ,
    calculate_cop_trajectories,
    find_standing_contact_indexes,
    smooth_standing_cop,
)


GRID = 64
HALF = 32


def quiet_standing_frames(frame_count=300, seed=7):
    """安静站立：双脚全程着地，接触点数逐帧抖动。

    抖动幅度照实测数据取（左脚中位 111、峰值 144 个接触点），这正是旧取窗
    逻辑的死穴：压力曲线反复穿越"峰值 80%"这条线，峰值帧周围的连续段立刻
    断掉，341 帧最后只剩 1~2 帧。
    """
    rng = np.random.default_rng(seed)
    frames = []
    for _ in range(frame_count):
        frame = np.zeros((GRID, GRID), dtype=float)
        for lateral_start in (8, 40):
            # 12~18 行 × 8 列 = 96~144 个接触点，与实测分布同量级
            rows = int(rng.integers(12, 19))
            forward = 24 + int(rng.integers(-1, 2))
            frame[forward:forward + rows, lateral_start:lateral_start + 8] = 60.0
        frames.append(frame.reshape(-1))
    return np.asarray(frames)


def curves_for(frames, thr=2):
    arr = np.asarray(frames, dtype=float).reshape(-1, GRID, GRID)
    arr = np.where(arr > thr, arr, 0)
    left = (arr[:, :, :HALF] != 0).sum(axis=(1, 2)).tolist()
    right = (arr[:, :, HALF:] != 0).sum(axis=(1, 2)).tolist()
    return left, right


class StandingCopTrajectoryTest(unittest.TestCase):
    def setUp(self):
        self.frames = quiet_standing_frames()
        self.left_curve, self.right_curve = curves_for(self.frames)
        self.df = pd.DataFrame({"data": [list(frame) for frame in self.frames]})

    def test_quiet_standing_keeps_the_whole_stance(self):
        for name, curve in (("left", self.left_curve), ("right", self.right_curve)):
            selected = find_standing_contact_indexes(curve)
            self.assertGreater(
                len(selected), len(curve) * 0.9,
                f"{name} foot lost most of the stance: {len(selected)}/{len(curve)}",
            )

    def test_both_feet_get_a_drawable_trajectory(self):
        """轨迹要覆盖整段站立，而不是峰值帧附近的一两帧。

        旧逻辑在这份数据上左右脚各只剩 2 帧：画出来是一条几乎看不见的短线，
        只要其中一只脚剩 1 帧就会彻底消失，同时椭圆短轴退化成 0。
        """
        left_cop, right_cop = calculate_cop_trajectories(
            self.df, self.left_curve, self.right_curve, 0.8)

        expected = len(self.left_curve) * 0.9
        for name, trajectory in (("left", left_cop), ("right", right_cop)):
            self.assertGreater(
                len(trajectory), expected,
                f"{name} foot kept only {len(trajectory)} of {len(self.left_curve)} frames",
            )

    def test_each_trajectory_stays_on_its_own_half_of_the_mat(self):
        left_cop, right_cop = calculate_cop_trajectories(
            self.df, self.left_curve, self.right_curve, 0.8)

        self.assertTrue(all(point[1] < HALF for point in left_cop))
        self.assertTrue(all(point[1] >= HALF for point in right_cop))

    def test_an_unloaded_foot_yields_no_points_instead_of_raising(self):
        """单脚站立：空着的那只脚应安静地返回空轨迹，不能拖垮另一只脚。

        calculate_cop_corrected 遇到无压力的帧会抛 ValueError，而上游
        one_step_render_data 的 try/except 会把两只脚的轨迹一起清空。
        """
        frames = self.frames.copy().reshape(-1, GRID, GRID)
        frames[:, :, HALF:] = 0.0
        flat = frames.reshape(len(frames), -1)
        left_curve, right_curve = curves_for(flat)
        df = pd.DataFrame({"data": [list(frame) for frame in flat]})

        left_cop, right_cop = calculate_cop_trajectories(df, left_curve, right_curve, 0.8)

        self.assertEqual(right_cop, [])
        self.assertGreater(len(left_cop), len(left_curve) * 0.9)

    def test_a_foot_that_never_touches_selects_nothing(self):
        self.assertEqual(find_standing_contact_indexes([0] * 50), [])
        self.assertEqual(find_standing_contact_indexes([]), [])


FPS = 42.0


def cop_signal(sway_hz, sway_amplitude, jitter_amplitude, n=300, seed=3):
    """慢速生理摆动 + 高频量化抖动。"""
    rng = np.random.default_rng(seed)
    t = np.arange(n) / FPS
    sway = sway_amplitude * np.sin(2 * np.pi * sway_hz * t)
    jitter = rng.normal(0, jitter_amplitude, n)
    return [[float(a), float(b)] for a, b in zip(sway + jitter, sway + jitter)]


def path_length(trajectory):
    points = np.asarray(trajectory, dtype=float)
    return float(np.hypot(*np.diff(points, axis=0).T).sum())


class StandingCopFilterTest(unittest.TestCase):
    def test_jitter_is_removed_but_the_sway_survives(self):
        """低通要压掉抖动，同时保住 0.5Hz 的真实摆动幅度。"""
        sway_amplitude = 1.0
        clean = np.asarray(cop_signal(0.5, sway_amplitude, 0.0), dtype=float)
        noisy = cop_signal(0.5, sway_amplitude, 0.15)
        smoothed = np.asarray(smooth_standing_cop(noisy, fps=FPS), dtype=float)

        # 轨迹长度是差分出来的，对抖动最敏感
        self.assertLess(path_length(smoothed), path_length(noisy) * 0.35)
        # 摆动幅度基本不动。用标准差而不是峰峰值：filtfilt 两端的填充瞬态
        # 会让 ptp 偏大，衡量的是边缘而不是信号本身。
        self.assertAlmostEqual(
            float(smoothed[:, 0].std()), float(clean[:, 0].std()),
            delta=sway_amplitude * 0.05,
        )

    def test_filtering_is_zero_phase(self):
        """必须用 filtfilt：单向滤波的相移会直接污染速度类指标。"""
        n = 300
        t = np.arange(n) / FPS
        sway = np.sin(2 * np.pi * 0.5 * t)
        smoothed = np.asarray(
            smooth_standing_cop([[float(v), float(v)] for v in sway], fps=FPS),
            dtype=float,
        )

        # 峰值位置不应发生位移
        self.assertEqual(int(np.argmax(smoothed[:, 0])), int(np.argmax(sway)))

    def test_content_above_the_cutoff_is_attenuated(self):
        fast = cop_signal(15.0, 1.0, 0.0)
        smoothed = np.asarray(smooth_standing_cop(fast, fps=FPS), dtype=float)
        original = np.asarray(fast, dtype=float)

        # 只看内部：两端 filtfilt 的填充瞬态不代表滤波器的通带外抑制能力
        interior = smoothed[30:-30, 0]
        self.assertLess(float(np.ptp(interior)), float(np.ptp(original[:, 0])) * 0.05)

    def test_short_or_invalid_input_is_returned_untouched(self):
        """样本不足以做 filtfilt 边缘填充时原样返回，不能抛错。"""
        short = [[1.0, 2.0], [1.5, 2.5], [2.0, 3.0]]
        self.assertEqual(smooth_standing_cop(short, fps=FPS), short)
        self.assertEqual(smooth_standing_cop([], fps=FPS), [])

        usable = cop_signal(0.5, 1.0, 0.1)
        # 截止频率高于奈奎斯特时无法构造滤波器，应原样返回
        self.assertEqual(smooth_standing_cop(usable, fps=FPS, cutoff_hz=FPS), usable)
        self.assertEqual(smooth_standing_cop(usable, fps=0), usable)

    def test_cutoff_sits_below_nyquist_for_the_device_rate(self):
        """42fps 下奈奎斯特是 21Hz；沿用文献的 10Hz 几乎滤不掉东西。"""
        self.assertLess(STANDING_COP_FILTER_HZ, FPS / 2.0)


if __name__ == "__main__":
    unittest.main()
