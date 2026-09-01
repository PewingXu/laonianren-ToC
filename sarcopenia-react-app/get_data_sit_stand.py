import serial
import numpy as np
import time
import pandas as pd
import threading
from datetime import datetime
from collections import deque
import os
import matplotlib

# 使用 TkAgg 后端
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.widgets import Button
import matplotlib.font_manager as fm

# === 字体配置 ===
if os.name == 'nt':
    plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Arial']
else:
    plt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# === 通用帧头 ===
FRAME_HEADER = np.array([170, 85, 3, 153], dtype=np.uint8)

# ==========================================
# [配置区域] 请根据实际插入的 USB 口修改
# ==========================================
MAT_CONFIGS = [
    {
        'port': 'COM6',          # 修改为采集"stand"数据的串口号
        'baud': 6000000,         # 站立垫子波特率
        'name': 'Stand (64x64)', 
        'filename': 'stand.csv', # 对应文件名
        'shape': (64, 64)        # [关键] 64*64 分辨率
    }, 
    {
        'port': 'COM5',          # 修改为采集"sit"数据的串口号
        'baud': 1000000,         # 坐垫波特率
        'name': 'Sit (32x32)',   
        'filename': 'sit.csv',   # 对应文件名
        'shape': (32, 32)        # [关键] 32*32 分辨率
    },
]

class FrameReceiver:
    def __init__(self, serial_port, config):
        self.ser = serial_port
        self.config = config
        
        # 从配置中获取分辨率和名称
        self.mat_name = config['name']
        self.target_filename = config['filename']
        self.shape = config['shape'] # (64,64) 或 (32,32)
        self.target_frame_size = self.shape[0] * self.shape[1] # 4096 或 1024
        
        self.buffer = bytearray()
        self.current_session_frames = []
        self.frames_saved = 0
        # 初始化为空白帧，尺寸根据配置动态生成
        self.current_frame = np.zeros(self.shape, dtype=np.uint8)
        
        self.is_running = True
        self.is_recording = False
        self.lock = threading.Lock()
        self.total_frames = 0
        self.frame_times = deque(maxlen=30)
        self.last_fps_update = time.time()
        self.fps_cache = 0.0
        self.current_session_folder = ""

    def find_frame_header(self, data, start_pos=0):
        header_bytes = bytes(FRAME_HEADER)
        return data.find(header_bytes, start_pos)

    def extract_frames(self):
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

            # 获取两个头之间的数据
            frame_data = self.buffer[first_header + header_len:next_header]
            self.total_frames += 1

            # 校验数据长度是否符合配置的 size (1024 或 4096)
            if len(frame_data) == self.target_frame_size:
                current_time = time.time()

                # 必须使用 uint8 读取
                # frame_array = np.frombuffer(frame_data, dtype=np.uint8)
                frame_array = np.frombuffer(frame_data, dtype=np.uint8).copy()

                reshaped_frame = frame_array.reshape(self.shape)

                # [修改点2] 针对 32x32 的特殊线序修正
                # 现象：前半部分(0-15)正常，后半部分是(31-16)倒序的
                if self.shape == (32, 32):
                    # 将矩阵的后16行 (索引16到31) 进行上下翻转
                    # 这样原先的第31行数据就会变回第16行，以此类推
                    reshaped_frame[15:32] = reshaped_frame[15:32][::-1]
                    
                    # 更新一维数组，确保保存到 CSV 的数据也是修正后的顺序
                    frame_array = reshaped_frame.flatten()

                with self.lock:
                    # 动态 reshape
                    # np.copyto(self.current_frame, frame_array.reshape(self.shape))
                    np.copyto(self.current_frame, reshaped_frame)

                if self.is_recording:
                    self.current_session_frames.append({
                        'data': frame_array,
                        'timestamp': current_time
                    })
                    self.frames_saved += 1

                self.frame_times.append(current_time)
            
            self.buffer = self.buffer[next_header:]

    def start_recording(self, session_folder_name):
        with self.lock:
            self.is_recording = True
            self.current_session_frames = []
            self.frames_saved = 0
            self.current_session_folder = session_folder_name
            print(f"[{self.mat_name}] 开始采集... (Size: {self.shape})")

    def stop_recording(self):
        with self.lock:
            if self.is_recording:
                self.is_recording = False
                if len(self.current_session_frames) > 0:
                    self.save_to_csv()
                else:
                    print(f"[{self.mat_name}] 采集结束，无数据保存")

    def save_to_csv(self):
        try:
            base_dir = 'gait_data'
            # 拼接路径：gait_data / 时间戳文件夹 / stand.csv (或 sit.csv)
            save_dir = os.path.join(base_dir, self.current_session_folder)
            os.makedirs(save_dir, exist_ok=True)
            
            filepath = os.path.join(save_dir, self.target_filename)

            data_rows = []
            start_timestamp = 0
            if len(self.current_session_frames) > 0:
                start_timestamp = self.current_session_frames[0]['timestamp']

            print(f"[{self.mat_name}] 正在保存 {len(self.current_session_frames)} 帧到 {filepath} ...")

            for frame_obj in self.current_session_frames:
                frame_data = frame_obj['data']
                ts = frame_obj['timestamp']

                dt = datetime.fromtimestamp(ts)
                ms = int(dt.microsecond / 1000)
                time_str = f"{dt.strftime('%Y/%m/%d %H:%M:%S')}:{ms:03d}"
                time_interval = ts - start_timestamp
                
                # 强制转为 int，防止负数
                val_max = int(np.max(frame_data))
                val_area = int(np.count_nonzero(frame_data))
                val_press = int(np.sum(frame_data))
                
                # 加上 [] 包裹数据，便于 ast.literal_eval 读取
                data_str = f"[{','.join(map(str, frame_data))}]"

                data_rows.append({
                    '': f"{time_interval:.2f}",
                    'time': time_str,
                    'max': val_max,
                    'area': val_area,
                    'press': val_press,
                    'data': data_str
                })

            columns = ['', 'time', 'max', 'area', 'press', 'data']
            df = pd.DataFrame(data_rows, columns=columns)
            df.to_csv(filepath, index=False)
            print(f"[{self.mat_name}] √ 保存成功")

        except Exception as e:
            print(f"[{self.mat_name}] X 保存失败: {e}")
            import traceback
            traceback.print_exc()

    def read_and_process(self):
        while self.is_running:
            try:
                waiting = self.ser.in_waiting
                if waiting > 0:
                    self.buffer.extend(self.ser.read(waiting))
                    self.extract_frames()
                else:
                    time.sleep(0.001)
            except Exception as e:
                print(f"[{self.mat_name}] 读取错误: {e}")
                time.sleep(0.001)

    def stop(self):
        if self.is_recording:
            self.stop_recording()
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

