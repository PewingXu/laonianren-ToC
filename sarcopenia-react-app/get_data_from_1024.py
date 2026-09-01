import serial
import numpy as np
import time
import pandas as pd
import threading
from datetime import datetime
from collections import deque

# 修复 matplotlib 后端问题
import matplotlib

matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.widgets import Button

# === 字体配置 ===
import matplotlib.font_manager as fm
import os

if os.name == 'nt':
    font_paths = [
        'C:\\Windows\\Fonts\\msyh.ttc',
        'C:\\Windows\\Fonts\\simhei.ttf',
        'C:\\Windows\\Fonts\\simsun.ttc',
    ]

    font_found = False
    for font_path in font_paths:
        if os.path.exists(font_path):
            font_prop = fm.FontProperties(fname=font_path)
            plt.rcParams['font.family'] = font_prop.get_name()
            print(f"使用字体: {font_prop.get_name()}")
            font_found = True
            break

    if not font_found:
        plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Arial']
else:
    plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei', 'DejaVu Sans']

plt.rcParams['axes.unicode_minus'] = False

# === 配置 ===
FRAME_SIZE = 32 * 32
FRAME_HEADER = np.array([170, 85, 3, 153], dtype=np.uint8)

# === 垫子配置 ===
MAT_PORT = 'COM4'
MAT_NAME = 'PressureMat'


class FrameReceiver:
    def __init__(self, serial_port, target_frame_size, mat_name):
        self.ser = serial_port
        self.target_frame_size = target_frame_size
        self.mat_name = mat_name
        self.buffer = bytearray()

        self.all_frames = []
        self.frames_saved = 0
        self.current_frame = np.zeros((32, 32), dtype=np.uint8)
        self.is_running = True
        self.is_recording = False

        self.total_frames = 0
        self.error_frames = 0
        self.start_time = time.time()
        self.frame_times = deque(maxlen=30)

        self.last_fps_update = time.time()
        self.fps_cache = 0.0

        # 调试信息
        self.debug_mode = True
        self.last_debug_time = time.time()
        self.bytes_received = 0

    def find_frame_header(self, data, start_pos=0):
        header_bytes = bytes(FRAME_HEADER)
        return data.find(header_bytes, start_pos)

    def extract_frames(self):
        extracted_count = 0
        header_len = len(FRAME_HEADER)

        while True:
            first_header = self.find_frame_header(self.buffer, 0)
            if first_header == -1:
                if len(self.buffer) > 3:
                    self.buffer = self.buffer[-3:]
                break

            next_header = self.find_frame_header(self.buffer, first_header + header_len)
            if next_header == -1:
                self.buffer = self.buffer[first_header:]
                break

            frame_data = self.buffer[first_header + header_len:next_header]
            self.total_frames += 1

            if len(frame_data) == self.target_frame_size:
                current_time = time.time()
                frame_array = np.frombuffer(frame_data, dtype=np.uint8)
                np.copyto(self.current_frame, frame_array.reshape(32, 32))

                if self.is_recording:
                    # 计算非零值总和
                    press_value = np.sum(frame_array[frame_array != 0])
                    self.all_frames.append({
                        'data': frame_array.tolist(),
                        'press': int(press_value)
                    })
                    self.frames_saved += 1

                extracted_count += 1
                self.frame_times.append(current_time)
            else:
                self.error_frames += 1
                if self.debug_mode:
                    print(f"[警告] 帧大小错误: 期望{self.target_frame_size}, 实际{len(frame_data)}")

            self.buffer = self.buffer[next_header:]

        return extracted_count

    def read_and_process(self):
        while self.is_running:
            try:
                waiting = self.ser.in_waiting
                if waiting > 0:
                    data = self.ser.read(waiting)
                    self.bytes_received += len(data)
                    self.buffer.extend(data)

                    # 调试输出
                    current_time = time.time()
                    if self.debug_mode and current_time - self.last_debug_time > 2.0:
                        print(f"\n[调试信息]")
                        print(f"  缓冲区大小: {len(self.buffer)} 字节")
                        print(f"  总接收字节: {self.bytes_received}")
                        print(f"  总帧数: {self.total_frames}")
                        print(f"  错误帧: {self.error_frames}")
                        if len(self.buffer) >= 20:
                            print(f"  缓冲区前20字节: {list(self.buffer[:20])}")
                        self.last_debug_time = current_time

                    self.extract_frames()
                else:
                    time.sleep(0.001)
            except Exception as e:
                print(f"[{self.mat_name}] 读取错误: {e}")
                time.sleep(0.001)

    def start_recording(self):
        self.is_recording = True
        self.all_frames = []
        self.frames_saved = 0
        self.start_time = time.time()
        print(f"[{self.mat_name}] 开始记录")

    def stop_recording(self):
        self.is_recording = False
        print(f"[{self.mat_name}] 停止记录，共记录 {self.frames_saved} 帧")

    def stop(self):
        self.is_running = False

    def get_fps(self):
        current_time = time.time()
        if current_time - self.last_fps_update > 0.1:
            if len(self.frame_times) >= 2:
                time_span = self.frame_times[-1] - self.frame_times[0]
                if time_span > 0:
                    self.fps_cache = (len(self.frame_times) - 1) / time_span
            self.last_fps_update = current_time
        return self.fps_cache

    def save_to_csv(self, filename):
        if len(self.all_frames) == 0:
            print(f"[{self.mat_name}] 没有数据可保存")
            return

        print(f"\n[{self.mat_name}] 正在保存到 {filename}...")
        data_rows = []
        for i, frame_info in enumerate(self.all_frames):
            data_rows.append({
                'frame_index': i + 1,
                'press': frame_info['press'],
                'data': ','.join(map(str, frame_info['data']))
            })

        df = pd.DataFrame(data_rows)
        df.to_csv(filename, index=False)

        print(f"[{self.mat_name}] 保存成功: {len(self.all_frames)} 帧")
        print(f"  文件: {filename}")


