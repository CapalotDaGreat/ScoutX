"""YOLOX detector (Apache-2.0 model family) - self-contained network definition + safe weight loading.

Replaces the AGPL-3.0 Ultralytics YOLO11 detector for commercial use. The architecture follows the
published YOLOX design (Ge et al., 2021, "YOLOX: Exceeding YOLO Series in 2021"; reference
implementation Megvii-BaseDetection/YOLOX, Apache-2.0) and is written here so no third-party
training/runtime code is imported. Weights are the official COCO releases (Apache-2.0,
github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0), loaded with `weights_only=True`
(tensor-only unpickler: a checkpoint cannot execute code) and `strict=True` (the architecture must
match every tensor exactly).

COCO classes used here: 0 = person, 32 = sports ball.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from torch import nn

VARIANTS = {  # name: (depth multiplier, width multiplier)
    "yolox_nano": (0.33, 0.25),
    "yolox_tiny": (0.33, 0.375),
    "yolox_s": (0.33, 0.50),
    "yolox_m": (0.67, 0.75),
    "yolox_l": (1.0, 1.0),
}
PERSON, BALL = 0, 32
WEIGHTS_URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/{name}.pth"


class BaseConv(nn.Module):
    def __init__(self, cin: int, cout: int, k: int, s: int = 1) -> None:
        super().__init__()
        self.conv = nn.Conv2d(cin, cout, k, s, (k - 1) // 2, bias=False)
        self.bn = nn.BatchNorm2d(cout, eps=1e-3, momentum=0.03)
        self.act = nn.SiLU(inplace=True)

    def forward(self, x):
        return self.act(self.bn(self.conv(x)))

    def fuse(self) -> None:
        """Folds BatchNorm into the convolution (inference speed-up, identical outputs)."""
        w, bn = self.conv.weight, self.bn
        std = (bn.running_var + bn.eps).sqrt()
        fused = nn.Conv2d(self.conv.in_channels, self.conv.out_channels, self.conv.kernel_size, self.conv.stride,
                          self.conv.padding, groups=self.conv.groups, bias=True)
        fused.weight.data = w * (bn.weight / std).reshape(-1, 1, 1, 1)
        fused.bias.data = bn.bias - bn.running_mean * bn.weight / std
        self.conv, self.bn = fused, nn.Identity()


class Bottleneck(nn.Module):
    def __init__(self, cin: int, cout: int, shortcut: bool = True) -> None:
        super().__init__()
        self.conv1 = BaseConv(cin, cout, 1)
        self.conv2 = BaseConv(cout, cout, 3)
        self.add = shortcut and cin == cout

    def forward(self, x):
        y = self.conv2(self.conv1(x))
        return y + x if self.add else y


class CSPLayer(nn.Module):
    def __init__(self, cin: int, cout: int, n: int = 1, shortcut: bool = True) -> None:
        super().__init__()
        hidden = int(cout * 0.5)
        self.conv1 = BaseConv(cin, hidden, 1)
        self.conv2 = BaseConv(cin, hidden, 1)
        self.conv3 = BaseConv(2 * hidden, cout, 1)
        self.m = nn.Sequential(*[Bottleneck(hidden, hidden, shortcut) for _ in range(n)])

    def forward(self, x):
        return self.conv3(torch.cat([self.m(self.conv1(x)), self.conv2(x)], 1))


class SPPBottleneck(nn.Module):
    def __init__(self, cin: int, cout: int, ks=(5, 9, 13)) -> None:
        super().__init__()
        hidden = cin // 2
        self.conv1 = BaseConv(cin, hidden, 1)
        self.m = nn.ModuleList([nn.MaxPool2d(k, 1, k // 2) for k in ks])
        self.conv2 = BaseConv(hidden * (len(ks) + 1), cout, 1)

    def forward(self, x):
        x = self.conv1(x)
        return self.conv2(torch.cat([x] + [m(x) for m in self.m], 1))


class Focus(nn.Module):
    def __init__(self, cin: int, cout: int, k: int = 3) -> None:
        super().__init__()
        self.conv = BaseConv(cin * 4, cout, k)

    def forward(self, x):
        return self.conv(torch.cat([x[..., ::2, ::2], x[..., 1::2, ::2], x[..., ::2, 1::2], x[..., 1::2, 1::2]], 1))


class CSPDarknet(nn.Module):
    def __init__(self, dep: float, wid: float) -> None:
        super().__init__()
        c = int(wid * 64)
        d = max(round(dep * 3), 1)
        self.stem = Focus(3, c, 3)
        self.dark2 = nn.Sequential(BaseConv(c, c * 2, 3, 2), CSPLayer(c * 2, c * 2, d))
        self.dark3 = nn.Sequential(BaseConv(c * 2, c * 4, 3, 2), CSPLayer(c * 4, c * 4, d * 3))
        self.dark4 = nn.Sequential(BaseConv(c * 4, c * 8, 3, 2), CSPLayer(c * 8, c * 8, d * 3))
        self.dark5 = nn.Sequential(BaseConv(c * 8, c * 16, 3, 2), SPPBottleneck(c * 16, c * 16),
                                   CSPLayer(c * 16, c * 16, d, shortcut=False))

    def forward(self, x):
        x = self.dark2(self.stem(x))
        x3 = self.dark3(x)
        x4 = self.dark4(x3)
        return x3, x4, self.dark5(x4)


class PAFPN(nn.Module):
    def __init__(self, dep: float, wid: float) -> None:
        super().__init__()
        self.backbone = CSPDarknet(dep, wid)
        c0, c1, c2 = int(256 * wid), int(512 * wid), int(1024 * wid)
        n = round(3 * dep)
        self.upsample = nn.Upsample(scale_factor=2, mode="nearest")
        self.lateral_conv0 = BaseConv(c2, c1, 1)
        self.C3_p4 = CSPLayer(2 * c1, c1, n, False)
        self.reduce_conv1 = BaseConv(c1, c0, 1)
        self.C3_p3 = CSPLayer(2 * c0, c0, n, False)
        self.bu_conv2 = BaseConv(c0, c0, 3, 2)
        self.C3_n3 = CSPLayer(2 * c0, c1, n, False)
        self.bu_conv1 = BaseConv(c1, c1, 3, 2)
        self.C3_n4 = CSPLayer(2 * c1, c2, n, False)

    def forward(self, x):
        x2, x1, x0 = self.backbone(x)
        fpn0 = self.lateral_conv0(x0)
        f0 = self.C3_p4(torch.cat([self.upsample(fpn0), x1], 1))
        fpn1 = self.reduce_conv1(f0)
        p2 = self.C3_p3(torch.cat([self.upsample(fpn1), x2], 1))
        p1 = self.C3_n3(torch.cat([self.bu_conv2(p2), fpn1], 1))
        p0 = self.C3_n4(torch.cat([self.bu_conv1(p1), fpn0], 1))
        return p2, p1, p0


class Head(nn.Module):
    def __init__(self, wid: float, num_classes: int = 80) -> None:
        super().__init__()
        h = int(256 * wid)
        ins = [int(c * wid) for c in (256, 512, 1024)]
        self.strides = (8, 16, 32)
        self.stems = nn.ModuleList([BaseConv(c, h, 1) for c in ins])
        self.cls_convs = nn.ModuleList([nn.Sequential(BaseConv(h, h, 3), BaseConv(h, h, 3)) for _ in ins])
        self.reg_convs = nn.ModuleList([nn.Sequential(BaseConv(h, h, 3), BaseConv(h, h, 3)) for _ in ins])
        self.cls_preds = nn.ModuleList([nn.Conv2d(h, num_classes, 1) for _ in ins])
        self.reg_preds = nn.ModuleList([nn.Conv2d(h, 4, 1) for _ in ins])
        self.obj_preds = nn.ModuleList([nn.Conv2d(h, 1, 1) for _ in ins])

    def forward(self, feats):
        outs, grids, strides = [], [], []
        for k, x in enumerate(feats):
            x = self.stems[k](x)
            reg = self.reg_convs[k](x)
            o = torch.cat([self.reg_preds[k](reg), self.obj_preds[k](reg).sigmoid(),
                           self.cls_preds[k](self.cls_convs[k](x)).sigmoid()], 1)
            b, c, hh, ww = o.shape
            outs.append(o.flatten(2))
            yv, xv = torch.meshgrid(torch.arange(hh), torch.arange(ww), indexing="ij")
            grids.append(torch.stack((xv, yv), 2).reshape(1, -1, 2))
            strides.append(torch.full((1, hh * ww, 1), self.strides[k]))
        out = torch.cat(outs, 2).permute(0, 2, 1)
        grid = torch.cat(grids, 1).to(out)
        stride = torch.cat(strides, 1).to(out)
        xy = (out[..., :2] + grid) * stride
        wh = torch.exp(out[..., 2:4]) * stride
        return torch.cat([xy, wh, out[..., 4:]], -1)


class YOLOX(nn.Module):
    def __init__(self, variant: str = "yolox_s") -> None:
        super().__init__()
        dep, wid = VARIANTS[variant]
        self.backbone = PAFPN(dep, wid)
        self.head = Head(wid)

    def forward(self, x):
        return self.head(self.backbone(x))

    def fuse(self) -> "YOLOX":
        for m in self.modules():
            if isinstance(m, BaseConv):
                m.fuse()
        return self


def load(variant: str, weights: str | Path, device: str = "cpu", fuse: bool = True) -> YOLOX:
    model = YOLOX(variant)
    ck = torch.load(str(weights), map_location="cpu", weights_only=True)
    state = ck["model"] if isinstance(ck, dict) and "model" in ck else ck
    model.load_state_dict(state, strict=True)
    model.eval()
    if fuse:
        model.fuse()
    return model.to(device)


def letterbox(img: np.ndarray, imgsz: int) -> tuple[np.ndarray, float]:
    """BGR uint8 -> padded (114) uint8 HxWx3 whose sides are multiples of 32, and the scale used."""
    import cv2  # noqa: PLC0415

    h, w = img.shape[:2]
    r = imgsz / max(h, w)
    nh, nw = int(round(h * r)), int(round(w * r))
    ph, pw = (nh + 31) // 32 * 32, (nw + 31) // 32 * 32
    canvas = np.full((ph, pw, 3), 114, np.uint8)
    canvas[:nh, :nw] = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    return canvas, r


def postprocess(out: torch.Tensor, r: float, classes=(PERSON, BALL), conf: float = 0.05, iou: float = 0.6):
    """One image's raw output -> (xyxy in source pixels, score, class) after class-aware NMS."""
    import torchvision  # noqa: PLC0415

    obj = out[:, 4]
    score, cls = (out[:, 5:] * obj[:, None]).max(1)
    keep = (score > conf) & torch.isin(cls, torch.tensor(classes, device=out.device))
    out, score, cls = out[keep], score[keep], cls[keep]
    xyxy = torch.stack([out[:, 0] - out[:, 2] / 2, out[:, 1] - out[:, 3] / 2,
                        out[:, 0] + out[:, 2] / 2, out[:, 1] + out[:, 3] / 2], 1) / r
    k = torchvision.ops.batched_nms(xyxy, score, cls, iou)
    return xyxy[k].cpu().numpy(), score[k].cpu().numpy(), cls[k].cpu().numpy().astype(int)


