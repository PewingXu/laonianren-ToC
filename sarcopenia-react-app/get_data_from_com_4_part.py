import serial
import numpy as np
import time
import pandas as pd
import threading
from datetime import datetime
from collections import deque
import os


# 修复 matplotlib 后端问题
import matplotlib

matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.widgets import Button

# === 字体配置 ===
import matplotlib.font_manager as fm

if os.name == 'nt':  # Windows系统
    font_paths = [
        'C:\\Windows\\Fonts\\msyh.ttc',  # 微软雅黑
        'C:\\Windows\\Fonts\\simhei.ttf',  # 黑体
        'C:\\Windows\\Fonts\\simsun.ttc',  # 宋体
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
FRAME_SIZE = 64 * 64  # 4096
FRAME_HEADER = np.array([170, 85, 3, 153], dtype=np.uint8)

# === 垫子配置 ===
MAT_CONFIGS = [
    {'port': 'COM11', 'name': 'mat1'},
    {'port': 'COM10', 'name': 'mat2'},
    {'port': 'COM9', 'name': 'mat3'},
    {'port': 'COM8', 'name': 'mat4'},
]


class FrameReceiver:
    def __init__(self, serial_port, target_frame_size, mat_name, mat_port, mat_index):
        self.ser = serial_port
        self.target_frame_size = target_frame_size
        self.mat_name = mat_name
        self.mat_port = mat_port
        self.buffer = bytearray()

        # 新增：存储垫子编号 (1-4)
        self.mat_index = mat_index

        # 当前采集会话的数据
        self.current_session_frames = []
        self.session_count = 0

        self.frames_saved = 0
        self.current_frame = np.zeros((64, 64), dtype=np.uint8)
        self.is_running = True
        self.is_recording = False  # 是否正在记录

        # 锁，用于线程安全
        self.lock = threading.Lock()

        self.total_frames = 0
        self.error_frames = 0
        self.start_time = time.time()
        self.frame_times = deque(maxlen=30)

        # 性能监控
        self.last_fps_update = time.time()
        self.fps_cache = 0.0

        # 压力状态（仅用于显示）
        self.pressure_sum = 0
        self.active_pixels = 0

    def find_frame_header(self, data, start_pos=0):
        """查找帧头"""
        header_bytes = bytes(FRAME_HEADER)
        return data.find(header_bytes, start_pos)

    def calculate_pressure_info(self, frame_array):
        """计算压力信息（仅用于显示）"""
        above_zero = frame_array > 0
        active_pixels = np.sum(above_zero)
        pressure_sum = np.sum(frame_array[above_zero])
        return active_pixels, pressure_sum

    def extract_frames(self):
        """提取帧"""
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

                # 转换为数组
                frame_array = np.frombuffer(frame_data, dtype=np.uint8)

                # 更新显示帧
                with self.lock:
                    np.copyto(self.current_frame, frame_array.reshape(64, 64))

                # 计算压力信息（仅用于显示）
                active_pixels, pressure_sum = self.calculate_pressure_info(frame_array)
                self.active_pixels = active_pixels
                self.pressure_sum = pressure_sum

                # 如果正在记录，保存帧数据
                if self.is_recording:
                    # self.current_session_frames.append(frame_array.tolist())
                    # 修改：保存字典包含原始数据和时间戳，以便后续计算
                    self.current_session_frames.append({
                        'data': frame_array, 
                        'timestamp': current_time
                    })
                    self.frames_saved += 1

                extracted_count += 1
                self.frame_times.append(current_time)
            else:
                self.error_frames += 1

            self.buffer = self.buffer[next_header:]

        return extracted_count

    # def start_recording(self):
    #     """开始记录（由外部控制）"""
    #     with self.lock:
    #         if not self.is_recording:
    #             self.is_recording = True
    #             self.current_session_frames = []
    #             self.session_count += 1
    #             self.frames_saved = 0
    #             print(f"[{self.mat_name}] 开始采集会话 #{self.session_count}")

    def start_recording(self, session_folder_name=None):
        """开始记录（由外部控制）"""
        with self.lock:
            if not self.is_recording:
                self.is_recording = True
                self.current_session_frames = []
                self.session_count += 1
                self.frames_saved = 0
                
                # [修改点] 设置保存的文件夹名称
                if session_folder_name:
                    self.current_session_folder = session_folder_name
                else:
                    # 如果未提供（单独测试时），则使用当前时间
                    self.current_session_folder = datetime.now().strftime('%Y%m%d_%H%M%S')
                
                print(f"[{self.mat_name}] 开始采集会话 #{self.session_count}")

    def stop_recording(self, custom_filename=None):
        """停止记录并保存（由外部控制）"""
        with self.lock:
            if self.is_recording:
                self.is_recording = False
                if len(self.current_session_frames) > 0:
                    # 生成文件名
                    if custom_filename:
                        filename = custom_filename
                    else:
                        filename = f"{self.mat_index}.csv"

                    # 保存数据
                    self.save_to_csv(filename)

                    print(
                        f"[{self.mat_name}] 采集会话 #{self.session_count} 结束，已保存 {len(self.current_session_frames)} 帧到 {filename}")
                else:
                    print(f"[{self.mat_name}] 采集会话 #{self.session_count} 结束，无数据保存")

    def save_to_csv(self, filename):
        """保存当前会话数据到CSV"""
        try:
            # os.makedirs('gait_data', exist_ok=True)
            # filepath = os.path.join('gait_data', filename)

            # [修改点] 创建带时间戳的子文件夹路径
            base_dir = 'gait_data'
            session_dir = os.path.join(base_dir, self.current_session_folder)
            
            # [修改点] 确保该子文件夹存在
            os.makedirs(session_dir, exist_ok=True)
            
            # [修改点] 拼接最终文件路径
            filepath = os.path.join(session_dir, filename)

            data_rows = []

            # 获取起始时间（如果存在数据）
            start_timestamp = 0
            if len(self.current_session_frames) > 0:
                start_timestamp = self.current_session_frames[0]['timestamp']

            # for i, frame in enumerate(self.current_session_frames):
            #     data_rows.append({
            #         'frame_index': i + 1,
            #         'data': ','.join(map(str, frame))
            #     })

            for i, frame_obj in enumerate(self.current_session_frames):
                frame_data = frame_obj['data']
                ts = frame_obj['timestamp']

                # 1. 格式化时间戳: 2025/9/10 14:49:21:330
                dt = datetime.fromtimestamp(ts)
                ms = int(dt.microsecond / 1000)
                time_str = f"{dt.strftime('%Y/%m/%d %H:%M:%S')}:{ms:03d}"

                # 2. 计算时间间隔 (s)
                # 第一行（i=0）为0，之后为与第一行的差值
                time_interval = ts - start_timestamp
                
                # 3. 计算统计指标
                val_max = np.max(frame_data)
                val_area = np.count_nonzero(frame_data)
                val_press = np.sum(frame_data)

                data_rows.append({
                    # 'frame_index': i + 1,
                    '': f"{time_interval:.2f}", # 保留两位小数
                    'time': time_str,
                    'max': val_max,
                    'area': val_area,
                    'press': val_press,
                    'data': ','.join(map(str, frame_data))
                })

            # 创建 DataFrame，指定列顺序
            columns = ['', 'time', 'max', 'area', 'press', 'data']
            df = pd.DataFrame(data_rows, columns=columns)

            # df = pd.DataFrame(data_rows)

            # 保存到 CSV
            df.to_csv(filepath, index=False)

            print(f"  → 文件保存成功: {filepath}")
            print(f"  → 共记录 {len(data_rows)} 帧数据")

        except Exception as e:
            print(f"  → 保存失败: {e}")

    def read_and_process(self):
        """全速读取"""
        while self.is_running:
            try:
                waiting = self.ser.in_waiting
                if waiting > 0:
                    self.buffer.extend(self.ser.read(waiting))
                    self.extract_frames()
            except Exception as e:
                print(f"[{self.mat_name}] 读取错误: {e}")
                time.sleep(0.001)

    def stop(self):
        """停止接收器"""
        if self.is_recording and len(self.current_session_frames) > 0:
            self.stop_recording()
        self.is_running = False

    def get_fps(self):
        """计算FPS"""
        current_time = time.time()
        if current_time - self.last_fps_update > 0.1:
            if len(self.frame_times) >= 2:
                time_span = self.frame_times[-1] - self.frame_times[0]
                if time_span > 0:
                    self.fps_cache = (len(self.frame_times) - 1) / time_span
            self.last_fps_update = current_time
        return self.fps_cache


class MultiMatViewer:
    def __init__(self, receivers):
        self.receivers = receivers
        self.num_mats = len(receivers)
        self.update_counter = 0
        self.last_update_time = time.time()
        self.display_fps = 0.0

        # 新增：用于存储定时器对象
        self.stop_timer = None

        # 采集阶段状态: 'idle', 'static', 'countdown', 'gait'
        self.phase = 'idle'
        self.phase_start_time = 0
        self.session_folder_name = None

        # 创建图形布局
        fig_height = min(4 * self.num_mats + 1, 19)
        self.fig = plt.figure(figsize=(10, fig_height))
        

        # 主显示区域 (为按钮留出底部空间)
        main_gs = self.fig.add_gridspec(1, 1, bottom=0.08)

        # 热力图区域
        heat_gs = main_gs[0].subgridspec(self.num_mats, 1, hspace=0.4)
        self.axes = [self.fig.add_subplot(heat_gs[i, 0]) for i in range(self.num_mats)]

        self.images = []
        self.colorbars = []
        self.titles = []

        # 为每个垫子创建热力图
        for idx, (ax, receiver) in enumerate(zip(self.axes, self.receivers)):
            with receiver.lock:
                im = ax.imshow(receiver.current_frame, cmap='hot', vmin=0, vmax=255,
                               interpolation='nearest', aspect='equal')
            self.images.append(im)

            cbar = self.fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            cbar.set_label('压力值', fontsize=9)
            self.colorbars.append(cbar)

            ax.set_xlabel('列', fontsize=9)
            ax.set_ylabel('行', fontsize=9)
            title = ax.set_title(f"{receiver.mat_name} ({receiver.mat_port})",
                                 fontsize=11, fontweight='bold')
            self.titles.append(title)
            ax.grid(False)
            ax.set_xticks([])
            ax.set_yticks([])

        # 按钮区域
        button_height = 0.04
        button_width = 0.15
        spacing = 0.02

        # 开始采集按钮
        ax_start = plt.axes([0.3, 0.02, button_width, button_height])
        self.btn_start = Button(ax_start, '开始采集', color='lightgreen', hovercolor='green')
        self.btn_start.on_clicked(self.start_recording)

        # 停止采集按钮
        ax_stop = plt.axes([0.3 + button_width + spacing, 0.02, button_width, button_height])
        self.btn_stop = Button(ax_stop, '停止采集', color='lightcoral', hovercolor='red')
        self.btn_stop.on_clicked(self.stop_recording)

        # 信息文本
        self.info_text = self.fig.text(0.5, 0.065,
                                       '等待开始... (点击"开始采集"按钮开始记录数据)',
                                       ha='center', fontsize=9, color='gray', fontweight='bold')

        # 事件处理
        self.fig.canvas.manager.set_window_title('多垫子同步采集系统')
        self.fig.canvas.mpl_connect('close_event', self.on_close)
        self.fig.canvas.mpl_connect('key_press_event', self.on_key_press)

        # 动画
        self.anim = FuncAnimation(
            self.fig,
            self.update,
            interval=16,
            blit=False,
            cache_frame_data=False
        )

    # def start_recording(self, event):
    #     """开始所有垫子的采集"""
    #     print("\n" + "=" * 80)
    #     print(">>> 开始采集所有垫子数据")
    #     print("=" * 80)
    #     for receiver in self.receivers:
    #         receiver.start_recording()
    #     self.btn_start.color = 'green'
    #     self.btn_start.hovercolor = 'darkgreen'

    def start_recording(self, event):
        """开始采集流程：静态20s → 倒计时3s（已开始记录）→ 步态20s"""
        if self.phase != 'idle':
            print(">>> 当前正在采集中，请等待完成或点击停止")
            return

        print("\n" + "=" * 80)
        print(">>> 开始采集流程")

        # 取消任何可能还在运行的旧定时器
        if self.stop_timer and self.stop_timer.is_alive():
            self.stop_timer.cancel()

        # 生成统一的时间戳作为文件夹名
        self.session_folder_name = datetime.now().strftime('%Y%m%d_%H%M%S')
        print(f">>> 数据将保存至文件夹: gait_data/{self.session_folder_name}")

        # 进入静态采集阶段
        self.phase = 'static'
        self.phase_start_time = time.time()

        print(">>> 【阶段1】静态采集开始，请在 mat1 上保持站立 20 秒...")
        print("=" * 80)

        # 静态阶段只让 mat1 采集
        for receiver in self.receivers:
            if receiver.mat_index == 1:
                receiver.start_recording(self.session_folder_name)
                break

        self.btn_start.color = 'green'
        self.btn_start.hovercolor = 'darkgreen'

        # 20秒后自动完成静态采集
        self.stop_timer = threading.Timer(20.0, self._on_static_complete)
        self.stop_timer.start()

    def _on_static_complete(self):
        """静态采集20s完成后的回调"""
        print("\n" + "=" * 80)
        print(">>> 【阶段1】静态采集完成，保存 stand.csv ...")

        # 停止 mat1 的静态采集，保存为 stand.csv
        for receiver in self.receivers:
            if receiver.mat_index == 1:
                receiver.stop_recording(custom_filename="stand.csv")
                break

        print(">>> 【阶段2】开始步态数据记录，倒计时 3 秒，请准备行走...")
        print("=" * 80)

        # 立即开始所有垫子的步态数据记录（倒计时期间也在记录）
        for receiver in self.receivers:
            receiver.start_recording(self.session_folder_name)

        # 进入倒计时阶段
        self.phase = 'countdown'
        self.phase_start_time = time.time()

        # 3秒倒计时结束后进入正式步态采集阶段
        self.stop_timer = threading.Timer(3.0, self._on_countdown_complete)
        self.stop_timer.start()

    def _on_countdown_complete(self):
        """3秒倒计时结束后的回调"""
        print("\n>>> 倒计时结束，正式步态采集中...")

        # 进入步态采集阶段
        self.phase = 'gait'
        self.phase_start_time = time.time()

        # 20秒后自动停止步态采集
        self.stop_timer = threading.Timer(20.0, self.stop_recording, args=[None])
        self.stop_timer.start()
        print(">>> 步态采集将在 20 秒后自动停止...")

    def stop_recording(self, event):
        """停止所有垫子的采集"""
        if self.phase == 'idle':
            return

        # 1. 如果存在定时器，取消它
        if self.stop_timer and self.stop_timer.is_alive():
            self.stop_timer.cancel()
            print(">>> 定时器已取消")

        print("\n" + "=" * 80)
        print(">>> 停止采集所有垫子数据")
        print("=" * 80)
        for receiver in self.receivers:
            receiver.stop_recording()
        print("=" * 80)

        # 重置状态
        self.phase = 'idle'
        self.btn_start.color = 'lightgreen'
        self.btn_start.hovercolor = 'green'

        # 2. 更新信息文本，告知用户数据已保存
        self.info_text.set_text("数据已保存。等待开始... (点击'开始采集'按钮开始记录数据)")

    def on_close(self, event):
        """窗口关闭事件处理"""
        print("\n窗口关闭，停止所有采集...")
        for receiver in self.receivers:
            receiver.stop()

    def on_key_press(self, event):
        """键盘事件处理"""
        if event.key in ['q', 'Q']:
            print("\n停止所有采集...")
            for receiver in self.receivers:
                receiver.stop()
            plt.close(self.fig)

    def update(self, frame):
        """更新动画帧"""
        self.update_counter += 1

        current_time = time.time()
        if self.update_counter > 1:
            time_diff = current_time - self.last_update_time
            if time_diff > 0:
                self.display_fps = 1.0 / time_diff
        self.last_update_time = current_time

        # 更新所有图像
        for idx, receiver in enumerate(self.receivers):
            with receiver.lock:
                self.images[idx].set_data(receiver.current_frame.T)

            # 根据状态设置标题颜色
            if receiver.is_recording:
                self.titles[idx].set_color('red')
            else:
                self.titles[idx].set_color('black')

        # 每20帧更新一次显示文本
        if self.update_counter % 20 == 0:
            if self.phase == 'static':
                elapsed = time.time() - self.phase_start_time
                remaining = max(0, 20 - elapsed)
                status_text = f"【静态采集】请保持站立... 剩余 {remaining:.0f} 秒"
                color = 'blue'
            elif self.phase == 'countdown':
                elapsed = time.time() - self.phase_start_time
                remaining = max(1, int(3 - elapsed) + 1)
                status_text = f"静态采集完成！请准备开始行走... {remaining}"
                color = 'orange'
            elif self.phase == 'gait':
                elapsed = time.time() - self.phase_start_time
                remaining = max(0, 20 - elapsed)
                status_text = f"【步态采集】请正常行走... 剩余 {remaining:.0f} 秒"
                color = 'red'
            else:
                status_text = "待机中 (点击'开始采集'按钮开始记录)"
                color = 'gray'

            info_parts = []
            for receiver in self.receivers:
                fps = receiver.get_fps()
                if receiver.is_recording:
                    status = "●采集中"
                else:
                    status = "○待机"

                info = (f"{receiver.mat_name}:{status}|"
                        f"{fps:>5.1f}FPS|"
                        f"会话{receiver.session_count}|"
                        f"帧{receiver.frames_saved:>4d}|"
                        f"压力{receiver.active_pixels:>3d}像素")
                info_parts.append(info)

            full_info = f"{status_text}  |  " + ' | '.join(info_parts)
            self.info_text.set_text(full_info)
            self.info_text.set_color(color)

        return self.images + self.titles + [self.info_text]

    def show(self):
        """显示窗口"""
        try:
            mng = plt.get_current_fig_manager()
            mng.window.state('zoomed')
        except:
            pass
        plt.show()


def main():
    receivers = []
    serial_ports = []
    threads = []

    print("=" * 80)
    print("多垫子同步采集系统")
    print("=" * 80)

    # 连接所有垫子
    for idx, config in enumerate(MAT_CONFIGS):
        try:
            ser = serial.Serial(
                port=config['port'],
                baudrate=3000000,
                bytesize=8,
                parity='N',
                stopbits=1,
                timeout=0
            )

            try:
                ser.set_buffer_size(rx_size=131072, tx_size=131072)
            except:
                pass

            receiver = FrameReceiver(ser, FRAME_SIZE, config['name'], config['port'], idx + 1)
            receivers.append(receiver)
            serial_ports.append(ser)

            print(f"连接成功: {config['name']} ({config['port']})")

        except Exception as e:
            print(f"连接失败: {config['name']} ({config['port']}) - {e}")

    if len(receivers) == 0:
        print("\n错误: 没有成功连接的垫子!")
        return

    num_mats = len(receivers)

    print(f"\n成功连接 {num_mats} 个垫子")
    print("=" * 80)
    print("使用说明:")
    print("   1. 点击'开始采集'按钮，所有垫子同时开始记录数据")
    print("   2. 点击'停止采集'按钮，所有垫子同时停止并各自保存CSV文件")
    print("   3. 每个垫子的数据保存在独立的CSV文件中")
    print("   4. 按 Q 键退出程序")
    print("=" * 80)
    print()

    # 为每个垫子启动独立线程
    for receiver in receivers:
        thread = threading.Thread(
            target=receiver.read_and_process,
            daemon=True,
            name=f"Thread-{receiver.mat_name}"
        )
        thread.start()
        threads.append(thread)
        print(f"{receiver.mat_name} 读取线程已启动")

    time.sleep(0.2)

    # 创建并显示可视化界面
    receivers.reverse()
    viewer = MultiMatViewer(receivers)

    try:
        viewer.show()
    except KeyboardInterrupt:
        print("\n用户中断")
        for receiver in receivers:
            receiver.stop()

    # 等待所有线程结束
    for thread in threads:
        thread.join(timeout=1)

    # 显示最终统计
    print("\n" + "=" * 80)
    print("最终统计:")
    print("=" * 80)
    for receiver in receivers:
        elapsed = time.time() - receiver.start_time
        print(f"\n[{receiver.mat_name}] ({receiver.mat_port})")
        print(f"   总采集会话: {receiver.session_count}")
        print(f"   总帧数: {receiver.total_frames}")
        print(f"   错误帧: {receiver.error_frames}")
        print(f"   平均帧率: {receiver.get_fps():.1f} FPS")
        print(f"   运行时长: {elapsed:.1f} 秒")

    # 关闭串口
    for ser in serial_ports:
        if ser.is_open:
            ser.close()
    print("\n所有串口已关闭")
    print("所有CSV文件已保存到 gait_data 文件夹")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"错误: {e}")
        import traceback

        traceback.print_exc()