import sys
import unittest
from pathlib import Path

import numpy as np


ALGORITHMS_DIR = Path(__file__).resolve().parents[1] / "app" / "algorithms"
sys.path.insert(0, str(ALGORITHMS_DIR))

from generate_gait_report import (
    analyze_foot_distribution,
    build_peak_footprint_trail_data,
)


SENSOR_HEIGHT = 90
SENSOR_WIDTH = 30
HEEL_ROWS = 6
ARCH_GAP_ROWS = 3
FORE_ROWS = 7
FOOT_ROWS = HEEL_ROWS + ARCH_GAP_ROWS + FORE_ROWS
FOOT_COLUMNS = 5


def stamp_foot(frame, forward, lateral, value):
    """Stamp one footprint: heel and forefoot split by an unloaded arch."""
    frame[forward:forward + HEEL_ROWS, lateral:lateral + FOOT_COLUMNS] = value
    fore_start = forward + HEEL_ROWS + ARCH_GAP_ROWS
    frame[fore_start:fore_start + FORE_ROWS, lateral:lateral + FOOT_COLUMNS] = value


def drifting_walk(step_count=10, lateral_drift=1):
    """A walk that slides sideways, so the two feet share one lateral half.

    ``get_foot_mask_by_centers`` splits blobs by lateral distance to two fixed
    foot centres, so a drifting walk lets one foot's mask swallow the other
    foot's footprint as well.
    """
    frames, left_peaks, right_peaks = [], [], []
    for index in range(step_count):
        frame = np.zeros((SENSOR_HEIGHT, SENSOR_WIDTH), dtype=float)
        drift = index * lateral_drift
        near_lateral, far_lateral = 6 + drift, 14 + drift
        stance_forward = 66 - (index * 6)
        swing_forward = stance_forward - 18
        if index % 2 == 0:
            stamp_foot(frame, stance_forward, near_lateral, 2000)
            stamp_foot(frame, swing_forward, far_lateral, 1400)
            left_peaks.append(index)
        else:
            stamp_foot(frame, stance_forward, far_lateral, 2000)
            stamp_foot(frame, swing_forward, near_lateral, 1400)
            right_peaks.append(index)
        frames.append(frame)
    return np.asarray(frames), left_peaks, right_peaks


class PeakFootprintTrailTest(unittest.TestCase):
    def build_trail(self, lateral_drift=1):
        frames, left_peaks, right_peaks = drifting_walk(lateral_drift=lateral_drift)
        center_l, center_r = analyze_foot_distribution(frames)
        trail = build_peak_footprint_trail_data(
            frames, left_peaks, right_peaks, center_l, center_r, sensor_pitch_mm=14.0)
        self.assertTrue(trail["quality"]["valid"])
        self.assertTrue(trail["steps"])
        return trail

    def test_each_step_carries_a_single_footprint(self):
        for step in self.build_trail()["steps"]:
            self.assertEqual(
                len(step["matrix"]), FOOT_ROWS,
                f"frame {step['frameIndex']} kept more than one footprint",
            )
            self.assertEqual(len(step["matrix"][0]), FOOT_COLUMNS)

    def test_center_stays_on_the_footprint_the_report_draws(self):
        """The trail line and the step badge are anchored on ``center``."""
        for step in self.build_trail()["steps"]:
            lateral_origin, forward_origin = step["origin"]
            lateral_center, forward_center = step["center"]
            row_count = len(step["matrix"])
            column_count = len(step["matrix"][0])
            self.assertAlmostEqual(
                forward_center, forward_origin + ((row_count - 1) / 2), delta=0.5)
            self.assertAlmostEqual(
                lateral_center, lateral_origin + ((column_count - 1) / 2), delta=0.5)

    def test_an_unloaded_arch_does_not_split_the_footprint(self):
        """Heel and forefoot are separate blobs; they must stay one footprint."""
        for step in self.build_trail(lateral_drift=0)["steps"]:
            self.assertEqual(len(step["matrix"]), FOOT_ROWS)
            self.assertGreater(step["peakLoadN"], 0)


if __name__ == "__main__":
    unittest.main()
