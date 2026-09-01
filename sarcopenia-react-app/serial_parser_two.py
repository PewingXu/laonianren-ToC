import serial
import time
import threading
import queue
from datetime import datetime
from dataclasses import dataclass
from typing import List, Optional, Callable, Any
import logging
import sys
import struct
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)-8s] - [%(filename)s:%(lineno)4d] - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("serial_parser")
logger.setLevel(logging.INFO)  # 改为INFO减少日志

# 帧头定义
HEADER = bytes([0xAA, 0x55, 0x03, 0x99])
HEADER_LEN = len(HEADER)

# 包类型定义
PACKET_TYPE_1 = 0x01
PACKET_TYPE_2 = 0x02

# 缓存等待匹配包1的数据
packet1_cache = {}
packet_cache_lock = threading.Lock()


@dataclass
class SensorData:
    timestamp: datetime
    data: List[int]  # 272字节：256传感器 + 16IMU
    hand: int = 0

    @property
    def sensor_values(self):
        """获取传感器数据（前256字节）"""
        return self.data[:256]

    @property
    def imu_bytes(self):
        """获取IMU原始字节（最后16字节）"""
        return bytes(self.data[-16:])

    @property
    def quaternion(self):
        """解析四元数 [w, x, y, z]"""
        try:
            if len(self.data) < 272:
                logger.warning(f"⚠️ 数据长度不足: {len(self.data)} < 272")
                return None

            # 提取最后16字节
            imu = bytes(self.data[-16:])

            # 解析四元数
            q = struct.unpack('<4f', imu)

            # 检查是否有无效值 (NaN或Inf)
            if any(not np.isfinite(v) for v in q):
                logger.warning(f"⚠️ 四元数包含无效值: {q}")
                return None

            # 检查模长是否合理 (应接近1)
            magnitude = np.linalg.norm(q)
            if magnitude < 0.5 or magnitude > 2.0:
                logger.warning(f"⚠️ 四元数模长异常: {magnitude:.3f}")
                return None

            return q

        except Exception as e:
            logger.exception(f"❌ 四元数解析失败: {e}")
            return None


