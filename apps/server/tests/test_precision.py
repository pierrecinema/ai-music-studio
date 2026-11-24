from services.precision import ace_dtype, gpu_bf16_ok, is_dtype_error


def test_old_cards_never_get_bf16():
    assert not gpu_bf16_ok((5, 2))                       # GTX 980
    assert not gpu_bf16_ok((7, 5))                       # RTX 20
    assert gpu_bf16_ok((8, 6))                           # RTX 30
    assert ace_dtype(True, True, 16, "auto", (5, 2)) == "float32"
    assert ace_dtype(True, True, 16, "bf16", (6, 1)) == "float32"


def test_new_cards_and_cpu():
    assert ace_dtype(True, True, 32, "auto", (8, 9)) == "bfloat16"
    assert ace_dtype(True, False, 32, "auto", (8, 9)) == "float32"
    assert ace_dtype(True, True, 32, "fp32", (8, 9)) == "float32"
    assert ace_dtype(False, False, 8, "auto") == "bfloat16"
    assert ace_dtype(False, False, 32, "auto") == "float32"


def test_dtype_errors():
    assert is_dtype_error(RuntimeError("CUDA error: CUBLAS_STATUS_NOT_SUPPORTED when calling cublasGemmEx (CUDA_R_16BF)"))
    assert is_dtype_error(RuntimeError("GET was unable to find an engine to execute this computation"))
    assert not is_dtype_error(RuntimeError("CUDA out of memory"))