class Detector:
    """Batch-capable YOLOX wrapper with the same output contract as the pipeline expects."""

    def __init__(self, variant: str, weights: str | Path, imgsz: int = 1280, device: str | None = None,
                 half: bool | None = None) -> None:
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.half = (self.device == "cuda") if half is None else half
        self.model = load(variant, weights, self.device)
        if self.half:
            self.model.half()
        self.imgsz = imgsz
        self.name = f"{variant}@{imgsz}"

    @torch.inference_mode()
    def __call__(self, images: list[np.ndarray], conf: float = 0.05):
        boxes, ratios = [], []
        for im in images:
            b, r = letterbox(im, self.imgsz)
            boxes.append(b)
            ratios.append(r)
        x = torch.from_numpy(np.ascontiguousarray(np.stack(boxes).transpose(0, 3, 1, 2))).to(self.device)
        x = x.half() if self.half else x.float()
        out = self.model(x).float()
        return [postprocess(out[i], ratios[i], conf=conf) for i in range(len(images))]


def export_onnx(variant: str, weights: str | Path, out: str | Path, imgsz: int = 1280, aspect: float = 1080 / 1920) -> Path:
    """Exports the fused network for a letterboxed 16:9 input (dynamic batch)."""
    model = load(variant, weights, "cpu")
    h = (int(round(imgsz * aspect)) + 31) // 32 * 32
    torch.onnx.export(model, torch.zeros(1, 3, h, imgsz), str(out), input_names=["images"], output_names=["out"],
                      opset_version=17, dynamic_axes={"images": {0: "batch"}, "out": {0: "batch"}}, dynamo=False)
    return Path(out)


class OnnxDetector:
    """Same contract as Detector, executed by ONNX Runtime. Measured on a 2-core CPU (YOLOX-s @1280,
    IMG_4809 frames): 285 ms/frame vs 405 ms/frame for torch fp32 - the default CPU backend.
    The ONNX file is exported once next to the weights (derived from the hash-checked weights)."""

    def __init__(self, variant: str, weights: str | Path, imgsz: int = 1280, threads: int = 0) -> None:
        import onnxruntime as ort  # noqa: PLC0415

        path = Path(weights).with_suffix(f".{imgsz}.onnx")
        if not path.exists():
            export_onnx(variant, weights, path, imgsz)
        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if threads:
            so.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
        self.imgsz = imgsz
        self.name = f"{variant}@{imgsz}/onnx"

    def __call__(self, images: list[np.ndarray], conf: float = 0.05):
        boxes, ratios = zip(*(letterbox(im, self.imgsz) for im in images))
        x = np.ascontiguousarray(np.stack(boxes).transpose(0, 3, 1, 2)).astype(np.float32)
        out = self.sess.run(None, {"images": x})[0]
        return [postprocess(torch.from_numpy(out[i]), ratios[i], conf=conf) for i in range(len(images))]
