"""Which number format the music model computes in.

bfloat16 halves the memory, but only graphics cards from the RTX 30 series on (compute capability 8.0, Ampere) compute
it: on older cards (GTX 900 / 1000 / 1600, RTX 20) cuBLAS fails with CUBLAS_STATUS_NOT_SUPPORTED (CUDA_R_16BF) and
cuDNN with "GET was unable to find an engine to execute this computation" (user report, GTX 980). Those cards use
float32; the processor uses bfloat16 only to fit into a small RAM.
"""
from __future__ import annotations

# errors that mean "this card cannot compute this number format": retried once in float32
UNSUPPORTED_DTYPE = ("CUBLAS_STATUS_NOT_SUPPORTED", "CUDA_R_16BF", "unable to find an engine",
                     "not implemented for 'BFloat16'", "bf16")


def gpu_bf16_ok(capability: tuple[int, int] | None = None) -> bool:
    """True when the graphics card computes bfloat16 natively (compute capability 8.0 or newer)."""
    if capability is None:
        try:
            import torch
            if not torch.cuda.is_available():
                return False
            capability = torch.cuda.get_device_capability(0)
        except Exception:
            return False
    return capability[0] >= 8


def ace_dtype(on_gpu: bool, half_wanted: bool, ram_gb: float, choice: str = "auto",
              capability: tuple[int, int] | None = None) -> str:
    """The dtype for ACE-Step: "bfloat16" or "float32".
    choice: auto | bf16 | fp32 (Create → Music model → Precision)."""
    if choice == "fp32":
        return "float32"
    if on_gpu:
        if not gpu_bf16_ok(capability):
            return "float32"                     # an older card: bf16 is not computed there, even when chosen
        return "bfloat16" if (choice == "bf16" or half_wanted) else "float32"
    # the processor: the 3.5B model needs 14 GB in float32 but only 7 GB in bfloat16
    return "bfloat16" if (choice == "bf16" or ram_gb < 16) else "float32"


def is_dtype_error(e: BaseException) -> bool:
    text = str(e)
    return any(k.lower() in text.lower() for k in UNSUPPORTED_DTYPE)
