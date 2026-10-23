#!/usr/bin/env python3
"""
PaddleOCR 轻量服务 — 供 Java 后端 AgentServiceImpl 调用
用法：
  pip install paddlepaddle paddleocr flask
  python ocr_server.py
默认监听 http://0.0.0.0:8866/ocr
"""

import io
import os
import gc
import ctypes
import time
import logging
import threading
from flask import Flask, request, jsonify

logging.disable(logging.WARNING)  # 屏蔽 PaddleOCR 的冗余日志

import numpy as np
from PIL import Image

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024  # 上传限 8MB，防止超大图打爆内存

MAX_SIDE = 1600  # 图片长边上限，超出等比缩放（2G 内存机器必须限制）

# 空闲自动释放：2G 内存机器上 OCR 常驻约 400MB、推理峰值约 800MB，
# 长时间没人识图时销毁引擎，把内存还给系统（下次请求重新加载仅需约 1s）
IDLE_RELEASE_SECONDS = int(os.environ.get('OCR_IDLE_RELEASE_SECONDS', '180'))
# 空闲超过该秒数则主动退出，由 systemd(Restart=always) 拉起，内存回落到约 35MB；0 表示不启用
IDLE_EXIT_SECONDS = int(os.environ.get('OCR_IDLE_EXIT_SECONDS', '0'))

# 延迟初始化：首次请求时才加载模型（避免启动时卡住）
_ocr_engine = None
# Paddle 的 predictor 非线程安全：跨线程复用会报 "could not execute a primitive"
# 因此初始化与推理全程串行，且 Flask 关闭多线程（见文件末尾 app.run）
_ocr_lock = threading.RLock()
_last_request_at = time.time()


def get_ocr():
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR
        # PaddleOCR 2.x: use_angle_cls 启用角度分类
        _ocr_engine = PaddleOCR(use_angle_cls=True, lang='ch')
    return _ocr_engine


def release_engine():
    """销毁引擎并归还内存（实测可从约 800MB 回落到约 400MB）"""
    global _ocr_engine
    with _ocr_lock:
        if _ocr_engine is None:
            return False
        _ocr_engine = None
    gc.collect()
    try:
        ctypes.CDLL('libc.so.6').malloc_trim(0)  # 把空闲堆内存还给操作系统
    except Exception:
        pass
    return True


def idle_watcher():
    """后台线程：空闲一段时间后释放内存，必要时退出交回 systemd 重启"""
    while True:
        time.sleep(30)
        idle = time.time() - _last_request_at
        if IDLE_EXIT_SECONDS and idle > IDLE_EXIT_SECONDS:
            print(f'空闲 {int(idle)}s，进程退出交回 systemd 重启', flush=True)
            os._exit(0)
        if idle > IDLE_RELEASE_SECONDS:
            if release_engine():
                print(f'空闲 {int(idle)}s，已释放 OCR 引擎内存', flush=True)


def shrink_image(pil_img):
    """等比缩放限制长边，避免大图推理时内存暴涨"""
    w, h = pil_img.size
    longest = max(w, h)
    if longest <= MAX_SIDE:
        return pil_img
    ratio = MAX_SIDE / float(longest)
    return pil_img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)


@app.route('/ocr', methods=['POST'])
def ocr():
    """
    接收图片文件，返回识别文本
    请求: multipart/form-data, 字段名 image
    响应: {"code": 200, "text": "识别到的文字", "lines": 5}
    """
    if 'image' not in request.files:
        return jsonify({'code': 400, 'msg': '缺少 image 文件'}), 400

    global _last_request_at
    _last_request_at = time.time()  # 刷新活跃时间，避免刚用完就被释放

    file = request.files['image']
    # 读取到内存再传给 PaddleOCR（避免临时文件管理）
    img_bytes = file.read()

    try:
        with _ocr_lock:
            engine = get_ocr()
            # PaddleOCR 2.x: ocr() 接受 numpy 数组，cls=True 启用角度分类
            # 统一转为 RGB（PaddleOCR 不支持 RGBA / 灰度图的 numpy 输入）
            pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            pil_img = shrink_image(pil_img)
            img = np.array(pil_img)
            result = engine.ocr(img, cls=True)

        # PaddleOCR 2.x 返回 [[ [ [box], (text, confidence) ], ... ]]
        # 外层是页列表，内层是行列表
        lines = []
        if result:
            for page in result:
                if not page:
                    continue
                for item in page:
                    if item and len(item) >= 2:
                        text = item[1][0]
                        lines.append(text)

        full_text = '\n'.join(lines)
        return jsonify({
            'code': 200,
            'text': full_text,
            'lines': len(lines)
        })

    except Exception as e:
        return jsonify({'code': 500, 'msg': f'OCR识别失败: {e}'}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'code': 200, 'status': 'ok'})


if __name__ == '__main__':
    print('=' * 50)
    print('PaddleOCR 服务启动中...')
    print('监听地址: http://0.0.0.0:8866')
    print('调用接口: POST http://localhost:8866/ocr')
    print('=' * 50, flush=True)

    # 预热：启动时加载模型，避免首个请求耗时过长被后端超时中断
    try:
        with _ocr_lock:
            get_ocr()
        print('模型预加载完成', flush=True)
    except Exception as e:
        print(f'模型预加载失败，将延迟到首次请求加载: {e}', flush=True)

    if IDLE_RELEASE_SECONDS or IDLE_EXIT_SECONDS:
        threading.Thread(target=idle_watcher, daemon=True).start()
        print(f'空闲回收已启用: 释放>{IDLE_RELEASE_SECONDS}s, 退出>{IDLE_EXIT_SECONDS}s', flush=True)

    # threaded=False：单线程串行处理请求，保证 predictor 只在同一线程内使用
    app.run(host='0.0.0.0', port=8866, threaded=False)
