import math
import sys
import unittest
from pathlib import Path


ALGORITHMS_DIR = Path(__file__).resolve().parents[1] / "app" / "algorithms"
sys.path.insert(0, str(ALGORITHMS_DIR))

from gait_render_data import (
    get_direction_control,
    get_footprint_trail_data,
    get_walking_stability,
)
from generate_gait_report import (
    build_peak_footprint_trail_data,
    calculate_direction_control,
    calculate_walking_stability,
)


def footprint_line(frame_index, forward, lateral, is_right, *, baseline=False):
    """Build one fpaLines item from coordinates in original sensor pixels."""
    upscale = 3.0
    half_foot_length = 2.0
    return {
        "frameIndex": frame_index,
        "heel": [lateral * upscale, (forward + half_foot_length) * upscale],
        "fore": [lateral * upscale, (forward - half_foot_length) * upscale],
        "sourceIsRight": is_right,
        "isBaseline": baseline,
    }


def footprint_trail(frames, forwards, laterals=None):
    if laterals is None:
        laterals = [-5.0 if index % 2 == 0 else 5.0 for index in range(len(frames))]
    return {
        "sensorSize": [80, 24],
        "sensorPitchMm": 14.0,
        "steps": [
            {
                "frameIndex": frame,
                "center": [lateral, forward],
                "sourceIsRight": index % 2 == 1,
                "isBaseline": False,
                "stepIndex": index + 1,
            }
            for index, (frame, forward, lateral) in enumerate(
                zip(frames, forwards, laterals)
            )
        ],
        "stepCount": len(frames),
        "baselineCount": 0,
        "quality": {"valid": True, "reason": None},
    }


def peak_footprint_frame(forward_row, lateral_col, height=72, width=24):
    frame = [[0.0 for _ in range(width)] for _ in range(height)]
    for row in range(forward_row, forward_row + 5):
        for col in range(lateral_col, lateral_col + 3):
            frame[row][col] = 100.0
    return frame


class GaitFootprintTrailTest(unittest.TestCase):
    def test_peak_frames_keep_step_order_and_shared_physical_coordinates(self):
        frames = [peak_footprint_frame(1, 4) for _ in range(60)]
        left_peaks = [0, 20, 40]
        right_peaks = [10, 30, 50]
        for step_index, frame_index in enumerate(left_peaks):
            frames[frame_index] = peak_footprint_frame(3 + step_index * 20, 4)
        for step_index, frame_index in enumerate(right_peaks):
            frames[frame_index] = peak_footprint_frame(13 + step_index * 20, 17)

        result = build_peak_footprint_trail_data(
            frames,
            left_peaks,
            right_peaks,
            center_l=5,
            center_r=18,
            sensor_pitch_mm=14,
        )

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["sensorSize"], [72, 24])
        self.assertEqual(result["sensorPitchMm"], 14.0)
        self.assertEqual(result["stepCount"], 6)
        self.assertEqual(result["baselineCount"], 0)
        self.assertEqual(
            [step["frameIndex"] for step in result["steps"]],
            [0, 10, 20, 30, 40, 50],
        )
        self.assertEqual(
            [step["stepIndex"] for step in result["steps"]],
            [1, 2, 3, 4, 5, 6],
        )
        self.assertTrue(all(step["matrix"] for step in result["steps"]))
        self.assertTrue(all(step["peakLoadN"] > 0 for step in result["steps"]))
        self.assertEqual(
            [step["isRight"] for step in result["steps"]],
            [True, False, True, False, True, False],
        )

    def test_initial_synchronous_pair_is_marked_as_baseline(self):
        frames = [peak_footprint_frame(1, 4) for _ in range(50)]
        left_peaks = [0, 10, 30]
        right_peaks = [2, 20, 40]
        frames[0] = peak_footprint_frame(2, 4)
        frames[2] = peak_footprint_frame(2, 17)
        frames[10] = peak_footprint_frame(12, 4)
        frames[20] = peak_footprint_frame(22, 17)
        frames[30] = peak_footprint_frame(32, 4)
        frames[40] = peak_footprint_frame(42, 17)

        result = build_peak_footprint_trail_data(
            frames,
            left_peaks,
            right_peaks,
            center_l=5,
            center_r=18,
        )

        self.assertEqual(result["baselineCount"], 2)
        self.assertEqual(result["stepCount"], 4)
        self.assertEqual([step["isBaseline"] for step in result["steps"][:2]], [True, True])
        self.assertEqual([step["stepIndex"] for step in result["steps"][:2]], [None, None])

    def test_missing_peak_frames_have_an_explicit_contract(self):
        result = build_peak_footprint_trail_data([], [], [], 0, 1)
        self.assertFalse(result["quality"]["valid"])
        self.assertEqual(result["quality"]["reason"], "missing_peak_footprints")
        self.assertEqual(result["steps"], [])

        missing = get_footprint_trail_data({})
        self.assertFalse(missing["quality"]["valid"])
        self.assertEqual(missing["quality"]["reason"], "missing_peak_footprints")