class SerialParser:
    def __init__(self, port, baudrate=921600):
        self.port = port
        self.baudrate = baudrate
        self.ser = None

        # 多线程缓冲区结构
        self.data_queue = queue.Queue()
        self.total_bytes = 0

        # 统计数据
        self.packet_count = 0
        self.error_count = 0
        self.last_valid_time = time.time()

        # 线程控制
        self.stop_event = threading.Event()
        self.parsing_thread = None
        self.reader_thread = None

        # 回调函数
        self.callback = None

        # 解析线程的虚拟缓冲区
        self.virtual_buffer = bytearray()
        self.virtual_timestamps = []

        # 缓冲区锁
        self.buffer_lock = threading.Lock()

    def connect(self):
        """连接串口"""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                bytesize=serial.EIGHTBITS,
                timeout=0.01
            )
            logger.info(f"已连接到串口 {self.port}, 波特率 {self.baudrate}")
            return True
        except serial.SerialException as e:
            logger.exception(f"连接串口失败: {e}")
            return False

    def disconnect(self):
        """断开串口连接"""
        self.stop_event.set()
        if self.ser and self.ser.is_open:
            self.ser.close()
            logger.info("串口已关闭")

        if self.parsing_thread:
            self.parsing_thread.join(1.0)
        if self.reader_thread:
            self.reader_thread.join(1.0)

    def serial_reader_thread(self):
        """串口数据读取线程"""
        logger.info("串口读取线程启动")
        while not self.stop_event.is_set():
            if not self.ser or not self.ser.is_open:
                time.sleep(0.1)
                continue

            try:
                data = self.ser.read(128)
                if data:
                    ts = datetime.now()
                    self.data_queue.put((ts, data))
            except serial.SerialException as e:
                logger.exception(f"读取串口数据错误: {e}")
                time.sleep(0.1)
        logger.info("串口读取线程退出")

    def update_virtual_buffer(self):
        """更新虚拟缓冲区（从队列中取出数据）"""
        try:
            while not self.data_queue.empty():
                ts, data_chunk = self.data_queue.get_nowait()
                with self.buffer_lock:
                    self.virtual_buffer.extend(data_chunk)
                    self.virtual_timestamps.extend([ts] * len(data_chunk))
        except queue.Empty:
            pass

    def parser_thread(self):
        """数据解析线程"""
        logger.info("数据解析线程启动")
        while not self.stop_event.is_set():
            self.update_virtual_buffer()
            sensor_data_list = self.find_packet()

            if self.callback and sensor_data_list:
                for sensor_data in sensor_data_list:
                    self.callback(sensor_data)

            time.sleep(0.01)

        logger.info("数据解析线程退出")

    def find_packet(self) -> List[SensorData]:
        """在缓冲区中查找并解析数据包"""
        results = []
        processed_bytes = 0

        with self.buffer_lock:
            buffer = self.virtual_buffer
            timestamps = self.virtual_timestamps

        while len(buffer) >= HEADER_LEN:
            header_pos = -1
            for i in range(len(buffer) - HEADER_LEN + 1):
                if bytes(buffer[i:i + HEADER_LEN]) == HEADER:
                    header_pos = i
                    break

            if header_pos == -1:
                processed_bytes = max(0, len(buffer) - HEADER_LEN + 1)
                break

            header_time = timestamps[header_pos]

            if len(buffer) < header_pos + HEADER_LEN + 2:
                break

            packet_order = buffer[header_pos + HEADER_LEN]
            sensor_type = buffer[header_pos + HEADER_LEN + 1]

            if packet_order == PACKET_TYPE_1:
                data_len = 128
            elif packet_order == PACKET_TYPE_2:
                data_len = 144
            else:
                logger.warning(f"错误: 无效包顺序 0x{packet_order:02X}")
                processed_bytes = header_pos + HEADER_LEN
                self.error_count += 1
                break

            total_len = HEADER_LEN + 2 + data_len
            if len(buffer) < header_pos + total_len:
                break

            packet_data = bytes(buffer[header_pos + HEADER_LEN + 2: header_pos + total_len])

            sensor_data = self.process_packet(
                packet_order,
                sensor_type,
                packet_data,
                header_time
            )

            if sensor_data:
                results.append(sensor_data)

            processed_bytes = header_pos + total_len
            buffer = buffer[header_pos + total_len:]
            timestamps = timestamps[header_pos + total_len:]

        if processed_bytes > 0:
            with self.buffer_lock:
                self.virtual_buffer = buffer
                self.virtual_timestamps = timestamps

        return results

    def process_packet(self, packet_order: int, sensor_type: int, data: bytes, header_time: datetime) -> Optional[
        SensorData]:
        """处理包并返回SensorData对象"""
        if packet_order == PACKET_TYPE_1:
            with packet_cache_lock:
                packet1_cache[sensor_type] = (data, header_time)
            return None

        elif packet_order == PACKET_TYPE_2:
            with packet_cache_lock:
                if sensor_type in packet1_cache:
                    packet1_data, packet1_time = packet1_cache.pop(sensor_type)

                    combined_data = packet1_data + data

                    sensor_data = SensorData(
                        timestamp=packet1_time,
                        data=list(combined_data),
                        hand=sensor_type
                    )

                    self.packet_count += 1
                    self.last_valid_time = time.time()
                    return sensor_data
                else:
                    if self.packet_count < 20:
                        logger.warning(f"错误: 收到包2但没有对应的包1 (传感器 0x{sensor_type:02X})")
                    self.error_count += 1
                    return None
        return None

    def run(self, callback: Callable[[SensorData], Any]):
        """启动数据采集系统"""
        self.callback = callback

        if not self.connect():
            return

        self.reader_thread = threading.Thread(target=self.serial_reader_thread, daemon=True)
        self.parsing_thread = threading.Thread(target=self.parser_thread, daemon=True)

        self.reader_thread.start()
        self.parsing_thread.start()

        logger.info("开始接收数据...(按Ctrl+C停止)")

        try:
            last_stat_time = time.time()
            while True:
                if time.time() - last_stat_time > 5:
                    last_stat_time = time.time()

                if not self.reader_thread.is_alive() or not self.parsing_thread.is_alive():
                    logger.error("错误: 一个子线程已停止")
                    break

                time.sleep(1)

        except KeyboardInterrupt:
            logger.info("\n用户中断...")
        finally:
            self.disconnect()
            logger.info("数据采集系统已停止")


# 测试代码
if __name__ == "__main__":
    last_timestamp = None


    def process_sensor_data(sensor_data: SensorData):
        global last_timestamp

        timestamp_str = sensor_data.timestamp.strftime("%H:%M:%S.%f")[:-3]
        key_data = sensor_data.data[34:48:3]

        if last_timestamp is None:
            time_offset = 0
        else:
            time_offset = (sensor_data.timestamp - last_timestamp).total_seconds() * 1000

        logger.info(f"[{timestamp_str}], [{int(time_offset)}ms] 传感器 {sensor_data.hand:02X}: {key_data}")

        if sensor_data.quaternion:
            logger.info(f"  四元数: {sensor_data.quaternion}")

        last_timestamp = sensor_data.timestamp


    PORT = 'COM7'
    parser = SerialParser(PORT, baudrate=921600)
    parser.run(callback=process_sensor_data)