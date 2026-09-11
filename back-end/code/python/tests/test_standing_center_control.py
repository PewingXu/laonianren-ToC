import math
import sys
import unittest
from pathlib import Path


ALGORITHMS_DIR = Path(__file__).resolve().parents[1] / "app" / "algorithms"
sys.path.insert(0, str(ALGORITHMS_DIR))

from OneStep_report import calculate_peak_frame_center_control
from one_step_render_data import get_center_control


class PeakFrameCenterControlTest(unittest.TestCase):
    def test_uses_bilateral_midpoint_and_sensor_spacing(self):
        result = calculate_peak_frame_center_control({
            "frame_index": 17,
            "left_cop": [10.0, 10.0],
            "right_cop": [14.0, 30.0],
            "both_cop": [13.0, 22.0],
        })

        self.assertEqual(result["scope"], "peak_frame_plantar_cop_proxy")
        self.assertEqual(result["reference"], "bilateral_foot_cop_midpoint")
        self.assertEqual(result["frame_index"], 17)
        self.assertAlmostEqual(result["lateral_offset_cm"], 2.8)
        self.assertAlmostEqual(result["longitudinal_offset_cm"], 1.4)
        self.assertAlmostEqual(result["magnitude_cm"], math.sqrt(2.8 ** 2 + 1.4 ** 2))
        self.assertEqual(result["lateral_direction"], "right")
        self.assertEqual(result["quality"], {"valid": True, "reason": None})

    def test_lateral_offset_is_signed_and_longitudinal_offset_is_absolute(self):
        result = calculate_peak_frame_center_control({
            "frame_index": 3,
            "left_cop": [10.0, 10.0],
            "right_cop": [14.0, 30.0],
            "both_cop": [11.0, 18.0],
        })

        self.assertAlmostEqual(result["lateral_offset_cm"], -2.8)
        self.assertAlmostEqual(result["longitudinal_offset_cm"], 1.4)
        self.assertEqual(result["lateral_direction"], "left")

    def test_exact_midpoint_is_centered(self):
        result = calculate_peak_frame_center_control({
            "frame_index": 4,
            "left_cop": [8.0, 12.0],
            "right_cop": [12.0, 28.0],
            "both_cop": [10.0, 20.0],
        })

        self.assertEqual(result["lateral_offset_cm"], 0.0)
        self.assertEqual(result["longitudinal_offset_cm"], 0.0)
        self.assertEqual(result["magnitude_cm"], 0.0)
        self.assertEqual(result["lateral_direction"], "centered")

    def test_incomplete_or_non_finite_point_is_invalid_without_fabricated_zero(self):
        invalid_points = (None, [1.0], [1.0, None], [1.0, float("nan")])
        for point_name in ("left_cop", "right_cop", "both_cop"):
            for invalid_point in invalid_points:
                with self.subTest(point_name=point_name, invalid_point=invalid_point):
                    cop_results = {
                        "frame_index": 5,
                        "left_cop": [10.0, 10.0],
                        "right_cop": [10.0, 30.0],
                        "both_cop": [10.0, 20.0],
                    }
                    cop_results[point_name] = invalid_point
                    result = calculate_peak_frame_center_control(cop_results)
                    self.assertIsNone(result["lateral_offset_cm"])
                    self.assertIsNone(result["longitudinal_offset_cm"])
                    self.assertIsNone(result["magnitude_cm"])
                    self.assertIsNone(result["lateral_direction"])
                    self.assertEqual(result["quality"], {
                        "valid": False,
                        "reason": "incomplete_peak_frame_cop",
                    })

    def test_getter_preserves_valid_zero_and_maps_field_names(self):
        mapped = get_center_control({
            "center_control": calculate_peak_frame_center_control({
                "frame_index": 9,
                "left_cop": [8.0, 12.0],
                "right_cop": [12.0, 28.0],
                "both_cop": [10.0, 20.0],
            }),
        })

        self.assertEqual(mapped["frameIndex"], 9)
        self.assertEqual(mapped["lateralOffsetCm"], 0.0)
        self.assertEqual(mapped["longitudinalOffsetCm"], 0.0)
        self.assertEqual(mapped["magnitudeCm"], 0.0)
        self.assertEqual(mapped["lateralDirection"], "centered")
        self.assertTrue(mapped["quality"]["valid"])


if __name__ == "__main__":
    unittest.main()