class GaitDirectionControlTest(unittest.TestCase):
    def test_empty_peak_trail_falls_back_to_fpa_lines(self):
        lines = [
            footprint_line(index, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(4)
        ]

        result = calculate_direction_control(
            lines,
            footprint_trail={"steps": []},
        )

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["sampleCount"], 4)
        self.assertEqual(result["forwardSpanCm"], 42.0)

    def test_peak_footprint_centers_take_priority_over_fpa_lines(self):
        forwards = [index * 10.0 for index in range(6)]
        laterals = [
            4.0 + 0.25 * forward + (5.0 if index % 2 else -5.0)
            for index, forward in enumerate(forwards)
        ]
        trail = footprint_trail(range(6), forwards, laterals)
        misleading_fpa_lines = [
            footprint_line(index, 0.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(6)
        ]

        result = calculate_direction_control(
            misleading_fpa_lines,
            footprint_trail=trail,
        )

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["pathDeviationRmsCm"], 0.0)
        self.assertEqual(result["maxPathDeviationCm"], 0.0)
        self.assertEqual(result["sampleCount"], 6)
        self.assertEqual(result["forwardSpanCm"], 70.0)

    def test_straight_diagonal_parallel_tracks_have_zero_deviation(self):
        lines = []
        for index in range(6):
            forward = index * 10.0
            side = 1.0 if index % 2 else -1.0
            lateral = 4.0 + 0.25 * forward + 5.0 * side
            lines.append(footprint_line(index, forward, lateral, side > 0))

        result = calculate_direction_control(lines)

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["scope"], "plantar_footpath_straightness_proxy")
        self.assertEqual(result["reference"], "parallel_footprint_centerlines")
        self.assertEqual(result["pathDeviationRmsCm"], 0.0)
        self.assertEqual(result["maxPathDeviationCm"], 0.0)
        self.assertEqual(result["sampleCount"], 6)
        self.assertEqual(result["forwardSpanCm"], 70.0)
        self.assertEqual(result["quality"]["confidence"], "standard")

    def test_known_residuals_use_sensor_pitch_and_remove_step_width(self):
        # This residual vector is orthogonal to intercept, forward and side,
        # so the fitted route remains y = 5 * side exactly.
        residuals = [1.0, -1.0, -2.0, 2.0, 1.0, -1.0]
        lines = []
        for index, residual in enumerate(residuals):
            forward = index * 10.0
            side = 1.0 if index % 2 else -1.0
            lateral = 5.0 * side + residual
            lines.append(footprint_line(index, forward, lateral, side > 0))

        result = calculate_direction_control(lines)

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["pathDeviationRmsCm"], round(math.sqrt(2) * 1.4, 2))
        self.assertEqual(result["maxPathDeviationCm"], 2.8)

    def test_baseline_is_ignored_and_mirroring_does_not_change_result(self):
        residuals = [1.0, -1.0, -2.0, 2.0, 1.0, -1.0]
        lines = [footprint_line(-1, -100, 100, False, baseline=True)]
        for index, residual in enumerate(residuals):
            side = index % 2 == 1
            lines.append(footprint_line(index, index * 10.0, (5.0 if side else -5.0) + residual, side))

        original = calculate_direction_control(lines)
        mirrored_lines = []
        for line in lines:
            mirrored = dict(line)
            mirrored["heel"] = [-line["heel"][0], line["heel"][1]]
            mirrored["fore"] = [-line["fore"][0], line["fore"][1]]
            mirrored["sourceIsRight"] = not line["sourceIsRight"]
            mirrored_lines.append(mirrored)
        mirrored = calculate_direction_control(mirrored_lines)

        self.assertTrue(original["quality"]["valid"])
        self.assertEqual(mirrored["pathDeviationRmsCm"], original["pathDeviationRmsCm"])
        self.assertEqual(mirrored["maxPathDeviationCm"], original["maxPathDeviationCm"])
        self.assertEqual(mirrored["sampleCount"], 6)

    def test_four_steps_are_reported_with_limited_confidence(self):
        lines = [
            footprint_line(index, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(4)
        ]

        result = calculate_direction_control(lines)

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["quality"]["confidence"], "limited")
        self.assertEqual(result["sampleCount"], 4)

    def test_too_few_or_non_alternating_steps_are_invalid_without_zero_fill(self):
        too_few = [
            footprint_line(index, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(3)
        ]
        non_alternating = [
            footprint_line(index, index * 10.0, -5.0 if index < 3 else 5.0, index >= 3)
            for index in range(6)
        ]

        for lines in (too_few, non_alternating):
            with self.subTest(lines=lines):
                result = calculate_direction_control(lines)
                self.assertFalse(result["quality"]["valid"])
                self.assertEqual(result["quality"]["reason"], "insufficient_alternating_steps")
                self.assertIsNone(result["pathDeviationRmsCm"])
                self.assertIsNone(result["maxPathDeviationCm"])

    def test_non_monotonic_and_non_finite_geometry_are_rejected(self):
        forward_positions = [0.0, 10.0, 5.0, 15.0, 8.0, 20.0]
        non_monotonic = [
            footprint_line(index, forward, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index, forward in enumerate(forward_positions)
        ]
        result = calculate_direction_control(non_monotonic)
        self.assertFalse(result["quality"]["valid"])
        self.assertEqual(result["quality"]["reason"], "non_monotonic_progression")

        valid = [
            footprint_line(index, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(4)
        ]
        valid[0]["heel"] = [float("nan"), 0.0]
        result = calculate_direction_control(valid)
        self.assertFalse(result["quality"]["valid"])
        self.assertEqual(result["quality"]["reason"], "insufficient_alternating_steps")
        self.assertIsNone(result["pathDeviationRmsCm"])

    def test_getter_preserves_valid_zero_and_has_an_explicit_missing_contract(self):
        valid = {
            "scope": "plantar_footpath_straightness_proxy",
            "reference": "parallel_footprint_centerlines",
            "pathDeviationRmsCm": 0.0,
            "maxPathDeviationCm": 0.0,
            "sampleCount": 6,
            "forwardSpanCm": 70.0,
            "quality": {"valid": True, "reason": None},
        }
        self.assertEqual(get_direction_control({"directionControl": valid}), valid)

        missing = get_direction_control({})
        self.assertFalse(missing["quality"]["valid"])
        self.assertEqual(missing["quality"]["reason"], "missing_direction_control")
        self.assertIsNone(missing["quality"]["confidence"])
        self.assertIsNone(missing["pathDeviationRmsCm"])

    def test_invalid_physical_configuration_has_a_clear_error(self):
        with self.assertRaisesRegex(ValueError, "positive finite numbers"):
            calculate_direction_control([], sensor_pitch_mm=None)
        with self.assertRaisesRegex(ValueError, "positive finite numbers"):
            calculate_direction_control([], coordinate_upscale=0)


class GaitWalkingStabilityTest(unittest.TestCase):
    def test_empty_peak_trail_falls_back_to_fpa_lines(self):
        lines = [
            footprint_line(index * 10, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(4)
        ]

        result = calculate_walking_stability(
            lines,
            frame_ms=40.0,
            footprint_trail={"steps": []},
        )

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["sampleCount"], 4)
        self.assertEqual(result["meanStepTimeSeconds"], 0.4)

    def test_peak_footprint_centers_take_priority_over_fpa_lines(self):
        trail = footprint_trail(
            frames=[index * 10 for index in range(6)],
            forwards=[index * 10.0 for index in range(6)],
        )
        misleading_fpa_lines = [
            footprint_line(frame, forward, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index, (frame, forward) in enumerate(
                zip([0, 9, 21, 30, 44, 55], [0.0, 9.0, 21.0, 31.0, 45.0, 56.0])
            )
        ]

        result = calculate_walking_stability(
            misleading_fpa_lines,
            frame_ms=40.0,
            footprint_trail=trail,
        )

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["stepTimeCvPercent"], 0.0)
        self.assertEqual(result["stepDistanceCvPercent"], 0.0)
        self.assertEqual(result["meanStepTimeSeconds"], 0.4)
        self.assertEqual(result["meanStepDistanceCm"], 19.8)

    def test_regular_alternating_steps_have_zero_variability(self):
        lines = [
            footprint_line(index * 10, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(6)
        ]

        result = calculate_walking_stability(lines, frame_ms=40.0)

        self.assertTrue(result["quality"]["valid"])
        self.assertEqual(result["quality"]["confidence"], "standard")
        self.assertEqual(result["stepTimeCvPercent"], 0.0)
        self.assertEqual(result["stepDistanceCvPercent"], 0.0)
        self.assertEqual(result["meanStepTimeSeconds"], 0.4)
        self.assertEqual(result["meanStepDistanceCm"], 19.8)
        self.assertEqual(result["sampleCount"], 6)
        self.assertEqual(result["intervalCount"], 5)

    def test_irregular_steps_return_measured_coefficients_of_variation(self):
        frames = [0, 9, 21, 30, 44, 55]
        forwards = [0.0, 9.0, 21.0, 31.0, 45.0, 56.0]
        lines = [
            footprint_line(frame, forward, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index, (frame, forward) in enumerate(zip(frames, forwards))
        ]

        result = calculate_walking_stability(lines, frame_ms=40.0)

        self.assertTrue(result["quality"]["valid"])
        self.assertGreater(result["stepTimeCvPercent"], 0)
        self.assertGreater(result["stepDistanceCvPercent"], 0)

    def test_stationary_or_backtracking_steps_are_not_valid_walking(self):
        stationary = [
            footprint_line(index * 10, 0.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(6)
        ]
        backtracking_forwards = [0.0, 10.0, 20.0, 10.0, 0.0, 10.0]
        backtracking = [
            footprint_line(index * 10, forward, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index, forward in enumerate(backtracking_forwards)
        ]

        stationary_result = calculate_walking_stability(stationary)
        backtracking_result = calculate_walking_stability(backtracking)

        self.assertFalse(stationary_result["quality"]["valid"])
        self.assertEqual(
            stationary_result["quality"]["reason"],
            "insufficient_forward_progression",
        )
        self.assertFalse(backtracking_result["quality"]["valid"])
        self.assertEqual(
            backtracking_result["quality"]["reason"],
            "non_monotonic_progression",
        )

    def test_four_steps_are_limited_and_fewer_steps_remain_missing(self):
        four_steps = [
            footprint_line(index * 10, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(4)
        ]
        three_steps = four_steps[:3]

        limited = calculate_walking_stability(four_steps)
        missing = calculate_walking_stability(three_steps)

        self.assertTrue(limited["quality"]["valid"])
        self.assertEqual(limited["quality"]["confidence"], "limited")
        self.assertFalse(missing["quality"]["valid"])
        self.assertEqual(missing["quality"]["reason"], "insufficient_alternating_steps")
        self.assertIsNone(missing["stepTimeCvPercent"])

    def test_getter_preserves_result_and_has_explicit_missing_contract(self):
        measured = calculate_walking_stability([
            footprint_line(index * 10, index * 10.0, -5.0 if index % 2 == 0 else 5.0, index % 2 == 1)
            for index in range(4)
        ])
        self.assertEqual(get_walking_stability({"walkingStability": measured}), measured)

        missing = get_walking_stability({})
        self.assertFalse(missing["quality"]["valid"])
        self.assertEqual(missing["quality"]["reason"], "missing_walking_stability")
        self.assertIsNone(missing["quality"]["confidence"])
        self.assertIsNone(missing["forwardSpanCm"])

    def test_invalid_physical_configuration_has_a_clear_error(self):
        with self.assertRaisesRegex(ValueError, "positive finite numbers"):
            calculate_walking_stability([], frame_ms=0)


if __name__ == "__main__":
    unittest.main()