class MultiMatViewer:
    def __init__(self, receivers):
        self.receivers = receivers
        
        # 宽一点的窗口，容纳并排显示
        self.fig = plt.figure(figsize=(12, 6))
        
        # 创建 1行2列 的子图
        self.axes = self.fig.subplots(1, 2)
        if len(receivers) == 1: 
            self.axes = [self.axes] 

        self.images = []
        self.titles = []
        
        # 初始化图像
        for i, receiver in enumerate(self.receivers):
            ax = self.axes[i]
            with receiver.lock:
                # 这里的 current_frame 可能是 64x64 也可能是 32x32，imshow 会自动适配
                im = ax.imshow(receiver.current_frame, cmap='hot', vmin=0, vmax=255,
                               interpolation='nearest', aspect='equal')
            self.images.append(im)
            
            title = ax.set_title(f"{receiver.mat_name}\n({receiver.config['port']})", 
                               fontsize=10, fontweight='bold')
            self.titles.append(title)
            ax.axis('off') 

        # 按钮区域
        button_width = 0.15
        button_height = 0.05
        
        ax_start = plt.axes([0.35, 0.05, button_width, button_height])
        self.btn_start = Button(ax_start, '开始采集', color='lightgreen', hovercolor='green')
        self.btn_start.on_clicked(self.start_recording)

        ax_stop = plt.axes([0.55, 0.05, button_width, button_height])
        self.btn_stop = Button(ax_stop, '停止采集', color='lightcoral', hovercolor='red')
        self.btn_stop.on_clicked(self.stop_recording)

        self.info_text = self.fig.text(0.5, 0.12,
                                     '等待开始...',
                                     ha='center', fontsize=11, color='gray', fontweight='bold')

        self.fig.canvas.manager.set_window_title('双通道采集系统 (Stand & Sit)')
        self.fig.canvas.mpl_connect('close_event', self.on_close)

        self.anim = FuncAnimation(
            self.fig,
            self.update,
            interval=30,
            blit=False,
            cache_frame_data=False
        )
        
        self.is_recording_global = False

    def start_recording(self, event):
        if self.is_recording_global: return

        print("\n" + "=" * 60)
        print(">>> 启动双路采集")
        
        # 生成统一的文件夹名：YYYYMMDD_HHMMSS
        session_folder_name = datetime.now().strftime('%Y%m%d_%H%M%S')
        print(f">>> 数据存放目录: gait_data/{session_folder_name}/")
        
        # 同时启动所有接收器
        for receiver in self.receivers:
            receiver.start_recording(session_folder_name)
            
        self.is_recording_global = True
        self.btn_start.color = 'green'
        self.info_text.set_text(f"● 正在录制: {session_folder_name}")
        self.info_text.set_color('red')

    def stop_recording(self, event):
        if not self.is_recording_global: return
        
        print("\n>>> 停止采集")
        for receiver in self.receivers:
            receiver.stop_recording()
        
        self.is_recording_global = False
        self.btn_start.color = 'lightgreen'
        self.info_text.set_text("数据保存完毕")
        self.info_text.set_color('blue')

    def on_close(self, event):
        print("\n窗口关闭，停止线程...")
        for receiver in self.receivers:
            receiver.stop()

    def update(self, frame):
        for i, receiver in enumerate(self.receivers):
            # 更新图像
            with receiver.lock:
                self.images[i].set_data(receiver.current_frame)
            
            # 更新标题状态
            fps = receiver.get_fps()
            status_str = "REC" if receiver.is_recording else "IDLE"
            self.titles[i].set_text(f"{receiver.mat_name} [{status_str}]\nFPS: {fps:.1f} | Frames: {receiver.frames_saved}")
            
            if receiver.is_recording:
                self.titles[i].set_color('red')
            else:
                self.titles[i].set_color('black')

        return self.images + self.titles

    def show(self):
        plt.show()