class SingleMatViewer:
    def __init__(self, receiver):
        self.receiver = receiver
        self.update_counter = 0
        self.last_update_time = time.time()
        self.display_fps = 0.0

        self.fig = plt.figure(figsize=(10, 8))
        main_gs = self.fig.add_gridspec(2, 1, height_ratios=[10, 1], hspace=0.15)
        heat_ax = self.fig.add_subplot(main_gs[0])
        button_gs = main_gs[1].subgridspec(1, 2, width_ratios=[1, 1], wspace=0.3)

        self.im = heat_ax.imshow(receiver.current_frame, cmap='hot', vmin=0, vmax=255,
                                 interpolation='nearest', aspect='auto')

        self.cbar = self.fig.colorbar(self.im, ax=heat_ax, fraction=0.046, pad=0.04)
        self.cbar.set_label('压力值', fontsize=10)

        heat_ax.set_xlabel('列', fontsize=10)
        heat_ax.set_ylabel('行', fontsize=10)
        self.title = heat_ax.set_title(f"{receiver.mat_name} ({receiver.ser.port}) - 32x32压力传感垫",
                                       fontsize=12, fontweight='bold')
        heat_ax.grid(False)
        heat_ax.set_xticks([])
        heat_ax.set_yticks([])

        ax_start = self.fig.add_subplot(button_gs[0, 0])
        ax_stop = self.fig.add_subplot(button_gs[0, 1])

        self.btn_start = Button(ax_start, '开始采集 (S)', color='lightgreen', hovercolor='green')
        self.btn_stop = Button(ax_stop, '停止采集 (X)', color='lightcoral', hovercolor='red')

        self.btn_start.on_clicked(self.start_recording)
        self.btn_stop.on_clicked(self.stop_recording)

        self.btn_stop.ax.set_facecolor('lightgray')
        self.recording_state = False

        self.info_text = self.fig.text(0.5, 0.02, '状态: 待机中 (点击"开始采集"按钮开始)',
                                       ha='center', fontsize=10, color='blue', fontweight='bold')

        self.fig.canvas.manager.set_window_title('压力垫实时热力图 - 32x32 (1024点)')
        self.fig.canvas.mpl_connect('close_event', self.on_close)
        self.fig.canvas.mpl_connect('key_press_event', self.on_key_press)

        self.anim = FuncAnimation(
            self.fig,
            self.update,
            interval=50,
            blit=False,
            cache_frame_data=False
        )

    def start_recording(self, event):
        if not self.recording_state:
            print("\n" + "=" * 80)
            print("开始采集数据")
            print("=" * 80)
            self.receiver.start_recording()
            self.recording_state = True
            self.btn_start.ax.set_facecolor('lightgray')
            self.btn_stop.ax.set_facecolor('lightcoral')

    def stop_recording(self, event):
        if self.recording_state:
            print("\n" + "=" * 80)
            print("停止采集")
            print("=" * 80)
            self.receiver.stop_recording()
            self.recording_state = False
            self.btn_start.ax.set_facecolor('lightgreen')
            self.btn_stop.ax.set_facecolor('lightgray')

    def on_close(self, event):
        print("\n窗口关闭，停止采集...")
        self.receiver.stop()

    def on_key_press(self, event):
        if event.key in ['q', 'Q']:
            print("\n停止采集...")
            self.receiver.stop()
            plt.close(self.fig)
        elif event.key in ['s', 'S']:
            self.start_recording(None)
        elif event.key in ['x', 'X']:
            self.stop_recording(None)

    def update(self, frame):
        self.update_counter += 1
        current_time = time.time()

        if self.update_counter > 1:
            time_diff = current_time - self.last_update_time
            if time_diff > 0:
                self.display_fps = 1.0 / time_diff
        self.last_update_time = current_time

        self.im.set_data(self.receiver.current_frame)

        if self.receiver.is_recording:
            self.title.set_color('red')
        else:
            self.title.set_color('black')

        if self.update_counter % 10 == 0:
            if self.recording_state:
                status = "状态: 正在采集 ●"
                status_color = 'red'
            else:
                status = "状态: 待机中 ○"
                status_color = 'blue'

            fps = self.receiver.get_fps()
            info = (f"{status}  |  "
                    f"帧率: {fps:.1f} FPS  |  "
                    f"已记录: {self.receiver.frames_saved} 帧  |  "
                    f"错误帧: {self.receiver.error_frames}  |  "
                    f"显示FPS: {self.display_fps:.1f}")

            self.info_text.set_text(info)
            self.info_text.set_color(status_color)

        return [self.im, self.title, self.info_text]

    def show(self):
        try:
            mng = plt.get_current_fig_manager()
            mng.window.state('zoomed')
        except:
            pass
        plt.show()


