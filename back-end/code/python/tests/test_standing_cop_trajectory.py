import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd


ALGORITHMS_DIR = Path(__file__).resolve().parents[1] / "app" / "algorithms"
sys.path.insert(0, str(ALGORITHMS_DIR))

from OneStep_report import (
    calculate_cop_trajectories,
    find_standing_contact_indexes,
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


if __name__ == "__main__":
    unittest.main()