def main():
    print("=" * 60)
    print("双通道数据采集程序 (不同分辨率适配版)")
    print("Stand (COM8) -> 6M Baud -> 64x64 -> stand.csv")
    print("Sit   (COM9) -> 1M Baud -> 32x32 -> sit.csv")
    print("=" * 60)

    receivers = []
    serial_ports = []

    # 初始化所有串口
    for config in MAT_CONFIGS:
        try:
            ser = serial.Serial(
                port=config['port'],
                baudrate=config['baud'],
                bytesize=8,
                parity='N',
                stopbits=1,
                timeout=0
            )
            try:
                ser.set_buffer_size(rx_size=131072, tx_size=131072)
            except:
                pass
            
            # [关键] 传入整个 config 对象，以便内部获取 shape
            receiver = FrameReceiver(ser, config)
            receivers.append(receiver)
            serial_ports.append(ser)
            print(f"[成功] 连接 {config['name']} @ {config['port']} (Size: {config['shape']})")

        except Exception as e:
            print(f"[失败] 无法连接 {config['port']}: {e}")

    if not receivers:
        print("没有可用的串口连接，程序退出。")
        return

    # 启动所有读取线程
    threads = []
    for receiver in receivers:
        t = threading.Thread(target=receiver.read_and_process, daemon=True)
        t.start()
        threads.append(t)
    
    time.sleep(0.5) # 等待数据稳定

    # 启动界面
    viewer = MultiMatViewer(receivers)
    try:
        viewer.show()
    except KeyboardInterrupt:
        pass

    # 清理资源
    for receiver in receivers:
        receiver.stop()
    for t in threads:
        t.join(timeout=1)
    for ser in serial_ports:
        if ser.is_open:
            ser.close()
    print("程序结束")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Main Error: {e}")
        import traceback
        traceback.print_exc()