def main():
    print("=" * 80)
    print("压力垫实时热力图显示系统 - 32x32 (1024点)")
    print("=" * 80)

    try:
        ser = serial.Serial(
            port=MAT_PORT,
            baudrate=1000000,
            bytesize=8,
            parity='N',
            stopbits=1,
            timeout=0
        )

        try:
            ser.set_buffer_size(rx_size=131072, tx_size=131072)
        except:
            pass

        receiver = FrameReceiver(ser, FRAME_SIZE, MAT_NAME)
        print(f"连接成功: {MAT_NAME} ({MAT_PORT})")

    except Exception as e:
        print(f"连接失败: {MAT_PORT} - {e}")
        return

    print("=" * 80)
    print("操作说明:")
    print("   1. 点击 '开始采集' 或按 S 键 → 开始记录数据")
    print("   2. 点击 '停止采集' 或按 X 键 → 停止记录数据")
    print("   3. 按 Q 键 → 退出程序")
    print("   4. 关闭窗口 → 自动保存数据到CSV文件")
    print("=" * 80)
    print("\n等待串口数据...\n")

    thread = threading.Thread(
        target=receiver.read_and_process,
        daemon=True,
        name="Thread-Reader"
    )
    thread.start()
    print(f"{MAT_NAME} 读取线程已启动")

    time.sleep(0.5)

    viewer = SingleMatViewer(receiver)

    try:
        viewer.show()
    except KeyboardInterrupt:
        print("\n用户中断")
        receiver.stop()

    thread.join(timeout=1)

    if len(receiver.all_frames) > 0:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{MAT_NAME}_data_{timestamp}.csv"
        print("\n" + "=" * 80)
        print("保存数据")
        print("=" * 80)
        receiver.save_to_csv(filename)
    else:
        print("\n没有数据需要保存")

    print("\n" + "=" * 80)
    print("最终统计:")
    print("=" * 80)
    elapsed = time.time() - receiver.start_time
    print(f"\n[{MAT_NAME}]")
    print(f"   总采集帧: {len(receiver.all_frames)}")
    print(f"   错误帧: {receiver.error_frames}")
    print(f"   平均帧率: {receiver.get_fps():.1f} FPS")
    print(f"   总时长: {elapsed:.1f} 秒")

    if ser.is_open:
        ser.close()
    print("\n串口已关闭")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"错误: {e}")
        import traceback

        traceback.print_exc()