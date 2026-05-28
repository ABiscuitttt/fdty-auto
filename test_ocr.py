"""单页 OCR 测试"""
import torch
import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
torch.cuda.empty_cache()

from transformers import AutoModel, AutoTokenizer

MODEL_DIR = "/home/YangJunyu/.cache/modelscope/hub/models/deepseek-ai/DeepSeek-OCR-2"

print("Loading...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, trust_remote_code=True, local_files_only=True)
model = AutoModel.from_pretrained(
    MODEL_DIR,
    attn_implementation="eager",
    trust_remote_code=True,
    use_safetensors=True,
    torch_dtype=torch.bfloat16,
    device_map="cuda",
    local_files_only=True,
    low_cpu_mem_usage=True,
)
print(f"VRAM: {torch.cuda.memory_allocated()/1e9:.1f}GB")

print("OCR...")
res = model.infer(
    tokenizer,
    prompt="<image>\nFree OCR.",
    image_file="page_10.png",
    output_path="/tmp/ocr_out",
    base_size=512,
    image_size=384,
    crop_mode=False,
    save_results=False,
)

with open("ocr_result.txt", "w") as f:
    f.write(res)
print(f"Done: {len(res)} chars → ocr_result.txt")
print(res[:500])
